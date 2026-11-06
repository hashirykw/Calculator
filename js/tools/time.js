// Time (16.7): add and subtract durations, the time between two clock times
// (over midnight too), a clock time plus a duration, and decimal hours ⇄
// hours, minutes and seconds.

import { h, icon, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { toolPage, numField, outList, message, fmt, record, tabbed, ok, section } from './kit.js';

const pad = (n) => String(n).padStart(2, '0');
export function hms(totalSec) {
  const neg = totalSec < 0;
  let s = Math.round(Math.abs(totalSec));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return { neg, h, m, s, text: `${neg ? '−' : ''}${h}:${pad(m)}:${pad(s)}` };
}
const clock = (v) => { const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v || ''); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : NaN; };
const timeField = (label, value, onInput) => {
  const id = `t${Math.random().toString(36).slice(2, 7)}`;
  const input = h('input', { class: 'input', type: 'time', step: '1', id, value, on: { input: onInput, change: onInput } });
  return { el: h('div', { class: 'field' }, h('label', { for: id, text: label }), input), input, get: () => clock(input.value) };
};

export function create() {
  const { root, body } = toolPage('time');
  const tb = tabbed([['sum', t('tm.sum')], ['between', t('tm.between')], ['convert', t('tm.convert')]], { sum, between, convert });
  body.append(tb.el);
  return { root };
}

function sum(p) {
  const s = store.get('time', {});
  const rows = h('div', { class: 'rows' });
  const out = outList();
  const warn = message('warn');
  function addRow(r = {}) {
    let sign = r.sign === '-' ? '-' : '+';
    const sg = seg([['+', '+'], ['-', '−']], sign, (v) => { sign = v; row.dataset.sign = v; up(); }, t('tm.addOrSub'));
    const mk = (v, ph, aria) => h('input', { class: 'input mono', inputmode: 'numeric', value: v ?? '', placeholder: ph, 'aria-label': aria, on: { input: up } });
    const row = h('div', { class: 'time-row', data: { sign } }, sg, mk(r.h, 'h', t('tm.hours')), mk(r.m, 'min', t('tm.minutes')), mk(r.s, 's', t('tm.seconds')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.remove'), on: { click: () => { row.remove(); up(); } } }, icon('close', 'sm')));
    rows.append(row);
  }
  (Array.isArray(s.rows) && s.rows.length ? s.rows : [{ h: '1', m: '45', s: '' }, { h: '2', m: '30', s: '' }, { sign: '-', h: '', m: '20', s: '' }]).forEach(addRow);
  p.append(h('div', { class: 'card panel' }, rows, h('button', { class: 'btn sm', type: 'button', on: { click: () => { addRow(); up(); } } }, icon('plus', 'sm'), t('tm.addRow'))), warn.el, out.el);
  function up() {
    warn.set('');
    let total = 0;
    const saved = [];
    for (const row of rows.children) {
      const [a, b, c] = row.querySelectorAll('input');
      const v = [a.value, b.value, c.value].map((x) => (x.trim() === '' ? 0 : Number(x)));
      saved.push({ sign: row.dataset.sign, h: a.value, m: b.value, s: c.value });
      if (v.some((x) => !Number.isFinite(x) || x < 0)) { warn.set(t('tm.bad')); out.set([]); return; }
      total += (row.dataset.sign === '-' ? -1 : 1) * (v[0] * 3600 + v[1] * 60 + v[2]);
    }
    store.set('time', { ...store.get('time', {}), rows: saved });
    const r = hms(total);
    out.set([
      [t('tm.total'), `${r.neg ? '−' : ''}${t('tm.hmsWords', { h: r.h, m: r.m, s: r.s })}`, { big: true, copy: r.text }],
      ['h:mm:ss', r.text],
      [t('tm.inHours'), fmt(total / 3600, 8)], [t('tm.inMinutes'), fmt(total / 60, 8)], [t('tm.inSeconds'), fmt(total)],
    ]);
    record('time', saved.map((x) => `${x.sign}${x.h || 0}:${x.m || 0}:${x.s || 0}`).join(' '), r.text);
  }
  up();
}

function between(p) {
  const a = timeField(t('tm.start'), '22:30:00', up);
  const b = timeField(t('tm.end'), '06:15:00', up);
  const out = outList();
  const c = timeField(t('tm.clock'), '09:40:00', up2);
  const dh = numField(t('tm.hours'), { value: '2', inputmode: 'numeric', onInput: up2 });
  const dm = numField(t('tm.minutes'), { value: '35', inputmode: 'numeric', onInput: up2 });
  const out2 = outList();
  p.append(section(t('tm.between'), h('div', { class: 'tool-grid' }, a.el, b.el), out.el),
    section(t('tm.plus'), h('div', { class: 'tool-grid' }, c.el, dh.el, dm.el), out2.el));
  function up() {
    const x = a.get(), y = b.get();
    if (!ok(x, y)) { out.set([]); return; }
    let d = y - x;
    const over = d < 0;
    if (over) d += 86400;
    const r = hms(d);
    out.set([[t('tm.duration'), t('tm.hmsWords', { h: r.h, m: r.m, s: r.s }), { big: true, copy: r.text }], [t('tm.inHours'), fmt(d / 3600, 8)], over ? [t('tm.note'), t('tm.overMidnight')] : null]);
    record('time', `${a.input.value} → ${b.input.value}`, r.text);
  }
  function up2() {
    const x = c.get(), hh = Number.isNaN(dh.get()) ? 0 : dh.get(), mm = Number.isNaN(dm.get()) ? 0 : dm.get();
    if (!ok(x, hh, mm)) { out2.set([]); return; }
    const total = x + hh * 3600 + mm * 60;
    const days = Math.floor(total / 86400);
    const r = hms(total - days * 86400);
    out2.set([[t('tm.endsAt'), `${pad(r.h)}:${pad(r.m)}${r.s ? `:${pad(r.s)}` : ''}`, { big: true }], days ? [t('tm.note'), t('tm.nextDay', { n: days })] : null]);
  }
  up(); up2();
}

function convert(p) {
  const dec = numField(t('tm.decimalHours'), { value: '2.75', onInput: up });
  const out = outList();
  const mins = numField(t('tm.minutesIn'), { value: '135', onInput: up2 });
  const out2 = outList();
  p.append(section(t('tm.decToHms'), dec.el, out.el), section(t('tm.minToH'), mins.el, out2.el));
  function up() {
    const v = dec.get();
    if (!ok(v)) { out.set([]); return; }
    const r = hms(v * 3600);
    out.set([[t('tm.equals'), `${r.neg ? '−' : ''}${t('tm.hmsWords', { h: r.h, m: r.m, s: r.s })}`, { big: true, copy: r.text }], ['h:mm:ss', r.text], [t('tm.inMinutes'), fmt(v * 60, 8)]]);
    record('time', `${fmt(v)} h`, r.text);
  }
  function up2() {
    const v = mins.get();
    if (!ok(v)) { out2.set([]); return; }
    const r = hms(v * 60);
    out2.set([[t('tm.equals'), `${r.neg ? '−' : ''}${t('tm.hmsWords', { h: r.h, m: r.m, s: r.s })}`, { big: true, copy: r.text }], [t('tm.inHours'), fmt(v / 60, 8)]]);
  }
  up(); up2();
}
