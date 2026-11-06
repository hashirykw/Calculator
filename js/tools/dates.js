// Dates (16.6): exact age, days between two dates (with weekdays and working
// days), and adding or subtracting days, weeks, months or years. All in
// whole calendar days (UTC), so clock changes never shift an answer.

import { h, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { toolPage, numField, outList, message, fmt, record, selectField, tabbed, ok } from './kit.js';

const DAY = 86400000;
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const today = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const long = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const weekday = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });

// Whole years, months and days from a to b (a <= b).
export function ymd(a, b) {
  const A = new Date(a), B = new Date(b);
  let y = B.getUTCFullYear() - A.getUTCFullYear(), m = B.getUTCMonth() - A.getUTCMonth(), d = B.getUTCDate() - A.getUTCDate();
  if (d < 0) { m -= 1; const pm = (B.getUTCMonth() + 11) % 12, py = B.getUTCMonth() === 0 ? B.getUTCFullYear() - 1 : B.getUTCFullYear(); d += dim(py, pm); }
  if (m < 0) { y -= 1; m += 12; }
  return { y, m, d };
}
export function addMonths(ms, n) {
  const D = new Date(ms);
  const total = D.getUTCFullYear() * 12 + D.getUTCMonth() + n;
  const y = Math.floor(total / 12), mo = total - y * 12;
  const day = Math.min(D.getUTCDate(), dim(y, mo));
  return { ms: Date.UTC(y, mo, day), clamped: day !== D.getUTCDate() };
}
function workingDays(a, b) {
  let n = 0;
  for (let x = a; x <= b; x += DAY) { const w = new Date(x).getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
const dateField = (label, value, onInput) => {
  const input = h('input', { class: 'input', type: 'date', value, on: { input: onInput, change: onInput } });
  const id = `d${Math.random().toString(36).slice(2, 7)}`;
  input.id = id;
  return { el: h('div', { class: 'field' }, h('label', { for: id, text: label }), input), input, get: () => parse(input.value) };
};

export function create() {
  const { root, body } = toolPage('dates');
  const tb = tabbed([['age', t('dt.age')], ['between', t('dt.between')], ['add', t('dt.add')]], { age, between, add });
  body.append(tb.el);
  return { root };
}

function age(p) {
  const s = store.get('dates', {});
  const dob = dateField(t('dt.dob'), s.dob || '2008-05-14', up);
  const on = dateField(t('dt.onDate'), iso(today()), up);
  const warn = message('warn');
  const out = outList();
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' }, dob.el, on.el)), warn.el, out.el);
  function up() {
    store.set('dates', { ...store.get('dates', {}), dob: dob.input.value });
    warn.set('');
    const a = dob.get(), b = on.get();
    if (!ok(a, b)) { out.set([]); return; }
    if (a > b) { warn.set(t('dt.future')); out.set([]); return; }
    const r = ymd(a, b);
    const days = Math.round((b - a) / DAY);
    // next birthday
    const A = new Date(a), B = new Date(b);
    let next = Date.UTC(B.getUTCFullYear(), A.getUTCMonth(), Math.min(A.getUTCDate(), dim(B.getUTCFullYear(), A.getUTCMonth())));
    if (next < b) next = Date.UTC(B.getUTCFullYear() + 1, A.getUTCMonth(), Math.min(A.getUTCDate(), dim(B.getUTCFullYear() + 1, A.getUTCMonth())));
    const toNext = Math.round((next - b) / DAY);
    out.set([
      [t('dt.ageIs'), t('dt.ymd', { y: r.y, m: r.m, d: r.d }), { big: true }],
      [t('dt.totalMonths'), fmt(r.y * 12 + r.m)],
      [t('dt.totalWeeks'), t('dt.weeksDays', { w: fmt(Math.floor(days / 7)), d: days % 7 })],
      [t('dt.totalDays'), fmt(days)],
      [t('dt.bornOn'), weekday(a)],
      [t('dt.nextBirthday'), toNext === 0 ? t('dt.today') : t('dt.inDays', { n: fmt(toNext), day: weekday(next) })],
    ]);
    record('dates', `${t('dt.age')} ${dob.input.value}`, t('dt.ymd', { y: r.y, m: r.m, d: r.d }));
  }
  up();
}

function between(p) {
  const a = dateField(t('dt.start'), iso(today()), up);
  const b = dateField(t('dt.end'), iso(today() + 100 * DAY), up);
  let incl = false;
  const inc = seg([['no', t('dt.excludeEnd')], ['yes', t('dt.includeEnd')]], 'no', (v) => { incl = v === 'yes'; up(); }, t('dt.endDate'));
  const out = outList();
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' }, a.el, b.el), inc), out.el);
  function up() {
    let x = a.get(), y = b.get();
    if (!ok(x, y)) { out.set([]); return; }
    const sign = y < x ? -1 : 1;
    if (y < x) [x, y] = [y, x];
    const days = Math.round((y - x) / DAY) + (incl ? 1 : 0);
    const r = ymd(x, incl ? y + DAY : y);
    const wd = workingDays(x, incl ? y : y - DAY);
    out.set([
      [t('dt.days'), `${sign < 0 ? '−' : ''}${fmt(days)}`, { big: true }],
      [t('dt.weeks'), t('dt.weeksDays', { w: fmt(Math.floor(days / 7)), d: days % 7 })],
      [t('dt.calendar'), t('dt.ymd', { y: r.y, m: r.m, d: r.d })],
      [t('dt.workingDays'), fmt(wd)],
      [t('dt.hours'), fmt(days * 24)],
      [t('dt.startDay'), long(sign < 0 ? y : x)], [t('dt.endDay'), long(sign < 0 ? x : y)],
    ]);
    record('dates', `${a.input.value} → ${b.input.value}`, `${fmt(days)} ${t('dt.days').toLowerCase()}`);
  }
  up();
}

function add(p) {
  const d = dateField(t('dt.date'), iso(today()), up);
  const n = numField(t('dt.amount'), { value: '90', inputmode: 'numeric', onInput: up });
  const unit = selectField(t('dt.unit'), [['d', t('dt.daysU')], ['w', t('dt.weeksU')], ['m', t('dt.monthsU')], ['y', t('dt.yearsU')]], 'd', up);
  let dir = 1;
  const dirSeg = seg([['1', t('dt.plus')], ['-1', t('dt.minus')]], '1', (v) => { dir = Number(v); up(); }, t('dt.direction'));
  const warn = message('note');
  const out = outList();
  p.append(h('div', { class: 'card panel' }, d.el, dirSeg, h('div', { class: 'tool-grid' }, n.el, unit.el)), out.el, warn.el);
  function up() {
    warn.set('');
    const base = d.get(), k = n.get();
    if (!ok(base, k) || !Number.isInteger(k) || Math.abs(k) > 100000) { out.set([]); return; }
    const u = unit.get();
    let res, clamped = false;
    if (u === 'd' || u === 'w') res = base + dir * k * (u === 'w' ? 7 : 1) * DAY;
    else { const r = addMonths(base, dir * k * (u === 'y' ? 12 : 1)); res = r.ms; clamped = r.clamped; }
    if (!Number.isFinite(res) || res < Date.UTC(-9999, 0, 1) || res > Date.UTC(9999, 11, 31)) { out.set([]); return; }
    out.set([[t('dt.result'), long(res), { big: true, copy: iso(res) }], [t('dt.iso'), iso(res)]]);
    if (clamped) warn.set(t('dt.clamped'));
    record('dates', `${d.input.value} ${dir > 0 ? '+' : '−'} ${k}${u}`, iso(res));
  }
  up();
}
