// Arcade: a hub of 20 short games and a small engine they share — canvas
// sizing, a pausable loop, keyboard/swipe input, on-screen pads, sound,
// start/game-over overlays and saved best scores.

import { play } from '../sfx.js';
import { GAME_ID } from '../identity.js';
import { h, icon, clear, button, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { bus, app } from '../bus.js';
import { store } from '../store.js';
import { cssVar } from '../scheduler.js';
import { reducedMotion } from '../prefs.js';

export const GAMES = [
  { id: 'mathquiz', cat: 'brain', mod: 'brain', icon: 'timer', levels: true, topics: true },
  { id: 'calcchain', cat: 'brain', mod: 'brain', icon: 'link', levels: true },
  { id: 'numrush', cat: 'brain', mod: 'brain', icon: 'target', levels: true },
  { id: 'sudoku', cat: 'brain', mod: 'brain', icon: 'grid', levels: true },
  { id: 'wordle', cat: 'brain', mod: 'brain', icon: 'type' },
  { id: 'memory', cat: 'brain', mod: 'brain', icon: 'layers', levels: true },
  { id: 'snake', cat: 'classic', mod: 'classic', icon: 'move' },
  { id: 'g2048', cat: 'classic', mod: 'classic', icon: 'hash' },
  { id: 'tetris', cat: 'classic', mod: 'classic', icon: 'box' },
  { id: 'breakout', cat: 'classic', mod: 'classic', icon: 'bars' },
  { id: 'pong', cat: 'classic', mod: 'classic', icon: 'circle' },
  { id: 'asteroids', cat: 'classic', mod: 'classic', icon: 'orbit' },
  { id: 'flappy', cat: 'action', mod: 'action', icon: 'up' },
  { id: 'bubble', cat: 'action', mod: 'action', icon: 'circle' },
  { id: 'whack', cat: 'action', mod: 'action', icon: 'target' },
  { id: 'dodge', cat: 'action', mod: 'action', icon: 'shield' },
  { id: 'gravdraw', cat: 'action', mod: 'action', icon: 'orbit' },
  { id: 'typing', cat: 'skill', mod: 'skill', icon: 'keyboard' },
  { id: 'colormatch', cat: 'skill', mod: 'skill', icon: 'eye' },
  { id: 'reaction', cat: 'skill', mod: 'skill', icon: 'timer', lowBest: true },
];
const MODS = { brain: () => import('./brain.js'), classic: () => import('./classic.js'), action: () => import('./action.js'), skill: () => import('./skill.js') };
const CATS = ['brain', 'classic', 'action', 'skill'];

const scores = () => { const s = store.get('scores', {}); return s && typeof s === 'object' ? s : {}; };
const bestOf = (id) => scores()[id];
function saveBest(def, v) {
  const s = scores(), old = s[def.id];
  const better = old === undefined || (def.lowBest ? v < old : v > old);
  if (better) { s[def.id] = v; store.set('scores', s); }
  return better && old !== undefined;
}
const fmtBest = (def, v) => (v === undefined ? t('arcade.noBest') : t('arcade.best', { n: def.lowBest ? `${v} ms` : v }));

let sec, hub, host, current = null;
const mounted = new Map();

export async function mount(el, r) {
  sec = el;
  hub = h('div', { class: 'screen arcade-hub' });
  host = h('div', { class: 'game-host', hidden: true });
  sec.append(hub, host);
  renderHub();
  await show(r);
}

function renderHub() {
  clear(hub);
  hub.append(h('div', { class: 'screen-head' }, h('h1', { text: t('arcade.title') }), h('p', { text: t('arcade.subtitle') })));
  for (const c of CATS) {
    hub.append(h('h2', { class: 'section-title', text: t(`arcade.g.${c}`) }),
      h('div', { class: 'arcade-grid' }, GAMES.filter((g) => g.cat === c).map((g, i) => h('a', { class: 'game-card', href: `#/arcade/${g.id}`, style: { '--c': GAME_ID[g.id]?.[1] || '', '--i': String(i) } },
        h('span', { class: 'gc-ic' }, icon(GAME_ID[g.id]?.[0] || g.icon)), h('h3', { text: t(`game.${g.id}`) }), h('p', { class: 't2', text: t(`game.${g.id}.d`) }),
        h('span', { class: 'best', text: fmtBest(g, bestOf(g.id)) })))));
  }
}

export async function show(r) {
  const id = r && r.sub && r.sub[0];
  if (current && current.def.id !== id) { current.pause(true); current = null; }
  if (!id) { host.hidden = true; hub.hidden = false; sec.removeAttribute('data-game'); renderHub(); document.title = t('title.arcade'); return; }
  const def = GAMES.find((g) => g.id === id);
  if (!def) { location.replace('#/arcade'); return; }
  hub.hidden = true; host.hidden = false; sec.dataset.game = '';
  document.title = `${t(`game.${id}`)} · ${t('arcade.title')}`;
  let inst = mounted.get(id);
  if (!inst) { inst = await buildGame(def); mounted.set(id, inst); }
  clear(host).append(inst.root);
  current = inst;
  inst.enter();
  bus.emit('game:played', id);
}
export function hide() { if (current) current.pause(true); }

// ---------- per-game shell ----------
async function buildGame(def) {
  const mod = await MODS[def.mod]();
  const factory = mod.GAMES[def.id];
  const scoreEl = h('span', { class: 'score mono', 'aria-live': 'off' });
  const bestEl = h('span', { class: 'best mono' });
  const stage = h('div', { class: 'game-stage' });
  const below = h('div', { class: 'game-below' });
  const overlay = h('div', { class: 'game-overlay' });
  let paused = false, running = false, raf = 0, last = 0, loopFn = null, level = store.get(`lvl:${def.id}`, 'medium'), topic = store.get(`topic:${def.id}`, 'mixed');
  let sound = store.get('arcadeSound', true);
  const pauseBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('arcade.pause'), title: t('arcade.pause'), on: { click: () => (paused ? resume() : pause()) } }, icon('pause'));
  const soundBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-pressed': String(sound), 'aria-label': t('arcade.sound'), title: t('arcade.sound'), on: { click: () => { sound = !sound; store.set('arcadeSound', sound); soundBtn.setAttribute('aria-pressed', String(sound)); } } }, icon('sound'));
  const root = h('div', { class: 'game', style: { '--c': GAME_ID[def.id]?.[1] || '' }, data: { game: def.id } },
    h('div', { class: 'game-bar' },
      h('a', { class: 'icon-btn', href: '#/arcade', 'aria-label': t('common.back'), title: t('common.back') }, icon('left')),
      h('h1', { text: t(`game.${def.id}`) }), scoreEl, bestEl, soundBtn, pauseBtn,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('arcade.restart'), title: t('arcade.restart'), on: { click: () => startGame() } }, icon('refresh'))),
    h('div', { class: 'game-wrap' }, stage, overlay), below);

  // shared helpers given to each game
  const keyHandlers = new Set();
  const ctx = {
    stage, below, t, def,
    get level() { return level; }, get topic() { return topic; },
    reduced: reducedMotion(),
    color: (name) => cssVar(name),
    score(n) { scoreEl.textContent = t('arcade.score', { n }); },
    text(s) { scoreEl.textContent = s; },
    canvas() {
      const c = h('canvas');
      stage.append(c);
      const api = { c, g: c.getContext('2d'), w: 0, h: 0 };
      const fit = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1), r = stage.getBoundingClientRect();
        api.w = Math.max(10, r.width); api.h = Math.max(10, r.height);
        c.width = Math.round(api.w * dpr); c.height = Math.round(api.h * dpr);
        api.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      fit();
      new ResizeObserver(() => { fit(); api.onResize && api.onResize(); }).observe(stage);
      return api;
    },
    loop(fn) { loopFn = fn; last = 0; if (!raf) raf = requestAnimationFrame(tick); },
    stopLoop() { loopFn = null; if (raf) cancelAnimationFrame(raf); raf = 0; },
    onKey(fn) { keyHandlers.add(fn); },
    swipe(el, fn) {
      let p = null;
      el.addEventListener('pointerdown', (e) => { p = [e.clientX, e.clientY]; });
      el.addEventListener('pointerup', (e) => {
        if (!p) return;
        const dx = e.clientX - p[0], dy = e.clientY - p[1]; p = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      });
    },
    pad(buttons) {
      clear(below);
      const pad = h('div', { class: 'game-pad' });
      for (const [label, fn, opt = {}] of buttons) {
        const b = h('button', { type: 'button', 'aria-label': opt.aria || label, class: opt.wide ? 'wide' : '' }, opt.icon ? icon(opt.icon) : label);
        let iv = null;
        const go = (e) => { e.preventDefault(); fn(); if (opt.repeat) iv = setInterval(fn, 90); };
        const end = () => { clearInterval(iv); iv = null; };
        b.addEventListener('pointerdown', go); b.addEventListener('pointerup', end); b.addEventListener('pointerleave', end); b.addEventListener('pointercancel', end);
        pad.append(b);
      }
      below.append(pad);
      return pad;
    },
    beep(kind = 'tap') {
      if (!sound || app.settings.sfx === false) return;
      play({ tap: 'key', good: 'eq', bad: 'error', win: 'achieve', over: 'error', pop: 'tick' }[kind] || 'tap', { force: true });
    },
    over({ score = 0, win = false, extra = '', mistakes = null } = {}) {
      running = false;
      ctx.stopLoop();
      const isNew = saveBest(def, score);
      bestEl.textContent = fmtBest(def, bestOf(def.id));
      if (win) bus.emit('game:won', { game: def.id, level });
      bus.emit('result', { kind: 'tool', input: `${t('arcade.title')}: ${t(`game.${def.id}`)}`, decimal: def.lowBest ? `${score} ms` : String(score), ref: { tool: null } });
      ctx.beep(win ? 'win' : 'over');
      showOverlay('over', { score, win, isNew, extra, mistakes });
    },
  };
  const game = factory(ctx);

  function tick(ts) {
    raf = 0;
    if (!loopFn || paused) return;
    const dt = Math.min(50, last ? ts - last : 16);
    last = ts;
    loopFn(dt / 1000, ts);
    if (loopFn) raf = requestAnimationFrame(tick);
  }
  function pause(silent) {
    if (!running || paused) return;
    paused = true;
    pauseBtn.replaceChildren(icon('play'));
    game.pause && game.pause();
    if (!silent || running) showOverlay('paused');
  }
  function resume() {
    if (!paused) return;
    paused = false;
    pauseBtn.replaceChildren(icon('pause'));
    overlay.hidden = true;
    game.resume && game.resume();
    last = 0;
    if (loopFn && !raf) raf = requestAnimationFrame(tick);
  }
  function startGame() {
    ctx.stopLoop();
    paused = false; running = true;
    pauseBtn.replaceChildren(icon('pause'));
    overlay.hidden = true;
    ctx.score(0);
    game.start();
    stage.focus({ preventScroll: true });
  }
  function showOverlay(kind, r = {}) {
    clear(overlay);
    overlay.hidden = false;
    const box = h('div', { class: 'box' });
    if (kind === 'start') {
      box.append(h('span', { class: 'ov-ic' }, icon(GAME_ID[def.id]?.[0] || def.icon)), h('h2', { text: t(`game.${def.id}`) }), h('p', { text: t(`game.${def.id}.d`) }),
        h('p', { class: 't2 how', text: t(`game.${def.id}.how`) }));
      if (def.levels) box.append(seg([['easy', t('arcade.easy')], ['medium', t('arcade.medium')], ['hard', t('arcade.hard')]], level, (v) => { level = v; store.set(`lvl:${def.id}`, v); }, t('arcade.level')));
      if (def.topics) {
        const sel = h('select', { class: 'input', 'aria-label': t('arcade.topic'), on: { change: () => { topic = sel.value; store.set(`topic:${def.id}`, topic); } } },
          ['mixed', 'tables', 'negatives', 'fractions', 'percent', 'squares'].map((k) => h('option', { value: k, text: t(`arcade.topic.${k}`) })));
        sel.value = topic;
        box.append(sel);
      }
      box.append(button(t('arcade.play'), startGame, { cls: 'btn primary lg', iconName: 'play' }), h('p', { class: 'tiny muted', text: fmtBest(def, bestOf(def.id)) }));
    } else if (kind === 'paused') {
      box.append(h('h2', { text: t('arcade.paused') }), button(t('arcade.resume'), resume, { cls: 'btn primary lg', iconName: 'play' }), button(t('arcade.restart'), startGame, { iconName: 'refresh' }));
    } else {
      box.append(h('h2', { text: r.win ? t('arcade.win') : t('arcade.over') }),
        h('p', { class: 'ov-score mono', text: def.lowBest ? `${r.score} ms` : t('arcade.finalScore', { n: r.score }) }),
        r.extra ? h('p', { class: 't2', text: r.extra }) : null,
        r.isNew ? h('p', { class: 'ov-new', text: t('arcade.newBest') }) : null);
      if (r.mistakes) {
        box.append(h('div', { class: 'ov-mistakes' }, h('b', { text: t('arcade.mistakes') }),
          r.mistakes.length ? h('ul', {}, r.mistakes.slice(0, 8).map((m) => h('li', { class: 'mono', text: m }))) : h('p', { class: 't2', text: t('arcade.noMistakes') })));
      }
      box.append(h('div', { class: 'btn-row' }, button(t('arcade.restart'), startGame, { cls: 'btn primary lg', iconName: 'refresh' }), h('a', { class: 'btn', href: '#/arcade' }, t('arcade.title'))));
    }
    overlay.append(box);
    setTimeout(() => box.querySelector('.btn.primary')?.focus({ preventScroll: true }), 40);
  }
  const onKeyDown = (e) => {
    if (!root.isConnected || app.route?.screen !== 'arcade') return;
    if (e.target.closest && e.target.closest('input, textarea, select') && !e.target.closest('[data-game-input]')) return;
    if (e.key === 'p' || e.key === 'P') { if (running) { paused ? resume() : pause(); e.preventDefault(); } return; }
    if (e.key === ' ' && !running && !overlay.hidden && overlay.querySelector('.btn.primary')) { e.preventDefault(); overlay.querySelector('.btn.primary').click(); return; }
    if (!running || paused) return;
    for (const fn of keyHandlers) if (fn(e) === true) { e.preventDefault(); break; }
  };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  stage.tabIndex = 0;

  return {
    def, root,
    enter() { bestEl.textContent = fmtBest(def, bestOf(def.id)); if (!running) { ctx.score(0); game.preview && game.preview(); showOverlay('start'); } },
    pause,
  };
}

// small shared helpers for the game files
export const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
