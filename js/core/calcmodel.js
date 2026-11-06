// The scientific keypad's state machine, kept free of the DOM so it can be
// tested: expression entry with a cursor, live preview, Ans, repeat-equals,
// memory, exact/decimal (S⇔D) and mixed-number display.

import { Rat, MathError } from './rational.js';
import { parse, strip } from './parse.js';
import { evaluate } from './numeval.js';
import { formatValue, formatPlain } from './format.js';
import { recognize, mixedNumber } from './recognize.js';

// Keys that continue from Ans when pressed straight after "=".
const OPERATOR_START = /^[+−×÷*/^!%²³⁻]|^ᴇ/;   // ASCII '-' (the ± key) starts a new number

export class CalcModel {
  constructor(settings = {}) {
    this.settings = { angle: 'deg', complex: false, sig: 10, group: 'intl', sciHigh: 12, sciLow: -6, exactFirst: false, ...settings };
    this.tokens = [];
    this.cursor = 0;
    this.ans = Rat.ZERO;
    this.memory = Rat.ZERO;
    this.result = null;          // {value, decimal, exact, mixed}
    this.error = null;           // MathError code
    this.justEvaluated = false;
    this.lastOp = null;          // {op, rhsText} for repeat-equals
    this.view = 'decimal';       // 'decimal' | 'exact' | 'mixed'
    this.undoStack = [];
  }

  get text() { return this.tokens.join(''); }
  setSettings(s) { this.settings = { ...this.settings, ...s }; }

  snapshot() { this.undoStack.push({ tokens: [...this.tokens], cursor: this.cursor }); if (this.undoStack.length > 50) this.undoStack.shift(); }
  undo() { const s = this.undoStack.pop(); if (s) { this.tokens = s.tokens; this.cursor = s.cursor; this.justEvaluated = false; this.error = null; } }

  insert(tok) {
    this.snapshot();
    if (this.justEvaluated) {
      this.justEvaluated = false;
      if (OPERATOR_START.test(tok)) { this.tokens = ['Ans']; this.cursor = 1; }
      else { this.tokens = []; this.cursor = 0; }
      this.result = null;
    }
    this.error = null;
    this.tokens.splice(this.cursor, 0, tok);
    this.cursor++;
  }

  // Replace the whole input (paste, history recall).
  setText(text) {
    this.snapshot();
    this.tokens = tokenizeForEdit(text);
    this.cursor = this.tokens.length;
    this.justEvaluated = false;
    this.error = null;
    this.result = null;
  }

  backspace() {
    if (this.justEvaluated) { this.justEvaluated = false; this.result = null; }
    if (this.cursor === 0) return;
    this.snapshot();
    this.tokens.splice(this.cursor - 1, 1);
    this.cursor--;
    this.error = null;
  }
  clear() { this.snapshot(); this.tokens = []; this.cursor = 0; this.result = null; this.error = null; this.justEvaluated = false; }
  move(d) { this.cursor = Math.max(0, Math.min(this.tokens.length, this.cursor + d)); }
  setCursor(i) { this.cursor = Math.max(0, Math.min(this.tokens.length, i)); }

  ctx() {
    return { angle: this.settings.angle, complex: this.settings.complex, vars: { Ans: this.ans, M: this.memory } };
  }

  evalText(text) {
    const tree = strip(parse(text));
    return evaluate(tree, this.ctx());
  }

  // Grey live result while typing; null when the input is incomplete or invalid.
  preview() {
    if (!this.tokens.length || this.justEvaluated) return null;
    try {
      const v = this.evalText(this.text);
      return this.formatAll(v).decimal;
    } catch { return null; }
  }

  equals() {
    let text = this.text;
    if (this.justEvaluated && this.lastOp) {
      text = `Ans${this.lastOp.op}(${this.lastOp.rhs})`;
    } else if (!this.tokens.length) {
      return null;
    }
    try {
      const tree = strip(parse(text));
      const v = evaluate(tree, this.ctx());
      if (!(this.justEvaluated && this.lastOp)) this.lastOp = repeatable(tree, text);
      this.ans = v;
      this.result = this.formatAll(v);
      this.view = this.settings.exactFirst && this.result.exact ? 'exact' : 'decimal';
      this.error = null;
      this.justEvaluated = true;
      return { input: this.justEvaluated && this.lastOp && text.startsWith('Ans') ? text : this.text, value: v, ...this.result };
    } catch (e) {
      this.error = e instanceof MathError ? { code: e.code, info: e.info || {} } : { code: 'internal', info: {} };
      this.result = null;
      return null;
    }
  }

  formatAll(v) {
    const s = this.settings;
    const decimal = formatValue(v, { sig: s.sig, group: s.group, sciHigh: s.sciHigh, sciLow: s.sciLow });
    const ex = recognize(v);
    const exact = ex && ex.kind !== 'integer' ? ex : null;
    const mixed = v instanceof Rat ? mixedNumber(v) : null;
    return { value: v, decimal, exact, mixed, plain: formatPlain(v) };
  }

  // S⇔D: cycle decimal <-> exact. Returns false when there is no exact form.
  toggleSD() {
    if (!this.result || !this.result.exact) return false;
    this.view = this.view === 'decimal' ? 'exact' : 'decimal';
    return true;
  }
  // a b/c: improper fraction <-> mixed number
  toggleMixed() {
    if (!this.result || !this.result.mixed) return false;
    this.view = this.view === 'mixed' ? 'exact' : 'mixed';
    return true;
  }

  // Memory keys. M+ / M− use the current result (or evaluate the input).
  memoryOp(op) {
    if (op === 'MC') { this.memory = Rat.ZERO; return true; }
    if (op === 'MR') { this.insert('M'); return true; }
    let v = this.justEvaluated && this.result ? this.result.value : null;
    if (!v) {
      try { v = this.evalText(this.text || '0'); } catch { return false; }
    }
    try {
      const tree = { type: 'op', op: op === 'M+' ? '+' : '-', args: [{ type: 'val', value: this.memory }, { type: 'val', value: v }] };
      this.memory = evaluate(tree, this.ctx());
      return true;
    } catch { return false; }
  }
  get hasMemory() { return !(this.memory instanceof Rat && this.memory.isZero); }
}

// For "5 + 2 = = =": remember the last top-level operation and its right side.
function repeatable(tree, text) {
  if (tree.type === 'op' && ['+', '-', '*', '/', '^'].includes(tree.op)) {
    // Recover the right operand's source text by re-printing simple nodes.
    const rhs = nodeText(tree.args[1]);
    if (rhs !== null) return { op: tree.op, rhs };
  }
  return null;
}
function nodeText(n) {
  if (n.type === 'num') return n.raw || n.value.toString();
  if (n.type === 'neg') { const t = nodeText(n.arg); return t === null ? null : `-${t}`; }
  if (n.type === 'sym' && ['pi', 'e'].includes(n.name)) return n.name;
  if (n.type === 'val') return formatPlain(n.value, 30);
  return null;
}

// Split text into editable tokens so backspace removes "sin(" in one press.
const MULTI = ['asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'sin(', 'cos(', 'tan(', 'log(', 'ln(', 'sqrt(', '√(', '∛(', 'abs(', 'root(', 'nCr(', 'nPr(', 'mod(', 'sum(', 'rand', 'Ans', 'exp('];
export function tokenizeForEdit(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const m = MULTI.find((w) => text.startsWith(w, i));
    if (m) { out.push(m); i += m.length; continue; }
    out.push(text[i]);
    i++;
  }
  return out;
}
