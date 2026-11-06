// Exact-form recognition for the S⇔D key: turns a 64-digit result back into
// a fraction, a surd or a multiple of π when it matches one to ~50 digits.
// A match that close cannot be a coincidence for numbers people type.

import { Rat, gcdBig } from './rational.js';
import { Dec, D } from './decimal.js';
import { Cx } from './numeval.js';

const TOL_EXP = -48;        // |difference| must be below 10^-48 (relative)

function closeEnough(a, b) {
  const diff = a.sub(b, 80);
  if (diff.isZero) return true;
  const scale = Math.max(1, a.abs().mag);
  return diff.mag - scale < TOL_EXP;
}

// Best rational approximation with denominator <= maxDen (continued fractions).
function bestRational(x, maxDen) {
  let neg = x.sign < 0;
  let r = x.abs();
  let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n;
  let best = null;
  for (let i = 0; i < 80; i++) {
    const a = r.roundInt() > 0n && r.sub(Dec.make(r.roundInt(), 0), 80).sign < 0 ? r.roundInt() - 1n : r.roundInt();
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > BigInt(maxDen)) break;
    best = new Rat(neg ? -h2 : h2, k2);
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    const frac = r.sub(Dec.make(a, 0), 80);
    if (frac.isZero || frac.mag < -60) break;
    r = Dec.ONE.div(frac, 80);
  }
  return best;
}

function squareFreeSplit(n) {
  // n = s^2 * r with r square-free (trial division, fine for the sizes we see)
  let s = 1n, r = 1n;
  let m = n;
  for (let p = 2n; p * p <= m && p < 100000n; p++) {
    let c = 0;
    while (m % p === 0n) { m /= p; c++; }
    if (c) { s *= p ** BigInt(c >> 1); if (c & 1) r *= p; }
  }
  return { s, r: r * m };
}

const fracLatex = (num, den) => (den === '1' ? num : `\\frac{${num}}{${den}}`);
const fracText = (num, den) => (den === '1' ? num : `${num}/${den}`);

function ratForm(q) {
  const neg = q.isNeg;
  const n = (neg ? -q.n : q.n).toString(), d = q.d.toString();
  return { latex: (neg ? '-' : '') + fracLatex(n, d), text: (neg ? '−' : '') + fracText(n, d), kind: q.isInt ? 'integer' : 'fraction' };
}

// v = sign * (s * sqrt(r)) / t
function surdForm(sign, s, r, t) {
  const coef = s === 1n ? '' : s.toString();
  const latexNum = `${coef}\\sqrt{${r}}`;
  const textNum = `${coef}√${r}`;
  const sg = sign < 0 ? '-' : '';
  return {
    latex: sg + fracLatex(latexNum, t.toString()),
    text: (sign < 0 ? '−' : '') + (t === 1n ? textNum : `${textNum}/${t}`),
    kind: 'surd',
  };
}

const SQUAREFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30, 31, 33, 34, 35, 37, 38, 39, 41, 42, 43, 46, 47];

export function recognizeReal(v) {
  if (v instanceof Rat) return v.isInt || v.d > 10000000n ? null : ratForm(v);
  const x = Dec.of(v);
  if (x.isZero) return { latex: '0', text: '0', kind: 'integer' };
  // 1. rational
  const q = bestRational(x, 1e6);
  if (q && closeEnough(x, Dec.fromRat(q, 80))) return ratForm(q);
  // 2. ±sqrt(p/q)
  const sq = x.mul(x, 80);
  const q2 = bestRational(sq, 1e5);
  if (q2 && !q2.isZero && closeEnough(sq, Dec.fromRat(q2, 80))) {
    // sqrt(n/d) = sqrt(n*d)/d
    const { s, r } = squareFreeSplit(q2.n * q2.d);
    if (r !== 1n) {
      const g = gcdBig(s, q2.d);
      return surdForm(x.sign, s / g, r, q2.d / g);
    }
  }
  // 3. (a + b sqrt(n)) / t, screened in doubles then confirmed in 64 digits
  const xf = x.toNumber();
  for (const n of SQUAREFREE) {
    const rn = Math.sqrt(n);
    for (let t = 1; t <= 12; t++) {
      for (let b = -12; b <= 12; b++) {
        if (!b) continue;
        const a = Math.round(t * xf - b * rn);
        if (a === 0 || Math.abs(t * xf - b * rn - a) > 1e-9) continue;
        const exact = Dec.of(a).add(D.sqrt(Dec.of(n), 80).mul(b, 80), 80).div(t, 80);
        if (!closeEnough(x, exact)) continue;
        const g = Number(gcdBig(gcdBig(BigInt(a), BigInt(b)), BigInt(t)));
        const A = a / g, B = b / g, T = t / g;
        const bAbs = Math.abs(B);
        const surdL = `${bAbs === 1 ? '' : bAbs}\\sqrt{${n}}`;
        const surdT = `${bAbs === 1 ? '' : bAbs}√${n}`;
        const numL = `${A} ${B < 0 ? '-' : '+'} ${surdL}`;
        const numT = `${A} ${B < 0 ? '−' : '+'} ${surdT}`;
        return {
          latex: T === 1 ? numL : `\\frac{${numL}}{${T}}`,
          text: T === 1 ? numT : `(${numT})/${T}`,
          kind: 'surd',
        };
      }
    }
  }
  // 4. rational multiple of pi
  const pi = D.pi(80);
  const k = x.div(pi, 80);
  const qk = bestRational(k, 360);
  if (qk && closeEnough(k, Dec.fromRat(qk, 80))) {
    const neg = qk.isNeg;
    const n = neg ? -qk.n : qk.n;
    const num = n === 1n ? 'π' : `${n}π`;
    const numL = n === 1n ? '\\pi' : `${n}\\pi`;
    return {
      latex: (neg ? '-' : '') + fracLatex(numL, qk.d.toString()),
      text: (neg ? '−' : '') + (qk.d === 1n ? num : `${num}/${qk.d}`),
      kind: 'pi',
    };
  }
  return null;
}

export function recognize(v) {
  if (v instanceof Cx) {
    const re = v.re.isZero ? { latex: '0', text: '0' } : (recognizeReal(v.re) || null);
    const im = recognizeReal(v.im.abs()) || (v.im.abs() instanceof Rat ? { latex: v.im.abs().toString(), text: v.im.abs().toString() } : null);
    if (!re || !im) return null;
    const imL = im.latex === '1' ? 'i' : `${im.latex}i`;
    const imT = im.text === '1' ? 'i' : `${im.text}i`;
    if (v.re.isZero) return { latex: (v.im.sign < 0 ? '-' : '') + imL, text: (v.im.sign < 0 ? '−' : '') + imT, kind: 'complex' };
    const sg = v.im.sign < 0;
    return { latex: `${re.latex} ${sg ? '-' : '+'} ${imL}`, text: `${re.text} ${sg ? '−' : '+'} ${imT}`, kind: 'complex' };
  }
  if (Array.isArray(v)) return null;
  return recognizeReal(v);
}

// Mixed number for the a b/c key: 7/3 -> 2 1/3.
export function mixedNumber(q) {
  if (!(q instanceof Rat) || q.isInt) return null;
  const neg = q.isNeg;
  const a = q.abs();
  const whole = a.n / a.d;
  if (whole === 0n) return null;
  const rem = a.n - whole * a.d;
  return {
    latex: `${neg ? '-' : ''}${whole}\\tfrac{${rem}}{${a.d}}`,
    text: `${neg ? '−' : ''}${whole} ${rem}/${a.d}`,
  };
}

export { bestRational };
