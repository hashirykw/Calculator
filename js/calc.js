// Scientific calculator screen (section 09): expression entry with a cursor,
// live preview, order of operations, S⇔D, memory, Ans, repeat-equals,
// keyboard map, optional sound/vibration, Graph it / Open in Solve.

import { CalcModel } from './core/calcmodel.js';
import { Rat } from './core/rational.js';
import { Dec } from './core/decimal.js';
import { h, icon, clear, toast, copyText, keyFeedback, isTyping, sheetOpen, seg } from './ui.js';
import { t } from './i18n/index.js';
import { bus, app } from './bus.js';
import { updateSettings } from './prefs.js';
import { renderTex, katexReady } from './mathrender.js';
import { getHistory } from './history-store.js';
import * as engine from './engine-client.js';
import { openFunctions } from './funcs.js';

// Display form of each token (what the user sees).
const SHOW = {
  'asin(': 'sin⁻¹(', 'acos(': 'cos⁻¹(', 'atan(': 'tan⁻¹(', 'e^(': 'e^(', '10^(': '10^(', 'root(': 'ʸ√(', 'abs(': 'Abs(',
  rand: 'Ran#', 'sum(': '∑(', 'ᴇ': 'E', '*': '×', '/': '÷', '-': '−',
};
const MULTI_KEYS = ['sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'ln(', 'log(', '√(', '∛(', 'nCr(', 'nPr(', 'abs(', 'root(', 'mod(', 'sum(', 'e^(', '10^('];

// [label, insert/action, aria key, class, second: [label, insert/action, aria]]
const K = (label, ins, aria, cls = 'fn', second = null) => ({ label, ins, aria, cls, second });
const ROWS = [
  [K('2nd', '@2nd', 'second', 'ctl'), K('DEG', '@angle', 'angle', 'ctl'), K('S⇔D', '@sd', 'sd', 'ctl'), K('MC', '@MC', 'mc', 'ctl'), K('MR', '@MR', 'mr', 'ctl'), K('M+', '@M+', 'mplus', 'ctl')],
  [K('sin', 'sin(', 'sin', 'fn', ['sin⁻¹', 'asin(', 'asin']), K('cos', 'cos(', 'cos', 'fn', ['cos⁻¹', 'acos(', 'acos']), K('tan', 'tan(', 'tan', 'fn', ['tan⁻¹', 'atan(', 'atan']),
    K('ln', 'ln(', 'ln', 'fn', ['eˣ', 'e^(', 'exp']), K('log', 'log(', 'log', 'fn', ['10ˣ', '10^(', 'tenx']), K('M−', '@M-', 'mminus', 'ctl')],
  [K('x²', '²', 'sq', 'fn', ['x³', '³', 'cube']), K('xʸ', '^(', 'pow', 'fn', ['ʸ√x', 'root(', 'root']), K('√', '√(', 'sqrt', 'fn', ['∛', '∛(', 'cbrt']),
    K('x!', '!', 'fact', 'fn', ['|x|', 'abs(', 'abs']), K('nCr', 'nCr(', 'ncr', 'fn', ['nPr', 'nPr(', 'npr']), K('π', 'π', 'pi', 'fn', ['Ran#', 'rand', 'rand'])],
  [K('(', '(', 'lp', 'fn', ['sinh', 'sinh(', 'sinh']), K(')', ')', 'rp', 'fn', ['cosh', 'cosh(', 'cosh']), K('%', '%', 'pct', 'fn', ['mod', 'mod(', 'mod']),
    K('×10ⁿ', 'ᴇ', 'exp10', 'fn', ['a b/c', '@mixed', 'frac']), K('Ans', 'Ans', 'ans', 'fn', ['∑', 'sum(', 'sum']), K('e', 'e', 'e', 'fn', ['tanh', 'tanh(', 'tanh'])],
];
const NUM_ROWS = [
  [K('7', '7', null, 'num'), K('8', '8', null, 'num'), K('9', '9', null, 'num'), K('⌫', '@del', 'del', 'ctl'), K('AC', '@ac', 'ac', 'ctl danger')],
  [K('4', '4', null, 'num'), K('5', '5', null, 'num'), K('6', '6', null, 'num'), K('×', '×', 'times', 'op'), K('÷', '÷', 'divide', 'op')],
  [K('1', '1', null, 'num'), K('2', '2', null, 'num'), K('3', '3', null, 'num'), K('+', '+', 'plus', 'op'), K('−', '−', 'minus', 'op')],
];
const LAST_ROW = [K('0', '0', null, 'num'), K('.', '.', 'dot', 'num', [',', ',', 'comma']), K('±', '-', 'neg', 'fn', ['i', 'i', 'i']), K('=', '@eq', 'eq', 'eq')];

let model, root, inputEl, resultEl, indicatorsEl, actionsEl, keypadEl, extraEl;
let second = false;
let histCursor = -1;
let active = true;

export async function mount(el) {
  const s = app.settings;
  model = new CalcModel(modelSettings(s));
  try {
    const m = s.memory || '0';
    model.memory = /e/.test(m) ? Dec.parse(m) : Rat.parse(m);
  } catch { /* bad saved memory: start at 0 */ }

  indicatorsEl = h('div', { class: 'indicators', 'aria-hidden': 'true' });
  inputEl = h('div', { class: 'calc-input', role: 'textbox', 'aria-label': t('calc.input'), 'aria-readonly': 'true', tabindex: '0' });
  resultEl = h('div', { class: 'calc-result', 'aria-live': 'polite', 'aria-label': t('calc.result'), title: t('calc.copyHint'), on: { click: copyResult } });
  const display = h('div', { class: 'display' }, indicatorsEl, inputEl, resultEl);
  actionsEl = h('div', { class: 'calc-actions' });
  keypadEl = buildKeypad();
  extraEl = buildExtra();
  root = h('div', { class: 'calc' }, display, actionsEl, h('div', { class: 'keypad-wrap' }, extraEl, keypadEl));
  el.append(root);

  inputEl.addEventListener('click', placeCursor);
  swipeDelete(display);
  document.addEventListener('keydown', onKey);
  document.addEventListener('paste', onPaste);
  bus.on('settings', (st) => { model.setSettings(modelSettings(st)); keypadEl.classList.toggle('basic', st.keypad === 'basic'); render(); });
  bus.on('calc:insert', (text) => { model.setText(text); render(); });
  keypadEl.classList.toggle('basic', s.keypad === 'basic');
  render();
}
export function show() { active = true; render(); }
export function hide() { active = false; }
export function unmount() { document.removeEventListener('keydown', onKey); document.removeEventListener('paste', onPaste); }

function modelSettings(s) {
  return { angle: s.angle, complex: s.complex, sig: s.sig, group: s.group, sciHigh: s.sciHigh, exactFirst: s.exactFirst };
}

// ---------- keypad ----------
function keyButton(k, { extra = false } = {}) {
  const label = extra && k.second ? k.second[0] : k.label;
  const aria = extra && k.second ? k.second[2] : k.aria;
  const btn = h('button', {
    class: `key ${k.cls}${extra ? ' small' : ''}`, type: 'button',
    'aria-label': aria ? t(`key.${aria}`) : label,
    data: { ins: extra && k.second ? k.second[1] : k.ins },
  });
  if (!extra && k.second) btn.append(h('span', { class: 'k2', 'aria-hidden': 'true', text: k.second[0] }));
  btn.append(h('span', { class: 'k1', text: label }));
  if (k.ins === '@del') longPress(btn, () => { model.clear(); render(); keyFeedback(); });
  return btn;
}
function buildKeypad() {
  const pad = h('div', { class: 'keypad', role: 'group', 'aria-label': t('nav.calc') });
  ROWS.forEach((row) => row.forEach((k) => { const b = keyButton(k); b.classList.add('sci'); pad.append(b); }));
  NUM_ROWS.forEach((row) => pad.append(h('div', { class: 'row5' }, row.map((k) => keyButton(k)))));
  pad.append(h('div', { class: 'row4' }, LAST_ROW.map((k) => keyButton(k))));
  pad.addEventListener('click', (e) => {
    const b = e.target.closest('.key');
    if (!b || b.dataset.long === '1') { if (b) delete b.dataset.long; return; }
    press(b.dataset.ins, b);
  });
  return pad;
}
// Desktop / landscape: every 2nd function as its own key.
function buildExtra() {
  const pad = h('div', { class: 'keypad-extra', role: 'group', 'aria-label': t('key.second') });
  [...ROWS, [LAST_ROW[1], LAST_ROW[2]]].flat().filter((k) => k.second).forEach((k) => pad.append(keyButton(k, { extra: true })));
  pad.addEventListener('click', (e) => {
    const b = e.target.closest('.key');
    if (b) press(b.dataset.ins, b, true);
  });
  return pad;
}

function press(ins, btn, direct = false) {
  keyFeedback();
  if (!direct && second && btn && !ins.startsWith('@2nd')) {
    const k = [...ROWS.flat(), ...NUM_ROWS.flat(), ...LAST_ROW].find((x) => x.ins === ins);
    if (k && k.second) ins = k.second[1];
    setSecond(false);
  }
  if (ins.startsWith('@')) return action(ins.slice(1));
  model.insert(ins);
  histCursor = -1;
  render();
}

function action(a) {
  switch (a) {
    case '2nd': setSecond(!second); return;
    case 'angle': {
      const next = { deg: 'rad', rad: 'grad', grad: 'deg' }[app.settings.angle];
      updateSettings({ angle: next });
      return;
    }
    case 'sd': {
      if (!model.toggleSD()) {
        if (model.result) toast(t('calc.noExact'));
      }
      render();
      return;
    }
    case 'mixed': if (!model.toggleMixed()) toast(t('calc.noExact')); render(); return;
    case 'MC': case 'MR': case 'M+': case 'M-': {
      model.memoryOp(a === 'M-' ? 'M−' : a);
      saveMemory();
      render();
      return;
    }
    case 'del': model.backspace(); render(); return;
    case 'ac': model.clear(); histCursor = -1; render(); return;
    case 'eq': equals(); return;
    default: return;
  }
}

function setSecond(on) {
  second = on;
  const b = keypadEl.querySelector('[data-ins="@2nd"]');
  if (b) b.setAttribute('aria-pressed', String(on));
  keypadEl.classList.toggle('second', on);
  keypadEl.querySelectorAll('.key').forEach((key) => {
    const k = [...ROWS.flat(), ...NUM_ROWS.flat(), ...LAST_ROW].find((x) => x.ins === key.dataset.ins);
    if (!k || !k.second) return;
    key.querySelector('.k1').textContent = on ? k.second[0] : k.label;
    key.querySelector('.k2').textContent = on ? k.label : k.second[0];
    key.setAttribute('aria-label', t(`key.${on ? k.second[2] : k.aria}`));
  });
  renderIndicators();
}

function saveMemory() {
  const m = model.memory;
  updateSettings({ memory: m instanceof Rat ? m.toString() : m.toString() });
}

// Calculus, algebra and matrix commands go to the Solve engine (exact
// answers, done in the worker); everything else is evaluated here.
const ENGINE_CMD = /\b(solve|diff|integrate|limit|factor|expand|simplify|taylor|isprime|primes|factorint|fibonacci|det|inv|transpose|trace|rank|rref|eigs|normalcdf|normalpdf|invnorm|binompdf|binomcdf|poissonpdf|poissoncdf)\s*\(/;
let engineSeq = 0, engineBusy = false;
async function engineEquals() {
  const text = model.text;
  const my = ++engineSeq;
  model.error = null;
  engineBusy = true;
  render();
  const s = app.settings;
  const r = await engine.solve(text, { angle: s.angle, complex: s.complex, sig: s.sig, group: s.group });
  if (my !== engineSeq) return;
  engineBusy = false;
  if (!r.ok) { model.error = r.error; model.justEvaluated = false; model.result = null; render(); return; }
  const exact = r.exact ? { latex: r.exact.latex, text: r.exact.text } : null;
  const decimal = r.decimal ? r.decimal.text : exact ? exact.text : '';
  model.result = { decimal, exact, mixed: null };
  model.view = exact ? 'exact' : 'decimal';
  model.justEvaluated = true;
  model.lastOp = null;
  // keep a plain number as Ans so it can be used next
  const plainNum = String(r.decimal ? r.decimal.text : exact ? exact.text : '').replace(/^≈\s*/, '').replace(/,/g, '').replace(/−/g, '-').trim();
  if (/^-?\d+(\.\d+)?(\/\d+)?$/.test(plainNum)) {
    try { model.ans = plainNum.includes('/') || !plainNum.includes('.') ? Rat.parse(plainNum) : Dec.parse(plainNum); } catch { /* keep old Ans */ }
  }
  bus.emit('result', { kind: 'calc', input: inputText(), decimal, exact: exact ? exact.text : '' });
  render();
}

function insertFunction(text, whole, example) {
  if (whole) model.setText(text);
  else {
    model.insert(text);
    if (example) toast(t('fn.hint', { ex: example }));
  }
  histCursor = -1;
  render();
}
export function showFunctions() { openFunctions(insertFunction); }

function equals() {
  if (!(model.justEvaluated && model.lastOp) && ENGINE_CMD.test(model.text)) { engineEquals(); histCursor = -1; return; }
  const r = model.equals();
  histCursor = -1;
  if (r) {
    bus.emit('result', {
      kind: 'calc', input: inputText(), decimal: r.decimal,
      exact: r.exact ? r.exact.text : '',
    });
  }
  render();
}

// ---------- rendering ----------
const displayToken = (tk) => SHOW[tk] || tk;
const inputText = () => model.tokens.map(displayToken).join('');

function render() {
  if (!root) return;
  renderIndicators();
  // input line with caret
  clear(inputEl);
  model.tokens.forEach((tk, i) => {
    if (i === model.cursor) inputEl.append(h('span', { class: 'caret', 'aria-hidden': 'true' }));
    inputEl.append(h('span', { class: 'tk', data: { i: String(i) }, text: displayToken(tk) }));
  });
  if (model.cursor === model.tokens.length) inputEl.append(h('span', { class: 'caret', 'aria-hidden': 'true' }));
  // ghost closing brackets
  const open = model.tokens.join('').split('(').length - model.tokens.join('').split(')').length;
  if (open > 0 && !model.justEvaluated) inputEl.append(h('span', { class: 'ghost', 'aria-hidden': 'true', text: ')'.repeat(open) }));
  const caret = inputEl.querySelector('.caret');
  if (caret) caret.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  // result line
  resultEl.className = 'calc-result';
  clear(resultEl);
  if (model.error && !model.justEvaluated) {
    resultEl.classList.add('error');
    resultEl.textContent = errorText(model.error);
  } else if (model.justEvaluated && model.result) {
    resultEl.classList.add('final');
    const r = model.result;
    if (model.view === 'exact' && r.exact) showTex(r.exact.latex, r.exact.text);
    else if (model.view === 'mixed' && r.mixed) showTex(r.mixed.latex, r.mixed.text);
    else resultEl.textContent = r.decimal;
  } else if (engineBusy) {
    resultEl.classList.add('muted');
    resultEl.textContent = t('solve.working');
  } else if (ENGINE_CMD.test(model.text)) {
    resultEl.classList.add('hint');
    resultEl.textContent = t('calc.pressEq');
  } else {
    const p = model.preview();
    resultEl.textContent = p || '';
  }
  const len = (resultEl.textContent || '').length;
  resultEl.style.fontSize = `${Math.max(24, Math.min(40, 40 - (len - 12) * 1.3))}px`;
  if (resultEl.classList.contains('hint') || resultEl.classList.contains('muted')) resultEl.style.fontSize = '16px';
  if (!resultEl.classList.contains('error')) resultEl.scrollLeft = resultEl.scrollWidth;

  // actions under the display
  clear(actionsEl);
  const txt = model.text;
  if (/x/.test(txt.replace(/×/g, '')) && !ENGINE_CMD.test(txt)) actionsEl.append(h('button', { class: 'btn sm', type: 'button', on: { click: graphIt } }, icon('graph', 'sm'), t('calc.graphIt')));
  if (txt) actionsEl.append(h('button', { class: 'btn sm', type: 'button', on: { click: openSolve } }, icon('solve', 'sm'), t('calc.openSolve')));
  actionsEl.append(h('button', { class: 'btn sm', type: 'button', on: { click: showFunctions } }, icon('func', 'sm'), t('calc.functions')));
  // quick ways into the matrix and unit tools from the calculator
  if (!txt) {
    actionsEl.append(h('a', { class: 'btn sm ghost', href: '#/tools/matrix' }, icon('grid', 'sm'), t('calc.matrix')));
    actionsEl.append(h('a', { class: 'btn sm ghost', href: '#/tools/converter' }, icon('ruler', 'sm'), t('calc.units')));
  }
  actionsEl.append(h('span', { style: { flex: '1' } }));
  actionsEl.append(seg([['basic', t('calc.basic')], ['scientific', t('calc.scientific')]], app.settings.keypad, (v) => updateSettings({ keypad: v }), t('set.keypad')));
}
function showTex(latex, text) {
  const span = h('span');
  resultEl.append(span);
  renderTex(span, latex, { fallback: text });
  if (!katexReady()) span.textContent = text;
}

function renderIndicators() {
  clear(indicatorsEl);
  const s = app.settings;
  indicatorsEl.append(...[
    h('span', { class: second ? 'on' : '', text: second ? '2nd' : '' }),
    h('span', { class: 'on', text: s.angle.toUpperCase() }),
    model && model.hasMemory ? h('span', { class: 'on', text: 'M' }) : null,
    s.complex ? h('span', { text: 'CMPLX' }) : null,
    h('span', { class: 'spacer' }),
    model && model.justEvaluated && model.result && model.result.exact ? h('span', { text: model.view === 'decimal' ? 'S⇔D' : 'EXACT' }) : null,
  ].filter(Boolean));
  const angleKey = keypadEl && keypadEl.querySelector('[data-ins="@angle"] .k1');
  if (angleKey) angleKey.textContent = s.angle.toUpperCase();
}

export function errorText(err) {
  const { code, info = {} } = err;
  if (code === 'parse') return Number.isFinite(info.pos) ? t('err.parse', { pos: info.pos + 1 }) : t('err.parseNoPos');
  if (code === 'unknownfn') return info.suggestion ? t('err.unknownfn', info) : t('err.unknownfnNo', info);
  if (code === 'undefinedvar') return t('err.undefinedvarCalc', { name: info.name });
  if (code === 'notcalc') return t('err.notcalc');
  const key = `err.${code}`;
  const msg = t(key, { fn: info.fn || '', n: info.n || '', ...info });
  return msg === key ? t('err.internal') : msg;
}

// ---------- interactions ----------
function placeCursor(e) {
  const span = e.target.closest('.tk');
  if (!span) { model.setCursor(model.tokens.length); render(); return; }
  const r = span.getBoundingClientRect();
  const i = Number(span.dataset.i);
  model.setCursor(e.clientX > r.left + r.width / 2 ? i + 1 : i);
  if (model.justEvaluated) model.justEvaluated = false;
  render();
}

function swipeDelete(el) {
  let x0 = null, y0 = null;
  el.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
  el.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (dx < -40 && Math.abs(dy) < 30) { model.backspace(); render(); keyFeedback(); }
  });
}

function longPress(btn, fn) {
  let timer = null;
  const start = () => { timer = setTimeout(() => { btn.dataset.long = '1'; fn(); }, 600); };
  const cancel = () => clearTimeout(timer);
  btn.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
}

function copyResult() {
  const r = model.result;
  if (!r || !model.justEvaluated) return;
  const text = model.view === 'exact' && r.exact ? r.exact.text : model.view === 'mixed' && r.mixed ? r.mixed.text : r.plain;
  copyText(text);
}

function graphIt() {
  app.pending = { ...(app.pending || {}), graph: model.tokens.map(displayToken).join('') };
  location.hash = '#/graph';
}
function openSolve() {
  app.pending = { ...(app.pending || {}), solve: model.tokens.map(displayToken).join('') };
  location.hash = '#/solve';
}

function flash(ins) {
  const b = root.querySelector(`.key[data-ins="${CSS.escape(ins)}"]`);
  if (!b) return;
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 120);
}

const KEYMAP = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '.': '.', ',': ',',
  '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^(', '(': '(', ')': ')', '!': '!', '%': '%',
  s: 'sin(', c: 'cos(', t: 'tan(', l: 'log(', n: 'ln(', p: 'π', e: 'e', x: 'x', i: 'i',
};

function onKey(e) {
  if (!active || !root || app.route?.screen !== 'calc' || sheetOpen() || isTyping()) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); model.undo(); render(); return; }
  if (mod && e.key.toLowerCase() === 'c') {
    if (!String(window.getSelection())) { e.preventDefault(); copyResult(); }
    return;
  }
  if (mod || e.altKey) return;
  const k = e.key;
  if (k === 'Enter' || k === '=') { e.preventDefault(); flash('@eq'); equals(); return; }
  if (k === 'Backspace') { e.preventDefault(); flash('@del'); model.backspace(); render(); return; }
  if (k === 'Delete') { e.preventDefault(); model.move(1); model.backspace(); render(); return; }
  if (k === 'Escape') { e.preventDefault(); flash('@ac'); model.clear(); render(); return; }
  if (k === 'ArrowLeft') { e.preventDefault(); model.move(-1); if (model.justEvaluated) model.justEvaluated = false; render(); return; }
  if (k === 'ArrowRight') { e.preventDefault(); model.move(1); render(); return; }
  if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); stepHistory(k === 'ArrowUp' ? 1 : -1); return; }
  const ins = KEYMAP[k];
  if (ins) {
    e.preventDefault();
    flash(ins);
    model.insert(ins);
    histCursor = -1;
    render();
  }
}

function stepHistory(dir) {
  const list = getHistory().filter((x) => x.kind === 'calc');
  if (!list.length) return;
  histCursor = Math.max(-1, Math.min(list.length - 1, histCursor + dir));
  if (histCursor < 0) { model.clear(); render(); return; }
  model.setText(list[list.length - 1 - histCursor].input);
  render();
}

function onPaste(e) {
  if (!active || app.route?.screen !== 'calc' || sheetOpen() || isTyping()) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text) return;
  e.preventDefault();
  model.setText(text.trim().slice(0, 500).replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−'));
  toast(t('calc.pasted'));
  render();
}

export { MULTI_KEYS };
