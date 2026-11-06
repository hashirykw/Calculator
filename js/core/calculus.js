// Limits (direct substitution, L'Hôpital's rule, rational functions at
// infinity, then two-sided numeric checks) and Taylor series.

import { Rat, MathError } from './rational.js';
import * as Y from './sym.js';
import { differentiate } from './diff.js';
import { Steps } from '../steps.js';

const { N, S, add, mul, pow, toTex, NEG1, Sy } = Y;

const isInf = (a) => a && a.k === 's' && a.n === 'oo';

// Exact value at a point, or null if undefined/not finite.
function at(e, x, a) {
  try {
    const v = S(Y.subst(e, x, a));
    const n = Y.constValue(v);
    if (n === null || !Number.isFinite(n)) return null;
    return { exact: v, value: n };
  } catch { return null; }
}

// Numeric one-sided behaviour near a (or at ±infinity).
function sideValues(fc, a, side) {
  const vals = [];
  if (a === Infinity || a === -Infinity) {
    for (const t of [1e2, 1e3, 1e4, 1e5, 1e6, 1e7]) vals.push(fc(a > 0 ? t : -t));
  } else {
    for (const h of [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7]) vals.push(fc(a + side * h * Math.max(1, Math.abs(a))));
  }
  return vals;
}
function classify(vals) {
  const fin = vals.filter(Number.isFinite);
  if (fin.length < 4) return { kind: 'unknown' };
  const last = fin.slice(-3);
  // growing without bound: large, same sign, and at least 3x bigger each step
  const grows = last.every((v, i) => i === 0 || Math.abs(v) >= 3 * Math.abs(last[i - 1]));
  if (grows && last.every((v) => v > 1e4)) return { kind: 'inf', sign: 1 };
  if (grows && last.every((v) => v < -1e4)) return { kind: 'inf', sign: -1 };
  // decaying to zero (e.g. e^-x): tiny and not growing
  if (last.every((v) => Math.abs(v) < 1e-12) && Math.abs(last[2]) <= Math.abs(last[0])) return { kind: 'finite', value: 0, zero: true };
  const spread = Math.max(...last) - Math.min(...last);
  if (spread <= 1e-4 * Math.max(1, Math.abs(last[2]))) return { kind: 'finite', value: last[2] };
  return { kind: 'unknown' };
}

export function limit(expr, x, a, steps = new Steps(), side = 0, depth = 0) {
  const f = S(expr);
  if (depth > 3) throw new MathError('cantsolve', { what: 'limit' });
  // f^g with both depending on x: lim f^g = e^(lim g ln f)
  if (f.k === '^' && !Y.isFree(f.b, x) && !Y.isFree(f.e, x)) {
    const inner = limit(S(Y.mul(f.e, Y.fn('ln', f.b))), x, a, new Steps(), side, depth + 1);
    if (inner.kind === 'finite' && inner.exact) {
      const v = S(pow(Y.E, inner.exact));
      steps.add('lhopital', `\lim ${toTex(f)} = e^{\lim ${toTex(S(Y.mul(f.e, Y.fn('ln', f.b))))}} = ${toTex(v)}`);
      return { kind: 'finite', exact: v, value: Y.constValue(v) };
    }
  }
  const fc = Y.compileSym(f, [x]);
  const aNum = isInf(a) ? Infinity : (a.k === '*' && isInf(a.f[1]) && a.f[0].v.isNeg ? -Infinity : Y.constValue(a));
  if (aNum === null) throw new MathError('cantsolve', { what: 'limit' });
  const aInf = !Number.isFinite(aNum);

  // numeric picture of both sides (used to check every symbolic answer)
  const right = side < 0 ? null : classify(sideValues(fc, aNum, 1));
  const left = aInf ? right : side > 0 ? null : classify(sideValues(fc, aNum, -1));
  const agreesWith = (v) => {
    const chk = (s) => !s || (s.kind === 'finite' && Math.abs(s.value - v) <= 1e-4 * Math.max(1, Math.abs(v)));
    return chk(right) && chk(left) && (right || left);
  };

  if (!aInf) {
    // 1. direct substitution
    const d = at(f, x, a);
    if (d && agreesWith(d.value)) {
      steps.add('direct', `\\lim_{${x}\\to ${toTex(a)}} ${toTex(f)} = ${toTex(d.exact)}`);
      return { kind: 'finite', exact: d.exact, value: d.value };
    }
    // 2. L'Hôpital on 0/0
    let { num, den } = Y.numDen(f);
    if (Y.isOne(den) && f.k === '+') ({ num, den } = Y.together(f));
    for (let k = 0; k < 4 && !Y.isOne(den); k++) {
      const nv = at(num, x, a), dv = at(den, x, a);
      if (!(nv && dv && Math.abs(nv.value) < 1e-12 && Math.abs(dv.value) < 1e-12)) break;
      if (k === 0) steps.add('direct', `\\frac{${toTex(num)}}{${toTex(den)}}\\ \\to\\ \\frac{0}{0}`);
      num = differentiate(num, x, new Steps(), { log: false }).result;
      den = differentiate(den, x, new Steps(), { log: false }).result;
      steps.add('lhopital', `\\lim_{${x}\\to ${toTex(a)}} \\frac{${toTex(num)}}{${toTex(den)}}`);
      const q = at(S(Y.mul(num, pow(den, NEG1))), x, a);
      if (q && agreesWith(q.value)) {
        steps.add('direct', `= ${toTex(q.exact)}`);
        return { kind: 'finite', exact: q.exact, value: q.value };
      }
    }
  } else {
    // rational function at infinity: compare leading terms
    const { num, den } = Y.together(f);
    const pn = Y.polyRat(num, x), pd = Y.polyRat(Y.expand(den), x);
    if (pn && pd) {
      const dn = pn.length - 1, dd = pd.length - 1;
      const ln = pn[dn], ld = pd[dd];
      if (dn < dd) { steps.add('direct', `\\deg(\\text{top}) < \\deg(\\text{bottom})\\ \\Rightarrow\\ 0`); return { kind: 'finite', exact: Y.ZERO, value: 0 }; }
      if (dn === dd) {
        const r = ln.div(ld);
        steps.add('direct', `\\text{leading terms: } \\frac{${toTex(N(ln))}}{${toTex(N(ld))}} = ${toTex(N(r))}`);
        return { kind: 'finite', exact: N(r), value: r.toNumber() };
      }
      const sign = ln.div(ld).sign * (aNum < 0 && (dn - dd) % 2 ? -1 : 1);
      return { kind: 'inf', sign };
    }
    // otherwise substitute x = 1/t (or -1/t) and let t -> 0+
    const t = Y.contains(f, 't') ? 'τ' : 't';
    const g = S(Y.subst(f, x, pow(aNum > 0 ? Sy(t) : Y.mul(NEG1, Sy(t)), NEG1)));
    try {
      const r = limit(g, t, Y.ZERO, new Steps(), 1, depth + 1);
      if (r.kind === 'finite' && r.exact) {
        steps.add('substitute', `${x} = \frac{1}{${t}},\ ${t}\to 0^{+}:\quad \lim_{${t}\to 0^{+}} ${toTex(g)} = ${toTex(r.exact)}`);
        return r;
      }
    } catch { /* fall through to numeric */ }
  }

  // 3. numeric conclusion
  if (side !== 0) {
    const one = side > 0 ? right : left;
    if (one.kind === 'finite' && one.zero) return { kind: 'finite', exact: Y.ZERO, value: 0 };
    if (one.kind === 'finite') return { kind: 'finite', exact: null, value: one.value, numeric: true };
    if (one.kind === 'inf') return { kind: 'inf', sign: one.sign };
    throw new MathError('cantsolve', { what: 'limit' });
  }
  if (right.kind === 'inf' && left.kind === 'inf') {
    if (right.sign === left.sign) return { kind: 'inf', sign: right.sign };
    steps.add('numeric', '', { what: 'limit' });
    return { kind: 'dne', left: left.sign < 0 ? '-\\infty' : '\\infty', right: right.sign < 0 ? '-\\infty' : '\\infty' };
  }
  if (right.kind === 'finite' && left.kind === 'finite') {
    if (Math.abs(right.value - left.value) > 1e-4 * Math.max(1, Math.abs(right.value))) {
      steps.add('numeric', '', { what: 'limit' });
      return { kind: 'dne', left: left.value, right: right.value };
    }
    steps.add('numeric', '', { what: 'limit' });
    return { kind: 'finite', exact: null, value: (left.value + right.value) / 2, numeric: true };
  }
  if (right.kind !== left.kind && right.kind !== 'unknown' && left.kind !== 'unknown') {
    steps.add('numeric', '', { what: 'limit' });
    return { kind: 'dne', left: left.kind === 'inf' ? (left.sign < 0 ? '-\\infty' : '\\infty') : left.value, right: right.kind === 'inf' ? (right.sign < 0 ? '-\\infty' : '\\infty') : right.value };
  }
  throw new MathError('cantsolve', { what: 'limit' });
}

// Taylor polynomial of order n about a.
export function taylor(expr, x, a, n, steps = new Steps()) {
  if (n > 12) throw new MathError('toolarge');
  let d = S(expr);
  const X = Sy(x);
  const terms = [];
  let fact = Rat.ONE;
  for (let k = 0; k <= n; k++) {
    if (k > 0) {
      d = differentiate(d, x, new Steps(), { log: false }).result;
      fact = fact.mul(k);
    }
    const v = at(d, x, a);
    if (!v) throw new MathError('cantsolve', { what: 'taylor' });
    steps.add('evaluate', `f^{(${k})}(${toTex(a)}) = ${toTex(v.exact)}`, { k });
    if (Y.isZero(v.exact)) continue;
    const shift = Y.isZero(a) ? X : add(X, mul(NEG1, a));
    terms.push(S(mul(v.exact, N(fact.inv()), k === 0 ? Y.ONE : pow(shift, N(k)))));
  }
  return S(add(terms.length ? terms : [Y.ZERO]));
}
