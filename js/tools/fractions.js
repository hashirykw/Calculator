// Fractions (16.2): add, subtract, multiply and divide fractions and mixed
// numbers with every step written out, simplify a fraction, and turn
// decimals (including recurring ones like 0.1(6)) into fractions.

import { h, clear, icon, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { app } from '../bus.js';
import { store } from '../store.js';
import { renderTex } from '../mathrender.js';
import { Rat, gcdBig } from '../core/rational.js';
import { toBase } from '../core/base.js';
import { toolPage, outList, message, record, tabbed } from './kit.js';

const big = (s) => { const v = String(s).trim().replace(/[−–]/g, '-'); return /^-?\d+$/.test(v) ? BigInt(v) : null; };
const absB = (x) => (x < 0n ? -x : x);
const lcmB = (a, b) => (a === 0n || b === 0n ? 0n : absB(a / gcdBig(a, b) * b));
const frTex = (n, d) => (d === 1n ? n.toString() : `${n < 0n ? '-' : ''}\\frac{${absB(n)}}{${d}}`);
function mixedTex(r) {
  if (r.isInt) return r.n.toString();
  const neg = r.n < 0n, n = absB(r.n), w = n / r.d, rem = n % r.d;
  if (w === 0n) return frTex(r.n, r.d);
  return `${neg ? '-' : ''}${w}\\tfrac{${rem}}{${r.d}}`;
}
function mixedText(r) {
  if (r.isInt) return r.n.toString();
  const neg = r.n < 0n, n = absB(r.n), w = n / r.d, rem = n % r.d;
  return w === 0n ? `${r.n}/${r.d}` : `${neg ? '−' : ''}${w} ${rem}/${r.d}`;
}

export function create() {
  const { root, body } = toolPage('fractions');
  const tb = tabbed([['calc', t('fr.calc')], ['simplify', t('fr.simplify')], ['decimal', t('fr.decimal')]], { calc, simplify, decimal: decimalPanel });
  body.append(tb.el);
  return { root };
}

// A mixed-number entry: whole part and a stacked numerator over denominator.
function fracInput(label, w, n, d, onInput) {
  const mk = (v, aria) => h('input', { class: 'input mono', inputmode: 'numeric', autocomplete: 'off', value: v, 'aria-label': `${label}: ${aria}`, on: { input: onInput } });
  const whole = mk(w, t('fr.whole')), num = mk(n, t('fr.num')), den = mk(d, t('fr.den'));
  const el = h('div', { class: 'frac-input', role: 'group', 'aria-label': label }, h('div', { class: 'label', text: label }),
    h('div', { class: 'fi-row' }, whole, h('div', { class: 'stack' }, num, h('span', { class: 'bar', 'aria-hidden': 'true' }), den)));
  return {
    el,
    // -> {r: Rat, w, n, d} | {error}
    read() {
      const W = whole.value.trim() ? big(whole.value) : 0n, N = num.value.trim() ? big(num.value) : 0n, D = den.value.trim() ? big(den.value) : 1n;
      [whole, num, den].forEach((x) => x.classList.remove('invalid'));
      if (W === null) { whole.classList.add('invalid'); return { error: t('fr.wholeNumbers') }; }
      if (N === null) { num.classList.add('invalid'); return { error: t('fr.wholeNumbers') }; }
      if (D === null || D === 0n) { den.classList.add('invalid'); return { error: D === 0n ? t('err.divzero') : t('fr.wholeNumbers') }; }
      if (W !== 0n && (N < 0n || D < 0n)) { num.classList.add('invalid'); return { error: t('fr.mixedSign') }; }
      const sign = W < 0n ? -1n : 1n;
      const improperN = W !== 0n ? sign * (absB(W) * absB(D) + absB(N)) * (D < 0n ? -1n : 1n) : N;
      return { r: new Rat(improperN, D), W, N, D };
    },
    raw: () => ({ w: whole.value, n: num.value, d: den.value }),
  };
}

function calc(p) {
  const s = store.get('fractions', {});
  const A = fracInput(t('fr.first'), s.a ? s.a.w : '1', s.a ? s.a.n : '2', s.a ? s.a.d : '3', up);
  const B = fracInput(t('fr.second'), s.b ? s.b.w : '', s.b ? s.b.n : '3', s.b ? s.b.d : '4', up);
  let op = s.op || '+';
  const opSeg = seg([['+', '+'], ['-', '−'], ['*', '×'], ['/', '÷']], op, (v) => { op = v; up(); }, t('fr.operation'));
  const warn = message('warn');
  const result = h('div', { class: 'fm-big', 'aria-live': 'polite' });
  const out = outList();
  const stepsEl = h('div', { class: 'steps' });
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'frac-pair' }, A.el, opSeg, B.el)), warn.el, result, out.el,
    h('h3', { class: 'section-title', text: t('solve.steps'), hidden: !!app.settings.examMode }), stepsEl);

  function up() {
    store.set('fractions', { a: A.raw(), b: B.raw(), op });
    warn.set('');
    const a = A.read(), b = B.read();
    if (a.error || b.error) { warn.set(a.error || b.error); clear(result); out.set([]); clear(stepsEl); return; }
    if (op === '/' && b.r.isZero) { warn.set(t('err.divzero')); clear(result); out.set([]); clear(stepsEl); return; }
    const steps = [];
    const show = (x) => mixedTex(x);
    const aT = a.W !== 0n ? show(a.r) : frTex(a.N, a.D), bT = b.W !== 0n ? show(b.r) : frTex(b.N, b.D);
    const symb = { '+': '+', '-': '-', '*': '\\times', '/': '\\div' }[op];
    // 1. improper fractions
    const ia = new Rat(a.r.n, a.r.d), ib = new Rat(b.r.n, b.r.d);
    const an = a.W !== 0n ? (a.W < 0n ? -1n : 1n) * (absB(a.W) * absB(a.D) + absB(a.N)) * (a.D < 0n ? -1n : 1n) : a.N, ad = a.D;
    const bn = b.W !== 0n ? (b.W < 0n ? -1n : 1n) * (absB(b.W) * absB(b.D) + absB(b.N)) * (b.D < 0n ? -1n : 1n) : b.N, bd = b.D;
    if (a.W !== 0n || b.W !== 0n) steps.push([t('fr.step.improper'), `${aT} ${symb} ${bT} = ${frTex(an, ad)} ${symb} ${frTex(bn, bd)}`]);
    let rn, rd;
    if (op === '+' || op === '-') {
      const L = lcmB(ad, bd);
      const ka = L / ad, kb = L / bd;
      const na = an * ka, nb = bn * kb;
      if (ad !== bd) steps.push([t('fr.step.common', { l: L.toString() }), `${frTex(an, ad)} ${symb} ${frTex(bn, bd)} = \\frac{${na}}{${L}} ${symb} \\frac{${nb < 0n ? `(${nb})` : nb}}{${L}}`]);
      rn = op === '+' ? na + nb : na - nb; rd = L;
      steps.push([t(op === '+' ? 'fr.step.addNum' : 'fr.step.subNum'), `= \\frac{${na} ${op === '+' ? '+' : '-'} ${nb < 0n ? `(${nb})` : nb}}{${L}} = \\frac{${rn}}{${rd}}`]);
    } else if (op === '*') {
      rn = an * bn; rd = ad * bd;
      steps.push([t('fr.step.mul'), `${frTex(an, ad)} \\times ${frTex(bn, bd)} = \\frac{${an} \\times ${bn < 0n ? `(${bn})` : bn}}{${ad} \\times ${bd}} = \\frac{${rn}}{${rd}}`]);
    } else {
      steps.push([t('fr.step.flip'), `${frTex(an, ad)} \\div ${frTex(bn, bd)} = ${frTex(an, ad)} \\times ${frTex(bd * (bn < 0n ? -1n : 1n), absB(bn))}`]);
      rn = an * bd * (bn < 0n ? -1n : 1n); rd = ad * absB(bn);
      steps.push([t('fr.step.mul'), `= \\frac{${rn}}{${rd}}`]);
    }
    if (rd < 0n) { rn = -rn; rd = -rd; }
    const g = gcdBig(absB(rn), rd);
    const res = new Rat(rn, rd);
    if (g > 1n) steps.push([t('fr.step.simplify', { g: g.toString() }), `\\frac{${rn}}{${rd}} = \\frac{${rn} \\div ${g}}{${rd} \\div ${g}} = ${frTex(res.n, res.d)}`]);
    if (!res.isInt && absB(res.n) > res.d) steps.push([t('fr.step.mixed'), `${frTex(res.n, res.d)} = ${mixedTex(res)}`]);
    const check = op === '+' ? ia.add(ib) : op === '-' ? ia.sub(ib) : op === '*' ? ia.mul(ib) : ia.div(ib);
    if (!check.eq(res)) { warn.set(t('err.internal')); return; }
    renderTex(result, `${aT} ${symb} ${bT} = ${mixedTex(res)}`, { display: true, fallback: mixedText(res) });
    const dec = toBase(res, 10, 40);
    out.set([
      [t('fr.simplest'), res.toString(), { big: true }],
      !res.isInt && absB(res.n) > res.d ? [t('fr.mixedNumber'), mixedText(res)] : null,
      [t('fr.decimalValue'), dec.text, { copy: dec.text.replace(/[()…]/g, '') }],
    ]);
    clear(stepsEl);
    stepsEl.hidden = !!app.settings.examMode;
    for (const [title, tex] of steps) {
      const m = h('div', { class: 'math' });
      renderTex(m, tex, { display: true });
      stepsEl.append(h('div', { class: 'step' }, h('div', { class: 'title', text: title }), m));
    }
    record('fractions', `${mixedText(a.r)} ${op} ${mixedText(b.r)}`, mixedText(res));
  }
  up();
}

function simplify(p) {
  const F = fracInput(t('fr.fraction'), '', '84', '126', up);
  const warn = message('warn');
  const result = h('div', { class: 'fm-big' });
  const out = outList();
  p.append(h('div', { class: 'card panel' }, F.el), warn.el, result, out.el);
  function up() {
    warn.set('');
    const a = F.read();
    if (a.error) { warn.set(a.error); clear(result); out.set([]); return; }
    const n = a.r.n * 1n, d = a.r.d;
    const origN = a.W !== 0n ? (absB(a.W) * absB(a.D) + absB(a.N)) * (a.W < 0n ? -1n : 1n) : a.N, origD = a.W !== 0n ? absB(a.D) : a.D;
    const g = gcdBig(absB(origN), absB(origD));
    renderTex(result, `${frTex(origN, origD < 0n ? -origD : origD)}${g > 1n ? ` = \\frac{${origN} \\div ${g}}{${absB(origD)} \\div ${g}}` : ''} = ${frTex(n, d)}`, { display: true });
    out.set([
      [t('fr.gcd'), g.toString()],
      [t('fr.simplest'), a.r.toString(), { big: true }],
      !a.r.isInt && absB(n) > d ? [t('fr.mixedNumber'), mixedText(a.r)] : null,
      [t('fr.decimalValue'), toBase(a.r, 10, 40).text],
      [t('fr.percent'), `${toBase(a.r.mul(new Rat(100n, 1n)), 10, 20).text}%`],
    ]);
    record('fractions', `${t('fr.simplify')} ${origN}/${origD}`, a.r.toString());
  }
  up();
}

// "0.375", "0.1(6)" (6 recurring) or "2.(142857)"
export function decimalToRat(s) {
  const m = /^(-?)(\d*)(?:\.(\d*)(?:\((\d+)\))?)?$/.exec(String(s).trim().replace(/[−–]/g, '-').replace(/\s/g, ''));
  if (!m || (!m[2] && !m[3] && !m[4])) return null;
  const sign = m[1] ? -1n : 1n, ip = BigInt(m[2] || '0'), fixed = m[3] || '', rep = m[4] || '';
  let r = new Rat(ip, 1n);
  if (fixed) r = r.add(new Rat(BigInt(fixed), 10n ** BigInt(fixed.length)));
  if (rep) r = r.add(new Rat(BigInt(rep), (10n ** BigInt(rep.length) - 1n) * 10n ** BigInt(fixed.length)));
  return sign < 0n ? r.neg() : r;
}

function decimalPanel(p) {
  const input = h('input', { class: 'input mono', inputmode: 'decimal', autocomplete: 'off', value: '0.1(6)', 'aria-label': t('fr.decimalIn') });
  const warn = message('warn');
  const result = h('div', { class: 'fm-big' });
  const out = outList();
  input.addEventListener('input', up);
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'field' }, h('label', { text: t('fr.decimalIn') }), input, h('div', { class: 'help', text: t('fr.decimalHelp') }))), warn.el, result, out.el);
  function up() {
    warn.set('');
    if (!input.value.trim()) { clear(result); out.set([]); return; }
    const r = decimalToRat(input.value);
    if (!r) { warn.set(t('fr.badDecimal')); clear(result); out.set([]); return; }
    renderTex(result, `${input.value.replace(/\((\d+)\)/, '\\overline{$1}')} = ${frTex(r.n, r.d)}`, { display: true, fallback: r.toString() });
    out.set([[t('fr.simplest'), r.toString(), { big: true }], !r.isInt && absB(r.n) > r.d ? [t('fr.mixedNumber'), mixedText(r)] : null]);
    record('fractions', input.value, r.toString());
  }
  up();
}
