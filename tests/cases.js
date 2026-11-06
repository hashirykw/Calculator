// Every test case from section 25 of the spec, plus regression cases.
// Used by tests.html (browser) and tests/run-node.mjs (CI). Each case returns
// the actual value as a string; `expect` is a string or a checker function.

import { CalcModel } from '../js/core/calcmodel.js';
import { run } from '../js/engine.js';
import { describe } from '../js/core/stats.js';
import { amortisation, savings, emi } from '../js/core/finance.js';
import { convert } from '../js/core/units.js';
import { twosComplement, toBase } from '../js/core/base.js';
import { solveTriangle } from '../js/core/triangle.js';
import { M } from '../js/core/matrix.js';
import { MathError } from '../js/core/rational.js';
import { molarMass, suvat } from '../js/core/science.js';

// Press a sequence of keypad tokens; "=" evaluates.
function keys(seq, settings = {}) {
  const m = new CalcModel({ angle: 'deg', ...settings });
  const shown = [];
  for (const k of seq) {
    if (k === '=') {
      const r = m.equals();
      shown.push(r ? r.decimal : `ERR:${m.error.code}`);
    } else if (k === 'SD') {
      m.toggleSD();
      shown.push(m.view === 'exact' ? m.result.exact.text : m.result.decimal);
    } else m.insert(k);
  }
  return shown;
}
const calc = (expr, settings) => keys([...splitTokens(expr), '='], settings).pop();
function splitTokens(s) {
  const out = [];
  const multi = ['sin(', 'cos(', 'tan(', 'ln(', 'log(', '√(', 'nCr(', 'π', 'e^('];
  let i = 0;
  while (i < s.length) {
    const m = multi.find((w) => s.startsWith(w, i));
    if (m) { out.push(m); i += m.length; } else { out.push(s[i]); i++; }
  }
  return out;
}
const solve = (input, settings = {}) => {
  const r = run(input, { angle: 'rad', ...settings });
  if (!r.ok) return `ERR:${r.error.code}`;
  return [r.exact && r.exact.text, r.decimal && r.decimal.text].filter(Boolean).join(' | ');
};
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;
const money = (x) => x.toFixed(2);

export const cases = [
  // ---------- 25.1 Calculator ----------
  { group: 'Calculator', name: '2+3×4', run: () => calc('2+3×4'), expect: '14' },
  { group: 'Calculator', name: '0.1+0.2', run: () => calc('0.1+0.2'), expect: '0.3' },
  { group: 'Calculator', name: '-3²', run: () => calc('-3²'), expect: '−9' },
  { group: 'Calculator', name: '(-3)²', run: () => calc('(-3)²'), expect: '9' },
  { group: 'Calculator', name: '10÷0', run: () => calc('10÷0'), expect: 'ERR:divzero' },
  { group: 'Calculator', name: '5!', run: () => calc('5!'), expect: '120' },
  { group: 'Calculator', name: 'sin(30) in DEG', run: () => keys([...splitTokens('sin(30)'), '=', 'SD']).join(' ⇄ '), expect: '0.5 ⇄ 1/2' },
  { group: 'Calculator', name: 'sin(π/2) in RAD', run: () => calc('sin(π/2)', { angle: 'rad' }), expect: '1' },
  { group: 'Calculator', name: '2π', run: () => calc('2π'), expect: '6.283185307' },
  { group: 'Calculator', name: '200×15%', run: () => calc('200×15%'), expect: '30' },
  { group: 'Calculator', name: '200+15%', run: () => calc('200+15%'), expect: '230' },
  { group: 'Calculator', name: '50% alone', run: () => calc('50%'), expect: '0.5' },
  { group: 'Calculator', name: '√(-4) real mode', run: () => calc('√(-4)'), expect: 'ERR:sqrtneg' },
  { group: 'Calculator', name: '√(-4) complex mode', run: () => calc('√(-4)', { complex: true }), expect: '2i' },
  { group: 'Calculator', name: 'nCr(5,2)', run: () => calc('nCr(5,2)'), expect: '10' },
  { group: 'Calculator', name: '1/3 then S⇔D', run: () => keys(['1', '/', '3', '=', 'SD']).join(' ⇄ '), expect: '0.3333333333 ⇄ 1/3' },
  { group: 'Calculator', name: '√8 exact', run: () => keys(['√(', '8', ')', '=', 'SD']).pop(), expect: '2√2' },
  { group: 'Calculator', name: '5+2 = = =', run: () => keys(['5', '+', '2', '=', '=', '=']).join(', '), expect: '7, 9, 11' },
  { group: 'Calculator', name: '2(3+4)', run: () => calc('2(3+4)'), expect: '14' },
  { group: 'Calculator', name: '1e308×10', run: () => calc('1e308×10'), expect: 'ERR:toolarge' },
  { group: 'Calculator', name: 'ln(e^2)', run: () => calc('ln(e^2)'), expect: '2' },
  { group: 'Calculator', name: 'log(1000)', run: () => calc('log(1000)'), expect: '3' },
  { group: 'Calculator', name: '3.5!', run: () => calc('3.5!'), expect: 'ERR:factint' },
  { group: 'Calculator', name: 'Ans continues after =', run: () => keys(['6', '×', '7', '=', '+', '1', '=']).join(', '), expect: '42, 43' },
  { group: 'Calculator', name: 'digit after = starts fresh', run: () => keys(['6', '×', '7', '=', '5', '=']).join(', '), expect: '42, 5' },
  { group: 'Calculator', name: 'sin(60) exact', run: () => keys([...splitTokens('sin(60)'), '=', 'SD']).pop(), expect: '√3/2' },

  // ---------- 25.2 Solve engine ----------
  { group: 'Solve', name: 'solve(2x+3=11)', run: () => solve('solve(2x+3=11)'), expect: 'x = 4' },
  { group: 'Solve', name: 'solve(x^2-7x+10=0)', run: () => solve('solve(x^2-7x+10=0)'), expect: 'x = 2, x = 5' },
  { group: 'Solve', name: 'solve(x^2+1=0) real', run: () => solve('solve(x^2+1=0)'), expect: 'No real solutions' },
  { group: 'Solve', name: 'solve(x^2+1=0) complex', run: () => solve('solve(x^2+1=0)', { complex: true }), expect: (a) => a.includes('i') && a.includes('−i') },
  { group: 'Solve', name: 'solve(2x+y=7, x-y=2)', run: () => solve('solve(2x+y=7, x-y=2)'), expect: 'x = 3, y = 1' },
  { group: 'Solve', name: 'solve(3x-4>8)', run: () => solve('solve(3x-4>8)'), expect: 'x > 4' },
  { group: 'Solve', name: 'diff(x^3,x)', run: () => solve('diff(x^3,x)'), expect: '3x^2' },
  { group: 'Solve', name: 'diff(sin(x)^2,x)', run: () => solve('diff(sin(x)^2,x)'), expect: (a) => a === '2sin(x) cos(x)' || a === 'sin(2x)' },
  { group: 'Solve', name: 'diff(e^(2x),x)', run: () => solve('diff(e^(2x),x)'), expect: '2e^(2x)' },
  { group: 'Solve', name: 'integrate(x^3,0,2)', run: () => solve('integrate(x^3,0,2)'), expect: '4' },
  { group: 'Solve', name: 'integrate(e^x,x)', run: () => solve('integrate(e^x,x)'), expect: 'e^x + C' },
  { group: 'Solve', name: 'integrate(sin(x),0,pi)', run: () => solve('integrate(sin(x),0,pi)'), expect: '2' },
  { group: 'Solve', name: 'limit(sin(x)/x,x,0)', run: () => solve('limit(sin(x)/x,x,0)'), expect: '1' },
  { group: 'Solve', name: 'limit(1/x,x,0)', run: () => { const r = run('limit(1/x,x,0)'); return r.ok ? `${r.exact.text} (${r.note.params.left}, ${r.note.params.right})` : 'ERR'; }, expect: 'Does not exist (-\\infty, \\infty)' },
  { group: 'Solve', name: 'factor(x^2-9)', run: () => solve('factor(x^2-9)'), expect: '(x − 3)(x + 3)' },
  { group: 'Solve', name: 'expand((x+2)^3)', run: () => solve('expand((x+2)^3)'), expect: 'x^3 + 6x^2 + 12x + 8' },
  { group: 'Solve', name: 'gcd(84,36)', run: () => solve('gcd(84,36)'), expect: '12' },
  { group: 'Solve', name: 'lcm(4,6)', run: () => solve('lcm(4,6)'), expect: '12' },
  { group: 'Solve', name: 'factorint(360)', run: () => solve('factorint(360)'), expect: '2^3 × 3^2 × 5' },
  { group: 'Solve', name: 'sum(k^2,k,1,10)', run: () => solve('sum(k^2,k,1,10)'), expect: '385' },
  { group: 'Solve', name: 'det([[2,0],[0,5]])', run: () => solve('det([[2,0],[0,5]])'), expect: '10' },
  { group: 'Solve', name: 'inv([[1,2],[3,4]])', run: () => solve('inv([[1,2],[3,4]])'), expect: '[[−2, 1], [3/2, −1/2]] | [[−2, 1], [1.5, −0.5]]' },
  { group: 'Solve', name: 'e^(i·pi)+1', run: () => solve('e^(i·pi)+1'), expect: '0' },
  { group: 'Solve', name: 'D-06: solve(...)+99 is an error', run: () => solve('solve(x^2-5x+6=0)+99'), expect: 'ERR:nested' },
  { group: 'Solve', name: '"derivative of x squared"', run: () => solve('derivative of x squared'), expect: '2x' },
  { group: 'Solve', name: '"what is 15% of 240"', run: () => solve('what is 15% of 240'), expect: '36' },
  { group: 'Solve', name: '"integrate x^2 from 0 to 3"', run: () => solve('integrate x^2 from 0 to 3'), expect: '9' },
  { group: 'Solve', name: '"limit of sin x / x as x approaches 0"', run: () => solve('limit of sin x / x as x approaches 0'), expect: '1' },
  { group: 'Solve', name: '"Taylor series of e^x to 5 terms"', run: () => solve('Taylor series of e^x to 5 terms'), expect: 'x^4/24 + x^3/6 + x^2/2 + x + 1' },
  { group: 'Solve', name: '"sum of k squared from 1 to 10"', run: () => solve('sum of k squared from 1 to 10'), expect: '385' },
  { group: 'Solve', name: '"mean of 2, 4, 6, 8"', run: () => solve('mean of 2, 4, 6, 8'), expect: '5' },
  { group: 'Solve', name: '"sine(30)" suggests sin', run: () => { const r = run('sine(30)'); return r.ok ? 'ok' : `${r.error.code}:${r.error.info.suggestion}`; }, expect: 'unknownfn:sin' },
  { group: 'Solve', name: 'solve(sin(x)=1/2) in DEG', run: () => solve('solve(sin(x)=1/2)', { angle: 'deg' }), expect: 'x = 30°, x = 150°' },
  { group: 'Solve', name: 'quadratic with surds', run: () => solve('solve(x^2+4x+1=0)'), expect: (a) => a.startsWith('x = −2 − √3, x = −2 + √3') },
  { group: 'Solve', name: 'limit((1+1/n)^n, n, ∞)', run: () => solve('limit((1+1/n)^n, n, Infinity)'), expect: (a) => a.startsWith('e |') },

  // ---------- 25.3 Tools ----------
  { group: 'Tools', name: 'Stats [2,4,4,4,5,5,7,9]', run: () => { const p = describe([2, 4, 4, 4, 5, 5, 7, 9], null, { sample: false }); const s = describe([2, 4, 4, 4, 5, 5, 7, 9]); return `mean ${p.mean}, median ${p.median}, mode ${p.modes.join()}, σ ${p.sd}, s ${s.sd.toFixed(3)}`; }, expect: 'mean 5, median 4.5, mode 4, σ 2, s 2.138' },
  { group: 'Tools', name: 'Stats [7]', run: () => { const s = describe([7]); return `mean ${s.mean}, sd ${Number.isNaN(s.sd) ? 'needs 2 values' : s.sd}`; }, expect: 'mean 7, sd needs 2 values' },
  { group: 'Tools', name: 'Loan 100,000 at 12% for 12 months', run: () => { const a = amortisation(100000, 12, 12); return `${money(a.payment)} / ${money(a.total)} / ${money(a.interest)}`; }, expect: '8884.88 / 106618.55 / 6618.55' },
  { group: 'Tools', name: 'Loan 2,500,000 at 18% for 60 months', run: () => money(emi(2500000, 18, 60)), expect: '63483.57' },
  { group: 'Tools', name: 'Loan 12,000 at 0% for 12 months', run: () => money(emi(12000, 0, 12)), expect: '1000.00' },
  { group: 'Tools', name: 'Savings 100,000 at 10% monthly, 5 years', run: () => money(savings(100000, 0, 10, 5, 12).balance), expect: '164530.89' },
  { group: 'Tools', name: '100 °C → °F', run: () => String(+convert('temperature', 100, '°C', '°F').toFixed(10)), expect: '212' },
  { group: 'Tools', name: '1 mi → km', run: () => String(+convert('length', 1, 'mi', 'km').toPrecision(12)), expect: '1.609344' },
  { group: 'Tools', name: '1 GiB → MiB', run: () => String(convert('data', 1, 'GiB', 'MiB')), expect: '1024' },
  { group: 'Tools', name: '1 GB → MB', run: () => String(convert('data', 1, 'GB', 'MB')), expect: '1000' },
  { group: 'Tools', name: '−5 as 8-bit two’s complement', run: () => twosComplement(-5n, 8), expect: '11111011' },
  { group: 'Tools', name: '0.1 in binary repeats', run: () => toBase('0.1', 2).text, expect: '0.0(0011)' },
  { group: 'Tools', name: 'Triangle SSS 3, 4, 5', run: () => { const t = solveTriangle({ a: 3, b: 4, c: 5 }).triangles[0]; return `${t.A.toFixed(2)}°, ${t.B.toFixed(2)}°, ${t.C.toFixed(2)}°, area ${+t.area.toFixed(10)}`; }, expect: '36.87°, 53.13°, 90.00°, area 6' },
  { group: 'Tools', name: 'Triangle SSA gives two triangles', run: () => String(solveTriangle({ a: 6, b: 8, A: 35 }).triangles.length), expect: '2' },
  { group: 'Tools', name: 'Matrix [[1,2],[2,4]] inverse', run: () => { try { M.inverse(M.of([[1, 2], [2, 4]])); return 'inverse found'; } catch (e) { return e instanceof MathError ? e.code : 'error'; } }, expect: 'singular' },
  { group: 'Tools', name: 'Molar mass H2SO4', run: () => molarMass('H2SO4').total.toFixed(3), expect: '98.072' },
  { group: 'Tools', name: 'Molar mass CuSO4·5H2O', run: () => `${molarMass('CuSO4·5H2O').total.toFixed(2)} (1 d.p. masses: ${molarMass('CuSO4·5H2O', true).total.toFixed(1)})`, expect: '249.68 (1 d.p. masses: 249.6)' },
  { group: 'Tools', name: 'SUVAT u=0, a=9.8, t=2', run: () => { const r = suvat({ u: 0, a: 9.8, t: 2 }).solutions[0]; return `v ${r.v.toFixed(1)}, s ${r.s.toFixed(1)}`; }, expect: 'v 19.6, s 19.6' },
];

// Runs every case; returns [{group, name, pass, actual, expected}]
export async function runAll() {
  const out = [];
  for (const c of cases) {
    let actual;
    try { actual = await c.run(); } catch (e) { actual = `THREW ${e && e.message}`; }
    const pass = typeof c.expect === 'function' ? !!c.expect(actual) : actual === c.expect;
    out.push({ group: c.group, name: c.name, pass, actual, expected: typeof c.expect === 'function' ? '(rule)' : c.expect });
  }
  return out;
}
export { near };
