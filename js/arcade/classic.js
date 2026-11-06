// Classic games: Snake, 2048, Tetris, Breakout, Pong, Asteroids.
// Keyboard, swipe and on-screen pads; colours follow the theme.

import { h, clear } from '../ui.js';
import { rnd, pick } from './index.js';

const col = (ctx) => ({ a: ctx.color('--accent-hi') || '#00C3F3', b: ctx.color('--amber') || '#F5A524', ok: ctx.color('--ok') || '#2FBF7A', err: ctx.color('--err') || '#F0566A', t: ctx.color('--text') || '#fff', t2: ctx.color('--text-2') || '#999', line: ctx.color('--line') || '#333', g5: ctx.color('--g5') || '#A78BFA', g6: ctx.color('--g6') || '#F472B6' });
const rr = (g, x, y, w, hh, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh); g.fill(); };

// ---------- Snake ----------
function snake(ctx) {
  const cv = ctx.canvas();
  let s, dir, nextDir, food, acc, speed, score, C;
  const N = 20;
  const turn = (d) => { const opp = { up: 'down', down: 'up', left: 'right', right: 'left' }; if (d !== opp[dir]) nextDir = d; };
  ctx.onKey((e) => { const d = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }[e.key]; if (d) { turn(d); return true; } return false; });
  ctx.swipe(ctx.stage, turn);
  const place = () => { do { food = [rnd(0, N - 1), rnd(0, N - 1)]; } while (s.some((p) => p[0] === food[0] && p[1] === food[1])); };
  function draw() {
    const { g, w, h: H } = cv, cell = Math.floor(Math.min(w, H) / N), ox = (w - cell * N) / 2, oy = (H - cell * N) / 2;
    g.clearRect(0, 0, w, H);
    g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(ox + 0.5, oy + 0.5, cell * N - 1, cell * N - 1);
    g.fillStyle = C.b; rr(g, ox + food[0] * cell + 3, oy + food[1] * cell + 3, cell - 6, cell - 6, 4);
    s.forEach((p, i) => { g.fillStyle = i ? C.a : C.t; g.globalAlpha = 1 - (i / s.length) * 0.55; rr(g, ox + p[0] * cell + 1, oy + p[1] * cell + 1, cell - 2, cell - 2, 3); });
    g.globalAlpha = 1;
  }
  return {
    start() {
      C = col(ctx); s = [[10, 10], [9, 10], [8, 10]]; dir = nextDir = 'right'; acc = 0; speed = 8; score = 0; place();
      ctx.pad([['', () => turn('left'), { icon: 'left', aria: 'Left' }], ['', () => turn('up'), { icon: 'up', aria: 'Up' }], ['', () => turn('down'), { icon: 'down', aria: 'Down' }], ['', () => turn('right'), { icon: 'right', aria: 'Right' }]]);
      ctx.loop((dt) => {
        acc += dt;
        if (acc >= 1 / speed) {
          acc = 0; dir = nextDir;
          const hd = [s[0][0] + (dir === 'right') - (dir === 'left'), s[0][1] + (dir === 'down') - (dir === 'up')];
          if (hd[0] < 0 || hd[1] < 0 || hd[0] >= N || hd[1] >= N || s.some((p) => p[0] === hd[0] && p[1] === hd[1])) { ctx.over({ score }); return; }
          s.unshift(hd);
          if (hd[0] === food[0] && hd[1] === food[1]) { score += 10; speed = Math.min(20, speed + 0.4); ctx.score(score); ctx.beep('good'); place(); } else s.pop();
        }
        draw();
      });
    },
  };
}

// ---------- 2048 ----------
function g2048(ctx) {
  const board = h('div', { class: 'b2048', role: 'grid' });
  ctx.stage.append(h('div', { class: 'g-center' }, board));
  let grid, score, won;
  const add = () => { const e = []; grid.forEach((v, i) => { if (!v) e.push(i); }); if (e.length) grid[pick(e)] = Math.random() < 0.9 ? 2 : 4; };
  function draw(merged = new Set()) {
    clear(board);
    grid.forEach((v, i) => board.append(h('div', { class: `t2048 v${Math.min(v, 4096)}${merged.has(i) ? ' pop' : ''}`, role: 'gridcell', text: v || '' })));
  }
  function move(dir) {
    const lines = [];
    for (let k = 0; k < 4; k++) {
      const idx = [0, 1, 2, 3].map((j) => (dir === 'left' ? k * 4 + j : dir === 'right' ? k * 4 + 3 - j : dir === 'up' ? j * 4 + k : (3 - j) * 4 + k));
      lines.push(idx);
    }
    let moved = false; const merged = new Set();
    for (const idx of lines) {
      const vals = idx.map((i) => grid[i]).filter(Boolean), out = [];
      for (let j = 0; j < vals.length; j++) {
        if (vals[j] === vals[j + 1]) { out.push(vals[j] * 2); score += vals[j] * 2; merged.add(idx[out.length - 1]); if (vals[j] * 2 === 2048 && !won) won = true; j++; }
        else out.push(vals[j]);
      }
      idx.forEach((i, j) => { const v = out[j] || 0; if (grid[i] !== v) moved = true; grid[i] = v; });
    }
    if (!moved) return;
    add(); ctx.score(score); ctx.beep(merged.size ? 'good' : 'tap'); draw(merged);
    const canMove = grid.some((v, i) => !v || (i % 4 < 3 && v === grid[i + 1]) || (i < 12 && v === grid[i + 4]));
    if (!canMove) ctx.over({ score, win: won });
  }
  ctx.onKey((e) => { const d = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }[e.key]; if (d) { move(d); return true; } return false; });
  ctx.swipe(ctx.stage, move);
  return { start() { grid = Array(16).fill(0); score = 0; won = false; add(); add(); draw(); clear(ctx.below); } };
}

// ---------- Tetris ----------
const SHAPES = { I: [[1, 1, 1, 1]], O: [[1, 1], [1, 1]], T: [[0, 1, 0], [1, 1, 1]], S: [[0, 1, 1], [1, 1, 0]], Z: [[1, 1, 0], [0, 1, 1]], J: [[1, 0, 0], [1, 1, 1]], L: [[0, 0, 1], [1, 1, 1]] };
function tetris(ctx) {
  const cv = ctx.canvas();
  const W = 10, H = 20;
  let board, cur, nextP, score, lines, level, acc, C, colors, bag;
  const rot = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
  const fits = (m, x, y) => m.every((r, j) => r.every((v, i) => !v || (x + i >= 0 && x + i < W && y + j < H && (y + j < 0 || !board[y + j][x + i]))));
  const draw7 = () => { if (!bag.length) bag = Object.keys(SHAPES).sort(() => Math.random() - 0.5); return bag.pop(); };
  const spawn = () => { const k = nextP || draw7(); nextP = draw7(); cur = { k, m: SHAPES[k], x: 3, y: -1 }; if (!fits(cur.m, cur.x, cur.y + 1)) ctx.over({ score, extra: `${lines} lines` }); };
  function lock() {
    cur.m.forEach((r, j) => r.forEach((v, i) => { if (v && cur.y + j >= 0) board[cur.y + j][cur.x + i] = cur.k; }));
    let n = 0;
    for (let y = H - 1; y >= 0; y--) if (board[y].every(Boolean)) { board.splice(y, 1); board.unshift(Array(W).fill(0)); n++; y++; }
    if (n) { lines += n; score += [0, 100, 300, 500, 800][n] * level; level = 1 + Math.floor(lines / 10); ctx.beep('good'); } else ctx.beep('tap');
    ctx.score(score); spawn();
  }
  const act = {
    left: () => fits(cur.m, cur.x - 1, cur.y) && cur.x--, right: () => fits(cur.m, cur.x + 1, cur.y) && cur.x++,
    rot: () => { const m = rot(cur.m); for (const k of [0, -1, 1, -2, 2]) if (fits(m, cur.x + k, cur.y)) { cur.m = m; cur.x += k; return; } },
    down: () => { if (fits(cur.m, cur.x, cur.y + 1)) { cur.y++; score += 1; } else lock(); acc = 0; },
    drop: () => { while (fits(cur.m, cur.x, cur.y + 1)) { cur.y++; score += 2; } lock(); acc = 0; },
  };
  ctx.onKey((e) => { const a = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rot', ArrowDown: 'down', ' ': 'drop', x: 'rot', z: 'rot' }[e.key]; if (a) { act[a](); draw(); return true; } return false; });
  function draw() {
    const { g, w, h: hh } = cv, cell = Math.floor(Math.min((w - 90) / W, hh / H)), ox = Math.max(6, (w - cell * W - 80) / 2), oy = (hh - cell * H) / 2;
    g.clearRect(0, 0, w, hh);
    g.fillStyle = 'rgba(127,127,127,.06)'; g.fillRect(ox, oy, cell * W, cell * H);
    g.strokeStyle = C.line; g.strokeRect(ox + 0.5, oy + 0.5, cell * W, cell * H);
    const block = (x, y, k, a = 1) => { g.globalAlpha = a; g.fillStyle = colors[k]; rr(g, ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2, 3); g.globalAlpha = 1; };
    board.forEach((r, y) => r.forEach((k, x) => k && block(x, y, k)));
    let gy = cur.y; while (fits(cur.m, cur.x, gy + 1)) gy++;
    cur.m.forEach((r, j) => r.forEach((v, i) => { if (v && gy + j >= 0) block(cur.x + i, gy + j, cur.k, 0.18); }));
    cur.m.forEach((r, j) => r.forEach((v, i) => { if (v && cur.y + j >= 0) block(cur.x + i, cur.y + j, cur.k); }));
    const nx = ox + cell * W + 14;
    g.fillStyle = C.t2; g.font = '600 11px system-ui'; g.fillText('NEXT', nx, oy + 12);
    SHAPES[nextP].forEach((r, j) => r.forEach((v, i) => { if (v) { g.fillStyle = colors[nextP]; rr(g, nx + i * 14, oy + 22 + j * 14, 12, 12, 2); } }));
    g.fillStyle = C.t2; g.fillText(`LV ${level}`, nx, oy + 80); g.fillText(`${lines} L`, nx, oy + 96);
  }
  return {
    start() {
      C = col(ctx); colors = { I: C.a, O: C.b, T: C.g5, S: C.ok, Z: C.err, J: '#4f7cff', L: C.g6 };
      board = Array.from({ length: H }, () => Array(W).fill(0)); score = 0; lines = 0; level = 1; acc = 0; bag = []; nextP = null; spawn();
      ctx.pad([['', act.left, { icon: 'left', aria: 'Left', repeat: true }], ['', act.rot, { icon: 'rotate3d', aria: 'Rotate' }], ['', act.right, { icon: 'right', aria: 'Right', repeat: true }], ['', act.down, { icon: 'down', aria: 'Down', repeat: true }], ['', act.drop, { icon: 'enter', aria: 'Drop' }]]);
      ctx.loop((dt) => { acc += dt; if (acc > Math.max(0.08, 0.8 - (level - 1) * 0.07)) act.down(); if (cur) draw(); });
    },
  };
}

// ---------- Breakout ----------
function breakout(ctx) {
  const cv = ctx.canvas();
  let px, ball, bricks, lives, score, C, keys, launched;
  keys = {};
  ctx.onKey((e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { keys[e.key] = true; return true; } if (e.key === ' ') { launched = true; return true; } return false; });
  document.addEventListener('keyup', (e) => { keys[e.key] = false; });
  ctx.stage.addEventListener('pointermove', (e) => { const r = ctx.stage.getBoundingClientRect(); px = (e.clientX - r.left) / r.width; });
  ctx.stage.addEventListener('pointerdown', () => { launched = true; });
  function reset() { ball = { x: 0.5, y: 0.85, vx: 0.32 * (Math.random() < 0.5 ? -1 : 1), vy: -0.55 }; launched = false; }
  return {
    start() {
      C = col(ctx); lives = 3; score = 0; px = 0.5;
      const cols = 9, rows = 6, rc = [C.err, C.b, '#FACC15', C.ok, C.a, C.g5];
      bricks = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) bricks.push({ x: c / cols, y: 0.08 + r * 0.045, w: 1 / cols, hh: 0.04, c: rc[r], alive: true });
      reset(); clear(ctx.below);
      ctx.loop((dt) => {
        const { g, w, h: hh } = cv, pw = 0.16;
        if (keys.ArrowLeft) px -= dt * 1.1; if (keys.ArrowRight) px += dt * 1.1;
        px = Math.max(pw / 2, Math.min(1 - pw / 2, px));
        if (!launched) { ball.x = px; ball.y = 0.9; }
        else {
          ball.x += ball.vx * dt; ball.y += ball.vy * dt * (w / hh);
          if (ball.x < 0.01 || ball.x > 0.99) { ball.vx *= -1; ball.x = Math.max(0.01, Math.min(0.99, ball.x)); }
          if (ball.y < 0.01) { ball.vy = Math.abs(ball.vy); }
          if (ball.y > 0.915 && ball.y < 0.95 && Math.abs(ball.x - px) < pw / 2 + 0.01 && ball.vy > 0) { ball.vy = -Math.abs(ball.vy) * 1.02; ball.vx = ((ball.x - px) / (pw / 2)) * 0.6; ctx.beep('tap'); }
          for (const b of bricks) if (b.alive && ball.x > b.x && ball.x < b.x + b.w && ball.y > b.y && ball.y < b.y + b.hh) { b.alive = false; ball.vy *= -1; score += 10; ctx.score(score); ctx.beep('pop'); break; }
          if (ball.y > 1.02) { lives--; ctx.beep('bad'); if (lives <= 0) { ctx.over({ score }); return; } reset(); }
          if (bricks.every((b) => !b.alive)) { ctx.over({ score: score + lives * 100, win: true }); return; }
        }
        g.clearRect(0, 0, w, hh);
        for (const b of bricks) if (b.alive) { g.fillStyle = b.c; rr(g, b.x * w + 2, b.y * hh, b.w * w - 4, b.hh * hh - 3, 3); }
        g.fillStyle = C.t; rr(g, (px - pw / 2) * w, 0.93 * hh, pw * w, 10, 5);
        g.fillStyle = C.a; g.beginPath(); g.arc(ball.x * w, ball.y * hh, 6, 0, 7); g.fill();
        g.fillStyle = C.t2; g.font = '600 12px system-ui'; g.fillText(ctx.t('arcade.lives', { n: lives }), 10, hh - 10);
        if (!launched) { g.textAlign = 'center'; g.fillText(ctx.t('game.tapToStart'), w / 2, hh * 0.7); g.textAlign = 'left'; }
      });
    },
  };
}

// ---------- Pong ----------
function pong(ctx) {
  const cv = ctx.canvas();
  let py, ay, ball, me, ai, C, keys = {};
  ctx.onKey((e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 's') { keys[e.key] = true; return true; } return false; });
  document.addEventListener('keyup', (e) => { keys[e.key] = false; });
  ctx.stage.addEventListener('pointermove', (e) => { const r = ctx.stage.getBoundingClientRect(); py = (e.clientY - r.top) / r.height; });
  const serve = (d) => { ball = { x: 0.5, y: 0.5, vx: 0.45 * d, vy: (Math.random() - 0.5) * 0.5 }; };
  return {
    start() {
      C = col(ctx); py = ay = 0.5; me = ai = 0; serve(1); clear(ctx.below);
      ctx.loop((dt) => {
        const { g, w, h: hh } = cv, ph = 0.18, ar = w / hh;
        if (keys.ArrowUp || keys.w) py -= dt * 1.2; if (keys.ArrowDown || keys.s) py += dt * 1.2;
        py = Math.max(ph / 2, Math.min(1 - ph / 2, py));
        const aiSpeed = 0.55 + Math.min(0.4, (me + ai) * 0.03);
        ay += Math.max(-aiSpeed * dt, Math.min(aiSpeed * dt, ball.y - ay));
        ay = Math.max(ph / 2, Math.min(1 - ph / 2, ay));
        ball.x += ball.vx * dt; ball.y += ball.vy * dt * ar;
        if (ball.y < 0.01 || ball.y > 0.99) ball.vy *= -1;
        if (ball.x < 0.04 && ball.vx < 0 && Math.abs(ball.y - py) < ph / 2 + 0.02) { ball.vx = Math.abs(ball.vx) * 1.06; ball.vy = (ball.y - py) * 3; ctx.beep('tap'); }
        if (ball.x > 0.96 && ball.vx > 0 && Math.abs(ball.y - ay) < ph / 2 + 0.02) { ball.vx = -Math.abs(ball.vx) * 1.04; ball.vy = (ball.y - ay) * 3; ctx.beep('tap'); }
        if (ball.x < -0.02) { ai++; ctx.beep('bad'); serve(1); }
        if (ball.x > 1.02) { me++; ctx.beep('good'); serve(-1); }
        ctx.text(`${me} : ${ai}`);
        if (me >= 7 || ai >= 7) { ctx.over({ score: me * 10 + (me > ai ? 50 : 0), win: me > ai, extra: `${me} : ${ai}` }); return; }
        g.clearRect(0, 0, w, hh);
        g.strokeStyle = C.line; g.setLineDash([6, 8]); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, hh); g.stroke(); g.setLineDash([]);
        g.fillStyle = C.a; rr(g, 0.02 * w - 5, (py - ph / 2) * hh, 10, ph * hh, 5);
        g.fillStyle = C.b; rr(g, 0.98 * w - 5, (ay - ph / 2) * hh, 10, ph * hh, 5);
        g.fillStyle = C.t; g.beginPath(); g.arc(ball.x * w, ball.y * hh, 7, 0, 7); g.fill();
        g.font = '700 32px system-ui'; g.fillStyle = C.t2; g.textAlign = 'center'; g.fillText(`${me}`, w * 0.4, 44); g.fillText(`${ai}`, w * 0.6, 44); g.textAlign = 'left';
      });
    },
  };
}

// ---------- Asteroids ----------
function asteroids(ctx) {
  const cv = ctx.canvas();
  let ship, rocks, shots, score, lives, C, keys = {}, cool, inv, wave;
  ctx.onKey((e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' '].includes(e.key)) { keys[e.key] = true; return true; } return false; });
  document.addEventListener('keyup', (e) => { keys[e.key] = false; });
  const hold = (k) => [() => { keys[k] = true; setTimeout(() => { keys[k] = false; }, 120); }];
  const spawnRocks = (n) => { for (let i = 0; i < n; i++) { const a = Math.random() * 7; rocks.push({ x: Math.cos(a) * 0.5 + 0.5, y: Math.sin(a) * 0.5 + 0.5, vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15, r: 0.07, sides: rnd(7, 11), seed: Math.random() * 7 }); } };
  return {
    start() {
      C = col(ctx); ship = { x: 0.5, y: 0.5, a: -Math.PI / 2, vx: 0, vy: 0 }; rocks = []; shots = []; score = 0; lives = 3; cool = 0; inv = 2; wave = 1; spawnRocks(4);
      ctx.pad([['', ...hold('ArrowLeft'), { icon: 'left', aria: 'Turn left', repeat: true }], ['', ...hold('ArrowUp'), { icon: 'up', aria: 'Thrust', repeat: true }], ['', ...hold(' '), { icon: 'target', aria: 'Fire', repeat: true }], ['', ...hold('ArrowRight'), { icon: 'right', aria: 'Turn right', repeat: true }]]);
      ctx.loop((dt) => {
        const { g, w, h: hh } = cv, s = Math.min(w, hh);
        const X = (x) => (w - s) / 2 + x * s, Y = (y) => (hh - s) / 2 + y * s;
        if (keys.ArrowLeft) ship.a -= dt * 4; if (keys.ArrowRight) ship.a += dt * 4;
        if (keys.ArrowUp) { ship.vx += Math.cos(ship.a) * dt * 0.5; ship.vy += Math.sin(ship.a) * dt * 0.5; }
        ship.vx *= 0.99; ship.vy *= 0.99; ship.x = (ship.x + ship.vx * dt + 1) % 1; ship.y = (ship.y + ship.vy * dt + 1) % 1;
        cool -= dt; inv -= dt;
        if (keys[' '] && cool <= 0) { shots.push({ x: ship.x, y: ship.y, vx: Math.cos(ship.a) * 0.9 + ship.vx, vy: Math.sin(ship.a) * 0.9 + ship.vy, life: 0.9 }); cool = 0.22; ctx.beep('tap'); }
        for (const o of [...rocks, ...shots]) { o.x = (o.x + o.vx * dt + 1) % 1; o.y = (o.y + o.vy * dt + 1) % 1; }
        shots = shots.filter((b) => (b.life -= dt) > 0);
        for (const b of shots) for (const r of rocks) if (!r.dead && Math.hypot(b.x - r.x, b.y - r.y) < r.r) {
          r.dead = true; b.life = 0; score += Math.round(20 / r.r / 10) * 5; ctx.score(score); ctx.beep('pop');
          if (r.r > 0.03) for (let k = 0; k < 2; k++) rocks.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: r.r / 2, sides: r.sides, seed: Math.random() * 7 });
        }
        rocks = rocks.filter((r) => !r.dead);
        if (inv <= 0 && rocks.some((r) => Math.hypot(ship.x - r.x, ship.y - r.y) < r.r + 0.015)) {
          lives--; ctx.beep('bad'); inv = 2; ship = { x: 0.5, y: 0.5, a: -Math.PI / 2, vx: 0, vy: 0 };
          if (lives <= 0) { ctx.over({ score }); return; }
        }
        if (!rocks.length) { wave++; spawnRocks(3 + wave); inv = 1.5; }
        g.clearRect(0, 0, w, hh);
        g.strokeStyle = C.t2; g.lineWidth = 1.5;
        for (const r of rocks) { g.beginPath(); for (let k = 0; k <= r.sides; k++) { const a = (k / r.sides) * 7, rad = r.r * s * (0.8 + 0.25 * Math.sin(a * 3 + r.seed)); const px = X(r.x) + Math.cos(a) * rad, pyy = Y(r.y) + Math.sin(a) * rad; k ? g.lineTo(px, pyy) : g.moveTo(px, pyy); } g.stroke(); }
        g.fillStyle = C.b; for (const b of shots) { g.beginPath(); g.arc(X(b.x), Y(b.y), 2.2, 0, 7); g.fill(); }
        if (inv <= 0 || Math.floor(inv * 8) % 2) {
          g.strokeStyle = C.a; g.lineWidth = 2; g.beginPath();
          const p = (a, d) => [X(ship.x) + Math.cos(ship.a + a) * d, Y(ship.y) + Math.sin(ship.a + a) * d];
          g.moveTo(...p(0, 14)); g.lineTo(...p(2.5, 10)); g.lineTo(...p(Math.PI, 4)); g.lineTo(...p(-2.5, 10)); g.closePath(); g.stroke();
          if (keys.ArrowUp) { g.strokeStyle = C.b; g.beginPath(); g.moveTo(...p(2.8, 8)); g.lineTo(...p(Math.PI, 14 + Math.random() * 4)); g.lineTo(...p(-2.8, 8)); g.stroke(); }
        }
        g.fillStyle = C.t2; g.font = '600 12px system-ui'; g.fillText(`${ctx.t('arcade.lives', { n: lives })} · W${wave}`, 10, hh - 10);
      });
    },
  };
}

export const GAMES = { snake, g2048, tetris, breakout, pong, asteroids };
