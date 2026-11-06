// Number formatting for every screen: significant figures, scientific
// notation thresholds, thousands or lakh/crore grouping, complex numbers.

import { Rat } from './rational.js';
import { Dec } from './decimal.js';
import { Cx } from './numeval.js';

const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
export const toSuperscript = (s) => String(s).split('').map((c) => SUP[c] || c).join('');

export const DEFAULT_FMT = { sig: 10, sciHigh: 12, sciLow: -6, group: 'intl', ascii: false };

function groupInt(s, style) {
  if (style === 'none' || s.length <= 3) return s;
  if (style === 'lakh') {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts = [];
    while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest) parts.unshift(rest);
    return parts.join(',') + ',' + last3;
  }
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Format a real value (Rat or Dec) to a display string.
export function formatReal(v, opts = {}) {
  const o = { ...DEFAULT_FMT, ...opts };
  const minus = o.ascii ? '-' : '−';
  if (v instanceof Rat && v.isZero) return '0';
  const d = v instanceof Dec ? v : Dec.fromRat(v, 70);
  if (d.isZero) return '0';
  const neg = d.sign < 0;
  const exactInt = (v instanceof Rat && v.isInt) || (v instanceof Dec && v.isInt);
  let digits, exp10;
  if (exactInt && d.mag <= o.sciHigh) {
    const big = d.e >= 0 ? (d.m < 0n ? -d.m : d.m) * 10n ** BigInt(d.e) : 0n;
    const s = big.toString();
    return (neg ? minus : '') + groupInt(s, o.group);
  }
  const r = Dec.make(d.m < 0n ? -d.m : d.m, d.e, o.sig);
  digits = r.m.toString();
  exp10 = digits.length + r.e - 1;   // value = d.ddd × 10^exp10
  if (exp10 >= o.sciHigh || exp10 < o.sciLow) {
    const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    const e = o.ascii ? `e${exp10}` : ` ×10${toSuperscript(exp10)}`;
    return (neg ? minus : '') + mant + e;
  }
  let intPart, frac;
  if (exp10 >= 0) {
    const padded = digits.padEnd(exp10 + 1, '0');
    intPart = padded.slice(0, exp10 + 1);
    frac = padded.slice(exp10 + 1);
  } else {
    intPart = '0';
    frac = '0'.repeat(-exp10 - 1) + digits;
  }
  frac = frac.replace(/0+$/, '');
  return (neg ? minus : '') + groupInt(intPart, o.group) + (frac ? '.' + frac : '');
}

export function formatValue(v, opts = {}) {
  const o = { ...DEFAULT_FMT, ...opts };
  if (Array.isArray(v)) {
    if (v.length && Array.isArray(v[0])) return '[' + v.map((row) => formatValue(row, o)).join(', ') + ']';
    return '[' + v.map((x) => formatValue(x, o)).join(', ') + ']';
  }
  if (v instanceof Cx) {
    const re = v.re, im = v.im;
    const imAbs = formatReal(im.abs(), o);
    const imPart = (imAbs === '1' ? '' : imAbs) + 'i';
    if (re.isZero) return (im.sign < 0 ? (o.ascii ? '-' : '−') : '') + imPart;
    return `${formatReal(re, o)} ${im.sign < 0 ? (o.ascii ? '-' : '−') : '+'} ${imPart}`;
  }
  return formatReal(v, o);
}

// Plain decimal string for copying (no grouping, ASCII minus, e notation).
export const formatPlain = (v, sig = 15) => formatValue(v, { sig, group: 'none', ascii: true, sciHigh: 15, sciLow: -7 });

// Number -> short string for axes, tables and tools (doubles only).
export function fmtNum(x, sig = 6, opts = {}) {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '—' : (x > 0 ? '∞' : '−∞');
  if (Object.is(x, -0) || Math.abs(x) < 1e-15) x = 0;
  return formatReal(Dec.of(Number(x.toPrecision(Math.min(sig + 2, 17)))), { sig, sciHigh: 9, sciLow: -5, ...opts });
}

// Money with Intl (PKR default) and optional lakh/crore grouping.
export function fmtMoney(x, currency = 'PKR', lakh = false, decimals = 2) {
  if (!Number.isFinite(x)) return '—';
  const locale = lakh ? 'en-IN' : 'en-US';
  try {
    const s = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(x);
    return currency === 'PKR' ? s.replace(/PKR\s?/, 'Rs ') : s;
  } catch {
    return `${currency} ${x.toFixed(decimals)}`;
  }
}
