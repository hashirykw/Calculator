// Exact matrix algebra on rationals: determinant, inverse, rank, RREF, solve,
// powers, plus eigenvalues (exact for 2×2/3×3 via the characteristic
// polynomial when it factors, numeric QR otherwise).

import { Rat, MathError } from './rational.js';

export const M = {
  zeros: (r, c) => Array.from({ length: r }, () => Array(c).fill(Rat.ZERO)),
  identity: (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? Rat.ONE : Rat.ZERO))),
  of: (rows) => rows.map((r) => r.map((v) => Rat.of(v))),
  size: (A) => [A.length, A[0] ? A[0].length : 0],
  clone: (A) => A.map((r) => r.slice()),

  add(A, B) { M.sameSize(A, B); return A.map((r, i) => r.map((v, j) => v.add(B[i][j]))); },
  sub(A, B) { M.sameSize(A, B); return A.map((r, i) => r.map((v, j) => v.sub(B[i][j]))); },
  scale(A, k) { return A.map((r) => r.map((v) => v.mul(k))); },
  sameSize(A, B) {
    if (A.length !== B.length || A[0].length !== B[0].length) throw new MathError('matsize', { op: 'add', a: M.size(A), b: M.size(B) });
  },
  mul(A, B) {
    const [r, n] = M.size(A), [n2, c] = M.size(B);
    if (n !== n2) throw new MathError('matsize', { op: 'mul', a: [r, n], b: [n2, c] });
    const out = M.zeros(r, c);
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
      let s = Rat.ZERO;
      for (let k = 0; k < n; k++) s = s.add(A[i][k].mul(B[k][j]));
      out[i][j] = s;
    }
    return out;
  },
  transpose(A) { return A[0].map((_, j) => A.map((r) => r[j])); },
  trace(A) { M.square(A); return A.reduce((s, r, i) => s.add(r[i]), Rat.ZERO); },
  square(A) { if (A.length !== A[0].length) throw new MathError('matsquare'); },

  // Fraction-exact Gaussian elimination; returns {rref, rank, det, pivots}.
  eliminate(A0, record) {
    const A = M.clone(A0);
    const [r, c] = M.size(A);
    let det = Rat.ONE, row = 0;
    const pivots = [];
    for (let col = 0; col < c && row < r; col++) {
      let p = -1;
      for (let i = row; i < r; i++) if (!A[i][col].isZero) { p = i; break; }
      if (p < 0) { det = Rat.ZERO; continue; }
      if (p !== row) { [A[p], A[row]] = [A[row], A[p]]; det = det.neg(); record && record({ op: 'swap', a: p, b: row }); }
      const pv = A[row][col];
      det = det.mul(pv);
      A[row] = A[row].map((v) => v.div(pv));
      record && record({ op: 'scale', row, by: pv });
      for (let i = 0; i < r; i++) {
        if (i === row || A[i][col].isZero) continue;
        const f = A[i][col];
        A[i] = A[i].map((v, j) => v.sub(f.mul(A[row][j])));
        record && record({ op: 'addrow', target: i, src: row, factor: f.neg() });
      }
      pivots.push(col);
      row++;
    }
    if (row < Math.min(r, c) || r !== c) det = r === c && row === r ? det : Rat.ZERO;
    return { rref: A, rank: row, det, pivots };
  },

  det(A) {
    M.square(A);
    const n = A.length;
    if (n === 1) return A[0][0];
    if (n === 2) return A[0][0].mul(A[1][1]).sub(A[0][1].mul(A[1][0]));
    return M.eliminate(A).det;
  },
  rank(A) { return M.eliminate(A).rank; },
  rref(A) { return M.eliminate(A).rref; },

  inverse(A) {
    M.square(A);
    const n = A.length;
    const aug = A.map((r, i) => [...r, ...M.identity(n)[i]]);
    const { rref, rank } = M.eliminate(aug);
    if (rank < n || rref.slice(0, n).some((r, i) => !r[i].eq(Rat.ONE))) throw new MathError('singular');
    return rref.map((r) => r.slice(n));
  },

  pow(A, k) {
    M.square(A);
    let e = BigInt(k);
    if (e < 0n) { A = M.inverse(A); e = -e; }
    if (e > 10000n) throw new MathError('toolarge');
    let R = M.identity(A.length), B = A;
    while (e > 0n) {
      if (e & 1n) R = M.mul(R, B);
      e >>= 1n;
      if (e) B = M.mul(B, B);
    }
    return R;
  },

  // Solve A x = b exactly. Returns {kind:'unique', x} | {kind:'none'} | {kind:'infinite', rref}
  solve(A, b) {
    const aug = A.map((r, i) => [...r, Rat.of(b[i])]);
    const n = A[0].length;
    const { rref, rank, pivots } = M.eliminate(aug);
    if (pivots.includes(n)) return { kind: 'none' };
    if (rank < n) return { kind: 'infinite', rref };
    const x = Array(n).fill(Rat.ZERO);
    pivots.forEach((col, i) => { x[col] = rref[i][n]; });
    return { kind: 'unique', x };
  },

  // Cofactor matrix (for showing the adjugate method on 2×2 / 3×3).
  minor(A, i, j) { return A.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j)); },
  cofactors(A) { return A.map((row, i) => row.map((_, j) => M.det(M.minor(A, i, j)).mul((i + j) % 2 ? -1 : 1))); },

  // Characteristic polynomial coefficients [c0..cn] of det(λI − A) (Faddeev–LeVerrier).
  charPoly(A) {
    M.square(A);
    const n = A.length;
    let Mk = M.zeros(n, n);
    const c = Array(n + 1).fill(Rat.ZERO);
    c[n] = Rat.ONE;
    for (let k = 1; k <= n; k++) {
      Mk = M.add(M.mul(A, Mk), M.scale(M.identity(n), c[n - k + 1]));
      c[n - k] = M.trace(M.mul(A, Mk)).div(-k);
    }
    return c;
  },
};

// Numeric eigenvalues (unsymmetric QR with shifts on a Hessenberg form). Doubles.
export function eigNumeric(A) {
  const n = A.length;
  const a = A.map((r) => r.map((v) => (typeof v === 'number' ? v : v.toNumber())));
  const out = [];
  let m = n;
  let iter = 0;
  const H = a.map((r) => r.slice());
  while (m > 0 && iter < 10000) {
    iter++;
    if (m === 1) { out.push({ re: H[0][0], im: 0 }); m = 0; break; }
    const s = Math.abs(H[m - 1][m - 1]) + Math.abs(H[m - 2][m - 2]);
    if (Math.abs(H[m - 1][m - 2]) < 1e-14 * (s || 1)) { out.push({ re: H[m - 1][m - 1], im: 0 }); m--; continue; }
    if (m === 2 || Math.abs(H[m - 2][m - 3]) < 1e-14 * (Math.abs(H[m - 2][m - 2]) + Math.abs(H[m - 3][m - 3]) || 1)) {
      const p = H[m - 2][m - 2], q = H[m - 2][m - 1], r = H[m - 1][m - 2], t = H[m - 1][m - 1];
      const tr = p + t, det = p * t - q * r, disc = tr * tr / 4 - det;
      if (disc >= 0) { out.push({ re: tr / 2 + Math.sqrt(disc), im: 0 }, { re: tr / 2 - Math.sqrt(disc), im: 0 }); }
      else { out.push({ re: tr / 2, im: Math.sqrt(-disc) }, { re: tr / 2, im: -Math.sqrt(-disc) }); }
      m -= 2;
      continue;
    }
    // shifted QR step on the leading m×m block (Gram–Schmidt QR, fine for n <= 6)
    const mu = H[m - 1][m - 1];
    const B = H.slice(0, m).map((r, i) => r.slice(0, m).map((v, j) => v - (i === j ? mu : 0)));
    const Q = B.map((r) => r.slice()), Rm = Array.from({ length: m }, () => Array(m).fill(0));
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < j; k++) {
        let d = 0;
        for (let i = 0; i < m; i++) d += Q[i][k] * B[i][j];
        Rm[k][j] = d;
        for (let i = 0; i < m; i++) Q[i][j] -= d * Q[i][k];
      }
      let nrm = 0;
      for (let i = 0; i < m; i++) nrm += Q[i][j] * Q[i][j];
      nrm = Math.sqrt(nrm) || 1e-300;
      Rm[j][j] = nrm;
      for (let i = 0; i < m; i++) Q[i][j] /= nrm;
    }
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
      let s2 = 0;
      for (let k = 0; k < m; k++) s2 += Rm[i][k] * Q[k][j];
      H[i][j] = s2 + (i === j ? mu : 0);
    }
  }
  return out;
}
