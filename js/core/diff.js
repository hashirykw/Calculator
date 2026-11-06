// Symbolic differentiation with traced steps. Walks the expression tree and
// records the rule used at each node (sum, constant multiple, product,
// quotient, power, chain, exponential, logarithm, trig), top-down.

import { MathError, Rat } from './rational.js';
import * as Y from './sym.js';
import { Steps } from '../steps.js';

const { N, ONE, ZERO, NEG1, TWO, HALF, S, mul, add, pow, fn, isFree, toTex } = Y;

const dd = (x) => `\\dfrac{d}{d${x}}`;
const wrap = (e) => `\\left[${toTex(e)}\\right]`;

// Derivative of the outer function f at u (without the chain factor).
function outer(name, u) {
  switch (name) {
    case 'sin': return fn('cos', u);
    case 'cos': return mul(NEG1, fn('sin', u));
    case 'tan': return pow(fn('sec', u), TWO);
    case 'sec': return mul(fn('sec', u), fn('tan', u));
    case 'csc': return mul(NEG1, fn('csc', u), fn('cot', u));
    case 'cot': return mul(NEG1, pow(fn('csc', u), TWO));
    case 'asin': return pow(add(ONE, mul(NEG1, pow(u, TWO))), N(new Rat(-1n, 2n)));
    case 'acos': return mul(NEG1, pow(add(ONE, mul(NEG1, pow(u, TWO))), N(new Rat(-1n, 2n))));
    case 'atan': return pow(add(ONE, pow(u, TWO)), NEG1);
    case 'sinh': return fn('cosh', u);
    case 'cosh': return fn('sinh', u);
    case 'tanh': return pow(fn('cosh', u), N(-2));
    case 'asinh': return pow(add(pow(u, TWO), ONE), N(new Rat(-1n, 2n)));
    case 'acosh': return pow(add(pow(u, TWO), NEG1), N(new Rat(-1n, 2n)));
    case 'atanh': return pow(add(ONE, mul(NEG1, pow(u, TWO))), NEG1);
    case 'ln': return pow(u, NEG1);
    case 'log': return pow(mul(u, fn('ln', N(10))), NEG1);
    case 'abs': return mul(u, pow(fn('abs', u), NEG1));
    default: throw new MathError('nodiff', { fn: name });
  }
}
const RULE_OF = {
  sin: 'trig', cos: 'trig', tan: 'trig', sec: 'trig', csc: 'trig', cot: 'trig',
  asin: 'invtrig', acos: 'invtrig', atan: 'invtrig', sinh: 'hyp', cosh: 'hyp', tanh: 'hyp',
  asinh: 'hyp', acosh: 'hyp', atanh: 'hyp', ln: 'log', log: 'log', abs: 'abs',
};

export function differentiate(expr, x = 'x', steps = new Steps(), opts = {}) {
  const maxDepth = opts.maxDepth ?? 6;
  const log = opts.log !== false;
  const dx = (e, depth) => d(Y.S(e), depth);

  function d(e, depth) {
    const loud = log && depth <= maxDepth;
    if (isFree(e, x)) {
      if (loud && depth === 0) steps.add('constant', `${dd(x)}${wrap(e)} = 0`);
      return ZERO;
    }
    switch (e.k) {
      case 's': return ONE;
      case '+': {
        const i = loud ? steps.add('sum', '') : -1;
        const parts = e.t.map((t) => dx(t, depth + 1));
        const r = S(add(parts));
        if (i >= 0) steps.set(i, `${dd(x)}${wrap(e)} = ${e.t.map((t) => `${dd(x)}${wrap(t)}`).join(' + ')} = ${toTex(r)}`);
        return r;
      }
      case '*': {
        const free = e.f.filter((f) => isFree(f, x));
        const dep = e.f.filter((f) => !isFree(f, x));
        if (free.length) {
          const c = S(mul(free));
          const u = S(mul(dep));
          const i = loud ? steps.add('constmul', '') : -1;
          const du = dx(u, depth + 1);
          const r = S(mul(c, du));
          if (i >= 0) steps.set(i, `${dd(x)}${wrap(e)} = ${toTex(c, 2)}\\cdot ${dd(x)}${wrap(u)} = ${toTex(r)}`);
          return r;
        }
        const numF = dep.filter((f) => !(f.k === '^' && Y.isNum(f.e) && f.e.v.isNeg));
        const denF = dep.filter((f) => f.k === '^' && Y.isNum(f.e) && f.e.v.isNeg).map((f) => S(pow(f.b, N(f.e.v.neg()))));
        if (numF.length && denF.length) {
          const u = S(mul(numF)), v = S(mul(denF));
          const i = loud ? steps.add('quotient', '') : -1;
          const du = dx(u, depth + 1), dv = dx(v, depth + 1);
          const r = S(mul(add(mul(du, v), mul(NEG1, u, dv)), pow(v, N(-2))));
          if (i >= 0) {
            steps.set(i, `${dd(x)}\\left[\\frac{${toTex(u)}}{${toTex(v)}}\\right] = \\frac{(${toTex(du)})(${toTex(v)}) - (${toTex(u)})(${toTex(dv)})}{\\left(${toTex(v)}\\right)^{2}}`);
          }
          return r;
        }
        const u = dep[0], v = S(mul(dep.slice(1)));
        const i = loud ? steps.add('product', '') : -1;
        const du = dx(u, depth + 1), dv = dx(v, depth + 1);
        const r = S(add(mul(du, v), mul(u, dv)));
        if (i >= 0) {
          steps.set(i, `${dd(x)}${wrap(e)} = ${dd(x)}${wrap(u)}\\cdot ${toTex(v, 2)} + ${toTex(u, 2)}\\cdot ${dd(x)}${wrap(v)} = ${toTex(r)}`);
        }
        return r;
      }
      case '^': {
        const { b, e: ex } = e;
        const bDep = !isFree(b, x), eDep = !isFree(ex, x);
        if (bDep && !eDep) {
          const isX = b.k === 's' && b.n === x;
          const outerD = S(mul(ex, pow(b, add(ex, NEG1))));
          if (isX) {
            if (loud) steps.add('power', `${dd(x)}${wrap(e)} = ${toTex(outerD)}`);
            return outerD;
          }
          const i = loud ? steps.add('chain', '', { outer: 'power' }) : -1;
          const db = dx(b, depth + 1);
          const r = S(mul(outerD, db));
          if (i >= 0) steps.set(i, `${dd(x)}${wrap(e)} = ${toTex(outerD, 2)}\\cdot ${dd(x)}${wrap(b)} = ${toTex(r)}`);
          return r;
        }
        if (!bDep && eDep) {
          const isE = b.k === 's' && b.n === 'e';
          const lnb = isE ? ONE : fn('ln', b);
          const i = loud ? steps.add('exp', '') : -1;
          const de = dx(ex, depth + 1);
          const r = S(mul(e, lnb, de));
          if (i >= 0) {
            const mid = isE ? `${toTex(e)}\\cdot ${dd(x)}${wrap(ex)}` : `${toTex(e)}\\ln ${toTex(b, 2)}\\cdot ${dd(x)}${wrap(ex)}`;
            steps.set(i, `${dd(x)}${wrap(e)} = ${mid} = ${toTex(r)}`);
          }
          return r;
        }
        // u^v: d = u^v (v' ln u + v u'/u)
        const i = loud ? steps.add('genpow', '') : -1;
        const du = dx(b, depth + 1), dv = dx(ex, depth + 1);
        const r = S(mul(e, add(mul(dv, fn('ln', b)), mul(ex, du, pow(b, NEG1)))));
        if (i >= 0) steps.set(i, `${dd(x)}${wrap(e)} = ${toTex(e)}\\left(${toTex(ex, 2)}'\\ln ${toTex(b, 2)} + \\frac{${toTex(ex, 2)}\\,${toTex(b, 2)}'}{${toTex(b)}}\\right) = ${toTex(r)}`);
        return r;
      }
      case 'f': {
        if (e.a.length !== 1) throw new MathError('nodiff', { fn: e.n });
        const u = e.a[0];
        const o = outer(e.n, u);
        const rule = RULE_OF[e.n] || 'chain';
        if (u.k === 's' && u.n === x) {
          const r = S(o);
          if (loud) steps.add(rule, `${dd(x)}${wrap(e)} = ${toTex(r)}`);
          return r;
        }
        const i = loud ? steps.add('chain', '', { outer: rule }) : -1;
        const du = dx(u, depth + 1);
        const r = S(mul(o, du));
        if (i >= 0) steps.set(i, `${dd(x)}${wrap(e)} = ${toTex(S(o), 2)}\\cdot ${dd(x)}${wrap(u)} = ${toTex(r)}`);
        return r;
      }
      default: throw new MathError('nodiff');
    }
  }

  const e0 = Y.S(expr);
  const result = d(e0, 0);
  return { result: tidy(result), steps };
}

// Pick the neatest of several equivalent forms (shortest text).
export function tidy(e) {
  const cands = [S(e)];
  try { cands.push(Y.expand(e)); } catch { /* too big */ }
  try {
    const { num, den } = Y.together(e);
    if (!Y.isOne(den)) {
      const fnum = Y.factorUni(num, [...Y.symbols(num)][0] || 'x') || num;
      cands.push(S(mul(fnum, pow(den, NEG1))));
    }
  } catch { /* not rational */ }
  let best = cands[0], bestLen = Y.toText(best).length;
  for (const c of cands.slice(1)) {
    const l = Y.toText(c).length;
    if (l < bestLen) { best = c; bestLen = l; }
  }
  return best;
}

export { HALF };
