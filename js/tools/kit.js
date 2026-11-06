// Shared building blocks for the tool pages: page scaffold, inputs that
// accept small expressions (1/3, 2^10, sqrt 2), copyable result rows, tabs,
// themed canvas charts and quiet history recording.

import { h, clear, icon, copyText } from '../ui.js';
import { t } from '../i18n/index.js';
import { bus, app } from '../bus.js';
import { parse, strip } from '../core/parse.js';
import { evaluate } from '../core/numeval.js';
import { Rat } from '../core/rational.js';
import { Dec } from '../core/decimal.js';
import { fmtNum, fmtMoney } from '../core/format.js';
import { fitCanvas, cssVar } from '../scheduler.js';

// ---------- page ----------
export function toolPage(id) {
  const body = h('div', { class: 'panel' });
  const root = h('div', { class: 'screen tool-page' },
    h('div', { class: 'screen-head' },
      h('a', { class: 'back', href: '#/tools' }, icon('left', 'sm'), t('nav.tools')),
      h('h1', { text: t(`tool.${id}`) }),
      h('p', { text: t(`tool.${id}.d`) })),
    body);
  return { root, body };
}

export const section = (title, ...children) => h('section', { class: 'card tool-sec' }, title ? h('h2', { class: 'sec-title', text: title }) : null, ...children);

// ---------- reading numbers ----------
// Plain numbers or small expressions. Returns {num, rat?} | {empty} | {error}.
export function readValue(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return { empty: true };
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  s = s.replace(/[−–]/g, '-');
  if (/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s)) {
    const num = Number(s);
    let rat = null;
    try { rat = Rat.parse ? Rat.parse(s) : null; } catch { rat = null; }
    return { num, rat };
  }
  try {
    const v = evaluate(strip(parse(s)), { angle: app.settings.angle });
    if (v instanceof Rat) return { num: v.toNumber(), rat: v };
    if (v instanceof Dec) return { num: v.toNumber(), dec: v };
    return { error: true };
  } catch {
    return { error: true };
  }
}

let uid = 0;
// Number field with label, optional unit and help. get() -> number | NaN (empty) | null (invalid)
export function numField(label, { value = '', placeholder = '', unit = '', help = '', onInput, inputmode = 'decimal', cls = '' } = {}) {
  const id = `tf${++uid}`;
  const input = h('input', { class: 'input mono', id, inputmode, autocomplete: 'off', spellcheck: 'false', placeholder, value: String(value), 'aria-describedby': help ? `${id}h` : undefined });
  const wrap = unit ? h('div', { class: 'input-unit' }, input, h('span', { class: 'unit', text: unit, 'aria-hidden': 'true' })) : input;
  const el = h('div', { class: `field ${cls}`.trim() }, h('label', { for: id, text: unit ? `${label} (${unit})` : label }), wrap, help ? h('div', { class: 'help', id: `${id}h`, text: help }) : null);
  const api = {
    el, input,
    get() {
      const r = readValue(input.value);
      const bad = !!r.error || (r.num !== undefined && !Number.isFinite(r.num));
      input.classList.toggle('invalid', bad);
      input.setAttribute('aria-invalid', String(bad));
      if (r.empty) return NaN;
      return bad ? null : r.num;
    },
    rat() { const r = readValue(input.value); return r.rat || null; },
    set(v) { input.value = v === null || v === undefined || Number.isNaN(v) ? '' : String(v); },
  };
  if (onInput) input.addEventListener('input', onInput);
  return api;
}
export const ok = (...vals) => vals.every((v) => typeof v === 'number' && Number.isFinite(v));

export function selectField(label, options, value, onChange) {
  const id = `tf${++uid}`;
  const sel = h('select', { class: 'input', id, on: { change: () => onChange && onChange(sel.value) } },
    options.map(([v, text]) => h('option', { value: v, text })));
  sel.value = value;
  return { el: h('div', { class: 'field' }, h('label', { for: id, text: label }), sel), input: sel, get: () => sel.value, set: (v) => { sel.value = v; } };
}

export const fieldRow = (...fields) => h('div', { class: 'tool-grid' }, fields.map((f) => (f && f.el ? f.el : f)));

// ---------- output ----------
export function outList() {
  const el = h('div', { class: 'out-list', role: 'list' });
  return {
    el,
    set(rows) {
      clear(el);
      for (const r of rows.filter(Boolean)) {
        const [k, v, o = {}] = r;
        const text = v === null || v === undefined ? '—' : String(v);
        el.append(h('div', { class: `out-row${o.big ? ' big' : ''}`, role: 'listitem' },
          h('span', { class: 'k', text: k }),
          h('button', { class: 'v', type: 'button', title: t('common.copy'), 'aria-label': `${k}: ${text}. ${t('common.copy')}`, on: { click: () => copyText(o.copy || text.replace(/\s×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (m, e) => `e${e}`)) } }, o.node || text)));
      }
      el.hidden = !el.childElementCount;
    },
  };
}

export function message(kind = 'note') {
  const el = h('div', { class: kind === 'warn' ? 'warn-box' : 'note-box', hidden: true, role: kind === 'warn' ? 'status' : undefined });
  return { el, set(text) { el.textContent = text || ''; el.hidden = !text; } };
}

// Formatting with the user's significant figures and grouping.
export const fmt = (x, sig) => fmtNum(x, sig || Math.min(app.settings.sig || 10, 10), { group: app.settings.group });
export const money = (x) => fmtMoney(x, app.settings.currency || 'PKR', app.settings.group === 'lakh');
export const pctf = (x, dp = 2) => (Number.isFinite(x) ? `${fmtNum(x, 12, { group: app.settings.group }).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')}%` : '—');
export const round = (x, dp) => (Number.isFinite(x) ? Number(x.toFixed(dp)) : x);
// Plain decimal text (never 1e-7 style) for handing numbers to Graph or Solve.
export const plain = (x, sig = 6) => (Number.isFinite(x) ? x.toLocaleString('en-US', { useGrouping: false, maximumSignificantDigits: sig }) : 'NaN');

// A formatted number (1,234.5 or 6.02 ×10²³) as TeX.
const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export function numTex(str) {
  return String(str).replace(/−/g, '-').replace(/,/g, '{,}')
    .replace(/\s?×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (m, e) => `\\times 10^{${[...e].map((c) => (c === '⁻' ? '-' : SUPS.indexOf(c))).join('')}}`);
}

// Rational to LaTeX.
export function ratTex(r) {
  if (!(r instanceof Rat)) return String(r);
  if (r.isInt) return r.n.toString();
  const neg = r.n < 0n;
  return `${neg ? '-' : ''}\\frac{${(neg ? -r.n : r.n).toString()}}{${r.d.toString()}}`;
}
export const matTex = (A, f = ratTex) => `\\begin{pmatrix}${A.map((row) => row.map(f).join(' & ')).join(' \\\\ ')}\\end{pmatrix}`;

// ---------- tabs ----------
// tabs([[id, label]], onSelect) -> {el, select(id), value}
export function tabs(items, onSelect, initial) {
  const el = h('div', { class: 'tabs', role: 'tablist' });
  const buttons = new Map();
  let value = initial || items[0][0];
  for (const [id, label] of items) {
    const b = h('button', { type: 'button', role: 'tab', id: `tab-${id}-${++uid}`, 'aria-selected': 'false', on: { click: () => api.select(id), keydown: (e) => {
      const ids = items.map((x) => x[0]);
      const i = ids.indexOf(id);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
        api.select(next);
        buttons.get(next).focus();
      }
    } } }, label);
    buttons.set(id, b);
    el.append(b);
  }
  const api = {
    el,
    get value() { return value; },
    select(id) {
      value = id;
      for (const [k, b] of buttons) { b.setAttribute('aria-selected', String(k === id)); b.tabIndex = k === id ? 0 : -1; }
      onSelect && onSelect(id);
    },
  };
  return api;
}

// Panels that are built the first time their tab is opened.
export function tabbed(items, builders, initial) {
  const host = h('div', { class: 'tab-panels' });
  const panels = new Map();
  const tb = tabs(items, (id) => {
    for (const [k, p] of panels) p.hidden = k !== id;
    if (!panels.has(id)) {
      const p = h('div', { class: 'panel', role: 'tabpanel' });
      panels.set(id, p);
      host.append(p);
      builders[id](p);
    }
  }, initial);
  tb.select(initial || items[0][0]);
  return { el: h('div', { class: 'panel' }, tb.el, host), select: (id) => tb.select(id) };
}

// ---------- history ----------
// Tools record a result once the user stops typing, not on every key.
const timers = new Map();
export function record(tool, input, result) {
  clearTimeout(timers.get(tool));
  if (!input || !result) return;
  timers.set(tool, setTimeout(() => {
    bus.emit('result', { kind: 'tool', input: `${t(`tool.${tool}`)}: ${input}`, decimal: result, ref: { tool } });
  }, 2500));
}

// ---------- charts ----------
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 1) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

// chart({label}) -> {canvas, draw(spec)}. spec: {x:[a,b], y:[c,d], fmtX, fmtY, xTicks, plot(g)}
export function chart(label = '') {
  const canvas = h('canvas', { class: 'chart', role: 'img', 'aria-label': label });
  let spec = null;
  const draw = () => {
    if (!spec || !canvas.isConnected) return;
    const { w, h: H, dpr } = fitCanvas(canvas);
    if (w < 10) return;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, H);
    const col = { text: cssVar('--text-2'), grid: cssVar('--grid'), axis: cssVar('--axis'), bg: cssVar('--bg') };
    const pad = { l: 46, r: 12, t: 12, b: 26 };
    const [x0, x1] = spec.x, [y0, y1] = spec.y;
    const X = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
    const Y = (y) => H - pad.b - ((y - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
    c.font = '11px "Geist Mono", ui-monospace, monospace';
    c.lineWidth = 1;
    c.fillStyle = col.text;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (const v of niceTicks(y0, y1, 4)) {
      const y = Math.round(Y(v)) + 0.5;
      c.strokeStyle = col.grid;
      c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke();
      c.fillText((spec.fmtY || shortNum)(v), pad.l - 6, y);
    }
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (const v of spec.xTicks || niceTicks(x0, x1, Math.max(2, Math.floor((w - 60) / 70)))) {
      const x = Math.round(X(v)) + 0.5;
      c.fillText((spec.fmtX || shortNum)(v), x, H - pad.b + 6);
    }
    c.strokeStyle = col.axis;
    c.beginPath(); c.moveTo(pad.l, H - pad.b + 0.5); c.lineTo(w - pad.r, H - pad.b + 0.5); c.stroke();
    c.save();
    c.beginPath(); c.rect(pad.l, pad.t - 2, w - pad.l - pad.r, H - pad.t - pad.b + 4); c.clip();
    spec.plot({ c, X, Y, w, H, pad, color: (i) => cssVar(`--g${(i % 10) + 1}`), css: cssVar, x0, x1, y0, y1 });
    c.restore();
  };
  if ('ResizeObserver' in window) new ResizeObserver(() => requestAnimationFrame(draw)).observe(canvas);
  bus.on('settings', () => requestAnimationFrame(draw));
  return {
    canvas,
    draw(s, desc) { spec = s; if (desc) canvas.setAttribute('aria-label', desc); requestAnimationFrame(draw); },
    redraw: () => requestAnimationFrame(draw),
  };
}

export function shortNum(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toPrecision(3)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toPrecision(3)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toPrecision(3)}k`;
  return String(+v.toPrecision(4));
}

// Polyline helper for chart plots.
export function line(g, pts, color, width = 2, dash = null) {
  const { c, X, Y } = g;
  c.strokeStyle = color;
  c.lineWidth = width;
  c.setLineDash(dash || []);
  c.beginPath();
  let pen = false;
  for (const [x, y] of pts) {
    if (!Number.isFinite(y)) { pen = false; continue; }
    if (pen) c.lineTo(X(x), Y(y)); else { c.moveTo(X(x), Y(y)); pen = true; }
  }
  c.stroke();
  c.setLineDash([]);
}
export function alpha(color, a) {
  const s = String(color).trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const [r, g, b] = m[1].split(/[\s,/]+/).filter(Boolean);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return s;
}
