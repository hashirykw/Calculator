// Statistics: summaries (sample or population), quartiles with a named
// method, frequency and grouped data, regression, and the normal, binomial
// and Poisson distributions. Plain doubles; inputs are measured data.

export const QUARTILE_METHODS = {
  halves: 'Median of each half (median left out when n is odd)',
  position: 'Interpolated at positions (n + 1)/4 and 3(n + 1)/4',
  inclusive: 'Inclusive (spreadsheet QUARTILE.INC)',
};

function medianSorted(a) {
  const n = a.length;
  if (!n) return NaN;
  const m = n >> 1;
  return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function quartiles(sorted, method) {
  const n = sorted.length;
  if (n < 2) return { q1: NaN, q3: NaN };
  if (method === 'halves') {
    const half = n >> 1;
    return { q1: medianSorted(sorted.slice(0, half)), q3: medianSorted(sorted.slice(n % 2 ? half + 1 : half)) };
  }
  const at = (pos) => {           // 1-based position with interpolation
    if (pos <= 1) return sorted[0];
    if (pos >= n) return sorted[n - 1];
    const i = Math.floor(pos), f = pos - i;
    return sorted[i - 1] + f * (sorted[i] - sorted[i - 1]);
  };
  if (method === 'position') return { q1: at((n + 1) / 4), q3: at((3 * (n + 1)) / 4) };
  return { q1: at(1 + (n - 1) / 4), q3: at(1 + (3 * (n - 1)) / 4) };
}

// values with optional frequencies. Returns every summary the tool shows.
export function describe(values, freqs = null, opts = {}) {
  const sample = opts.sample !== false;
  const method = opts.quartile || 'halves';
  const xs = [];
  values.forEach((v, i) => {
    const f = freqs ? freqs[i] : 1;
    for (let k = 0; k < f; k++) xs.push(v);
  });
  const n = xs.length;
  const sorted = [...xs].sort((a, b) => a - b);
  const sum = xs.reduce((s, x) => s + x, 0);
  const sumSq = xs.reduce((s, x) => s + x * x, 0);
  const mean = n ? sum / n : NaN;
  const ss = xs.reduce((s, x) => s + (x - mean) ** 2, 0);
  const counts = new Map();
  for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
  const maxC = Math.max(0, ...counts.values());
  const modes = maxC > 1 ? [...counts.entries()].filter(([, c]) => c === maxC).map(([v]) => v).sort((a, b) => a - b) : [];
  const { q1, q3 } = quartiles(sorted, method);
  const iqr = q3 - q1;
  const variance = sample ? (n >= 2 ? ss / (n - 1) : NaN) : (n >= 1 ? ss / n : NaN);
  const lowFence = q1 - 1.5 * iqr, highFence = q3 + 1.5 * iqr;
  return {
    n, sum, sumSq, mean, median: medianSorted(sorted), modes,
    min: sorted[0], max: sorted[n - 1], range: sorted[n - 1] - sorted[0],
    q1, q3, iqr, variance, sd: Math.sqrt(variance), sample, method,
    outliers: Number.isFinite(iqr) ? sorted.filter((x) => x < lowFence || x > highFence) : [],
    sorted,
  };
}

// Grouped classes [lo, hi) with frequencies: uses midpoints (stated in the UI).
export function describeGrouped(classes, opts = {}) {
  const mids = classes.map(([lo, hi]) => (lo + hi) / 2);
  const freqs = classes.map((c) => c[2]);
  const d = describe(mids, freqs, opts);
  // median by linear interpolation within the median class
  const n = freqs.reduce((a, b) => a + b, 0);
  let cum = 0, median = NaN;
  for (let i = 0; i < classes.length; i++) {
    const [lo, hi, f] = classes[i];
    if (cum + f >= n / 2 && f > 0) { median = lo + ((n / 2 - cum) / f) * (hi - lo); break; }
    cum += f;
  }
  return { ...d, median, grouped: true, mids };
}

export function regression(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  if (sxx === 0) return null;
  const b = sxy / sxx, a = my - b * mx;
  const r = syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
  return { a, b, r, r2: r * r, n, mx, my };
}

// ---------- distributions ----------

// erf to full double precision (Abramowitz–Stegun 7.1.26 is too rough;
// this uses the series for small x and a continued fraction for erfc).
export function erf(x) {
  if (x < 0) return -erf(-x);
  if (x < 2.5) {
    let sum = x, term = x;
    const x2 = x * x;
    for (let n = 1; n < 200; n++) {
      term *= -x2 / n;
      const t = term / (2 * n + 1);
      sum += t;
      if (Math.abs(t) < 1e-17 * Math.abs(sum)) break;
    }
    return (2 / Math.sqrt(Math.PI)) * sum;
  }
  return 1 - erfc(x);
}
function erfc(x) {
  // Lentz continued fraction for erfc, x > 0
  const x2 = x * x;
  let f = x, C = x, Dd = 0;
  for (let n = 1; n < 300; n++) {
    const an = n / 2;
    Dd = x + an * Dd; Dd = Dd === 0 ? 1e-300 : 1 / Dd;
    C = x + an / C;
    const delta = C * Dd;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x2) / (f * Math.sqrt(Math.PI));
}
export const phi = (z) => (z < -6 ? 0.5 * erfc(-z / Math.SQRT2) : 0.5 * (1 + erf(z / Math.SQRT2)));
export const normalPdf = (x, mu = 0, s = 1) => Math.exp(-0.5 * ((x - mu) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
export const normalCdf = (a, b, mu = 0, s = 1) => phi((b - mu) / s) - phi((a - mu) / s);

// Inverse normal: Acklam's rational approximation refined by Newton steps.
export function invNorm(p, mu = 0, s = 1) {
  if (p <= 0 || p >= 1) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let q, r, z;
  if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { q = p - 0.5; r = q * q; z = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  for (let i = 0; i < 3; i++) {
    const e = phi(z) - p;
    z -= e / normalPdf(z);
  }
  return mu + s * z;
}

function logChoose(n, k) {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}
export function binomPdf(n, p, r) {
  if (r < 0 || r > n || !Number.isInteger(r)) return 0;
  if (p === 0) return r === 0 ? 1 : 0;
  if (p === 1) return r === n ? 1 : 0;
  return Math.exp(logChoose(n, r) + r * Math.log(p) + (n - r) * Math.log(1 - p));
}
export function binomCdf(n, p, r) {
  let s = 0;
  for (let k = 0; k <= Math.min(r, n); k++) s += binomPdf(n, p, k);
  return Math.min(1, s);
}
export function poissonPdf(lam, r) {
  if (r < 0 || !Number.isInteger(r)) return 0;
  let logf = 0;
  for (let i = 2; i <= r; i++) logf += Math.log(i);
  return Math.exp(-lam + r * Math.log(lam) - logf);
}
export function poissonCdf(lam, r) {
  let s = 0;
  for (let k = 0; k <= r; k++) s += poissonPdf(lam, k);
  return Math.min(1, s);
}
