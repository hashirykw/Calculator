// Equation forms (16.1): fill in coefficients for linear, quadratic and cubic
// equations or 2×2 / 3×3 simultaneous equations. The Solve engine does the
// work, so every answer is checked and comes with its steps; quadratics also
// show the discriminant, vertex and nature of the roots.

import { h, clear, icon, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { app } from '../bus.js';
import { store } from '../store.js';
import { renderTex } from '../mathrender.js';
import { Rat } from '../core/rational.js';
import * as engine from '../engine-client.js';
import { resultCard, errorCard } from '../solve.js';
import { toolPage, readValue, ratTex, record, outList, fmt } from './kit.js';

const FORMS = {
  linear: { coef: ['a', 'b', 'c'], tex: 'ax + b = c', def: ['3', '5', '20'] },
  quadratic: { coef: ['a', 'b', 'c'], tex: 'ax^2 + bx + c = 0', def: ['2', '-7', '3'] },
  cubic: { coef: ['a', 'b', 'c', 'd'], tex: 'ax^3 + bx^2 + cx + d = 0', def: ['1', '-6', '11', '-6'] },
  sys2: { coef: ['a_1', 'b_1', 'c_1', 'a_2', 'b_2', 'c_2'], tex: '\\begin{aligned} a_1x + b_1y &= c_1 \\\\ a_2x + b_2y &= c_2 \\end{aligned}', def: ['2', '1', '7', '1', '-1', '2'], rows: 2 },
  sys3: { coef: ['a_1', 'b_1', 'c_1', 'd_1', 'a_2', 'b_2', 'c_2', 'd_2', 'a_3', 'b_3', 'c_3', 'd_3'], tex: '\\begin{aligned} a_1x + b_1y + c_1z &= d_1 \\\\ a_2x + b_2y + c_2z &= d_2 \\\\ a_3x + b_3y + c_3z &= d_3 \\end{aligned}', def: ['1', '1', '1', '6', '2', '-1', '1', '3', '1', '2', '-1', '2'], rows: 3 },
};

export function create() {
  const { root, body } = toolPage('equations');
  const saved = store.get('eqforms', {});
  let form = FORMS[saved.form] ? saved.form : 'quadratic';
  const values = { ...Object.fromEntries(Object.entries(FORMS).map(([k, f]) => [k, f.def.slice()])), ...(saved.values || {}) };
  const formSeg = seg(Object.keys(FORMS).map((k) => [k, t(`eq.${k}`)]), form, (v) => { form = v; build(); }, t('eq.form'));
  const general = h('div', { class: 'fm-big' });
  const grid = h('div', { class: 'coef-grid' });
  const preview = h('div', { class: 'eq-preview', 'aria-live': 'polite' });
  const extra = outList();
  const results = h('div', { class: 'panel' });
  const go = h('button', { class: 'btn primary', type: 'button', on: { click: solve } }, icon('solve', 'sm'), t('solve.go'));
  body.append(h('div', { class: 'scroll-x' }, formSeg),
    h('div', { class: 'card panel' }, general, grid, h('div', { class: 'field' }, h('span', { class: 'label', text: t('eq.yourEquation') }), preview), h('div', { class: 'btn-row' }, go)),
    extra.el, results);

  let inputs = [];
  function build() {
    const f = FORMS[form];
    renderTex(general, f.tex, { display: true });
    clear(grid);
    grid.className = `coef-grid${f.rows ? ` rows${f.rows}` : ''}`;
    grid.style.setProperty('--cols', f.rows ? String(f.coef.length / f.rows) : String(f.coef.length));
    inputs = f.coef.map((c, i) => {
      const inp = h('input', { class: 'input mono', inputmode: 'decimal', autocomplete: 'off', value: values[form][i] ?? '', 'aria-label': c.replace('_', ' ') });
      inp.addEventListener('input', () => { values[form][i] = inp.value; store.set('eqforms', { form, values }); updatePreview(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') solve(); });
      const lab = h('label', { class: 'coef' });
      renderTex(lab, c, { fallback: c });
      return h('div', { class: 'field' }, lab, inp);
    });
    grid.append(...inputs);
    store.set('eqforms', { form, values });
    clear(results);
    extra.set([]);
    updatePreview();
  }

  // read coefficients exactly where possible (1/3 stays 1/3)
  function coefs() {
    return [...grid.querySelectorAll('input')].map((inp) => {
      const r = readValue(inp.value);
      inp.classList.toggle('invalid', !!r.error);
      if (r.empty) return Rat.ZERO;
      if (r.error) return null;
      return r.rat || (r.dec ? r.dec.toRat() : Rat.parse(String(r.num)));
    });
  }
  const term = (c, v, first) => {
    if (c.isZero) return '';
    const neg = c.isNeg, a = c.abs();
    const coef = v && a.eq(Rat.ONE) ? '' : (a.isInt ? a.toString() : `(${a.toString()})`);
    return `${first ? (neg ? '-' : '') : neg ? ' - ' : ' + '}${coef}${v && coef && !a.isInt ? '*' : ''}${v}`;
  };
  function poly(cs, vars) {
    let s = '';
    cs.forEach((c, i) => { const p = term(c, vars[i], !s); s += p; });
    return s || '0';
  }
  function equationText(c) {
    switch (form) {
      case 'linear': return `${poly([c[0], c[1]], ['x', ''])} = ${c[2].toString()}`;
      case 'quadratic': return `${poly(c, ['x^2', 'x', ''])} = 0`;
      case 'cubic': return `${poly(c, ['x^3', 'x^2', 'x', ''])} = 0`;
      case 'sys2': return [0, 3].map((k) => `${poly([c[k], c[k + 1]], ['x', 'y'])} = ${c[k + 2].toString()}`).join(', ');
      case 'sys3': return [0, 4, 8].map((k) => `${poly([c[k], c[k + 1], c[k + 2]], ['x', 'y', 'z'])} = ${c[k + 3].toString()}`).join(', ');
      default: return '';
    }
  }
  function updatePreview() {
    const c = coefs();
    if (c.some((x) => x === null)) { preview.textContent = t('eq.badCoef'); return; }
    const text = equationText(c);
    const tex = text.split(', ').map((e) => e.replace(/\*/g, '').replace(/\^(\d)/g, '^{$1}').replace(/\((-?\d+)\/(\d+)\)/g, '\\tfrac{$1}{$2}').replace(/(-?\d+)\/(\d+)/g, '\\tfrac{$1}{$2}')).join(' \\\\ ');
    renderTex(preview, form.startsWith('sys') ? `\\begin{cases} ${tex} \\end{cases}` : tex, { display: true, fallback: text });
  }

  async function solve() {
    const c = coefs();
    if (c.some((x) => x === null)) { preview.textContent = t('eq.badCoef'); return; }
    if ((form === 'quadratic' || form === 'cubic' || form === 'linear') && c[0].isZero) {
      clear(results).append(h('div', { class: 'warn-box', text: t(`eq.leadZero.${form}`) }));
      if (form === 'linear') return;
    }
    const eq = equationText(c);
    const text = `solve(${eq})`;
    clear(results).append(h('div', { class: 'result-card' }, h('div', { class: 'task' }, h('span', { class: 'spinner' }), t('solve.working'))));
    const s = app.settings;
    const r = await engine.solve(text, { angle: s.angle, complex: s.complex, sig: s.sig, group: s.group });
    clear(results);
    if (!r.ok) { results.append(errorCard(r, text)); return; }
    if (!r.plot && form === 'quadratic') r.plot = `y = ${eq.replace(' = 0', '')}`;
    if (form === 'sys2') r.plot = null;
    const card = resultCard(r, eq);
    if (form === 'sys2') {
      const lines = eq.split(', ');
      card.querySelector('.btn-row').append(h('button', { class: 'btn sm', type: 'button', on: { click: () => { app.pending = { ...(app.pending || {}), graph: lines }; location.hash = '#/graph'; } } }, icon('graph', 'sm'), h('span', { text: t('solve.plot') })));
    }
    results.append(card);
    record('equations', eq, r.exact ? r.exact.text : r.decimal ? r.decimal.text : '');
    quadraticExtras(c);
  }

  function quadraticExtras(c) {
    if (form !== 'quadratic' || c[0].isZero) { extra.set([]); return; }
    const [a, b, cc] = c;
    const D = b.mul(b).sub(a.mul(cc).mul(4));
    const vx = b.neg().div(a.mul(2));
    const vy = cc.sub(b.mul(b).div(a.mul(4)));
    const nature = D.isZero ? t('eq.repeated') : D.isNeg ? t('eq.noReal') : t('eq.twoReal');
    const tx = (r) => (r.isInt ? r.toString() : `${r.toString()} ≈ ${fmt(r.toNumber(), 8)}`);
    extra.set([
      [t('eq.discriminant'), `Δ = b² − 4ac = ${tx(D)}`],
      [t('eq.nature'), nature],
      [t('eq.vertex'), `(${tx(vx)}, ${tx(vy)})`],
      [t('eq.axis'), `x = ${tx(vx)}`],
      [t('eq.yint'), `(0, ${tx(cc)})`],
      [t('eq.opens'), a.isNeg ? t('eq.down') : t('eq.up')],
    ]);
  }

  build();
  return { root };
}
