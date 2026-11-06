// Physics and chemistry helpers.
//
// Atomic masses: IUPAC/CIAAW abridged standard atomic weights (2021 table),
// conventional values; bracketed mass numbers for elements with no stable
// isotope. The "1 d.p." option rounds them the way Cambridge data booklets
// print relative atomic masses. TO REVIEW: ask a chemistry teacher to check
// this table against the data booklet your students use before launch.

import { MathError } from './rational.js';

export const ELEMENTS = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180,
  Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.95, K: 39.098, Ca: 40.078,
  Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
  Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224,
  Nb: 92.906, Mo: 95.95, Tc: 98, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71,
  Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29, Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24,
  Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.50, Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05,
  Lu: 174.97, Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59,
  Tl: 204.38, Pb: 207.2, Bi: 208.98, Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227, Th: 232.04, Pa: 231.04, U: 238.03,
};
export const AVOGADRO = 6.02214076e23;   // exact (SI 2019)

// Parse formulas like H2SO4, Ca(OH)2, (NH4)2SO4, CuSO4·5H2O.
export function parseFormula(src) {
  const s = String(src).replace(/\s+/g, '').replace(/[·•*]/g, '.');
  if (!s) throw new MathError('empty');
  const parts = s.split('.');
  const total = {};
  for (const part of parts) {
    const m = /^(\d*)(.*)$/.exec(part);
    const mult = m[1] ? parseInt(m[1], 10) : 1;
    const counts = group(m[2]);
    for (const [el, n] of Object.entries(counts)) total[el] = (total[el] || 0) + n * mult;
  }
  return total;

  function group(str) {
    let i = 0;
    const read = () => {
      const counts = {};
      while (i < str.length) {
        const c = str[i];
        if (c === '(' || c === '[') {
          i++;
          const inner = read();
          if (str[i] !== ')' && str[i] !== ']') throw new MathError('bracket');
          i++;
          const n = num();
          for (const [el, k] of Object.entries(inner)) counts[el] = (counts[el] || 0) + k * n;
        } else if (c === ')' || c === ']') {
          return counts;
        } else if (/[A-Z]/.test(c)) {
          let el = c;
          i++;
          if (/[a-z]/.test(str[i] || '')) { el += str[i]; i++; }
          if (!(el in ELEMENTS)) throw new MathError('element', { el });
          const n = num();
          counts[el] = (counts[el] || 0) + n;
        } else {
          throw new MathError('parse', { pos: i, near: c });
        }
      }
      return counts;
    };
    const num = () => {
      let j = i;
      while (/\d/.test(str[j] || '')) j++;
      const n = j > i ? parseInt(str.slice(i, j), 10) : 1;
      i = j;
      return n;
    };
    const out = read();
    if (i < str.length) throw new MathError('bracket');
    return out;
  }
}

export function molarMass(formula, oneDp = false) {
  const counts = parseFormula(formula);
  const rows = Object.entries(counts).map(([el, n]) => {
    const ar = oneDp ? Math.round(ELEMENTS[el] * 10) / 10 : ELEMENTS[el];
    return { el, n, ar, subtotal: ar * n };
  });
  return { rows, total: rows.reduce((s, r) => s + r.subtotal, 0) };
}

// SUVAT: give any three of s, u, v, a, t (numbers); returns all five.
// Can return two solutions when t comes from a quadratic.
export function suvat(k) {
  const known = ['s', 'u', 'v', 'a', 't'].filter((x) => Number.isFinite(k[x]));
  if (known.length < 3) return { error: 'three' };
  const out = [];
  const add = (o, eq) => {
    const all = { ...k, ...o };
    if (['s', 'u', 'v', 'a', 't'].every((x) => Number.isFinite(all[x])) && all.t >= -1e-12) out.push({ ...all, eq });
  };
  const { s, u, v, a, t } = k;
  const has = (...xs) => xs.every((x) => Number.isFinite(k[x]));
  if (has('u', 'a', 't')) add({ v: u + a * t, s: u * t + 0.5 * a * t * t }, ['v = u + at', 's = ut + ½at²']);
  else if (has('u', 'v', 't')) add({ a: (v - u) / t, s: ((u + v) / 2) * t }, ['a = (v − u)/t', 's = ½(u + v)t']);
  else if (has('v', 'a', 't')) add({ u: v - a * t, s: v * t - 0.5 * a * t * t }, ['u = v − at', 's = vt − ½at²']);
  else if (has('s', 'u', 't')) { const aa = (2 * (s - u * t)) / (t * t); add({ a: aa, v: u + aa * t }, ['a = 2(s − ut)/t²', 'v = u + at']); }
  else if (has('s', 'v', 't')) { const aa = (2 * (v * t - s)) / (t * t); add({ a: aa, u: v - aa * t }, ['a = 2(vt − s)/t²', 'u = v − at']); }
  else if (has('s', 'u', 'v')) { const tt = (2 * s) / (u + v); add({ t: tt, a: (v - u) / tt }, ['t = 2s/(u + v)', 'a = (v − u)/t']); }
  else if (has('u', 'v', 'a')) { const tt = (v - u) / a; add({ t: tt, s: (v * v - u * u) / (2 * a) }, ['t = (v − u)/a', 's = (v² − u²)/2a']); }
  else if (has('s', 'u', 'a')) {
    const v2 = u * u + 2 * a * s;
    if (v2 < 0) return { error: 'nosolution' };
    for (const vv of [Math.sqrt(v2), -Math.sqrt(v2)]) add({ v: vv, t: a === 0 ? s / u : (vv - u) / a }, ['v² = u² + 2as', 't = (v − u)/a']);
  } else if (has('s', 'v', 'a')) {
    const u2 = v * v - 2 * a * s;
    if (u2 < 0) return { error: 'nosolution' };
    for (const uu of [Math.sqrt(u2), -Math.sqrt(u2)]) add({ u: uu, t: a === 0 ? s / v : (v - uu) / a }, ['u² = v² − 2as', 't = (v − u)/a']);
  } else if (has('s', 'a', 't')) { const uu = (s - 0.5 * a * t * t) / t; add({ u: uu, v: uu + a * t }, ['u = (s − ½at²)/t', 'v = u + at']); }
  // dedupe
  const seen = new Set();
  const uniq = out.filter((o) => { const key = ['s', 'u', 'v', 'a', 't'].map((x) => o[x].toPrecision(9)).join(','); if (seen.has(key)) return false; seen.add(key); return true; });
  return uniq.length ? { solutions: uniq } : { error: 'nosolution' };
}
