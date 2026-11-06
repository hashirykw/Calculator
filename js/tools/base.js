// Number bases (14.6): any base 2–36 with fractions (repeating digits shown
// in brackets, worked out exactly), two's complement for 8/16/32/64 bits,
// bitwise operations, a tappable bit grid, and text ⇄ code points.

import { h, clear } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { Rat, MathError } from '../core/rational.js';
import { parseBase, toBase, twosComplement, fromTwosComplement, bitwise, textToCodes, codesToText, isControl } from '../core/base.js';
import { errorText } from '../calc.js';
import { toolPage, outList, message, record, selectField, tabbed } from './kit.js';

const BASES = Array.from({ length: 35 }, (_, i) => [String(i + 2), t('base.baseN', { n: i + 2 })]);
const NAMED = { 2: 'base.bin', 8: 'base.oct', 10: 'base.dec', 16: 'base.hex' };
BASES.forEach((b) => { if (NAMED[b[0]]) b[1] = `${t(NAMED[b[0]])} (${b[0]})`; });
const BITS = [['8', '8'], ['16', '16'], ['32', '32'], ['64', '64']];
const group4 = (s) => s.replace(/\B(?=(\d{4})+(?!\d))/g, ' ');

export function create() {
  const { root, body } = toolPage('base');
  const tb = tabbed([['convert', t('base.convert')], ['twos', t('base.twos')], ['bitwise', t('base.bitwise')], ['bits', t('base.bitGrid')], ['text', t('base.text')]], {
    convert, twos, bitwise: bitwisePanel, bits: bitGrid, text: textPanel,
  });
  body.append(tb.el);
  return { root };
}

const err = (e) => (e instanceof MathError ? errorText({ code: e.code, info: e.info || {} }) : t('err.internal'));

function convert(p) {
  const saved = store.get('base', {});
  const input = h('input', { class: 'input mono', autocomplete: 'off', spellcheck: 'false', value: saved.v || '255.1', 'aria-label': t('base.value') });
  const from = selectField(t('common.from'), BASES, saved.from || '10', update);
  const other = selectField(t('base.alsoIn'), BASES, saved.other || '36', update);
  const warn = message('warn');
  const out = outList();
  const note = h('p', { class: 'help', text: t('base.repeatHelp') });
  input.addEventListener('input', update);
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'field' }, h('label', { text: t('base.value') }), input), h('div', { class: 'tool-grid' }, from.el, other.el)), warn.el, out.el, note);
  function update() {
    store.set('base', { v: input.value, from: from.get(), other: other.get() });
    warn.set('');
    if (!input.value.trim()) { out.set([]); return; }
    let r;
    try { r = parseBase(input.value, Number(from.get())); } catch (e) { warn.set(err(e)); out.set([]); input.classList.add('invalid'); return; }
    input.classList.remove('invalid');
    const row = (b) => {
      const v = toBase(r, b, 48);
      const text = b === 2 || b === 16 ? v.text.replace(/^(-?)([0-9A-F]+)/, (m, s, ip) => s + (ip.length > 4 ? group4(ip) : ip)) : v.text;
      return [b === 10 ? t('base.dec') : b === 2 ? t('base.bin') : b === 8 ? t('base.oct') : b === 16 ? t('base.hex') : t('base.baseN', { n: b }), `${text}${b === 10 && v.repeat ? '' : ''}`, { big: b === 10, copy: v.text.replace('…', '') }];
    };
    const rows = [row(10), row(2), row(8), row(16)];
    if (![2, 8, 10, 16].includes(Number(other.get()))) rows.push(row(Number(other.get())));
    if (!r.isInt) {
      rows.push([t('base.fraction'), r.toString()]);
    }
    out.set(rows);
    record('base', `${input.value} (${t('base.baseN', { n: from.get() })})`, `${toBase(r, 10, 24).text} = ${toBase(r, 2, 32).text}₂ = ${toBase(r, 16, 16).text}₁₆`);
  }
  update();
}

function twos(p) {
  const bits = selectField(t('base.bits'), BITS, '8', update);
  const dec = h('input', { class: 'input mono', inputmode: 'numeric', value: '-42', 'aria-label': t('base.decimalValue') });
  const bin = h('input', { class: 'input mono', inputmode: 'numeric', 'aria-label': t('base.binaryPattern') });
  const warn = message('warn');
  const out = outList();
  dec.addEventListener('input', () => update('dec'));
  bin.addEventListener('input', () => update('bin'));
  p.append(h('div', { class: 'card panel' }, bits.el,
    h('div', { class: 'field' }, h('label', { text: t('base.decimalValue') }), dec),
    h('div', { class: 'field' }, h('label', { text: t('base.binaryPattern') }), bin),
    h('p', { class: 'help', text: t('base.twosHelp') })), warn.el, out.el);
  function update(src = 'dec') {
    warn.set('');
    const n = Number(bits.get());
    try {
      let v;
      if (src === 'bin') {
        const s = bin.value.replace(/\s/g, '');
        if (!/^[01]+$/.test(s) || s.length > n) throw new MathError('digit', { ch: s.replace(/[01]/g, '')[0] || s, base: 2 });
        v = fromTwosComplement(s, n);
        dec.value = v.toString();
      } else {
        const s = dec.value.trim().replace(/[−–]/g, '-');
        if (!/^-?\d+$/.test(s)) throw new MathError('intarg');
        v = BigInt(s);
        bin.value = group4(twosComplement(v, n));
      }
      const pattern = twosComplement(v, n);
      const lim = 1n << BigInt(n - 1);
      out.set([
        [t('base.binaryPattern'), group4(pattern), { big: true, copy: pattern }],
        [t('base.hex'), BigInt('0b' + pattern).toString(16).toUpperCase().padStart(n / 4, '0')],
        [t('base.signed'), v.toString()], [t('base.unsigned'), BigInt('0b' + pattern).toString()],
        [t('base.range', { bits: n }), `${(-lim).toString()} … ${(lim - 1n).toString()}`],
      ]);
      record('base', `${v} (${n}-bit)`, pattern);
    } catch (e) { warn.set(err(e)); out.set([]); }
  }
  update();
}

function bitwisePanel(p) {
  const base = selectField(t('base.inputBase'), [['10', t('base.dec')], ['2', t('base.bin')], ['16', t('base.hex')]], '10', update);
  const bits = selectField(t('base.bits'), BITS, '8', update);
  const a = h('input', { class: 'input mono', value: '12', 'aria-label': 'A' }), b = h('input', { class: 'input mono', value: '10', 'aria-label': 'B' });
  const ops = [['and', 'A AND B'], ['or', 'A OR B'], ['xor', 'A XOR B'], ['not', 'NOT A'], ['shl', 'A << B'], ['shr', 'A >> B']];
  const op = selectField(t('base.operation'), ops, 'and', update);
  const warn = message('warn');
  const out = outList();
  a.addEventListener('input', update); b.addEventListener('input', update);
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' }, base.el, bits.el, op.el),
    h('div', { class: 'tool-grid' }, h('div', { class: 'field' }, h('label', { text: 'A' }), a), h('div', { class: 'field' }, h('label', { text: 'B' }), b))), warn.el, out.el);
  function update() {
    warn.set('');
    const B = Number(base.get()), n = Number(bits.get());
    try {
      const ra = parseBase(a.value, B);
      const rb = op.get() === 'not' ? Rat.ZERO : parseBase(b.value, B);
      if (!ra.isInt || !rb.isInt) throw new MathError('intarg');
      const r = bitwise(op.get(), ra.n, rb.n, n);
      const pat = r.unsigned.toString(2).padStart(n, '0');
      out.set([
        [t('base.bin'), group4(pat), { big: true, copy: pat }],
        [t('base.dec'), r.unsigned.toString()], [t('base.signed'), r.signed.toString()],
        [t('base.hex'), r.unsigned.toString(16).toUpperCase()],
      ]);
      record('base', `${ops.find((o) => o[0] === op.get())[1]} (A=${a.value}, B=${b.value})`, r.unsigned.toString());
    } catch (e) { warn.set(err(e)); out.set([]); }
  }
  update();
}

function bitGrid(p) {
  let n = 8, value = 0b10110010n;
  const bits = selectField(t('base.bits'), BITS.slice(0, 3), '8', (v) => { n = Number(v); value &= (1n << BigInt(n)) - 1n; draw(); });
  const grid = h('div', { class: 'bit-grid', role: 'group', 'aria-label': t('base.bitGrid') });
  const out = outList();
  p.append(h('div', { class: 'card panel' }, bits.el, grid, h('p', { class: 'help', text: t('base.gridHelp') })), out.el);
  function draw() {
    clear(grid);
    for (let i = n - 1; i >= 0; i--) {
      const on = ((value >> BigInt(i)) & 1n) === 1n;
      grid.append(h('button', { type: 'button', 'aria-pressed': String(on), 'aria-label': t('base.bitN', { n: i, v: 2 ** i }), title: `2^${i} = ${2 ** i}`, on: { click: () => { value ^= 1n << BigInt(i); draw(); } } }, on ? '1' : '0'));
    }
    const pat = value.toString(2).padStart(n, '0');
    out.set([[t('base.dec'), value.toString(), { big: true }], [t('base.signed'), fromTwosComplement(pat, n).toString()], [t('base.hex'), value.toString(16).toUpperCase()], [t('base.bin'), group4(pat), { copy: pat }]]);
  }
  draw();
}

function textPanel(p) {
  const text = h('textarea', { class: 'input', rows: '2', 'aria-label': t('base.textIn') });
  text.value = 'Nexlyr';
  const codes = h('textarea', { class: 'input mono', rows: '2', 'aria-label': t('base.codesIn'), spellcheck: 'false' });
  const fmtSel = selectField(t('base.codeFormat'), [['10', t('base.dec')], ['16', t('base.hex')], ['2', t('base.bin')]], '10', () => fromText());
  const warn = message('warn');
  text.addEventListener('input', fromText);
  codes.addEventListener('input', fromCodes);
  p.append(h('div', { class: 'card panel' },
    h('div', { class: 'field' }, h('label', { text: t('base.textIn') }), text), fmtSel.el,
    h('div', { class: 'field' }, h('label', { text: t('base.codesIn') }), codes),
    h('p', { class: 'help', text: t('base.textHelp') })), warn.el);
  function fromText() {
    const B = Number(fmtSel.get());
    codes.value = textToCodes(text.value).map((c) => (B === 16 ? `U+${c.toString(16).toUpperCase().padStart(4, '0')}` : B === 2 ? c.toString(2).padStart(8, '0') : String(c))).join(' ');
    warn.set('');
  }
  function fromCodes() {
    const B = Number(fmtSel.get());
    try {
      const list = codes.value.trim().split(/[\s,]+/).filter(Boolean).map((s) => {
        const c = parseInt(s.replace(/^U\+|^0x/i, ''), B);
        if (!Number.isFinite(c)) throw new MathError('digit', { ch: s, base: B });
        return c;
      });
      const ctl = list.filter(isControl);
      text.value = codesToText(list.filter((c) => !isControl(c) || c === 10 || c === 9));
      warn.set(ctl.length ? t('base.controlChars', { n: ctl.length }) : '');
    } catch (e) { warn.set(err(e)); }
  }
  fromText();
}
