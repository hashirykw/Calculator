// Symbolic expressions over exact rationals.
// Node kinds: {k:'n',v:Rat}  {k:'s',n:'x'}  {k:'+',t:[...]}  {k:'*',f:[...]}
//             {k:'^',b,e}    {k:'f',n:'sin',a:[...]}
// Subtraction is a + (-1)b and division is a·b^-1, so one simplifier handles
// all of them. Everything here is exact; floats only appear in evalF/compile.

import { Rat, MathError, gcdBig } from './rational.js';

// ---------- constructors ----------
export const N = (v) => ({ k: 'n', v: Rat.of(v) });
export const Sy = (n) => ({ k: 's', n });
export const ZERO = N(0), ONE = N(1), TWO = N(2), NEG1 = N(-1), HALF = N(new Rat(1n, 2n));
export const X = Sy('x');
export const PI = Sy('pi'), E = Sy('e'), I = Sy('i');
export const add = (...t) => ({ k: '+', t: t.flat() });
export const mul = (...f) => ({ k: '*', f: f.flat() });
export const pow = (b, e) => ({ k: '^', b, e: typeof e === 'number' || e instanceof Rat ? N(e) : e });
export const fn = (n, ...a) => ({ k: 'f', n, a: a.flat() });
export const neg = (a) => mul(NEG1, a);
export const sub = (a, b) => add(a, neg(b));
export const div = (a, b) => mul(a, pow(b, NEG1));
export const sqrt = (a) => pow(a, HALF);

export const isNum = (e) => e.k === 'n';
export const isInt = (e) => e.k === 'n' && e.v.isInt;
export const isZero = (e) => e.k === 'n' && e.v.isZero;
export const isOne = (e) => e.k === 'n' && e.v.eq(Rat.ONE);

// ---------- keys and ordering ----------
const keyCache = new WeakMap();
export function key(e) {
  let k = keyCache.get(e);
  if (k) return k;
  switch (e.k) {
    case 'n': k = `#${e.v}`; break;
    case 's': k = `$${e.n}`; break;
    case '+': k = `+(${e.t.map(key).join(',')})`; break;
    case '*': k = `*(${e.f.map(key).join(',')})`; break;
    case '^': k = `^(${key(e.b)},${key(e.e)})`; break;
    case 'f': k = `${e.n}(${e.a.map(key).join(',')})`; break;
    default: throw new Error('bad node');
  }
  keyCache.set(e, k);
  return k;
}
export const same = (a, b) => key(a) === key(b);

const RANK = { n: 0, s: 1, '^': 2, '*': 3, f: 4, '+': 5 };
function order(a, b) {
  const ra = rankOf(a), rb = rankOf(b);
  if (ra !== rb) return ra - rb;
  const ka = key(a), kb = key(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
function rankOf(e) {
  if (e.k === 's') return e.n === 'pi' || e.n === 'e' ? 0.5 : 1;
  if (e.k === '^') return rankOf(e.b);
  return RANK[e.k];
}

// ---------- queries ----------
export function contains(e, name) {
  switch (e.k) {
    case 'n': return false;
    case 's': return e.n === name;
    case '+': return e.t.some((t) => contains(t, name));
    case '*': return e.f.some((t) => contains(t, name));
    case '^': return contains(e.b, name) || contains(e.e, name);
    case 'f': return e.a.some((t) => contains(t, name));
    default: return false;
  }
}
export const isFree = (e, x) => !contains(e, x);
export function symbols(e, acc = new Set()) {
  switch (e.k) {
    case 's': if (!['pi', 'e', 'i'].includes(e.n)) acc.add(e.n); break;
    case '+': e.t.forEach((t) => symbols(t, acc)); break;
    case '*': e.f.forEach((t) => symbols(t, acc)); break;
    case '^': symbols(e.b, acc); symbols(e.e, acc); break;
    case 'f': e.a.forEach((t) => symbols(t, acc)); break;
    default: break;
  }
  return acc;
}

// ---------- simplification ----------
export function S(e) {
  switch (e.k) {
    case 'n': case 's': return e;
    case '+': return simpAdd(e.t.map(S));
    case '*': return simpMul(e.f.map(S));
    case '^': return simpPow(S(e.b), S(e.e));
    case 'f': return simpFn(e.n, e.a.map(S));
    default: throw new Error('bad node');
  }
}

export function splitCoef(t) {
  if (t.k === 'n') return [t.v, ONE];
  if (t.k === '*' && t.f[0].k === 'n') {
    const rest = t.f.slice(1);
    return [t.f[0].v, rest.length === 1 ? rest[0] : { k: '*', f: rest }];
  }
  return [Rat.ONE, t];
}

function simpAdd(terms) {
  const flat = [];
  for (const t of terms) { if (t.k === '+') flat.push(...t.t); else flat.push(t); }
  let c = Rat.ZERO;
  const groups = new Map();
  for (const t of flat) {
    if (t.k === 'n') { c = c.add(t.v); continue; }
    const [coef, rest] = splitCoef(t);
    const k = key(rest);
    const g = groups.get(k);
    if (g) g.coef = g.coef.add(coef); else groups.set(k, { coef, rest });
  }
  const out = [];
  for (const { coef, rest } of groups.values()) {
    if (coef.isZero) continue;
    out.push(coef.eq(Rat.ONE) ? rest : simpMul([N(coef), rest]));
  }
  // sin²u + cos²u = 1 (same coefficient)
  pythagorean(out, (k) => { c = c.add(k); });
  if (!c.isZero) out.push(N(c));
  if (!out.length) return ZERO;
  if (out.length === 1) return out[0];
  return { k: '+', t: out.sort(order) };
}

function pythagorean(terms, addConst) {
  for (let i = 0; i < terms.length; i++) {
    const [ci, ri] = splitCoef(terms[i]);
    if (!(ri.k === '^' && isNum(ri.e) && ri.e.v.eq(Rat.TWO) && ri.b.k === 'f' && ri.b.n === 'sin')) continue;
    for (let j = 0; j < terms.length; j++) {
      const [cj, rj] = splitCoef(terms[j]);
      if (rj.k === '^' && isNum(rj.e) && rj.e.v.eq(Rat.TWO) && rj.b.k === 'f' && rj.b.n === 'cos' &&
        same(rj.b.a[0], ri.b.a[0]) && ci.eq(cj)) {
        addConst(ci);
        terms.splice(Math.max(i, j), 1);
        terms.splice(Math.min(i, j), 1);
        return pythagorean(terms, addConst);
      }
    }
  }
}

function baseExp(f) {
  if (f.k === '^') return [f.b, f.e];
  return [f, ONE];
}

function simpMul(factors, depth = 0) {
  const flat = [];
  for (const f of factors) { if (f.k === '*') flat.push(...f.f); else flat.push(f); }
  let c = Rat.ONE;
  const groups = new Map();
  for (const f of flat) {
    if (f.k === 'n') { c = c.mul(f.v); continue; }
    const [b, e] = baseExp(f);
    const k = key(b);
    const g = groups.get(k);
    if (g) g.e.push(e); else groups.set(k, { b, e: [e] });
  }
  if (c.isZero) return ZERO;
  const out = [];
  let again = false;
  for (const { b, e } of groups.values()) {
    const ex = e.length === 1 ? e[0] : simpAdd(e);
    const p = e.length === 1 && flat.includes(b) ? b : simpPow(b, ex);
    if (p.k === 'n') { c = c.mul(p.v); continue; }
    if (p.k === '*') { again = true; out.push(...p.f); continue; }
    if (isOne(p)) continue;
    out.push(p);
  }
  if (again && depth < 4) return simpMul([N(c), ...out], depth + 1);
  if (c.isZero) return ZERO;
  if (!out.length) return N(c);
  out.sort(order);
  // distribute a numeric coefficient over a single sum: 2(x+1) stays factored,
  // but -(x - 1) becomes 1 - x so signs read naturally.
  if (out.length === 1 && c.eq(Rat.ONE)) return out[0];
  if (out.length === 1 && c.eq(Rat.NEG_ONE) && out[0].k === '+') return simpAdd(out[0].t.map((t) => simpMul([NEG1, t])));
  return { k: '*', f: c.eq(Rat.ONE) ? out : [N(c), ...out] };
}

// perfect-power extraction: n = s^q * r
function extractPower(n, q) {
  let s = 1n, r = 1n, m = n;
  for (let p = 2n; p * p <= m && p < 200000n; p += (p === 2n ? 1n : 2n)) {
    let c = 0;
    while (m % p === 0n) { m /= p; c++; }
    if (c) { s *= p ** BigInt(Math.floor(c / q)); r *= p ** BigInt(c % q); }
  }
  // leftover m is prime (or 1) unless it is a big composite we stopped on
  if (m > 1n) {
    const qb = BigInt(q);
    const root = BigInt(Math.round(Number(m) ** (1 / q)));
    if (root ** qb === m) s *= root; else r *= m;
  }
  return { s, r };
}

function simpPow(b, e) {
  if (isZero(e)) return ONE;
  if (isOne(e)) return b;
  if (b.k === 'n') {
    if (b.v.isZero) {
      if (e.k === 'n' && e.v.isNeg) throw new MathError('divzero');
      return e.k === 'n' ? ZERO : pow(b, e);
    }
    if (b.v.eq(Rat.ONE)) return ONE;
    if (e.k === 'n') {
      const ev = e.v;
      if (ev.isInt) {
        if (ev.abs().cmp(2000) > 0) return pow(b, e);
        return N(b.v.pow(ev.n));
      }
      return radical(b.v, ev);
    }
    return pow(b, e);
  }
  if (b.k === 's' && b.n === 'i' && isInt(e)) {
    const k = Number(((e.v.n % 4n) + 4n) % 4n);
    return [ONE, I, NEG1, mul(NEG1, I)][k];
  }
  if (b.k === '^') {
    // (u^a)^c = u^(ac) when c is an integer, or a is an integer and c makes it safe
    if (isInt(e) || (isInt(b.e) && b.e.v.n % 2n === 1n)) return simpPow(b.b, simpMul([b.e, e]));
    if (isNum(b.e) && isNum(e) && !b.e.v.isInt && b.e.v.n % 2n === 1n) return simpPow(b.b, simpMul([b.e, e]));
  }
  if (b.k === '*' && isInt(e)) return simpMul(b.f.map((f) => simpPow(f, e)));
  if (b.k === '*' && isNum(e) && b.f[0].k === 'n' && !b.f[0].v.isNeg) {
    // (4x)^(1/2) = 2 x^(1/2)
    const rest = b.f.slice(1);
    return simpMul([simpPow(b.f[0], e), simpPow(rest.length === 1 ? rest[0] : { k: '*', f: rest }, e)]);
  }
  if (b.k === 's' && b.n === 'e') {
    if (e.k === 'f' && e.n === 'ln') return e.a[0];
    if (e.k === '*') {
      const lnf = e.f.filter((f) => f.k === 'f' && f.n === 'ln');
      if (lnf.length === 1) {
        const rest = e.f.filter((f) => f !== lnf[0]);
        if (rest.every((f) => f.k === 'n')) return simpPow(lnf[0].a[0], simpMul(rest));
      }
    }
  }
  return pow(b, e);
}

// q^(p/r) with q rational: pull out perfect powers and rationalise.
function radical(q, ev) {
  const r = Number(ev.d);
  let p = ev.n;
  let base = q;
  if (base.isNeg) {
    if (r % 2 === 1) {
      const mag = radical(base.neg(), ev);
      return p % 2n === 0n ? mag : simpMul([NEG1, mag]);
    }
    return pow(N(base), N(ev));
  }
  if (p < 0n) { base = base.inv(); p = -p; }
  if (r > 12 || p > 12n) return pow(N(base), N(new Rat(p, BigInt(r))));
  const whole = p / BigInt(r);
  const rem = p % BigInt(r);
  const bp = base.pow(rem);
  // bp^(1/r) = (n * d^(r-1))^(1/r) / d
  const M = bp.n * bp.d ** BigInt(r - 1);
  const { s, r: rest } = extractPower(M, r);
  const coef = new Rat(s, bp.d).mul(base.pow(whole));
  if (rest === 1n) return N(coef);
  const g = gcdBig(BigInt(r), 1n);
  void g;
  const rad = pow(N(rest), N(new Rat(1n, BigInt(r))));
  return coef.eq(Rat.ONE) ? rad : { k: '*', f: [N(coef), rad] };
}

// n = b^k with k >= 2 and the smallest possible base b, else null.
function perfectPower(n) {
  for (let k = 40; k >= 2; k--) {
    const r = BigInt(Math.round(Number(n) ** (1 / k)));
    for (const c of [r - 1n, r, r + 1n]) {
      if (c > 1n && c ** BigInt(k) === n) {
        const deeper = perfectPower(c);
        return deeper ? { b: deeper.b, k: deeper.k * k } : { b: c, k };
      }
    }
  }
  return null;
}

// Multiple of pi: returns Rat q with e = q·π, or null.
export function piMultiple(e) {
  if (isZero(e)) return Rat.ZERO;
  if (e.k === 's' && e.n === 'pi') return Rat.ONE;
  if (e.k === '*' && e.f.length === 2 && e.f[0].k === 'n' && e.f[1].k === 's' && e.f[1].n === 'pi') return e.f[0].v;
  return null;
}

const SQ = (n, d = 1) => (d === 1 ? sqrt(N(n)) : mul(N(new Rat(1n, BigInt(d))), sqrt(N(n))));
// sin of multiples of 15° in the first quadrant (exact)
const SIN_TABLE = {
  0: ZERO, 30: HALF, 45: S(SQ(2, 2)), 60: S(SQ(3, 2)), 90: ONE,
};
function exactSin(deg) {
  // deg is a Rat; returns sym or null
  const d = ((deg.toNumber() % 360) + 360) % 360;
  if (!deg.isInt) return null;
  const quadrantSign = d <= 180 ? 1 : -1;
  let ref = d % 180;
  if (ref > 90) ref = 180 - ref;
  const v = SIN_TABLE[ref];
  if (!v) return null;
  return quadrantSign < 0 ? S(mul(NEG1, v)) : v;
}

function simpFn(name, args) {
  const a = args[0];
  switch (name) {
    case 'sin': case 'cos': case 'tan': case 'sec': case 'csc': case 'cot': {
      const q = piMultiple(a);
      if (q !== null) {
        const deg = q.mul(180);
        const sn = exactSin(deg), cs = exactSin(deg.add(90));
        if (sn && cs) {
          const pick = { sin: () => sn, cos: () => cs, tan: () => (isZero(cs) ? null : S(div(sn, cs))), cot: () => (isZero(sn) ? null : S(div(cs, sn))), sec: () => (isZero(cs) ? null : S(div(ONE, cs))), csc: () => (isZero(sn) ? null : S(div(ONE, sn))) }[name];
          const v = pick();
          if (v) return v;
          throw new MathError('undefined', { fn: name });
        }
      }
      // odd/even symmetry: sin(-u) = -sin(u), cos(-u) = cos(u)
      if (a.k === '*' && a.f[0].k === 'n' && a.f[0].v.isNeg) {
        const pos = simpMul([N(a.f[0].v.neg()), ...a.f.slice(1)]);
        if (name === 'cos' || name === 'sec') return fn(name, pos);
        return simpMul([NEG1, fn(name, pos)]);
      }
      return fn(name, a);
    }
    case 'asin': case 'acos': case 'atan': {
      const v = constValue(a);
      if (v !== null) {
        const tables = {
          asin: [[0, '0'], [0.5, '1/6'], [Math.SQRT1_2, '1/4'], [Math.sqrt(3) / 2, '1/3'], [1, '1/2']],
          acos: [[1, '0'], [Math.sqrt(3) / 2, '1/6'], [Math.SQRT1_2, '1/4'], [0.5, '1/3'], [0, '1/2'], [-0.5, '2/3'], [-Math.SQRT1_2, '3/4'], [-Math.sqrt(3) / 2, '5/6'], [-1, '1']],
          atan: [[0, '0'], [1 / Math.sqrt(3), '1/6'], [1, '1/4'], [Math.sqrt(3), '1/3']],
        };
        for (const [x, frac] of tables[name]) {
          if (Math.abs(v - x) < 1e-14) return S(mul(N(Rat.parse(frac)), PI));
          if (name !== 'acos' && x && Math.abs(v + x) < 1e-14) return S(mul(N(Rat.parse(frac).neg()), PI));
        }
      }
      return fn(name, a);
    }
    case 'ln': {
      if (isOne(a)) return ZERO;
      if (a.k === 's' && a.n === 'e') return ONE;
      if (a.k === '^' && a.b.k === 's' && a.b.n === 'e') return a.e;
      if (isZero(a)) throw new MathError('logzero');
      // ln(8) = 3 ln(2): write logs of perfect powers over the smallest base
      if (a.k === 'n' && a.v.isInt && a.v.n > 3n) {
        const pp = perfectPower(a.v.n);
        if (pp) return simpMul([N(pp.k), fn('ln', N(pp.b))]);
      }
      // ln(p/q) = ln p - ln q for positive fractions
      if (a.k === 'n' && !a.v.isInt && !a.v.isNeg) {
        return simpAdd([a.v.n === 1n ? ZERO : simpFn('ln', [N(a.v.n)]), simpMul([NEG1, simpFn('ln', [N(a.v.d)])])]);
      }
      return fn('ln', a);
    }
    case 'log': {
      if (isOne(a)) return ZERO;
      if (a.k === 'n' && a.v.isInt && a.v.n > 0n) {
        const s = a.v.n.toString();
        if (/^10*$/.test(s)) return N(s.length - 1);
      }
      return fn('log', a);
    }
    case 'abs': {
      if (a.k === 'n') return N(a.v.abs());
      const cv = constValue(a);
      if (cv !== null && cv !== 0) return cv > 0 ? a : simpMul([NEG1, a]);
      if (a.k === '*' && a.f[0].k === 'n' && a.f[0].v.isNeg) return simpMul([N(a.f[0].v.neg()), fn('abs', simpMul(a.f.slice(1)))]);
      if (a.k === '^' && a.b.k === 's' && a.b.n === 'e') return a;
      return fn('abs', a);
    }
    case 'fact': {
      if (a.k === 'n' && a.v.isInt && !a.v.isNeg && a.v.n <= 50n) {
        let r = 1n;
        for (let i = 2n; i <= a.v.n; i++) r *= i;
        return N(r);
      }
      return fn('fact', a);
    }
    default: return fn(name, ...args);
  }
}

// Numeric value of a constant expression (no variables), else null.
export function constValue(e) {
  if (symbols(e).size) return null;
  try {
    const v = evalF(e, {});
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

// ---------- expansion ----------
// Multiply two expanded expressions term by term (never regroups into powers).
function mulOut(a, b, limit) {
  const ta = a.k === '+' ? a.t : [a], tb = b.k === '+' ? b.t : [b];
  if (ta.length * tb.length > limit) throw new MathError('toocomplex');
  const out = [];
  for (const x of ta) for (const y of tb) out.push(simpMul([x, y]));
  return simpAdd(out);
}

export function expand(e, limit = 4000) {
  e = S(e);
  switch (e.k) {
    case '+': return S({ k: '+', t: e.t.map((t) => expand(t, limit)) });
    case '*': {
      let acc = ONE;
      for (const f0 of e.f) acc = mulOut(acc, expand(f0, limit), limit);
      return acc;
    }
    case '^': {
      const b = expand(e.b, limit);
      if (b.k === '+' && isInt(e.e) && !e.e.v.isNeg && e.e.v.n <= 30n) {
        let r = ONE;
        for (let i = 0n; i < e.e.v.n; i++) r = mulOut(r, b, limit);
        return r;
      }
      if (b.k === '*' && isInt(e.e)) return expand(simpMul(b.f.map((f) => simpPow(f, e.e))), limit);
      return simpPow(b, e.e);
    }
    default: return e;
  }
}

// ---------- substitution ----------
export function subst(e, name, val) {
  switch (e.k) {
    case 'n': return e;
    case 's': return e.n === name ? val : e;
    case '+': return { k: '+', t: e.t.map((t) => subst(t, name, val)) };
    case '*': return { k: '*', f: e.f.map((t) => subst(t, name, val)) };
    case '^': return { k: '^', b: subst(e.b, name, val), e: subst(e.e, name, val) };
    case 'f': return { k: 'f', n: e.n, a: e.a.map((t) => subst(t, name, val)) };
    default: return e;
  }
}

// ---------- polynomials ----------
// Degree of x in a single term, and the coefficient, or null if not polynomial.
function termDegree(t, x) {
  const [c, rest] = splitCoef(t);
  const factors = rest.k === '*' ? rest.f : [rest];
  let deg = 0;
  const coefF = [N(c)];
  for (const f of factors) {
    if (isOne(f)) continue;
    if (f.k === 's' && f.n === x) { deg += 1; continue; }
    if (f.k === '^' && f.b.k === 's' && f.b.n === x) {
      if (!isInt(f.e) || f.e.v.isNeg) return null;
      deg += Number(f.e.v.n);
      continue;
    }
    if (contains(f, x)) return null;
    coefF.push(f);
  }
  return { deg, coef: S({ k: '*', f: coefF }) };
}

// Coefficient list [c0, c1, ..., cn] (sym) of e in x, or null.
export function polyCoeffs(e, x) {
  const ex = expand(e);
  const terms = ex.k === '+' ? ex.t : [ex];
  const out = [];
  for (const t of terms) {
    const td = termDegree(t, x);
    if (!td) return null;
    while (out.length <= td.deg) out.push(ZERO);
    out[td.deg] = S(add(out[td.deg], td.coef));
  }
  while (out.length > 1 && isZero(out[out.length - 1])) out.pop();
  return out.length ? out : [ZERO];
}

// Rational coefficients only (or null).
export function polyRat(e, x) {
  const c = polyCoeffs(e, x);
  if (!c || !c.every(isNum)) return null;
  return c.map((t) => t.v);
}

export function fromPolyRat(c, x = 'x') {
  const terms = [];
  c.forEach((v, i) => {
    if (v.isZero) return;
    terms.push(i === 0 ? N(v) : S(mul(N(v), i === 1 ? Sy(x) : pow(Sy(x), N(i)))));
  });
  return S({ k: '+', t: terms.length ? terms : [ZERO] });
}

export const P = {
  trim(a) { a = a.slice(); while (a.length > 1 && a[a.length - 1].isZero) a.pop(); return a; },
  deg(a) { return P.trim(a).length - 1; },
  evalRat(a, x) { let r = Rat.ZERO; for (let i = a.length - 1; i >= 0; i--) r = r.mul(x).add(a[i]); return r; },
  evalF(a, x) { let r = 0; for (let i = a.length - 1; i >= 0; i--) r = r * x + a[i].toNumber(); return r; },
  divmod(a, b) {
    a = P.trim(a); b = P.trim(b);
    const q = Array(Math.max(1, a.length - b.length + 1)).fill(Rat.ZERO);
    let r = a.slice();
    const lb = b[b.length - 1];
    for (let i = a.length - b.length; i >= 0; i--) {
      const c = r[i + b.length - 1].div(lb);
      q[i] = c;
      for (let j = 0; j < b.length; j++) r[i + j] = r[i + j].sub(c.mul(b[j]));
    }
    r = P.trim(r.slice(0, Math.max(1, b.length - 1)));
    return { q: P.trim(q), r };
  },
  mul(a, b) {
    const out = Array(a.length + b.length - 1).fill(Rat.ZERO);
    a.forEach((x, i) => b.forEach((y, j) => { out[i + j] = out[i + j].add(x.mul(y)); }));
    return P.trim(out);
  },
  gcd(a, b) {
    a = P.trim(a); b = P.trim(b);
    while (!(b.length === 1 && b[0].isZero)) { const { r } = P.divmod(a, b); a = b; b = r; }
    const lc = a[a.length - 1];
    return a.map((c) => c.div(lc));
  },
  deriv(a) { return a.length <= 1 ? [Rat.ZERO] : a.slice(1).map((c, i) => c.mul(i + 1)); },
};

function divisors(n) {
  n = n < 0n ? -n : n;
  if (n === 0n) return [0n];
  if (n > 10n ** 14n) return null;
  const small = [], large = [];
  for (let d = 1n; d * d <= n; d++) {
    if (n % d === 0n) { small.push(d); if (d * d !== n) large.unshift(n / d); }
  }
  return [...small, ...large];
}

// Rational roots of a rational polynomial (with multiplicity), plus the leftover.
export function rationalRoots(c) {
  let a = P.trim(c);
  const roots = [];
  // make integer coefficients
  let l = 1n;
  for (const v of a) l = l / gcdBig(l, v.d) * v.d;
  let ints = a.map((v) => v.mul(new Rat(l)).n);
  // zero roots
  while (ints.length > 1 && ints[0] === 0n) { roots.push(Rat.ZERO); ints = ints.slice(1); a = a.slice(1); }
  if (ints.length <= 1) return { roots, rest: a };
  const ps = divisors(ints[0]), qs = divisors(ints[ints.length - 1]);
  if (!ps || !qs) return { roots, rest: a };
  const cands = [];
  for (const p of ps) for (const q of qs) { cands.push(new Rat(p, q)); cands.push(new Rat(-p, q)); }
  const seen = new Set();
  for (const r of cands) {
    const k = r.toString();
    if (seen.has(k)) continue;
    seen.add(k);
    while (a.length > 1 && P.evalRat(a, r).isZero) {
      roots.push(r);
      a = P.divmod(a, [r.neg(), Rat.ONE]).q;
    }
  }
  return { roots: roots.sort((x, y) => x.cmp(y)), rest: a };
}

// ---------- factorisation ----------
// Factor a polynomial in one variable over the rationals. Returns sym or null.
export function factorUni(e, x) {
  const c = polyRat(e, x);
  if (!c || c.length < 3) return null;
  // content and sign
  let l = 1n;
  for (const v of c) l = l / gcdBig(l, v.d) * v.d;
  let ints = c.map((v) => v.mul(new Rat(l)).n);
  let g = ints.reduce((acc, v) => gcdBig(acc, v), 0n);
  if (ints[ints.length - 1] < 0n) g = -g;
  const content = new Rat(g, l);
  let prim = ints.map((v) => new Rat(v / g));
  const factors = [];
  const { roots, rest } = rationalRoots(prim);
  // group linear factors with multiplicity; write as (q x - p)
  const mult = new Map();
  for (const r of roots) mult.set(r.toString(), { r, m: (mult.get(r.toString())?.m || 0) + 1 });
  let leftover = rest;
  for (const { r, m } of mult.values()) {
    const lin = r.isZero ? Sy(x) : S(add(mul(N(new Rat(r.d)), Sy(x)), N(new Rat(-r.n))));
    factors.push(m === 1 ? lin : pow(lin, N(m)));
    // compensate leading coefficient: (x - p/q) = (q x - p)/q
    leftover = leftover.map((v) => v.div(new Rat(r.d).pow(BigInt(m))));
  }
  leftover = P.trim(leftover);
  // biquadratic leftover: a x^4 + b x^2 + c with no odd terms
  let extra = null;
  if (P.deg(leftover) === 4 && leftover[1].isZero && leftover[3].isZero) {
    const inner = rationalRoots([leftover[0], leftover[2], leftover[4]]);
    if (inner.roots.length === 2) {
      const [r1, r2] = inner.roots;
      const lc = leftover[4];
      extra = [S(add(pow(Sy(x), N(2)), N(r1.neg()))), S(add(pow(Sy(x), N(2)), N(r2.neg())))];
      leftover = [lc];
    }
  }
  if (!factors.length && !extra) return null;
  const parts = [N(content.mul(leftover.length === 1 ? leftover[0] : Rat.ONE))];
  if (leftover.length > 1) parts.push(fromPolyRat(leftover, x));
  parts.push(...factors);
  if (extra) parts.push(...extra);
  return { k: '*', f: parts.filter((p) => !isOne(p)) };
}

// ---------- rational expressions ----------
// Split a product into numerator and denominator (positive powers).
export function numDen(e) {
  e = S(e);
  const fs = e.k === '*' ? e.f : [e];
  const num = [], den = [];
  for (const f of fs) {
    if (f.k === 'n') {
      if (f.v.n !== 1n) num.push(N(f.v.n));
      if (f.v.d !== 1n) den.push(N(f.v.d));
      continue;
    }
    if (f.k === '^' && isNum(f.e) && f.e.v.isNeg) { den.push(simpPow(f.b, N(f.e.v.neg()))); continue; }
    num.push(f);
  }
  return { num: num.length ? S({ k: '*', f: num }) : ONE, den: den.length ? S({ k: '*', f: den }) : ONE };
}

// Combine a sum into a single fraction {num, den}.
export function together(e) {
  e = S(e);
  const terms = e.k === '+' ? e.t : [e];
  const parts = terms.map(numDen);
  // LCD as a product of distinct denominator factors with max powers
  const lcd = new Map();
  for (const { den } of parts) {
    for (const f of (den.k === '*' ? den.f : [den])) {
      if (isOne(f)) continue;
      const [b, ex] = f.k === '^' && isNum(f.e) ? [f.b, f.e.v] : [f, Rat.ONE];
      const k = key(b);
      if (!lcd.has(k) || lcd.get(k).ex.cmp(ex) < 0) lcd.set(k, { b, ex });
    }
  }
  const lcdExpr = S({ k: '*', f: [ONE, ...[...lcd.values()].map(({ b, ex }) => simpPow(b, N(ex)))] });
  const numTerms = parts.map(({ num, den }) => S(mul(num, lcdExpr, pow(den, NEG1))));
  return { num: expand(S({ k: '+', t: numTerms })), den: lcdExpr };
}

// ---------- numeric evaluation (doubles) ----------
const FN_F = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh, ln: Math.log, log: Math.log10, abs: Math.abs,
  sign: Math.sign, floor: Math.floor, ceil: Math.ceil, fact: (n) => gammaFact(n), exp: Math.exp,
};
function gammaFact(n) {
  if (Number.isInteger(n) && n >= 0) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
  return NaN;
}
export function evalF(e, env) {
  switch (e.k) {
    case 'n': return e.v.toNumber();
    case 's':
      if (e.n in env) return env[e.n];
      if (e.n === 'pi') return Math.PI;
      if (e.n === 'e') return Math.E;
      return NaN;
    case '+': { let s = 0; for (const t of e.t) s += evalF(t, env); return s; }
    case '*': { let p = 1; for (const t of e.f) p *= evalF(t, env); return p; }
    case '^': return powF(evalF(e.b, env), e.e, env);
    case 'f': {
      const f = FN_F[e.n];
      if (!f) return NaN;
      return f(...e.a.map((a) => evalF(a, env)));
    }
    default: return NaN;
  }
}
function powF(b, eNode, env) {
  const ex = evalF(eNode, env);
  if (b < 0 && eNode.k === 'n' && !eNode.v.isInt && eNode.v.d % 2n === 1n) {
    const m = Math.pow(-b, ex);
    return eNode.v.n % 2n === 0n ? m : -m;
  }
  return Math.pow(b, ex);
}

// Compile to a fast closure (used for graphing results and verification).
export function compileSym(e, vars = ['x']) {
  const idx = Object.fromEntries(vars.map((v, i) => [v, i]));
  const build = (n) => {
    switch (n.k) {
      case 'n': { const v = n.v.toNumber(); return () => v; }
      case 's': {
        if (n.n in idx) { const i = idx[n.n]; return (a) => a[i]; }
        const v = n.n === 'pi' ? Math.PI : n.n === 'e' ? Math.E : NaN;
        return () => v;
      }
      case '+': { const fs = n.t.map(build); return (a) => { let s = 0; for (const f of fs) s += f(a); return s; }; }
      case '*': { const fs = n.f.map(build); return (a) => { let p = 1; for (const f of fs) p *= f(a); return p; }; }
      case '^': {
        const b = build(n.b), ex = build(n.e);
        if (n.e.k === 'n' && !n.e.v.isInt && n.e.v.d % 2n === 1n) {
          const evn = n.e.v.n % 2n === 0n, v = n.e.v.toNumber();
          return (a) => { const x = b(a); if (x >= 0) return Math.pow(x, v); const m = Math.pow(-x, v); return evn ? m : -m; };
        }
        if (n.e.k === 'n' && n.e.v.eq(Rat.TWO)) return (a) => { const x = b(a); return x * x; };
        return (a) => Math.pow(b(a), ex(a));
      }
      case 'f': {
        const f = FN_F[n.n] || (() => NaN);
        const args = n.a.map(build);
        if (args.length === 1) { const g = args[0]; return (a) => f(g(a)); }
        return (a) => f(...args.map((g) => g(a)));
      }
      default: return () => NaN;
    }
  };
  const f = build(e);
  return (...a) => f(a);
}

// ---------- conversion from the parser's tree ----------
export function fromAst(n, opts = {}) {
  const go = (m) => fromAst(m, opts);
  switch (n.type) {
    case 'num': return N(n.value);
    case 'group': return go(n.arg);
    case 'sym': {
      if (n.name === 'Infinity') return Sy('oo');
      if (opts.vars && n.name in opts.vars) return opts.vars[n.name];
      return Sy(n.name);
    }
    case 'neg': return mul(NEG1, go(n.arg));
    case 'post':
      if (n.op === '!') return fn('fact', go(n.arg));
      if (n.op === '%') return mul(go(n.arg), N(new Rat(1n, 100n)));
      return mul(go(n.arg), PI, N(new Rat(1n, 180n)));
    case 'op': {
      const [a, b] = n.args.map(go);
      switch (n.op) {
        case '+': return add(a, b);
        case '-': return add(a, mul(NEG1, b));
        case '*': return mul(a, b);
        case '/': return mul(a, pow(b, NEG1));
        case '^': return pow(a, b);
        default: throw new MathError('parse');
      }
    }
    case 'call': {
      const args = n.args.map(go);
      switch (n.name) {
        case 'sqrt': return pow(args[0], HALF);
        case 'cbrt': return pow(args[0], N(new Rat(1n, 3n)));
        case 'root': return pow(args[1], pow(args[0], NEG1));
        case 'exp': return pow(E, args[0]);
        case 'log': return args.length === 2 ? mul(fn('ln', args[1]), pow(fn('ln', args[0]), NEG1)) : fn('log', args[0]);
        case 'log2': return mul(fn('ln', args[0]), pow(fn('ln', N(2)), NEG1));
        case 'sin': case 'cos': case 'tan': case 'sec': case 'csc': case 'cot': case 'asin': case 'acos': case 'atan':
        case 'sinh': case 'cosh': case 'tanh': case 'asinh': case 'acosh': case 'atanh': case 'ln': case 'abs':
        case 'fact': case 'sign': case 'floor': case 'ceil':
          if (args.length !== 1) throw new MathError('argcount', { fn: n.name, n: 1 });
          return fn(n.name, args[0]);
        default: throw new MathError('notsym', { fn: n.name });
      }
    }
    case 'rel': throw new MathError('notsym', { what: 'relation' });
    case 'list': throw new MathError('notsym', { what: 'list' });
    default: throw new MathError('parse');
  }
}

// ---------- display: LaTeX and plain text ----------
const TEX_FN = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot',
  asin: '\\sin^{-1}', acos: '\\cos^{-1}', atan: '\\tan^{-1}', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  asinh: '\\sinh^{-1}', acosh: '\\cosh^{-1}', atanh: '\\tanh^{-1}', ln: '\\ln', log: '\\log',
};
const SYM_TEX = { pi: '\\pi', theta: '\\theta', alpha: '\\alpha', beta: '\\beta', lambda: '\\lambda', mu: '\\mu', sigma: '\\sigma', phi: '\\phi', omega: '\\omega', rho: '\\rho', oo: '\\infty', tau: '\\tau', delta: '\\delta', gamma: '\\gamma', epsilon: '\\varepsilon' };
const SYM_TXT = { pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', lambda: 'λ', mu: 'μ', sigma: 'σ', phi: 'φ', omega: 'ω', rho: 'ρ', oo: '∞', tau: 'τ', delta: 'δ', gamma: 'γ', epsilon: 'ε' };
// Control words get a trailing space so a following letter can't join them (\pi k, not \pik).
const symTex = (n) => {
  if (SYM_TEX[n]) return `${SYM_TEX[n]} `;
  const m = /^([A-Za-z]+)_([A-Za-z0-9]+)$/.exec(n);
  return m ? `${SYM_TEX[m[1]] ? `${SYM_TEX[m[1]]} ` : m[1]}_{${m[2].length > 1 && /[A-Za-z]/.test(m[2]) ? `\\mathrm{${m[2]}}` : m[2]}}` : n;
};
const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const symTxt = (n) => {
  if (SYM_TXT[n]) return SYM_TXT[n];
  const m = /^([A-Za-z]+)_([A-Za-z0-9]+)$/.exec(n);
  if (!m) return n;
  const base = SYM_TXT[m[1]] || m[1];
  return /^\d+$/.test(m[2]) ? base + m[2].split('').map((d) => SUB_DIGITS[d]).join('') : `${base}_${m[2]}`;
};
export const varTex = (n) => symTex(n).trim();
export const varText = symTxt;

// Main variable for ordering terms (x if present).
function mainVar(e) {
  const s = symbols(e);
  if (s.has('x')) return 'x';
  return [...s].sort()[0] || 'x';
}
function degreeIn(t, x) {
  const [, rest] = splitCoef(t);
  const fs = rest.k === '*' ? rest.f : [rest];
  let d = 0;
  for (const f of fs) {
    if (f.k === 's' && f.n === x) d += 1;
    else if (f.k === '^' && f.b.k === 's' && f.b.n === x && isNum(f.e)) d += f.e.v.toNumber();
    else if (contains(f, x)) d += 0.5;
  }
  return d;
}
function displayTerms(e) {
  if (linearCombo(e)) return [...e.t].sort((a, b) => (splitCoef(a)[0].isNeg - splitCoef(b)[0].isNeg) || order(a, b));
  const x = mainVar(e);
  const pureConst = symbols(e).size === 0;
  return [...e.t].sort((a, b) => {
    const da = degreeIn(a, x), db = degreeIn(b, x);
    if (da !== db) return db - da;
    if (pureConst) {
      // 2 + √3 rather than √3 + 2
      if (a.k === 'n' && b.k !== 'n') return -1;
      if (b.k === 'n' && a.k !== 'n') return 1;
    } else {
      if (a.k === 'n' && b.k !== 'n') return 1;
      if (b.k === 'n' && a.k !== 'n') return -1;
    }
    const na = splitCoef(a)[0].isNeg, nb = splitCoef(b)[0].isNeg;
    if (na !== nb) return na ? 1 : -1;
    return order(a, b);
  });
}
// Linear combinations of several letters read better with positive terms first.
const linearCombo = (e) => e.k === '+' && !symbols(e).has('x') && e.t.every((t) => { const [, r] = splitCoef(t); return r.k === 's' || r.k === 'n' || isOne(r); });

const negCoef = (t) => {
  const [c] = splitCoef(t);
  return c.isNeg;
};

export function toTex(e, ctx = 0) {
  switch (e.k) {
    case 'n': {
      const v = e.v;
      const s = v.isInt ? v.n.toString() : `${v.isNeg ? '-' : ''}\\frac{${(v.isNeg ? -v.n : v.n)}}{${v.d}}`;
      return (ctx >= 2 && v.isNeg) || (ctx >= 3 && !v.isInt) ? `\\left(${s}\\right)` : s;
    }
    case 's': return symTex(e.n);
    case '+': {
      const terms = displayTerms(e);
      let out = '';
      terms.forEach((t, i) => {
        if (i === 0) { out += toTex(t, 1); return; }
        if (negCoef(t)) out += ' - ' + toTex(S(mul(NEG1, t)), 1);
        else out += ' + ' + toTex(t, 1);
      });
      return ctx >= 2 ? `\\left(${out}\\right)` : out;
    }
    case '*': return mulTex(e, ctx);
    case '^': return powTex(e, ctx);
    case 'f': {
      const a = e.a[0];
      if (e.n === 'abs') return `\\left|${toTex(a)}\\right|`;
      if (e.n === 'fact') return `${toTex(a, 3)}!`;
      const name = TEX_FN[e.n] || `\\operatorname{${e.n}}`;
      return `${name}\\left(${e.a.map((x) => toTex(x)).join(', ')}\\right)`;
    }
    default: return '?';
  }
}

function mulTex(e, ctx) {
  const { c, num, den } = splitForDisplay(e);
  const neg = c.isNeg;
  const cn = (neg ? -c.n : c.n), cd = c.d;
  const numParts = num.map((f) => toTex(f, num.length > 1 || cn !== 1n ? 2 : 1));
  const denParts = den.map((f) => toTex(f, den.length > 1 || cd !== 1n ? 2 : 1));
  let numStr = joinTex(cn === 1n && numParts.length ? [] : [cn.toString()], numParts);
  let s;
  if (cd !== 1n || denParts.length) {
    const denStr = joinTex(cd === 1n && denParts.length ? [] : [cd.toString()], denParts);
    s = `\\frac{${numStr || '1'}}{${denStr}}`;
  } else {
    s = numStr || '1';
  }
  s = (neg ? '-' : '') + s;
  return neg && ctx >= 2 ? `\\left(${s}\\right)` : s;
}
function joinTex(prefix, parts) {
  const all = [...prefix, ...parts];
  let out = '';
  all.forEach((p, i) => {
    if (i === 0) { out = p; return; }
    const prevDigit = /\d$/.test(out), nextDigit = /^\d/.test(p);
    out += prevDigit && nextDigit ? ' \\cdot ' : (/^\\[a-z]/.test(p) || /^\\left/.test(p) ? ' ' : '');
    out += p;
  });
  return out;
}

function splitForDisplay(e) {
  const fs = e.k === '*' ? e.f : [e];
  let c = Rat.ONE;
  const num = [], den = [];
  for (const f of fs) {
    if (f.k === 'n') { c = c.mul(f.v); continue; }
    if (f.k === '^' && isNum(f.e) && f.e.v.isNeg) { den.push(simpPow(f.b, N(f.e.v.neg()))); continue; }
    num.push(f);
  }
  // order: constants, variables by name, powers, functions (sin before cos), sums
  const FN_ORDER = { sin: 0, cos: 1, tan: 2, sec: 3, csc: 4, cot: 5 };
  const fnRank = (f) => { const g = f.k === '^' ? f.b : f; return g.k === 'f' ? (FN_ORDER[g.n] ?? 9) / 10 : 0; };
  const isConstPow = (f) => f.k === '^' && (f.b.k === 'n' || (f.b.k === 's' && (f.b.n === 'e' || f.b.n === 'pi'))) && symbols(f.e).size > 0;
  const rank = (f) => (f.k === 's' && (f.n === 'pi' || f.n === 'e') ? 0 : isConstPow(f) ? 1.5 : f.k === '^' && f.b.k === 'n' ? 0.4 : f.k === 's' || (f.k === '^' && f.b.k === 's') ? 1 : (f.k === '^' && f.b.k === 'f') || f.k === 'f' ? 2 + fnRank(f) : 3);
  num.sort((a, b) => rank(a) - rank(b) || order(a, b));
  return { c, num, den };
}

function powTex(e, ctx) {
  const { b, e: ex } = e;
  if (isNum(ex)) {
    const v = ex.v;
    if (v.eq(Rat.HALF)) return `\\sqrt{${toTex(b)}}`;
    if (v.n === 1n && v.d > 1n) return `\\sqrt[${v.d}]{${toTex(b)}}`;
    if (v.isNeg) return `\\frac{1}{${v.neg().eq(Rat.ONE) ? toTex(b) : powTex({ k: '^', b, e: N(v.neg()) }, 0)}}`;
    if (b.k === 'f' && !['abs', 'fact'].includes(b.n) && v.isInt) {
      const name = TEX_FN[b.n] || `\\operatorname{${b.n}}`;
      if (!name.includes('^')) return `${name}^{${v.n}}\\left(${toTex(b.a[0])}\\right)`;
    }
  }
  const base = b.k === 's' || (b.k === 'n' && b.v.isInt && !b.v.isNeg) ? toTex(b) : (b.k === 'f' && b.n === 'abs' ? toTex(b) : `\\left(${toTex(b)}\\right)`);
  return `${base}^{${toTex(ex)}}`;
}

// Plain text that the parser can read back.
export function toText(e, ctx = 0) {
  switch (e.k) {
    case 'n': {
      const s = e.v.toString().replace('-', '−');
      return (ctx >= 2 && (e.v.isNeg || !e.v.isInt)) ? `(${s})` : s;
    }
    case 's': return symTxt(e.n);
    case '+': {
      const terms = displayTerms(e);
      let out = '';
      terms.forEach((t, i) => {
        if (i === 0) { out += toText(t, 1); return; }
        if (negCoef(t)) out += ' − ' + toText(S(mul(NEG1, t)), 1);
        else out += ' + ' + toText(t, 1);
      });
      return ctx >= 2 ? `(${out})` : out;
    }
    case '*': {
      const { c, num, den } = splitForDisplay(e);
      const neg = c.isNeg;
      const cn = neg ? -c.n : c.n;
      const nParts = num.map((f) => toText(f, 2));
      const dParts = den.map((f) => toText(f, 2));
      const lead = cn === 1n && nParts.length ? [] : [cn.toString()];
      let s = joinText([...lead, ...nParts]);
      if (c.d !== 1n || dParts.length) {
        const d = joinText([...(c.d === 1n && dParts.length ? [] : [c.d.toString()]), ...dParts]);
        s = `${s || '1'}/${dParts.length + (c.d !== 1n ? 1 : 0) > 1 ? `(${d})` : d}`;
      }
      s = (neg ? '−' : '') + s;
      return ctx >= 2 && (neg || dParts.length || c.d !== 1n) ? `(${s})` : s;
    }
    case '^': {
      const { b, e: ex } = e;
      if (isNum(ex) && ex.v.eq(Rat.HALF)) return `√${b.k === 's' || (b.k === 'n' && b.v.isInt && !b.v.isNeg) ? toText(b) : `(${toText(b)})`}`;
      if (isNum(ex) && ex.v.isNeg) return `1/${ex.v.neg().eq(Rat.ONE) ? toText(b, 2) : toText({ k: '^', b, e: N(ex.v.neg()) }, 2)}`;
      const base = b.k === 's' || (b.k === 'n' && b.v.isInt && !b.v.isNeg) || b.k === 'f' ? toText(b) : `(${toText(b)})`;
      const exT = ex.k === 's' || (ex.k === 'n' && ex.v.isInt && !ex.v.isNeg) ? toText(ex) : `(${toText(ex)})`;
      return `${base}^${exT}`;
    }
    case 'f': {
      if (e.n === 'abs') return `|${toText(e.a[0])}|`;
      if (e.n === 'fact') return `${toText(e.a[0], 2)}!`;
      return `${e.n}(${e.a.map((a) => toText(a)).join(', ')})`;
    }
    default: return '?';
  }
}
function joinText(parts) {
  let out = '';
  let prevIsCoef = false;
  parts.forEach((p, i) => {
    if (i === 0) { out = p; prevIsCoef = /^\d+$/.test(p); return; }
    const prev = parts[i - 1];
    if (/\d$/.test(out) && /^\d/.test(p)) out += '·';
    else if (!prevIsCoef && (/^[a-z]{2,}\(/i.test(p) || /^[√|]/.test(p) || (prev.includes('^') && /^[a-zπθ(]/i.test(p)) || (/\)$/.test(prev) && /^[a-zπθ]/i.test(p)))) out += ' ';
    out += p;
    prevIsCoef = false;
  });
  return out;
}
