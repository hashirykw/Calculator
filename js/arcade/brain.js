// Brain games: Math Blitz, Calc Chain, Number Rush, Sudoku, Math Wordle,
// Memory Match. DOM-based so they stay sharp and accessible.

import { h, clear, icon } from '../ui.js';
import { rnd, pick, shuffle } from './index.js';
import { store } from '../store.js';

const LV = { easy: 0, medium: 1, hard: 2 };
const timerBar = () => { const bar = h('div', { class: 'g-timer' }, h('i')); return { el: bar, set: (f) => { bar.firstChild.style.transform = `scaleX(${Math.max(0, f)})`; } }; };
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

// ---------- question bank for Blitz ----------
function question(topic, lvl) {
  const L = LV[lvl] ?? 1;
  const k = topic === 'mixed' ? pick(['tables', 'add', 'sub', 'negatives', 'percent', 'squares', 'fractions']) : topic;
  if (k === 'tables') { const a = rnd(2, [10, 12, 15][L]), b = rnd(2, [10, 12, 19][L]); return { q: `${a} × ${b}`, a: a * b }; }
  if (k === 'add') { const a = rnd(5, [50, 200, 999][L]), b = rnd(5, [50, 200, 999][L]); return { q: `${a} + ${b}`, a: a + b }; }
  if (k === 'sub') { const a = rnd(20, [99, 500, 999][L]), b = rnd(1, a); return { q: `${a} − ${b}`, a: a - b }; }
  if (k === 'negatives') { const a = rnd(-[10, 20, 50][L], [10, 20, 50][L]), b = rnd(-[10, 20, 50][L], [10, 20, 50][L]); const op = pick(['+', '−', '×']); return { q: `${a < 0 ? `(${a})` : a} ${op} ${b < 0 ? `(${b})` : b}`, a: op === '+' ? a + b : op === '−' ? a - b : a * b }; }
  if (k === 'percent') { const p = pick([[10, 20, 50, 25], [5, 10, 15, 20, 25, 50, 75], [12, 15, 35, 45, 65, 85]][L]), n = rnd(1, [10, 20, 40][L]) * 20; return { q: `${p}% of ${n}`, a: (p * n) / 100 }; }
  if (k === 'squares') { if (Math.random() < 0.5) { const a = rnd(2, [12, 20, 30][L]); return { q: `${a}²`, a: a * a }; } const a = rnd(2, [12, 20, 30][L]); return { q: `√${a * a}`, a }; }
  // fractions: simplify-to-integer or sum of halves/quarters
  const d = pick([2, 4, 5, 10]), n1 = rnd(1, d * [2, 4, 8][L]);
  return { q: `${n1 * d}/${d}`, a: n1 };
}

function blitz(ctx) {
  const prompt = h('div', { class: 'g-big mono' }), input = h('input', { class: 'input g-answer mono', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Answer', 'data-game-input': '' });
  const tb = timerBar(), streakEl = h('div', { class: 'g-streak' });
  const wrap = h('div', { class: 'g-center' }, tb.el, prompt, input, streakEl);
  ctx.stage.append(wrap);
  let cur, score, left, streak, mistakes;
  const next = () => { cur = question(ctx.topic, ctx.level); prompt.textContent = `${cur.q} = ?`; input.value = ''; };
  input.addEventListener('input', () => {
    const v = Number(input.value.replace('−', '-'));
    if (input.value.trim() !== '' && Math.abs(v - cur.a) < 1e-9) {
      streak++; score += streak >= 5 ? 2 : 1; ctx.score(score); ctx.beep('good');
      wrap.classList.remove('flash-ok'); void wrap.offsetWidth; wrap.classList.add('flash-ok');
      streakEl.textContent = streak >= 3 ? `🔥 × ${streak}` : '';
      left = Math.min(60, left + 0.8);
      next();
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      mistakes.push(`${cur.q} = ${cur.a} (you: ${input.value})`); streak = 0; streakEl.textContent = ''; ctx.beep('bad');
      wrap.classList.remove('flash-bad'); void wrap.offsetWidth; wrap.classList.add('flash-bad'); left -= 2; next();
    }
  });
  return {
    start() { score = 0; streak = 0; left = 60; mistakes = []; streakEl.textContent = ''; next(); input.focus();
      ctx.loop((dt) => { left -= dt; tb.set(left / 60); if (left <= 0) ctx.over({ score, mistakes }); }); },
    resume() { input.focus(); },
  };
}

function chain(ctx) {
  const show = h('div', { class: 'g-big mono' }), sub = h('div', { class: 't2 g-sub' }), input = h('input', { class: 'input g-answer mono', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Answer', 'data-game-input': '', hidden: true });
  const go = h('button', { class: 'btn primary', type: 'button', hidden: true }, ctx.t('common.ok'));
  ctx.stage.append(h('div', { class: 'g-center' }, sub, show, input, go));
  let round, score, value, timer, steps, mistakes;
  const ROUNDS = 6;
  function newRound() {
    round++;
    if (round > ROUNDS) { ctx.over({ score, mistakes }); return; }
    const L = LV[ctx.level] ?? 1, len = 3 + L + Math.min(2, Math.floor(round / 2));
    value = rnd(2, 9 + L * 6); steps = [`${value}`];
    for (let i = 0; i < len; i++) {
      const op = pick(['+', '−', '×', '÷']);
      if (op === '+') { const n = rnd(1, 9 + L * 10); value += n; steps.push(`+ ${n}`); }
      else if (op === '−') { const n = rnd(1, Math.max(1, Math.min(value - 1, 9 + L * 10))); value -= n; steps.push(`− ${n}`); }
      else if (op === '×') { const n = rnd(2, 3 + L * 2); value *= n; steps.push(`× ${n}`); }
      else { const divs = [2, 3, 4, 5, 6, 7, 8, 9].filter((d) => value % d === 0); if (divs.length) { const d = pick(divs); value /= d; steps.push(`÷ ${d}`); } else { value += 3; steps.push('+ 3'); } }
    }
    input.hidden = true; go.hidden = true; sub.textContent = ctx.t('game.round', { n: round, m: ROUNDS });
    let i = 0;
    const speed = [1300, 1000, 750][LV[ctx.level] ?? 1];
    const flash = () => {
      if (i < steps.length) { show.textContent = steps[i++]; show.classList.remove('pop'); void show.offsetWidth; show.classList.add('pop'); ctx.beep('tap'); timer = setTimeout(flash, speed); }
      else { show.textContent = '= ?'; sub.textContent = ctx.t('game.chainHint'); input.hidden = false; go.hidden = false; input.value = ''; input.focus(); }
    };
    flash();
  }
  const submit = () => {
    if (input.hidden) return;
    const ok = Number(input.value) === value;
    if (ok) { score += 10 * ((LV[ctx.level] ?? 1) + 1); ctx.beep('good'); } else { ctx.beep('bad'); mistakes.push(`${steps.join(' ')} = ${value}`); }
    ctx.score(score);
    show.textContent = ok ? '✓' : `${value}`;
    input.hidden = true; go.hidden = true;
    timer = setTimeout(newRound, 900);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  go.addEventListener('click', submit);
  return { start() { clearTimeout(timer); round = 0; score = 0; mistakes = []; newRound(); }, pause() { clearTimeout(timer); }, resume() { if (input.hidden) newRound(); } };
}

function numrush(ctx) {
  const target = h('div', { class: 'g-big mono' }), grid = h('div', { class: 'g-grid nr' }), tb = timerBar(), sumEl = h('div', { class: 't2' });
  ctx.stage.append(h('div', { class: 'g-center' }, tb.el, target, sumEl, grid));
  let goal, picked, score, left, nums;
  function deal() {
    const L = LV[ctx.level] ?? 1, max = [9, 15, 25][L];
    nums = Array.from({ length: 12 }, () => rnd(1, max));
    const k = rnd(2, 2 + L);
    goal = shuffle([...nums.keys()]).slice(0, k).reduce((s, i) => s + nums[i], 0);
    picked = new Set();
    target.textContent = ctx.t('game.target', { n: goal });
    draw();
  }
  function draw() {
    clear(grid);
    const sum = [...picked].reduce((s, i) => s + nums[i], 0);
    sumEl.textContent = `${sum} / ${goal}`;
    nums.forEach((n, i) => grid.append(h('button', { type: 'button', class: `g-tile${picked.has(i) ? ' on' : ''}`, on: { click: () => {
      if (picked.has(i)) picked.delete(i); else picked.add(i);
      const s = [...picked].reduce((a, j) => a + nums[j], 0);
      if (s === goal) { score += picked.size * 5; ctx.score(score); ctx.beep('good'); left = Math.min(60, left + 3); deal(); return; }
      if (s > goal) { ctx.beep('bad'); picked.clear(); }
      else ctx.beep('tap');
      draw();
    } } }, String(n))));
  }
  return { start() { score = 0; left = 60; deal(); ctx.loop((dt) => { left -= dt; tb.set(left / 60); if (left <= 0) ctx.over({ score }); }); } };
}

// ---------- Sudoku ----------
function solveGrid(g) {
  const i = g.indexOf(0);
  if (i < 0) return true;
  const r = Math.floor(i / 9), c = i % 9;
  for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (okAt(g, r, c, v)) { g[i] = v; if (solveGrid(g)) return true; g[i] = 0; }
  }
  return false;
}
function okAt(g, r, c, v) {
  for (let k = 0; k < 9; k++) if (g[r * 9 + k] === v || g[k * 9 + c] === v) return false;
  const br = r - (r % 3), bc = c - (c % 3);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (g[(br + a) * 9 + bc + b] === v) return false;
  return true;
}
function countSolutions(g, limit = 2) {
  const i = g.indexOf(0);
  if (i < 0) return 1;
  const r = Math.floor(i / 9), c = i % 9;
  let n = 0;
  for (let v = 1; v <= 9 && n < limit; v++) if (okAt(g, r, c, v)) { g[i] = v; n += countSolutions(g, limit - n); g[i] = 0; }
  return n;
}
function makePuzzle(level) {
  const sol = Array(81).fill(0); solveGrid(sol);
  const puz = sol.slice(), holes = { easy: 38, medium: 47, hard: 54 }[level] || 45;
  let removed = 0;
  for (const i of shuffle([...Array(81).keys()])) {
    if (removed >= holes) break;
    const keep = puz[i]; puz[i] = 0;
    if (countSolutions(puz.slice()) !== 1) puz[i] = keep; else removed++;
  }
  return { sol, puz };
}
function sudoku(ctx) {
  const board = h('div', { class: 'sdk', role: 'grid' }), info = h('div', { class: 't2 g-sub' });
  const pad = h('div', { class: 'sdk-pad' });
  ctx.stage.append(h('div', { class: 'g-center sdk-wrap' }, info, board, pad));
  let st = null, sel = -1, notes = false, secs = 0, resumeNext = false;
  const save = () => store.set('sudoku', st);
  function render() {
    clear(board);
    const v = sel >= 0 ? st.cur[sel] : 0;
    st.cur.forEach((n, i) => {
      const r = Math.floor(i / 9), c = i % 9;
      const same = sel >= 0 && (Math.floor(sel / 9) === r || sel % 9 === c || (Math.floor(sel / 27) === Math.floor(i / 27) && Math.floor((sel % 9) / 3) === Math.floor(c / 3)));
      const cell = h('button', { type: 'button', role: 'gridcell', class: `sdk-c${st.puz[i] ? ' given' : ''}${i === sel ? ' sel' : ''}${same ? ' rel' : ''}${n && v && n === v ? ' same' : ''}${n && n !== st.sol[i] ? ' bad' : ''}${c % 3 === 2 && c < 8 ? ' br' : ''}${r % 3 === 2 && r < 8 ? ' bb' : ''}`,
        'aria-label': `Row ${r + 1} column ${c + 1}${n ? ` ${n}` : ''}`, on: { click: () => { sel = i; render(); } } });
      if (n) cell.textContent = n;
      else if (st.notes[i] && st.notes[i].length) cell.append(h('span', { class: 'sdk-notes' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => h('i', { text: st.notes[i].includes(k) ? k : '' }))));
      board.append(cell);
    });
    info.textContent = `${ctx.t(`arcade.${ctx.level}`)} · ${ctx.t('game.mistakes', { n: st.mistakes })} · ${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  }
  function put(n) {
    if (sel < 0 || st.puz[sel]) return;
    if (notes && n) { const a = st.notes[sel] || []; st.notes[sel] = a.includes(n) ? a.filter((x) => x !== n) : [...a, n]; render(); save(); return; }
    st.cur[sel] = n;
    st.notes[sel] = [];
    if (n && n !== st.sol[sel]) { st.mistakes++; ctx.beep('bad'); } else if (n) ctx.beep('tap');
    save(); render();
    if (st.cur.every((x, i) => x === st.sol[i])) {
      const score = Math.max(10, Math.round(({ easy: 300, medium: 600, hard: 1000 }[ctx.level] || 500) - secs / 2 - st.mistakes * 25));
      store.remove('sudoku');
      ctx.over({ score, win: true, extra: `${Math.floor(secs / 60)} min ${Math.floor(secs % 60)} s` });
    }
  }
  clear(pad);
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((n) => pad.append(h('button', { type: 'button', on: { click: () => put(n) } }, String(n))));
  const notesBtn = h('button', { type: 'button', class: 'wide', 'aria-pressed': 'false', on: { click: () => { notes = !notes; notesBtn.setAttribute('aria-pressed', String(notes)); } } }, icon('pencil', 'sm'), ctx.t('game.notes'));
  pad.append(h('button', { type: 'button', on: { click: () => put(0) }, 'aria-label': ctx.t('common.clear') }, icon('backspace', 'sm')), notesBtn);
  ctx.onKey((e) => {
    if (/^[1-9]$/.test(e.key)) { put(Number(e.key)); return true; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { put(0); return true; }
    const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (mv) { sel = sel < 0 ? 0 : Math.max(0, Math.min(80, sel + mv)); render(); return true; }
    if (e.key === 'n') { notesBtn.click(); return true; }
    return false;
  });
  return {
    preview() {
      const saved = store.get('sudoku');
      if (saved && saved.cur && !st) { st = saved; secs = saved.secs || 0; resumeNext = true; render(); }
    },
    start() {
      if (resumeNext && st && st.level === ctx.level) { resumeNext = false; }
      else {
        resumeNext = false; const p = makePuzzle(ctx.level); st = { ...p, cur: p.puz.slice(), notes: Array(81).fill(null).map(() => []), mistakes: 0, level: ctx.level, secs: 0 }; secs = 0; save(); }
      sel = st.cur.findIndex((x) => !x);
      render();
      ctx.loop((dt) => { secs += dt; st.secs = secs; if (Math.floor(secs) !== Math.floor(secs - dt)) { render(); if (Math.floor(secs) % 5 === 0) save(); } });
    },
  };
}

// ---------- Math Wordle ----------
const WORDS = ['ANGLE', 'ARRAY', 'AXIOM', 'CHORD', 'CURVE', 'DIGIT', 'EQUAL', 'GRAPH', 'INDEX', 'LIMIT', 'LOGIC', 'MINUS', 'POINT', 'POWER', 'PRIME', 'PROOF', 'RANGE', 'RATIO', 'SLOPE', 'SOLID', 'TABLE', 'TIMES', 'TOTAL', 'UNITS', 'VALUE', 'ROOTS', 'SCALE', 'SHAPE', 'SPACE', 'PLANE', 'PRISM', 'RADII', 'SIGMA', 'THETA', 'OMEGA', 'DELTA', 'ALPHA', 'GAMMA', 'MATHS', 'EIGHT', 'SEVEN', 'THREE', 'FIFTY', 'FORTY', 'SIXTY', 'TENTH', 'MODAL', 'MEANS', 'ORDER', 'PLOTS', 'CHART', 'BASES', 'TERMS', 'FOCUS', 'ROUND', 'FIELD', 'CUBIC', 'CONIC', 'HELIX', 'LOCUS', 'CONES', 'GRIDS', 'DECAY', 'GROWS', 'NODES', 'EDGES', 'SPLIT', 'SHARE', 'COUNT'];
function wordle(ctx) {
  const grid = h('div', { class: 'wd-grid' }), keys = h('div', { class: 'game-keys' }), msg = h('div', { class: 't2 g-sub', 'aria-live': 'polite' });
  ctx.stage.append(h('div', { class: 'g-center' }, msg, grid));
  let answer, rows, cur, done, keyState;
  const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  function drawKeys() {
    clear(keys);
    ROWS.forEach((r, ri) => {
      const row = h('div', { class: 'wd-krow' });
      if (ri === 2) row.append(h('button', { type: 'button', class: 'wide', on: { click: () => enter() } }, 'ENTER'));
      for (const ch of r) row.append(h('button', { type: 'button', class: keyState[ch] || '', on: { click: () => typeCh(ch) } }, ch));
      if (ri === 2) row.append(h('button', { type: 'button', class: 'wide', 'aria-label': 'Delete', on: { click: () => back() } }, '⌫'));
      keys.append(row);
    });
  }
  function draw() {
    clear(grid);
    for (let r = 0; r < 6; r++) {
      const row = h('div', { class: 'wd-row' });
      const word = rows[r] ? rows[r].w : r === rows.length ? cur : '';
      for (let i = 0; i < 5; i++) row.append(h('span', { class: `wd-c ${rows[r] ? rows[r].s[i] : ''}${word[i] ? ' filled' : ''}`, text: word[i] || '' }));
      grid.append(row);
    }
  }
  const typeCh = (ch) => { if (done || cur.length >= 5) return; cur += ch; ctx.beep('tap'); draw(); };
  const back = () => { if (done) return; cur = cur.slice(0, -1); draw(); };
  function enter() {
    if (done) return;
    if (cur.length < 5) { msg.textContent = ''; grid.children[rows.length]?.classList.add('shake'); setTimeout(() => grid.children[rows.length]?.classList.remove('shake'), 400); return; }
    const s = Array(5).fill('miss'), rem = {};
    for (let i = 0; i < 5; i++) { if (cur[i] === answer[i]) s[i] = 'hit'; else rem[answer[i]] = (rem[answer[i]] || 0) + 1; }
    for (let i = 0; i < 5; i++) if (s[i] !== 'hit' && rem[cur[i]]) { s[i] = 'near'; rem[cur[i]]--; }
    for (let i = 0; i < 5; i++) { const k = cur[i], rank = { hit: 3, near: 2, miss: 1 }; if (!keyState[k] || rank[s[i]] > rank[keyState[k]]) keyState[k] = s[i]; }
    rows.push({ w: cur, s });
    const won = cur === answer;
    cur = '';
    draw(); drawKeys();
    if (won) { done = true; ctx.over({ score: (7 - rows.length) * 100, win: true, extra: rows.map((r) => r.s.map((x) => ({ hit: '🟩', near: '🟨', miss: '⬛' })[x]).join('')).join('\n') }); }
    else if (rows.length >= 6) { done = true; ctx.over({ score: 0, extra: ctx.t('game.word', { w: answer }) }); }
    else ctx.beep(s.some((x) => x !== 'miss') ? 'good' : 'tap');
  }
  ctx.onKey((e) => {
    if (/^[a-z]$/i.test(e.key)) { typeCh(e.key.toUpperCase()); return true; }
    if (e.key === 'Backspace') { back(); return true; }
    if (e.key === 'Enter') { enter(); return true; }
    return false;
  });
  return { start() { answer = pick(WORDS); rows = []; cur = ''; done = false; keyState = {}; msg.textContent = ctx.t('game.wordle.d'); ctx.below.replaceChildren(keys); draw(); drawKeys(); } };
}

// ---------- Memory Match ----------
const SYMS = ['π', '∑', '√', '∞', '∫', 'Δ', 'θ', '≠', '≈', '∂', 'φ', 'λ', '±', '÷', '∠', 'Ω', '∈', '⊥'];
function memory(ctx) {
  const grid = h('div', { class: 'g-grid mem' }), info = h('div', { class: 't2 g-sub' });
  ctx.stage.append(h('div', { class: 'g-center' }, info, grid));
  let cards, open, moves, found, lock, secs;
  function pairsFor(level) {
    const n = { easy: 6, medium: 8, hard: 10 }[level] || 8;
    if (level === 'hard') {
      return shuffle(Array.from({ length: n }, () => { const a = rnd(2, 12), b = rnd(2, 12); return [`${a}×${b}`, String(a * b)]; }).filter((p, i, arr) => arr.findIndex((q) => q[1] === p[1]) === i));
    }
    return shuffle(SYMS).slice(0, n).map((s) => [s, s]);
  }
  function deal() {
    const pairs = pairsFor(ctx.level);
    cards = shuffle(pairs.flatMap(([a, b], k) => [{ k, v: a }, { k, v: b }])).map((c) => ({ ...c, up: false, done: false }));
    grid.style.setProperty('--cols', cards.length > 16 ? 5 : 4);
    open = []; moves = 0; found = 0; lock = false; secs = 0; draw();
  }
  function draw() {
    clear(grid);
    info.textContent = `${moves} moves · ${found}/${cards.length / 2}`;
    cards.forEach((c, i) => grid.append(h('button', { type: 'button', class: `mem-c${c.up || c.done ? ' up' : ''}${c.done ? ' done' : ''}`, 'aria-label': c.up || c.done ? c.v : 'Hidden card', on: { click: () => flip(i) } }, h('span', { text: c.up || c.done ? c.v : '' }))));
  }
  function flip(i) {
    const c = cards[i];
    if (lock || c.up || c.done) return;
    c.up = true; open.push(i); ctx.beep('tap'); draw();
    if (open.length === 2) {
      moves++;
      const [a, b] = open.map((j) => cards[j]);
      if (a.k === b.k) { a.done = b.done = true; open = []; found++; ctx.beep('good'); draw(); if (found === cards.length / 2) ctx.over({ score: Math.max(10, Math.round(cards.length * 60 - moves * 15 - secs * 2)), win: true, extra: `${moves} moves · ${Math.round(secs)} s` }); }
      else { lock = true; setTimeout(() => { a.up = b.up = false; open = []; lock = false; draw(); }, 750); }
      ctx.score(found * 10);
    }
  }
  return { start() { deal(); ctx.loop((dt) => { secs += dt; }); } };
}

export const GAMES = { mathquiz: blitz, calcchain: chain, numrush, sudoku, wordle, memory };
