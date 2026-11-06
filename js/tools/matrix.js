// Matrix calculator (14.2): A and B from 1×1 to 6×6, exact fractions,
// determinant, inverse, transpose, rank, trace, powers, RREF, eigenvalues,
// A ± B, A × B, k·A and solving A x = b. Working shown for 2×2 and 3×3
// determinants and inverses.

import { h, clear, icon, copyText } from '../ui.js';
import { t } from '../i18n/index.js';
import { app } from '../bus.js';
import { store } from '../store.js';
import { renderTex } from '../mathrender.js';
import { Rat, MathError } from '../core/rational.js';
import { Dec } from '../core/decimal.js';
import { M } from '../core/matrix.js';
import * as engine from '../engine-client.js';
import { errorText } from '../calc.js';
import { toolPage, readValue, ratTex, matTex, fmt, record, selectField, message } from './kit.js';

const SIZES = [1, 2, 3, 4, 5, 6].map((n) => [String(n), String(n)]);

export function create() {
  const { root, body } = toolPage('matrix');
  const saved = store.get('matrix', {});
  const mats = {
    A: normal(saved.A, [[2, 1], [1, 3]]),
    B: normal(saved.B, [[1, 0], [0, 1]]),
  };
  const editors = {};
  const out = h('div', { class: 'result-card', hidden: true, 'aria-live': 'polite' });
  const err = message('warn');
  let decimal = false;
  let last = null;

  for (const name of ['A', 'B']) editors[name] = editor(name);

  const powN = h('input', { class: 'input mono', inputmode: 'numeric', value: '2', 'aria-label': t('mat.power'), style: { width: '64px' } });
  const kIn = h('input', { class: 'input mono', inputmode: 'decimal', value: '2', 'aria-label': t('mat.scalar'), style: { width: '64px' } });
  const op = (label, fn, extra) => h('button', { class: 'btn sm', type: 'button', on: { click: () => run(label, fn) } }, label, extra || null);

  body.append(
    h('div', { class: 'tool-grid two' }, editors.A.el, editors.B.el),
    h('div', { class: 'card panel' },
      h('h2', { class: 'sec-title', text: t('mat.opsA') }),
      h('div', { class: 'btn-row' },
        op('det(A)', () => det(get('A'))),
        op('A⁻¹', () => inverse(get('A'))),
        op('Aᵀ', () => ({ tex: `A^{T} = ${matTex(M.transpose(get('A')))}`, mat: M.transpose(get('A')) })),
        op(t('mat.rank'), () => { const r = M.rank(get('A')); return { tex: `\\operatorname{rank}(A) = ${r}`, text: String(r) }; }),
        op(t('mat.trace'), () => { const s = M.trace(get('A')); return { tex: `\\operatorname{tr}(A) = ${ratTex(s)}`, text: s.toString(), value: s }; }),
        op('RREF', () => { const R = M.rref(get('A')); return { tex: `\\operatorname{rref}(A) = ${matTex(R)}`, mat: R }; }),
        op(t('mat.eigen'), () => eigen(get('A'))),
        h('span', { class: 'op-inline' }, op('Aⁿ', () => power()), h('label', { class: 'tiny muted', text: 'n =' }), powN)),
      h('h2', { class: 'sec-title', text: t('mat.opsAB') }),
      h('div', { class: 'btn-row' },
        op('A + B', () => { const R = M.add(get('A'), get('B')); return { tex: `A + B = ${matTex(R)}`, mat: R }; }),
        op('A − B', () => { const R = M.sub(get('A'), get('B')); return { tex: `A - B = ${matTex(R)}`, mat: R }; }),
        op('A × B', () => { const R = M.mul(get('A'), get('B')); return { tex: `AB = ${matTex(R)}`, mat: R }; }),
        op('B × A', () => { const R = M.mul(get('B'), get('A')); return { tex: `BA = ${matTex(R)}`, mat: R }; }),
        op(t('mat.solve'), () => solveAx()),
        h('span', { class: 'op-inline' }, op('k·A', () => scalar()), h('label', { class: 'tiny muted', text: 'k =' }), kIn)),
      h('p', { class: 'help', text: t('mat.help') })),
    err.el,
    out);

  function normal(m, def) {
    const ok = Array.isArray(m) && m.length >= 1 && m.length <= 6 && m.every((r) => Array.isArray(r) && r.length === m[0].length && r.length <= 6);
    return (ok ? m : def).map((r) => r.map((v) => String(v)));
  }

  function editor(name) {
    const grid = h('div', { class: 'matrix-grid', role: 'group', 'aria-label': t('mat.matrix', { name }) });
    const rows = selectField(t('mat.rows'), SIZES, String(mats[name].length), (v) => resize(+v, +cols.get()));
    const cols = selectField(t('mat.cols'), SIZES, String(mats[name][0].length), (v) => resize(+rows.get(), +v));
    function resize(r, c) {
      const old = mats[name];
      mats[name] = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => (old[i] && old[i][j] !== undefined ? old[i][j] : (i === j ? '1' : '0'))));
      draw();
      save();
    }
    function draw() {
      clear(grid);
      const m = mats[name];
      grid.style.gridTemplateColumns = `repeat(${m[0].length}, auto)`;
      m.forEach((row, i) => row.forEach((v, j) => {
        const inp = h('input', { class: 'input', inputmode: 'decimal', autocomplete: 'off', value: v, 'aria-label': `${name} ${t('mat.row')} ${i + 1}, ${t('mat.col')} ${j + 1}` });
        inp.addEventListener('input', () => { mats[name][i][j] = inp.value; const r = readValue(inp.value); inp.classList.toggle('invalid', !!r.error); save(); });
        inp.addEventListener('keydown', (e) => {
          const cells = [...grid.querySelectorAll('input')];
          const idx = cells.indexOf(inp), c = m[0].length;
          const go = (k) => { if (cells[k]) { e.preventDefault(); cells[k].focus(); cells[k].select(); } };
          if (e.key === 'Enter') go(idx + 1);
          else if (e.key === 'ArrowDown') go(idx + c);
          else if (e.key === 'ArrowUp') go(idx - c);
        });
        grid.append(inp);
      }));
    }
    draw();
    const actions = h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm ghost', type: 'button', on: { click: () => { mats[name] = mats[name].map((r) => r.map(() => '0')); draw(); save(); } } }, t('mat.zero')),
      h('button', { class: 'btn sm ghost', type: 'button', on: { click: () => { mats[name] = mats[name].map((r, i) => r.map((_, j) => (i === j ? '1' : '0'))); draw(); save(); } } }, t('mat.identity')),
      name === 'A' ? h('button', { class: 'btn sm ghost', type: 'button', on: { click: () => { [mats.A, mats.B] = [mats.B, mats.A]; editors.A.redraw(); editors.B.redraw(); save(); } } }, icon('swap', 'sm'), t('mat.swap')) : null);
    const el = h('section', { class: 'card panel' }, h('h2', { class: 'sec-title', text: t('mat.matrix', { name }) }),
      h('div', { class: 'tool-grid' }, rows.el, cols.el), h('div', { class: 'matrix-scroll' }, grid), actions);
    return { el, redraw() { rows.set(String(mats[name].length)); cols.set(String(mats[name][0].length)); draw(); } };
  }

  const save = () => store.set('matrix', { A: mats.A, B: mats.B });

  function get(name) {
    return mats[name].map((row, i) => row.map((v, j) => {
      const r = readValue(v);
      if (r.empty) return Rat.ZERO;
      if (r.error) throw new MathError('matentry', { name, i: i + 1, j: j + 1 });
      if (r.rat) return r.rat;
      return r.dec instanceof Dec ? r.dec.toRat() : Rat.parse(String(r.num));
    }));
  }

  function det(A) {
    const d = M.det(A);
    const steps = [];
    const n = A.length;
    const T = (r) => (r.isNeg ? `(${ratTex(r)})` : ratTex(r));
    if (n === 2) {
      steps.push([t('mat.step.det2'), `\\det A = ad - bc = ${T(A[0][0])}\\cdot${T(A[1][1])} - ${T(A[0][1])}\\cdot${T(A[1][0])} = ${ratTex(d)}`]);
    } else if (n === 3) {
      const m = (i, j) => M.det(M.minor(A, i, j));
      steps.push([t('mat.step.det3'), `\\det A = a_{11}M_{11} - a_{12}M_{12} + a_{13}M_{13}`]);
      steps.push([t('mat.step.minors'), [0, 1, 2].map((j) => `M_{1${j + 1}} = ${vmat(M.minor(A, 0, j))} = ${ratTex(m(0, j))}`).join(',\\quad ')]);
      steps.push([t('mat.step.combine'), `\\det A = ${T(A[0][0])}\\cdot${T(m(0, 0))} - ${T(A[0][1])}\\cdot${T(m(0, 1))} + ${T(A[0][2])}\\cdot${T(m(0, 2))} = ${ratTex(d)}`]);
    }
    return { tex: `\\det(A) = ${ratTex(d)}`, text: d.toString(), value: d, steps };
  }
  const vmat = (A) => `\\begin{vmatrix}${A.map((r) => r.map(ratTex).join(' & ')).join(' \\\\ ')}\\end{vmatrix}`;

  function inverse(A) {
    const I = M.inverse(A);
    const steps = [];
    const d = M.det(A);
    if (A.length === 2) {
      steps.push([t('mat.step.det2'), `\\det A = ${ratTex(d)}`]);
      steps.push([t('mat.step.inv2'), `A^{-1} = \\frac{1}{\\det A}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix} = \\frac{1}{${ratTex(d)}}${matTex([[A[1][1], A[0][1].neg()], [A[1][0].neg(), A[0][0]]])}`]);
    } else if (A.length === 3) {
      const C = M.cofactors(A);
      steps.push([t('mat.step.det3'), `\\det A = ${ratTex(d)}`]);
      steps.push([t('mat.step.cofactors'), `C = ${matTex(C)}`]);
      steps.push([t('mat.step.adj'), `\\operatorname{adj}(A) = C^{T} = ${matTex(M.transpose(C))}`]);
      steps.push([t('mat.step.inv3'), `A^{-1} = \\frac{1}{${ratTex(d)}}\\operatorname{adj}(A)`]);
    }
    steps.push([t('mat.step.check'), `A A^{-1} = I`]);
    return { tex: `A^{-1} = ${matTex(I)}`, mat: I, steps };
  }

  function power() {
    const n = readValue(powN.value);
    if (!(n.rat && n.rat.isInt) || Math.abs(n.num) > 1000) throw new MathError('intarg');
    const R = M.pow(get('A'), Number(n.num));
    return { tex: `A^{${n.num}} = ${matTex(R)}`, mat: R };
  }
  function scalar() {
    const k = readValue(kIn.value);
    if (k.error || k.empty) throw new MathError('argtype');
    const kr = k.rat || Rat.parse(String(k.num));
    const R = M.scale(get('A'), kr);
    return { tex: `${ratTex(kr)}A = ${matTex(R)}`, mat: R };
  }
  function solveAx() {
    const A = get('A'), B = get('B');
    if (B.length !== A.length) throw new MathError('matsize', { a: `${A.length}×${A[0].length}`, b: `${B.length}×${B[0].length}` });
    const b = B.map((r) => r[0]);
    const r = M.solve(A, b);
    if (r.kind === 'none') return { tex: '\\text{' + t('mat.noSolution') + '}', text: t('mat.noSolution') };
    if (r.kind === 'infinite') return { tex: `\\text{${t('mat.infinite')}}\\quad ${matTex(r.rref)}`, text: t('mat.infinite') };
    const names = ['x', 'y', 'z', 'w', 'u', 'v'];
    return { tex: r.x.map((v, i) => `${A[0].length <= 6 ? names[i] : `x_{${i + 1}}`} = ${ratTex(v)}`).join(',\\quad '), text: r.x.map((v, i) => `${names[i]} = ${v}`).join(', '), note: t('mat.solveNote') };
  }

  async function eigen(A) {
    M.square(A);
    const s = app.settings;
    const text = `eigs([${A.map((r) => `[${r.map((v) => v.toString()).join(', ')}]`).join(', ')}])`;
    const r = await engine.solve(text, { angle: s.angle, complex: true, sig: s.sig, group: s.group });
    if (!r.ok) throw new MathError(r.error.code, r.error.info);
    return { tex: r.exact ? r.exact.latex : null, text: r.exact ? r.exact.text : r.decimal.text, plain: !r.exact };
  }

  async function run(label, fn) {
    err.set('');
    try {
      const res = await fn();
      last = res;
      show(label, res);
      record('matrix', label, res.text || (res.mat ? res.mat.map((r) => r.join(' ')).join('; ') : ''));
    } catch (e) {
      out.hidden = true;
      if (e instanceof MathError && e.code === 'matentry') err.set(t('mat.badEntry', e.info));
      else err.set(e instanceof MathError ? errorText({ code: e.code, info: e.info || {} }) : t('err.internal'));
    }
  }

  function show(label, res) {
    clear(out);
    out.hidden = false;
    out.append(h('div', { class: 'task', text: label }));
    const main = h('div', { class: 'exact' });
    if (res.plain) main.textContent = res.text;
    else renderTex(main, decimal && res.mat ? res.tex.replace(/\\begin\{pmatrix\}[\s\S]*\\end\{pmatrix\}$/, matTex(res.mat, (v) => fmt(v.toNumber(), 6))) : res.tex, { display: true, fallback: res.text || '' });
    out.append(main);
    if (res.value && !res.value.isInt) out.append(h('div', { class: 'decimal', text: `≈ ${fmt(res.value.toNumber())}` }));
    if (res.note) out.append(h('p', { class: 'note', text: res.note }));
    const actions = h('div', { class: 'btn-row' });
    const plain = res.mat ? `[${res.mat.map((r) => `[${r.map((v) => v.toString()).join(', ')}]`).join(', ')}]` : (res.text || '');
    actions.append(h('button', { class: 'btn sm', type: 'button', on: { click: () => copyText(plain) } }, icon('copy', 'sm'), t('common.copy')));
    if (res.tex) actions.append(h('button', { class: 'btn sm', type: 'button', on: { click: () => copyText(res.tex) } }, icon('brackets', 'sm'), t('solve.copyLatex')));
    if (res.mat) {
      actions.append(h('button', { class: 'btn sm', type: 'button', 'aria-pressed': String(decimal), on: { click: () => { decimal = !decimal; show(label, res); } } }, t('mat.decimals')));
      actions.append(h('button', { class: 'btn sm', type: 'button', on: { click: () => { mats.A = res.mat.map((r) => r.map((v) => v.toString())); editors.A.redraw(); save(); } } }, t('mat.useAsA')));
    }
    let stepsEl = null;
    if (res.steps && res.steps.length) {
      stepsEl = h('div', { class: 'steps', hidden: true });
      res.steps.forEach(([title, tex]) => { const m = h('div', { class: 'math' }); renderTex(m, tex, { display: true }); stepsEl.append(h('div', { class: 'step' }, h('div', { class: 'title', text: title }), m)); });
      const sb = h('button', { class: 'btn sm', type: 'button', 'aria-expanded': 'false', hidden: !!app.settings.examMode, on: { click: () => { stepsEl.hidden = !stepsEl.hidden; sb.setAttribute('aria-expanded', String(!stepsEl.hidden)); } } }, icon('list', 'sm'), t('solve.steps'));
      actions.append(sb);
    }
    out.append(actions);
    if (stepsEl) out.append(stepsEl);
  }

  return { root };
}
