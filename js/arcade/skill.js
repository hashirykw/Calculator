// Skill games: Speed Typing, Colour Match, Reaction Time.

import { h, clear, button } from '../ui.js';
import { pick, shuffle } from './index.js';

const TYPE_WORDS = ['angle', 'radius', 'integer', 'fraction', 'decimal', 'median', 'gradient', 'tangent', 'vector', 'matrix', 'algebra', 'formula', 'prime', 'factor', 'square', 'cosine', 'sine', 'equation', 'quadratic', 'parallel', 'diameter', 'perimeter', 'volume', 'probability', 'percentage', 'ratio', 'average', 'infinity', 'derivative', 'integral', 'polygon', 'triangle', 'circle', 'symmetry', 'exponent', 'logarithm', 'function', 'graph', 'axis', 'origin', 'sequence', 'series', 'limit', 'theorem', 'hypotenuse', 'cylinder', 'sphere', 'calculus', 'statistics', 'variable'];

function typing(ctx) {
  const word = h('div', { class: 'g-big mono' }), input = h('input', { class: 'input g-answer mono', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': ctx.t('game.typeWord'), 'data-game-input': '' });
  const info = h('div', { class: 't2 g-sub' }), bar = h('div', { class: 'g-timer' }, h('i'));
  ctx.stage.append(h('div', { class: 'g-center' }, bar, word, input, info));
  let cur, left, typed, chars, list;
  const next = () => { cur = list.pop() || pick(TYPE_WORDS); word.textContent = cur; input.value = ''; };
  input.addEventListener('input', () => {
    const v = input.value.trim().toLowerCase();
    word.classList.toggle('bad', !cur.startsWith(v));
    if (v === cur) { typed++; chars += cur.length + 1; ctx.score(typed); ctx.beep('good'); next(); }
  });
  return {
    start() {
      left = 60; typed = 0; chars = 0; list = shuffle(TYPE_WORDS); next(); input.focus(); clear(ctx.below);
      ctx.loop((dt) => {
        left -= dt; bar.firstChild.style.transform = `scaleX(${Math.max(0, left / 60)})`;
        const wpm = Math.round(chars / 5 / Math.max(1 / 60, (60 - left) / 60));
        info.textContent = ctx.t('game.wpm', { n: wpm });
        if (left <= 0) ctx.over({ score: Math.round(chars / 5), extra: ctx.t('game.wpm', { n: Math.round(chars / 5) }) });
      });
    },
    resume() { input.focus(); },
  };
}

const COLS = [['RED', '#F0566A'], ['BLUE', '#3B82F6'], ['GREEN', '#2FBF7A'], ['YELLOW', '#FACC15'], ['PURPLE', '#A78BFA'], ['ORANGE', '#FB923C']];
function colormatch(ctx) {
  const word = h('div', { class: 'g-big cm-word' }), info = h('div', { class: 't2 g-sub' }), bar = h('div', { class: 'g-timer' }, h('i'));
  const yes = button(ctx.t('game.match'), () => answer(true), { cls: 'btn primary lg' }), no = button(ctx.t('game.noMatch'), () => answer(false), { cls: 'btn lg' });
  ctx.stage.append(h('div', { class: 'g-center' }, bar, word, h('div', { class: 'btn-row center' }, yes, no), info));
  let match, score, left, streak;
  function next() {
    const w = pick(COLS);
    match = Math.random() < 0.45;
    const ink = match ? w : pick(COLS.filter((c) => c !== w));
    word.textContent = w[0]; word.style.color = ink[1];
  }
  function answer(said) {
    if (said === match) { streak++; score += 1 + Math.floor(streak / 5); ctx.beep('good'); } else { streak = 0; left -= 2; ctx.beep('bad'); }
    ctx.score(score); next();
  }
  ctx.onKey((e) => { if (e.key === 'ArrowLeft' || e.key === 'y') { answer(true); return true; } if (e.key === 'ArrowRight' || e.key === 'n') { answer(false); return true; } return false; });
  return {
    start() {
      score = 0; left = 30; streak = 0; next(); clear(ctx.below);
      ctx.loop((dt) => { left -= dt; bar.firstChild.style.transform = `scaleX(${Math.max(0, left / 30)})`; info.textContent = `${Math.ceil(left)}s · ← match · → no match`; if (left <= 0) ctx.over({ score }); });
    },
  };
}

function reaction(ctx) {
  const pad = h('button', { type: 'button', class: 'rt-pad' }, h('span'));
  ctx.stage.append(pad);
  let state, t0, timer, times, round;
  const ROUNDS = 5;
  const label = (s) => { pad.firstChild.textContent = s; };
  function arm() {
    state = 'wait'; pad.dataset.s = 'wait'; label(ctx.t('game.waitGreen'));
    timer = setTimeout(() => { state = 'go'; pad.dataset.s = 'go'; label(ctx.t('game.tapNow')); t0 = performance.now(); }, 1200 + Math.random() * 2500);
  }
  function tap() {
    if (state === 'wait') { clearTimeout(timer); ctx.beep('bad'); pad.dataset.s = 'early'; label(ctx.t('game.tooEarly')); state = 'early'; setTimeout(arm, 900); return; }
    if (state !== 'go') return;
    const ms = Math.round(performance.now() - t0);
    times.push(ms); round++; ctx.beep('good');
    ctx.text(`${ctx.t('game.round', { n: Math.min(round + 1, ROUNDS), m: ROUNDS })} · ${ctx.t('game.ms', { n: ms })}`);
    pad.dataset.s = 'done'; label(ctx.t('game.ms', { n: ms })); state = 'done';
    if (round >= ROUNDS) { const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length); setTimeout(() => ctx.over({ score: avg, extra: times.map((x) => `${x} ms`).join(' · ') }), 600); }
    else setTimeout(arm, 800);
  }
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });
  ctx.onKey((e) => { if (e.key === ' ' || e.key === 'Enter') { tap(); return true; } return false; });
  return { start() { times = []; round = 0; clear(ctx.below); ctx.text(ctx.t('game.round', { n: 1, m: ROUNDS })); arm(); }, pause() { clearTimeout(timer); }, resume() { arm(); } };
}

export const GAMES = { typing, colormatch, reaction };
