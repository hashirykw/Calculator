// Expression parser: text -> syntax tree. Never evaluates anything.
// Handles unicode maths symbols, implicit multiplication (2x, 3(4+1), 2sin(30)),
// functions written without brackets (sin x), |abs| bars, percent, factorial,
// relations (=, <, >, <=, >=) and lists/matrices ([1,2], [[1,2],[3,4]]).

import { Rat, MathError } from './rational.js';

// Every function name the app understands, with a one-line description used
// by autocomplete in Solve. Order matters only for display.
export const FUNCTIONS = {
  sin: 'sine', cos: 'cosine', tan: 'tangent', sec: 'secant', csc: 'cosecant', cot: 'cotangent',
  asin: 'inverse sine', acos: 'inverse cosine', atan: 'inverse tangent',
  sinh: 'hyperbolic sine', cosh: 'hyperbolic cosine', tanh: 'hyperbolic tangent',
  asinh: 'inverse hyperbolic sine', acosh: 'inverse hyperbolic cosine', atanh: 'inverse hyperbolic tangent',
  ln: 'natural logarithm', log: 'log base 10, or log(b, x) for base b', log2: 'log base 2', exp: 'e to the power x',
  sqrt: 'square root', cbrt: 'cube root', root: 'root(n, x) – n-th root of x', abs: 'absolute value',
  floor: 'round down', ceil: 'round up', round: 'round(x) or round(x, d) to d decimal places', sign: 'sign of x',
  nCr: 'nCr(n, r) – combinations', nPr: 'nPr(n, r) – permutations', fact: 'factorial',
  gcd: 'greatest common divisor', lcm: 'lowest common multiple', mod: 'mod(a, b) – remainder',
  isprime: 'is it prime?', primes: 'primes(n) – primes up to n', factorint: 'prime factorisation',
  fibonacci: 'fibonacci(n) – n-th Fibonacci number',
  solve: 'solve(equation) or solve(eq1, eq2)', diff: 'diff(f, x) – derivative', integrate: 'integrate(f, x) or integrate(f, a, b)',
  limit: 'limit(f, x, a) – limit as x approaches a', factor: 'factorise', expand: 'expand brackets', simplify: 'simplify',
  taylor: 'taylor(f, x, a, n) – Taylor series', sum: 'sum(f, k, a, b) – sum from a to b', product: 'product(f, k, a, b)',
  det: 'determinant', inv: 'matrix inverse', transpose: 'transpose', trace: 'trace', rank: 'rank', rref: 'reduced row echelon form',
  eigs: 'eigenvalues',
  mean: 'mean of a list', median: 'median of a list', mode: 'mode of a list', std: 'sample standard deviation', var: 'sample variance',
  pstd: 'population standard deviation', pvar: 'population variance', min: 'smallest value', max: 'largest value', total: 'sum of a list',
  normalcdf: 'normalcdf(a, b, μ, σ) – normal probability', normalpdf: 'normal density', invnorm: 'invnorm(p, μ, σ)',
  binompdf: 'binompdf(n, p, r) – P(X = r)', binomcdf: 'binomcdf(n, p, r) – P(X ≤ r)',
  poissonpdf: 'poissonpdf(λ, r)', poissoncdf: 'poissoncdf(λ, r)',
  re: 'real part', im: 'imaginary part', conj: 'complex conjugate', arg: 'argument (angle)',
  rand: 'random number between 0 and 1', randint: 'randint(a, b) – random whole number',
  field: 'field(P, Q) – vector field (graphing)',
};

// Alternative spellings the parser accepts, mapped to the canonical name.
const ALIASES = {
  arcsin: 'asin', arccos: 'acos', arctan: 'atan', cosec: 'csc', arsinh: 'asinh', arcosh: 'acosh', artanh: 'atanh',
  ncr: 'nCr', npr: 'nPr', factorial: 'fact', derivative: 'diff', integral: 'integrate', int: 'integrate', lim: 'limit',
  factorise: 'factor', factorize: 'factor', prod: 'product', fib: 'fibonacci', inverse: 'inv', stdev: 'std',
  variance: 'var', eigenvalues: 'eigs', log10: 'log', ranint: 'randint', random: 'rand', nthroot: 'root',
  series: 'taylor', average: 'mean', avg: 'mean',
};

export const CONSTANTS = new Set(['pi', 'e', 'i', 'Infinity', 'inf', 'Ans', 'M']);
const GREEK = {
  theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', lambda: 'λ', mu: 'μ', sigma: 'σ', phi: 'φ',
  omega: 'ω', rho: 'ρ', tau: 'τ', epsilon: 'ε',
};
const GREEK_CHARS = Object.fromEntries(Object.entries(GREEK).map(([k, v]) => [v, k]));

const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+', 'ⁿ': 'n', 'ˣ': 'x' };
const SUBSCRIPT = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

export function isFunctionName(name) { return name in FUNCTIONS || name in ALIASES; }
export function canonicalFunction(name) { return ALIASES[name] || name; }

// ---------- tokenizer ----------

function tokenize(src) {
  const toks = [];
  let i = 0;
  const push = (type, value, pos, extra) => toks.push({ type, value, pos, ...extra });
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    // numbers: 12, 1.5, .5, 3e5, 2ᴇ-3 (the ×10ⁿ key inserts ᴇ)
    if (/[0-9.]/.test(c)) {
      const m = /^(\d*\.?\d*)(?:(?:[eE](?=[+-]?\d))|ᴇ)?/.exec(src.slice(i));
      let text = m[1];
      if (text === '.' || text === '') throw new MathError('parse', { pos: i });
      let j = i + text.length;
      let exp = '';
      if (src[j] === 'ᴇ' || ((src[j] === 'e' || src[j] === 'E') && /^[+-]?\d/.test(src.slice(j + 1)))) {
        const em = /^[+-]?\d+/.exec(src.slice(j + 1));
        if (!em) throw new MathError('parse', { pos: j });
        exp = em[0];
        j += 1 + em[0].length;
      }
      if ((text.match(/\./g) || []).length > 1) throw new MathError('parse', { pos: i });
      push('num', Rat.parse(text + (exp ? 'e' + exp : '')), i, { raw: src.slice(i, j) });
      i = j;
      continue;
    }
    if (SUPERSCRIPT[c] !== undefined) {
      let j = i, s = '';
      while (j < src.length && SUPERSCRIPT[src[j]] !== undefined) { s += SUPERSCRIPT[src[j]]; j++; }
      push('sup', s, i);
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c) || GREEK_CHARS[c]) {
      if (GREEK_CHARS[c]) { push('id', GREEK_CHARS[c], i, { raw: c }); i++; continue; }
      let j = i;
      while (j < src.length && /[A-Za-z]/.test(src[j])) j++;
      // function names that end in a digit (log2)
      if (src.slice(i, j) === 'log' && src[j] === '2' && src[j + 1] === '(') j++;
      let word = src.slice(i, j);
      // subscripts: m₁, x_2
      let sub = '';
      while (j < src.length && SUBSCRIPT[src[j]] !== undefined) { sub += SUBSCRIPT[src[j]]; j++; }
      if (!sub && src[j] === '_' && /[A-Za-z0-9]/.test(src[j + 1] || '')) {
        let k = j + 1;
        while (k < src.length && /[A-Za-z0-9]/.test(src[k])) k++;
        sub = src.slice(j + 1, k);
        j = k;
      }
      // a lone "_" (or "_" with nothing after it) can't start a name
      if (!word) throw new MathError('parse', { pos: i });
      push('word', word, i, { sub });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '!=', '**', '=='].includes(two)) {
      push('op', two === '**' ? '^' : two === '==' ? '=' : two, i);
      i += 2;
      continue;
    }
    const map = {
      '−': '-', '–': '-', '×': '*', '·': '*', '⋅': '*', '÷': '/', '∕': '/', '≤': '<=', '≥': '>=', '≠': '!=',
    };
    const ch = map[c] || c;
    if ('+-*/^!%()[],=<>|'.includes(ch)) { push('op', ch, i); i++; continue; }
    if (c === '√') { push('pre', 'sqrt', i); i++; continue; }
    if (c === '∛') { push('pre', 'cbrt', i); i++; continue; }
    if (c === 'π') { push('id', 'pi', i, { raw: 'π' }); i++; continue; }
    if (c === 'ℯ') { push('id', 'e', i); i++; continue; }
    if (c === '∞') { push('id', 'Infinity', i); i++; continue; }
    if (c === '°') { push('op', '°', i); i++; continue; }
    throw new MathError('parse', { pos: i, near: c });
  }
  return splitWords(toks);
}

// Edit distance for "did you mean" suggestions.
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}
const SUSPECT_WORDS = {
  sine: 'sin', cosine: 'cos', tangent: 'tan', squareroot: 'sqrt', sqr: 'sqrt', root: 'root', logarithm: 'log',
  absolute: 'abs', modulus: 'abs', exponential: 'exp', arcsine: 'asin', arccosine: 'acos', arctangent: 'atan',
};
export function suggestFunction(word) {
  if (SUSPECT_WORDS[word.toLowerCase()]) return SUSPECT_WORDS[word.toLowerCase()];
  let best = null, bestD = 3;
  for (const name of [...Object.keys(FUNCTIONS), ...Object.keys(ALIASES)]) {
    const dd = lev(word.toLowerCase(), name.toLowerCase());
    if (dd < bestD) { bestD = dd; best = canonicalFunction(name); }
  }
  return bestD <= (word.length >= 5 ? 2 : 1) ? best : null;
}

// Turns letter runs into function names, constants and single-letter variables.
function splitWords(toks) {
  const out = [];
  for (let n = 0; n < toks.length; n++) {
    const t = toks[n];
    if (t.type !== 'word') { out.push(t); continue; }
    const next = toks[n + 1];
    const callNext = next && next.type === 'op' && next.value === '(';
    const w = t.value;
    if (t.sub) { out.push({ type: 'id', value: `${w}_${t.sub}`, pos: t.pos }); continue; }
    if (isFunctionName(w)) { out.push({ type: 'fn', value: canonicalFunction(w), pos: t.pos }); continue; }
    if (CONSTANTS.has(w) || GREEK[w]) { out.push({ type: 'id', value: w === 'inf' ? 'Infinity' : w, pos: t.pos }); continue; }
    if (w.length === 1) { out.push({ type: 'id', value: w, pos: t.pos }); continue; }
    // Common English words for functions ("sine", "cosine") are typos, not products.
    if (SUSPECT_WORDS[w.toLowerCase()]) {
      throw new MathError('unknownfn', { name: w, suggestion: SUSPECT_WORDS[w.toLowerCase()], pos: t.pos });
    }
    // "sinx", "lnx", "cos2x": a known function followed by more letters
    let prefix = '';
    for (let k = w.length - 1; k >= 2; k--) {
      const p = w.slice(0, k);
      if (isFunctionName(p)) { prefix = p; break; }
    }
    if (prefix) {
      out.push({ type: 'fn', value: canonicalFunction(prefix), pos: t.pos });
      pushLetters(out, w.slice(prefix.length), t.pos + prefix.length);
      continue;
    }
    if (callNext || w.length >= 4 || SUSPECT_WORDS[w.toLowerCase()]) {
      const sug = suggestFunction(w);
      if (callNext || sug) throw new MathError('unknownfn', { name: w, suggestion: sug, pos: t.pos });
    }
    pushLetters(out, w, t.pos);
  }
  return out;
}
function pushLetters(out, letters, pos) {
  // "pi" and greek names can hide inside a run, e.g. "2pix" -> pi, x
  let k = 0;
  while (k < letters.length) {
    if (letters.startsWith('pi', k)) { out.push({ type: 'id', value: 'pi', pos: pos + k }); k += 2; continue; }
    out.push({ type: 'id', value: letters[k], pos: pos + k });
    k++;
  }
}

// ---------- parser (Pratt) ----------

const BP = { rel: 1, add: 10, mul: 20, neg: 25, pow: 30, post: 40 };

export function parse(src, opts = {}) {
  if (!src || !src.trim()) throw new MathError('empty');
  const toks = tokenize(src);
  let p = 0;
  let autoClosed = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const isOp = (t, v) => t && t.type === 'op' && t.value === v;
  let absDepth = 0;

  // Can token t begin an operand (used for implicit multiplication)?
  const startsOperand = (t) => t && (t.type === 'num' || t.type === 'id' || t.type === 'fn' || t.type === 'pre' ||
    (t.type === 'op' && (t.value === '(' || t.value === '[' || (t.value === '|' && absDepth === 0))));

  function expect(v) {
    const t = peek();
    if (isOp(t, v)) { p++; return; }
    if (!t && (v === ')' || v === ']')) { autoClosed++; return; }
    throw new MathError(v === ')' || v === ']' ? 'bracket' : 'parse', { pos: t ? t.pos : src.length });
  }

  function parseExpr(rbp = 0) {
    let left = nud(next());
    for (;;) {
      const t = peek();
      if (!t) break;
      const lbp = leftBP(t);
      if (lbp <= rbp) break;
      left = led(t, left);
    }
    return left;
  }

  function leftBP(t) {
    if (t.type === 'op') {
      switch (t.value) {
        case '=': case '<': case '>': case '<=': case '>=': case '!=': return BP.rel;
        case '+': case '-': return BP.add;
        case '*': case '/': return BP.mul;
        case '^': return BP.pow;
        case '!': case '%': case '°': return BP.post;
        case '|': return absDepth > 0 ? 0 : BP.mul; // closing bar ends the operand
        case '(': case '[': return BP.mul;          // implicit multiplication
        default: return 0;
      }
    }
    if (t.type === 'sup') return BP.pow;
    if (startsOperand(t)) return BP.mul;            // implicit multiplication
    return 0;
  }

  function nud(t) {
    if (!t) throw new MathError('incomplete', { pos: src.length });
    switch (t.type) {
      case 'num': return { type: 'num', value: t.value, raw: t.raw };
      case 'id': return { type: 'sym', name: t.value };
      case 'pre': {
        const arg = parseUnaryArg();
        return { type: 'call', name: t.value, args: [arg] };
      }
      case 'fn': return parseCall(t);
      case 'sup': throw new MathError('parse', { pos: t.pos });
      case 'op':
        if (t.value === '(') {
          if (isOp(peek(), ')')) throw new MathError('incomplete', { pos: t.pos });
          const e = parseExpr(0);
          expect(')');
          return { type: 'group', arg: e };
        }
        if (t.value === '[') return parseList();
        if (t.value === '-') return { type: 'neg', arg: parseExpr(BP.neg) };
        if (t.value === '+') return parseExpr(BP.neg);
        if (t.value === '|') {
          absDepth++;
          const e = parseExpr(0);
          absDepth--;
          if (!isOp(peek(), '|')) throw new MathError('bracket', { pos: peek() ? peek().pos : src.length });
          p++;
          return { type: 'call', name: 'abs', args: [e] };
        }
        throw new MathError(t.value === ')' ? 'bracket' : 'parse', { pos: t.pos });
      default: throw new MathError('parse', { pos: t.pos });
    }
  }

  function led(t, left) {
    if (t.type === 'sup') {
      next();
      const v = t.value;
      const node = /^-?\d+$/.test(v) ? (v.startsWith('-') ? { type: 'neg', arg: numNode(v.slice(1)) } : numNode(v)) : parseSup(v);
      return { type: 'op', op: '^', args: [left, node] };
    }
    if (t.type === 'op') {
      switch (t.value) {
        case '+': case '-': case '*': case '/': {
          next();
          const right = parseExpr(BP[t.value === '+' || t.value === '-' ? 'add' : 'mul']);
          return { type: 'op', op: t.value, args: [left, right] };
        }
        case '^': {
          next();
          const right = parseExpr(BP.pow - 1); // right associative
          return { type: 'op', op: '^', args: [left, right] };
        }
        case '!': next(); return { type: 'post', op: '!', arg: left };
        case '%': next(); return { type: 'post', op: '%', arg: left };
        case '°': next(); return { type: 'post', op: '°', arg: left };
        case '=': case '<': case '>': case '<=': case '>=': case '!=': {
          next();
          const right = parseExpr(BP.rel);
          return { type: 'rel', op: t.value, args: [left, right] };
        }
        case '(': case '[': case '|': {
          const right = parseExpr(BP.mul);
          return { type: 'op', op: '*', args: [left, right], implicit: true };
        }
        default: break;
      }
    }
    if (startsOperand(t)) {
      if (left.type === 'num' && t.type === 'num') throw new MathError('parse', { pos: t.pos });
      const right = parseExpr(BP.mul);
      return { type: 'op', op: '*', args: [left, right], implicit: true };
    }
    throw new MathError('parse', { pos: t.pos });
  }

  function numNode(s) { return { type: 'num', value: Rat.parse(s), raw: s }; }
  function parseSup(s) {
    // superscripts like ⁿ or ˣ become symbols
    if (/^[a-z]$/.test(s)) return { type: 'sym', name: s };
    return parse(s, opts);
  }

  // Argument of a function written without brackets: "sin x", "sin 2x", "ln x^2".
  function parseUnaryArg() {
    const t = peek();
    if (isOp(t, '(')) {
      next();
      const e = parseExpr(0);
      expect(')');
      return maybeImplicitTail({ type: 'group', arg: e }, false);
    }
    if (isOp(t, '-')) { next(); return { type: 'neg', arg: parseUnaryArg() }; }
    let left = parseExpr(BP.pow - 1);
    return maybeImplicitTail(left, true);
  }
  // In "sin 2x" keep multiplying implicit factors, but stop at another function.
  function maybeImplicitTail(left, allow) {
    if (!allow) return left;
    while (peek() && startsOperand(peek()) && peek().type !== 'fn' && peek().type !== 'pre' &&
      !(left.type === 'num' && peek().type === 'num')) {
      const right = parseExpr(BP.pow - 1);
      left = { type: 'op', op: '*', args: [left, right], implicit: true };
    }
    return left;
  }

  function parseCall(t) {
    const name = t.value;
    if (isOp(peek(), '(')) {
      next();
      const args = [];
      if (!isOp(peek(), ')')) {
        for (;;) {
          args.push(parseExpr(0));
          if (isOp(peek(), ',')) { next(); continue; }
          break;
        }
      }
      expect(')');
      let node = { type: 'call', name, args };
      // sin(x)^2 stays (sin(x))^2 through the normal operator loop
      return node;
    }
    if (name === 'rand') return { type: 'call', name, args: [] };
    const arg = parseUnaryArg();
    return { type: 'call', name, args: [arg] };
  }

  function parseList() {
    const items = [];
    if (!isOp(peek(), ']')) {
      for (;;) {
        items.push(parseExpr(0));
        if (isOp(peek(), ',')) { next(); continue; }
        break;
      }
    }
    expect(']');
    return { type: 'list', items };
  }

  const tree = parseExpr(0);
  if (p < toks.length) {
    const t = toks[p];
    if (isOp(t, ',')) throw new MathError('parse', { pos: t.pos });
    throw new MathError(isOp(t, ')') || isOp(t, ']') ? 'bracket' : 'parse', { pos: t.pos });
  }
  return opts.withMeta ? { tree, autoClosed } : tree;
}

// Remove 'group' wrappers (they only matter for display).
export function strip(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'group') return strip(node.arg);
  const out = { ...node };
  if (node.args) out.args = node.args.map(strip);
  if (node.arg) out.arg = strip(node.arg);
  if (node.items) out.items = node.items.map(strip);
  return out;
}

// Free variables of an expression tree (constants excluded).
export function freeVars(node, bound = new Set(), acc = new Set()) {
  if (!node) return acc;
  if (node.type === 'sym') {
    if (!CONSTANTS.has(node.name) && !bound.has(node.name)) acc.add(node.name);
    return acc;
  }
  if (node.type === 'call' && (node.name === 'sum' || node.name === 'product') && node.args[1] && node.args[1].type === 'sym') {
    const b = new Set(bound); b.add(node.args[1].name);
    freeVars(node.args[0], b, acc);
    node.args.slice(2).forEach((a) => freeVars(a, bound, acc));
    return acc;
  }
  if (node.args) node.args.forEach((a) => freeVars(a, bound, acc));
  if (node.arg) freeVars(node.arg, bound, acc);
  if (node.items) node.items.forEach((a) => freeVars(a, bound, acc));
  return acc;
}

export { GREEK };
