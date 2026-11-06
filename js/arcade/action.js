// Action games: Flappy Math, Bubble Pop, Whack-a-Number, Dodge, Gravity Draw.

import { h, clear } from '../ui.js';
import { rnd, pick } from './index.js';

const col = (ctx) => ({ a: ctx.color('--accent-hi') || '#00C3F3', b: ctx.color('--amber') || '#F5A524', ok: ctx.color('--ok') || '#2FBF7A', err: ctx.color('--err') || '#F0566A', t: ctx.color('--text') || '#fff', t2: ctx.color('--text-2') || '#999', line: ctx.color('--line') || '#333', g5: ctx.color('--g5') || '#A78BFA', g6: ctx.color('--g6') || '#F472B6' });

// ---------- Flappy Math: a gap labelled with the right answer ----------
function flappy(ctx) {
  const cv = ctx.canvas();
  let bird, pipes, score, C, t0, q;
  const flap = () => { bird.vy = -0.62; ctx.beep('tap'); };
  ctx.onKey((e) => { if (e.key === ' ' || e.key === 'ArrowUp') { flap(); return true; } return false; });
  ctx.stage.addEventListener('pointerdown', () => { if (bird) flap(); });
  const newQ = () => { const a = rnd(2, 9), b = rnd(2, 9); return { text: `${a} × ${b}`, ans: a * b }; };
  function addPipe() {
    q = q || newQ();
    const good = rnd(0, 1), gapA = 0.28 + Math.random() * 0.12, gapB = 0.7 - Math.random() * 0.1;
    const wrong = q.ans + pick([-6, -4, -2, 2, 3, 4, 6]);
    pipes.push({ x: 1.1, gaps: [{ y: gapA, v: good ? q.ans : wrong, ok: !!good }, { y: gapB, v: good ? wrong : q.ans, ok: !good }], q: q.text, passed: false });
  }
  return {
    start() {
      C = col(ctx); bird = { y: 0.5, vy: 0 }; pipes = []; score = 0; t0 = 0; q = null; addPipe(); clear(ctx.below);
      ctx.loop((dt) => {
        const { g, w, h: hh } = cv;
        bird.vy += 1.6 * dt; bird.y += bird.vy * dt;
        t0 += dt;
        const sp = 0.22 + Math.min(0.12, score * 0.006);
        for (const p of pipes) p.x -= sp * dt;
        if (pipes[pipes.length - 1].x < 0.45) { q = newQ(); addPipe(); }
        pipes = pipes.filter((p) => p.x > -0.2);
        const bx = 0.25, gapH = 0.16, pw = 0.09;
        if (bird.y < 0 || bird.y > 1) { ctx.over({ score }); return; }
        for (const p of pipes) {
          if (bx > p.x - 0.02 && bx < p.x + pw + 0.02) {
            const inGap = p.gaps.find((gp) => Math.abs(bird.y - gp.y) < gapH / 2 - 0.015);
            if (!inGap || !inGap.ok) { ctx.over({ score, extra: `${p.q} = ${p.gaps.find((x) => x.ok).v}` }); return; }
          }
          if (!p.passed && p.x + pw < bx) { p.passed = true; score++; ctx.score(score); ctx.beep('good'); }
        }
        g.clearRect(0, 0, w, hh);
        for (const p of pipes) {
          g.fillStyle = C.line;
          const segs = [[0, p.gaps[0].y - gapH / 2], [p.gaps[0].y + gapH / 2, p.gaps[1].y - gapH / 2], [p.gaps[1].y + gapH / 2, 1]];
          for (const [a, b] of segs) { g.fillStyle = 'rgba(127,163,189,.35)'; g.fillRect(p.x * w, a * hh, pw * w, (b - a) * hh); }
          g.fillStyle = C.t; g.font = '700 16px ui-monospace, monospace'; g.textAlign = 'center';
          for (const gp of p.gaps) g.fillText(String(gp.v), (p.x + pw / 2) * w, gp.y * hh + 6);
        }
        const nextP = pipes.find((p) => !p.passed);
        g.fillStyle = C.b; g.font = '700 20px system-ui'; g.fillText(nextP ? `${nextP.q} = ?` : '', w / 2, 34);
        g.textAlign = 'left';
        g.fillStyle = C.a; g.beginPath(); g.arc(bx * w, bird.y * hh, 11, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(bx * w + 4, bird.y * hh - 3, 3, 0, 7); g.fill();
      });
    },
  };
}

// ---------- Bubble Pop ----------
function bubble(ctx) {
  const cv = ctx.canvas();
  let bubbles, score, combo, comboT, left, missed, C, spawnT;
  ctx.stage.addEventListener('pointerdown', (e) => {
    if (!bubbles) return;
    const r = ctx.stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (Math.hypot(x - b.x * cv.w, y - b.y * cv.h) < b.r * cv.w * 1.1) {
        bubbles.splice(i, 1);
        combo = comboT > 0 ? combo + 1 : 1; comboT = 0.9;
        score += 5 * Math.min(combo, 8); ctx.score(score); ctx.beep('pop');
        return;
      }
    }
    combo = 0;
  });
  return {
    start() {
      C = col(ctx); bubbles = []; score = 0; combo = 0; comboT = 0; left = 45; missed = 0; spawnT = 0; clear(ctx.below);
      const hues = [C.a, C.b, C.ok, C.g5, C.g6];
      ctx.loop((dt) => {
        const { g, w, h: hh } = cv;
        left -= dt; comboT -= dt; spawnT -= dt;
        if (spawnT <= 0) { bubbles.push({ x: 0.08 + Math.random() * 0.84, y: 1.1, r: 0.035 + Math.random() * 0.035, v: 0.12 + Math.random() * 0.12 + (45 - left) * 0.004, c: pick(hues) }); spawnT = Math.max(0.25, 0.7 - (45 - left) * 0.01); }
        for (const b of bubbles) b.y -= b.v * dt;
        missed += bubbles.filter((b) => b.y < -0.1).length;
        bubbles = bubbles.filter((b) => b.y >= -0.1);
        if (left <= 0) { ctx.over({ score, extra: `${missed} escaped` }); return; }
        g.clearRect(0, 0, w, hh);
        for (const b of bubbles) {
          const x = b.x * w, y = b.y * hh, r = b.r * w;
          const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
          gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(0.3, b.c); gr.addColorStop(1, 'rgba(0,0,0,.15)');
          g.fillStyle = gr; g.globalAlpha = 0.9; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.globalAlpha = 1;
        }
        g.fillStyle = C.t2; g.font = '600 13px system-ui';
        g.fillText(`${Math.ceil(left)}s`, 10, 20);
        if (combo > 1 && comboT > 0) { g.fillStyle = C.b; g.font = '800 22px system-ui'; g.textAlign = 'center'; g.fillText(`COMBO × ${combo}`, w / 2, 36); g.textAlign = 'left'; }
      });
    },
  };
}

// ---------- Whack-a-Number: hit only numbers that match the rule ----------
const RULES = [
  ['even', (n) => n % 2 === 0], ['odd', (n) => n % 2 === 1], ['×3', (n) => n % 3 === 0], ['×5', (n) => n % 5 === 0],
  ['prime', (n) => n > 1 && [...Array(Math.floor(Math.sqrt(n)) + 1).keys()].slice(2).every((d) => n % d)], ['square', (n) => Number.isInteger(Math.sqrt(n))],
];
function whack(ctx) {
  const grid = h('div', { class: 'g-grid whack' }), rule = h('div', { class: 'g-big' }), info = h('div', { class: 't2 g-sub' });
  ctx.stage.append(h('div', { class: 'g-center' }, rule, info, grid));
  let holes, score, left, cur, spawnT, ruleT;
  const label = { even: 'Even numbers', odd: 'Odd numbers', '×3': 'Multiples of 3', '×5': 'Multiples of 5', prime: 'Prime numbers', square: 'Square numbers' };
  function draw() {
    clear(grid);
    holes.forEach((hole, i) => grid.append(h('button', { type: 'button', class: `hole${hole ? ' up' : ''}`, on: { pointerdown: (e) => { e.preventDefault(); hit(i); } } }, hole ? h('span', { text: hole.n }) : null)));
  }
  function hit(i) {
    const hole = holes[i];
    if (!hole) return;
    if (cur[1](hole.n)) { score += 10; ctx.beep('good'); } else { score = Math.max(0, score - 5); ctx.beep('bad'); left -= 1; }
    holes[i] = null; ctx.score(score); draw();
  }
  return {
    start() {
      holes = Array(9).fill(null); score = 0; left = 40; spawnT = 0; ruleT = 0; cur = pick(RULES); clear(ctx.below);
      ctx.loop((dt) => {
        left -= dt; spawnT -= dt; ruleT += dt;
        if (ruleT > 10) { ruleT = 0; cur = pick(RULES.filter((r) => r !== cur)); ctx.beep('win'); }
        rule.textContent = label[cur[0]]; info.textContent = `${Math.ceil(left)}s`;
        let changed = false;
        holes.forEach((hole, i) => { if (hole && (hole.t -= dt) <= 0) { holes[i] = null; changed = true; } });
        if (spawnT <= 0) {
          const free = holes.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
          if (free.length) { const n = Math.random() < 0.5 ? pick([...Array(60).keys()].map((x) => x + 1).filter(cur[1])) : rnd(1, 60); holes[pick(free)] = { n, t: Math.max(0.7, 1.5 - (40 - left) * 0.02) }; changed = true; }
          spawnT = Math.max(0.35, 0.8 - (40 - left) * 0.01);
        }
        if (changed) draw();
        if (left <= 0) ctx.over({ score });
      });
      draw();
    },
  };
}

// ---------- Dodge ----------
function dodge(ctx) {
  const cv = ctx.canvas();
  let me, balls, tt, spawnT, C, keys = {}, target = null;
  ctx.onKey((e) => { if (e.key.startsWith('Arrow')) { keys[e.key] = true; return true; } return false; });
  document.addEventListener('keyup', (e) => { keys[e.key] = false; });
  ctx.stage.addEventListener('pointermove', (e) => { const r = ctx.stage.getBoundingClientRect(); target = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; });
  ctx.stage.addEventListener('pointerdown', (e) => { const r = ctx.stage.getBoundingClientRect(); target = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; });
  return {
    start() {
      C = col(ctx); me = [0.5, 0.8]; balls = []; tt = 0; spawnT = 0; target = null; clear(ctx.below);
      ctx.loop((dt) => {
        const { g, w, h: hh } = cv, sp = 0.9;
        tt += dt; spawnT -= dt;
        if (keys.ArrowLeft) me[0] -= sp * dt; if (keys.ArrowRight) me[0] += sp * dt; if (keys.ArrowUp) me[1] -= sp * dt; if (keys.ArrowDown) me[1] += sp * dt;
        if (target) { me[0] += (target[0] - me[0]) * Math.min(1, dt * 10); me[1] += (target[1] - me[1]) * Math.min(1, dt * 10); }
        me[0] = Math.max(0.02, Math.min(0.98, me[0])); me[1] = Math.max(0.02, Math.min(0.98, me[1]));
        if (spawnT <= 0) { balls.push({ x: Math.random(), y: -0.05, vx: (Math.random() - 0.5) * 0.2, vy: 0.25 + Math.random() * 0.25 + tt * 0.01, r: 0.012 + Math.random() * 0.02 }); spawnT = Math.max(0.12, 0.6 - tt * 0.012); }
        for (const b of balls) { b.x += b.vx * dt; b.y += b.vy * dt; }
        balls = balls.filter((b) => b.y < 1.1);
        const s = Math.min(w, hh);
        for (const b of balls) if (Math.hypot((b.x - me[0]) * w, (b.y - me[1]) * hh) < b.r * s + 9) { ctx.over({ score: Math.floor(tt * 10), extra: `${tt.toFixed(1)} s` }); return; }
        ctx.score(Math.floor(tt * 10));
        g.clearRect(0, 0, w, hh);
        g.fillStyle = C.err; for (const b of balls) { g.beginPath(); g.arc(b.x * w, b.y * hh, b.r * s, 0, 7); g.fill(); }
        g.fillStyle = C.a; g.shadowColor = C.a; g.shadowBlur = 14; g.beginPath(); g.arc(me[0] * w, me[1] * hh, 9, 0, 7); g.fill(); g.shadowBlur = 0;
      });
    },
  };
}

// ---------- Gravity Draw: place planets, then the ball flies ----------
function gravdraw(ctx) {
  const cv = ctx.canvas();
  let level, planets, ball, phase, goal, C, msgT, score, tries;
  ctx.stage.addEventListener('pointerdown', (e) => {
    if (phase !== 'place') return;
    const r = ctx.stage.getBoundingClientRect();
    planets.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    ctx.beep('tap');
    if (planets.length >= need()) launch();
  });
  const need = () => Math.min(3, 1 + Math.floor((level - 1) / 2));
  function setup() {
    planets = []; phase = 'place';
    goal = { x: 0.82 + Math.random() * 0.1, y: 0.15 + Math.random() * 0.7, r: Math.max(0.035, 0.07 - level * 0.004) };
    ball = { x: 0.08, y: 0.5 + (Math.random() - 0.5) * 0.5, vx: 0.28, vy: (Math.random() - 0.5) * 0.25 };
    msgT = ctx.t('game.placePlanets', { n: need() });
  }
  function launch() { phase = 'fly'; tries++; }
  return {
    start() {
      C = col(ctx); level = 1; score = 0; tries = 0; setup(); clear(ctx.below);
      ctx.loop((dt) => {
        const { g, w, h: hh } = cv, ar = w / hh;
        if (phase === 'fly') {
          for (let k = 0; k < 4; k++) {
            const st = dt / 4;
            for (const p of planets) { const dx = (p.x - ball.x) * ar, dy = p.y - ball.y, d2 = dx * dx + dy * dy + 0.002, f = 0.012 / d2; const d = Math.sqrt(d2); ball.vx += (f * dx) / d / ar * st; ball.vy += (f * dy) / d * st; }
            ball.x += ball.vx * st; ball.y += ball.vy * st;
          }
          if (Math.hypot((ball.x - goal.x) * ar, ball.y - goal.y) < goal.r) { score += 100 * level; level++; ctx.score(score); ctx.beep('win'); setup(); }
          else if (ball.x < -0.1 || ball.x > 1.1 || ball.y < -0.1 || ball.y > 1.1 || planets.some((p) => Math.hypot((p.x - ball.x) * ar, p.y - ball.y) < 0.025)) {
            ctx.beep('bad');
            if (tries >= 3 + level) { ctx.over({ score, extra: `Level ${level}` }); return; }
            const keepGoal = goal; setup(); goal = keepGoal;
          }
        }
        g.clearRect(0, 0, w, hh);
        g.strokeStyle = C.ok; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.arc(goal.x * w, goal.y * hh, goal.r * hh, 0, 7); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(47,191,122,.15)'; g.beginPath(); g.arc(goal.x * w, goal.y * hh, goal.r * hh, 0, 7); g.fill();
        for (const p of planets) {
          const gr = g.createRadialGradient(p.x * w, p.y * hh, 2, p.x * w, p.y * hh, 60);
          gr.addColorStop(0, 'rgba(167,139,250,.35)'); gr.addColorStop(1, 'rgba(167,139,250,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(p.x * w, p.y * hh, 60, 0, 7); g.fill();
          g.fillStyle = C.g5; g.beginPath(); g.arc(p.x * w, p.y * hh, 10, 0, 7); g.fill();
        }
        g.fillStyle = C.b; g.beginPath(); g.arc(ball.x * w, ball.y * hh, 7, 0, 7); g.fill();
        if (phase === 'place') {
          g.strokeStyle = 'rgba(245,165,36,.5)'; g.beginPath(); g.moveTo(ball.x * w, ball.y * hh); g.lineTo((ball.x + ball.vx * 0.4) * w, (ball.y + ball.vy * 0.4) * hh); g.stroke();
          g.fillStyle = C.t2; g.font = '600 13px system-ui'; g.textAlign = 'center'; g.fillText(msgT, w / 2, 24); g.textAlign = 'left';
        }
        g.fillStyle = C.t2; g.font = '600 12px system-ui'; g.fillText(`Level ${level} · ${Math.max(0, 3 + level - tries)} tries`, 10, hh - 10);
      });
    },
  };
}

export const GAMES = { flappy, bubble, whack, dodge, gravdraw };
