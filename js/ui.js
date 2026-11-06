// UI building blocks: element builder, icons, the Nexlyr mark, sheets and
// dialogs (focus trapped, Esc and Back close them), a single toast queue,
// copy/share helpers and optional key feedback.

import { ICONS, FILLED } from './icons.js';
import { t } from './i18n/index.js';
import { app } from './bus.js';
import { play } from './sfx.js';

// h('button', {class: 'btn', on: {click}}, 'text') — children strings become text nodes (never HTML).
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'data') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

const SVGNS = 'http://www.w3.org/2000/svg';
// Icons are static, trusted markup from icons.js.
export function icon(name, cls = '') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  if (FILLED[name]) { svg.setAttribute('fill', 'currentColor'); svg.innerHTML = FILLED[name]; }
  else {
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = ICONS[name] || ICONS.info;
  }
  return svg;
}

let markId = 0;
export function mark(cls = 'mark') {
  const id = `nxg${++markId}`;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 66 92');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="66" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00C3F3"/><stop offset=".55" stop-color="#00A2DC"/><stop offset="1" stop-color="#006AB1"/></linearGradient></defs><g fill="url(#${id})"><rect x="0" y="0" width="10" height="92"/><rect x="14" y="0" width="10" height="92"/><rect x="28" y="0" width="10" height="92"/><rect x="42" y="0" width="10" height="66"/><rect x="56" y="0" width="10" height="66"/></g>`;
  return svg;
}

export function iconButton(name, label, onClick, extra = {}) {
  return h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, on: { click: onClick }, ...extra }, icon(name));
}
export function button(label, onClick, { cls = 'btn', iconName, ...extra } = {}) {
  return h('button', { class: cls, type: 'button', on: { click: onClick }, ...extra }, iconName ? icon(iconName, 'sm') : null, label);
}

// ---------- toasts: one queue, one on screen at a time ----------
const queue = [];
let showing = false;
let toastRoot;
export function toast(message, { action, label, duration = 2500, kind = 'info' } = {}) {
  queue.push({ message, action, label, duration, kind });
  if (!showing) nextToast();
}
function nextToast() {
  const item = queue.shift();
  if (!item) { showing = false; return; }
  showing = true;
  toastRoot = toastRoot || document.getElementById('toasts');
  const ms = item.action ? Math.max(item.duration, 6000) : item.duration;
  const ic = { info: 'info', ok: 'check', achieve: 'trophy', warn: 'alert', update: 'refresh' }[item.kind] || 'info';
  const node = h('div', { class: `toast t-${item.kind}`, role: 'status', style: { '--ms': `${ms}ms` } },
    h('span', { class: 'toast-ic' }, icon(ic, 'sm')), h('span', { class: 'toast-msg' }, item.message),
    item.action ? h('button', { class: 'btn sm primary', type: 'button', on: { click: () => { item.action(); done(); } } }, item.label) : null,
    h('i', { class: 'toast-bar', 'aria-hidden': 'true' }));
  toastRoot.append(node);
  play(item.kind === 'achieve' ? 'achieve' : item.kind === 'warn' ? 'error' : 'toast');
  const timer = setTimeout(done, ms);
  function done() {
    clearTimeout(timer);
    node.classList.add('out');
    setTimeout(() => { node.remove(); setTimeout(nextToast, 80); }, 220);
  }
}

// ---------- sheets and dialogs ----------
const openSheets = [];
let ignorePop = false;

window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  const top = openSheets[openSheets.length - 1];
  if (top) top.close(true);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openSheets.length) { e.preventDefault(); openSheets[openSheets.length - 1].close(); }
});

// openSheet({title, body, wide, drawer, onClose, actions}) -> {el, body, close}
export function openSheet({ title, body, wide = false, drawer = false, onClose, headExtra = [], label, icon: headIcon, center = false } = {}) {
  const opener = document.activeElement;
  const backdrop = h('div', { class: 'backdrop' });
  const content = h('div', { class: 'sheet-body' }, body);
  const head = h('div', { class: 'sheet-head' }, headIcon ? h('span', { class: 'sheet-ic' }, icon(headIcon)) : null,
    h('h2', { text: title, id: `sheet-t-${openSheets.length}` }), ...headExtra,
    iconButton('close', t('common.close'), () => api.close(), { 'data-nosfx': '' }));
  const handle = h('div', { class: 'handle', 'aria-hidden': 'true' });
  const sheet = h('div', { class: `sheet${wide ? ' wide' : ''}${drawer ? ' drawer' : ''}${center ? ' center' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `sheet-t-${openSheets.length}`, 'aria-label': label || undefined }, handle, head, content);
  document.body.append(backdrop, sheet);
  requestAnimationFrame(() => { backdrop.dataset.open = ''; sheet.dataset.open = ''; });
  play('open');
  backdrop.addEventListener('click', () => api.close());
  sheet.addEventListener('keydown', (e) => trapTab(e, sheet));
  swipeToClose(handle, sheet, () => api.close());
  history.pushState({ sheet: true }, '');
  let closed = false;
  const api = {
    el: sheet, body: content,
    close(fromPop = false) {
      if (closed) return;
      closed = true;
      play('close');
      openSheets.splice(openSheets.indexOf(api), 1);
      delete backdrop.dataset.open; delete sheet.dataset.open;
      setTimeout(() => { backdrop.remove(); sheet.remove(); }, 330);
      if (!fromPop) { ignorePop = true; history.back(); }
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
      onClose && onClose();
    },
  };
  openSheets.push(api);
  setTimeout(() => {
    const f = sheet.querySelector('[autofocus], input, textarea, select, button:not(.icon-btn)') || sheet.querySelector('button');
    f && f.focus({ preventScroll: true });
  }, 60);
  return api;
}
export const closeAllSheets = () => [...openSheets].reverse().forEach((s) => s.close());
export const sheetOpen = () => openSheets.length > 0;

function trapTab(e, root) {
  if (e.key !== 'Tab') return;
  const f = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function swipeToClose(handle, sheet, close) {
  let y0 = null, dy = 0;
  handle.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; handle.setPointerCapture(e.pointerId); sheet.style.transition = 'none'; });
  handle.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 90) close();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

export function confirmDialog(message, { okLabel = t('common.ok'), danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({
      title: t('common.ok') === okLabel ? '' : okLabel, center: true, icon: danger ? 'alert' : 'info',
      body: h('div', { class: `panel confirm${danger ? ' danger' : ''}` }, h('p', { text: message }),
        h('div', { class: 'btn-row' },
          button(okLabel, () => { answered = true; s.close(); resolve(true); }, { cls: `btn ${danger ? 'danger' : 'primary'}` }),
          button(t('common.cancel'), () => { s.close(); }))),
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// ---------- clipboard, share, feedback ----------
export async function copyText(text, msg = t('toast.copied')) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg, { kind: 'ok' });
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    toast(ok ? msg : t('common.copyFailed'), { kind: ok ? 'ok' : 'warn' });
    return ok;
  }
}

export async function shareOrCopy({ title, text, url, files }) {
  try {
    if (files && navigator.canShare && navigator.canShare({ files })) { await navigator.share({ title, text, files }); return 'shared'; }
    if (navigator.share && !files) { await navigator.share({ title, text, url }); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  if (files && files[0]) { downloadBlob(files[0], files[0].name); return 'downloaded'; }
  await copyText(url || text, url ? t('toast.linkCopied') : t('toast.copied'));
  return 'copied';
}

export function downloadBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function keyFeedback() {
  const s = app.settings;
  if (!s) return;
  if (s.vibrate && navigator.vibrate) { try { navigator.vibrate(8); } catch { /* ignore */ } }
  play('key');
}

export function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

export const isTyping = () => {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
};

// Simple labelled form field.
export function field(labelText, input, helpText) {
  const id = input.id || `f${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id, text: labelText }), input, helpText ? h('div', { class: 'help', text: helpText }) : null);
}
export const numInput = (value = '', props = {}) => h('input', { class: 'input mono', inputmode: 'decimal', autocomplete: 'off', value: String(value), ...props });
export function seg(options, value, onChange, label) {
  const root = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const render = (v) => {
    clear(root);
    for (const [val, text] of options) {
      root.append(h('button', { type: 'button', 'aria-pressed': String(val === v), on: { click: () => { render(val); onChange(val); } } }, text));
    }
  };
  render(value);
  root.setValue = render;
  return root;
}
export function switchInput(checked, onChange, label) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, on: { change: () => onChange(input.checked) } });
  input.checked = !!checked;
  return h('span', { class: 'switch' }, input);
}
