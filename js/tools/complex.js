// Complex numbers: z and w in rectangular or polar form; sum, difference,
// product, quotient, powers, roots, modulus, argument, conjugate and an
// Argand diagram.

import { h, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { app } from '../bus.js';
import { cssVar } from '../scheduler.js';
import { toolPage, outList, message, fmt, record, fieldRow, numField, ok, section } from './kit.js';

const C = (re, im) => ({ re, im });
const add = (a, b) => C(a.re + b.re, a.im + b.im), sub = (a, b) => C(a.re - b.re, a.im - b.im);
const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const abs = (a) => Math.hypot(a.re, a.im), arg = (a) => Math.atan2(a.im, a.re);
const clean = (x) => (Math.abs(x) < 1e-12 ? 0 : x);
export function ctext(z) {
  const re = clean(z.re), im = clean(z.im);
  if (!Number.isFinite(re) || !Number.isFinite(im)) return '—';
  if (im === 0) return fmt(re);
  const ip = Math.abs(im) === 1 ? 'i' : `${fmt(Math.abs(im))}i`;
  if (re === 0) return `${im < 0 ? '−' : ''}${ip}`;
  return `${fmt(re)} ${im < 0 ? '−' : '+'} ${ip}`;
}

export function create() {
  const { root, body } = toolPage('complex');
  const s = store.get('complex', {});
  let form = s.form || 'rect';
  const zr = numField('Re z', { value: s.zr ?? '2', onInput: up }), zi = numField('Im z', { value: s.zi ?? '3', onInput: up });
  const wr = numField('Re w', { value: s.wr ?? '1', onInput: up }), wi = numField('Im w', { value: s.wi ?? '-1', onInput: up });
  const pw = numField(t('cx.power'), { value: s.n ?? '3', inputmode: 'numeric', onInput: up });
  const formSeg = seg([['rect', t('cx.rect')], ['polar', t('cx.polar')]], form, (v) => { form = v; relabel(); up(); }, t('cx.form'));
  const warn = message('warn'), out = outList(), roots = outList();
  const canvas = h('canvas', { class: 'vec-canvas', role: 'img', 'aria-label': t('cx.argand') });
  body.append(h('div', { class: 'card panel' }, formSeg, fieldRow(zr, zi), fieldRow(wr, wi), fieldRow(pw), h('p', { class: 'help', text: t('cx.help') })),
    warn.el, out.el, section(t('cx.roots'), roots.el), section(t('cx.argand'), canvas));

  function relabel() {
    const deg = app.settings.angle === 'deg';
    const lab = (f, txt) => { f.el.querySelector('label').textContent = txt; };
    if (form === 'rect') { lab(zr, 'Re z'); lab(zi, 'Im z'); lab(wr, 'Re w'); lab(wi, 'Im w'); }
    else { lab(zr, '|z|'); lab(zi, `arg z (${deg ? '°' : 'rad'})`); lab(wr, '|w|'); lab(wi, `arg w (${deg ? '°' : 'rad'})`); }
  }
  const toAng = (x) => (app.settings.angle === 'deg' ? (x * Math.PI) / 180 : x);
  const fromAng = (x) => (app.settings.angle === 'deg' ? `${fmt((x * 180) / Math.PI, 6)}°` : `${fmt(x, 6)} rad`);
  const polarText = (z) => `${fmt(abs(z), 6)} ∠ ${fromAng(arg(z))}`;

  function draw(pts) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 320, hh = 260;
    canvas.width = w * dpr; canvas.height = hh * dpr; canvas.style.height = `${hh}px`;
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
    const m = Math.max(1, ...pts.map(([z]) => Math.max(Math.abs(z.re), Math.abs(z.im)))) * 1.25;
    const sc = Math.min(w, hh) / 2 / m, cx = w / 2, cy = hh / 2;
    g.strokeStyle = cssVar('--grid-major'); g.beginPath(); g.moveTo(0, cy); g.lineTo(w, cy); g.moveTo(cx, 0); g.lineTo(cx, hh); g.stroke();
    g.fillStyle = cssVar('--text-2'); g.font = '11px system-ui'; g.fillText('Re', w - 22, cy - 6); g.fillText('Im', cx + 6, 14);
    for (const [z, col, label] of pts) {
      if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) continue;
      const x = cx + z.re * sc, y = cy - z.im * sc;
      g.strokeStyle = col; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
      g.font = '600 12px system-ui'; g.fillText(label, x + 7, y - 7);
    }
  }

  function up() {
    store.set('complex', { form, zr: zr.input.value, zi: zi.input.value, wr: wr.input.value, wi: wi.input.value, n: pw.input.value });
    warn.set('');
    const g = (f) => { const v = f.get(); return Number.isNaN(v) ? 0 : v; };
    const A = g(zr), B = g(zi), P = g(wr), Q = g(wi), N = pw.get();
    if (!ok(A, B, P, Q)) { warn.set(t('vec.bad')); out.set([]); return; }
    const z = form === 'rect' ? C(A, B) : C(A * Math.cos(toAng(B)), A * Math.sin(toAng(B)));
    const w = form === 'rect' ? C(P, Q) : C(P * Math.cos(toAng(Q)), P * Math.sin(toAng(Q)));
    const rows = [
      ['z', ctext(z), { big: true }], [t('cx.polarZ'), polarText(z)], ['|z|', fmt(abs(z))], ['arg z', fromAng(arg(z))], ['z̄', ctext(C(z.re, -z.im))],
      ['w', ctext(w)], ['z + w', ctext(add(z, w))], ['z − w', ctext(sub(z, w))], ['z × w', ctext(mul(z, w))],
      ['z ÷ w', abs(w) ? ctext(div(z, w)) : t('err.divzero')], ['z²', ctext(mul(z, z))], ['1/z', abs(z) ? ctext(div(C(1, 0), z)) : t('err.divzero')],
      ['e^z', ctext(C(Math.exp(z.re) * Math.cos(z.im), Math.exp(z.re) * Math.sin(z.im)))],
    ];
    const rs = [];
    if (ok(N) && Number.isInteger(N) && N >= 1 && N <= 24) {
      const r = abs(z) ** N, th = arg(z) * N;
      rows.push([`zⁿ (n = ${N})`, ctext(C(r * Math.cos(th), r * Math.sin(th)))]);
      const rr = abs(z) ** (1 / N);
      for (let k = 0; k < N; k++) { const a = (arg(z) + 2 * Math.PI * k) / N; rs.push([`k = ${k}`, ctext(C(rr * Math.cos(a), rr * Math.sin(a)))]); }
    }
    out.set(rows);
    roots.set(rs.length ? [[t('cx.rootsOf', { n: N }), ''], ...rs] : []);
    draw([[z, cssVar('--g1'), 'z'], [w, cssVar('--g2'), 'w'], [mul(z, w), cssVar('--g3'), 'zw'], [add(z, w), cssVar('--g5'), 'z+w']]);
    record('complex', `z = ${ctext(z)}, w = ${ctext(w)}`, `zw = ${ctext(mul(z, w))}`);
  }
  relabel();
  requestAnimationFrame(up);
  return { root, show: () => requestAnimationFrame(up) };
}
