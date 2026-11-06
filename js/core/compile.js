// Compiles a parsed expression into a fast closure over doubles for
// plotting and numeric checks. Pure tree walking at build time, no eval
// and no new Function: user input can never run as code.

import { MathError } from './rational.js';

const FN = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh, ln: Math.log, log2: Math.log2, exp: Math.exp,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sign: Math.sign,
  fact: gammaFact, round: Math.round,
};
const TRIG_IN = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot']);
const TRIG_OUT = new Set(['asin', 'acos', 'atan']);

// Lanczos gamma for non-integer factorials in graphs.
function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
function gammaFact(n) {
  if (Number.isInteger(n) && n >= 0 && n <= 170) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
  return gamma(n + 1);
}
function nCr(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || r < 0 || r > n) return NaN;
  let v = 1;
  for (let i = 1; i <= r; i++) v = (v * (n - r + i)) / i;
  return Math.round(v);
}

// opts: { vars: ['x','y'], deg: false }. Returns f(env) where env is an
// array of numbers in the order of opts.vars.
export function compile(tree, opts = {}) {
  const vars = opts.vars || ['x'];
  const deg = !!opts.deg;
  const k = Math.PI / 180;
  const index = new Map(vars.map((v, i) => [v, i]));

  const build = (n) => {
    switch (n.type) {
      case 'num': { const v = n.value.toNumber(); return () => v; }
      case 'val': { const v = n.value.toNumber ? n.value.toNumber() : Number(n.value); return () => v; }
      case 'group': return build(n.arg);
      case 'sym': {
        if (index.has(n.name)) { const i = index.get(n.name); return (e) => e[i]; }
        if (n.name === 'pi') return () => Math.PI;
        if (n.name === 'e') return () => Math.E;
        if (n.name === 'Infinity') return () => Infinity;
        throw new MathError('undefinedvar', { name: n.name });
      }
      case 'neg': { const a = build(n.arg); return (e) => -a(e); }
      case 'post': {
        const a = build(n.arg);
        if (n.op === '%') return (e) => a(e) / 100;
        if (n.op === '°') return deg ? a : (e) => a(e) * k;
        return (e) => gammaFact(a(e));
      }
      case 'op': {
        const a = build(n.args[0]), b = build(n.args[1]);
        switch (n.op) {
          case '+': return (e) => a(e) + b(e);
          case '-': return (e) => a(e) - b(e);
          case '*': return (e) => a(e) * b(e);
          case '/': return (e) => a(e) / b(e);
          case '^': {
            const ex = n.args[1];
            // odd roots of negatives stay real: x^(1/3)
            const oddRoot = ex.type === 'op' && ex.op === '/' && ex.args[0].type === 'num' && ex.args[1].type === 'num' &&
              Number(ex.args[1].value.toNumber()) % 2 === 1;
            if (oddRoot) {
              const p = ex.args[0].value.toNumber(), q = ex.args[1].value.toNumber();
              return (e) => { const x = a(e); if (x >= 0) return Math.pow(x, p / q); const m = Math.pow(-x, p / q); return p % 2 === 0 ? m : -m; };
            }
            if (ex.type === 'num' && ex.value.toNumber() === 2) return (e) => { const x = a(e); return x * x; };
            return (e) => Math.pow(a(e), b(e));
          }
          default: throw new MathError('parse');
        }
      }
      case 'call': return call(n);
      default: throw new MathError('notgraph', { what: n.type });
    }
  };

  const call = (n) => {
    const name = n.name;
    if (name === 'sum' || name === 'product') {
      const [body, v, lo, hi] = n.args;
      if (!v || v.type !== 'sym') throw new MathError('argcount', { fn: name, n: 4 });
      const inner = compile(body, { vars: [...vars, v.name], deg });
      const L = build(lo), H = build(hi);
      const isSum = name === 'sum';
      return (e) => {
        const a = Math.round(L(e)), b = Math.round(H(e));
        if (!(b - a < 100000)) return NaN;
        const env = [...e, 0];
        let acc = isSum ? 0 : 1;
        for (let i = a; i <= b; i++) { env[env.length - 1] = i; acc = isSum ? acc + inner(env) : acc * inner(env); }
        return acc;
      };
    }
    const args = n.args.map(build);
    const one = args[0];
    if (name === 'log') {
      if (args.length === 2) { const b = args[0], x = args[1]; return (e) => Math.log(x(e)) / Math.log(b(e)); }
      return (e) => Math.log10(one(e));
    }
    if (name === 'root') { const kk = args[0], x = args[1]; return (e) => { const r = kk(e), v = x(e); return v < 0 && Math.abs(r % 2) === 1 ? -Math.pow(-v, 1 / r) : Math.pow(v, 1 / r); }; }
    if (name === 'cbrt') return (e) => Math.cbrt(one(e));
    if (name === 'mod') { const a = args[0], b = args[1]; return (e) => { const x = a(e), m = b(e); return x - m * Math.floor(x / m); }; }
    if (name === 'nCr') { const a = args[0], b = args[1]; return (e) => nCr(a(e), b(e)); }
    if (name === 'nPr') { const a = args[0], b = args[1]; return (e) => nCr(a(e), b(e)) * gammaFact(b(e)); }
    if (name === 'min') return (e) => Math.min(...args.map((f) => f(e)));
    if (name === 'max') return (e) => Math.max(...args.map((f) => f(e)));
    if (name === 'rand') return () => Math.random();
    const f = FN[name];
    if (!f || args.length !== 1) throw new MathError('notgraph', { fn: name });
    if (deg && TRIG_IN.has(name)) return (e) => f(one(e) * k);
    if (deg && TRIG_OUT.has(name)) return (e) => f(one(e)) / k;
    return (e) => f(one(e));
  };

  return build(tree);
}
