// LaTeX for the parser's tree exactly as the user wrote it (no
// simplification), so the live preview shows what was understood.

import { formatValue } from './format.js';

const GREEK_TEX = { pi: '\\pi', theta: '\\theta', alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta', lambda: '\\lambda', mu: '\\mu', sigma: '\\sigma', phi: '\\phi', omega: '\\omega', rho: '\\rho', tau: '\\tau', epsilon: '\\varepsilon', Infinity: '\\infty' };
const FN_TEX = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot', asin: '\\sin^{-1}', acos: '\\cos^{-1}', atan: '\\tan^{-1}',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', ln: '\\ln', log: '\\log', exp: '\\exp', gcd: '\\gcd', det: '\\det', min: '\\min', max: '\\max',
};

const strip = (n) => (n && n.type === 'group' ? strip(n.arg) : n);

function numTex(n) {
  const raw = n.raw || String(n.value);
  const m = /^(.*?)(?:[eEᴇ])([+-]?\d+)$/.exec(raw);
  if (m) return `${m[1]}\\times 10^{${m[2]}}`;
  return raw;
}

export function astTex(n) {
  if (!n) return '';
  switch (n.type) {
    case 'num': return numTex(n);
    case 'val': return formatValue(n.value, { sig: 10 }).replace(/−/g, '-').replace(/ ×10(.*)$/, (_, e) => `\\times 10^{${e.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, (c) => '0123456789-'['⁰¹²³⁴⁵⁶⁷⁸⁹⁻'.indexOf(c)])}}`);
    case 'sym': {
      if (GREEK_TEX[n.name]) return GREEK_TEX[n.name];
      if (n.name === 'Ans') return '\\mathrm{Ans}';
      const m = /^([A-Za-z]+)_(\d+)$/.exec(n.name);
      return m ? `${m[1]}_{${m[2]}}` : n.name;
    }
    case 'group': return `\\left(${astTex(n.arg)}\\right)`;
    case 'neg': return `-${wrapIf(n.arg, (t) => t.type === 'op' && (t.op === '+' || t.op === '-'))}`;
    case 'post':
      if (n.op === '!') return `${wrapIf(n.arg, (t) => t.type !== 'num' && t.type !== 'sym' && t.type !== 'group')}!`;
      if (n.op === '%') return `${astTex(n.arg)}\\%`;
      return `${astTex(n.arg)}^{\\circ}`;
    case 'op': {
      const [a, b] = n.args;
      switch (n.op) {
        case '+': return `${astTex(a)} + ${astTex(b)}`;
        case '-': return `${astTex(a)} - ${astTex(b)}`;
        case '*': {
          if (n.implicit) {
            const L = astTex(a), R = astTex(b);
            const numNum = /\d$/.test(L) && /^\d/.test(R);
            return numNum ? `${L} \\cdot ${R}` : `${L}${/^[a-zA-Z]/.test(R) && /[a-zA-Z]$/.test(L) ? ' ' : ''}${R}`;
          }
          return `${astTex(a)} \\times ${astTex(b)}`;
        }
        case '/': return `\\frac{${astTex(strip(a))}}{${astTex(strip(b))}}`;
        case '^': return `${wrapIf(a, (t) => ['op', 'neg', 'post', 'call'].includes(t.type) && !(t.type === 'call' && t.name === 'abs'))}^{${astTex(strip(b))}}`;
        default: return '?';
      }
    }
    case 'call': return callTex(n);
    case 'rel': {
      const ops = { '=': '=', '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge', '!=': '\\ne' };
      return `${astTex(n.args[0])} ${ops[n.op]} ${astTex(n.args[1])}`;
    }
    case 'list': {
      if (n.items.length && n.items.every((it) => it.type === 'list')) {
        return `\\begin{pmatrix}${n.items.map((r) => r.items.map(astTex).join(' & ')).join(' \\\\ ')}\\end{pmatrix}`;
      }
      return `\\left[${n.items.map(astTex).join(',\\ ')}\\right]`;
    }
    default: return '?';
  }
}

function wrapIf(n, cond) {
  const t = astTex(n);
  return cond(n) ? `\\left(${t}\\right)` : t;
}

function callTex(n) {
  const A = n.args.map((a) => astTex(strip(a)));
  switch (n.name) {
    case 'sqrt': return `\\sqrt{${A[0]}}`;
    case 'cbrt': return `\\sqrt[3]{${A[0]}}`;
    case 'root': return `\\sqrt[${A[0]}]{${A[1]}}`;
    case 'abs': return `\\left|${A[0]}\\right|`;
    case 'fact': return `${A[0]}!`;
    case 'log': return n.args.length === 2 ? `\\log_{${A[0]}}\\left(${A[1]}\\right)` : `\\log\\left(${A[0]}\\right)`;
    case 'nCr': return `{}^{${A[0]}}C_{${A[1]}}`;
    case 'nPr': return `{}^{${A[0]}}P_{${A[1]}}`;
    case 'diff': {
      const v = A[1] || 'x';
      return `\\frac{d${n.args[2] ? `^{${A[2]}}` : ''}}{d${v}${n.args[2] ? `^{${A[2]}}` : ''}}\\left[${A[0]}\\right]`;
    }
    case 'integrate': {
      if (n.args.length >= 3) {
        const [f, a, b, v] = n.args.length === 4 ? [A[0], A[2], A[3], A[1]] : [A[0], A[1], A[2], 'x'];
        return `\\int_{${a}}^{${b}} ${f}\\,d${v}`;
      }
      return `\\int ${A[0]}\\,d${A[1] || 'x'}`;
    }
    case 'limit': return n.args.length >= 3 ? `\\lim_{${A[1]}\\to ${A[2]}} ${A[0]}` : `\\lim ${A[0]}`;
    case 'sum': case 'product': {
      const sym = n.name === 'sum' ? '\\sum' : '\\prod';
      return n.args.length === 4 ? `${sym}_{${A[1]}=${A[2]}}^{${A[3]}} ${A[0]}` : `${sym}\\left(${A.join(', ')}\\right)`;
    }
    default: {
      const name = FN_TEX[n.name] || `\\operatorname{${n.name}}`;
      return `${name}\\left(${A.join(',\\ ')}\\right)`;
    }
  }
}
