// Number bases 2–36 (with fractions and repeating digits), two's complement,
// bitwise operations and text <-> code points.

import { Rat, MathError } from './rational.js';

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Parse "-1A.8" in base b to an exact rational.
export function parseBase(str, base) {
  let s = String(str).trim().toUpperCase().replace(/[\s_]/g, '');
  if (!s) throw new MathError('empty');
  let neg = false;
  if (s[0] === '-' || s[0] === '−') { neg = true; s = s.slice(1); }
  const [ip, fp = ''] = s.split('.');
  if (s.split('.').length > 2) throw new MathError('parse');
  const B = BigInt(base);
  let n = 0n;
  for (const ch of ip || '0') {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) throw new MathError('digit', { ch, base });
    n = n * B + BigInt(d);
  }
  let frac = 0n;
  for (const ch of fp) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) throw new MathError('digit', { ch, base });
    frac = frac * B + BigInt(d);
  }
  let r = new Rat(n * B ** BigInt(fp.length) + frac, B ** BigInt(fp.length));
  return neg ? r.neg() : r;
}

// Format an exact rational in base b. Repeating fraction digits are found
// exactly and returned separately: {int, frac, repeat, text}.
export function toBase(r, base, maxDigits = 64) {
  r = Rat.of(r);
  const neg = r.isNeg;
  const a = r.abs();
  const B = BigInt(base);
  let ip = a.n / a.d;
  let rem = a.n % a.d;
  let int = '';
  if (ip === 0n) int = '0';
  while (ip > 0n) { int = DIGITS[Number(ip % B)] + int; ip /= B; }
  let frac = '';
  const seen = new Map();
  let repeatAt = -1;
  while (rem !== 0n && frac.length < maxDigits) {
    if (seen.has(rem)) { repeatAt = seen.get(rem); break; }
    seen.set(rem, frac.length);
    rem *= B;
    frac += DIGITS[Number(rem / a.d)];
    rem %= a.d;
  }
  const truncated = rem !== 0n && repeatAt < 0;
  const fixed = repeatAt >= 0 ? frac.slice(0, repeatAt) : frac;
  const repeat = repeatAt >= 0 ? frac.slice(repeatAt) : '';
  const text = (neg ? '-' : '') + int + (frac ? '.' + fixed + (repeat ? `(${repeat})` : '') + (truncated ? '…' : '') : '');
  return { neg, int, frac: fixed, repeat, truncated, text };
}

export function twosComplement(n, bits) {
  n = BigInt(n);
  const lim = 1n << BigInt(bits - 1);
  if (n < -lim || n >= lim) throw new MathError('range', { bits });
  const v = n < 0n ? (1n << BigInt(bits)) + n : n;
  return v.toString(2).padStart(bits, '0');
}
export function fromTwosComplement(bin, bits) {
  const v = BigInt('0b' + bin.padStart(bits, '0'));
  return v >= 1n << BigInt(bits - 1) ? v - (1n << BigInt(bits)) : v;
}

export function bitwise(op, a, b, bits = 32) {
  const mask = (1n << BigInt(bits)) - 1n;
  const ua = BigInt.asUintN(bits, BigInt(a)), ub = BigInt.asUintN(bits, BigInt(b));
  let r;
  switch (op) {
    case 'and': r = ua & ub; break;
    case 'or': r = ua | ub; break;
    case 'xor': r = ua ^ ub; break;
    case 'not': r = ~ua & mask; break;
    case 'shl': r = (ua << ub) & mask; break;
    case 'shr': r = ua >> ub; break;
    default: throw new MathError('parse');
  }
  return { unsigned: r, signed: BigInt.asIntN(bits, r) };
}

export const textToCodes = (s) => [...s].map((ch) => ch.codePointAt(0));
export function codesToText(list) {
  return list.map((c) => {
    if (!Number.isInteger(c) || c < 0 || c > 0x10ffff) throw new MathError('range');
    return String.fromCodePoint(c);
  }).join('');
}
export const isControl = (c) => c < 32 || c === 127;
