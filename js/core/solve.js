// Equation, system and inequality solving with traced steps.
// Exact where the maths allows it (linear, quadratic, rational roots, surds,
// isolation of inverse functions); otherwise numeric roots, labelled as such.

import { Rat, MathError } from './rational.js';
import * as Y from './sym.js';
import { M } from './matrix.js';
import { findRoots, polyRootsNumeric } from './numeric.js';
import { Steps } from '../steps.js';

const { N, S, add, mul, pow, fn, toTex, ZERO, ONE, NEG1, HALF, TWO, Sy, isNum } = Y;
const T = (e, c) => toTex(e, c);
const TRIG = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot']);
const INV_TRIG = new Set(['asin', 'acos', 'atan']);

// ---------- helpers ----------

// Write p + q·√r (rationals p, q; square-free r) with a shared denominator.
function surdTex(p, q, r, pm = false) {
  const rad = r === 1n ? '' : `\\sqrt{${r}}`;
  const l = (p.d * q.d) / gcdB(p.d, q.d);
  const P = p.mul(l).n, Q = q.mul(l).n;
  const qAbs = Q < 0n ? -Q : Q;
  const qStr = (qAbs === 1n && rad ? '' : qAbs.toString()) + rad;
  const sign = pm ? '\\pm' : (Q < 0n ? '-' : '+');
  const top = P === 0n ? `${pm ? '\\pm ' : (Q < 0n ? '-' : '')}${qStr}` : `${P} ${sign} ${qStr}`;
  return l === 1n ? top : `\\frac{${top}}{${l}}`;
}
function gcdB(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }

function squareFree(n) {
  let s = 1n, r = 1n, m = n;
  for (let p = 2n; p * p <= m && p < 1000000n; p++) {
    let c = 0;
    while (m % p === 0n) { m /= p; c++; }
    if (c) { s *= p ** BigInt(c >> 1); if (c & 1) r *= p; }
  }
  return { s, r: r * m };
}

const val = (e, env = {}) => Y.evalF(e, env);
const sol = (exact, value, extra = {}) => ({ exact, value, ...extra });

// Real roots of a rational polynomial: exact where possible, else numeric.
export function polyRoots(c, x, steps, opts = {}) {
  c = Y.P.trim(c);
  const deg = c.length - 1;
  const out = [];
  const complex = [];
  if (deg < 1) return { real: out, complex };
  const { roots, rest } = Y.rationalRoots(c);
  const seen = new Set();
  for (const r of roots) { const k = r.toString(); if (!seen.has(k)) { seen.add(k); out.push(sol(N(r), r.toNumber())); } }
  const rd = Y.P.deg(rest);
  if (rd === 2) {
    const q = quadraticRoots(rest[2], rest[1], rest[0]);
    out.push(...q.real);
    complex.push(...q.complex);
  } else if (rd === 1) {
    const r = rest[0].neg().div(rest[1]);
    out.push(sol(N(r), r.toNumber()));
  } else if (rd > 2) {
    const z = polyRootsNumeric(rest.map((v) => v.toNumber()));
    for (const w of z) {
      if (w.im === 0) out.push(sol(null, w.re, { numeric: true }));
      else complex.push(sol(null, w.re, { im: w.im, numeric: true }));
    }
    if (steps) steps.add('numeric', '', { what: 'poly' });
  }
  out.sort((a, b) => a.value - b.value);
  return { real: out, complex, rationalCount: roots.length };
}

function quadraticRoots(a, b, c) {
  const D = b.mul(b).sub(a.mul(c).mul(4));
  const p = b.neg().div(a.mul(2));
  const real = [], complex = [];
  if (D.isZero) { real.push(sol(N(p), p.toNumber())); return { real, complex, D }; }
  const neg = D.isNeg;
  const Dabs = D.abs();
  // √(n/d) = √(n d)/d
  const { s, r } = squareFree(Dabs.n * Dabs.d);
  const q = new Rat(s, Dabs.d).div(a.mul(2)).abs();
  const rootSym = r === 1n ? N(Rat.ONE) : Y.sqrt(N(r));
  const qv = q.toNumber() * Math.sqrt(Number(r));
  if (!neg) {
    for (const sg of [-1, 1]) {
      const e = S(add(N(p), mul(N(q.mul(sg)), rootSym)));
      real.push(sol(e, p.toNumber() + sg * qv, { tex: surdTex(p, q.mul(sg), r) }));
    }
    real.sort((u, v) => u.value - v.value);
  } else {
    for (const sg of [1, -1]) {
      const im = S(mul(N(q.mul(sg)), rootSym));
      complex.push(sol(S(add(N(p), mul(im, Y.I))), p.toNumber(), { im: sg * qv }));
    }
  }
  return { real, complex, D, p, q, r };
}

// Express e with x measured in degrees (or grads) for trig equations.
function angleAdjust(e, x, unit) {
  if (unit === 'rad') return e;
  const k = unit === 'deg' ? N(new Rat(1n, 180n)) : N(new Rat(1n, 200n));
  const walk = (n) => {
    switch (n.k) {
      case '+': return { k: '+', t: n.t.map(walk) };
      case '*': return { k: '*', f: n.f.map(walk) };
      case '^': return { k: '^', b: walk(n.b), e: walk(n.e) };
      case 'f':
        // every angle is in the chosen unit, including constant ones like sin(20)
        if (TRIG.has(n.n)) return fn(n.n, mul(walk(n.a[0]), Y.PI, k));
        if (INV_TRIG.has(n.n)) return mul(fn(n.n, walk(n.a[0])), pow(mul(Y.PI, k), NEG1));
        return { k: 'f', n: n.n, a: n.a.map(walk) };
      default: return n;
    }
  };
  return walk(e);
}
const hasTrig = (e) => {
  if (e.k === 'f') return TRIG.has(e.n) || INV_TRIG.has(e.n) || e.a.some(hasTrig);
  if (e.k === '+') return e.t.some(hasTrig);
  if (e.k === '*') return e.f.some(hasTrig);
  if (e.k === '^') return hasTrig(e.b) || hasTrig(e.e);
  return false;
};

function countVar(e, x) {
  switch (e.k) {
    case 's': return e.n === x ? 1 : 0;
    case '+': return e.t.reduce((s, t) => s + countVar(t, x), 0);
    case '*': return e.f.reduce((s, t) => s + countVar(t, x), 0);
    case '^': return countVar(e.b, x) + countVar(e.e, x);
    case 'f': return e.a.reduce((s, t) => s + countVar(t, x), 0);
    default: return 0;
  }
}

// ---------- single equation ----------

export function solveEquation(lhs, rhs, x = 'x', opts = {}, steps = new Steps()) {
  const unit = opts.angle || 'rad';
  const trig = hasTrig(lhs) || hasTrig(rhs);
  const L0 = S(lhs), R0 = S(rhs);
  let f = S(add(L0, mul(NEG1, R0)));
  if (trig && unit !== 'rad') f = S(angleAdjust(f, x, unit));
  const result = { solutions: [], complex: [], kind: 'none', steps, var: x, unit: trig ? unit : null, fx: f };

  if (Y.isFree(f, x)) {
    result.kind = Y.isZero(f) ? 'identity' : 'nosolution';
    return result;
  }

  const { num, den } = Y.together(f);
  const denHasX = !Y.isFree(den, x);
  const excluded = (s) => denHasX && Math.abs(val(den, { [x]: s.value })) < 1e-12;

  // 1. polynomial with rational coefficients
  const c = Y.polyRat(num, x);
  if (c) {
    if (denHasX) steps.add('rearrange', `${T(num)} = 0`, { why: 'multiply' });
    const deg = c.length - 1;
    if (deg === 1) linearSteps(L0, R0, c, x, steps, result, denHasX);
    else if (deg === 2) quadraticSteps(L0, R0, c, x, steps, result, opts, denHasX);
    else higherSteps(num, c, x, steps, result, opts);
    const dropped = result.solutions.filter(excluded);
    if (dropped.length) {
      result.solutions = result.solutions.filter((s) => !excluded(s));
      result.excluded = dropped;
    }
    return result;
  }

  // 2. polynomial with symbolic coefficients (rearranging a formula)
  const cs = Y.polyCoeffs(num, x);
  if (cs && cs.length <= 3 && cs.length >= 2 && cs.every((k) => Y.isFree(k, x))) {
    if (cs.length === 2) {
      const r = S(mul(NEG1, cs[0], pow(cs[1], NEG1)));
      steps.add('collect', `${T(S(mul(cs[1], Sy(x))), 1)} = ${T(S(mul(NEG1, cs[0])))}`);
      steps.add('divide', `${x} = ${T(r)}`);
      result.kind = 'rearranged';
      result.solutions.push(sol(r, NaN, { symbolic: true }));
      return result;
    }
    if (Y.isZero(cs[1])) {
      const r = S(pow(mul(NEG1, cs[0], pow(cs[2], NEG1)), HALF));
      steps.add('collect', `${T(S(mul(cs[2], pow(Sy(x), TWO))), 1)} = ${T(S(mul(NEG1, cs[0])))}`);
      steps.add('rearrange', `${x} = \\pm ${T(r)}`);
      result.kind = 'rearranged';
      result.solutions.push(sol(r, NaN, { symbolic: true, pm: true }));
      return result;
    }
  }

  // 3. isolate x when it appears once
  if (countVar(f, x) === 1) {
    const iso = isolate(f, x, steps, opts, trig ? unit : 'rad');
    if (iso) {
      result.kind = iso.periodic ? 'trig' : 'isolated';
      result.solutions = iso.solutions.filter((s) => Number.isFinite(s.value) && !excluded(s));
      result.general = iso.general;
      return result;
    }
  }

  // 4. numeric fallback
  return numericSolve(f, x, steps, result, opts, trig ? unit : 'rad');
}

function numericSolve(f, x, steps, result, opts, unit) {
  const fc = Y.compileSym(f, [x]);
  let lo = -100, hi = 100;
  if (opts.range) [lo, hi] = opts.range;
  else if (unit === 'deg') { lo = 0; hi = 360; }
  else if (unit === 'grad') { lo = 0; hi = 400; }
  else if (hasTrig(f)) { lo = 0; hi = 2 * Math.PI; }
  const roots = findRoots((t) => fc(t), lo, hi, 4000);
  steps.add('numeric', '', { lo, hi });
  result.kind = 'numeric';
  result.range = [lo, hi];
  result.solutions = roots.map((r) => sol(null, r, { numeric: true }));
  return result;
}

function linearSteps(L0, R0, c, x, steps, result, denHasX) {
  const X = Sy(x);
  const a = c[1], b = c[0];
  const r = b.neg().div(a);
  if (!denHasX) {
    const pl = Y.polyRat(L0, x), pr = Y.polyRat(R0, x);
    if (pl && pr) {
      const lx = pl[1] || Rat.ZERO, l0 = pl[0], rx = pr[1] || Rat.ZERO, r0 = pr[0];
      const needCollect = !(rx.isZero && l0.isZero);
      if (needCollect) steps.add('collect', `${T(S(mul(N(a), X)), 1)} = ${T(N(r0))} ${l0.isNeg ? '+' : '-'} ${T(N(l0.abs()), 2)} = ${T(N(b.neg()))}`);
      void lx;
    } else {
      steps.add('collect', `${T(S(mul(N(a), X)), 1)} = ${T(N(b.neg()))}`);
    }
  } else {
    steps.add('collect', `${T(S(mul(N(a), X)), 1)} = ${T(N(b.neg()))}`);
  }
  if (!a.eq(Rat.ONE)) steps.add('divide', `${x} = \\frac{${T(N(b.neg()))}}{${T(N(a))}} = ${T(N(r))}`, { by: T(N(a)) });
  result.kind = 'linear';
  result.solutions.push(sol(N(r), r.toNumber()));
  if (!denHasX) checkStep(L0, R0, x, N(r), steps);
}

function checkStep(L0, R0, x, v, steps) {
  try {
    const shown = Sy(`(${toTex(v)})`);
    const lt = T(Y.subst(L0, x, shown)), rt = T(Y.subst(R0, x, shown));
    const lv = S(Y.subst(L0, x, v)), rv = S(Y.subst(R0, x, v));
    if (Y.same(lv, rv)) steps.add('check', `${lt} = ${T(lv)}${Y.isFree(R0, x) ? '' : `,\\quad ${rt} = ${T(rv)}`}\\ \\checkmark`);
  } catch { /* checking is a courtesy */ }
}

function quadraticSteps(L0, R0, c, x, steps, result, opts, denHasX) {
  const X = Sy(x);
  const [cc, b, a] = c;
  const std = S(add(mul(N(a), pow(X, TWO)), mul(N(b), X), N(cc)));
  const isStd = Y.isZero(S(R0)) && Y.same(S(L0), std);
  if (!isStd && !denHasX) steps.add('rearrange', `${T(std)} = 0`);
  result.kind = 'quadratic';
  const { roots } = Y.rationalRoots(c);
  if (roots.length === 2 || (roots.length === 1 && Y.P.evalRat(Y.P.deriv(c), roots[0]).isZero)) {
    const fac = Y.factorUni(std, x);
    if (fac) {
      steps.add('factorise', `${T(fac)} = 0`);
      const lin = (fac.f || [fac]).filter((g) => !isNum(g));
      steps.add('zeroproduct', lin.map((g) => `${T(g.k === '^' ? g.b : g)} = 0`).join('\\quad\\text{or}\\quad '));
    }
    const uniq = [...new Map(roots.map((r) => [r.toString(), r])).values()].sort((p, q) => p.cmp(q));
    result.solutions = uniq.map((r) => sol(N(r), r.toNumber()));
    if (uniq.length === 1) result.repeated = true;
    return;
  }
  const q = quadraticRoots(a, b, cc);
  steps.add('discriminant', `\\Delta = b^{2} - 4ac = ${T(N(b), 3)}^{2} - 4${T(N(a), 3)}${T(N(cc), 3)} = ${T(N(q.D))}`, { sign: q.D.sign });
  if (q.D.isNeg) {
    result.noReal = true;
    if (opts.complex) {
      steps.add('quadformula', `${x} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = ${surdTex(q.p, q.q, q.r, true).replace(/\\sqrt\{(\d+)\}/, '\\sqrt{$1}\\,i').replace(/(\\pm |\\pm )(\d*)$/, '$1$2 i')}`);
      result.complex = q.complex;
    }
    return;
  }
  steps.add('quadformula', `${x} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = \\frac{${T(N(b.neg()))} \\pm \\sqrt{${T(N(q.D))}}}{${T(N(a.mul(2)))}} = ${surdTex(q.p, q.q, q.r, true)}`);
  result.solutions = q.real;
}

function higherSteps(num, c, x, steps, result, opts) {
  result.kind = 'polynomial';
  const fac = Y.factorUni(num, x);
  const { real, complex, rationalCount } = polyRoots(c, x, null, opts);
  if (rationalCount) steps.add('rationalroots', '', { count: rationalCount });
  if (fac) steps.add('factorise', `${T(fac)} = 0`);
  if (real.some((r) => r.numeric) || complex.some((r) => r.numeric)) steps.add('numeric', '', { what: 'poly' });
  result.solutions = real;
  if (opts.complex) result.complex = complex;
  else if (complex.length) result.someComplex = complex.length;
}

// Undo one operation at a time until x is alone. Returns {solutions, general?}.
function isolate(f, x, steps, opts, unit) {
  let branches = [{ L: f, R: ZERO }];
  let periodic = false;
  let general = null;
  for (let guard = 0; guard < 30; guard++) {
    const next = [];
    let done = true;
    for (const { L, R } of branches) {
      if (L.k === 's' && L.n === x) { next.push({ L, R }); continue; }
      done = false;
      const out = unwrap(L, R, x, opts, unit);
      if (!out) return null;
      if (out.periodic) { periodic = true; general = out.general; }
      for (const br of out.branches) next.push(br);
    }
    branches = next;
    if (done) break;
  }
  const sols = [];
  const seen = new Set();
  for (const { L, R } of branches) {
    if (!(L.k === 's' && L.n === x)) return null;
    const v = val(R);
    if (!Number.isFinite(v)) continue;
    const key = v.toFixed(10);
    if (seen.has(key)) continue;
    seen.add(key);
    sols.push(sol(S(R), v));
  }
  sols.sort((a, b) => a.value - b.value);
  steps.add('roots', sols.map((s) => `${x} = ${T(s.exact)}`).join(',\\quad ') || '\\text{—}');
  return { solutions: sols, periodic, general };

  function unwrap(L, R, xv, o, un) {
    const XX = Sy(xv);
    if (L.k === '+') {
      const dep = L.t.filter((t) => !Y.isFree(t, xv)), free = L.t.filter((t) => Y.isFree(t, xv));
      const R2 = S(add(R, mul(NEG1, add(free))));
      steps.add('isolate', `${T(dep[0])} = ${T(R2)}`);
      return { branches: [{ L: dep[0], R: R2 }] };
    }
    if (L.k === '*') {
      const dep = L.f.filter((t) => !Y.isFree(t, xv)), free = L.f.filter((t) => Y.isFree(t, xv));
      const R2 = S(mul(R, pow(mul(free), NEG1)));
      steps.add('divide', `${T(dep[0])} = ${T(R2)}`);
      return { branches: [{ L: dep[0], R: R2 }] };
    }
    if (L.k === '^') {
      if (!Y.isFree(L.b, xv)) {
        const k = L.e;
        if (isNum(k) && k.v.isInt && k.v.n % 2n === 0n) {
          const rv = val(R);
          if (rv < 0) return { branches: [] };
          const root = S(pow(R, pow(k, NEG1)));
          steps.add('inverse', `${T(L.b)} = \\pm ${T(root)}`, { fn: 'root' });
          return { branches: [{ L: L.b, R: root }, { L: L.b, R: S(mul(NEG1, root)) }] };
        }
        if (isNum(k) && !k.v.isInt && k.v.d % 2n === 0n && val(R) < 0) return { branches: [] };
        const R2 = S(pow(R, pow(k, NEG1)));
        steps.add('inverse', `${T(L.b)} = ${T(R2)}`, { fn: 'root' });
        return { branches: [{ L: L.b, R: R2 }] };
      }
      // b^u = R  ->  u = ln R / ln b
      if (val(R) <= 0) return { branches: [] };
      const isE = L.b.k === 's' && L.b.n === 'e';
      const R2 = S(isE ? fn('ln', R) : mul(fn('ln', R), pow(fn('ln', L.b), NEG1)));
      steps.add('inverse', `${T(L.e)} = ${T(R2)}`, { fn: 'log' });
      return { branches: [{ L: L.e, R: R2 }] };
    }
    if (L.k === 'f') {
      const u = L.a[0];
      const rv = val(R);
      switch (L.n) {
        case 'ln': { const R2 = S(pow(Y.E, R)); steps.add('inverse', `${T(u)} = ${T(R2)}`, { fn: 'exp' }); return { branches: [{ L: u, R: R2 }] }; }
        case 'log': { const R2 = S(pow(N(10), R)); steps.add('inverse', `${T(u)} = ${T(R2)}`, { fn: 'exp' }); return { branches: [{ L: u, R: R2 }] }; }
        case 'abs': {
          if (rv < 0) return { branches: [] };
          steps.add('inverse', `${T(u)} = \\pm ${T(R)}`, { fn: 'abs' });
          return { branches: [{ L: u, R }, { L: u, R: S(mul(NEG1, R)) }] };
        }
        case 'asin': case 'acos': case 'atan': {
          const back = { asin: 'sin', acos: 'cos', atan: 'tan' }[L.n];
          const R2 = S(fn(back, R));
          steps.add('inverse', `${T(u)} = ${T(R2)}`, { fn: back });
          return { branches: [{ L: u, R: R2 }] };
        }
        case 'sin': case 'cos': case 'tan': {
          if (!Number.isFinite(rv)) return null;
          if ((L.n === 'sin' || L.n === 'cos') && Math.abs(rv) > 1 + 1e-12) {
            steps.add('inverse', '', { fn: L.n, outOfRange: true });
            return { branches: [], periodic: true };
          }
          const lin = Y.polyCoeffs(u, xv);
          if (!lin || lin.length !== 2 || !Y.isFree(lin[1], xv)) return null;
          const [b0, a1] = lin;
          const alpha = S(fn(L.n === 'sin' ? 'asin' : L.n === 'cos' ? 'acos' : 'atan', R));
          const period = L.n === 'tan' ? Y.PI : S(mul(TWO, Y.PI));
          const fams = L.n === 'sin' ? [alpha, S(add(Y.PI, mul(NEG1, alpha)))] : L.n === 'cos' ? [alpha, S(mul(NEG1, alpha))] : [alpha];
          const span = un === 'deg' ? 360 : un === 'grad' ? 400 : 2 * Math.PI;
          const a1v = val(a1), b0v = val(b0);
          const out = [];
          for (const th of fams) {
            for (let k = -50; k <= 50; k++) {
              const inner = S(add(th, mul(N(k), period)));
              const xs = S(mul(add(inner, mul(NEG1, b0)), pow(a1, NEG1)));
              const v = (val(inner) - b0v) / a1v;
              if (v >= -1e-9 && v < span - 1e-9) out.push({ L: XX, R: xs });
            }
          }
          steps.add('inverse', `${T(u)} = ${T(alpha)}${fams.length > 1 ? `\\ \\text{or}\\ ${T(fams[1])}` : ''}\\ (+${L.n === 'tan' ? '\\pi' : '2\\pi'}k)`, { fn: L.n, periodic: true });
          const gen = fams.map((th) => S(Y.expand(S(mul(add(th, mul(Sy('k'), period), mul(NEG1, b0)), pow(a1, NEG1))))));
          return { branches: out, periodic: true, general: gen };
        }
        default: return null;
      }
    }
    return null;
  }
}

// ---------- systems ----------

export function solveSystem(eqs, vars, opts = {}, steps = new Steps()) {
  const fs = eqs.map(({ lhs, rhs }) => Y.expand(S(add(lhs, mul(NEG1, rhs)))));
  const result = { kind: 'system', vars, steps, solutions: [] };
  // linear?
  const lin = fs.map((f) => linearRow(f, vars));
  if (lin.every(Boolean) && fs.length >= 2) return linearSystem(lin, vars, steps, result);
  if (fs.length === 2 && vars.length === 2) return substitutionSystem(fs, vars, opts, steps, result);
  throw new MathError('cantsolve', { what: 'system' });
}

function linearRow(f, vars) {
  const terms = f.k === '+' ? f.t : [f];
  const coef = vars.map(() => Rat.ZERO);
  let k = Rat.ZERO;
  for (const t of terms) {
    const [c, rest] = Y.splitCoef(t);
    if (Y.isOne(rest)) { k = k.add(c); continue; }
    const i = rest.k === 's' ? vars.indexOf(rest.n) : -1;
    if (i < 0) return null;
    coef[i] = coef[i].add(c);
  }
  return { coef, rhs: k.neg() };
}

function eqTex(coef, rhs, vars) {
  const lhs = S(add(coef.map((c, i) => mul(N(c), Sy(vars[i])))));
  return `${T(lhs)} = ${T(N(rhs))}`;
}

function linearSystem(rows, vars, steps, result) {
  const n = vars.length;
  rows.forEach((r, i) => steps.add('note', `(${i + 1})\\quad ${eqTex(r.coef, r.rhs, vars)}`, { eq: i + 1 }));
  if (rows.length === 2 && n === 2) {
    const [[a1, b1], [a2, b2]] = rows.map((r) => r.coef);
    const [c1, c2] = rows.map((r) => r.rhs);
    // eliminate the second variable
    const m1 = b2, m2 = b1;
    const A = a1.mul(m1).sub(a2.mul(m2)), C = c1.mul(m1).sub(c2.mul(m2));
    if (!A.isZero) {
      const how = m1.eq(Rat.ONE) && m2.eq(Rat.ONE) ? '(1) - (2)' : m1.eq(m2.neg()) ? '' : `${T(N(m1), 3)}\\times(1) - ${T(N(m2), 3)}\\times(2)`;
      const simpleAdd = b1.add(b2).isZero;
      steps.add('eliminate', `${simpleAdd ? '(1) + (2)' : how}:\\quad ${T(S(mul(N(simpleAdd ? a1.add(a2) : A), Sy(vars[0]))))} = ${T(N(simpleAdd ? c1.add(c2) : C))}`, { v: vars[1] });
      const xv = C.div(A);
      steps.add('divide', `${vars[0]} = ${T(N(xv))}`);
      if (!b1.isZero || !b2.isZero) {
        const [bb, aa, cc] = !b1.isZero ? [b1, a1, c1] : [b2, a2, c2];
        const yv = cc.sub(aa.mul(xv)).div(bb);
        steps.add('backsub', `${T(S(add(mul(N(aa), Sy(`(${T(N(xv))})`)), mul(N(bb), Sy(vars[1])))))} = ${T(N(cc))}\\ \\Rightarrow\\ ${vars[1]} = ${T(N(yv))}`);
        result.solutions = [{ [vars[0]]: N(xv), [vars[1]]: N(yv) }];
        return result;
      }
    }
  }
  const A = rows.map((r) => r.coef), b = rows.map((r) => r.rhs);
  const s = M.solve(A, b);
  if (s.kind === 'none') { result.kind = 'inconsistent'; steps.add('eliminate', '', { none: true }); return result; }
  if (s.kind === 'infinite') { result.kind = 'dependent'; steps.add('eliminate', '', { infinite: true }); return result; }
  steps.add('eliminate', vars.map((v, i) => `${v} = ${T(N(s.x[i]))}`).join(',\\quad '), { gauss: true });
  result.solutions = [Object.fromEntries(vars.map((v, i) => [v, N(s.x[i])]))];
  return result;
}

function substitutionSystem(fs, vars, opts, steps, result) {
  // find an equation that is linear in one variable with a constant coefficient
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const v = vars[j], other = vars[1 - j];
      const c = Y.polyCoeffs(fs[i], v);
      if (!c || c.length !== 2 || !isNum(c[1]) || Y.isZero(c[1])) continue;
      const expr = S(mul(NEG1, c[0], pow(c[1], NEG1)));
      if (!Y.isFree(expr, v)) continue;
      steps.add('rearrange', `${v} = ${T(expr)}`, { from: i + 1 });
      const g = S(Y.subst(fs[1 - i], v, expr));
      steps.add('substitute', `${T(Y.expand(g))} = 0`, { into: 2 - i });
      const inner = solveEquation(g, ZERO, other, opts, steps);
      const out = [];
      for (const s of inner.solutions) {
        if (!s.exact) continue;
        const vv = S(Y.subst(expr, other, s.exact));
        out.push({ [other]: s.exact, [v]: vv });
      }
      if (inner.solutions.length && out.length) {
        steps.add('backsub', out.map((o) => `(${vars.map((n) => `${n} = ${T(o[n])}`).join(',\\ ')})`).join(',\\quad '));
      }
      result.solutions = out;
      if (!out.length) result.kind = 'nosolution';
      return result;
    }
  }
  throw new MathError('cantsolve', { what: 'system' });
}

// ---------- inequalities ----------

export function solveInequality(op, lhs, rhs, x = 'x', opts = {}, steps = new Steps()) {
  const f = S(add(lhs, mul(NEG1, rhs)));
  const { num, den } = Y.together(f);
  const cn = Y.polyRat(num, x), cd = Y.polyRat(Y.expand(den), x);
  if (!cn || !cd) throw new MathError('cantsolve', { what: 'inequality' });
  const strict = op === '<' || op === '>';
  const wantPos = op === '>' || op === '>=';
  const result = { kind: 'inequality', var: x, steps, intervals: [] };

  // Linear with constant denominator: show the classic steps.
  if (cn.length === 2 && cd.length === 1) {
    const a = cn[1].div(cd[0]), b = cn[0].div(cd[0]);
    const flipOp = (o) => ({ '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[o]);
    const texOp = (o) => ({ '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' }[o]);
    steps.add('collect', `${T(S(mul(N(a), Sy(x))))} ${texOp(op)} ${T(N(b.neg()))}`);
    const r = b.neg().div(a);
    const finalOp = a.isNeg ? flipOp(op) : op;
    steps.add(a.isNeg ? 'flip' : 'divide', `${x} ${texOp(finalOp)} ${T(N(r))}`);
    const incl = !strict;
    result.intervals = finalOp === '>' || finalOp === '>=' ? [{ lo: N(r), loIncl: incl, hi: null }] : [{ lo: null, hi: N(r), hiIncl: incl }];
    return result;
  }

  const nr = polyRoots(cn, x).real, dr = cd.length > 1 ? polyRoots(cd, x).real : [];
  const crit = [...nr.map((r) => ({ ...r, zero: true })), ...dr.map((r) => ({ ...r, pole: true }))].sort((a, b) => a.value - b.value);
  steps.add('criticalpoints', crit.map((c) => `${x} = ${c.exact ? T(c.exact) : c.value.toPrecision(6)}`).join(',\\ ') || '\\text{none}');
  const fx = (t) => P_eval(cn, t) / P_eval(cd, t);
  const pts = crit.map((c) => c.value);
  const tests = [];
  if (!pts.length) tests.push(0);
  else {
    tests.push(pts[0] - 1);
    for (let i = 0; i < pts.length - 1; i++) tests.push((pts[i] + pts[i + 1]) / 2);
    tests.push(pts[pts.length - 1] + 1);
  }
  const good = tests.map((t) => { const v = fx(t); return wantPos ? v > 0 : v < 0; });
  steps.add('signchart', tests.map((t, i) => `${good[i] ? '\\checkmark' : '\\times'}`).join('\\ '));
  // merge intervals
  const iv = [];
  for (let i = 0; i < tests.length; i++) {
    if (!good[i]) continue;
    const lo = i === 0 ? null : crit[i - 1], hi = i === crit.length ? null : crit[i];
    iv.push({ lo: lo ? (lo.exact || N(Rat.parse(lo.value.toPrecision(12)))) : null, loIncl: !!(lo && lo.zero && !strict), loV: lo ? lo.value : -Infinity,
      hi: hi ? (hi.exact || N(Rat.parse(hi.value.toPrecision(12)))) : null, hiIncl: !!(hi && hi.zero && !strict), hiV: hi ? hi.value : Infinity });
  }
  // join neighbours that share an included endpoint (e.g. x <= 1 and x >= 1)
  const merged = [];
  for (const it of iv) {
    const last = merged[merged.length - 1];
    if (last && last.hiV === it.loV && (last.hiIncl || it.loIncl)) { last.hi = it.hi; last.hiIncl = it.hiIncl; last.hiV = it.hiV; }
    else merged.push({ ...it });
  }
  // isolated included points (touching roots) for >= / <=
  if (!strict) {
    for (const c of crit) {
      if (!c.zero) continue;
      const inside = merged.some((m) => (m.loV < c.value || (m.loV === c.value && m.loIncl)) && (c.value < m.hiV || (c.value === m.hiV && m.hiIncl)));
      if (!inside) merged.push({ lo: c.exact, loIncl: true, hi: c.exact, hiIncl: true, loV: c.value, hiV: c.value, point: true });
    }
    merged.sort((a, b) => a.loV - b.loV);
  }
  result.intervals = merged;
  return result;
}
function P_eval(c, t) { let r = 0; for (let i = c.length - 1; i >= 0; i--) r = r * t + c[i].toNumber(); return r; }

// LaTeX for a set of intervals.
export function intervalsTex(iv, x = 'x') {
  if (!iv.length) return '\\text{no real solution}';
  const le = (inc) => (inc ? '\\le' : '<');
  return iv.map((it) => {
    if (it.point) return `${x} = ${T(it.lo)}`;
    if (!it.lo && !it.hi) return '\\text{all real } ' + x;
    if (!it.lo) return `${x} ${le(it.hiIncl)} ${T(it.hi)}`;
    if (!it.hi) return `${x} ${it.loIncl ? '\\ge' : '>'} ${T(it.lo)}`;
    return `${T(it.lo)} ${le(it.loIncl)} ${x} ${le(it.hiIncl)} ${T(it.hi)}`;
  }).join('\\quad\\text{or}\\quad ');
}
export function intervalsText(iv, x = 'x') {
  if (!iv.length) return 'no real solution';
  const le = (inc) => (inc ? '≤' : '<');
  return iv.map((it) => {
    if (it.point) return `${x} = ${Y.toText(it.lo)}`;
    if (!it.lo && !it.hi) return 'all real ' + x;
    if (!it.lo) return `${x} ${le(it.hiIncl)} ${Y.toText(it.hi)}`;
    if (!it.hi) return `${x} ${it.loIncl ? '≥' : '>'} ${Y.toText(it.lo)}`;
    return `${Y.toText(it.lo)} ${le(it.loIncl)} ${x} ${le(it.hiIncl)} ${Y.toText(it.hi)}`;
  }).join(' or ');
}
