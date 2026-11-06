// Physics (16.8): SUVAT for constant acceleration (any three of five, both
// answers when there are two), V = IR with power (any two of four), and the
// density, pressure and wave equations (any two of three). SI units.

import { h, clear } from '../ui.js';
import { t } from '../i18n/index.js';
import { renderTex } from '../mathrender.js';
import { suvat } from '../core/science.js';
import { toolPage, numField, outList, message, fmt, record, tabbed, ok, tabs } from './kit.js';

export function create() {
  const { root, body } = toolPage('physics');
  const tb = tabbed([['suvat', 'SUVAT'], ['elec', t('ph.elec')], ['density', t('ph.density')], ['pressure', t('ph.pressure')], ['waves', t('ph.waves')]], {
    suvat: suvatPanel,
    elec: elecPanel,
    density: (p) => triple(p, 'density', [['rho', 'ρ', t('ph.densityQ'), 'kg/m³'], ['m', 'm', t('ph.mass'), 'kg'], ['V', 'V', t('ph.volume'), 'm³']], { rho: (v) => v.m / v.V, m: (v) => v.rho * v.V, V: (v) => v.m / v.rho }, '\\rho = \\frac{m}{V}'),
    pressure: (p) => triple(p, 'pressure', [['p', 'p', t('ph.pressureQ'), 'Pa'], ['F', 'F', t('ph.force'), 'N'], ['A', 'A', t('ph.area'), 'm²']], { p: (v) => v.F / v.A, F: (v) => v.p * v.A, A: (v) => v.F / v.p }, 'p = \\frac{F}{A}'),
    waves: (p) => triple(p, 'waves', [['v', 'v', t('ph.waveSpeed'), 'm/s'], ['f', 'f', t('ph.frequency'), 'Hz'], ['l', 'λ', t('ph.wavelength'), 'm']], { v: (x) => x.f * x.l, f: (x) => x.v / x.l, l: (x) => x.v / x.f }, 'v = f\\lambda', (x) => [[t('ph.period'), `${fmt(1 / x.f, 8)} s`]]),
  });
  body.append(tb.el, h('p', { class: 'help', text: t('ph.formulasLink') }));
  return { root };
}

const formula = (tex) => { const el = h('div', { class: 'fm-big' }); renderTex(el, tex, { display: true }); return el; };

function suvatPanel(p) {
  const names = { s: [t('ph.displacement'), 'm'], u: [t('ph.initialV'), 'm/s'], v: [t('ph.finalV'), 'm/s'], a: [t('ph.accel'), 'm/s²'], t: [t('ph.time'), 's'] };
  const f = Object.fromEntries(Object.entries(names).map(([k, [n, u]]) => [k, numField(`${k} · ${n}`, { unit: u, onInput: up })]));
  f.u.set('0'); f.a.set('9.8'); f.t.set('3');
  const warn = message('warn');
  const host = h('div', { class: 'panel' });
  p.append(h('div', { class: 'card panel' }, formula('\\begin{aligned} v &= u + at & s &= ut + \\tfrac{1}{2}at^2 \\\\ v^2 &= u^2 + 2as & s &= \\tfrac{1}{2}(u + v)t \\end{aligned}'),
    h('div', { class: 'tool-grid' }, Object.values(f).map((x) => x.el)), h('p', { class: 'help', text: t('ph.suvatHelp') }),
    h('button', { class: 'btn sm ghost', type: 'button', on: { click: () => { Object.values(f).forEach((x) => x.set('')); up(); } } }, t('common.clear'))), warn.el, host);
  function up() {
    warn.set('');
    clear(host);
    const k = {};
    for (const [key, x] of Object.entries(f)) {
      const v = x.get();
      if (v === null) { warn.set(t('stats.badValue', { v: x.input.value })); return; }
      if (ok(v)) k[key] = v;
    }
    const n = Object.keys(k).length;
    if (n < 3) { if (n) warn.set(t('ph.needThree')); return; }
    if (n > 3) { warn.set(t('ph.onlyThree')); return; }
    const r = suvat(k);
    if (r.error) { warn.set(t(r.error === 'nosolution' ? 'ph.noSolution' : 'ph.needThree')); return; }
    const views = r.solutions.map((sol) => {
      const out = outList();
      out.set(Object.keys(names).map((key) => [`${key} · ${names[key][0]}`, `${fmt(sol[key], 8)} ${names[key][1]}`, { big: !(key in k) }]));
      const eqs = h('p', { class: 'help', text: `${t('ph.used')}: ${sol.eq.join(';  ')}` });
      return h('div', { class: 'panel' }, out.el, eqs);
    });
    if (views.length > 1) {
      host.append(h('p', { class: 'note-box', text: t('ph.twoAnswers') }));
      const tb = tabs(views.map((_, i) => [String(i), t('ph.answerN', { n: i + 1 })]), (id) => views.forEach((v, i) => { v.hidden = String(i) !== id; }));
      host.append(tb.el, ...views);
      tb.select('0');
    } else host.append(views[0]);
    const sol = r.solutions[0];
    record('physics', `SUVAT ${Object.entries(k).map(([a, b]) => `${a}=${fmt(b, 6)}`).join(', ')}`, Object.keys(names).filter((x) => !(x in k)).map((x) => `${x}=${fmt(sol[x], 6)}`).join(', '));
  }
  up();
}

function elecPanel(p) {
  const defs = { V: [t('ph.pd'), 'V'], I: [t('ph.current'), 'A'], R: [t('ph.resistance'), 'Ω'], P: [t('ph.power'), 'W'] };
  const f = Object.fromEntries(Object.entries(defs).map(([k, [n, u]]) => [k, numField(`${k} · ${n}`, { unit: u, onInput: up })]));
  f.V.set('12'); f.R.set('4');
  const warn = message('warn');
  const out = outList();
  p.append(h('div', { class: 'card panel' }, formula('V = IR \\qquad P = IV = I^2R = \\frac{V^2}{R}'), h('div', { class: 'tool-grid' }, Object.values(f).map((x) => x.el)),
    h('p', { class: 'help', text: t('ph.anyTwo') }), h('button', { class: 'btn sm ghost', type: 'button', on: { click: () => { Object.values(f).forEach((x) => x.set('')); up(); } } }, t('common.clear'))), warn.el, out.el);
  function up() {
    warn.set('');
    const k = {};
    for (const [key, x] of Object.entries(f)) { const v = x.get(); if (v === null) { warn.set(t('stats.badValue', { v: x.input.value })); out.set([]); return; } if (ok(v)) k[key] = v; }
    const keys = Object.keys(k).sort().join('');
    if (Object.keys(k).length !== 2) { out.set([]); if (Object.keys(k).length > 2) warn.set(t('ph.onlyTwo')); return; }
    if (Object.values(k).some((v) => v <= 0)) { warn.set(t('ph.positive')); out.set([]); return; }
    const { V, I, R, P } = k;
    const all = {
      IV: () => ({ V, I, R: V / I, P: V * I }), RV: () => ({ V, R, I: V / R, P: (V * V) / R }), PV: () => ({ V, P, I: P / V, R: (V * V) / P }),
      IR: () => ({ I, R, V: I * R, P: I * I * R }), IP: () => ({ I, P, V: P / I, R: P / (I * I) }), PR: () => ({ P, R, I: Math.sqrt(P / R), V: Math.sqrt(P * R) }),
    }[keys]();
    out.set(Object.keys(defs).map((key) => [`${key} · ${defs[key][0]}`, `${fmt(all[key], 8)} ${defs[key][1]}`, { big: !(key in k) }]));
    record('physics', Object.entries(k).map(([a, b]) => `${a}=${fmt(b, 6)}`).join(', '), Object.keys(defs).filter((x) => !(x in k)).map((x) => `${x}=${fmt(all[x], 6)} ${defs[x][1]}`).join(', '));
  }
  up();
}

// Any two of three quantities related by one formula.
function triple(p, id, vars, solvers, tex, extra) {
  const f = Object.fromEntries(vars.map(([k, sym, n, u]) => [k, numField(`${sym} · ${n}`, { unit: u, onInput: up })]));
  const warn = message('warn');
  const out = outList();
  p.append(h('div', { class: 'card panel' }, formula(tex), h('div', { class: 'tool-grid' }, Object.values(f).map((x) => x.el)), h('p', { class: 'help', text: t('ph.leaveOne') })), warn.el, out.el);
  function up() {
    warn.set('');
    const k = {};
    for (const [key, x] of Object.entries(f)) { const v = x.get(); if (v === null) { warn.set(t('stats.badValue', { v: x.input.value })); out.set([]); return; } if (ok(v)) k[key] = v; }
    const missing = vars.map((v) => v[0]).filter((x) => !(x in k));
    if (missing.length !== 1) { out.set([]); if (!missing.length) warn.set(t('ph.leaveOne')); return; }
    const m = missing[0];
    const val = solvers[m](k);
    if (!Number.isFinite(val)) { warn.set(t('err.divzero')); out.set([]); return; }
    const all = { ...k, [m]: val };
    const v = vars.find((x) => x[0] === m);
    out.set([[`${v[1]} · ${v[2]}`, `${fmt(val, 8)} ${v[3]}`, { big: true }], ...(extra ? extra(all) : [])]);
    record('physics', `${tex.replace(/\\[a-z]+|[{}]/g, '')}: ${Object.entries(k).map(([a, b]) => `${a}=${fmt(b, 6)}`).join(', ')}`, `${v[1]} = ${fmt(val, 8)} ${v[3]}`);
  }
  up();
}
