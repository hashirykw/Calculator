// Arbitrary-precision decimal floating point (value = m × 10^e, m a BigInt).
// Results keep 64 significant digits; the elementary functions work with
// guard digits in BigInt fixed point and round once at the end. This is what
// lets the calculator recognise exact forms (½, √3/2, 2√2) safely.

import { MathError, Rat } from './rational.js';

export const PREC = 64;          // significant digits kept in results
const GUARD = 18;                // extra digits used inside functions
const W = PREC + GUARD;          // fixed-point scale for series (10^W)

const P10 = [1n];
const pow10 = (k) => {
  if (k < 0) throw new Error('pow10 negative');
  if (k < 600) {
    while (P10.length <= k) P10.push(P10[P10.length - 1] * 10n);
    return P10[k];
  }
  return 10n ** BigInt(k);
};
const absB = (a) => (a < 0n ? -a : a);
const digits = (a) => (a === 0n ? 1 : absB(a).toString().length);

export class Dec {
  constructor(m, e) { this.m = m; this.e = e; }

  // Round m×10^e to `p` significant digits (half away from zero) and strip zeros.
  static make(m, e, p = PREC) {
    if (m === 0n) return Dec.ZERO;
    const neg = m < 0n;
    let a = neg ? -m : m;
    const len = digits(a);
    if (len > p) {
      const drop = len - p;
      const div = pow10(drop);
      let q = a / div;
      if ((a % div) * 2n >= div) q += 1n;
      a = q;
      e += drop;
    }
    while (a % 10n === 0n) { a /= 10n; e += 1; }
    if (!Number.isSafeInteger(e)) throw new MathError('toolarge');
    return new Dec(neg ? -a : a, e);
  }

  static of(x) {
    if (x instanceof Dec) return x;
    if (x instanceof Rat) return Dec.fromRat(x);
    if (typeof x === 'bigint') return Dec.make(x, 0);
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) throw new MathError(Number.isNaN(x) ? 'undefined' : 'toolarge');
      if (Number.isInteger(x) && Math.abs(x) < 2 ** 53) return Dec.make(BigInt(x), 0);
      return Dec.parse(x.toExponential(16));
    }
    return Dec.parse(String(x));
  }

  static parse(s) {
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s.trim());
    if (!m) throw new MathError('parse', { text: s });
    const frac = m[3] || '';
    let mant = BigInt((m[2] || '0') + frac);
    if (m[1] === '-') mant = -mant;
    return Dec.make(mant, (m[4] ? parseInt(m[4], 10) : 0) - frac.length);
  }

  static fromRat(r, p = PREC) {
    if (r.d === 1n) return Dec.make(r.n, 0, p);
    // Scale the numerator so the quotient carries p + 2 digits.
    const shift = Math.max(0, p + 2 + digits(r.d) - digits(r.n));
    return Dec.make((r.n * pow10(shift)) / r.d, -shift, p);
  }

  get isZero() { return this.m === 0n; }
  get sign() { return this.m === 0n ? 0 : (this.m < 0n ? -1 : 1); }
  get isInt() { return this.e >= 0; }
  // Position of the leading digit: 10^(mag-1) <= |x| < 10^mag.
  get mag() { return digits(this.m) + this.e; }

  neg() { return new Dec(-this.m, this.e); }
  abs() { return this.m < 0n ? this.neg() : this; }

  add(b, p = PREC) {
    b = Dec.of(b);
    if (this.isZero) return Dec.make(b.m, b.e, p);
    if (b.isZero) return Dec.make(this.m, this.e, p);
    // If one operand is far below the other's precision it cannot change it.
    if (this.mag - b.mag > p + 4) return Dec.make(this.m, this.e, p);
    if (b.mag - this.mag > p + 4) return Dec.make(b.m, b.e, p);
    if (this.e >= b.e) return Dec.make(this.m * pow10(this.e - b.e) + b.m, b.e, p);
    return Dec.make(this.m + b.m * pow10(b.e - this.e), this.e, p);
  }
  sub(b, p = PREC) { return this.add(Dec.of(b).neg(), p); }
  mul(b, p = PREC) { b = Dec.of(b); return Dec.make(this.m * b.m, this.e + b.e, p); }
  div(b, p = PREC) {
    b = Dec.of(b);
    if (b.isZero) throw new MathError('divzero');
    if (this.isZero) return Dec.ZERO;
    const shift = Math.max(0, p + 3 + digits(b.m) - digits(this.m));
    return Dec.make((this.m * pow10(shift)) / b.m, this.e - b.e - shift, p);
  }
  cmp(b) {
    b = Dec.of(b);
    const d = this.sub(b, PREC + 10);
    return d.sign;
  }
  eq(b) { return this.cmp(b) === 0; }

  toRat() {
    return this.e >= 0 ? new Rat(this.m * pow10(this.e), 1n) : new Rat(this.m, pow10(-this.e));
  }
  // Nearest integer as BigInt (half away from zero).
  roundInt() {
    if (this.e >= 0) return this.m * pow10(this.e);
    const div = pow10(-this.e);
    const a = absB(this.m);
    let q = a / div;
    if ((a % div) * 2n >= div) q += 1n;
    return this.m < 0n ? -q : q;
  }
  toNumber() {
    if (this.isZero) return 0;
    return Number(`${this.m}e${this.e}`);
  }
  toString() { return `${this.m}e${this.e}`; }
}
Dec.ZERO = new Dec(0n, 0);
Dec.ONE = new Dec(1n, 0);

// ---------- fixed-point helpers (value = X / 10^w) ----------

function toFixed(x, w) {
  const k = x.e + w;
  if (k >= 0) return x.m * pow10(k);
  const div = pow10(-k);
  const a = absB(x.m);
  let q = a / div;
  if ((a % div) * 2n >= div) q += 1n;
  return x.m < 0n ? -q : q;
}
const fromFixed = (X, w, p = PREC) => Dec.make(X, -w, p);

function isqrt(n) {
  if (n < 0n) throw new MathError('nonreal');
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

// atan(1/k) in fixed point, used for pi (Machin's formula).
function atanInv(k, w) {
  const S = pow10(w);
  const kk = BigInt(k);
  const k2 = kk * kk;
  let term = S / kk;
  let sum = term;
  for (let n = 1; term !== 0n; n++) {
    term /= k2;
    const t = term / BigInt(2 * n + 1);
    sum += n % 2 ? -t : t;
  }
  return sum;
}

// atanh(z) = z + z^3/3 + z^5/5 + ... for small fixed-point Z.
function atanhFixed(Z, w) {
  const S = pow10(w);
  const z2 = (Z * Z) / S;
  let p = Z;
  let sum = Z;
  for (let k = 1; ; k++) {
    p = (p * z2) / S;
    const t = p / BigInt(2 * k + 1);
    if (t === 0n) break;
    sum += t;
  }
  return sum;
}

const cache = { pi: { w: 0, v: 0n }, ln10: { w: 0, v: 0n }, ln2: { w: 0, v: 0n } };
function piFixed(w) {
  if (cache.pi.w >= w) return cache.pi.v / pow10(cache.pi.w - w);
  const ww = w + 10;
  const v = 16n * atanInv(5, ww) - 4n * atanInv(239, ww);
  cache.pi = { w: ww, v };
  return v / pow10(10);
}
function ln2Fixed(w) {
  if (cache.ln2.w >= w) return cache.ln2.v / pow10(cache.ln2.w - w);
  const ww = w + 10;
  const v = 2n * atanhFixed(pow10(ww) / 3n, ww);
  cache.ln2 = { w: ww, v };
  return v / pow10(10);
}
function ln10Fixed(w) {
  if (cache.ln10.w >= w) return cache.ln10.v / pow10(cache.ln10.w - w);
  const ww = w + 10;
  // ln 10 = 3 ln 2 + ln 1.25, ln 1.25 = 2 atanh(1/9)
  const v = 3n * ln2Fixed(ww) + 2n * atanhFixed(pow10(ww) / 9n, ww);
  cache.ln10 = { w: ww, v };
  return v / pow10(10);
}

// ---------- elementary functions on Dec ----------

export const D = {
  pi(p = PREC) { return fromFixed(piFixed(p + 4), p + 4, p); },
  e(p = PREC) { return D.exp(Dec.ONE, p); },

  sqrt(x, p = PREC) {
    x = Dec.of(x);
    if (x.sign < 0) throw new MathError('sqrtneg');
    if (x.isZero) return Dec.ZERO;
    // make exponent even and give the radicand 2p + 4 digits
    let m = x.m, e = x.e;
    let k = Math.max(0, 2 * (p + 4) - digits(m));
    if ((e - k) % 2 !== 0) k += 1;
    m *= pow10(k);
    e -= k;
    return Dec.make(isqrt(m), e / 2, p);
  },

  exp(x, p = PREC) {
    x = Dec.of(x);
    if (x.isZero) return Dec.ONE;
    const xn = x.toNumber();
    if (xn > 1e7) throw new MathError('toolarge');
    if (xn < -1e7) return Dec.ZERO;
    const w = p + GUARD;
    const S = pow10(w);
    const k = Math.round(xn / Math.LN10);
    let R = toFixed(x, w) - BigInt(k) * ln10Fixed(w);
    // halve 10 times, Taylor, then square back
    const halves = 10;
    R /= 1n << BigInt(halves);
    let term = S, sum = S;
    for (let n = 1n; term !== 0n; n++) {
      term = (term * R) / S / n;
      sum += term;
    }
    for (let i = 0; i < halves; i++) sum = (sum * sum) / S;
    return Dec.make(sum, -w + k, p);
  },

  ln(x, p = PREC) {
    x = Dec.of(x);
    if (x.isZero) throw new MathError('logzero');
    if (x.sign < 0) throw new MathError('logneg');
    const w = p + GUARD;
    const S = pow10(w);
    const d = digits(x.m);
    const E = x.e + d - 1;                    // x = a × 10^E, 1 <= a < 10
    let A = (x.m * S) / pow10(d - 1);         // a in fixed point
    let lnA = 0n;
    if (A !== S) {
      const roots = 7;                        // a^(1/128) is within 2% of 1
      for (let i = 0; i < roots; i++) A = isqrt(A * S);
      const Z = ((A - S) * S) / (A + S);
      lnA = 2n * atanhFixed(Z, w) * (1n << BigInt(roots));
    }
    return Dec.make(lnA + BigInt(E) * ln10Fixed(w), -w, p);
  },

  log10(x, p = PREC) {
    x = Dec.of(x);
    if (x.sign > 0 && absB(x.m) === 1n) return Dec.make(BigInt(x.e), 0, p); // exact powers of ten
    return D.ln(x, p + 4).div(D.ln(Dec.of(10), p + 4), p);
  },

  // sin and cos together for radians.
  sinCos(x, p = PREC) {
    x = Dec.of(x);
    const w = p + GUARD + Math.max(0, x.mag);
    const X = toFixed(x, w);
    const HP = piFixed(w) / 2n;
    let q = X >= 0n ? (X + HP / 2n) / HP : -((-X + HP / 2n) / HP);
    const R = X - q * HP;
    return D.sinCosQuadrant(Number(((q % 4n) + 4n) % 4n), fromFixed(R, w, p + GUARD), p);
  },

  // Given quadrant q and reduced angle r (|r| <= pi/4, radians).
  sinCosQuadrant(q, r, p = PREC) {
    const w = p + GUARD;
    const S = pow10(w);
    const R = toFixed(r, w);
    const R2 = (R * R) / S;
    let ts = R, s = R, tc = S, c = S;
    for (let k = 1n; ts !== 0n || tc !== 0n; k++) {
      ts = -(ts * R2) / S / ((2n * k) * (2n * k + 1n));
      tc = -(tc * R2) / S / ((2n * k - 1n) * (2n * k));
      s += ts;
      c += tc;
    }
    const sv = [s, c, -s, -c][q];
    const cv = [c, -s, -c, s][q];
    return { s: Dec.make(sv, -w, p), c: Dec.make(cv, -w, p) };
  },

  atan(x, p = PREC) {
    x = Dec.of(x);
    if (x.isZero) return Dec.ZERO;
    const w = p + GUARD;
    const S = pow10(w);
    const neg = x.sign < 0;
    let t = x.abs();
    let invert = false;
    if (t.cmp(Dec.ONE) > 0) { t = Dec.ONE.div(t, w); invert = true; }
    let T = toFixed(t, w);
    const halvings = 4;
    for (let i = 0; i < halvings; i++) {
      // tan(a/2) = t / (1 + sqrt(1 + t^2))
      const root = isqrt(S * S + T * T);
      T = (T * S) / (S + root);
    }
    const T2 = (T * T) / S;
    let pw = T, sum = T;
    for (let k = 1; ; k++) {
      pw = (pw * T2) / S;
      const term = pw / BigInt(2 * k + 1);
      if (term === 0n) break;
      sum += k % 2 ? -term : term;
    }
    sum *= 1n << BigInt(halvings);
    if (invert) sum = piFixed(w) / 2n - sum;
    return Dec.make(neg ? -sum : sum, -w, p);
  },

  asin(x, p = PREC) {
    x = Dec.of(x);
    const c = x.abs().cmp(Dec.ONE);
    if (c > 0) throw new MathError('domain', { fn: 'asin' });
    if (c === 0) return x.sign > 0 ? D.pi(p + 2).div(2, p) : D.pi(p + 2).div(-2, p);
    const w = p + 6;
    return D.atan(x.div(D.sqrt(Dec.ONE.sub(x.mul(x, w), w), w), w), p);
  },

  acos(x, p = PREC) {
    x = Dec.of(x);
    if (x.abs().cmp(Dec.ONE) > 0) throw new MathError('domain', { fn: 'acos' });
    return D.pi(p + 4).div(2, p + 4).sub(D.asin(x, p + 4), p);
  },

  // x^y for real y. Integer y uses repeated squaring; otherwise exp(y ln x).
  pow(x, y, p = PREC) {
    x = Dec.of(x);
    y = Dec.of(y);
    if (y.isZero) return Dec.ONE;
    if (y.isInt && y.mag <= 10) {
      let k = y.roundInt();
      if (x.isZero) {
        if (k < 0n) throw new MathError('divzero');
        return Dec.ZERO;
      }
      // Estimate the size first so 10^(10^9) fails fast.
      const est = Number(k) * Math.log10(Math.abs(x.toNumber()) || 10 ** x.mag);
      if (Number.isFinite(est) && Math.abs(est) > 1e7) {
        if (est > 0) throw new MathError('toolarge');
        return Dec.ZERO;
      }
      const neg = k < 0n;
      if (neg) k = -k;
      const wp = p + GUARD;
      let r = Dec.ONE, b = x;
      while (k > 0n) {
        if (k & 1n) r = r.mul(b, wp);
        k >>= 1n;
        if (k) b = b.mul(b, wp);
      }
      return neg ? Dec.ONE.div(r, p) : Dec.make(r.m, r.e, p);
    }
    if (x.isZero) {
      if (y.sign < 0) throw new MathError('divzero');
      return Dec.ZERO;
    }
    if (x.sign < 0) throw new MathError('nonreal');
    const wp = p + GUARD;
    return D.exp(y.mul(D.ln(x, wp), wp), p);
  },

  sinh(x, p = PREC) { const a = D.exp(x, p + 6); return a.sub(Dec.ONE.div(a, p + 6), p + 6).div(2, p); },
  cosh(x, p = PREC) { const a = D.exp(x, p + 6); return a.add(Dec.ONE.div(a, p + 6), p + 6).div(2, p); },
  tanh(x, p = PREC) {
    x = Dec.of(x);
    if (x.toNumber() > 200) return Dec.ONE;
    if (x.toNumber() < -200) return Dec.ONE.neg();
    const a = D.exp(x.mul(2), p + 6);
    return a.sub(1, p + 6).div(a.add(1, p + 6), p);
  },
  asinh(x, p = PREC) { x = Dec.of(x); const w = p + 6; return D.ln(x.add(D.sqrt(x.mul(x, w).add(1, w), w), w), p); },
  acosh(x, p = PREC) {
    x = Dec.of(x);
    if (x.cmp(Dec.ONE) < 0) throw new MathError('domain', { fn: 'acosh' });
    const w = p + 6;
    return D.ln(x.add(D.sqrt(x.mul(x, w).sub(1, w), w), w), p);
  },
  atanh(x, p = PREC) {
    x = Dec.of(x);
    if (x.abs().cmp(Dec.ONE) >= 0) throw new MathError('domain', { fn: 'atanh' });
    const w = p + 6;
    return D.ln(Dec.ONE.add(x, w).div(Dec.ONE.sub(x, w), w), w).div(2, p);
  },
};

export { isqrt, pow10 };
