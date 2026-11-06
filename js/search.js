// Global search (Ctrl/⌘ + K): screens, tools, settings, formulas, games and
// history in one list. Arrow keys move, Enter opens. If the text looks like
// maths, the first result solves it.

import { h, icon, clear, openSheet } from './ui.js';
import { TOOL_ID, GAME_ID, SCREEN_ID } from './identity.js';
import { t } from './i18n/index.js';
import { app } from './bus.js';
import { getHistory } from './history-store.js';

let sheet = null;
let formulas = null;

export async function mount(el) { el.append(h('p', { text: t('search.placeholder') })); }

const SCREENS = [['calc', 'calc'], ['solve', 'solve'], ['graph', 'graph'], ['tools', 'tools'], ['arcade', 'arcade'], ['help', 'help'], ['manual', 'manual'], ['amy', 'amy']];
const SETTINGS = [
  ['appearance', 'set.theme', 'palette dark light theme colour color glass'], ['appearance', 'set.fontSize', 'text size font bigger'], ['maths', 'set.angle', 'deg rad grad degrees radians'],
  ['maths', 'set.exactFirst', 'fraction surd exact'], ['maths', 'set.sig', 'significant figures decimals precision'], ['maths', 'set.complex', 'complex imaginary i'],
  ['maths', 'set.group', 'lakh crore comma grouping'], ['feedback', 'set.keypad', 'basic scientific keypad'], ['feedback', 'set.sound', 'sound click'],
  ['amy', 'set.amyOn', 'amy ai tutor chat'], ['region', 'set.language', 'urdu english language'], ['region', 'set.currency', 'currency pkr usd'],
  ['exam', 'set.exam', 'exam test classroom'], ['achievements', 'set.achievements', 'achievements trophies'], ['data', 'set.export', 'export backup import delete clear data'],
];
const GAMES = ['mathquiz', 'calcchain', 'sudoku', 'wordle', 'memory', 'snake', 'g2048', 'tetris', 'breakout', 'pong', 'asteroids', 'flappy', 'bubble', 'whack', 'dodge', 'typing', 'colormatch', 'reaction', 'gravdraw', 'numrush'];

const mathy = (q) => /[0-9]/.test(q) && /[-+*/^=×÷√%()]|\b(sin|cos|tan|log|ln|sqrt|solve|derivative|integrate|of)\b/i.test(q);

async function index() {
  const items = [];
  for (const [id, key] of SCREENS) {
    if (id === 'arcade' && app.settings.examMode) continue;
    if (id === 'amy' && (!app.settings.amy || app.settings.examMode)) continue;
    items.push({ k: 'screen', c: SCREEN_ID[id]?.[1], icon: id === 'help' ? 'help' : id === 'manual' ? 'book' : id, title: t(`nav.${key}`), words: `${t(`nav.${key}`)} ${id}`, go: () => { location.hash = `#/${id}`; } });
  }
  const { TOOLS } = await import('./tools/index.js');
  for (const tool of TOOLS) {
    items.push({ k: 'tool', icon: TOOL_ID[tool.id]?.[0] || tool.icon, c: TOOL_ID[tool.id]?.[1], title: t(`tool.${tool.id}`), sub: t(`tool.${tool.id}.d`), words: `${t(`tool.${tool.id}`)} ${t(`tool.${tool.id}.d`)} ${t(`tool.${tool.id}.k`)}`, go: () => { location.hash = `#/tools/${tool.id}`; } });
  }
  for (const [sec, key, words] of SETTINGS) {
    items.push({ k: 'setting', icon: 'settings', title: t(key), words: `${t(key)} ${words}`, go: () => import('./settings.js').then((m) => m.openSettings(sec)) });
  }
  if (!app.settings.examMode) {
    for (const g of GAMES) items.push({ k: 'game', icon: GAME_ID[g]?.[0] || 'arcade', c: GAME_ID[g]?.[1], title: t(`game.${g}`), sub: t(`game.${g}.d`), words: `${t(`game.${g}`)} ${t(`game.${g}.d`)} game play`, go: () => { location.hash = `#/arcade/${g}`; } });
  }
  try {
    if (!formulas) formulas = (await import('./tools/formulas.js')).loadFormulas();
    const data = await formulas;
    for (const f of data.formulas || []) {
      items.push({ k: 'formula', icon: 'book', title: f.name, sub: f.tex, words: `${f.name} ${(f.vars || []).map((v) => v.n).join(' ')} formula`, go: () => { location.hash = `#/tools/formulas?f=${encodeURIComponent(f.id)}`; } });
    }
  } catch { /* offline first load */ }
  for (const e of getHistory().slice(-150).reverse()) {
    items.push({ k: 'history', icon: 'history', title: e.input, sub: e.exact || e.decimal || '', words: `${e.input} ${e.exact} ${e.decimal}`, mono: true, go: () => import('./history.js').then((m) => m.openHistory()) });
  }
  return items;
}

function rank(items, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items.filter((x) => x.k === 'screen' || x.k === 'tool').slice(0, 14);
  const scored = [];
  for (const it of items) {
    const hay = it.words.toLowerCase(), title = it.title.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    let s = 0;
    if (title.startsWith(words[0])) s += 6;
    if (title.includes(q.toLowerCase())) s += 4;
    s += { screen: 5, tool: 4, setting: 2, formula: 2, game: 1, history: 0 }[it.k];
    scored.push([s, it]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 40).map((x) => x[1]);
}

export function openSearch() {
  if (sheet) { sheet.el.querySelector('input')?.focus(); return; }
  const input = h('input', { type: 'search', placeholder: t('search.placeholder'), 'aria-label': t('search.placeholder'), autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'search-results' });
  const results = h('div', { class: 'search-results', id: 'search-results', role: 'listbox' });
  const body = h('div', { class: 'panel search' }, h('div', { class: 'search-box' }, icon('search'), input, h('kbd', { text: 'Esc' })), results);
  sheet = openSheet({ title: t('nav.search'), body, wide: true, onClose: () => { sheet = null; } });
  let items = [], shown = [], sel = 0;

  const go = (it) => {
    if (!it) return;
    const s = sheet;
    if (s) s.close();
    setTimeout(() => it.go(), 140);   // let the sheet's history entry pop first
  };
  function draw() {
    const q = input.value.trim();
    shown = rank(items, q);
    if (q && mathy(q)) shown.unshift({ k: 'calc', icon: 'solve', title: t('search.solveIt', { q }), mono: true, go: () => { app.pending = { ...(app.pending || {}), solve: q }; location.hash = '#/solve'; } });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    clear(results);
    if (!shown.length) { results.append(h('div', { class: 'empty', text: t('search.empty') })); return; }
    shown.forEach((it, i) => results.append(h('button', { type: 'button', role: 'option', 'aria-selected': String(i === sel), on: { click: () => go(it), mousemove: () => { if (sel !== i) { sel = i; mark(); } } } },
      h('span', { class: 'sr-ic', style: it.c ? { '--c': it.c } : undefined }, icon(it.icon, 'sm')),
      h('span', { class: 'grow' }, h('span', { class: it.mono ? 'mono' : '', text: it.title }), it.sub ? h('span', { class: 't2 sub', text: ` ${it.sub}` }) : null),
      h('span', { class: 'k', text: it.k === 'calc' ? t('search.go') : t(`search.k.${it.k}`) }))));
  }
  function mark() {
    [...results.children].forEach((b, i) => b.setAttribute && b.setAttribute('aria-selected', String(i === sel)));
    results.children[sel]?.scrollIntoView?.({ block: 'nearest' });
  }
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(shown[sel]); }
  });
  draw();
  index().then((list) => { items = list; draw(); });
  setTimeout(() => input.focus(), 60);
}
