// Numerical methods on doubles: root bracketing + Brent, adaptive Simpson,
// golden-section extrema, polynomial roots (Durand–Kerner), random test points.
// Used to verify symbolic answers and as clearly-labelled fallbacks.

export function brent(f, a, b, tol = 1e-13, maxIter = 200) {
  let fa = f(a), fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) return null;
  if (fa === 0) return a;
  if (fb === 0) return b;
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + tol / 2;
    const xm = (c - b) / 2;
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p, q;
      if (a === c) { p = 2 * xm * s; q = 1 - s; }
      else {
        const qq = fa / fc, r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(b);
    if (!Number.isFinite(fb)) return null;
  }
  return b;
}

// All real roots of f in [lo, hi]: sign changes plus touching roots.
export function findRoots(f, lo, hi, samples = 2000) {
  const roots = [];
  const h = (hi - lo) / samples;
  let px = lo, py = f(lo);
  const push = (r) => {
    if (r === null || !Number.isFinite(r)) return;
    const fr = f(r);
    if (!Number.isFinite(fr)) return;
    // reject sign changes caused by poles (|f| large on both sides)
    const scale = Math.max(1, Math.abs(f(r + h)), Math.abs(f(r - h)));
    if (Math.abs(fr) > 1e-6 * scale) return;
    if (!roots.some((q) => Math.abs(q - r) < Math.max(1e-9, h * 1e-3))) roots.push(r);
  };
  for (let i = 1; i <= samples; i++) {
    const x = lo + i * h, y = f(x);
    if (Number.isFinite(py) && Number.isFinite(y)) {
      if (py === 0) push(px);
      else if (py * y < 0) push(brent(f, px, x));
    }
    px = x; py = y;
  }
  if (Number.isFinite(py) && py === 0) push(px);
  // touching roots: local minima of |f| close to zero
  for (let i = 1; i < samples; i++) {
    const a = lo + (i - 1) * h, b = lo + (i + 1) * h, m = lo + i * h;
    const fa = Math.abs(f(a)), fm = Math.abs(f(m)), fb = Math.abs(f(b));
    if (fm < fa && fm < fb && fm < 1e-3) {
      const x = golden((t) => Math.abs(f(t)), a, b, false);
      if (Math.abs(f(x)) < 1e-10) push(x);
    }
  }
  return roots.sort((a, b) => a - b);
}

// Golden-section search for a minimum (or maximum when max = true).
export function golden(f, a, b, max = false, tol = 1e-12) {
  const g = (Math.sqrt(5) - 1) / 2;
  const F = max ? (x) => -f(x) : f;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = F(c), fd = F(d);
  for (let i = 0; i < 200 && Math.abs(b - a) > tol * (1 + Math.abs(a) + Math.abs(b)); i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = F(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = F(d); }
  }
  return (a + b) / 2;
}

// Adaptive Simpson. Returns {value, ok}; ok is false if it hit non-finite values.
export function simpson(f, a, b, eps = 1e-10, maxDepth = 48) {
  let ok = true;
  const safe = (x) => { const y = f(x); if (!Number.isFinite(y)) { ok = false; return 0; } return y; };
  const fa = safe(a), fb = safe(b), m = (a + b) / 2, fm = safe(m);
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb);
  let evals = 0;
  const rec = (a1, b1, fa1, fm1, fb1, whole1, eps1, depth) => {
    if (++evals > 200000) { ok = false; return whole1; }
    const m1 = (a1 + b1) / 2, lm = (a1 + m1) / 2, rm = (m1 + b1) / 2;
    const flm = safe(lm), frm = safe(rm);
    const left = ((m1 - a1) / 6) * (fa1 + 4 * flm + fm1), right = ((b1 - m1) / 6) * (fm1 + 4 * frm + fb1);
    const delta = left + right - whole1;
    if (depth <= 0 || Math.abs(delta) <= 15 * eps1) return left + right + delta / 15;
    return rec(a1, m1, fa1, flm, fm1, left, eps1 / 2, depth - 1) + rec(m1, b1, fm1, frm, fb1, right, eps1 / 2, depth - 1);
  };
  const value = rec(a, b, fa, fm, fb, whole, eps, maxDepth);
  return { value, ok };
}

// Roots of a polynomial with real (double) coefficients c0..cn. Returns [{re, im}].
export function polyRootsNumeric(c) {
  let a = c.slice();
  while (a.length > 1 && a[a.length - 1] === 0) a.pop();
  const n = a.length - 1;
  if (n < 1) return [];
  const lead = a[n];
  a = a.map((v) => v / lead);
  // Durand–Kerner
  let z = Array.from({ length: n }, (_, k) => ({ re: Math.cos(2 * Math.PI * k / n + 0.4) * 0.9, im: Math.sin(2 * Math.PI * k / n + 0.4) * 0.9 }));
  const radius = 1 + Math.max(...a.slice(0, n).map(Math.abs));
  z = z.map((w) => ({ re: w.re * radius, im: w.im * radius }));
  const cm = (p, q) => ({ re: p.re * q.re - p.im * q.im, im: p.re * q.im + p.im * q.re });
  const cd = (p, q) => { const d = q.re * q.re + q.im * q.im || 1e-300; return { re: (p.re * q.re + p.im * q.im) / d, im: (p.im * q.re - p.re * q.im) / d }; };
  const evalP = (w) => { let r = { re: 1, im: 0 }; for (let i = n - 1; i >= 0; i--) { r = cm(r, w); r.re += a[i]; } return r; };
  for (let it = 0; it < 500; it++) {
    let maxStep = 0;
    z = z.map((w, i) => {
      let den = { re: 1, im: 0 };
      z.forEach((v, j) => { if (j !== i) den = cm(den, { re: w.re - v.re, im: w.im - v.im }); });
      const step = cd(evalP(w), den);
      maxStep = Math.max(maxStep, Math.hypot(step.re, step.im));
      return { re: w.re - step.re, im: w.im - step.im };
    });
    if (maxStep < 1e-15) break;
  }
  return z.map((w) => ({ re: Math.abs(w.re) < 1e-12 ? 0 : w.re, im: Math.abs(w.im) < 1e-10 ? 0 : w.im })).sort((p, q) => p.re - q.re || p.im - q.im);
}

// Deterministic-ish test points that avoid special values (0, 1, integers).
export function testPoints(count = 12, lo = -3, hi = 3) {
  const pts = [];
  let s = 0.6180339887;
  for (let i = 0; i < count; i++) {
    s = (s + 0.7548776662) % 1;
    pts.push(lo + (hi - lo) * s + 0.0137 * (i + 1));
  }
  return pts;
}

// Compare two functions numerically at points where both are finite.
export function agree(f, g, { points = testPoints(16, -3, 3), rel = 1e-7, need = 3 } = {}) {
  let n = 0;
  for (const x of points) {
    const a = f(x), b = g(x);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    n++;
    if (Math.abs(a - b) > rel * Math.max(1, Math.abs(a), Math.abs(b))) return false;
  }
  return n >= need;
}
