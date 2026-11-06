// Trigonometry (14.4): a draggable unit circle with exact values (every
// multiple of 15°) and all six ratios, a triangle solver for SSS, SAS, ASA,
// AAS and the ambiguous SSA case (both triangles drawn to scale, with the
// rule used at each step), and a table of exact values.

import { h, clear, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { app, bus } from '../bus.js';
import { renderTex, texSpan } from '../mathrender.js';
import { solveTriangle } from '../core/triangle.js';
import { fitCanvas, cssVar } from '../scheduler.js';
import { toolPage, numField, outList, message, fmt, record, tabbed, ok, tabs, alpha } from './kit.js';

// Exact magnitudes for reference angles (TeX, plain text); null = undefined.
const EXACT = {
  0: { sin: ['0', '0'], cos: ['1', '1'], tan: ['0', '0'], csc: null, sec: ['1', '1'], cot: null },
  15: { sin: ['\\frac{\\sqrt{6}-\\sqrt{2}}{4}', '(√6 − √2)/4'], cos: ['\\frac{\\sqrt{6}+\\sqrt{2}}{4}', '(√6 + √2)/4'], tan: ['2-\\sqrt{3}', '2 − √3'], csc: ['\\sqrt{6}+\\sqrt{2}', '√6 + √2'], sec: ['\\sqrt{6}-\\sqrt{2}', '√6 − √2'], cot: ['2+\\sqrt{3}', '2 + √3'] },
  30: { sin: ['\\frac{1}{2}', '1/2'], cos: ['\\frac{\\sqrt{3}}{2}', '√3/2'], tan: ['\\frac{\\sqrt{3}}{3}', '√3/3'], csc: ['2', '2'], sec: ['\\frac{2\\sqrt{3}}{3}', '2√3/3'], cot: ['\\sqrt{3}', '√3'] },
  45: { sin: ['\\frac{\\sqrt{2}}{2}', '√2/2'], cos: ['\\frac{\\sqrt{2}}{2}', '√2/2'], tan: ['1', '1'], csc: ['\\sqrt{2}', '√2'], sec: ['\\sqrt{2}', '√2'], cot: ['1', '1'] },
  60: { sin: ['\\frac{\\sqrt{3}}{2}', '√3/2'], cos: ['\\frac{1}{2}', '1/2'], tan: ['\\sqrt{3}', '√3'], csc: ['\\frac{2\\sqrt{3}}{3}', '2√3/3'], sec: ['2', '2'], cot: ['\\frac{\\sqrt{3}}{3}', '√3/3'] },
  75: { sin: ['\\frac{\\sqrt{6}+\\sqrt{2}}{4}', '(√6 + √2)/4'], cos: ['\\frac{\\sqrt{6}-\\sqrt{2}}{4}', '(√6 − √2)/4'], tan: ['2+\\sqrt{3}', '2 + √3'], csc: ['\\sqrt{6}-\\sqrt{2}', '√6 − √2'], sec: ['\\sqrt{6}+\\sqrt{2}', '√6 + √2'], cot: ['2-\\sqrt{3}', '2 − √3'] },
  90: { sin: ['1', '1'], cos: ['0', '0'], tan: null, csc: ['1', '1'], sec: null, cot: ['0', '0'] },
};
const FNS = ['sin', 'cos', 'tan', 'csc', 'sec', 'cot'];
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

export function create() {
  const { root, body } = toolPage('trig');
  const tb = tabbed([['circle', t('trig.circle')], ['triangle', t('trig.triangle')], ['table', t('trig.table')]], {
    circle: unitCircle, triangle: trianglePanel, table: exactTable,
  });
  body.append(tb.el);
  return { root };
}

// ---------- unit circle ----------
function unitCircle(p) {
  let deg = 30;
  let unit = 'deg';
  const canvas = h('canvas', { class: 'unit-circle', role: 'slider', tabindex: '0', 'aria-label': t('trig.dragHint'), 'aria-valuemin': '0', 'aria-valuemax': '360' });
  const angle = numField(t('trig.angle'), { value: '30', help: t('trig.angleHelp'), onInput: () => { const v = angle.get(); if (ok(v)) { deg = unit === 'deg' ? v : (v * 180) / Math.PI; update(false); } } });
  const uSeg = seg([['deg', t('trig.degrees')], ['rad', t('trig.radians')]], unit, (v) => { unit = v; angle.set(unit === 'deg' ? fmt(deg, 8) : fmt((deg * Math.PI) / 180, 8)); update(false); }, t('set.angle'));
  const out = outList();
  const exactNote = h('p', { class: 'help' });
  p.append(h('div', { class: 'tool-grid two' },
    h('div', { class: 'card' }, canvas, h('p', { class: 'help', text: t('trig.dragHint') })),
    h('div', { class: 'panel' }, h('div', { class: 'card panel' }, uSeg, angle.el), out.el, exactNote)));

  function norm(d) { return ((d % 360) + 360) % 360; }
  function update(fromDrag) {
    const th = norm(deg);
    const rad = (deg * Math.PI) / 180;
    if (fromDrag) angle.set(unit === 'deg' ? fmt(deg, 8) : fmt(rad, 8));
    const s = Math.sin(rad), c = Math.cos(rad);
    const near = (x) => Math.abs(x) < 1e-12;
    const sgn = (x) => (near(x) ? 0 : Math.sign(x));
    const quadrant = th % 90 === 0 ? t('trig.onAxis') : `${t('trig.quadrant')} ${Math.floor(th / 90) + 1}`;
    const refA = th <= 90 ? th : th <= 180 ? 180 - th : th <= 270 ? th - 180 : 360 - th;
    const special = Math.abs(refA - Math.round(refA)) < 1e-9 && Math.round(refA) % 15 === 0 && Math.abs(deg - Math.round(deg)) < 1e-9;
    const ex = special ? EXACT[Math.round(refA)] : null;
    const vals = { sin: s, cos: c, tan: near(c) ? NaN : s / c, csc: near(s) ? NaN : 1 / s, sec: near(c) ? NaN : 1 / c, cot: near(s) ? NaN : c / s };
    const signs = { sin: sgn(s), cos: sgn(c), tan: sgn(s) * sgn(c), csc: sgn(s), sec: sgn(c), cot: sgn(s) * sgn(c) };
    const rows = [
      [t('trig.degrees'), `${fmt(deg, 10)}°`],
      [t('trig.radians'), radText(deg), { node: radNode(deg) }],
      [t('trig.quadrantLabel'), quadrant],
      [t('trig.reference'), `${fmt(refA, 10)}°`],
    ];
    for (const f of FNS) {
      const v = vals[f];
      if (!Number.isFinite(v)) { rows.push([`${f} θ`, t('trig.undefined')]); continue; }
      if (ex && ex[f]) {
        const [tex, text] = ex[f];
        const neg = signs[f] < 0 && text !== '0';
        const node = h('span', { class: 'exact-val' }, texSpan(`${neg ? '-' : ''}${tex}`), h('span', { class: 'muted', text: ` ≈ ${fmt(v, 8)}` }));
        rows.push([`${f} θ`, `${neg ? '−' : ''}${text} ≈ ${fmt(v, 8)}`, { node, big: f === 'sin' || f === 'cos', copy: fmt(v, 10) }]);
      } else rows.push([`${f} θ`, fmt(v, 10), { big: f === 'sin' || f === 'cos' }]);
    }
    out.set(rows);
    exactNote.textContent = ex ? t('trig.exactNote') : '';
    canvas.setAttribute('aria-valuenow', String(Math.round(th)));
    canvas.setAttribute('aria-valuetext', `${fmt(deg, 6)}°, sin ${fmt(s, 4)}, cos ${fmt(c, 4)}`);
    record('trig', `θ = ${fmt(deg, 8)}°`, `sin ${fmt(s, 8)}, cos ${fmt(c, 8)}`);
    draw();
  }
  function radText(d) {
    if (Math.abs(d - Math.round(d)) < 1e-9 && Math.round(d) % 15 === 0) {
      const k = Math.round(d) / 15;
      if (k === 0) return '0';
      const g = gcd(Math.abs(k), 12), num = k / g, den = 12 / g;
      return `${num === 1 ? '' : num === -1 ? '−' : num}π${den === 1 ? '' : `/${den}`}`;
    }
    return fmt((d * Math.PI) / 180, 10);
  }
  function radNode(d) {
    if (Math.abs(d - Math.round(d)) < 1e-9 && Math.round(d) % 15 === 0) {
      const k = Math.round(d) / 15;
      if (k === 0) return null;
      const g = gcd(Math.abs(k), 12), num = k / g, den = 12 / g;
      const n = Math.abs(num), sign = num < 0 ? '-' : '';
      const tex = den === 1 ? `${sign}${n === 1 ? '' : n}\\pi` : `${sign}\\frac{${n === 1 ? '' : n}\\pi}{${den}}`;
      return h('span', {}, texSpan(tex), h('span', { class: 'muted', text: ` ≈ ${fmt((d * Math.PI) / 180, 8)}` }));
    }
    return null;
  }

  function draw() {
    if (!canvas.isConnected) return;
    const { w, h: H, dpr } = fitCanvas(canvas);
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, H);
    const R = Math.min(w, H) * 0.38, cx = w / 2, cy = H / 2;
    const col = { axis: cssVar('--axis'), grid: cssVar('--grid-major'), text: cssVar('--text-2'), sin: cssVar('--g1'), cos: cssVar('--g2'), tan: cssVar('--g3'), pt: cssVar('--text') };
    c.strokeStyle = col.grid; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - R * 1.25, cy); c.lineTo(cx + R * 1.25, cy); c.moveTo(cx, cy - R * 1.25); c.lineTo(cx, cy + R * 1.25); c.stroke();
    c.strokeStyle = col.axis; c.lineWidth = 1.5;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    // ticks every 15°, labels at 30° steps
    c.font = '11px "Geist Mono", ui-monospace, monospace';
    c.fillStyle = col.text; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 15) {
      const a = (d * Math.PI) / 180;
      const r1 = R - (d % 90 === 0 ? 7 : 4), r2 = R + 4;
      c.strokeStyle = col.axis; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx + r1 * Math.cos(a), cy - r1 * Math.sin(a)); c.lineTo(cx + r2 * Math.cos(a), cy - r2 * Math.sin(a)); c.stroke();
      if (d % 30 === 0 && R > 90) c.fillText(`${d}°`, cx + (R + 18) * Math.cos(a), cy - (R + 18) * Math.sin(a));
    }
    const a = (deg * Math.PI) / 180;
    const px = cx + R * Math.cos(a), py = cy - R * Math.sin(a);
    // angle arc
    c.strokeStyle = col.text; c.lineWidth = 1.25;
    c.beginPath(); c.arc(cx, cy, R * 0.22, 0, -norm(deg) * Math.PI / 180, true); c.stroke();
    // cos (horizontal) and sin (vertical) legs
    c.lineWidth = 3;
    c.strokeStyle = col.cos; c.beginPath(); c.moveTo(cx, cy); c.lineTo(px, cy); c.stroke();
    c.strokeStyle = col.sin; c.beginPath(); c.moveTo(px, cy); c.lineTo(px, py); c.stroke();
    c.strokeStyle = col.axis; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(px, py); c.stroke();
    c.fillStyle = cssVar('--accent-hi');
    c.beginPath(); c.arc(px, py, 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = col.pt; c.textAlign = 'left';
    c.fillText(`(${fmt(Math.cos(a), 3)}, ${fmt(Math.sin(a), 3)})`, Math.min(w - 90, px + 10), Math.max(12, py - 14));
    c.fillStyle = col.cos; c.fillText('cos', Math.min(px, cx) + Math.abs(px - cx) / 2 - 10, cy + (Math.sin(a) >= 0 ? 14 : -14));
    c.fillStyle = col.sin; c.fillText('sin', px + (Math.cos(a) >= 0 ? 6 : -28), (py + cy) / 2);
  }

  function fromPointer(e) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2, y = r.height / 2 - (e.clientY - r.top);
    let d = (Math.atan2(y, x) * 180) / Math.PI;
    if (d < 0) d += 360;
    const snap = Math.round(d / 15) * 15;
    deg = Math.abs(d - snap) < 3 ? snap % 360 : Math.round(d * 10) / 10;
    update(true);
  }
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); fromPointer(e); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 1 : 15;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); deg = Math.round((deg + step) / step) * step; update(true); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); deg = Math.round((deg - step) / step) * step; update(true); }
  });
  if ('ResizeObserver' in window) new ResizeObserver(() => requestAnimationFrame(draw)).observe(canvas);
  bus.on('settings', () => requestAnimationFrame(draw));
  update(false);
}

// ---------- triangle solver ----------
function trianglePanel(p) {
  const f = {};
  for (const k of ['a', 'b', 'c']) f[k] = numField(t('trig.side', { k }), { onInput: solve });
  for (const k of ['A', 'B', 'C']) f[k] = numField(t('trig.angleK', { k }), { unit: '°', onInput: solve });
  f.a.set('7'); f.b.set('9'); f.C.set('60');
  const warn = message('warn');
  const host = h('div', { class: 'panel' });
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' }, f.a.el, f.b.el, f.c.el), h('div', { class: 'tool-grid' }, f.A.el, f.B.el, f.C.el),
    h('p', { class: 'help', text: t('trig.triHelp') }),
    h('button', { class: 'btn sm ghost', type: 'button', on: { click: () => { Object.values(f).forEach((x) => x.set('')); solve(); } } }, t('common.clear'))), warn.el, host);

  function solve() {
    const g = {};
    for (const k of Object.keys(f)) {
      const v = f[k].get();
      if (v === null) { warn.set(t('stats.badValue', { v: f[k].input.value })); clear(host); return; }
      if (ok(v)) {
        if (v <= 0) { warn.set(t('trig.positive')); clear(host); return; }
        g[k] = v;
      }
    }
    const count = Object.keys(g).length;
    clear(host);
    if (count < 3) { warn.set(count ? t('trig.needThree') : ''); return; }
    const r = solveTriangle(g);
    if (r.error) { warn.set(t(`trig.err.${r.error}`)); return; }
    warn.set('');
    const list = r.triangles;
    if (list.length === 2) host.append(h('p', { class: 'note-box', text: t('trig.ambiguous') }));
    if (list.length > 1) {
      const views = list.map((tri, i) => triangleView(tri, g, i));
      const tb = tabs(list.map((_, i) => [String(i), t('trig.triangleN', { n: i + 1 })]), (id) => views.forEach((v, i) => { v.hidden = String(i) !== id; }));
      host.append(tb.el, ...views);
      tb.select('0');
    } else host.append(triangleView(list[0], g, 0));
    const tri = list[0];
    record('trig', Object.entries(g).map(([k, v]) => `${k}=${fmt(v, 6)}`).join(', '), `a=${fmt(tri.a, 6)}, b=${fmt(tri.b, 6)}, c=${fmt(tri.c, 6)}, A=${fmt(tri.A, 6)}°, B=${fmt(tri.B, 6)}°, C=${fmt(tri.C, 6)}°`);
  }
  solve();
}

function triangleView(tri, given, idx) {
  const out = outList();
  const d = (x) => fmt(x, 6);
  out.set([
    ['a', d(tri.a)], ['b', d(tri.b)], ['c', d(tri.c)],
    ['A', `${d(tri.A)}°`], ['B', `${d(tri.B)}°`], ['C', `${d(tri.C)}°`],
    [t('trig.area'), d(tri.area), { big: true }], [t('trig.perimeter'), d(tri.perimeter)],
  ]);
  const canvas = h('canvas', { class: 'tri-canvas', role: 'img', 'aria-label': t('trig.triDesc', { a: d(tri.a), b: d(tri.b), c: d(tri.c) }) });
  const steps = h('div', { class: 'steps' });
  for (const [title, tex] of triangleSteps(tri, given)) {
    const m = h('div', { class: 'math' });
    renderTex(m, tex, { display: true });
    steps.append(h('div', { class: 'step' }, h('div', { class: 'title', text: title }), m));
  }
  steps.hidden = !!app.settings.examMode;
  const view = h('div', { class: 'panel' }, h('div', { class: 'tool-grid two' }, h('div', { class: 'card' }, canvas), out.el),
    h('h3', { class: 'section-title', text: t('trig.rule', { rule: t(`trig.rule.${tri.rule}`) }), hidden: !!app.settings.examMode }), steps);
  const draw = () => drawTriangle(canvas, tri);
  if ('ResizeObserver' in window) new ResizeObserver(() => requestAnimationFrame(draw)).observe(canvas);
  bus.on('settings', () => requestAnimationFrame(draw));
  return view;
}

function triangleSteps(tri, g) {
  const n = (x) => fmt(x, 6);
  const S = [];
  const area = [t('trig.areaStep'), `\\text{Area} = \\tfrac{1}{2}ab\\sin C = \\tfrac{1}{2}(${n(tri.a)})(${n(tri.b)})\\sin ${n(tri.C)}^\\circ = ${n(tri.area)}`];
  const cosAngle = (X, x, y, z) => [t('trig.cosineRule'), `\\cos ${X} = \\frac{${y}^2 + ${z}^2 - ${x}^2}{2${y}${z}} = \\frac{${n(tri[y])}^2 + ${n(tri[z])}^2 - ${n(tri[x])}^2}{2(${n(tri[y])})(${n(tri[z])})} \\Rightarrow ${X} = ${n(tri[X])}^\\circ`];
  const sumStep = (X, P, Q) => [t('trig.angleSum'), `${X} = 180^\\circ - ${n(tri[P])}^\\circ - ${n(tri[Q])}^\\circ = ${n(tri[X])}^\\circ`];
  const sineSide = (x, X, y, Y) => [t('trig.sineRule'), `\\frac{${x}}{\\sin ${X}} = \\frac{${y}}{\\sin ${Y}} \\Rightarrow ${x} = \\frac{${n(tri[y])}\\sin ${n(tri[X])}^\\circ}{\\sin ${n(tri[Y])}^\\circ} = ${n(tri[x])}`];
  const opp = { a: 'A', b: 'B', c: 'C', A: 'a', B: 'b', C: 'c' };
  if (tri.rule === 'sss') {
    S.push(cosAngle('A', 'a', 'b', 'c'), cosAngle('B', 'b', 'a', 'c'), sumStep('C', 'A', 'B'));
  } else if (tri.rule === 'sas') {
    const ang = ['A', 'B', 'C'].find((k) => g[k]);
    const side = opp[ang];
    const [y, z] = ['a', 'b', 'c'].filter((k) => k !== side);
    S.push([t('trig.cosineRule'), `${side}^2 = ${y}^2 + ${z}^2 - 2${y}${z}\\cos ${ang} = ${n(tri[y])}^2 + ${n(tri[z])}^2 - 2(${n(tri[y])})(${n(tri[z])})\\cos ${n(tri[ang])}^\\circ \\Rightarrow ${side} = ${n(tri[side])}`]);
    const [P, Q] = ['A', 'B', 'C'].filter((k) => k !== ang);
    S.push(cosAngle(P, opp[P], ...['a', 'b', 'c'].filter((k) => k !== opp[P])), sumStep(Q, ang, P));
  } else if (tri.rule === 'ssa') {
    const ang = ['A', 'B', 'C'].find((k) => g[k]);
    const sideOpp = opp[ang];
    const other = ['a', 'b', 'c'].find((k) => g[k] && k !== sideOpp);
    const O = opp[other];
    const third = ['a', 'b', 'c'].find((k) => k !== sideOpp && k !== other);
    S.push([t('trig.sineRule'), `\\sin ${O} = \\frac{${other}\\sin ${ang}}{${sideOpp}} = \\frac{${n(tri[other])}\\sin ${n(tri[ang])}^\\circ}{${n(tri[sideOpp])}} \\Rightarrow ${O} = ${n(tri[O])}^\\circ`]);
    S.push(sumStep(opp[third], ang, O), sineSide(third, opp[third], sideOpp, ang));
  } else {
    const missing = ['A', 'B', 'C'].find((k) => !g[k]);
    const [P, Q] = ['A', 'B', 'C'].filter((k) => k !== missing);
    S.push(sumStep(missing, P, Q));
    const known = ['a', 'b', 'c'].find((k) => g[k]);
    for (const s of ['a', 'b', 'c']) if (s !== known) S.push(sineSide(s, opp[s], known, opp[known]));
  }
  S.push(area);
  return S;
}

function drawTriangle(canvas, tri) {
  if (!canvas.isConnected) return;
  const { w, h: H, dpr } = fitCanvas(canvas);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, H);
  // A at origin, B along the x-axis (side c), C from angle A and side b
  const rad = Math.PI / 180;
  const P = { A: [0, 0], B: [tri.c, 0], C: [tri.b * Math.cos(tri.A * rad), tri.b * Math.sin(tri.A * rad)] };
  const xs = Object.values(P).map((q) => q[0]), ys = Object.values(P).map((q) => q[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), maxy = Math.max(...ys);
  const pad = 34;
  const k = Math.min((w - 2 * pad) / (maxx - minx || 1), (H - 2 * pad) / (maxy || 1));
  const T = ([x, y]) => [pad + (x - minx) * k + ((w - 2 * pad) - (maxx - minx) * k) / 2, H - pad - y * k - ((H - 2 * pad) - maxy * k) / 2];
  const pts = { A: T(P.A), B: T(P.B), C: T(P.C) };
  c.fillStyle = alpha(cssVar('--accent'), 0.12);
  c.strokeStyle = cssVar('--accent-hi');
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(...pts.A); c.lineTo(...pts.B); c.lineTo(...pts.C); c.closePath(); c.fill(); c.stroke();
  c.font = '600 13px Geist, system-ui, sans-serif';
  c.fillStyle = cssVar('--text');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const cen = [(pts.A[0] + pts.B[0] + pts.C[0]) / 3, (pts.A[1] + pts.B[1] + pts.C[1]) / 3];
  for (const v of ['A', 'B', 'C']) {
    const [x, y] = pts[v];
    const dx = x - cen[0], dy = y - cen[1], L = Math.hypot(dx, dy) || 1;
    c.fillText(v, x + (dx / L) * 16, y + (dy / L) * 16);
  }
  c.font = '12px "Geist Mono", ui-monospace, monospace';
  c.fillStyle = cssVar('--text-2');
  const mid = (p1, p2, label) => {
    const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
    const dx = mx - cen[0], dy = my - cen[1], L = Math.hypot(dx, dy) || 1;
    c.fillText(label, mx + (dx / L) * 16, my + (dy / L) * 16);
  };
  mid(pts.B, pts.C, `a = ${fmt(tri.a, 4)}`);
  mid(pts.A, pts.C, `b = ${fmt(tri.b, 4)}`);
  mid(pts.A, pts.B, `c = ${fmt(tri.c, 4)}`);
}

// ---------- exact values table ----------
function exactTable(p) {
  const angles = [0, 30, 45, 60, 90];
  const tbl = h('table', { class: 'values exact-table' });
  const head = h('tr', {}, h('th', { text: 'θ' }), angles.map((a) => h('th', {}, texSpan(a === 0 ? '0' : `${a}^\\circ`))));
  const rad = h('tr', {}, h('th', { text: t('trig.radians') }), angles.map((a) => h('td', {}, texSpan(a === 0 ? '0' : `\\frac{\\pi}{${180 / a}}`.replace('\\frac{\\pi}{1}', '\\pi')))));
  tbl.append(h('thead', {}, head), h('tbody', {}, rad, ['sin', 'cos', 'tan'].map((f) => h('tr', {}, h('th', { text: `${f} θ` }), angles.map((a) => h('td', {}, EXACT[a][f] ? texSpan(EXACT[a][f][0]) : t('trig.undef')))))));
  p.append(h('div', { class: 'card table-scroll' }, tbl), h('p', { class: 'help', text: t('trig.tableHelp') }));
}
