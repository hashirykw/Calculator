// Symbolic integration with traced steps: linearity, reverse power rule,
// standard forms (with linear inner functions), identities, u-substitution,
// integration by parts and partial fractions. Returns null when no rule
// applies, so the caller can fall back to a clearly labelled numeric answer.

import { Rat, MathError } from './rational.js';
import * as Y from './sym.js';
import { differentiate } from './diff.js';
import { M } from './matrix.js';
import { Steps } from '../steps.js';

const { N, ONE, ZERO, NEG1, TWO, HALF, S, mul, add, pow, fn, isFree, toTex, isNum, Sy } = Y;
const LN = (u) => fn('ln', fn('abs', u));
const inv = (a) => pow(a, NEG1);
const intTex = (f, x) => `\\int ${toTex(f, 1)}\\,d${x}`;

export function integrate(expr, x = 'x', steps = new Steps(), depth = 0) {
  if (depth > 5) return null;
  const f = S(expr);
  const log = (rule, F, params) => {
    steps.add(rule, `${intTex(f, x)} = ${toTex(F)}`, params);
    return F;
  };

  // constant
  if (isFree(f, x)) return log('stdform', S(mul(f, Sy(x))));

  // linearity over sums
  if (f.k === '+') {
    const i = steps.add('linearity', `${intTex(f, x)} = ${f.t.map((t) => intTex(t, x)).join(' + ')}`);
    const parts = [];
    for (const t of f.t) {
      const F = integrate(t, x, steps, depth + 1);
      if (!F) { steps.list.length = i; return null; }
      parts.push(F);
    }
    return S(add(parts));
  }

  // constant multiples
  if (f.k === '*') {
    const free = f.f.filter((g) => isFree(g, x));
    if (free.length) {
      const c = S(mul(free)), rest = S(mul(f.f.filter((g) => !isFree(g, x))));
      const i = steps.add('constmul', `${intTex(f, x)} = ${toTex(c, 2)}${intTex(rest, x)}`);
      const F = integrate(rest, x, steps, depth + 1);
      if (!F) { steps.list.length = i; return null; }
      return S(mul(c, F));
    }
  }

  const std = standard(f, x);
  if (std) return log(std.rule, std.F, std.params);

  const rat = rationalIntegral(f, x, steps);
  if (rat) return rat;

  const sub = substitution(f, x, steps, depth);
  if (sub) return sub;

  // expand products/powers of sums, then integrate term by term
  if (needsExpand(f)) {
    let ex;
    try { ex = Y.expand(f); } catch { ex = null; }
    if (ex && Y.key(ex) !== Y.key(f) && ex.k === '+') {
      const i = steps.add('expandfirst', `${toTex(f)} = ${toTex(ex)}`);
      const F = integrate(ex, x, steps, depth + 1);
      if (F) return F;
      steps.list.length = i;
    }
  }

  const parts = byParts(f, x, steps, depth);
  if (parts) return parts;

  return null;
}

function needsExpand(f) {
  if (f.k === '*') return f.f.some((g) => g.k === '+' || (g.k === '^' && g.b.k === '+' && Y.isInt(g.e) && !g.e.v.isNeg));
  return f.k === '^' && f.b.k === '+' && Y.isInt(f.e) && !f.e.v.isNeg;
}

// u = a x + b ?
function linear(u, x) {
  const c = Y.polyCoeffs(u, x);
  if (!c || c.length !== 2 || Y.isZero(c[1])) return null;
  return { a: c[1], b: c[0] };
}

// Standard forms with a linear inner function u = ax + b.
function standard(f, x) {
  const X = Sy(x);
  const over = (F, a) => S(mul(F, inv(a)));
  if (f.k === 's' && f.n === x) return { rule: 'revpower', F: S(mul(HALF, pow(X, TWO))) };

  if (f.k === '^') {
    const { b, e } = f;
    if (!isFree(b, x) && isFree(e, x)) {
      const L = linear(b, x);
      if (L) {
        if (isNum(e) && e.v.eq(Rat.NEG_ONE)) return { rule: b.k === 's' ? 'stdform' : 'stdform', F: over(LN(b), L.a) };
        const e1 = S(add(e, ONE));
        return { rule: 'revpower', F: over(mul(pow(b, e1), inv(e1)), L.a) };
      }
      // 1/(c + d x^2) -> atan ;  (c - d x^2)^(-1/2) -> asin
      const pc = Y.polyRat(b, x);
      if (pc && pc.length === 3 && pc[1].isZero && isNum(e)) {
        const c = pc[0], d = pc[2];
        if (e.v.eq(Rat.NEG_ONE) && c.sign > 0 && d.sign > 0) {
          // ∫ 1/(c + d x²) = 1/√(cd) · atan(x √(d/c))
          const k = S(pow(N(c.mul(d)), N(new Rat(-1n, 2n))));
          return { rule: 'stdform', F: S(mul(k, fn('atan', mul(X, pow(N(d.div(c)), HALF))))) };
        }
        if (e.v.eq(new Rat(-1n, 2n)) && c.sign > 0 && d.sign < 0) {
          // ∫ 1/√(c − k x²) = asin(x √(k/c)) / √k
          const kk = d.neg();
          return { rule: 'stdform', F: S(mul(pow(N(kk), N(new Rat(-1n, 2n))), fn('asin', mul(X, pow(N(kk.div(c)), HALF))))) };
        }
      }
      // powers of trig functions with linear argument
      if (b.k === 'f' && b.a.length === 1 && isNum(e)) {
        const u = b.a[0];
        const Lf = linear(u, x);
        if (Lf) {
          const k = e.v.toString();
          const two = (g) => fn(g, mul(TWO, u));
          const table = {
            'sin|2': () => ({ rule: 'identity', F: add(mul(HALF, u), mul(N(new Rat(-1n, 4n)), two('sin'))), params: { id: 'sin2' } }),
            'cos|2': () => ({ rule: 'identity', F: add(mul(HALF, u), mul(N(new Rat(1n, 4n)), two('sin'))), params: { id: 'cos2' } }),
            'sec|2': () => ({ rule: 'stdform', F: fn('tan', u) }),
            'cos|-2': () => ({ rule: 'stdform', F: fn('tan', u) }),
            'csc|2': () => ({ rule: 'stdform', F: mul(NEG1, fn('cot', u)) }),
            'sin|-2': () => ({ rule: 'stdform', F: mul(NEG1, fn('cot', u)) }),
            'tan|2': () => ({ rule: 'identity', F: add(fn('tan', u), mul(NEG1, u)), params: { id: 'tan2' } }),
            'cot|2': () => ({ rule: 'identity', F: add(mul(NEG1, fn('cot', u)), mul(NEG1, u)), params: { id: 'cot2' } }),
            'cosh|-2': () => ({ rule: 'stdform', F: fn('tanh', u) }),
          };
          const hit = table[`${b.n}|${k}`];
          if (hit) { const r = hit(); return { ...r, F: over(r.F, Lf.a) }; }
        }
      }
    }
    if (isFree(b, x) && !isFree(e, x)) {
      const L = linear(e, x);
      if (L) {
        const isE = b.k === 's' && b.n === 'e';
        return { rule: 'stdform', F: over(isE ? f : mul(f, inv(fn('ln', b))), L.a) };
      }
    }
  }

  if (f.k === 'f' && f.a.length === 1) {
    const u = f.a[0];
    const L = linear(u, x);
    if (L) {
      const table = {
        sin: () => mul(NEG1, fn('cos', u)),
        cos: () => fn('sin', u),
        tan: () => mul(NEG1, LN(fn('cos', u))),
        cot: () => LN(fn('sin', u)),
        sec: () => LN(add(fn('sec', u), fn('tan', u))),
        csc: () => mul(NEG1, LN(add(fn('csc', u), fn('cot', u)))),
        sinh: () => fn('cosh', u),
        cosh: () => fn('sinh', u),
        tanh: () => fn('ln', fn('cosh', u)),
        ln: () => add(mul(u, fn('ln', u)), mul(NEG1, u)),
        asin: () => add(mul(u, fn('asin', u)), pow(add(ONE, mul(NEG1, pow(u, TWO))), HALF)),
        acos: () => add(mul(u, fn('acos', u)), mul(NEG1, pow(add(ONE, mul(NEG1, pow(u, TWO))), HALF))),
        atan: () => add(mul(u, fn('atan', u)), mul(N(new Rat(-1n, 2n)), fn('ln', add(ONE, pow(u, TWO))))),
        log: () => mul(add(mul(u, fn('ln', u)), mul(NEG1, u)), inv(fn('ln', N(10)))),
      };
      const g = table[f.n];
      if (g) return { rule: f.n === 'ln' || f.n === 'log' || f.n.startsWith('a') ? 'parts' : 'stdform', F: over(g(), L.a) };
    }
  }

  // sec·tan and csc·cot with the same linear argument
  if (f.k === '*' && f.f.length === 2 && f.f.every((g) => g.k === 'f')) {
    const [g, h] = f.f;
    if (Y.same(g.a[0], h.a[0])) {
      const u = g.a[0];
      const L = linear(u, x);
      const names = [g.n, h.n].sort().join('*');
      if (L && names === 'sec*tan') return { rule: 'stdform', F: over(fn('sec', u), L.a) };
      if (L && names === 'cot*csc') return { rule: 'stdform', F: over(mul(NEG1, fn('csc', u)), L.a) };
    }
  }
  return null;
}

// Replace every occurrence of `u` (structurally) with symbol t.
function replace(e, u, t) {
  if (Y.same(e, u)) return t;
  switch (e.k) {
    case '+': return { k: '+', t: e.t.map((a) => replace(a, u, t)) };
    case '*': return { k: '*', f: e.f.map((a) => replace(a, u, t)) };
    case '^': {
      // also catch u^k when u itself is a power: (x^2)^k inside e^(x^2) etc.
      return { k: '^', b: replace(e.b, u, t), e: replace(e.e, u, t) };
    }
    case 'f': return { k: 'f', n: e.n, a: e.a.map((a) => replace(a, u, t)) };
    default: return e;
  }
}

function substitution(f, x, steps, depth) {
  const factors = f.k === '*' ? f.f : [f];
  const cands = [];
  const consider = (u) => {
    if (!u || isFree(u, x) || linear(u, x) || (u.k === 's')) return;
    if (!cands.some((c) => Y.same(c, u))) cands.push(u);
  };
  for (const g of factors) {
    if (g.k === '^') {
      if (!isFree(g.b, x) && isFree(g.e, x)) { consider(g.b); if (g.b.k === 'f') consider(g.b); }
      if (isFree(g.b, x)) consider(g.e);
    }
    if (g.k === 'f') { consider(g.a[0]); consider(g); }
  }
  const t = Sy('u');
  for (const u of cands) {
    let du;
    try { du = differentiate(u, x, new Steps(), { log: false }).result; } catch { continue; }
    if (Y.isZero(du)) continue;
    const q = S(mul(f, inv(du)));
    const g = S(replace(q, u, t));
    if (!isFree(g, x)) continue;
    const i = steps.add('substitution', `u = ${toTex(u)},\\quad \\frac{du}{d${x}} = ${toTex(du)},\\quad ${intTex(f, x)} = \\int ${toTex(g, 1)}\\,du`);
    const G = integrate(g, 'u', steps, depth + 1);
    if (!G) { steps.list.length = i; continue; }
    const F = S(Y.subst(G, 'u', u));
    steps.add('backsub', `= ${toTex(F)}`);
    return F;
  }
  return null;
}

// LIATE choice: u = log/inverse-trig/polynomial factor, dv = the rest.
function byParts(f, x, steps, depth) {
  if (depth > 3) return null;
  const factors = f.k === '*' ? f.f : [f];
  if (factors.length < 2) return null;
  const isPolyPart = (g) => (g.k === 's' && g.n === x) || (g.k === '^' && g.b.k === 's' && g.b.n === x && Y.isInt(g.e) && !g.e.v.isNeg);
  const isLogPart = (g) => g.k === 'f' && ['ln', 'asin', 'acos', 'atan'].includes(g.n);
  let u = factors.find(isLogPart) || factors.find(isPolyPart);
  if (!u) return null;
  const dv = S(mul(factors.filter((g) => g !== u)));
  const v = integrate(dv, x, new Steps(), depth + 2);
  if (!v) return null;
  const du = differentiate(u, x, new Steps(), { log: false }).result;
  const rest = S(mul(v, du));
  const i = steps.add('parts', `u = ${toTex(u)},\\ dv = ${toTex(dv)}\\,d${x},\\ v = ${toTex(v)};\\quad ${intTex(f, x)} = ${toTex(S(mul(u, v)), 2)} - ${intTex(rest, x)}`);
  const R = integrate(rest, x, steps, depth + 1);
  if (!R) { steps.list.length = i; return null; }
  return S(add(mul(u, v), mul(NEG1, R)));
}

// Rational functions P/Q: polynomial part + partial fractions over the
// rational roots of Q, with at most one irreducible quadratic factor.
function rationalIntegral(f, x, steps) {
  const { num, den } = Y.numDen(f);
  if (Y.isOne(den) || isFree(den, x)) return null;
  const Pn = Y.polyRat(num, x), Qd = Y.polyRat(Y.expand(den), x);
  if (!Pn || !Qd || Qd.length < 2) return null;
  const X = Sy(x);
  const { q: quot, r: rem } = Y.P.divmod(Pn, Qd);
  const { roots, rest } = Y.rationalRoots(Qd);
  const restDeg = Y.P.deg(rest);
  if (restDeg > 2) return null;
  // denominators: (x - r)^k for each root multiplicity, plus the quadratic
  const mult = new Map();
  for (const r of roots) { const k = r.toString(); mult.set(k, { r, m: (mult.get(k)?.m || 0) + 1 }); }
  const lc = Qd[Qd.length - 1];
  const terms = [];   // {kind:'lin', r, k} | {kind:'quad', poly}
  for (const { r, m } of mult.values()) for (let k = 1; k <= m; k++) terms.push({ kind: 'lin', r, k });
  const quad = restDeg === 2 ? rest.map((c) => c.div(rest[2])) : null;
  if (quad) terms.push({ kind: 'quad', poly: quad, part: 'B' }, { kind: 'quad', poly: quad, part: 'C' });
  if (!terms.length) return null;
  // Build the linear system: rem(x) = Σ coef_i * (Q / den_i)(x) * basis_i
  const Qmonic = Qd.map((c) => c.div(lc));
  const n = Qmonic.length - 1;
  const cols = terms.map((t) => {
    let d;
    if (t.kind === 'lin') d = Array(t.k).fill(0).reduce((acc) => Y.P.mul(acc, [t.r.neg(), Rat.ONE]), [Rat.ONE]);
    else d = t.poly;
    let poly = Y.P.divmod(Qmonic, d).q;
    if (t.kind === 'quad' && t.part === 'B') poly = Y.P.mul(poly, [Rat.ZERO, Rat.ONE]);
    while (poly.length < n) poly.push(Rat.ZERO);
    return poly;
  });
  const remM = rem.map((c) => c.div(lc));
  while (remM.length < n) remM.push(Rat.ZERO);
  if (cols.length !== n) return null;
  const A = Array.from({ length: n }, (_, i) => cols.map((c) => c[i] || Rat.ZERO));
  const sol = M.solve(A, remM.slice(0, n));
  if (sol.kind !== 'unique') return null;
  const pieces = [];
  const decomp = [];
  if (!(quot.length === 1 && quot[0].isZero)) {
    const qp = Y.fromPolyRat(quot, x);
    decomp.push(qp);
    const Fq = Y.fromPolyRat([Rat.ZERO, ...quot.map((c, i) => c.div(i + 1))], x);
    pieces.push(Fq);
  }
  let B = null, Cc = null;
  terms.forEach((t, i) => {
    const c = sol.x[i];
    if (t.kind === 'lin') {
      if (c.isZero) return;
      const lin = S(add(X, N(t.r.neg())));
      decomp.push(S(mul(N(c), pow(lin, N(-t.k)))));
      if (t.k === 1) pieces.push(S(mul(N(c), LN(lin))));
      else pieces.push(S(mul(N(c.div(1 - t.k)), pow(lin, N(1 - t.k)))));
    } else if (t.part === 'B') B = c;
    else Cc = c;
  });
  if (quad) {
    // (Bx + C)/(x² + p x + q) = B/2 · ln(x² + px + q) + (C − Bp/2)·2/√(4q − p²)·atan((2x + p)/√(4q − p²))
    const p = quad[1], q = quad[0];
    const qpoly = Y.fromPolyRat(quad, x);
    decomp.push(S(mul(add(mul(N(B), X), N(Cc)), pow(qpoly, NEG1))));
    const disc = q.mul(4).sub(p.mul(p));
    if (disc.sign <= 0) return null;
    if (!B.isZero) pieces.push(S(mul(N(B.div(2)), fn('ln', qpoly))));
    const k = Cc.sub(B.mul(p).div(2));
    if (!k.isZero) {
      // atan((x + p/2) · 2/√disc) keeps the argument tidy, e.g. atan((x + 1)/2)
      const twoOverRoot = S(mul(TWO, pow(pow(N(disc), HALF), NEG1)));
      pieces.push(S(mul(N(k), twoOverRoot, fn('atan', mul(add(X, N(p.div(2))), twoOverRoot)))));
    }
  }
  if (!pieces.length) return null;
  const F = S(add(pieces));
  if (decomp.length > 1 || mult.size > 0) steps.add('partialfrac', `${toTex(f)} = ${decomp.map((d) => toTex(d)).join(' + ').replace(/\+ -/g, '- ')}`);
  steps.add('stdform', `${intTex(f, x)} = ${toTex(F)}`);
  return F;
}

// Prefer the expanded form unless it is much longer (e.g. keep (2x + 1)^5/10).
export function tidyAnti(F) {
  const compact = S(F);
  let ex;
  try { ex = Y.expand(compact); } catch { return compact; }
  const a = Y.toText(compact).length, b = Y.toText(ex).length;
  return b <= a * 1.3 ? ex : compact;
}

export { linear };
