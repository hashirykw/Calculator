// Chemistry (16.9): molar mass from a formula (brackets and hydrates like
// CuSO4·5H2O) with each element's share, mass ⇄ moles ⇄ particles, and
// concentration. Relative atomic masses: IUPAC/CIAAW abridged standard
// atomic weights; a 1 d.p. option matches how exam data booklets print them.

import { h, clear, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { MathError } from '../core/rational.js';
import { molarMass, AVOGADRO } from '../core/science.js';
import { errorText } from '../calc.js';
import { toolPage, numField, outList, message, fmt, record, tabbed, ok, selectField, numTex, plain } from './kit.js';
import { texSpan } from '../mathrender.js';

const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const clean = (s) => String(s).replace(/[₀-₉]/g, (c) => SUB[c]);
const formulaTex = (s) => clean(s).replace(/(\d+)/g, (m, d, i, all) => (i > 0 && /[A-Za-z)\]]/.test(all[i - 1]) ? `_{${d}}` : d)).replace(/[·.*]/g, '\\cdot ');

let state = { formula: 'CuSO4·5H2O', oneDp: false };

export function create() {
  const { root, body } = toolPage('chemistry');
  state = { ...state, ...store.get('chem', {}) };
  const tb = tabbed([['molar', t('ch.molar')], ['moles', t('ch.moles')], ['conc', t('ch.conc')]], { molar, moles, conc });
  body.append(tb.el, h('p', { class: 'help', text: t('ch.source') }));
  return { root };
}
const save = () => store.set('chem', state);

function getM() {
  try { return molarMass(clean(state.formula), state.oneDp).total; } catch { return NaN; }
}

function molar(p) {
  const input = h('input', { class: 'input mono', autocomplete: 'off', spellcheck: 'false', value: state.formula, 'aria-label': t('ch.formula') });
  const dp = seg([['full', t('ch.fullAr')], ['1dp', t('ch.oneDp')]], state.oneDp ? '1dp' : 'full', (v) => { state.oneDp = v === '1dp'; save(); up(); }, t('ch.arValues'));
  const warn = message('warn');
  const shown = h('div', { class: 'fm-big' });
  const tableHost = h('div', { class: 'table-scroll' });
  const out = outList();
  input.addEventListener('input', () => { state.formula = input.value; save(); up(); });
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'field' }, h('label', { text: t('ch.formula') }), input, h('div', { class: 'help', text: t('ch.formulaHelp') })), dp), warn.el, shown, out.el, tableHost);
  function up() {
    warn.set('');
    clear(tableHost); clear(shown);
    if (!input.value.trim()) { out.set([]); return; }
    let r;
    try { r = molarMass(clean(input.value), state.oneDp); } catch (e) { out.set([]); warn.set(e instanceof MathError ? errorText({ code: e.code, info: e.info || {} }) : t('err.internal')); return; }
    shown.append(texSpan(`\\mathrm{${formulaTex(input.value)}}`, { display: true }));
    const M = r.total;
    out.set([[t('ch.molarMass'), `${fmt(M, 8)} g/mol`, { big: true, copy: fmt(M, 8) }], [t('ch.mr'), fmt(M, 8)]]);
    tableHost.append(h('table', { class: 'values' },
      h('thead', {}, h('tr', {}, [t('ch.element'), t('ch.count'), 'Ar', t('ch.subtotal'), t('ch.byMass')].map((x) => h('th', { text: x })))),
      h('tbody', {}, r.rows.map((row) => h('tr', {}, h('td', { text: row.el }), h('td', { text: String(row.n) }), h('td', { text: fmt(row.ar, 6) }), h('td', { text: fmt(row.subtotal, 8) }), h('td', { text: `${fmt((row.subtotal / M) * 100, 4)}%` })))),
      h('tfoot', {}, h('tr', {}, h('th', { text: t('ch.total') }), h('td'), h('td'), h('th', { text: fmt(M, 8) }), h('td', { text: '100%' })))));
    record('chemistry', `M(${input.value})`, `${fmt(M, 8)} g/mol`);
  }
  up();
}

function moles(p) {
  const fInput = h('input', { class: 'input mono', autocomplete: 'off', spellcheck: 'false', value: state.formula, 'aria-label': t('ch.formula') });
  const Mf = numField(t('ch.molarMass'), { unit: 'g/mol', help: t('ch.mHelp'), onInput: () => up('M') });
  const mass = numField(t('ch.mass'), { unit: 'g', value: '25', onInput: () => up('mass') });
  const n = numField(t('ch.amount'), { unit: 'mol', onInput: () => up('n') });
  const N = numField(t('ch.particles'), { onInput: () => up('N') });
  const warn = message('warn');
  const out = outList();
  let lastSrc = 'mass';
  fInput.addEventListener('input', () => { state.formula = fInput.value; save(); Mf.set(''); up(lastSrc); });
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'field' }, h('label', { text: t('ch.formula') }), fInput), Mf.el, h('div', { class: 'tool-grid' }, mass.el, n.el, N.el), h('p', { class: 'help', text: t('ch.molesHelp') })), warn.el, out.el);
  function up(src) {
    lastSrc = src === 'M' ? lastSrc : src;
    warn.set('');
    let M = Mf.get();
    if (!ok(M)) M = getM();
    if (!ok(M) || M <= 0) { warn.set(t('ch.needM')); out.set([]); return; }
    let mol;
    if (lastSrc === 'mass') { const v = mass.get(); if (!ok(v)) { out.set([]); return; } mol = v / M; }
    else if (lastSrc === 'n') { const v = n.get(); if (!ok(v)) { out.set([]); return; } mol = v; }
    else { const v = N.get(); if (!ok(v)) { out.set([]); return; } mol = v / AVOGADRO; }
    if (lastSrc !== 'mass') mass.set(plain(mol * M, 8));
    if (lastSrc !== 'n') n.set(plain(mol, 8));
    if (lastSrc !== 'N') N.set((mol * AVOGADRO).toPrecision(6).replace('e+', 'e'));
    const parts = fmt(mol * AVOGADRO, 6);
    out.set([
      [t('ch.molarMass'), `${fmt(M, 8)} g/mol`],
      [t('ch.mass'), `${fmt(mol * M, 8)} g`],
      [t('ch.amount'), `${fmt(mol, 8)} mol`, { big: true }],
      [t('ch.particles'), parts, { node: texSpan(numTex(parts)) }],
    ]);
    record('chemistry', `${fInput.value}: ${t('ch.moles')}`, `${fmt(mol, 8)} mol`);
  }
  up('mass');
}

function conc(p) {
  const n = numField(t('ch.amount'), { unit: 'mol', value: '0.05', onInput: up });
  const V = numField(t('ch.volume'), { value: '250', onInput: up });
  const unit = selectField(t('ch.volumeUnit'), [['cm3', 'cm³'], ['dm3', 'dm³']], 'cm3', up);
  const c = numField(t('ch.concentration'), { unit: 'mol/dm³', onInput: up });
  const warn = message('warn');
  const out = outList();
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'fm-big' }, texSpan('c = \\frac{n}{V}', { display: true })), h('div', { class: 'tool-grid' }, n.el, V.el, unit.el, c.el), h('p', { class: 'help', text: t('ch.concHelp') })), warn.el, out.el);
  function up() {
    warn.set('');
    const vals = { n: n.get(), V: V.get(), c: c.get() };
    if (Object.values(vals).some((x) => x === null)) { warn.set(t('stats.badValue', { v: '' })); out.set([]); return; }
    const k = (unit.get() === 'cm3' ? 1000 : 1);
    const missing = Object.keys(vals).filter((x) => Number.isNaN(vals[x]));
    if (missing.length !== 1) { out.set([]); if (!missing.length) warn.set(t('ph.leaveOne')); return; }
    const vd = vals.V / k;
    let res;
    if (missing[0] === 'c') res = { c: vals.n / vd, n: vals.n, Vd: vd };
    else if (missing[0] === 'n') res = { n: vals.c * vd, c: vals.c, Vd: vd };
    else res = { Vd: vals.n / vals.c, n: vals.n, c: vals.c };
    if (!Object.values(res).every(Number.isFinite)) { warn.set(t('err.divzero')); out.set([]); return; }
    const M = getM();
    out.set([
      [t('ch.concentration'), `${fmt(res.c, 8)} mol/dm³`, { big: missing[0] === 'c' }],
      [t('ch.amount'), `${fmt(res.n, 8)} mol`, { big: missing[0] === 'n' }],
      [t('ch.volume'), `${fmt(res.Vd, 8)} dm³ = ${fmt(res.Vd * 1000, 8)} cm³`, { big: missing[0] === 'V' }],
      ok(M) ? [t('ch.massConc', { f: state.formula }), `${fmt(res.c * M, 8)} g/dm³`] : null,
    ]);
    record('chemistry', t('ch.conc'), `${fmt(res.c, 8)} mol/dm³`);
  }
  up();
}
