// Function library for the calculator: every function the engine knows,
// grouped, searchable, with the argument order and a tappable example.
// Tapping inserts the function into the calculator at the cursor.

import { h, clear, openSheet, icon } from './ui.js';
import { t } from './i18n/index.js';

// [label shown on the key, text inserted, example, i18n description key]
const GROUPS = [
  ['calculus', [
    ['∫ₐᵇ', 'integrate(', 'integrate(x^2, x, 0, 3)', 'fn.defint'],
    ['∫', 'integrate(', 'integrate(x*e^x, x)', 'fn.integral'],
    ['d/dx', 'diff(', 'diff(x^3*sin(x), x)', 'fn.diff'],
    ['d²/dx²', 'diff(', 'diff(x^4, x, 2)', 'fn.diff2'],
    ['lim', 'limit(', 'limit(sin(x)/x, x, 0)', 'fn.limit'],
    ['lim ∞', 'limit(', 'limit((1 + 1/n)^n, n, inf)', 'fn.limitInf'],
    ['Σ', 'sum(', 'sum(k^2, k, 1, 10)', 'fn.sum'],
    ['Π', 'product(', 'product(k, k, 1, 6)', 'fn.product'],
    ['Taylor', 'taylor(', 'taylor(e^x, x, 0, 4)', 'fn.taylor'],
  ]],
  ['powers', [
    ['x²', '²', '7²', 'fn.sq'], ['x³', '³', '4³', 'fn.cube'], ['xʸ', '^(', '2^(10)', 'fn.pow'], ['x⁻¹', '^(-1)', '8^(-1)', 'fn.recip'],
    ['eˣ', 'e^(', 'e^(2)', 'fn.exp'], ['10ˣ', '10^(', '10^(3)', 'fn.tenx'], ['2ˣ', '2^(', '2^(16)', 'fn.twox'],
    ['√', '√(', '√(50)', 'fn.sqrt'], ['∛', '∛(', '∛(125)', 'fn.cbrt'], ['ʸ√x', 'root(', 'root(4, 81)', 'fn.root'],
  ]],
  ['logs', [
    ['ln', 'ln(', 'ln(e^3)', 'fn.ln'], ['log', 'log(', 'log(1000)', 'fn.log'], ['log₂', 'log2(', 'log2(64)', 'fn.log2'], ['logₐ', 'log(', 'log(3, 81)', 'fn.logb'],
  ]],
  ['algebra', [
    ['solve', 'solve(', 'solve(x^2 - 5x + 6 = 0)', 'fn.solve'], ['factor', 'factor(', 'factor(x^3 - 8)', 'fn.factor'],
    ['expand', 'expand(', 'expand((x + 2)^3)', 'fn.expand'], ['simplify', 'simplify(', 'simplify((x^2 - 1)/(x - 1))', 'fn.simplify'],
  ]],
  ['trig', [
    ['sec', 'sec(', 'sec(60)', 'fn.sec'], ['csc', 'csc(', 'csc(30)', 'fn.csc'], ['cot', 'cot(', 'cot(45)', 'fn.cot'],
    ['sinh⁻¹', 'asinh(', 'asinh(1)', 'fn.asinh'], ['cosh⁻¹', 'acosh(', 'acosh(2)', 'fn.acosh'], ['tanh⁻¹', 'atanh(', 'atanh(0.5)', 'fn.atanh'],
  ]],
  ['numbers', [
    ['|x|', 'abs(', 'abs(-7.5)', 'fn.abs'], ['⌊x⌋', 'floor(', 'floor(3.7)', 'fn.floor'], ['⌈x⌉', 'ceil(', 'ceil(3.2)', 'fn.ceil'], ['round', 'round(', 'round(2.5)', 'fn.round'],
    ['mod', 'mod(', 'mod(17, 5)', 'fn.mod'], ['gcd', 'gcd(', 'gcd(84, 126)', 'fn.gcd'], ['lcm', 'lcm(', 'lcm(4, 6, 10)', 'fn.lcm'],
    ['x!', '!', '6!', 'fn.fact'], ['nCr', 'nCr(', 'nCr(10, 3)', 'fn.ncr'], ['nPr', 'nPr(', 'nPr(10, 3)', 'fn.npr'],
    ['prime?', 'isprime(', 'isprime(97)', 'fn.isprime'], ['factors', 'factorint(', 'factorint(360)', 'fn.factorint'], ['Fib', 'fibonacci(', 'fibonacci(20)', 'fn.fib'],
    ['randint', 'randint(', 'randint(1, 6)', 'fn.randint'],
  ]],
  ['stats', [
    ['mean', 'mean(', 'mean(4, 8, 15, 16)', 'fn.mean'], ['median', 'median(', 'median(3, 9, 1, 7)', 'fn.median'], ['mode', 'mode(', 'mode(2, 3, 3, 5)', 'fn.mode'],
    ['s', 'std(', 'std(2, 4, 4, 5)', 'fn.std'], ['σ', 'pstd(', 'pstd(2, 4, 4, 5)', 'fn.pstd'], ['max', 'max(', 'max(3, 9, 2)', 'fn.max'], ['min', 'min(', 'min(3, 9, 2)', 'fn.min'],
    ['N(μ,σ)', 'normalcdf(', 'normalcdf(-1, 1, 0, 1)', 'fn.normalcdf'], ['B(n,p)', 'binompdf(', 'binompdf(10, 0.3, 3)', 'fn.binompdf'], ['Po(λ)', 'poissonpdf(', 'poissonpdf(3, 2)', 'fn.poissonpdf'],
  ]],
  ['matrices', [
    ['det', 'det(', 'det([[2, 1], [1, 3]])', 'fn.det'], ['A⁻¹', 'inv(', 'inv([[2, 1], [1, 3]])', 'fn.inv'], ['Aᵀ', 'transpose(', 'transpose([[1, 2, 3], [4, 5, 6]])', 'fn.transpose'],
    ['rank', 'rank(', 'rank([[1, 2], [2, 4]])', 'fn.rank'], ['eig', 'eigs(', 'eigs([[2, 1], [1, 2]])', 'fn.eigs'],
  ]],
  ['complex', [
    ['i', 'i', '(2 + 3i)(1 - i)', 'fn.i'], ['Re', 're(', 're(3 + 4i)', 'fn.re'], ['Im', 'im(', 'im(3 + 4i)', 'fn.im'], ['|z|', 'abs(', 'abs(3 + 4i)', 'fn.modz'], ['arg', 'arg(', 'arg(1 + i)', 'fn.arg'], ['z̄', 'conj(', 'conj(3 + 4i)', 'fn.conj'],
  ]],
];

// onPick(insertText) or onPick(exampleText, true) to load a whole example
export function openFunctions(onPick) {
  const q = h('input', { class: 'input', type: 'search', placeholder: t('fn.search'), 'aria-label': t('fn.search') });
  const list = h('div', { class: 'fn-list' });
  let sheet;
  function draw() {
    clear(list);
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let any = false;
    for (const [g, items] of GROUPS) {
      const hits = items.filter(([label, ins, ex, key]) => !words.length || words.every((w) => `${label} ${ins} ${ex} ${t(key)} ${t(`fn.g.${g}`)}`.toLowerCase().includes(w)));
      if (!hits.length) continue;
      any = true;
      list.append(h('h3', { class: 'section-title', text: t(`fn.g.${g}`) }), h('div', { class: 'fn-grid' }, hits.map(([label, ins, ex, key]) =>
        h('div', { class: 'fn-item' },
          h('button', { class: 'fn-key', type: 'button', 'aria-label': `${t(key)}: ${t('fn.insert')}`, on: { click: () => { sheet.close(); onPick(ins, false, ex); } } }, label),
          h('div', { class: 'fn-info' }, h('div', { class: 'fn-desc', text: t(key) }),
            h('button', { class: 'fn-ex mono', type: 'button', title: t('fn.tryIt'), on: { click: () => { sheet.close(); onPick(ex, true); } } }, ex))))));
    }
    if (!any) list.append(h('p', { class: 'note-box', text: t('search.empty') }));
  }
  q.addEventListener('input', draw);
  draw();
  sheet = openSheet({ title: t('fn.title'), body: h('div', { class: 'panel' }, h('p', { class: 'help', text: t('fn.help') }), q, list), wide: true });
  return sheet;
}
