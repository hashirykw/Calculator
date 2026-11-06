// Exact rational numbers on BigInt.
// Used wherever an answer can be exact: keypad arithmetic, fractions, matrices,
// polynomial coefficients. 0.1 + 0.2 is 3/10 here, never 0.30000000000000004.

const gcdBig = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};

export class Rat {
  constructor(n, d = 1n) {
    if (d === 0n) throw new MathError('divzero');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcdBig(n, d);
    this.n = g > 1n ? n / g : n;
    this.d = g > 1n ? d / g : d;
  }

  static of(v) {
    if (v instanceof Rat) return v;
    if (typeof v === 'bigint') return new Rat(v, 1n);
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return new Rat(BigInt(v), 1n);
      return Rat.parse(String(v));
    }
    return Rat.parse(String(v));
  }

  // Parses "12", "-0.125", "3.5e-4", "1/3" exactly.
  static parse(s) {
    s = s.trim();
    const slash = s.indexOf('/');
    if (slash > 0) return Rat.parse(s.slice(0, slash)).div(Rat.parse(s.slice(slash + 1)));
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) throw new MathError('parse', { text: s });
    const sign = m[1] === '-' ? -1n : 1n;
    const intPart = m[2] || '0';
    const frac = m[3] || '';
    let exp = m[4] ? parseInt(m[4], 10) : 0;
    let n = BigInt(intPart + frac) * sign;
    exp -= frac.length;
    if (Math.abs(exp) > 400) throw new MathError('toolarge');
    return exp >= 0 ? new Rat(n * 10n ** BigInt(exp), 1n) : new Rat(n, 10n ** BigInt(-exp));
  }

  get isZero() { return this.n === 0n; }
  get isInt() { return this.d === 1n; }
  get isNeg() { return this.n < 0n; }
  get sign() { return this.n === 0n ? 0 : (this.n < 0n ? -1 : 1); }

  add(b) { b = Rat.of(b); return new Rat(this.n * b.d + b.n * this.d, this.d * b.d); }
  sub(b) { b = Rat.of(b); return new Rat(this.n * b.d - b.n * this.d, this.d * b.d); }
  mul(b) { b = Rat.of(b); return new Rat(this.n * b.n, this.d * b.d); }
  div(b) {
    b = Rat.of(b);
    if (b.n === 0n) throw new MathError('divzero');
    return new Rat(this.n * b.d, this.d * b.n);
  }
  neg() { return new Rat(-this.n, this.d); }
  abs() { return this.n < 0n ? this.neg() : this; }
  inv() { return Rat.ONE.div(this); }
  cmp(b) { b = Rat.of(b); const x = this.n * b.d - b.n * this.d; return x === 0n ? 0 : (x < 0n ? -1 : 1); }
  eq(b) { return this.cmp(b) === 0; }

  // Integer powers only (exact). Guards against absurd sizes.
  pow(k) {
    k = typeof k === 'bigint' ? k : BigInt(k);
    if (k === 0n) return Rat.ONE;
    if (k < 0n) return this.inv().pow(-k);
    const bits = (this.n < 0n ? -this.n : this.n).toString(2).length + this.d.toString(2).length;
    if (Number(k) * bits > 1_200_000) throw new MathError('toolarge');
    return new Rat(this.n ** k, this.d ** k);
  }

  floor() {
    const q = this.n / this.d;
    return (this.n < 0n && q * this.d !== this.n) ? q - 1n : q;
  }

  toNumber() {
    // Avoid overflow for huge numerator/denominator by scaling via strings.
    const n = Number(this.n), d = Number(this.d);
    if (Number.isFinite(n) && Number.isFinite(d)) return n / d;
    const ln = this.n.toString().length, ld = this.d.toString().length;
    const shift = Math.max(0, Math.max(ln, ld) - 300);
    const s = 10n ** BigInt(shift);
    return Number(this.n / s) / Number(this.d / s);
  }

  // True when the decimal expansion terminates (denominator is 2^a 5^b).
  get terminates() {
    let d = this.d;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    return d === 1n;
  }

  toString() { return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`; }
}

Rat.ZERO = new Rat(0n, 1n);
Rat.ONE = new Rat(1n, 1n);
Rat.TWO = new Rat(2n, 1n);
Rat.HALF = new Rat(1n, 2n);
Rat.NEG_ONE = new Rat(-1n, 1n);

export { gcdBig };

// One error type for every maths failure, with a code the UI turns into a
// plain-language message (see i18n "err.*" keys).
export class MathError extends Error {
  constructor(code, info = {}) {
    super(code);
    this.code = code;
    this.info = info;
  }
}
