// Vectors in 2D and 3D: magnitude, unit vector, sum, difference, dot and
// cross product, angle, projection, parallelogram/triangle area, with a
// live drawing for 2D vectors.

import { h } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { cssVar } from '../scheduler.js';
import { toolPage, outList, message, fmt, record, fieldRow, numField, ok, section } from './kit.js';

const vtxt = (v) => `(${v.map((x) => fmt(x, 6)).join(', ')})`;
const mag = (v) => Math.hypot(...v);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function create() {
  const { root, body } = toolPage('vectors');
  const s = store.get('vectors', {});
  const f = (k, label, v) => numField(label, { value: s[k] ?? v, onInput: up });
  const ax = f('ax', 'a₁', '3'), ay = f('ay', 'a₂', '4'), az = f('az', 'a₃', '0');
  const bx = f('bx', 'b₁', '1'), by = f('by', 'b₂', '2'), bz = f('bz', 'b₃', '2');
  const warn = message('warn'), out = outList();
  const canvas = h('canvas', { class: 'vec-canvas', role: 'img', 'aria-label': t('vec.drawing') });
  body.append(
    h('div', { class: 'card panel' }, h('h3', { class: 'section-title', text: t('vec.a') }), fieldRow(ax, ay, az), h('h3', { class: 'section-title', text: t('vec.b') }), fieldRow(bx, by, bz),
      h('p', { class: 'help', text: t('vec.help') })),
    warn.el, out.el, section(t('vec.drawing'), canvas));

  function draw(a, b) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 320, hh = 260;
    canvas.width = w * dpr; canvas.height = hh * dpr; canvas.style.height = `${hh}px`;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const flat = a[2] === 0 && b[2] === 0;
    if (!flat) { g.fillStyle = cssVar('--text-2'); g.font = '13px system-ui'; g.fillText(t('vec.only2d'), 12, 24); return; }
    const pts = [a, b, [a[0] + b[0], a[1] + b[1]], [0, 0]];
    const m = Math.max(1, ...pts.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])))) * 1.2;
    const sc = Math.min(w, hh) / 2 / m, cx = w / 2, cy = hh / 2;
    const X = (x) => cx + x * sc, Y = (y) => cy - y * sc;
    g.strokeStyle = cssVar('--grid-major'); g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, cy); g.lineTo(w, cy); g.moveTo(cx, 0); g.lineTo(cx, hh); g.stroke();
    const arrow = (x0, y0, x1, y1, col, label, dash) => {
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.5; g.setLineDash(dash ? [6, 5] : []);
      g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); g.setLineDash([]);
      const ang = Math.atan2(Y(y1) - Y(y0), X(x1) - X(x0));
      g.beginPath(); g.moveTo(X(x1), Y(y1));
      g.lineTo(X(x1) - 10 * Math.cos(ang - 0.4), Y(y1) - 10 * Math.sin(ang - 0.4));
      g.lineTo(X(x1) - 10 * Math.cos(ang + 0.4), Y(y1) - 10 * Math.sin(ang + 0.4)); g.closePath(); g.fill();
      g.font = '600 13px system-ui'; g.fillText(label, X(x1) + 6, Y(y1) - 6);
    };
    arrow(a[0], a[1], a[0] + b[0], a[1] + b[1], cssVar('--g10'), '', true);
    arrow(0, 0, a[0] + b[0], a[1] + b[1], cssVar('--g3'), 'a + b');
    arrow(0, 0, a[0], a[1], cssVar('--g1'), 'a');
    arrow(0, 0, b[0], b[1], cssVar('--g2'), 'b');
  }

  function up() {
    const keys = { ax, ay, az, bx, by, bz };
    store.set('vectors', Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.input.value])));
    const val = (fld) => { const v = fld.get(); return Number.isNaN(v) ? 0 : v; };
    const a = [val(ax), val(ay), val(az)], b = [val(bx), val(by), val(bz)];
    warn.set('');
    if (!ok(...a, ...b)) { warn.set(t('vec.bad')); out.set([]); return; }
    const ma = mag(a), mb = mag(b), d = dot(a, b), c = cross(a, b);
    const ang = ma && mb ? Math.acos(Math.max(-1, Math.min(1, d / (ma * mb)))) : NaN;
    const unit = (v, m) => (m ? vtxt(v.map((x) => x / m)) : '—');
    const proj = mb ? b.map((x) => (x * d) / (mb * mb)) : null;
    out.set([
      ['|a|', fmt(ma), { big: true }], ['|b|', fmt(mb)],
      [t('vec.unitA'), unit(a, ma)],
      ['a + b', vtxt(a.map((x, i) => x + b[i]))], ['a − b', vtxt(a.map((x, i) => x - b[i]))],
      [t('vec.dot'), fmt(d)], [t('vec.cross'), vtxt(c)],
      [t('vec.angle'), Number.isFinite(ang) ? `${fmt((ang * 180) / Math.PI, 6)}° = ${fmt(ang, 6)} rad` : '—'],
      [t('vec.relation'), Math.abs(d) < 1e-12 ? t('vec.perp') : mag(c) < 1e-12 ? t('vec.parallel') : t('vec.neither')],
      [t('vec.proj'), proj ? vtxt(proj) : '—'], [t('vec.scalarProj'), mb ? fmt(d / mb) : '—'],
      [t('vec.para'), fmt(mag(c))], [t('vec.tri'), fmt(mag(c) / 2)],
      [t('vec.dist'), fmt(mag(a.map((x, i) => x - b[i])))],
    ]);
    draw(a, b);
    record('vectors', `a=${vtxt(a)}, b=${vtxt(b)}`, `a·b = ${fmt(d)}, angle ${Number.isFinite(ang) ? fmt((ang * 180) / Math.PI, 5) + '°' : '—'}`);
  }
  requestAnimationFrame(up);
  window.addEventListener('resize', () => { if (root.isConnected) up(); });
  return { root, show: () => requestAnimationFrame(up) };
}
