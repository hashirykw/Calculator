// Money (14.7): loan instalments with a full amortisation schedule and
// chart, savings growth, percentage calculators, discount and profit/loss,
// and bill splitting. Amounts use the currency chosen in Settings (PKR by
// default) and lakh/crore grouping when that is selected.

import { h, clear, icon, downloadBlob } from '../ui.js';
import { t } from '../i18n/index.js';
import { app } from '../bus.js';
import { store } from '../store.js';
import { amortisation, savings, pct, discount, profitLoss, costFromSelling, tipSplit } from '../core/finance.js';
import { toolPage, numField, outList, message, fmt, money, record, selectField, tabbed, chart, line, ok, pctf, section } from './kit.js';

export function create() {
  const { root, body } = toolPage('finance');
  const tb = tabbed([['loan', t('fin.loan')], ['savings', t('fin.savings')], ['percent', t('fin.percent')], ['shop', t('fin.shop')], ['split', t('fin.split')]], {
    loan, savings: savingsPanel, percent, shop, split,
  });
  body.append(tb.el, h('p', { class: 'help', text: t('fin.disclaimer') }));
  return { root };
}

const saved = () => store.get('finance', {});
const persist = (patch) => store.set('finance', { ...saved(), ...patch });
const cur = () => app.settings.currency || 'PKR';

function loan(p) {
  const s = saved().loan || {};
  const P = numField(t('fin.principal'), { value: s.P ?? '500000', unit: cur(), onInput: up });
  const R = numField(t('fin.rate'), { value: s.R ?? '18', unit: '%', onInput: up, help: t('fin.rateHelp') });
  const N = numField(t('fin.term'), { value: s.N ?? '3', onInput: up });
  const unit = selectField(t('fin.termUnit'), [['y', t('fin.years')], ['m', t('fin.months')]], s.u || 'y', up);
  const warn = message('warn');
  const out = outList();
  const ch = chart(t('fin.balanceChart'));
  const legend = h('div', { class: 'legend' });
  const tableHost = h('div', { class: 'table-scroll' });
  let monthly = false, last = null;
  const toggle = h('button', { class: 'btn sm', type: 'button', on: { click: () => { monthly = !monthly; toggle.textContent = monthly ? t('fin.byYear') : t('fin.byMonth'); table(); } } }, t('fin.byMonth'));
  const csv = h('button', { class: 'btn sm', type: 'button', on: { click: exportCsv } }, icon('download', 'sm'), t('fin.csv'));
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' }, P.el, R.el, N.el, unit.el)), warn.el, out.el, ch.canvas, legend,
    h('div', { class: 'row-between' }, h('h3', { class: 'section-title', text: t('fin.schedule') }), h('div', { class: 'btn-row' }, toggle, csv)), tableHost);

  function up() {
    persist({ loan: { P: P.input.value, R: R.input.value, N: N.input.value, u: unit.get() } });
    warn.set('');
    const pv = P.get(), r = R.get(), n0 = N.get();
    if (!ok(pv, r, n0)) { out.set([]); clear(tableHost); return; }
    const months = Math.round(unit.get() === 'y' ? n0 * 12 : n0);
    if (pv <= 0 || r < 0 || months < 1 || months > 1200) { warn.set(t('fin.loanRange')); out.set([]); clear(tableHost); return; }
    const a = amortisation(pv, r, months);
    last = a;
    out.set([
      [t('fin.monthly'), money(a.payment), { big: true }],
      [t('fin.totalPaid'), money(a.total)],
      [t('fin.totalInterest'), money(a.interest)],
      [t('fin.interestShare'), pctf((a.interest / a.total) * 100)],
      [t('fin.payments'), String(months)],
    ]);
    record('finance', `${t('fin.loan')} ${money(pv)}, ${r}%, ${months} ${t('fin.months')}`, `${t('fin.monthly')} ${money(a.payment)}`);
    let cumI = 0;
    const bal = [[0, pv]], ci = [[0, 0]];
    a.rows.forEach((row) => { cumI += row.interest; bal.push([row.month, row.balance]); ci.push([row.month, cumI]); });
    ch.draw({ x: [0, months], y: [0, Math.max(pv, cumI) * 1.08], fmtX: (v) => (months > 24 ? `${+(v / 12).toFixed(1)}y` : `${v}m`),
      plot(g) { line(g, bal, g.color(0), 2); line(g, ci, g.color(1), 2, [5, 4]); } }, t('fin.loanDesc', { months }));
    clear(legend).append(h('span', { class: 'lg', style: { '--c': 'var(--g1)' } }, t('fin.balance')), h('span', { class: 'lg dashed', style: { '--c': 'var(--g2)' } }, t('fin.cumInterest')));
    table();
  }
  function table() {
    clear(tableHost);
    if (!last) return;
    const rows = monthly ? last.rows.map((r) => [r.month, r.payment, r.principal, r.interest, r.balance]) : byYear(last.rows);
    const tbl = h('table', { class: 'values' },
      h('thead', {}, h('tr', {}, [monthly ? t('fin.month') : t('fin.year'), t('fin.payment'), t('fin.principalPaid'), t('fin.interestPaid'), t('fin.balance')].map((x) => h('th', { text: x })))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', { text: String(r[0]) }), r.slice(1).map((v) => h('td', { text: money(v) }))))));
    tableHost.append(tbl);
  }
  function byYear(rows) {
    const out = [];
    for (let i = 0; i < rows.length; i += 12) {
      const chunk = rows.slice(i, i + 12);
      out.push([Math.floor(i / 12) + 1, chunk.reduce((s, r) => s + r.payment, 0), chunk.reduce((s, r) => s + r.principal, 0), chunk.reduce((s, r) => s + r.interest, 0), chunk[chunk.length - 1].balance]);
    }
    return out;
  }
  function exportCsv() {
    if (!last) return;
    const lines = [['month', 'payment', 'principal', 'interest', 'balance'].join(','), ...last.rows.map((r) => [r.month, r.payment.toFixed(2), r.principal.toFixed(2), r.interest.toFixed(2), r.balance.toFixed(2)].join(','))];
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), 'nexlyr-loan-schedule.csv');
  }
  up();
}

function savingsPanel(p) {
  const s = saved().sav || {};
  const start = numField(t('fin.start'), { value: s.a ?? '50000', unit: cur(), onInput: up });
  const monthly = numField(t('fin.deposit'), { value: s.m ?? '10000', unit: cur(), onInput: up });
  const rate = numField(t('fin.rate'), { value: s.r ?? '12', unit: '%', onInput: up });
  const years = numField(t('fin.years'), { value: s.y ?? '5', onInput: up });
  const comp = selectField(t('fin.compounding'), [['12', t('fin.monthlyC')], ['4', t('fin.quarterly')], ['1', t('fin.yearly')]], s.c || '12', up);
  const warn = message('warn');
  const out = outList();
  const ch = chart(t('fin.growthChart'));
  const legend = h('div', { class: 'legend' });
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' }, start.el, monthly.el, rate.el, years.el, comp.el), h('p', { class: 'help', text: t('fin.savingsHelp') })), warn.el, out.el, ch.canvas, legend);
  function up() {
    persist({ sav: { a: start.input.value, m: monthly.input.value, r: rate.input.value, y: years.input.value, c: comp.get() } });
    warn.set('');
    let a = start.get(), m = monthly.get();
    const r = rate.get(), y = years.get();
    if (Number.isNaN(a)) a = 0;
    if (Number.isNaN(m)) m = 0;
    if (!ok(a, m, r, y)) { out.set([]); return; }
    if (y <= 0 || y > 100 || r < 0) { warn.set(t('fin.savingsRange')); out.set([]); return; }
    const res = savings(a, m, r, y, Number(comp.get()));
    out.set([
      [t('fin.finalBalance'), money(res.balance), { big: true }],
      [t('fin.totalDeposits'), money(res.deposits)],
      [t('fin.interestEarned'), money(res.interest)],
    ]);
    record('finance', `${t('fin.savings')} ${money(a)} + ${money(m)}/${t('fin.month')}, ${r}%, ${y}y`, money(res.balance));
    const pts = [[0, a], ...res.rows.map((row) => [row.month / 12, row.balance])];
    const dep = [[0, a], ...res.rows.map((row) => [row.month / 12, row.deposits])];
    ch.draw({ x: [0, y], y: [0, res.balance * 1.08], fmtX: (v) => `${+v.toFixed(1)}y`, plot(g) { line(g, pts, g.color(0), 2); line(g, dep, g.color(1), 2, [5, 4]); } }, t('fin.savingsDesc', { v: money(res.balance) }));
    clear(legend).append(h('span', { class: 'lg', style: { '--c': 'var(--g1)' } }, t('fin.balance')), h('span', { class: 'lg dashed', style: { '--c': 'var(--g2)' } }, t('fin.totalDeposits')));
  }
  up();
}

// A small card that recomputes as you type.
function mini(title, fields, compute) {
  const out = outList();
  const run = () => {
    const v = fields.map((f) => f.get());
    out.set(v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? compute(...v) : []);
  };
  fields.forEach((f) => f.input.addEventListener('input', run));
  const el = section(title, h('div', { class: 'tool-grid' }, fields.map((f) => f.el)), out.el);
  run();
  return el;
}

function percent(p) {
  const nf = (label, value, unit) => numField(label, { value, unit });
  p.append(h('div', { class: 'tool-grid two' },
    mini(t('fin.pctOf'), [nf(t('fin.percentage'), '15', '%'), nf(t('fin.ofValue'), '240')], (a, b) => [[`${fmt(a)}% × ${fmt(b)}`, fmt(pct.of(a, b)), { big: true }]]),
    mini(t('fin.whatPct'), [nf(t('fin.part'), '45'), nf(t('fin.whole'), '180')], (a, b) => [[`${fmt(a)} ÷ ${fmt(b)} × 100`, pctf(pct.whatPercent(a, b)), { big: true }]]),
    mini(t('fin.change'), [nf(t('fin.original'), '250'), nf(t('fin.newValue'), '300')], (a, b) => {
      const c = pct.change(a, b);
      return [[c >= 0 ? t('fin.increase') : t('fin.decrease'), pctf(Math.abs(c)), { big: true }], [t('fin.difference'), fmt(b - a)]];
    }),
    mini(t('fin.addRemove'), [nf(t('fin.value'), '1200'), nf(t('fin.percentage'), '17', '%')], (a, b) => [[`+${fmt(b)}%`, fmt(pct.add(a, b)), { big: true }], [`−${fmt(b)}%`, fmt(pct.remove(a, b))]]),
    mini(t('fin.reverse'), [nf(t('fin.after'), '1170'), nf(t('fin.changePct'), '17', '%')], (a, b) => [[t('fin.originalWas'), fmt(pct.reverse(a, b)), { big: true }]])),
  h('p', { class: 'help', text: t('fin.reverseHelp') }));
}

function shop(p) {
  const nf = (label, value, unit) => numField(label, { value, unit });
  p.append(h('div', { class: 'tool-grid two' },
    mini(t('fin.discount'), [nf(t('fin.price'), '4500', cur()), nf(t('fin.off'), '30', '%')], (a, b) => { const d = discount(a, b); return [[t('fin.youPay'), money(d.final), { big: true }], [t('fin.youSave'), money(d.saving)]]; }),
    mini(t('fin.profitLoss'), [nf(t('fin.cost'), '800', cur()), nf(t('fin.selling'), '1000', cur())], (a, b) => {
      const r = profitLoss(a, b);
      return [[t(`fin.${r.kind}`), money(Math.abs(r.amount)), { big: true }], [t('fin.pctOfCost'), pctf(Math.abs(r.pct))]];
    }),
    mini(t('fin.sellFor'), [nf(t('fin.cost'), '800', cur()), nf(t('fin.profitPct'), '25', '%')], (a, b) => [[t('fin.sellingPrice'), money(a * (1 + b / 100)), { big: true }]]),
    mini(t('fin.costFrom'), [nf(t('fin.selling'), '1000', cur()), nf(t('fin.profitPct'), '25', '%')], (a, b) => [[t('fin.costPrice'), money(costFromSelling(a, b)), { big: true }]])));
}

function split(p) {
  const bill = numField(t('fin.bill'), { value: '5400', unit: cur() });
  const tip = numField(t('fin.tip'), { value: '10', unit: '%' });
  const people = numField(t('fin.people'), { value: '4', inputmode: 'numeric' });
  const roundTo = selectField(t('fin.roundUp'), [['0', t('fin.noRound')], ['1', '1'], ['5', '5'], ['10', '10'], ['50', '50'], ['100', '100']], '0', run);
  const out = outList();
  const warn = message('warn');
  [bill, tip, people].forEach((f) => f.input.addEventListener('input', run));
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' }, bill.el, tip.el, people.el, roundTo.el)), warn.el, out.el);
  function run() {
    warn.set('');
    const b = bill.get(), tp = Number.isNaN(tip.get()) ? 0 : tip.get(), n = people.get();
    if (!ok(b, tp, n)) { out.set([]); return; }
    if (!Number.isInteger(n) || n < 1) { warn.set(t('fin.peopleWhole')); out.set([]); return; }
    const r = tipSplit(b, tp, n, Number(roundTo.get()));
    out.set([[t('fin.eachPays'), money(r.each), { big: true }], [t('fin.tipAmount'), money(r.tip)], [t('fin.total'), money(r.total)],
      Number(roundTo.get()) > 0 ? [t('fin.collected'), `${money(r.collected)} (+${money(r.collected - r.total)})`] : null]);
    record('finance', `${t('fin.split')} ${money(b)} ÷ ${n}`, money(r.each));
  }
  run();
}
