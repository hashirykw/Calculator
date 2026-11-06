// Numeric evaluation of a syntax tree for the calculator and for "evaluate"
// tasks in Solve. Values are exact rationals (Rat) while every step is exact,
// 64-digit decimals (Dec) once a function makes them irrational, or complex
// numbers (Cx). Nothing here ever calls eval or new Function.

import { Rat, MathError, gcdBig } from './rational.js';
import { Dec, D, isqrt } from './decimal.js';

const MAX = Dec.parse('1.7976931348623157e308');
const TINY = Dec.parse('1e-60');

// ---------- real helpers (Rat stays exact where possible) ----------

export const R = {
  isReal: (v) => v instanceof Rat || v instanceof Dec,
  dec: (v) => (v instanceof Dec ? v : Dec.of(v)),
  add: (a, b) => (a instanceof Rat && b instanceof Rat ? a.add(b) : R.dec(a).add(R.dec(b))),
  sub: (a, b) => (a instanceof Rat && b instanceof Rat ? a.sub(b) : R.dec(a).sub(R.dec(b))),
  mul: (a, b) => (a instanceof Rat && b instanceof Rat ? a.mul(b) : R.dec(a).mul(R.dec(b))),
  div: (a, b) => {
    if (R.isZero(b)) throw new MathError('divzero');
    return a instanceof Rat && b instanceof Rat ? a.div(b) : R.dec(a).div(R.dec(b));
  },
  neg: (a) => a.neg(),
  abs: (a) => a.abs(),
  sign: (a) => a.sign,
  isZero: (a) => (a instanceof Rat ? a.isZero : a.isZero),
  cmp: (a, b) => (a instanceof Rat && b instanceof Rat ? a.cmp(b) : R.dec(a).cmp(R.dec(b))),
  isInt: (a) => (a instanceof Rat ? a.isInt : a.isInt),
  toBig: (a) => (a instanceof Rat ? a.n / a.d : a.roundInt()),
  num: (a) => a.toNumber(),
};

export class Cx {
  constructor(re, im) { this.re = re; this.im = im; }
  static of(re, im = Rat.ZERO) { return new Cx(re, im); }
}
const isCx = (v) => v instanceof Cx;
const toCx = (v) => (v instanceof Cx ? v : new Cx(v, Rat.ZERO));
// Drop the imaginary part when it is exactly (or numerically) zero.
const simplifyCx = (z) => {
  if (!(z instanceof Cx)) return z;
  const im = z.im instanceof Dec && z.im.abs().cmp(TINY) < 0 && !z.re.isZero ? Rat.ZERO : z.im;
  const re = z.re instanceof Dec && z.re.abs().cmp(TINY) < 0 && !im.isZero ? Rat.ZERO : z.re;
  return R.isZero(im) ? re : new Cx(re, im);
};

const C = {
  add: (a, b) => new Cx(R.add(a.re, b.re), R.add(a.im, b.im)),
  sub: (a, b) => new Cx(R.sub(a.re, b.re), R.sub(a.im, b.im)),
  mul: (a, b) => new Cx(R.sub(R.mul(a.re, b.re), R.mul(a.im, b.im)), R.add(R.mul(a.re, b.im), R.mul(a.im, b.re))),
  div: (a, b) => {
    const den = R.add(R.mul(b.re, b.re), R.mul(b.im, b.im));
    if (R.isZero(den)) throw new MathError('divzero');
    return new Cx(
      R.div(R.add(R.mul(a.re, b.re), R.mul(a.im, b.im)), den),
      R.div(R.sub(R.mul(a.im, b.re), R.mul(a.re, b.im)), den),
    );
  },
  abs: (a) => realSqrt(R.add(R.mul(a.re, a.re), R.mul(a.im, a.im))),
  arg: (a) => atan2(R.dec(a.im), R.dec(a.re)),
  exp: (a) => {
    const m = D.exp(R.dec(a.re));
    const { s, c } = snapSC(D.sinCos(R.dec(a.im)));
    return new Cx(m.mul(c), m.mul(s));
  },
  ln: (a) => {
    if (R.isZero(a.re) && R.isZero(a.im)) throw new MathError('logzero');
    return new Cx(D.ln(R.dec(C.abs(a))), C.arg(a));
  },
  sqrt: (a) => {
    const r = C.abs(a);
    const re = realSqrt(R.div(R.add(r, a.re), Rat.TWO));
    let im = realSqrt(R.div(R.sub(r, a.re), Rat.TWO));
    if (R.sign(a.im) < 0) im = R.neg(im);
    return new Cx(re, im);
  },
  pow: (a, b) => {
    if (R.isZero(a.re) && R.isZero(a.im)) {
      if (R.isZero(b.re) && R.isZero(b.im)) return new Cx(Rat.ONE, Rat.ZERO);
      return new Cx(Rat.ZERO, Rat.ZERO);
    }
    if (R.isZero(b.im) && b.re instanceof Rat && b.re.isInt && b.re.abs().cmp(10000) <= 0) {
      let k = b.re.n < 0n ? -b.re.n : b.re.n;
      let r = new Cx(Rat.ONE, Rat.ZERO), base = a;
      while (k > 0n) {
        if (k & 1n) r = C.mul(r, base);
        k >>= 1n;
        if (k) base = C.mul(base, base);
      }
      return b.re.n < 0n ? C.div(new Cx(Rat.ONE, Rat.ZERO), r) : r;
    }
    return C.exp(C.mul(b, C.ln(a)));
  },
};

function atan2(y, x) {
  if (x.isZero && y.isZero) return Rat.ZERO;
  const pi = D.pi();
  if (x.isZero) return y.sign > 0 ? pi.div(2) : pi.div(-2);
  const a = D.atan(y.div(x));
  if (x.sign > 0) return a;
  return y.sign >= 0 ? a.add(pi) : a.sub(pi);
}

function snapSC({ s, c }) {
  return { s: s.abs().cmp(TINY) < 0 ? Rat.ZERO : s, c: c.abs().cmp(TINY) < 0 ? Rat.ZERO : c };
}

// Exact k-th root of a non-negative rational when it exists, else null.
function exactRoot(r, k) {
  const kb = BigInt(k);
  const rootBig = (n) => {
    if (n < 0n) return null;
    if (n < 2n) return n;
    let x = BigInt(Math.round(Number(n) ** (1 / k)));
    if (!Number.isFinite(Number(n))) {
      // Newton for huge numbers
      x = 1n << BigInt(Math.ceil(n.toString(2).length / k));
      for (;;) {
        const y = ((kb - 1n) * x + n / x ** (kb - 1n)) / kb;
        if (y >= x) break;
        x = y;
      }
    }
    for (const c of [x - 1n, x, x + 1n]) if (c >= 0n && c ** kb === n) return c;
    return null;
  };
  const n = rootBig(r.n), d = rootBig(r.d);
  return n !== null && d !== null ? new Rat(n, d) : null;
}

function realSqrt(v) {
  if (R.sign(v) < 0) throw new MathError('sqrtneg');
  if (v instanceof Rat) {
    const ex = exactRoot(v, 2);
    if (ex) return ex;
  }
  return D.sqrt(R.dec(v));
}

// Range check after every operation.
function check(v) {
  if (v instanceof Cx) { check(v.re); check(v.im); return v; }
  if (v instanceof Rat) {
    const dn = v.n < 0n ? -v.n : v.n;
    const diff = dn.toString().length - v.d.toString().length;
    if (diff > 309 || (diff >= 308 && Dec.fromRat(v).abs().cmp(MAX) > 0)) throw new MathError('toolarge');
    return v;
  }
  if (v instanceof Dec) {
    if (v.mag > 309 || (v.mag >= 308 && v.abs().cmp(MAX) > 0)) throw new MathError('toolarge');
    if (v.mag < -400) return Rat.ZERO;
  }
  return v;
}

// ---------- angles ----------

const PER_QUARTER = { deg: new Rat(90n), grad: new Rat(100n) };
function sinCosAngle(x, unit) {
  if (unit === 'rad') return snapSC(D.sinCos(R.dec(x)));
  // Reduce exactly in degrees (or grads) first so sin(180°) is exactly 0.
  const quarter = PER_QUARTER[unit];
  let q;
  if (x instanceof Rat) {
    const t = x.div(quarter);
    q = t.add(Rat.HALF).floor();
  } else {
    q = R.dec(x).div(R.dec(quarter)).roundInt();
  }
  const r = R.sub(x, quarter.mul(new Rat(q)));
  const qm = Number(((q % 4n) + 4n) % 4n);
  if (R.isZero(r)) {
    return { s: [Rat.ZERO, Rat.ONE, Rat.ZERO, Rat.NEG_ONE][qm], c: [Rat.ONE, Rat.ZERO, Rat.NEG_ONE, Rat.ZERO][qm] };
  }
  const rad = R.dec(r).mul(D.pi(70)).div(R.dec(quarter).mul(2));
  return snapSC(D.sinCosQuadrant(qm, rad));
}
function toRadians(x, unit) {
  if (unit === 'rad') return R.dec(x);
  return R.dec(x).mul(D.pi(70)).div(unit === 'deg' ? 180 : 200);
}
function fromRadians(x, unit) {
  if (unit === 'rad') return x;
  return R.dec(x).mul(unit === 'deg' ? 180 : 200).div(D.pi(70));
}

// ---------- evaluator ----------

const DEFAULT_CTX = { angle: 'rad', complex: false, vars: {} };

export function evaluate(node, ctx = {}) {
  ctx = { ...DEFAULT_CTX, ...ctx };
  return finish(ev(node, ctx));
}
function finish(v) {
  if (Array.isArray(v)) return v.map(finish);
  return check(simplifyCx(v));
}

function realOrThrow(v, code = 'complexarg') {
  v = simplifyCx(v);
  if (v instanceof Cx) throw new MathError(code);
  if (Array.isArray(v)) throw new MathError('listarg');
  return v;
}

function ev(n, ctx) {
  switch (n.type) {
    case 'num': return n.value;
    case 'val': return n.value;   // an already-evaluated value (used by step tracing)
    case 'group': return ev(n.arg, ctx);
    case 'sym': return symbol(n.name, ctx);
    case 'neg': {
      const v = ev(n.arg, ctx);
      if (Array.isArray(v)) return v.map((x) => neg(x));
      return neg(v);
    }
    case 'post': {
      if (n.op === '%') return mulV(ev(n.arg, ctx), new Rat(1n, 100n));
      if (n.op === '°') {
        const v = realOrThrow(ev(n.arg, ctx));
        if (ctx.angle === 'deg') return v;
        if (ctx.angle === 'grad') return R.mul(v, new Rat(10n, 9n));
        return R.dec(v).mul(D.pi(70)).div(180);
      }
      return factorial(realOrThrow(ev(n.arg, ctx), 'factint'));
    }
    case 'op': return binary(n, ctx);
    case 'call': return call(n, ctx);
    case 'list': return n.items.map((it) => ev(it, ctx));
    case 'rel': throw new MathError('notcalc', { what: 'equation' });
    default: throw new MathError('parse');
  }
}

function symbol(name, ctx) {
  if (name in (ctx.vars || {})) {
    const v = ctx.vars[name];
    if (v === undefined || v === null) throw new MathError('undefinedvar', { name });
    return v;
  }
  switch (name) {
    case 'pi': return D.pi();
    case 'e': return D.e();
    case 'i': return new Cx(Rat.ZERO, Rat.ONE);
    case 'Infinity': throw new MathError('infinity');
    case 'Ans': return Rat.ZERO;
    case 'M': return Rat.ZERO;
    default: throw new MathError('undefinedvar', { name });
  }
}

const neg = (v) => (v instanceof Cx ? new Cx(R.neg(v.re), R.neg(v.im)) : R.neg(v));
function addV(a, b) { return isCx(a) || isCx(b) ? simplifyCx(C.add(toCx(a), toCx(b))) : check(R.add(a, b)); }
function subV(a, b) { return isCx(a) || isCx(b) ? simplifyCx(C.sub(toCx(a), toCx(b))) : check(R.sub(a, b)); }
function mulV(a, b) { return isCx(a) || isCx(b) ? simplifyCx(C.mul(toCx(a), toCx(b))) : check(R.mul(a, b)); }
function divV(a, b) { return isCx(a) || isCx(b) ? simplifyCx(C.div(toCx(a), toCx(b))) : check(R.div(a, b)); }

function binary(n, ctx) {
  const [ln, rn] = n.args;
  // Calculator percent rules: 200 + 15% = 230, 200 - 15% = 170.
  if ((n.op === '+' || n.op === '-') && rn.type === 'post' && rn.op === '%') {
    const a = ev(ln, ctx);
    const p = mulV(ev(rn.arg, ctx), new Rat(1n, 100n));
    const part = mulV(a, p);
    return n.op === '+' ? addV(a, part) : subV(a, part);
  }
  if (n.op === '^' && ln.type === 'sym' && ln.name === 'e' && !('e' in (ctx.vars || {}))) {
    return expV(ev(rn, ctx), ctx);
  }
  const a = ev(ln, ctx), b = ev(rn, ctx);
  if (Array.isArray(a) || Array.isArray(b)) return elementwise(n.op, a, b);
  switch (n.op) {
    case '+': return addV(a, b);
    case '-': return subV(a, b);
    case '*': return mulV(a, b);
    case '/': return divV(a, b);
    case '^': return powV(a, b, ctx);
    default: throw new MathError('parse');
  }
}
function elementwise(op, a, b) {
  const f = { '+': addV, '-': subV, '*': mulV, '/': divV }[op];
  if (!f) throw new MathError('listarg');
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) throw new MathError('listsize');
    return a.map((x, i) => f(x, b[i]));
  }
  return Array.isArray(a) ? a.map((x) => f(x, b)) : b.map((y) => f(a, y));
}

function expV(x, ctx) {
  if (isCx(x)) return simplifyCx(C.exp(x));
  if (x instanceof Rat && x.isZero) return Rat.ONE;
  return check(D.exp(R.dec(x)));
}

export function powV(a, b, ctx = DEFAULT_CTX) {
  if (isCx(a) || isCx(b)) return simplifyCx(C.pow(toCx(a), toCx(b)));
  if (a instanceof Rat && b instanceof Rat) {
    if (b.isInt) {
      if (a.isZero && b.isNeg) throw new MathError('divzero');
      if (a.isZero || a.abs().eq(Rat.ONE)) return a.isZero ? (b.isZero ? Rat.ONE : Rat.ZERO) : a.pow(b.n % 2n === 0n ? 2n : 1n);
      const est = Math.abs(Number(b.n)) * Math.log10(Math.abs(a.toNumber()) || 1e-300);
      if (est > 310 && !b.isNeg) throw new MathError('toolarge');
      if (Math.abs(est) > 2000) return b.isNeg ? Rat.ZERO : (() => { throw new MathError('toolarge'); })();
      return check(a.pow(b.n));
    }
    // rational exponent p/q
    const q = Number(b.d);
    const pRat = new Rat(b.n);
    if (a.isNeg) {
      if (q % 2 === 1) {
        const mag = powV(a.neg(), b, ctx);
        return b.n % 2n === 0n ? mag : neg(mag);
      }
      if (ctx.complex) return simplifyCx(C.pow(toCx(a), toCx(b)));
      throw new MathError(q === 2 ? 'sqrtneg' : 'nonreal');
    }
    if (q <= 64) {
      const r = exactRoot(a, q);
      if (r) return powV(r, pRat, ctx);
    }
    return check(D.pow(R.dec(a), R.dec(b)));
  }
  if (R.sign(a) < 0 && !R.isInt(b)) {
    if (ctx.complex) return simplifyCx(C.pow(toCx(a), toCx(b)));
    throw new MathError('nonreal');
  }
  if (R.isZero(a) && R.sign(b) < 0) throw new MathError('divzero');
  return check(D.pow(R.dec(a), R.dec(b)));
}

function factorial(v) {
  if (!R.isInt(v) || R.sign(v) < 0) throw new MathError('factint');
  const k = R.toBig(v);
  if (k > 170n) throw new MathError('toolarge');
  let r = 1n;
  for (let i = 2n; i <= k; i++) r *= i;
  return new Rat(r);
}

function intArg(v, fn) {
  v = realOrThrow(v);
  if (!R.isInt(v)) throw new MathError('intarg', { fn });
  return R.toBig(v);
}

function sqrtV(x, ctx) {
  if (isCx(x)) return simplifyCx(C.sqrt(x));
  if (R.sign(x) < 0) {
    if (ctx.complex) return simplifyCx(C.sqrt(toCx(x)));
    throw new MathError('sqrtneg');
  }
  return realSqrt(x);
}

function logV(x, ctx) {
  if (isCx(x)) return simplifyCx(C.ln(x));
  if (R.isZero(x)) throw new MathError('logzero');
  if (R.sign(x) < 0) {
    if (ctx.complex) return simplifyCx(C.ln(toCx(x)));
    throw new MathError('logneg');
  }
  if (x instanceof Rat && x.eq(Rat.ONE)) return Rat.ZERO;
  return D.ln(R.dec(x));
}

function log10V(x, ctx) {
  if (!isCx(x) && R.sign(x) > 0) {
    // exact for powers of ten, e.g. log(1000) = 3, log(0.01) = -2
    const d = R.dec(x);
    if ((d.m === 1n || d.m === -1n)) return new Rat(BigInt(d.e));
  }
  const l = logV(x, ctx);
  return divV(l, D.ln(Dec.of(10)));
}

function trig(name, x, ctx) {
  if (isCx(x)) return complexTrig(name, x);
  x = realOrThrow(x);
  const { s, c } = sinCosAngle(x, ctx.angle);
  switch (name) {
    case 'sin': return s;
    case 'cos': return c;
    case 'tan': if (R.isZero(c)) throw new MathError('undefined', { fn: 'tan' }); return R.div(s, c);
    case 'sec': if (R.isZero(c)) throw new MathError('undefined', { fn: 'sec' }); return R.div(Rat.ONE, c);
    case 'csc': if (R.isZero(s)) throw new MathError('undefined', { fn: 'csc' }); return R.div(Rat.ONE, s);
    case 'cot': if (R.isZero(s)) throw new MathError('undefined', { fn: 'cot' }); return R.div(c, s);
    default: throw new MathError('parse');
  }
}
function complexTrig(name, z) {
  const I = new Cx(Rat.ZERO, Rat.ONE);
  const e1 = C.exp(C.mul(I, z)), e2 = C.exp(C.mul(new Cx(Rat.ZERO, Rat.NEG_ONE), z));
  const sin = C.div(C.sub(e1, e2), new Cx(Rat.ZERO, Rat.TWO));
  const cos = C.div(C.add(e1, e2), new Cx(Rat.TWO, Rat.ZERO));
  const map = { sin, cos, tan: () => C.div(sin, cos) };
  const v = typeof map[name] === 'function' ? map[name]() : map[name];
  if (!v) throw new MathError('complexarg');
  return simplifyCx(v);
}

function inverseTrig(name, x, ctx) {
  x = realOrThrow(x);
  let r;
  if (name === 'atan') r = D.atan(R.dec(x));
  else if (name === 'asin') r = D.asin(R.dec(x));
  else r = D.acos(R.dec(x));
  return fromRadians(r, ctx.angle);
}

const LIST_FNS = new Set(['mean', 'median', 'mode', 'std', 'var', 'pstd', 'pvar', 'min', 'max', 'total', 'gcd', 'lcm']);

function call(n, ctx) {
  const name = n.name;
  if (name === 'sum' || name === 'product') return sumProduct(n, ctx);
  const args = n.args.map((a) => ev(a, ctx));
  const one = () => {
    if (args.length !== 1) throw new MathError('argcount', { fn: name, n: 1 });
    return args[0];
  };
  const two = () => {
    if (args.length !== 2) throw new MathError('argcount', { fn: name, n: 2 });
    return args;
  };
  if (LIST_FNS.has(name)) return listFn(name, args.length === 1 && Array.isArray(args[0]) ? args[0] : args);
  switch (name) {
    case 'sin': case 'cos': case 'tan': case 'sec': case 'csc': case 'cot': return trig(name, one(), ctx);
    case 'asin': case 'acos': case 'atan': return inverseTrig(name, one(), ctx);
    case 'sinh': return D.sinh(R.dec(realOrThrow(one())));
    case 'cosh': return D.cosh(R.dec(realOrThrow(one())));
    case 'tanh': return D.tanh(R.dec(realOrThrow(one())));
    case 'asinh': return D.asinh(R.dec(realOrThrow(one())));
    case 'acosh': return D.acosh(R.dec(realOrThrow(one())));
    case 'atanh': return D.atanh(R.dec(realOrThrow(one())));
    case 'sqrt': return sqrtV(one(), ctx);
    case 'cbrt': return powV(realOrThrow(one()), new Rat(1n, 3n), ctx);
    case 'root': {
      const [k, x] = two();
      const kk = intArg(k, 'root');
      if (kk === 0n) throw new MathError('domain', { fn: 'root' });
      return powV(realOrThrow(x), new Rat(1n, kk), ctx);
    }
    case 'ln': return logV(one(), ctx);
    case 'log': {
      if (args.length === 2) return divV(logV(args[1], ctx), logV(args[0], ctx)); // log(b, x): base b
      return log10V(one(), ctx);
    }
    case 'log2': return divV(logV(one(), ctx), logV(new Rat(2n), ctx));
    case 'exp': return expV(one(), ctx);
    case 'abs': {
      const x = one();
      return isCx(x) ? C.abs(x) : R.abs(x);
    }
    case 'floor': case 'ceil': {
      const x = realOrThrow(one());
      if (x instanceof Rat) {
        const f = x.floor();
        return new Rat(name === 'floor' || x.isInt ? f : f + 1n);
      }
      const r = R.dec(x);
      const t = r.roundInt();
      const tr = new Rat(t);
      const c = R.cmp(tr, x);
      if (name === 'floor') return c > 0 ? new Rat(t - 1n) : tr;
      return c < 0 ? new Rat(t + 1n) : tr;
    }
    case 'round': {
      const x = realOrThrow(args[0]);
      const dp = args[1] ? Number(intArg(args[1], 'round')) : 0;
      const scale = new Rat(10n).pow(BigInt(dp));
      const v = R.mul(x, scale);
      const neg = R.sign(v) < 0;
      const half = R.add(R.abs(v), Rat.HALF);
      const fl = half instanceof Rat ? half.floor() : R.dec(half).sub(Dec.parse('0.5')).roundInt();
      return R.div(new Rat(neg ? -fl : fl), scale);
    }
    case 'sign': { const x = realOrThrow(one()); return new Rat(BigInt(R.sign(x))); }
    case 'fact': return factorial(realOrThrow(one(), 'factint'));
    case 'nCr': case 'nPr': {
      const [a, b] = two();
      const nn = intArg(a, name), r = intArg(b, name);
      if (nn < 0n || r < 0n || r > nn) throw new MathError('combo', { fn: name });
      if (nn > 100000n) throw new MathError('toolarge');
      let num = 1n;
      for (let i = 0n; i < r; i++) num *= nn - i;
      if (name === 'nPr') return check(new Rat(num));
      let den = 1n;
      for (let i = 2n; i <= r; i++) den *= i;
      return check(new Rat(num / den));
    }
    case 'mod': {
      const [a, b] = two().map((v) => realOrThrow(v));
      if (R.isZero(b)) throw new MathError('divzero');
      const q = R.div(a, b);
      const fl = q instanceof Rat ? q.floor() : (() => { const t = R.dec(q).roundInt(); return R.cmp(new Rat(t), q) > 0 ? t - 1n : t; })();
      return R.sub(a, R.mul(b, new Rat(fl)));
    }
    case 'rand': return Rat.parse(Math.random().toFixed(10));
    case 'randint': {
      const [a, b] = two();
      const lo = intArg(a, 'randint'), hi = intArg(b, 'randint');
      if (hi < lo) throw new MathError('domain', { fn: 'randint' });
      return new Rat(lo + BigInt(Math.floor(Math.random() * Number(hi - lo + 1n))));
    }
    case 're': { const x = one(); return isCx(x) ? x.re : x; }
    case 'im': { const x = one(); return isCx(x) ? x.im : Rat.ZERO; }
    case 'conj': { const x = one(); return isCx(x) ? new Cx(x.re, R.neg(x.im)) : x; }
    case 'arg': { const x = toCx(one()); return fromRadians(C.arg(x), ctx.angle); }
    case 'isprime': case 'primes': case 'factorint': case 'fibonacci':
    case 'solve': case 'diff': case 'integrate': case 'limit': case 'factor': case 'expand': case 'simplify':
    case 'taylor': case 'det': case 'inv': case 'transpose': case 'trace': case 'rank': case 'rref': case 'eigs':
    case 'normalcdf': case 'normalpdf': case 'invnorm': case 'binompdf': case 'binomcdf': case 'poissonpdf': case 'poissoncdf':
    case 'field':
      throw new MathError('notcalc', { fn: name });
    default: throw new MathError('unknownfn', { name });
  }
}

function sumProduct(n, ctx) {
  const [body, v, a, b] = n.args;
  if (n.args.length !== 4 || !v || v.type !== 'sym') throw new MathError('argcount', { fn: n.name, n: 4 });
  const lo = intArg(ev(a, ctx), n.name), hi = intArg(ev(b, ctx), n.name);
  if (hi - lo > 1000000n) throw new MathError('toolarge');
  let acc = n.name === 'sum' ? Rat.ZERO : Rat.ONE;
  for (let k = lo; k <= hi; k++) {
    const val = ev(body, { ...ctx, vars: { ...ctx.vars, [v.name]: new Rat(k) } });
    acc = n.name === 'sum' ? addV(acc, val) : mulV(acc, val);
  }
  return acc;
}

function listFn(name, items) {
  const xs = items.flat(Infinity).map((x) => realOrThrow(x));
  if (!xs.length) throw new MathError('emptylist');
  const sum = xs.reduce((s, x) => R.add(s, x), Rat.ZERO);
  const n = new Rat(BigInt(xs.length));
  const mean = R.div(sum, n);
  const sorted = [...xs].sort((a, b) => R.cmp(a, b));
  const ss = () => xs.reduce((s, x) => { const d = R.sub(x, mean); return R.add(s, R.mul(d, d)); }, Rat.ZERO);
  switch (name) {
    case 'total': return sum;
    case 'mean': return mean;
    case 'min': return sorted[0];
    case 'max': return sorted[sorted.length - 1];
    case 'median': {
      const m = xs.length >> 1;
      return xs.length % 2 ? sorted[m] : R.div(R.add(sorted[m - 1], sorted[m]), Rat.TWO);
    }
    case 'mode': {
      const counts = new Map();
      for (const x of xs) { const k = x.toString(); counts.set(k, (counts.get(k) || { v: x, c: 0 })); counts.get(k).c++; }
      const top = [...counts.values()].sort((a, b) => b.c - a.c);
      if (top[0].c === 1) throw new MathError('nomode');
      return top[0].v;
    }
    case 'var': case 'std': {
      if (xs.length < 2) throw new MathError('needtwo');
      const v = R.div(ss(), new Rat(BigInt(xs.length - 1)));
      return name === 'var' ? v : realSqrt(v);
    }
    case 'pvar': case 'pstd': {
      const v = R.div(ss(), n);
      return name === 'pvar' ? v : realSqrt(v);
    }
    case 'gcd': case 'lcm': {
      const ints = xs.map((x) => { if (!R.isInt(x)) throw new MathError('intarg', { fn: name }); return R.toBig(x); });
      if (name === 'gcd') return new Rat(ints.reduce((g, x) => gcdBig(g, x), 0n));
      return new Rat(ints.reduce((l, x) => (l === 0n || x === 0n ? 0n : (l / gcdBig(l, x)) * (x < 0n ? -x : x)), 1n));
    }
    default: throw new MathError('parse');
  }
}

export { Rat, Dec, isCx, toCx, simplifyCx, C, realSqrt, exactRoot, sinCosAngle, toRadians, fromRadians, MAX };
