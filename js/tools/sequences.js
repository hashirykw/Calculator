// Sequences: arithmetic and geometric (nth term, sums, sum to infinity) and
// "find the rule" from the first few terms (AP, GP, quadratic, cubic).

import { h, clear } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { renderTex } from '../mathrender.js';
import { toolPage, numField, outList, message, fmt, record, ok, tabbed, fieldRow, plain } from './kit.js';

const texNum = (x) => plain(x, 10).replace(/^-/, '-');
const tex = (el, s) => { clear(el); renderTex(el, s, { display: true }); };

export function create() {
  const { root, body } = toolPage('sequences');
  const s = store.get('sequences', {});
  const tb = tabbed([['ap', t('sq.ap')], ['gp', t('sq.gp')], ['rule', t('sq.rule')]], {
    ap(p) {
      const a = numField(t('sq.first'), { value: s.aa ?? '3', onInput: up });
      const d = numField(t('sq.diff'), { value: s.ad ?? '4', onInput: up });
      const n = numField(t('sq.n'), { value: s.an ?? '10', inputmode: 'numeric', onInput: up });
      const out = outList(), formula = h('div', { class: 'tex-box' }), terms = h('p', { class: 'mono small wrap' }), warn = message('warn');
      p.append(h('div', { class: 'card panel' }, fieldRow(a, d, n)), warn.el, formula, out.el, h('div', { class: 'card' }, h('h3', { class: 'section-title', text: t('sq.terms') }), terms));
      function up() {
        const A = a.get(), D = d.get(), N = n.get();
        store.set('sequences', { ...store.get('sequences', {}), aa: a.input.value, ad: d.input.value, an: n.input.value });
        warn.set('');
        if (!ok(A, D, N)) { out.set([]); clear(formula); terms.textContent = ''; return; }
        if (!Number.isInteger(N) || N < 1 || N > 1e7) { warn.set(t('sq.nWhole')); return; }
        const un = A + (N - 1) * D, sn = (N / 2) * (2 * A + (N - 1) * D);
        tex(formula, `u_n = ${texNum(A)} + (n-1)(${texNum(D)}) = ${texNum(D)}n ${A - D < 0 ? '-' : '+'} ${texNum(Math.abs(A - D))}`);
        out.set([[t('sq.nth', { n: N }), fmt(un), { big: true }], [t('sq.sum', { n: N }), fmt(sn)], [t('sq.formulaNth'), `uₙ = ${fmt(D)}n ${A - D < 0 ? '−' : '+'} ${fmt(Math.abs(A - D))}`], [t('sq.formulaSum'), 'Sₙ = n/2 [2a + (n − 1)d]']]);
        terms.textContent = Array.from({ length: Math.min(N, 20) }, (_, i) => fmt(A + i * D)).join(', ') + (N > 20 ? ', …' : '');
        record('sequences', `AP a=${A}, d=${D}, n=${N}`, `u${N} = ${fmt(un)}, S${N} = ${fmt(sn)}`);
      }
      up();
    },
    gp(p) {
      const a = numField(t('sq.first'), { value: s.ga ?? '2', onInput: up });
      const r = numField(t('sq.ratio'), { value: s.gr ?? '3', onInput: up });
      const n = numField(t('sq.n'), { value: s.gn ?? '8', inputmode: 'numeric', onInput: up });
      const out = outList(), formula = h('div', { class: 'tex-box' }), terms = h('p', { class: 'mono small wrap' }), warn = message('warn');
      p.append(h('div', { class: 'card panel' }, fieldRow(a, r, n)), warn.el, formula, out.el, h('div', { class: 'card' }, h('h3', { class: 'section-title', text: t('sq.terms') }), terms));
      function up() {
        const A = a.get(), R = r.get(), N = n.get();
        store.set('sequences', { ...store.get('sequences', {}), ga: a.input.value, gr: r.input.value, gn: n.input.value });
        warn.set('');
        if (!ok(A, R, N)) { out.set([]); clear(formula); terms.textContent = ''; return; }
        if (!Number.isInteger(N) || N < 1 || N > 100000) { warn.set(t('sq.nWhole')); return; }
        const un = A * R ** (N - 1), sn = R === 1 ? A * N : (A * (1 - R ** N)) / (1 - R);
        tex(formula, `u_n = ${texNum(A)} \\times ${texNum(R)}^{\\,n-1}`);
        out.set([[t('sq.nth', { n: N }), fmt(un), { big: true }], [t('sq.sum', { n: N }), fmt(sn)],
          [t('sq.sumInf'), Math.abs(R) < 1 ? fmt(A / (1 - R)) : t('sq.diverges')], [t('sq.formulaSum'), 'Sₙ = a(1 − rⁿ)/(1 − r)']]);
        terms.textContent = Array.from({ length: Math.min(N, 15) }, (_, i) => fmt(A * R ** i)).join(', ') + (N > 15 ? ', …' : '');
        record('sequences', `GP a=${A}, r=${R}, n=${N}`, `u${N} = ${fmt(un)}, S${N} = ${fmt(sn)}`);
      }
      up();
    },
    rule(p) {
      const inp = h('input', { class: 'input mono', autocomplete: 'off', value: s.rule ?? '2, 6, 12, 20, 30', 'aria-label': t('sq.termsIn') });
      const out = outList(), formula = h('div', { class: 'tex-box' }), warn = message('warn');
      p.append(h('div', { class: 'card panel' }, h('div', { class: 'field' }, h('label', { text: t('sq.termsIn') }), inp), h('p', { class: 'help', text: t('sq.ruleHelp') })), warn.el, formula, out.el);
      inp.addEventListener('input', up);
      function up() {
        store.set('sequences', { ...store.get('sequences', {}), rule: inp.value });
        warn.set('');
        clear(formula);
        const v = inp.value.split(/[,\s;]+/).filter(Boolean).map(Number);
        if (v.length < 3 || v.some((x) => !Number.isFinite(x))) { out.set([]); if (inp.value.trim()) warn.set(t('sq.needThree')); return; }
        const eq = (x, y) => Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
        const diffs = (a) => a.slice(1).map((x, i) => x - a[i]);
        const d1 = diffs(v), d2 = diffs(d1), d3 = diffs(d2);
        const next = [];
        let type, nth, latex;
        if (d1.every((x) => eq(x, d1[0]))) {
          const d = d1[0], c = v[0] - d;
          type = t('sq.ap'); nth = (n) => d * n + c;
          latex = `u_n = ${texNum(d)}n ${c < 0 ? '-' : '+'} ${texNum(Math.abs(c))}`;
        } else if (v.every((x) => x !== 0) && v.slice(1).every((x, i) => eq(x / v[i], v[1] / v[0]))) {
          const r = v[1] / v[0];
          type = t('sq.gp'); nth = (n) => v[0] * r ** (n - 1);
          latex = `u_n = ${texNum(v[0])} \\times ${texNum(r)}^{\\,n-1}`;
        } else if (v.length >= 4 && d2.every((x) => eq(x, d2[0]))) {
          const a = d2[0] / 2, b = d1[0] - 3 * a, c = v[0] - a - b;
          type = t('sq.quadratic'); nth = (n) => a * n * n + b * n + c;
          latex = `u_n = ${texNum(a)}n^2 ${b < 0 ? '-' : '+'} ${texNum(Math.abs(b))}n ${c < 0 ? '-' : '+'} ${texNum(Math.abs(c))}`;
        } else if (v.length >= 5 && d3.every((x) => eq(x, d3[0]))) {
          // fit an^3 + bn^2 + cn + d through the first four terms
          const A = d3[0] / 6;
          const w = v.map((x, i) => x - A * (i + 1) ** 3);
          const e1 = diffs(w), e2 = diffs(e1);
          const B = e2[0] / 2, C = e1[0] - 3 * B, D = w[0] - B - C;
          type = t('sq.cubic'); nth = (n) => A * n ** 3 + B * n * n + C * n + D;
          latex = `u_n = ${texNum(A)}n^3 ${B < 0 ? '-' : '+'} ${texNum(Math.abs(B))}n^2 ${C < 0 ? '-' : '+'} ${texNum(Math.abs(C))}n ${D < 0 ? '-' : '+'} ${texNum(Math.abs(D))}`;
        } else if (v.length >= 4 && v.slice(2).every((x, i) => eq(x, v[i] + v[i + 1]))) {
          type = t('sq.fibLike'); latex = 'u_n = u_{n-1} + u_{n-2}';
          let a = v[v.length - 2], b = v[v.length - 1];
          for (let i = 0; i < 5; i++) { [a, b] = [b, a + b]; next.push(b); }
        } else {
          out.set([[t('sq.type'), t('sq.unknown')]]);
          return;
        }
        if (nth) for (let k = v.length + 1; k <= v.length + 5; k++) next.push(nth(k));
        tex(formula, latex.replace(/\+ -/g, '- ').replace(/(^|[^0-9.])1n/g, '$1n'));
        out.set([[t('sq.type'), type, { big: true }], [t('sq.next'), next.map((x) => fmt(x)).join(', ')], nth ? [t('sq.term100'), fmt(nth(100))] : null]);
        record('sequences', inp.value, `${type}: next ${next.slice(0, 3).map((x) => fmt(x)).join(', ')}`);
      }
      up();
    },
  }, s.tab || 'ap');
  body.append(tb.el);
  return { root };
}
