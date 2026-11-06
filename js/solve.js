// Solve screen (section 10): typed or plain-English maths, live KaTeX preview
// of what was understood, autocomplete, voice input, result cards with
// traced steps and actions. Heavy work runs in a worker with a 5 s limit.

import { h, icon, clear, copyText, toast, debounce, shareOrCopy } from './ui.js';
import { t, has } from './i18n/index.js';
import { bus, app } from './bus.js';
import { renderTex, texSpan } from './mathrender.js';
import * as engine from './engine-client.js';
import { FUNCTIONS } from './core/parse.js';
import { errorText } from './calc.js';
import { toggleFav } from './history-store.js';

const EXAMPLES = [
  'solve 2x + 3 = 11', 'solve(x^2 - 7x + 10 = 0)', 'solve(2x + y = 7, x - y = 2)', 'solve(3x - 4 > 8)',
  'derivative of x^3 sin x', 'integrate sin(x) from 0 to pi', 'integrate(x e^x, x)', 'limit(sin(x)/x, x, 0)',
  'factor(x^2 - 9)', 'expand((x + 2)^3)', 'taylor(e^x, x, 0, 5)', 'prime factors of 360', 'sum(k^2, k, 1, 10)',
  'det([[1, 2], [3, 4]])', 'mean of 2, 4, 6, 8', 'normalcdf(-1, 1)', '(2 + 3i)(1 - i)', 'what is 15% of 240',
];

let ta, understood, acList, results, examplesEl, solveBtn, micBtn, emptyEl;
let acItems = [], acIndex = 0;
let busy = false;

export async function mount(el) {
  ta = h('textarea', {
    rows: '1', 'aria-label': t('solve.placeholder'), placeholder: t('solve.placeholder'), spellcheck: 'false',
    autocapitalize: 'off', autocomplete: 'off', enterkeyhint: 'go',
    on: { input: onInput, keydown: onKeydown, blur: () => setTimeout(hideAc, 150) },
  });
  micBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('solve.voice'), title: t('solve.voice'), on: { click: voice } }, icon('mic'));
  solveBtn = h('button', { class: 'btn primary', type: 'button', on: { click: run } }, t('solve.go'));
  understood = h('div', { class: 'understood', 'aria-live': 'polite' });
  acList = h('div', { class: 'ac-list', role: 'listbox', 'aria-label': t('solve.autocomplete'), hidden: true });
  results = h('div', { class: 'results panel' });
  examplesEl = h('div', { class: 'examples' }, h('h2', { text: t('solve.examples') }),
    h('div', { class: 'chips' }, EXAMPLES.map((ex) => h('button', { class: 'chip mono', type: 'button', on: { click: () => { setInput(ex); run(); } } }, ex))));
  emptyEl = h('p', { class: 'muted small', text: t('solve.empty') });
  el.append(h('div', { class: 'solve' },
    h('div', { class: 'solve-input' }, h('div', { class: 'solve-box' }, ta, micBtn, solveBtn), understood, acList),
    results, emptyEl, examplesEl));
  bus.on('settings', () => { document.querySelectorAll('.result-card [data-exam]').forEach((b) => { b.hidden = !!app.settings.examMode; }); });
  await show(app.route);
}

export async function show(r) {
  const q = r && r.query;
  if (app.pending && app.pending.solve) {
    setInput(app.pending.solve);
    delete app.pending.solve;
    run();
  } else if (q && q.get('e')) {
    try {
      setInput(decodeShare(q.get('e')));
      results.prepend(h('div', { class: 'note-box', text: t('solve.fromLink') }));
    } catch { /* bad link */ }
    history.replaceState(null, '', '#/solve');
  } else if (q && q.get('q')) {
    // plain-text links such as #/solve?q=solve x^2-5x+6=0 run straight away
    setInput(q.get('q').slice(0, 500));
    history.replaceState(null, '', '#/solve');
    run();
  }
  setTimeout(() => ta && ta.focus({ preventScroll: true }), 50);
}

function setInput(text) {
  ta.value = text;
  autosize();
  updatePreview();
}

function autosize() {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
}

const updatePreview = debounce(async () => {
  const text = ta.value.trim();
  if (!text) { clear(understood); return; }
  const p = await engine.preview(text);
  if (ta.value.trim() !== text) return;
  clear(understood);
  if (!p) return;
  if (p.ok) {
    understood.append(h('span', { text: `${t('solve.understood')}:` }));
    const span = h('span');
    understood.append(span);
    renderTex(span, p.tex, { fallback: p.text });
  } else if (p.error && p.error.code !== 'incomplete' && p.error.code !== 'empty') {
    understood.append(h('span', { class: 'muted', text: errorText(p.error) }));
  }
}, 160);

function onInput() {
  autosize();
  updatePreview();
  autocomplete();
}

// ---------- autocomplete ----------
function autocomplete() {
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const m = /([A-Za-z]{2,})$/.exec(before);
  if (!m) { hideAc(); return; }
  const frag = m[1].toLowerCase();
  acItems = Object.entries(FUNCTIONS).filter(([name]) => name.toLowerCase().startsWith(frag) && name.toLowerCase() !== frag).slice(0, 6);
  if (!acItems.length) { hideAc(); return; }
  acIndex = 0;
  renderAc();
}
function renderAc() {
  clear(acList);
  acItems.forEach(([name, desc], i) => {
    acList.append(h('div', {
      class: 'ac-item', role: 'option', 'aria-selected': String(i === acIndex), id: `ac-${i}`,
      on: { mousedown: (e) => { e.preventDefault(); acceptAc(i); } },
    }, h('span', { class: 'nm', text: `${name}(` }), h('span', { class: 'ds', text: desc })));
  });
  acList.hidden = false;
  ta.setAttribute('aria-activedescendant', `ac-${acIndex}`);
}
function hideAc() { acList.hidden = true; acItems = []; ta && ta.removeAttribute('aria-activedescendant'); }
function acceptAc(i) {
  const [name] = acItems[i];
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos).replace(/[A-Za-z]+$/, '');
  const after = ta.value.slice(pos);
  ta.value = `${before}${name}(${after}`;
  const c = before.length + name.length + 1;
  ta.setSelectionRange(c, c);
  hideAc();
  onInput();
}

function onKeydown(e) {
  if (!acList.hidden && acItems.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = (acIndex + 1) % acItems.length; renderAc(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = (acIndex - 1 + acItems.length) % acItems.length; renderAc(); return; }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); acceptAc(acIndex); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideAc(); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); }
}

// ---------- voice ----------
let recog = null;
function voice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast(t('solve.noSpeech')); return; }
  if (recog) { recog.stop(); return; }
  recog = new SR();
  recog.lang = 'en-GB';
  recog.interimResults = true;
  micBtn.setAttribute('aria-pressed', 'true');
  ta.placeholder = t('solve.listening');
  recog.onresult = (e) => {
    const text = [...e.results].map((r) => r[0].transcript).join(' ');
    setInput(text);
  };
  recog.onend = () => { recog = null; micBtn.setAttribute('aria-pressed', 'false'); ta.placeholder = t('solve.placeholder'); };
  recog.onerror = () => { recog && recog.stop(); };
  recog.start();
}

// ---------- solving ----------
async function run() {
  const text = ta.value.trim();
  if (!text || busy) return;
  hideAc();
  emptyEl.hidden = true;
  busy = true;
  solveBtn.disabled = true;
  const working = h('div', { class: 'result-card' }, h('div', { class: 'task' }, h('span', { class: 'spinner' }), t('solve.working')));
  results.prepend(working);
  const s = app.settings;
  const r = await engine.solve(text, { angle: s.angle, complex: s.complex, sig: s.sig, group: s.group, sciHigh: s.sciHigh });
  working.remove();
  busy = false;
  solveBtn.disabled = false;
  results.prepend(r.ok ? resultCard(r, text) : errorCard(r, text));
  if (r.ok) {
    bus.emit('result', {
      kind: 'solve', task: r.task, input: text,
      exact: r.exact ? r.exact.text : '', decimal: r.decimal ? r.decimal.text : '',
    });
  }
  // keep the list short
  while (results.children.length > 12) results.lastElementChild.remove();
}

function labelText(label) {
  if (!label) return '';
  return t(label.key, label.params || {});
}
function verifiedText(v) {
  return v === 'symbolic' ? t('solve.checkedSym') : v === 'numeric' ? t('solve.checked') : v === 'direct' ? t('solve.direct') : '';
}

export function resultCard(r, input) {
  const exam = !!app.settings.examMode;
  const card = h('article', { class: 'result-card', 'aria-label': labelText(r.label) });
  card.append(h('div', { class: 'task' }, labelText(r.label), r.verified ? h('span', { class: 'badge', title: verifiedText(r.verified) }, icon('check', 'sm'), verifiedText(r.verified)) : null,
    r.numeric ? h('span', { class: 'badge', text: t('solve.numeric') }) : null));
  if (r.inputTex) {
    const ex = h('div', { class: 'expr' });
    renderTex(ex, r.inputTex, { fallback: input });
    card.append(ex);
  }
  const exactEl = r.exact ? h('div', { class: 'exact' }) : null;
  if (exactEl) { renderTex(exactEl, r.exact.latex, { display: true, fallback: r.exact.text }); card.append(exactEl); }
  if (r.decimal) card.append(h('div', { class: `decimal${r.exact ? '' : ' exact'}`, text: r.decimal.text }));
  if (r.general) {
    const g = h('div', { class: 'decimal' }, h('span', { class: 'small', text: `${t('solve.general')}: ` }));
    const span = h('span');
    renderTex(span, r.general);
    g.append(span);
    card.append(g);
  }
  if (r.note && has(r.note.key)) card.append(h('p', { class: 'note', text: t(r.note.key, r.note.params || {}) }));

  const stepsEl = h('div', { class: 'steps', hidden: true });
  const actions = h('div', { class: 'btn-row' });
  const copyTextVal = r.exact ? r.exact.text : r.decimal ? r.decimal.text : '';
  actions.append(btn('copy', t('solve.copy'), () => copyText(copyTextVal)));
  if (r.exact) actions.append(btn('brackets', t('solve.copyLatex'), () => copyText(r.exact.latex)));
  if (r.steps && r.steps.length) {
    const sb = btn('list', t('solve.steps'), () => {
      if (!stepsEl.childElementCount) renderSteps(stepsEl, r.steps);
      stepsEl.hidden = !stepsEl.hidden;
      sb.lastChild.textContent = stepsEl.hidden ? t('solve.steps') : t('solve.hideSteps');
      sb.setAttribute('aria-expanded', String(!stepsEl.hidden));
    });
    sb.dataset.exam = '';
    sb.hidden = exam;
    sb.setAttribute('aria-expanded', 'false');
    actions.append(sb);
  }
  if (r.plot) actions.append(btn('graph', t('solve.plot'), () => { app.pending = { ...(app.pending || {}), graph: r.plot }; location.hash = '#/graph'; }));
  if (app.settings.amy) {
    const ab = btn('amy', t('solve.explain'), () => bus.emit('amy:ask', {
      text: t('amy.explainPrompt'),
      context: { expression: input, result: copyTextVal, task: labelText(r.label) },
    }));
    ab.dataset.exam = '';
    ab.hidden = exam;
    actions.append(ab);
  }
  actions.append(btn('star', t('solve.save'), () => {
    toggleFav({ id: `s${Date.now()}`, ts: Date.now(), input, exact: r.exact ? r.exact.text : '', decimal: r.decimal ? r.decimal.text : '', kind: 'solve' });
    toast(t('solve.saved'));
  }));
  actions.append(btn('share', t('solve.share'), () => shareOrCopy({ title: t('app.name'), text: `${input} → ${copyTextVal}`, url: shareUrl(input) })));
  card.append(actions, stepsEl);
  return card;
}

function btn(name, label, fn) {
  return h('button', { class: 'btn sm', type: 'button', on: { click: fn } }, icon(name, 'sm'), h('span', { text: label }));
}

function stepTitle(s) {
  const p = s.params || {};
  if (s.rule === 'note') return p.text || (p.eq ? `${t('common.example')} ${p.eq}` : '');
  if (s.rule === 'numeric' && p.what) return t(`step.numeric.${p.what}`);
  if (s.rule === 'numeric' && Number.isFinite(p.lo)) return t('step.numeric.range', p);
  if (s.rule === 'inverse' && p.outOfRange) return t('step.inverse.outOfRange', { fn: p.fn });
  return t(`step.${s.rule}`, p);
}

function renderSteps(el, steps) {
  for (const s of steps) {
    const title = s.rule === 'note' && s.params && s.params.eq ? '' : stepTitle(s);
    const row = h('div', { class: 'step' }, h('div', { class: 'title', text: title }));
    if (s.latex) {
      const m = h('div', { class: 'math' });
      renderTex(m, s.latex, { display: true });
      row.append(m);
    }
    el.append(row);
  }
  el.append(h('p', { class: 'tiny muted', text: verifiedText('numeric') }));
}

export function errorCard(r, input) {
  const card = h('article', { class: 'result-card error', role: 'alert' });
  card.append(h('p', { class: 'msg', text: errorText(r.error) }));
  const row = h('div', { class: 'btn-row' });
  if (r.error.code === 'unknownfn' && r.error.info.suggestion) {
    row.append(h('button', { class: 'btn sm', type: 'button', on: { click: () => {
      setInput(input.replace(new RegExp(r.error.info.name, 'i'), r.error.info.suggestion));
      run();
    } } }, `${r.error.info.suggestion}(…)`));
  }
  if (app.settings.amy && !app.settings.examMode && !['empty', 'incomplete'].includes(r.error.code)) {
    row.append(btn('amy', t('solve.askAmy'), () => bus.emit('amy:ask', { text: input })));
  }
  if (row.childElementCount) card.append(row);
  return card;
}

// ---------- share links ----------
export function encodeShare(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeShare(code) {
  const b = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(b, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes).slice(0, 2000);
}
const shareUrl = (input) => `${location.origin}${location.pathname}#/solve?e=${encodeShare(input)}`;
