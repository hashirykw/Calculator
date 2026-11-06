// Number theory on BigInt: primes, factorisation, gcd/lcm, Fibonacci.

import { MathError } from './rational.js';

const abs = (a) => (a < 0n ? -a : a);
export const gcd = (a, b) => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };
export const lcm = (a, b) => (a === 0n || b === 0n ? 0n : abs(a / gcd(a, b) * b));

function modPow(b, e, m) {
  let r = 1n;
  b %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return r;
}

// Deterministic Miller–Rabin for n < 3.3e24 (these bases), probable prime above.
export function isPrime(n) {
  n = BigInt(n);
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n]) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n, s = 0;
  while (d % 2n === 0n) { d /= 2n; s++; }
  outer: for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n]) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

export function primesUpTo(n) {
  n = Number(n);
  if (n > 2000000) throw new MathError('toolarge');
  const sieve = new Uint8Array(n + 1);
  const out = [];
  for (let i = 2; i <= n; i++) {
    if (sieve[i]) continue;
    out.push(i);
    for (let j = i * i; j <= n; j += i) sieve[j] = 1;
  }
  return out;
}

function pollard(n) {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; c < 50n; c++) {
    let x = 2n, y = 2n, d = 1n;
    const f = (v) => (v * v + c) % n;
    for (let i = 0; d === 1n && i < 1000000; i++) {
      x = f(x); y = f(f(y));
      d = gcd(x > y ? x - y : y - x, n);
    }
    if (d !== n && d !== 1n) return d;
  }
  return null;
}

// Prime factorisation: [[p, e], ...] sorted by p.
export function factorInt(n) {
  n = BigInt(n);
  if (n === 0n) throw new MathError('domain', { fn: 'factorint' });
  const sign = n < 0n ? -1n : 1n;
  n = abs(n);
  const map = new Map();
  const add = (p) => map.set(p, (map.get(p) || 0) + 1);
  for (const p of [2n, 3n, 5n]) while (n % p === 0n) { add(p); n /= p; }
  for (let p = 7n, step = 0; p * p <= n && p < 100000n; p += [4n, 2n, 4n, 2n, 4n, 6n, 2n, 6n][step++ % 8]) {
    while (n % p === 0n) { add(p); n /= p; }
  }
  const stack = n > 1n ? [n] : [];
  while (stack.length) {
    const m = stack.pop();
    if (isPrime(m)) { add(m); continue; }
    const d = pollard(m);
    if (!d) throw new MathError('toolarge');
    stack.push(d, m / d);
  }
  return { sign, factors: [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) };
}

export function fibonacci(n) {
  n = Number(n);
  if (!Number.isInteger(n) || n < 0) throw new MathError('intarg', { fn: 'fibonacci' });
  if (n > 20000) throw new MathError('toolarge');
  let a = 0n, b = 1n;
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
}
