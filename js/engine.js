// Nexlyr Calculator maths engine: Read -> Understand -> Compute -> Check -> Show.
// Pure module (no DOM). Runs in a Web Worker for Solve and directly in tests.
// Every symbolic answer is checked numerically before it is shown; if a check
// fails, the answer is withheld and the user is offered Amy instead.

import { Rat, MathError } from './core/rational.js';
import { Dec } from './core/decimal.js';
import { parse, strip, freeVars } from './core/parse.js';
import { evaluate, Cx } from './core/numeval.js';
import { formatValue, formatPlain } from './core/format.js';
import { recognize } from './core/recognize.js';
import { astTex } from './core/asttex.js';
import * as Y from './core/sym.js';
import { differentiate, tidy } from './core/diff.js';
import { integrate, tidyAnti } from './core/integrate.js';
import { solveEquation, solveSystem, solveInequality, intervalsTex, intervalsText } from './core/solve.js';
import { limit as limitOf, taylor as taylorOf } from './core/calculus.js';
import { M, eigNumeric } from './core/matrix.js';
import { isPrime, primesUpTo, factorInt, fibonacci } from './core/numtheory.js';
import * as ST from './core/stats.js';
import { simpson, agree, testPoints, findRoots } from './core/numeric.js';
import { Steps } from './steps.js';

const { S, N, toTex, toText } = Y;

// ---------- 1. Read: plain English and spoken maths -> typed form ----------

const NUM_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

export function normalize(raw) {
  let s = String(raw || '').trim().replace(/[?？]+$/, '').trim();
  s = s.replace(/[“”]/g, '"').replace(/\s+/g, ' ');
  // spoken / written words for operators
  const words = [
    [/\bsquare root of\b/gi, 'sqrt '], [/\bcube root of\b/gi, 'cbrt '],
    [/\bsquared\b/gi, '^2'], [/\bcubed\b/gi, '^3'],
    [/\bto the power of\b/gi, '^'], [/\braised to(?: the power)?\b/gi, '^'],
    [/\bmultiplied by\b/gi, '*'], [/\btimes\b/gi, '*'], [/\bdivided by\b/gi, '/'],
    [/\bplus\b/gi, '+'], [/\bminus\b/gi, '-'],
    [/\bis greater than or equal to\b|\bgreater than or equal to\b/gi, '>='], [/\bis less than or equal to\b|\bless than or equal to\b/gi, '<='],
    [/\bis greater than\b|\bgreater than\b/gi, '>'], [/\bis less than\b|\bless than\b/gi, '<'],
    [/\bis equal to\b|\bequals\b/gi, '='], [/\bopen (?:bracket|parenthesis)\b/gi, '('], [/\bclose (?:bracket|parenthesis)\b/gi, ')'],
    [/\binfinity\b/gi, 'Infinity'],
  ];
  for (const [re, rep] of words) s = s.replace(re, rep);
  s = s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (w) => String(NUM_WORDS[w.toLowerCase()]));
  // "x% of y"
  s = s.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s+/gi, '($1/100)*');
  s = s.replace(/^(?:what is|what's|calculate|evaluate|compute|work out|find)\s+(?:the\s+)?/i, '');

  const list = (t) => t.replace(/\s+and\s+/gi, ', ').replace(/\s*,\s*/g, ', ');
  const rules = [
    // simultaneous: "solve 2x+y=7 and x-y=2"
    [/^solve\s+(?!\()(.+=.+?)\s+(?:and|,)\s+(.+=.+)$/i, (m) => `solve(${m[1]}, ${m[2]})`],
    [/^solve\s+(?!\()(.+)$/i, (m) => `solve(${m[1]})`],
    [/^(?:the\s+)?(?:derivative|differentiate|differential)(?:\s+of)?\s+(.+?)(?:\s+with respect to\s+([a-z]))?$/i, (m) => `diff(${m[1]}, ${m[2] || guessVar(m[1])})`],
    [/^d\s*\/\s*d([a-z])\s*(.+)$/i, (m) => `diff(${m[2]}, ${m[1]})`],
    [/^(?:the\s+)?(?:definite\s+)?(?:integral|integrate|antiderivative)(?:\s+of)?\s+(.+?)(?:\s*d([a-z]))?\s+from\s+(.+?)\s+to\s+(.+)$/i, (m) => `integrate(${m[1]}, ${m[2] || guessVar(m[1])}, ${m[3]}, ${m[4]})`],
    [/^(?:the\s+)?(?:integral|integrate|antiderivative)(?:\s+of)?\s+(.+?)(?:\s*d([a-z]))?$/i, (m) => `integrate(${m[1]}, ${m[2] || guessVar(m[1])})`],
    [/^∫\s*(.+?)\s*d([a-z])$/i, (m) => `integrate(${m[1]}, ${m[2]})`],
    [/^(?:the\s+)?(?:limit|lim)(?:\s+of)?\s+(.+?)\s+as\s+([a-z])\s+(?:approaches|tends to|goes to|->|→)\s+(.+)$/i, (m) => `limit(${m[1]}, ${m[2]}, ${m[3]})`],
    [/^lim\s*_?\s*\{?\s*([a-z])\s*(?:->|→)\s*([^\s}]+)\s*\}?\s+(.+)$/i, (m) => `limit(${m[3]}, ${m[1]}, ${m[2]})`],
    [/^(?:factori[sz]e|factor)\s+(?!\()(.+)$/i, (m) => `factor(${m[1]})`],
    [/^expand\s+(?!\()(.+)$/i, (m) => `expand(${m[1]})`],
    [/^simplify\s+(?!\()(.+)$/i, (m) => `simplify(${m[1]})`],
    [/^(?:the\s+)?(?:taylor|maclaurin)(?:\s+(?:series|expansion|polynomial))?\s+(?:of|for)\s+(.+?)(?:\s+(?:about|around|at)\s+(?:[a-z]\s*=\s*)?(-?[\w./]+))?(?:\s+(?:to|up to|with)\s+(\d+)\s+(terms?|orders?))?$/i,
      (m) => { const v = guessVar(m[1]); const n = m[3] ? (/^term/i.test(m[4]) ? Number(m[3]) - 1 : Number(m[3])) : 4; return `taylor(${m[1]}, ${v}, ${m[2] || 0}, ${n})`; }],
    [/^(?:the\s+)?prime\s+factori[sz]ation\s+of\s+(.+)$/i, (m) => `factorint(${m[1]})`],
    [/^(?:the\s+)?prime\s+factors?\s+of\s+(.+)$/i, (m) => `factorint(${m[1]})`],
    [/^is\s+(\d+)\s+(?:a\s+)?prime(?:\s+number)?$/i, (m) => `isprime(${m[1]})`],
    [/^(?:the\s+)?primes?(?:\s+numbers)?\s+(?:up to|below|less than|under|to)\s+(\d+)$/i, (m) => `primes(${m[1]})`],
    [/^(?:the\s+)?(?:gcd|hcf|highest common factor|greatest common divisor)\s+of\s+(.+)$/i, (m) => `gcd(${list(m[1])})`],
    [/^(?:the\s+)?(?:lcm|lowest common multiple|least common multiple)\s+of\s+(.+)$/i, (m) => `lcm(${list(m[1])})`],
    [/^(?:the\s+)?sum\s+of\s+(.+?)\s+(?:for\s+([a-z])\s+)?from\s+(?:([a-z])\s*=\s*)?(.+?)\s+to\s+(.+)$/i, (m) => { const v = m[2] || m[3] || guessVar(m[1], 'k'); return `sum(${m[1]}, ${v}, ${m[4]}, ${m[5]})`; }],
    [/^(?:the\s+)?(mean|average|median|mode|standard deviation|variance|range)\s+of\s+(.+)$/i, (m) => {
      const fnName = { mean: 'mean', average: 'mean', median: 'median', mode: 'mode', 'standard deviation': 'std', variance: 'var', range: 'range' }[m[1].toLowerCase()];
      return `${fnName}([${list(m[2])}])`;
    }],
    [/^(?:the\s+)?(\d+)(?:st|nd|rd|th)\s+fibonacci(?:\s+number)?$/i, (m) => `fibonacci(${m[1]})`],
  ];
  for (const [re, f] of rules) {
    const m = re.exec(s);
    if (m) { s = f(m); break; }
  }
  // "range(...)" is not a parser function: rewrite to max - min
  s = s.replace(/^range\((\[.*\])\)$/, 'max($1) - min($1)');
  s = s.replace(/\s+d([a-z])\s*\)/g, ')');   // drop "dx" inside integrate(...)
  return s;
}

function guessVar(text, fallback = 'x') {
  const letters = (text.replace(/\b(sin|cos|tan|sec|csc|cot|asin|acos|atan|sinh|cosh|tanh|ln|log|exp|sqrt|cbrt|abs|pi|e)\b/gi, ' ').match(/\b[a-z]\b/gi) || [])
    .filter((c) => c !== 'e' && c !== 'i');
  if (letters.includes(fallback)) return fallback;
  if (letters.includes('x')) return 'x';
  return letters[0] || fallback;
}

// ---------- helpers ----------

const COMMANDS = new Set(['solve', 'diff', 'integrate', 'limit', 'factor', 'expand', 'simplify', 'taylor', 'isprime', 'primes', 'factorint',
  'fibonacci', 'det', 'inv', 'transpose', 'trace', 'rank', 'rref', 'eigs', 'normalcdf', 'normalpdf', 'invnorm', 'binompdf', 'binomcdf',
  'poissonpdf', 'poissoncdf']);

function containsCommand(n) {
  if (!n || typeof n !== 'object') return false;
  if (n.type === 'call' && COMMANDS.has(n.name)) return true;
  return (n.args || []).some(containsCommand) || containsCommand(n.arg) || (n.items || []).some(containsCommand);
}

const fmt = (v, s) => formatValue(v, { sig: s.sig || 10, group: s.group || 'intl', sciHigh: s.sciHigh ?? 12, sciLow: s.sciLow ?? -6 });
const fmtNum = (x, s) => (Number.isFinite(x) ? formatValue(Dec.of(Number(x.toPrecision(15))), { sig: s.sig || 10, group: s.group || 'intl', sciHigh: s.sciHigh ?? 12, sciLow: s.sciLow ?? -6 }) : (Number.isNaN(x) ? '—' : x > 0 ? '∞' : '−∞'));
const sanitizeTex = (t) => t.replace(/−/g, '-');

function symOf(node, vars) {
  try { return Y.fromAst(strip(node)); } catch (e) {
    if (e instanceof MathError && e.code === 'notsym') throw new MathError('cantsolve', { what: e.info.fn || 'expression' });
    throw e;
  }
}

function mainVar(nodes, preferred = 'x') {
  const vs = new Set();
  nodes.forEach((n) => freeVars(n, new Set(), vs));
  ['Ans', 'M'].forEach((v) => vs.delete(v));
  if (vs.has(preferred)) return preferred;
  const order = ['x', 'y', 't', 'z', 'n', 'k', 'θ', 'theta'];
  for (const o of order) if (vs.has(o)) return o;
  return [...vs].sort()[0] || preferred;
}

function exactAndDecimal(e, s) {
  const tex = toTex(e);
  const v = Y.constValue(e);
  const decimal = v !== null && Y.symbols(e).size === 0 && !(Y.isNum(e) && e.v.isInt) ? fmtNum(v, s) : null;
  return { exact: { latex: tex, text: toText(e) }, decimal: decimal ? { text: decimal } : null, value: v };
}

function ok(r) { return { ok: true, steps: [], verified: null, note: null, ...r }; }

// ---------- 2-5. run ----------

export function run(input, settings = {}) {
  const s = { angle: 'rad', complex: false, sig: 10, group: 'intl', ...settings };
  let text;
  try {
    text = normalize(input);
    if (!text) throw new MathError('empty');
    const { tree, autoClosed } = parse(text, { withMeta: true });
    const t = strip(tree);
    const inputTex = sanitizeTex(astTex(tree));
    const res = dispatch(t, s);
    return { ...res, input: text, inputTex, autoClosed };
  } catch (e) {
    if (e instanceof MathError) return { ok: false, input: text || input, error: { code: e.code, info: e.info || {} } };
    return { ok: false, input: text || input, error: { code: 'internal', info: { message: String(e && e.message || e) } } };
  }
}

// Live preview only: parse and render what was understood (cheap, no solving).
export function preview(input) {
  try {
    const text = normalize(input);
    if (!text) return null;
    const { tree } = parse(text, { withMeta: true });
    return { ok: true, tex: sanitizeTex(astTex(tree)), text };
  } catch (e) {
    return { ok: false, error: { code: e.code || 'parse', info: e.info || {} } };
  }
}

function dispatch(t, s) {
  if (t.type === 'call' && COMMANDS.has(t.name)) {
    if (t.args.some(containsCommand)) throw new MathError('nested', { fn: t.name });
    return command(t, s);
  }
  if (containsCommand(t)) {
    const inner = findCommand(t);
    throw new MathError('nested', { fn: inner });
  }
  if (t.type === 'rel') return t.op === '=' ? taskSolve([t], s) : taskInequality(t, s);
  const vars = freeVars(t);
  ['Ans', 'M'].forEach((v) => vars.delete(v));
  if (vars.size) return taskSimplify(t, s, 'simplify');
  return taskEvaluate(t, s);
}
function findCommand(n) {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'call' && COMMANDS.has(n.name)) return n.name;
  for (const c of [...(n.args || []), n.arg, ...(n.items || [])]) { const r = findCommand(c); if (r) return r; }
  return null;
}

function command(t, s) {
  const a = t.args;
  switch (t.name) {
    case 'solve': {
      const rels = a.filter((n) => n.type === 'rel');
      const exprs = a.filter((n) => n.type !== 'rel');
      if (rels.length === 1 && rels[0].op !== '=') return taskInequality(rels[0], s, exprs[0]);
      if (!rels.length && exprs.length >= 1 && exprs[0].type !== 'sym') {
        // solve(x^2 - 4) means = 0; optional variable second
        return taskSolve([{ type: 'rel', op: '=', args: [exprs[0], { type: 'num', value: Rat.ZERO }] }], s, exprs[1]);
      }
      const varNode = exprs.find((n) => n.type === 'sym');
      return taskSolve(rels, s, varNode);
    }
    case 'diff': return taskDiff(a, s);
    case 'integrate': return taskIntegrate(a, s);
    case 'limit': return taskLimit(a, s);
    case 'factor': return taskSimplify(a[0], s, 'factor');
    case 'expand': return taskSimplify(a[0], s, 'expand');
    case 'simplify': return taskSimplify(a[0], s, 'simplify');
    case 'taylor': return taskTaylor(a, s);
    case 'isprime': case 'primes': case 'factorint': case 'fibonacci': return taskNumberTheory(t.name, a, s);
    case 'det': case 'inv': case 'transpose': case 'trace': case 'rank': case 'rref': case 'eigs': return taskMatrix(t.name, a, s);
    default: return taskDistribution(t.name, a, s);
  }
}

// ---------- evaluate ----------

function taskEvaluate(t, s) {
  const ctx = { angle: s.angle, complex: s.complex, vars: s.vars || {} };
  const v = evaluate(t, ctx);
  const ex = recognize(v);
  const dec = fmt(v, s);
  const isMatrix = Array.isArray(v);
  const steps = arithmeticSteps(t, ctx, s);
  const exactTex = ex && ex.kind !== 'integer' ? ex.latex : null;
  return ok({
    task: 'evaluate', label: { key: 'task.evaluated' },
    exact: exactTex ? { latex: exactTex, text: ex.text } : null,
    decimal: { text: dec, latex: isMatrix ? null : null },
    plain: formatPlain(v),
    steps, verified: 'direct',
    isComplex: v instanceof Cx,
  });
}

// Order-of-operations working for plain arithmetic: reduce the innermost
// operation each time and show the whole expression again.
function arithmeticSteps(tree, ctx, s) {
  const ok2 = (n) => {
    if (!n) return true;
    if (n.type === 'post' && n.op === '%') return false;
    if (n.type === 'sym') return ['pi', 'e'].includes(n.name);
    if (n.type === 'list' || n.type === 'rel') return false;
    if (n.type === 'call' && (n.name === 'sum' || n.name === 'product' || n.name === 'rand' || n.name === 'randint')) return false;
    return (n.args || []).every(ok2) && ok2(n.arg);
  };
  if (!ok2(tree)) return [];
  const steps = [];
  let cur = tree;
  const isLeaf = (n) => n.type === 'num' || n.type === 'val' || (n.type === 'sym');
  const reducible = (n) => {
    if (n.type === 'group') return isLeaf(n.arg) ? n : null;
    if (n.type === 'op') return n.args.every(isLeaf) ? n : null;
    if (n.type === 'neg' || n.type === 'post') return isLeaf(n.arg) ? n : null;
    if (n.type === 'call') return n.args.every(isLeaf) ? n : null;
    return null;
  };
  const find = (n) => {
    if (isLeaf(n)) return null;
    // children first (left to right) so the innermost operation goes first
    const kids = n.type === 'op' || n.type === 'call' ? n.args : [n.arg];
    // for + and -, finish higher-precedence work on both sides first
    for (const c of kids) { const r = find(c); if (r) return r; }
    return reducible(n);
  };
  const replace = (n, target, repl) => {
    if (n === target) return repl;
    if (n.type === 'op' || n.type === 'call') return { ...n, args: n.args.map((c) => replace(c, target, repl)) };
    if (n.arg) return { ...n, arg: replace(n.arg, target, repl) };
    return n;
  };
  for (let i = 0; i < 14; i++) {
    const target = find(cur);
    if (!target) break;
    if (target.type === 'group') { cur = replace(cur, target, target.arg); continue; }
    let value;
    try { value = evaluate(target, ctx); } catch { return []; }
    const repl = value instanceof Rat && value.isInt ? { type: 'num', value, raw: value.toString() } : { type: 'val', value };
    cur = replace(cur, target, repl);
    steps.push({ rule: 'order', latex: sanitizeTex(astTex(cur)) });
  }
  return steps.length >= 2 ? steps : [];
}

// ---------- solve ----------

function taskSolve(rels, s, varNode) {
  if (!rels.length) throw new MathError('cantsolve', { what: 'equation' });
  if (rels.length > 1) {
    const eqs = rels.map((r) => ({ lhs: symOf(r.args[0]), rhs: symOf(r.args[1]) }));
    const vs = new Set();
    rels.forEach((r) => freeVars(r, new Set(), vs));
    const vars = [...vs].sort((p, q) => ((p === 'x' ? -2 : p === 'y' ? -1 : 0) - (q === 'x' ? -2 : q === 'y' ? -1 : 0)) || p.localeCompare(q));
    const steps = new Steps();
    const r = solveSystem(eqs, vars, { complex: s.complex, angle: s.angle }, steps);
    if (r.kind === 'inconsistent') return ok({ task: 'system', label: { key: 'task.system' }, exact: { latex: '\\text{No solution}', text: 'No solution' }, steps: steps.list, note: { key: 'note.inconsistent' }, verified: 'symbolic' });
    if (r.kind === 'dependent') return ok({ task: 'system', label: { key: 'task.system' }, exact: { latex: '\\text{Infinitely many solutions}', text: 'Infinitely many solutions' }, steps: steps.list, note: { key: 'note.dependent' }, verified: 'symbolic' });
    // check every solution in every equation
    for (const sol of r.solutions) {
      for (const { lhs, rhs } of eqs) {
        const env = Object.fromEntries(Object.entries(sol).map(([k, v]) => [k, Y.evalF(v, {})]));
        const d = Y.evalF(lhs, env) - Y.evalF(rhs, env);
        if (!(Math.abs(d) < 1e-8 * Math.max(1, Math.abs(Y.evalF(lhs, env))))) throw new MathError('checkfailed');
      }
    }
    if (!r.solutions.length) return ok({ task: 'system', label: { key: 'task.system' }, exact: { latex: '\\text{No real solution}', text: 'No real solution' }, steps: steps.list, verified: 'symbolic' });
    const latex = r.solutions.map((sol) => vars.map((v) => `${Y.varTex(v)} = ${toTex(sol[v])}`).join(',\\ ')).join('\\quad\\text{or}\\quad ');
    const text = r.solutions.map((sol) => vars.map((v) => `${Y.varText(v)} = ${toText(sol[v])}`).join(', ')).join('  or  ');
    const decimals = r.solutions.map((sol) => vars.map((v) => `${Y.varText(v)} ≈ ${fmtNum(Y.evalF(sol[v], {}), s)}`).join(', ')).join('  or  ');
    const allInt = r.solutions.every((sol) => vars.every((v) => Y.isNum(sol[v]) && sol[v].v.isInt));
    return ok({ task: 'system', label: { key: 'task.system' }, exact: { latex, text }, decimal: allInt ? null : { text: decimals }, steps: steps.list, verified: 'symbolic' });
  }

  const rel = rels[0];
  const lhs = symOf(rel.args[0]), rhs = symOf(rel.args[1]);
  const x = varNode ? varNode.name : mainVar([rel]);
  const X = Y.varTex(x), Xt = Y.varText(x);
  const others = [...Y.symbols(lhs), ...Y.symbols(rhs)].filter((v) => v !== x);
  const steps = new Steps();
  const r = solveEquation(lhs, rhs, x, { complex: s.complex, angle: s.angle }, steps);
  const label = { key: 'task.solvedFor', params: { v: Xt } };
  if (r.kind === 'identity') return ok({ task: 'solve', label, exact: { latex: '\\text{True for every value of } ' + X, text: `True for every ${Xt}` }, steps: steps.list, verified: 'symbolic' });
  if (r.kind === 'nosolution') return ok({ task: 'solve', label, exact: { latex: '\\text{No solution}', text: 'No solution' }, steps: steps.list, verified: 'symbolic' });
  if (r.kind === 'rearranged') {
    const sol = r.solutions[0];
    const latex = `${X} = ${sol.pm ? '\\pm ' : ''}${toTex(sol.exact)}`;
    // check symbolically-rearranged formulas numerically with random values
    const f = r.fx || Y.S(Y.add(lhs, Y.mul(Y.NEG1, rhs)));
    const env0 = Object.fromEntries(others.map((v, i) => [v, 1.3 + 0.7 * i]));
    const xv = Y.evalF(sol.exact, env0);
    const resid = Y.evalF(f, { ...env0, [x]: xv });
    const scale = Math.max(1, Math.abs(Y.evalF(lhs, { ...env0, [x]: xv })) || 1);
    if (!(Number.isFinite(resid) && Math.abs(resid) < 1e-8 * scale)) throw new MathError('checkfailed');
    // with no other letters left, give the decimal value too
    let decimal = null;
    if (!others.length) {
      const v = Y.evalF(sol.exact, {});
      if (Number.isFinite(v) && !(Y.isNum(sol.exact) && sol.exact.v.isInt)) decimal = { text: `${Xt} ≈ ${sol.pm ? '±' : ''}${fmtNum(v, s)}` };
    }
    const v0 = others.length ? NaN : Y.evalF(sol.exact, {});
    const values = Number.isFinite(v0) ? (sol.pm ? [-v0, v0] : [v0]) : [];
    return ok({ task: 'solve', label, exact: { latex, text: `${Xt} = ${sol.pm ? '±' : ''}${toText(sol.exact)}` }, decimal, values, steps: steps.list, verified: 'numeric' });
  }
  if (others.length) throw new MathError('cantsolve', { what: 'equation' });

  // verify: substitute every root back, and make sure a scan finds no others
  // r.fx is the equation as solved (angles already in the chosen unit)
  const fc = Y.compileSym(r.fx || S(Y.add(lhs, Y.mul(Y.NEG1, rhs))), [x]);
  const lhsC = Y.compileSym(lhs, [x]);
  const scaleAt = (v) => { const y = lhsC(r.fx || !r.unit || r.unit === 'rad' ? v : toRad(v, r.unit)); return Math.max(1, Number.isFinite(y) ? Math.abs(y) : 1); };
  const sols = r.solutions.filter((sl) => {
    const res = r.fx ? fc(sl.value) : r.unit && r.unit !== 'rad' ? fc(toRad(sl.value, r.unit)) : fc(sl.value);
    return Number.isFinite(res) && Math.abs(res) < 1e-7 * scaleAt(sl.value);
  });
  if (sols.length !== r.solutions.length) throw new MathError('checkfailed');
  if (r.kind === 'isolated' || r.kind === 'trig') {
    const [lo, hi] = r.kind === 'trig' ? [0, r.unit === 'deg' ? 360 : r.unit === 'grad' ? 400 : 2 * Math.PI] : [-100, 100];
    const g = r.fx ? fc : r.unit && r.unit !== 'rad' ? (t) => fc(toRad(t, r.unit)) : fc;
    const scan = findRoots(g, lo, hi, 4000);
    const missing = scan.filter((q) => !sols.some((sl) => Math.abs(sl.value - q) < 1e-6 * Math.max(1, Math.abs(q))));
    if (missing.length) {
      sols.push(...missing.map((q) => ({ exact: null, value: q, numeric: true })));
      sols.sort((p, q) => p.value - q.value);
    }
  }
  const unitTex = r.unit === 'deg' ? '^{\\circ}' : '';
  const unitTxt = r.unit === 'deg' ? '°' : '';
  if (!sols.length && !r.complex.length) {
    const noteKey = r.noReal ? (s.complex ? 'note.noroots' : 'note.noRealTryComplex') : r.kind === 'numeric' ? 'note.noNumericRoots' : 'note.noroots';
    return ok({ task: 'solve', label, exact: { latex: '\\text{No real solutions}', text: 'No real solutions' }, steps: steps.list, verified: r.kind === 'numeric' ? 'numeric' : 'symbolic', note: { key: noteKey, params: r.range ? { lo: r.range[0], hi: r.range[1] } : {} } });
  }
  const anyNumeric = sols.some((sl) => !sl.exact);
  const exactParts = sols.filter((sl) => sl.exact).map((sl) => `${X} = ${sl.tex || toTex(sl.exact)}${unitTex}`);
  const cplxParts = (r.complex || []).map((sl) => `${X} = ${toTex(sl.exact)}`);
  const numParts = sols.filter((sl) => !sl.exact).map((sl) => `${X} \\approx ${fmtNum(sl.value, s)}${unitTex}`);
  const latex = [...exactParts, ...numParts, ...cplxParts].join(',\\quad ');
  const text = [...sols.map((sl) => sl.exact ? `${Xt} = ${toText(sl.exact)}${unitTxt}` : `${Xt} ≈ ${fmtNum(sl.value, s)}${unitTxt}`), ...(r.complex || []).map((sl) => `${Xt} = ${toText(sl.exact)}`)].join(', ');
  const needDec = sols.some((sl) => sl.exact && !(Y.isNum(sl.exact) && sl.exact.v.isInt));
  const decimal = needDec ? sols.map((sl) => `${Xt} ≈ ${fmtNum(sl.value, s)}${unitTxt}`).join(', ') : null;
  let note = null;
  if (r.kind === 'trig') note = { key: 'note.trigRange', params: { range: r.unit === 'deg' ? `0° ≤ ${Xt} < 360°` : r.unit === 'grad' ? `0 ≤ ${Xt} < 400 grad` : `0 ≤ ${Xt} < 2π` } };
  if (r.kind === 'numeric' || anyNumeric) note = { key: 'note.numericRoots', params: r.range ? { lo: r.range[0], hi: r.range[1] } : {} };
  if (r.excluded && r.excluded.length) note = { key: 'note.excluded', params: { list: r.excluded.map((e) => fmtNum(e.value, s)).join(', ') } };
  if (r.someComplex) note = { key: 'note.complexHidden', params: { n: r.someComplex } };
  return ok({
    task: 'solve', label,
    exact: { latex, text }, decimal: decimal ? { text: decimal } : null, values: sols.map((sl) => sl.value), unit: r.unit || null,
    steps: steps.list, verified: anyNumeric || r.kind === 'numeric' ? 'numeric' : 'symbolic', note,
    plot: toText(S(Y.add(lhs, Y.mul(Y.NEG1, rhs)))), numeric: anyNumeric,
    general: r.general ? r.general.map((g) => (unitTex ? `${X} = \\left(${toTex(g)}\\right)^{\\circ}` : `${X} = ${toTex(g)}`)).join(',\\quad ') + ',\\ k \\in \\mathbb{Z}' : null,
  });
}
const toRad = (v, unit) => (unit === 'deg' ? (v * Math.PI) / 180 : unit === 'grad' ? (v * Math.PI) / 200 : v);

function taskInequality(rel, s, varNode) {
  const lhs = symOf(rel.args[0]), rhs = symOf(rel.args[1]);
  const x = varNode ? varNode.name : mainVar([rel]);
  if (rel.op === '!=') throw new MathError('cantsolve', { what: 'inequality' });
  const steps = new Steps();
  const r = solveInequality(rel.op, lhs, rhs, x, {}, steps);
  // check: sample points inside/outside intervals agree with the inequality
  const f = Y.compileSym(S(Y.add(lhs, Y.mul(Y.NEG1, rhs))), [x]);
  const holds = (v) => { const y = f(v); return rel.op === '>' ? y > 0 : rel.op === '<' ? y < 0 : rel.op === '>=' ? y >= -1e-12 : y <= 1e-12; };
  const inSet = (v) => r.intervals.some((it) => {
    const lo = it.lo ? Y.evalF(it.lo, {}) : -Infinity, hi = it.hi ? Y.evalF(it.hi, {}) : Infinity;
    return (v > lo || (it.loIncl && Math.abs(v - lo) < 1e-12)) && (v < hi || (it.hiIncl && Math.abs(v - hi) < 1e-12));
  });
  for (const v of testPoints(40, -60, 60)) {
    const y = f(v);
    if (!Number.isFinite(y)) continue;
    if (holds(v) !== inSet(v)) throw new MathError('checkfailed');
  }
  return ok({
    task: 'inequality', label: { key: 'task.inequality', params: { v: x } },
    exact: { latex: intervalsTex(r.intervals, x), text: intervalsText(r.intervals, x) },
    steps: steps.list, verified: 'numeric',
  });
}

// ---------- calculus ----------

function taskDiff(a, s) {
  if (!a.length) throw new MathError('argcount', { fn: 'diff', n: 2 });
  const f = symOf(a[0]);
  const x = a[1] && a[1].type === 'sym' ? a[1].name : mainVar([a[0]]);
  const order = a[2] ? Number(evaluate(a[2]).toString()) : 1;
  if (!Number.isInteger(order) || order < 1 || order > 10) throw new MathError('intarg', { fn: 'diff' });
  const steps = new Steps();
  let d = f;
  for (let k = 0; k < order; k++) d = differentiate(d, x, k === 0 ? steps : new Steps(), { log: k === 0 }).result;
  d = tidy(d);
  // check against a central difference of the previous order
  const fPrev = order === 1 ? f : (() => { let g = f; for (let k = 0; k < order - 1; k++) g = differentiate(g, x, new Steps(), { log: false }).result; return g; })();
  const gc = Y.compileSym(fPrev, [x]), dc = Y.compileSym(d, [x]);
  const numD = (t) => { const h = 1e-5 * Math.max(1, Math.abs(t)); return (gc(t + h) - gc(t - h)) / (2 * h); };
  if (!agree(numD, dc, { rel: 2e-5, points: testPoints(14, -3, 3) })) throw new MathError('checkfailed');
  const free = Y.symbols(d).size > 0;
  const ed = exactAndDecimal(d, s);
  return ok({
    task: 'diff', label: { key: order === 1 ? 'task.derivative' : 'task.derivativeN', params: { v: x, n: order } },
    exact: ed.exact, decimal: free ? null : ed.decimal,
    steps: order === 1 ? steps.list : [], verified: 'numeric', plot: toText(d),
  });
}

function taskIntegrate(a, s) {
  if (!a.length) throw new MathError('argcount', { fn: 'integrate', n: 2 });
  const f = symOf(a[0]);
  let x, lo, hi;
  if (a.length === 4) { x = a[1].name; lo = a[2]; hi = a[3]; }
  else if (a.length === 3) { x = mainVar([a[0]]); lo = a[1]; hi = a[2]; }
  else { x = a[1] && a[1].type === 'sym' ? a[1].name : mainVar([a[0]]); }
  const steps = new Steps();
  let F = null;
  try { F = integrate(f, x, steps); } catch { F = null; }
  if (F) {
    F = tidyAnti(F);
    // check: dF/dx must match f where both are defined
    const fc = Y.compileSym(S(f), [x]);
    const dF = Y.compileSym(differentiate(F, x, new Steps(), { log: false }).result, [x]);
    const pts = [...testPoints(16, -3, 3), ...testPoints(8, 0.1, 5)];
    if (!agree(fc, dF, { rel: 1e-7, points: pts })) { F = null; steps.list.length = 0; }
  }
  if (lo === undefined) {
    if (!F) throw new MathError('noantiderivative');
    steps.add('addc', '');
    return ok({
      task: 'integrate', label: { key: 'task.antiderivative', params: { v: x } },
      exact: { latex: `${toTex(F)} + C`, text: `${toText(F)} + C` },
      steps: steps.list, verified: 'numeric', plot: toText(F),
    });
  }
  // definite
  const A = symOf(lo), B = symOf(hi);
  const av = Y.constValue(S(A)), bv = Y.constValue(S(B));
  if (av === null || bv === null) throw new MathError('cantsolve', { what: 'integral' });
  const fc = Y.compileSym(S(f), [x]);
  const num = simpson((t) => fc(t), av, bv, 1e-11);
  let exact = null;
  if (F) {
    try {
      const v = tidy(S(Y.add(Y.subst(F, x, B), Y.mul(Y.NEG1, Y.subst(F, x, A)))));
      const vv = Y.constValue(v);
      if (vv !== null && num.ok && Math.abs(vv - num.value) <= 1e-6 * Math.max(1, Math.abs(vv))) {
        exact = v;
        steps.add('ftc', `\\left[${toTex(F)}\\right]_{${toTex(A)}}^{${toTex(B)}} = ${toTex(v)}`);
      }
    } catch { exact = null; }
  }
  const label = { key: 'task.definite', params: { v: x } };
  if (exact) {
    const ed = exactAndDecimal(exact, s);
    return ok({ task: 'definite', label, exact: ed.exact, decimal: ed.decimal, steps: steps.list, verified: 'numeric' });
  }
  if (!num.ok) throw new MathError('improper');
  return ok({
    task: 'definite', label, exact: null, decimal: { text: '≈ ' + fmtNum(num.value, s) }, numeric: true,
    steps: [], note: { key: 'note.numericIntegral' }, verified: 'numeric',
  });
}

function taskLimit(a, s) {
  if (a.length < 2) throw new MathError('argcount', { fn: 'limit', n: 3 });
  const f = symOf(a[0]);
  const x = a.length >= 3 ? a[1].name : mainVar([a[0]]);
  const at = symOf(a.length >= 3 ? a[2] : a[1]);
  const steps = new Steps();
  const r = limitOf(f, x, at, steps);
  const label = { key: 'task.limit', params: { v: x } };
  if (r.kind === 'dne') {
    const side = (v) => (typeof v === 'number' ? fmtNum(v, s) : v);
    return ok({ task: 'limit', label, exact: { latex: `\\text{Does not exist}`, text: 'Does not exist' }, note: { key: 'note.limitSides', params: { left: side(r.left), right: side(r.right) } }, steps: steps.list, verified: 'numeric' });
  }
  if (r.kind === 'inf') return ok({ task: 'limit', label, exact: { latex: r.sign < 0 ? '-\\infty' : '\\infty', text: r.sign < 0 ? '−∞' : '∞' }, steps: steps.list, verified: 'numeric' });
  if (r.exact) { const ed = exactAndDecimal(r.exact, s); return ok({ task: 'limit', label, exact: ed.exact, decimal: ed.decimal, steps: steps.list, verified: 'numeric' }); }
  return ok({ task: 'limit', label, exact: null, decimal: { text: '≈ ' + fmtNum(r.value, { ...s, sig: 6 }) }, numeric: true, note: { key: 'note.numericLimit' }, steps: [], verified: 'numeric' });
}

function taskTaylor(a, s) {
  const f = symOf(a[0]);
  const x = a[1] && a[1].type === 'sym' ? a[1].name : mainVar([a[0]]);
  const at = a[2] ? symOf(a[2]) : Y.ZERO;
  const n = a[3] ? Number(evaluate(a[3]).toString()) : 4;
  if (!Number.isInteger(n) || n < 0) throw new MathError('intarg', { fn: 'taylor' });
  const steps = new Steps();
  const T = taylorOf(f, x, at, n, steps);
  // check near the centre: error should be tiny compared with |x - a|^(n+1)
  const fc = Y.compileSym(S(f), [x]), tc = Y.compileSym(T, [x]);
  const c = Y.constValue(at) || 0;
  const h = 0.01;
  const err = Math.abs(fc(c + h) - tc(c + h));
  if (!(err < 1e-3 * Math.pow(h, n) + 1e-12)) throw new MathError('checkfailed');
  return ok({ task: 'taylor', label: { key: 'task.taylor', params: { v: x, n } }, exact: { latex: toTex(T), text: toText(T) }, steps: steps.list, verified: 'numeric', plot: toText(T) });
}

// ---------- algebra ----------

function taskSimplify(node, s, mode) {
  if (!node) throw new MathError('argcount', { fn: mode, n: 1 });
  if (node.type === 'call' && COMMANDS.has(node.name)) throw new MathError('nested', { fn: node.name });
  const e = symOf(node);
  const x = mainVar([node]);
  let out;
  const steps = new Steps();
  if (mode === 'expand') out = Y.expand(e);
  else if (mode === 'factor') out = factorAny(e, x, steps);
  else out = simplifyAny(e, x);
  // check: same function at random points
  const vars = [...Y.symbols(e)];
  const fa = Y.compileSym(S(e), vars), fb = Y.compileSym(out, vars);
  const pts = testPoints(16, -3, 3);
  const env = (t) => vars.map((_, i) => t + 0.37 * i);
  if (!agree((t) => fa(...env(t)), (t) => fb(...env(t)), { points: pts, rel: 1e-9 })) throw new MathError('checkfailed');
  const keys = { expand: 'task.expanded', factor: 'task.factorised', simplify: 'task.simplified' };
  const ed = exactAndDecimal(out, s);
  let note = null;
  if (mode === 'factor' && Y.key(out) === Y.key(S(e))) note = { key: 'note.noFactor' };
  return ok({
    task: mode, label: { key: keys[mode] },
    exact: ed.exact, decimal: vars.length ? null : ed.decimal,
    steps: steps.list, verified: 'numeric', note,
    plot: vars.length === 1 ? toText(out) : null,
  });
}

function factorAny(e, x, steps) {
  const { num, den } = Y.together(e);
  const f = (p) => {
    const vars = [...Y.symbols(p)];
    if (vars.length <= 1) return Y.factorUni(p, vars[0] || x) || commonFactor(p);
    return commonFactor(p);
  };
  const fn_ = f(num), fd = Y.isOne(den) ? null : f(den);
  if (fn_ && !fd && Y.isOne(den)) { steps.add('factorise', `${toTex(S(e))} = ${toTex(fn_)}`); return fn_; }
  const top = fn_ || num, bottom = fd || den;
  return S(Y.mul(top, Y.pow(bottom, Y.NEG1)));
}

// Pull out a common monomial factor, and spot a difference of two squares.
function commonFactor(p) {
  const ex = Y.expand(p);
  if (ex.k !== '+') return null;
  // numeric gcd and minimum powers of each symbol
  const terms = ex.t.map((t) => Y.splitCoef(t));
  let g = null;
  for (const [c] of terms) {
    const r = c.abs();
    g = g ? new Rat(gcdBig(g.n, r.n), (g.d * r.d) / gcdBig(g.d, r.d)) : r;
  }
  const minPow = new Map();
  const powersOf = (rest) => {
    const m = new Map();
    for (const f of (rest.k === '*' ? rest.f : [rest])) {
      if (f.k === 's') m.set(f.n, (m.get(f.n) || 0) + 1);
      else if (f.k === '^' && f.b.k === 's' && Y.isInt(f.e) && !f.e.v.isNeg) m.set(f.b.n, (m.get(f.b.n) || 0) + Number(f.e.v.n));
    }
    return m;
  };
  terms.forEach(([, rest], i) => {
    const pw = powersOf(rest);
    if (i === 0) pw.forEach((v, k) => minPow.set(k, v));
    else for (const k of [...minPow.keys()]) minPow.set(k, Math.min(minPow.get(k), pw.get(k) || 0));
  });
  const mono = S(Y.mul(N(g || Rat.ONE), ...[...minPow.entries()].filter(([, v]) => v > 0).map(([k, v]) => Y.pow(Y.Sy(k), N(v)))));
  let inner = Y.expand(S(Y.mul(ex, Y.pow(mono, Y.NEG1))));
  // difference of squares a^2 - b^2
  if (inner.k === '+' && inner.t.length === 2) {
    const sq = (t) => {
      const r = S(Y.pow(t, Y.HALF));
      return r.k === '^' && Y.isNum(r.e) && !r.e.v.isInt ? null : r;
    };
    const [p1, p2] = inner.t;
    const neg2 = Y.splitCoef(p2)[0].isNeg ? p2 : Y.splitCoef(p1)[0].isNeg ? p1 : null;
    const pos = neg2 === p2 ? p1 : p2;
    if (neg2 && !Y.splitCoef(pos)[0].isNeg) {
      const a = sq(pos), b = sq(S(Y.mul(Y.NEG1, neg2)));
      if (a && b) inner = Y.mul(S(Y.add(a, Y.mul(Y.NEG1, b))), S(Y.add(a, b)));
    }
  }
  if (Y.isOne(mono) && inner.k === '+') return null;
  return Y.isOne(mono) ? inner : { k: '*', f: [mono, inner] };
}
function gcdBig(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }

function simplifyAny(e, x) {
  const base = tidy(S(e));
  // cancel common polynomial factors in rational functions of one variable
  try {
    const { num, den } = Y.together(e);
    if (!Y.isOne(den)) {
      const pn = Y.polyRat(num, x), pd = Y.polyRat(Y.expand(den), x);
      if (pn && pd) {
        const g = Y.P.gcd(pn, pd);
        if (g.length > 1) {
          const qn = Y.P.divmod(pn, g).q, qd = Y.P.divmod(pd, g).q;
          const lc = qd[qd.length - 1];
          const top = Y.fromPolyRat(qn.map((c) => c.div(lc)), x), bot = Y.fromPolyRat(qd.map((c) => c.div(lc)), x);
          const fTop = Y.factorUni(top, x) || top;
          const cand = S(Y.mul(fTop, Y.pow(bot, Y.NEG1)));
          if (toText(cand).length <= toText(base).length + 4) return cand;
        }
      }
    }
  } catch { /* fall through */ }
  return base;
}

// ---------- number theory, matrices, distributions ----------

function intOf(node) {
  const v = evaluate(node);
  if (!(v instanceof Rat) || !v.isInt) throw new MathError('intarg');
  return v.n;
}

function taskNumberTheory(name, a, s) {
  const n = intOf(a[0]);
  switch (name) {
    case 'isprime': {
      const p = isPrime(n);
      return ok({ task: 'isprime', label: { key: 'task.isprime' }, exact: { latex: `\\text{${p ? 'Yes' : 'No'}, } ${n} \\text{ is ${p ? '' : 'not '}prime}`, text: `${p ? 'Yes' : 'No'}, ${n} is ${p ? '' : 'not '}prime` }, verified: 'direct',
        note: !p && n > 1n ? { key: 'note.smallestFactor', params: { f: factorInt(n).factors[0][0].toString() } } : null });
    }
    case 'primes': {
      const ps = primesUpTo(n);
      return ok({ task: 'primes', label: { key: 'task.primes', params: { n: n.toString(), count: ps.length } }, exact: { latex: ps.length > 200 ? `${ps.slice(0, 200).join(',\\ ')},\\ \\dots` : ps.join(',\\ '), text: ps.join(', ') }, verified: 'direct' });
    }
    case 'factorint': {
      const { sign, factors } = factorInt(n);
      const latex = (sign < 0n ? '-' : '') + factors.map(([p, e]) => (e > 1 ? `${p}^{${e}}` : `${p}`)).join(' \\times ');
      const text = (sign < 0n ? '−' : '') + factors.map(([p, e]) => (e > 1 ? `${p}^${e}` : `${p}`)).join(' × ');
      return ok({ task: 'factorint', label: { key: 'task.primefactors' }, exact: { latex: latex || '1', text: text || '1' }, verified: 'direct' });
    }
    case 'fibonacci': {
      const f = fibonacci(n);
      return ok({ task: 'fibonacci', label: { key: 'task.fibonacci', params: { n: n.toString() } }, exact: null, decimal: { text: fmt(new Rat(f), { ...s, sciHigh: 30 }) }, verified: 'direct' });
    }
    default: throw new MathError('parse');
  }
}

function matrixOf(node) {
  if (!node || node.type !== 'list' || !node.items.every((r) => r.type === 'list')) throw new MathError('matarg');
  const rows = node.items.map((r) => r.items.map((it) => {
    const v = evaluate(it);
    if (!(v instanceof Rat)) {
      if (v instanceof Dec) return v.toRat();
      throw new MathError('matarg');
    }
    return v;
  }));
  if (rows.some((r) => r.length !== rows[0].length)) throw new MathError('matarg');
  return rows;
}
const ratTex = (q) => toTex(N(q));
const matTex = (A) => `\\begin{pmatrix}${A.map((r) => r.map(ratTex).join(' & ')).join(' \\\\ ')}\\end{pmatrix}`;
const matText = (A) => '[' + A.map((r) => '[' + r.map((v) => v.toString().replace('-', '−')).join(', ') + ']').join(', ') + ']';

function taskMatrix(name, a, s) {
  const A = matrixOf(a[0]);
  const label = { key: `task.matrix.${name}` };
  switch (name) {
    case 'det': { const d = M.det(A); return ok({ task: 'matrix', label, exact: { latex: ratTex(d), text: d.toString() }, decimal: d.isInt ? null : { text: fmtNum(d.toNumber(), s) }, verified: 'direct' }); }
    case 'trace': { const d = M.trace(A); return ok({ task: 'matrix', label, exact: { latex: ratTex(d), text: d.toString() }, verified: 'direct' }); }
    case 'rank': { const d = M.rank(A); return ok({ task: 'matrix', label, exact: { latex: String(d), text: String(d) }, verified: 'direct' }); }
    case 'inv': {
      const I = M.inverse(A);
      const chk = M.mul(A, I);
      if (!chk.every((r, i) => r.every((v, j) => v.eq(i === j ? Rat.ONE : Rat.ZERO)))) throw new MathError('checkfailed');
      const dec = I.every((r) => r.every((v) => v.isInt)) ? null : { text: '[' + I.map((r) => '[' + r.map((v) => fmtNum(v.toNumber(), s)).join(', ') + ']').join(', ') + ']' };
      return ok({ task: 'matrix', label, exact: { latex: matTex(I), text: matText(I) }, decimal: dec, verified: 'direct', decimalMatrix: I.map((r) => r.map((v) => v.toNumber())) });
    }
    case 'transpose': { const T = M.transpose(A); return ok({ task: 'matrix', label, exact: { latex: matTex(T), text: matText(T) }, verified: 'direct' }); }
    case 'rref': { const R = M.rref(A); return ok({ task: 'matrix', label, exact: { latex: matTex(R), text: matText(R) }, verified: 'direct' }); }
    case 'eigs': {
      M.square(A);
      if (A.length <= 4) {
        const cp = M.charPoly(A);
        const r = solveEquation(Y.fromPolyRat(cp, 'λ'), Y.ZERO, 'λ', { complex: true }, new Steps());
        const parts = [...r.solutions.map((sl) => sl.exact ? (sl.tex || toTex(sl.exact)) : `\\approx ${fmtNum(sl.value, s)}`), ...(r.complex || []).map((sl) => toTex(sl.exact))];
        if (parts.length) {
          return ok({ task: 'matrix', label, exact: { latex: `\\lambda = ${parts.join(',\\ ')}`, text: 'λ = ' + [...r.solutions.map((sl) => sl.exact ? toText(sl.exact) : '≈' + fmtNum(sl.value, s)), ...(r.complex || []).map((sl) => toText(sl.exact))].join(', ') }, verified: 'symbolic',
            note: { key: 'note.charpoly', params: { p: toText(Y.fromPolyRat(cp, 'λ')) } } });
        }
      }
      const ev = eigNumeric(A);
      const t = ev.map((z) => (z.im ? `${fmtNum(z.re, s)} ${z.im < 0 ? '−' : '+'} ${fmtNum(Math.abs(z.im), s)}i` : fmtNum(z.re, s))).join(', ');
      return ok({ task: 'matrix', label, exact: null, decimal: { text: 'λ ≈ ' + t }, numeric: true, verified: 'numeric' });
    }
    default: throw new MathError('parse');
  }
}

function taskDistribution(name, a, s) {
  const nums = a.map((n) => { const v = evaluate(n); if (v instanceof Cx || Array.isArray(v)) throw new MathError('argtype'); return v.toNumber(); });
  const need = { normalcdf: [2, 4], normalpdf: [1, 3], invnorm: [1, 3], binompdf: [3, 3], binomcdf: [3, 3], poissonpdf: [2, 2], poissoncdf: [2, 2] }[name];
  if (!need || nums.length < need[0] || nums.length > need[1]) throw new MathError('argcount', { fn: name, n: need ? need[1] : 0 });
  let v;
  switch (name) {
    case 'normalcdf': v = ST.normalCdf(nums[0], nums[1], nums[2] ?? 0, nums[3] ?? 1); break;
    case 'normalpdf': v = ST.normalPdf(nums[0], nums[1] ?? 0, nums[2] ?? 1); break;
    case 'invnorm': v = ST.invNorm(nums[0], nums[1] ?? 0, nums[2] ?? 1); break;
    case 'binompdf': v = ST.binomPdf(nums[0], nums[1], nums[2]); break;
    case 'binomcdf': v = ST.binomCdf(nums[0], nums[1], nums[2]); break;
    case 'poissonpdf': v = ST.poissonPdf(nums[0], nums[1]); break;
    case 'poissoncdf': v = ST.poissonCdf(nums[0], nums[1]); break;
    default: throw new MathError('parse');
  }
  if (!Number.isFinite(v)) throw new MathError('domain', { fn: name });
  return ok({ task: 'distribution', label: { key: `task.dist.${name}` }, exact: null, decimal: { text: fmtNum(v, { ...s, sig: Math.min(s.sig || 10, 10) }) }, verified: 'direct', numeric: true });
}

// Exposed for tests and the tools suite.
export { evaluate, parse, formatValue, recognize };
