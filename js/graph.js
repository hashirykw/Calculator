// Graphing studio (section 11). Functions, relations, polar, parametric,
// inequalities, points, vertical lines and vector fields; automatic sliders;
// trace, key points, derivative/area/tangent overlays; adaptive sampling with
// asymptote breaks; HiDPI; redraw only when something changes.

import { h, icon, clear, toast, iconButton, openSheet, button, numInput, field, seg, shareOrCopy, downloadBlob, debounce } from './ui.js';
import { t } from './i18n/index.js';
import { bus, app } from './bus.js';
import { store } from './store.js';
import { scheduler, fitCanvas, cssVar } from './scheduler.js';
import { reducedMotion } from './prefs.js';
import { parse, freeVars, strip } from './core/parse.js';
import { compile } from './core/compile.js';
import { findRoots, simpson } from './core/numeric.js';
import { fmtNum } from './core/format.js';

const MAX = 10;
const AXIS_VARS = new Set(['x', 'y', 't', 'theta', 'r', 'z']);
const DEFAULT_VIEW = { cx: 0, cy: 0, scale: 0.05 };   // scale = world units per CSS pixel
const ID = 'graph';

let state, items = [];
let canvas, ctx, wrap, panel, listEl, slidersEl, tipEl, descEl, toolsEl, modeSeg;
let size = { w: 0, h: 0, dpr: 1 };
let tracePt = null;
let demoT = 0;
let mode3d = null;
const save = debounce(() => store.set('graph', serialize()), 400);

// ---------- state ----------
function blankState() {
  return { exprs: [], sliders: {}, view: { ...DEFAULT_VIEW }, trace: false, points: false, square: true, pi: false, deg: false };
}
function serialize() {
  return {
    exprs: state.exprs.map(({ text, color, visible, style, range, overlays }) => ({ text, color, visible, style, range, overlays })),
    sliders: state.sliders, view: state.view, points: state.points, square: state.square, pi: state.pi, deg: state.deg,
  };
}
function load(saved) {
  const s = blankState();
  if (saved && typeof saved === 'object') {
    if (Array.isArray(saved.exprs)) s.exprs = saved.exprs.slice(0, MAX).filter((e) => e && typeof e.text === 'string').map((e, i) => newExpr(e.text, e, i));
    if (saved.sliders && typeof saved.sliders === 'object') s.sliders = saved.sliders;
    if (saved.view && Number.isFinite(saved.view.scale) && saved.view.scale > 0) s.view = saved.view;
    for (const k of ['points', 'square', 'pi', 'deg']) if (typeof saved[k] === 'boolean') s[k] = saved[k];
  }
  return s;
}
function newExpr(text, opts = {}, i = 0) {
  return {
    id: Math.random().toString(36).slice(2, 9), text, color: Number.isInteger(opts.color) ? opts.color : i % 10,
    visible: opts.visible !== false, style: opts.style || 'solid',
    range: opts.range || null, overlays: opts.overlays || {},
  };
}

// ---------- understanding expressions ----------
function splitTop(s, sep = ',') {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
function tuples(text) {
  const parts = splitTop(text, ',');
  // "(1,2), (3,4)" -> split at top level gives "(1,2)" pieces
  const tup = [];
  for (const p of parts) {
    const m = /^\((.*)\)$/s.exec(p);
    if (!m) return null;
    const inner = splitTop(m[1], ',');
    if (inner.length !== 2) return null;
    tup.push(inner);
  }
  return tup.length ? tup : null;
}

const has = (tree, v) => freeVars(tree).has(v);
const paramsOf = (...trees) => {
  const s = new Set();
  trees.forEach((tr) => freeVars(tr).forEach((v) => { if (!AXIS_VARS.has(v) && v !== 'Ans' && v !== 'M') s.add(v); }));
  return [...s];
};

function analyse(e) {
  const text = e.text.trim();
  if (!text) return { kind: 'empty' };
  try {
    // tuples: points or parametric
    if (text.startsWith('(')) {
      const tup = tuples(text);
      if (tup) {
        const trees = tup.flat().map((s) => strip(parse(s)));
        const params = paramsOf(...trees);
        const usesT = trees.some((tr) => has(tr, 't'));
        if (usesT && tup.length === 1) {
          const vars = ['t', ...params];
          return { kind: 'param', fx: compile(trees[0], { vars, deg: state.deg }), fy: compile(trees[1], { vars, deg: state.deg }), params };
        }
        const vars = [...params];
        const pts = tup.map((_, i) => [compile(trees[2 * i], { vars }), compile(trees[2 * i + 1], { vars })]);
        return { kind: 'points', pts, params };
      }
    }
    // "f(x) = ..." definitions plot as functions
    const def = /^\s*[a-zA-Z]\s*\(\s*x\s*\)\s*=(.*)$/.exec(text);
    const tree = strip(parse(def ? def[1] : text));
    if (def) return fn(tree);
    if (tree.type === 'call' && tree.name === 'field') {
      if (tree.args.length !== 2) throw Object.assign(new Error(), { code: 'argcount' });
      const params = paramsOf(...tree.args);
      const vars = ['x', 'y', ...params];
      return { kind: 'field', P: compile(tree.args[0], { vars, deg: state.deg }), Q: compile(tree.args[1], { vars, deg: state.deg }), params };
    }
    if (tree.type === 'rel') {
      const [L, R] = tree.args;
      const isSym = (n, v) => n.type === 'sym' && n.name === v;
      if (tree.op === '=') {
        if (isSym(L, 'y') && !has(R, 'y')) return fn(R);
        if (isSym(R, 'y') && !has(L, 'y')) return fn(L);
        if (isSym(L, 'r')) return polar(R);
        if (isSym(L, 'z')) return surface(R);
        if (isSym(L, 'x') && !has(R, 'x') && !has(R, 'y')) {
          const params = paramsOf(R);
          return { kind: 'vline', c: compile(R, { vars: params }), params };
        }
        return implicit({ type: 'op', op: '-', args: [L, R] }, null);
      }
      if (tree.op === '!=') throw Object.assign(new Error(), { code: 'parse' });
      if (isSym(L, 'y') && !has(R, 'y')) return { ...fn(R), kind: 'ineq', op: tree.op };
      if (isSym(R, 'y') && !has(L, 'y')) return { ...fn(L), kind: 'ineq', op: flip(tree.op) };
      return implicit({ type: 'op', op: '-', args: [L, R] }, tree.op);
    }
    if (has(tree, 'x') && has(tree, 'y')) return surface(tree);
    if (has(tree, 'theta') && !has(tree, 'x')) return polar(tree);
    if (has(tree, 'y') && !has(tree, 'x')) return implicit(tree, null);
    return fn(tree);
  } catch (err) {
    return { kind: 'error', code: err.code || 'parse', info: err.info || {} };
  }
}
const flip = (op) => ({ '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[op]);
function fn(tree) {
  const params = paramsOf(tree);
  const base = compile(tree, { vars: ['x', ...params], deg: state.deg });
  return { kind: 'function', base, params, tree };
}
function polar(tree) {
  const params = paramsOf(tree);
  const v = has(tree, 'theta') ? 'theta' : 't';
  return { kind: 'polar', base: compile(tree, { vars: [v, ...params], deg: state.deg }), params };
}
function implicit(tree, op) {
  const params = paramsOf(tree);
  return { kind: op ? 'region' : 'implicit', F: compile(tree, { vars: ['x', 'y', ...params], deg: state.deg }), params, op };
}
function surface(tree) {
  const params = paramsOf(tree);
  return { kind: 'surface', base: compile(tree, { vars: ['x', 'y', ...params], deg: state.deg }), params, tree };
}

function rebuild() {
  items = state.exprs.map((e) => ({ e, ...analyse(e) }));
  // sliders for every free letter
  const needed = new Set();
  items.forEach((it) => (it.params || []).forEach((p) => needed.add(p)));
  for (const p of needed) {
    if (!state.sliders[p]) {
      const intLike = p === 'n' || p === 'k' || p === 'm';
      state.sliders[p] = intLike ? { value: 5, min: 1, max: 25, step: 1 } : { value: 1, min: -10, max: 10, step: 0.1 };
    }
  }
  for (const p of Object.keys(state.sliders)) if (!needed.has(p)) delete state.sliders[p];
  // bind slider values
  items.forEach((it) => {
    const pv = () => (it.params || []).map((p) => state.sliders[p].value);
    if (it.kind === 'function' || it.kind === 'ineq') {
      const env = [0];
      it.f = (x) => { env[0] = x; const v = pv(); for (let i = 0; i < v.length; i++) env[i + 1] = v[i]; return it.base(env); };
    } else if (it.kind === 'polar') {
      const env = [0];
      it.r = (th) => { env[0] = th; pv().forEach((v, i) => { env[i + 1] = v; }); return it.base(env); };
    } else if (it.kind === 'implicit' || it.kind === 'region' || it.kind === 'field' || it.kind === 'surface') {
      const env = [0, 0];
      const g = it.F || it.base;
      it.G = (x, y) => { env[0] = x; env[1] = y; pv().forEach((v, i) => { env[i + 2] = v; }); return g(env); };
      if (it.kind === 'field') {
        const env2 = [0, 0];
        it.PQ = (x, y) => { env2[0] = x; env2[1] = y; pv().forEach((v, i) => { env2[i + 2] = v; }); return [it.P(env2), it.Q(env2)]; };
      }
    } else if (it.kind === 'param') {
      const env = [0];
      it.xy = (tt) => { env[0] = tt; pv().forEach((v, i) => { env[i + 1] = v; }); return [it.fx(env), it.fy(env)]; };
    } else if (it.kind === 'vline') {
      it.xv = () => it.c(pv());
    } else if (it.kind === 'points') {
      it.coords = () => { const v = pv(); return it.pts.map(([fx, fy]) => [fx(v), fy(v)]); };
    }
  });
  renderPanel();
  invalidate();
  updateDescription();
}

// ---------- view transform ----------
const W = () => size.w, H = () => size.h;
const sx = () => state.view.scale, sy = () => (state.square ? state.view.scale : state.view.scaleY || state.view.scale);
const toPx = (x) => (x - state.view.cx) / sx() + W() / 2;
const toPy = (y) => H() / 2 - (y - state.view.cy) / sy();
const toWx = (px) => (px - W() / 2) * sx() + state.view.cx;
const toWy = (py) => (H() / 2 - py) * sy() + state.view.cy;
const bounds = () => ({ xmin: toWx(0), xmax: toWx(W()), ymin: toWy(H()), ymax: toWy(0) });

function invalidate() { scheduler.invalidate(ID); if (mode3d && mode3d.visible) mode3d.update(); save(); }

// ---------- mount ----------
export async function mount(el) {
  state = load(store.get('graph'));
  canvas = h('canvas', { tabindex: '0', role: 'img', 'aria-label': t('graph.textAlt'), 'aria-describedby': 'graph-desc' });
  tipEl = h('div', { class: 'trace-tip', hidden: true });
  descEl = h('div', { class: 'sr-only', id: 'graph-desc', 'aria-live': 'polite' });
  modeSeg = seg([['2d', t('graph.mode2d')], ['3d', t('graph.mode3d')]], '2d', (v) => setMode(v), t('graph.mode3d'));
  const top = h('div', { class: 'graph-topbar' }, modeSeg, button(t('graph.examples'), openExamples, { cls: 'btn sm', iconName: 'bulb' }));
  toolsEl = h('div', { class: 'graph-tools' });
  wrap = h('div', { class: 'graph-canvas-wrap' }, canvas, top, toolsEl, tipEl, descEl);
  listEl = h('div', { class: 'panel', style: { gap: '6px' } });
  slidersEl = h('div', { class: 'panel', style: { gap: '2px' } });
  panel = h('div', { class: 'graph-panel' }, listEl, slidersEl, h('div', { class: 'graph-menu' },
    button(t('graph.add'), () => addExpr(''), { cls: 'btn sm', iconName: 'plus' }),
    button(t('graph.window'), openWindow, { cls: 'btn sm', iconName: 'fit' }),
    button(t('graph.table'), () => openTable(), { cls: 'btn sm', iconName: 'table' }),
    button(t('graph.export'), exportPng, { cls: 'btn sm', iconName: 'imagedown' }),
    button(t('graph.share'), shareLink, { cls: 'btn sm', iconName: 'link' }),
    button(t('graph.textAlt'), showDescription, { cls: 'btn sm', iconName: 'list' })));
  el.append(h('div', { class: 'graph' }, wrap, panel));
  ctx = canvas.getContext('2d');
  renderTools();
  scheduler.register(ID, draw, canvas);
  new ResizeObserver(() => { scheduler.invalidate(ID); }).observe(wrap);
  bindPointer();
  bus.on('settings', () => scheduler.invalidate(ID));
  await show(app.route);
}

export async function show(r) {
  scheduler.setVisible(ID, true);
  const q = r && r.query;
  if (q && q.get('g')) {
    try {
      const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(q.get('g').replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));
      state = load(json);
    } catch { /* bad link */ }
    history.replaceState(null, '', '#/graph');
  }
  if (app.pending && app.pending.graph) {
    const list = Array.isArray(app.pending.graph) ? app.pending.graph : [app.pending.graph];
    delete app.pending.graph;
    for (const text of list) {
      if (state.exprs.some((e) => e.text === text)) continue;
      if (state.exprs.length >= MAX) state.exprs.shift();
      state.exprs.push(newExpr(text, {}, state.exprs.length));
    }
    bus.emit('result', { kind: 'graph', input: list.join('; ') });
  }
  rebuild();
  // tools can send a window that fits their data, e.g. a scatter plot
  const pv = app.pending && app.pending.graphView;
  if (pv) {
    delete app.pending.graphView;
    if (pv.square === false) state.square = false;
    requestAnimationFrame(() => {
      const w = W() || 600, hh = H() || 400;
      state.view.cx = (pv.xmin + pv.xmax) / 2;
      state.view.cy = (pv.ymin + pv.ymax) / 2;
      const kx = (pv.xmax - pv.xmin) / w, ky = (pv.ymax - pv.ymin) / hh;
      if (state.square) state.view.scale = Math.max(kx, ky);
      else { state.view.scale = kx; state.view.scaleY = ky; }
      invalidate();
    });
  }
  updateDemoLoop();
}
export function hide() { scheduler.setVisible(ID, false); scheduler.setLoop(ID, false); if (mode3d) mode3d.pause(); }
export function unmount() { scheduler.unregister(ID); }

// ---------- panel ----------
function colour(i) { return cssVar(`--g${(i % 10) + 1}`) || '#00C3F3'; }

function renderPanel() {
  clear(listEl);
  items.forEach((it, idx) => listEl.append(exprRow(it, idx)));
  if (!state.exprs.length) listEl.append(h('p', { class: 'small muted', text: t('graph.emptyDesc') }));
  renderSliders();
}

function exprRow(it, idx) {
  const e = it.e;
  const sw = h('button', {
    class: `swatch${e.visible ? '' : ' off'}`, type: 'button', style: { background: colour(e.color) },
    'aria-label': e.visible ? t('graph.hide') : t('graph.show'), 'aria-pressed': String(e.visible),
    on: { click: () => { e.visible = !e.visible; rebuild(); } },
  });
  const input = h('input', {
    value: e.text, 'aria-label': `${t('graph.add')} ${idx + 1}`, placeholder: t('graph.placeholder'), spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
    on: {
      input: debounce(() => { e.text = input.value; rebuild(); }, 250),
      change: () => { if (input.value.trim()) bus.emit('result', { kind: 'graph', input: input.value.trim() }); },
      keydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); if (idx === state.exprs.length - 1 && state.exprs.length < MAX) addExpr(''); } },
    },
  });
  const row = h('div', { class: 'expr-row' }, sw, input,
    iconButton('more', t('graph.options'), () => openOptions(it)),
    iconButton('close', t('graph.delete'), () => { state.exprs = state.exprs.filter((x) => x !== e); rebuild(); updateDemoLoop(); }));
  if (it.kind === 'error') row.append(h('div', { class: 'err', text: errorMsg(it) }));
  else if (it.kind === 'surface') row.append(h('div', { class: 'info', text: mode3d ? t('graph.kind.surface') : t('graph.need3d') }));
  else if (it.kind !== 'empty' && it.kind !== 'function') row.append(h('div', { class: 'info', text: t(`graph.kind.${kindKey(it.kind)}`) }));
  return row;
}
const kindKey = (k) => ({ region: 'ineq', ineq: 'ineq', param: 'param', vline: 'vline' }[k] || k);
function errorMsg(it) {
  if (it.code === 'undefinedvar') return t('err.undefinedvar', { name: it.info.name });
  if (it.code === 'unknownfn') return it.info.suggestion ? t('err.unknownfn', it.info) : t('err.unknownfnNo', it.info);
  if (it.code === 'notgraph') return t('err.notcalc');
  return t('err.parseNoPos');
}

function addExpr(text) {
  if (state.exprs.length >= MAX) { toast(t('graph.max')); return; }
  const used = new Set(state.exprs.map((x) => x.color));
  let c = 0;
  while (used.has(c) && c < 9) c++;
  state.exprs.push(newExpr(text, { color: c }));
  rebuild();
  updateDemoLoop();
  const inputs = listEl.querySelectorAll('input');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function renderSliders() {
  clear(slidersEl);
  for (const [name, sl] of Object.entries(state.sliders)) {
    const range = h('input', { type: 'range', min: String(sl.min), max: String(sl.max), step: String(sl.step), value: String(sl.value), 'aria-label': name });
    const val = h('button', { class: 'val btn ghost sm', type: 'button', text: fmtNum(sl.value, 4), title: t('graph.range'), on: { click: () => editSlider(name) } });
    range.addEventListener('input', () => { sl.value = Number(range.value); val.textContent = fmtNum(sl.value, 4); invalidate(); updateDescriptionSoon(); });
    const play = iconButton(sl.playing ? 'pause' : 'play', sl.playing ? t('graph.stop') : t('graph.play'), () => { sl.playing = !sl.playing; sl.dir = sl.dir || 1; renderSliders(); updateDemoLoop(); });
    slidersEl.append(h('div', { class: 'slider-row' }, h('span', { class: 'nm', text: name === 'theta' ? 'θ' : name }), range, val, play));
  }
}
function editSlider(name) {
  const sl = state.sliders[name];
  const mn = numInput(sl.min), mx = numInput(sl.max), st = numInput(sl.step);
  const s = openSheet({
    title: `${name}: ${t('graph.range')}`,
    body: h('div', { class: 'panel' }, h('div', { class: 'tool-grid' }, field(t('common.from'), mn), field(t('common.to'), mx), field(t('graph.step'), st)),
      button(t('graph.apply'), () => {
        const a = Number(mn.value), b = Number(mx.value), c = Number(st.value);
        if (Number.isFinite(a) && Number.isFinite(b) && a < b && c > 0) {
          Object.assign(sl, { min: a, max: b, step: c, value: Math.min(b, Math.max(a, sl.value)) });
          renderSliders(); invalidate();
        }
        s.close();
      }, { cls: 'btn primary' })),
  });
}

function renderTools() {
  clear(toolsEl);
  const tb = (name, label, fn, pressed) => {
    const b = iconButton(name, label, fn);
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(!!pressed));
    return b;
  };
  toolsEl.append(
    tb('zoomin', t('graph.zoomIn'), () => zoom(1 / 1.5)),
    tb('zoomout', t('graph.zoomOut'), () => zoom(1.5)),
    tb('fit', t('graph.fit'), fit),
    tb('home', t('graph.reset'), () => { state.view = { ...DEFAULT_VIEW }; invalidate(); }),
    tb('trace', t('graph.trace'), () => { state.trace = !state.trace; tracePt = null; tipEl.hidden = true; renderTools(); invalidate(); }, state.trace),
    tb('point', t('graph.points'), () => { state.points = !state.points; renderTools(); invalidate(); updateDescription(); }, state.points),
  );
}

// ---------- options for one expression ----------
function openOptions(it) {
  const e = it.e;
  const body = h('div', { class: 'panel' });
  const sw = h('div', { class: 'chips' });
  for (let i = 0; i < 10; i++) {
    sw.append(h('button', { class: 'swatch', type: 'button', style: { width: '32px', height: '32px', borderRadius: '6px', border: e.color === i ? '2px solid var(--text)' : '2px solid transparent', background: colour(i) }, 'aria-label': `${t('graph.colour')} ${i + 1}`, on: { click: () => { e.color = i; rebuild(); s.close(); } } }));
  }
  body.append(h('div', { class: 'label', text: t('graph.colour') }), sw);
  body.append(h('div', { class: 'label', text: t('graph.style') }), seg([['solid', t('graph.solid')], ['dashed', t('graph.dashed')], ['dotted', t('graph.dotted')]], e.style, (v) => { e.style = v; rebuild(); }, t('graph.style')));
  if (it.kind === 'function') {
    const ov = e.overlays;
    const tog = (key, label) => h('label', { class: 'set-row' }, h('span', { class: 'grow', text: label }),
      h('span', { class: 'switch' }, (() => { const c = h('input', { type: 'checkbox', on: { change: () => { ov[key] = c.checked ? (key === 'tangent' ? { x: 1 } : key === 'area' ? { a: 0, b: 2 } : true) : null; rebuild(); } } }); c.checked = !!ov[key]; return c; })()));
    body.append(tog('derivative', t('graph.derivative')), tog('tangent', t('graph.tangent')), tog('area', t('graph.area')));
    if (ov.area) {
      const a = numInput(ov.area.a), b = numInput(ov.area.b);
      const apply = () => { ov.area = { a: Number(a.value), b: Number(b.value) }; rebuild(); };
      a.addEventListener('change', apply); b.addEventListener('change', apply);
      body.append(h('div', { class: 'tool-grid' }, field(t('common.from'), a), field(t('common.to'), b)));
    }
    body.append(button(t('graph.table'), () => { s.close(); openTable(e); }, { cls: 'btn', iconName: 'table' }));
  }
  if (it.kind === 'param' || it.kind === 'polar') {
    const r = e.range || { min: 0, max: Number((2 * Math.PI).toFixed(6)) };
    const a = numInput(r.min), b = numInput(r.max);
    const apply = () => { e.range = { min: Number(a.value), max: Number(b.value) }; rebuild(); };
    a.addEventListener('change', apply); b.addEventListener('change', apply);
    body.append(h('div', { class: 'tool-grid' }, field(`${it.kind === 'polar' ? 'θ' : 't'} ${t('common.from')}`, a), field(t('common.to'), b)));
  }
  body.append(button(t('graph.delete'), () => { state.exprs = state.exprs.filter((x) => x !== e); rebuild(); s.close(); }, { cls: 'btn danger', iconName: 'close' }));
  const s = openSheet({ title: e.text || t('graph.options'), body });
}

// ---------- drawing ----------
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function draw(dt) {
  size = fitCanvas(canvas);
  if (!size.w || !size.h) return;
  animate(dt);
  render(ctx, size.w, size.h, size.dpr, false);
}

function animate(dt) {
  let any = false;
  for (const sl of Object.values(state.sliders)) {
    if (!sl.playing) continue;
    any = true;
    sl.dir = sl.dir || 1;
    sl.value += sl.dir * (sl.max - sl.min) * dt / 4;
    if (sl.value >= sl.max) { sl.value = sl.max; sl.dir = -1; }
    if (sl.value <= sl.min) { sl.value = sl.min; sl.dir = 1; }
    if (sl.step >= 1) sl.value = Math.round(sl.value);
  }
  if (any) { slidersEl.querySelectorAll('.slider-row').forEach((row, i) => { const sl = Object.values(state.sliders)[i]; if (!sl) return; row.querySelector('input').value = sl.value; row.querySelector('.val').textContent = fmtNum(sl.value, 4); }); }
  if (!state.exprs.length) demoT += dt;
}

function updateDemoLoop() {
  const playing = Object.values(state.sliders).some((s) => s.playing);
  const demo = !state.exprs.length && !reducedMotion();
  scheduler.setLoop(ID, playing || demo);
}

function render(c, w, hh, dpr, exporting) {
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = cssVar('--bg'), grid = cssVar('--grid'), gridMajor = cssVar('--grid-major'), axis = cssVar('--axis'), text2 = cssVar('--text-2');
  c.fillStyle = bg;
  c.fillRect(0, 0, w, hh);
  const saved = size;
  size = { w, h: hh, dpr };
  drawGrid(c, grid, gridMajor, axis, text2);
  // regions first, then curves, then overlays
  for (const it of items) if (it.e.visible && (it.kind === 'region' || it.kind === 'ineq')) drawRegion(c, it);
  for (const it of items) {
    if (!it.e.visible) continue;
    const col = colour(it.e.color);
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = 2.25;
    c.setLineDash(it.e.style === 'dashed' ? [8, 6] : it.e.style === 'dotted' ? [2, 5] : []);
    try {
      switch (it.kind) {
        case 'function': plotFn(c, it.f); overlays(c, it, col); break;
        case 'ineq': c.setLineDash(it.op === '<' || it.op === '>' ? [7, 5] : []); plotFn(c, it.f); break;
        case 'implicit': marching(c, it.G); break;
        case 'region': c.setLineDash(it.op === '<' || it.op === '>' ? [7, 5] : []); marching(c, it.G); break;
        case 'polar': plotParam(c, (th) => { const r = it.r(th); return [r * Math.cos(th), r * Math.sin(th)]; }, it.e.range || { min: 0, max: 2 * Math.PI }); break;
        case 'param': plotParam(c, it.xy, it.e.range || { min: 0, max: 2 * Math.PI }); break;
        case 'vline': { const px = toPx(it.xv()); c.beginPath(); c.moveTo(px, 0); c.lineTo(px, hh); c.stroke(); break; }
        case 'points': drawPoints(c, it.coords(), col); break;
        case 'field': drawField(c, it.PQ, col); break;
        default: break;
      }
    } catch { /* a bad expression shouldn't stop the others */ }
    c.setLineDash([]);
  }
  if (!state.exprs.length) drawDemo(c);
  if (state.points) drawKeyPoints(c);
  if (state.trace && tracePt && !exporting) drawTrace(c);
  size = saved;
}

function drawGrid(c, grid, gridMajor, axis, text2) {
  const { xmin, xmax, ymin, ymax } = bounds();
  const w = W(), hh = H();
  const piMode = state.pi;
  let stepX = niceStep(80 * sx());
  let stepY = niceStep(80 * sy());
  if (piMode) { const u = Math.PI / 2; stepX = u * Math.max(1, niceStep((80 * sx()) / u)); }
  const minorX = stepX / 5, minorY = stepY / 5;
  c.lineWidth = 1;
  c.strokeStyle = grid;
  c.beginPath();
  for (let x = Math.ceil(xmin / minorX) * minorX; x <= xmax; x += minorX) { const p = Math.round(toPx(x)) + 0.5; c.moveTo(p, 0); c.lineTo(p, hh); }
  for (let y = Math.ceil(ymin / minorY) * minorY; y <= ymax; y += minorY) { const p = Math.round(toPy(y)) + 0.5; c.moveTo(0, p); c.lineTo(w, p); }
  c.stroke();
  c.strokeStyle = gridMajor;
  c.beginPath();
  for (let x = Math.ceil(xmin / stepX) * stepX; x <= xmax; x += stepX) { const p = Math.round(toPx(x)) + 0.5; c.moveTo(p, 0); c.lineTo(p, hh); }
  for (let y = Math.ceil(ymin / stepY) * stepY; y <= ymax; y += stepY) { const p = Math.round(toPy(y)) + 0.5; c.moveTo(0, p); c.lineTo(w, p); }
  c.stroke();
  // axes
  const ax = Math.round(toPy(0)) + 0.5, ay = Math.round(toPx(0)) + 0.5;
  c.strokeStyle = axis;
  c.lineWidth = 1.25;
  c.beginPath();
  if (ax >= 0 && ax <= hh) { c.moveTo(0, ax); c.lineTo(w, ax); }
  if (ay >= 0 && ay <= w) { c.moveTo(ay, 0); c.lineTo(ay, hh); }
  c.stroke();
  // labels, kept inside the canvas when an axis is off-screen
  c.fillStyle = text2;
  c.font = '500 11px "Geist Mono", ui-monospace, monospace';
  const labelY = Math.min(hh - 6, Math.max(14, ax + 14));
  c.textAlign = 'center';
  let lastRight = -Infinity;
  for (let x = Math.ceil(xmin / stepX) * stepX; x <= xmax; x += stepX) {
    if (Math.abs(x) < stepX / 1e6) continue;
    const label = piMode ? piLabel(x) : fmtNum(x, 6);
    const px = toPx(x);
    const tw = c.measureText(label).width;
    if (px - tw / 2 < lastRight + 6) continue;
    c.fillText(label, px, labelY);
    lastRight = px + tw / 2;
  }
  c.textAlign = 'right';
  const labelX = Math.min(w - 4, Math.max(c.measureText('-0000').width + 6, ay - 6));
  for (let y = Math.ceil(ymin / stepY) * stepY; y <= ymax; y += stepY) {
    if (Math.abs(y) < stepY / 1e6) continue;
    const py = toPy(y);
    if (py < 10 || py > hh - 4) continue;
    c.fillText(fmtNum(y, 6), labelX, py + 4);
  }
}
function piLabel(x) {
  const k = Math.round((x / Math.PI) * 2);
  if (k === 0) return '0';
  if (k % 2 === 0) { const n = k / 2; return n === 1 ? 'π' : n === -1 ? '−π' : `${n}π`.replace('-', '−'); }
  return `${k === 1 ? '' : k === -1 ? '−' : k}π/2`.replace('-', '−');
}

// Adaptive sampling with discontinuity breaks.
function plotFn(c, f) {
  const w = W(), hh = H();
  const lim = hh * 4;
  c.beginPath();
  let pen = false;
  let px0 = 0, x0 = toWx(0), y0 = safe(f, x0);
  const line = (px, y) => {
    const py = toPy(y);
    if (!Number.isFinite(py)) { pen = false; return; }
    const cy = Math.max(-lim, Math.min(hh + lim, py));
    if (pen) c.lineTo(px, cy); else { c.moveTo(px, cy); pen = true; }
  };
  if (Number.isFinite(y0)) line(0, y0);
  const step = 1.25;
  for (let px = step; px <= w + step; px += step) {
    const x1 = toWx(px), y1 = safe(f, x1);
    segment(px0, x0, y0, px, x1, y1, 0);
    px0 = px; x0 = x1; y0 = y1;
  }
  c.stroke();

  function segment(pa, xa, ya, pb, xb, yb, depth) {
    const fa = Number.isFinite(ya), fb = Number.isFinite(yb);
    if (!fa && !fb) { pen = false; return; }
    const dy = fa && fb ? Math.abs(toPy(yb) - toPy(ya)) : Infinity;
    if (dy > 3 && depth < 6) {
      const pm = (pa + pb) / 2, xm = (xa + xb) / 2, ym = safe(f, xm);
      // jump: the midpoint is not between the ends -> asymptote or break
      if (fa && fb && Number.isFinite(ym) && depth >= 3 && dy > hh * 0.75) {
        const lo = Math.min(ya, yb), hi = Math.max(ya, yb), span = hi - lo;
        if (ym < lo - span * 0.1 || ym > hi + span * 0.1 || (ya > 0) !== (yb > 0)) {
          if (Math.abs(ym) > Math.max(Math.abs(ya), Math.abs(yb))) { pen = false; line(pb, yb); return; }
        }
      }
      segment(pa, xa, ya, pm, xm, ym, depth + 1);
      segment(pm, xm, ym, pb, xb, yb, depth + 1);
      return;
    }
    if (!fb) { pen = false; return; }
    if (!fa) pen = false;
    line(pb, yb);
  }
}
function safe(f, x) { try { const y = f(x); return Number.isFinite(y) ? y : NaN; } catch { return NaN; } }

function plotParam(c, xy, range) {
  const n = 1200;
  const { min, max } = range;
  c.beginPath();
  let pen = false, lastX = 0, lastY = 0;
  for (let i = 0; i <= n; i++) {
    const tt = min + ((max - min) * i) / n;
    let p;
    try { p = xy(tt); } catch { p = [NaN, NaN]; }
    const px = toPx(p[0]), py = toPy(p[1]);
    if (!Number.isFinite(px) || !Number.isFinite(py)) { pen = false; continue; }
    if (pen && Math.hypot(px - lastX, py - lastY) > H()) pen = false;
    if (pen) c.lineTo(px, py); else { c.moveTo(px, py); pen = true; }
    lastX = px; lastY = py;
  }
  c.stroke();
}

// Marching squares for F(x, y) = 0.
function marching(c, G) {
  const cell = W() > 900 ? 5 : 7;
  const cols = Math.ceil(W() / cell) + 1, rows = Math.ceil(H() / cell) + 1;
  const vals = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) vals[j * cols + i] = safe((x) => G(x, toWy(j * cell)), toWx(i * cell));
  c.beginPath();
  const lerp = (a, b) => (Math.abs(a - b) < 1e-300 ? 0.5 : a / (a - b));
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = vals[j * cols + i], b = vals[j * cols + i + 1], d = vals[(j + 1) * cols + i], e = vals[(j + 1) * cols + i + 1];
      if (![a, b, d, e].every(Number.isFinite)) continue;
      const x0 = i * cell, y0 = j * cell;
      const pts = [];
      if ((a > 0) !== (b > 0)) pts.push([x0 + lerp(a, b) * cell, y0]);
      if ((b > 0) !== (e > 0)) pts.push([x0 + cell, y0 + lerp(b, e) * cell]);
      if ((d > 0) !== (e > 0)) pts.push([x0 + lerp(d, e) * cell, y0 + cell]);
      if ((a > 0) !== (d > 0)) pts.push([x0, y0 + lerp(a, d) * cell]);
      // skip sign changes caused by poles (huge values on both sides)
      if (pts.length >= 2 && Math.max(Math.abs(a), Math.abs(b), Math.abs(d), Math.abs(e)) < 1e8) {
        c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]);
        if (pts.length === 4) { c.moveTo(pts[2][0], pts[2][1]); c.lineTo(pts[3][0], pts[3][1]); }
      }
    }
  }
  c.stroke();
}

function drawRegion(c, it) {
  const col = colour(it.e.color);
  c.save();
  c.globalAlpha = 0.16;
  c.fillStyle = col;
  if (it.kind === 'ineq') {
    const above = it.op === '>' || it.op === '>=';
    for (let px = 0; px < W(); px += 2) {
      const y = safe(it.f, toWx(px));
      if (!Number.isFinite(y)) continue;
      const py = Math.max(0, Math.min(H(), toPy(y)));
      if (above) c.fillRect(px, 0, 2, py); else c.fillRect(px, py, 2, H() - py);
    }
  } else {
    const cell = 4;
    const test = { '<': (v) => v < 0, '<=': (v) => v <= 0, '>': (v) => v > 0, '>=': (v) => v >= 0 }[it.op];
    for (let py = 0; py < H(); py += cell) {
      for (let px = 0; px < W(); px += cell) {
        const v = safe((x) => it.G(x, toWy(py + cell / 2)), toWx(px + cell / 2));
        if (Number.isFinite(v) && test(v)) c.fillRect(px, py, cell, cell);
      }
    }
  }
  c.restore();
}

function drawPoints(c, pts, col) {
  c.font = '500 11px "Geist Mono", monospace';
  c.textAlign = 'left';
  for (const [x, y] of pts) {
    const px = toPx(x), py = toPy(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    c.beginPath(); c.arc(px, py, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = cssVar('--text-2');
    c.fillText(`(${fmtNum(x, 4)}, ${fmtNum(y, 4)})`, px + 8, py - 8);
    c.fillStyle = col;
  }
}

function drawField(c, PQ, col) {
  const gap = 36;
  c.lineWidth = 1.4;
  const samples = [];
  let maxLen = 0;
  for (let py = gap / 2; py < H(); py += gap) {
    for (let px = gap / 2; px < W(); px += gap) {
      let v;
      try { v = PQ(toWx(px), toWy(py)); } catch { continue; }
      const len = Math.hypot(v[0], v[1]);
      if (!Number.isFinite(len)) continue;
      samples.push([px, py, v[0], v[1], len]);
      maxLen = Math.max(maxLen, len);
    }
  }
  for (const [px, py, vx, vy, len] of samples) {
    if (!len) continue;
    const L = (gap * 0.42) * (0.35 + 0.65 * len / (maxLen || 1));
    const ux = vx / len, uy = -vy / len;
    const x2 = px + ux * L, y2 = py + uy * L;
    c.beginPath(); c.moveTo(px - ux * L * 0.5, py - uy * L * 0.5); c.lineTo(x2, y2); c.stroke();
    c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - ux * 5 - uy * 3, y2 - uy * 5 + ux * 3); c.lineTo(x2 - ux * 5 + uy * 3, y2 - uy * 5 - ux * 3); c.closePath(); c.fill();
  }
  c.lineWidth = 2.25;
}

const deriv = (f) => (x) => { const hh = 1e-5 * Math.max(1, Math.abs(x)); return (f(x + hh) - f(x - hh)) / (2 * hh); };

function overlays(c, it, col) {
  const ov = it.e.overlays || {};
  if (ov.derivative) {
    c.save(); c.globalAlpha = 0.75; c.setLineDash([6, 5]); c.lineWidth = 1.75;
    plotFn(c, deriv(it.f));
    c.restore();
  }
  if (ov.area) {
    const { a, b } = ov.area;
    c.save(); c.globalAlpha = 0.22; c.fillStyle = col;
    c.beginPath();
    const y0 = toPy(0);
    c.moveTo(toPx(a), y0);
    const n = 300;
    for (let i = 0; i <= n; i++) { const x = a + ((b - a) * i) / n; const y = safe(it.f, x); c.lineTo(toPx(x), Number.isFinite(y) ? toPy(y) : y0); }
    c.lineTo(toPx(b), y0); c.closePath(); c.fill(); c.restore();
    const r = simpson((x) => it.f(x), a, b, 1e-9);
    label(c, t('graph.areaIs', { v: r.ok ? fmtNum(r.value, 6) : '—' }), toPx((a + b) / 2), Math.min(H() - 12, Math.max(16, toPy(0) - 12)), col);
  }
  if (ov.tangent) {
    const x0 = ov.tangent.x;
    const y0 = safe(it.f, x0), m = deriv(it.f)(x0);
    if (Number.isFinite(y0) && Number.isFinite(m)) {
      const { xmin, xmax } = bounds();
      c.save(); c.lineWidth = 1.5; c.setLineDash([]); c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(toPx(xmin), toPy(y0 + m * (xmin - x0))); c.lineTo(toPx(xmax), toPy(y0 + m * (xmax - x0))); c.stroke();
      c.beginPath(); c.arc(toPx(x0), toPy(y0), 6, 0, Math.PI * 2); c.fill();
      c.restore();
      label(c, `${t('graph.gradient')} ${fmtNum(m, 4)}`, toPx(x0) + 10, toPy(y0) - 12, col, 'left');
      ov.tangent.px = [toPx(x0), toPy(y0)];
    }
  }
}

function label(c, text, x, y, col, align = 'center') {
  c.font = '600 12px "Geist", system-ui, sans-serif';
  c.textAlign = align;
  const w = c.measureText(text).width;
  const bx = align === 'center' ? x - w / 2 - 6 : x - 6;
  c.fillStyle = cssVar('--surface');
  c.fillRect(bx, y - 13, w + 12, 18);
  c.fillStyle = col;
  c.fillText(text, x, y);
}

// Roots, y-intercepts, turning points and intersections in the visible window.
let kpCache = { key: '', pts: [] };
function keyPoints() {
  const { xmin, xmax } = bounds();
  const fns = items.filter((it) => it.e.visible && it.kind === 'function');
  const key = JSON.stringify([xmin.toPrecision(6), xmax.toPrecision(6), fns.map((f) => f.e.text), state.sliders, state.deg]);
  if (key === kpCache.key) return kpCache.pts;
  const pts = [];
  const samples = Math.min(800, Math.max(200, Math.round(W() / 2)));
  for (const it of fns) {
    const f = (x) => safe(it.f, x);
    for (const r of findRoots(f, xmin, xmax, samples)) pts.push({ x: r, y: 0, kind: 'root', it });
    if (xmin <= 0 && xmax >= 0) { const y = f(0); if (Number.isFinite(y)) pts.push({ x: 0, y, kind: 'yint', it }); }
    const d = deriv(f);
    for (const r of findRoots(d, xmin, xmax, samples)) {
      const y = f(r), l = f(r - 1e-3 * Math.max(1, Math.abs(r))), rr = f(r + 1e-3 * Math.max(1, Math.abs(r)));
      if (!Number.isFinite(y)) continue;
      if (y > l && y > rr) pts.push({ x: r, y, kind: 'maxPt', it });
      else if (y < l && y < rr) pts.push({ x: r, y, kind: 'minPt', it });
    }
  }
  for (let i = 0; i < fns.length; i++) {
    for (let j = i + 1; j < fns.length; j++) {
      const g = (x) => safe(fns[i].f, x) - safe(fns[j].f, x);
      for (const r of findRoots(g, xmin, xmax, samples)) pts.push({ x: r, y: safe(fns[i].f, r), kind: 'intersection', it: fns[i] });
    }
  }
  kpCache = { key, pts: pts.slice(0, 60) };
  return kpCache.pts;
}
function drawKeyPoints(c) {
  const pts = keyPoints();
  c.font = '500 11px "Geist Mono", monospace';
  for (const p of pts) {
    const px = toPx(p.x), py = toPy(p.y);
    if (py < -10 || py > H() + 10) continue;
    c.fillStyle = cssVar('--surface');
    c.strokeStyle = colour(p.it.e.color);
    c.lineWidth = 2;
    c.beginPath(); c.arc(px, py, 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  // labels only when there are few points
  if (pts.length <= 12) {
    c.textAlign = 'left';
    c.fillStyle = cssVar('--text-2');
    for (const p of pts) {
      const px = toPx(p.x), py = toPy(p.y);
      if (py < 0 || py > H()) continue;
      c.fillText(`(${fmtNum(p.x, 4)}, ${fmtNum(p.y, 4)})`, px + 7, py - 7);
    }
  }
}

function drawTrace(c) {
  const { px, py, it } = tracePt;
  c.fillStyle = colour(it.e.color);
  c.strokeStyle = cssVar('--bg');
  c.lineWidth = 2;
  c.beginPath(); c.arc(px, py, 6, 0, Math.PI * 2); c.fill(); c.stroke();
}

function drawDemo(c) {
  // idle demo on an empty graph: sin(x) with a moving tangent
  const col = colour(0);
  c.save();
  c.globalAlpha = 0.5;
  c.strokeStyle = col; c.lineWidth = 2;
  plotFn(c, Math.sin);
  const x0 = Math.sin(demoT * 0.6) * 4;
  const y0 = Math.sin(x0), m = Math.cos(x0);
  const { xmin, xmax } = bounds();
  c.globalAlpha = 0.65; c.lineWidth = 1.25; c.setLineDash([5, 5]);
  c.beginPath(); c.moveTo(toPx(xmin), toPy(y0 + m * (xmin - x0))); c.lineTo(toPx(xmax), toPy(y0 + m * (xmax - x0))); c.stroke();
  c.setLineDash([]); c.fillStyle = col;
  c.beginPath(); c.arc(toPx(x0), toPy(y0), 5, 0, Math.PI * 2); c.fill();
  c.restore();
}

// ---------- interaction ----------
function zoom(f, cx = W() / 2, cy = H() / 2) {
  const wx = toWx(cx), wy = toWy(cy);
  state.view.scale = Math.min(1e6, Math.max(1e-9, state.view.scale * f));
  state.view.cx = wx - (cx - W() / 2) * sx();
  state.view.cy = wy - (H() / 2 - cy) * sy();
  invalidate();
}

function fit() {
  const fns = items.filter((it) => it.e.visible);
  if (!fns.length) return;
  const { xmin, xmax } = bounds();
  let lo = Infinity, hi = -Infinity;
  for (const it of fns) {
    if (it.kind === 'function') {
      for (let i = 0; i <= 200; i++) {
        const y = safe(it.f, xmin + ((xmax - xmin) * i) / 200);
        if (Number.isFinite(y) && Math.abs(y) < 1e6) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      }
    } else if (it.kind === 'points') {
      for (const [x, y] of it.coords()) { lo = Math.min(lo, y); hi = Math.max(hi, y); state.view.cx = x; }
    }
  }
  if (!Number.isFinite(lo)) return;
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  state.view.cy = (lo + hi) / 2;
  if (state.square) state.view.scale = Math.max(state.view.scale, (hi - lo + 2 * pad) / H());
  else state.view.scaleY = (hi - lo + 2 * pad) / H();
  invalidate();
}

function bindPointer() {
  const pts = new Map();
  let pinch = null, dragTangent = null, moved = false;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    moved = false;
    // grab a tangent point?
    for (const it of items) {
      const tp = it.e.overlays && it.e.overlays.tangent && it.e.overlays.tangent.px;
      if (tp && Math.hypot(tp[0] - e.offsetX, tp[1] - e.offsetY) < 18) dragTangent = it;
    }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: state.view.scale };
    }
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) { if (state.trace && e.pointerType === 'mouse') traceAt(e.offsetX, e.offsetY); return; }
    const cur = { x: e.offsetX, y: e.offsetY };
    pts.set(e.pointerId, cur);
    if (dragTangent) { dragTangent.e.overlays.tangent.x = toWx(cur.x); invalidate(); return; }
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const target = pinch.scale * (pinch.d / Math.max(10, d));
      zoom(target / state.view.scale, cx, cy);
      return;
    }
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
    if (state.trace && e.pointerType !== 'mouse') { traceAt(cur.x, cur.y); return; }
    state.view.cx -= dx * sx();
    state.view.cy += dy * sy();
    invalidate();
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) { canvas.classList.remove('dragging'); dragTangent = null; }
    if (!moved && state.trace) traceAt(e.offsetX, e.offsetY);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const step = 40;
    if (state.trace && tracePt && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      traceAt(tracePt.px + (e.key === 'ArrowLeft' ? -3 : 3), tracePt.py, tracePt.it);
      return;
    }
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[e.key]) { e.preventDefault(); state.view.cx += map[e.key][0] * sx(); state.view.cy -= map[e.key][1] * sy(); invalidate(); }
    if (e.key === '+' || e.key === '=') zoom(1 / 1.25);
    if (e.key === '-') zoom(1.25);
  });
}

function traceAt(px, py, only = null) {
  let best = null;
  const x = toWx(px);
  for (const it of only ? [only] : items) {
    if (!it.e.visible || it.kind !== 'function') continue;
    const y = safe(it.f, x);
    if (!Number.isFinite(y)) continue;
    const d = Math.abs(toPy(y) - py);
    if (!best || d < best.d) best = { d, it, px, py: toPy(y), x, y };
  }
  tracePt = best;
  if (best) {
    tipEl.hidden = false;
    tipEl.textContent = `(${fmtNum(best.x, 5)}, ${fmtNum(best.y, 5)})`;
    tipEl.style.left = `${best.px}px`;
    tipEl.style.top = `${best.py}px`;
  } else tipEl.hidden = true;
  scheduler.invalidate(ID);
}

// ---------- sheets: window, table, examples, description ----------
function openWindow() {
  const b = bounds();
  const inputs = ['xmin', 'xmax', 'ymin', 'ymax'].map((k) => numInput(+b[k].toPrecision(6)));
  const sq = h('input', { type: 'checkbox' }); sq.checked = state.square;
  const pi = h('input', { type: 'checkbox' }); pi.checked = state.pi;
  const dg = h('input', { type: 'checkbox' }); dg.checked = state.deg;
  const s = openSheet({
    title: t('graph.window'),
    body: h('div', { class: 'panel' },
      h('div', { class: 'tool-grid' }, ...inputs.map((inp, i) => field(t(`graph.${['xmin', 'xmax', 'ymin', 'ymax'][i]}`), inp))),
      h('label', { class: 'set-row' }, h('span', { class: 'grow', text: t('graph.square') }), h('span', { class: 'switch' }, sq)),
      h('label', { class: 'set-row' }, h('span', { class: 'grow', text: t('graph.piTicks') }), h('span', { class: 'switch' }, pi)),
      h('label', { class: 'set-row' }, h('span', { class: 'grow', text: 'DEG' }), h('span', { class: 'switch' }, dg)),
      button(t('graph.apply'), () => {
        const [x0, x1, y0, y1] = inputs.map((i) => Number(i.value));
        state.square = sq.checked; state.pi = pi.checked;
        const degChanged = state.deg !== dg.checked;
        state.deg = dg.checked;
        if ([x0, x1, y0, y1].every(Number.isFinite) && x1 > x0 && y1 > y0) {
          state.view.cx = (x0 + x1) / 2; state.view.cy = (y0 + y1) / 2;
          state.view.scale = (x1 - x0) / W();
          state.view.scaleY = (y1 - y0) / H();
          if (state.square) state.view.scale = Math.max(state.view.scale, state.view.scaleY);
        }
        if (degChanged) rebuild(); else invalidate();
        s.close();
      }, { cls: 'btn primary' })),
  });
}

function openTable(expr) {
  const fns = items.filter((it) => it.kind === 'function');
  if (!fns.length) { toast(t('graph.emptyDesc')); return; }
  let target = expr ? fns.find((f) => f.e === expr) || fns[0] : fns[0];
  const start = numInput(-3), step = numInput(1), rows = numInput(13);
  const tableWrap = h('div', { style: { maxHeight: '50dvh', overflow: 'auto' } });
  const render = () => {
    clear(tableWrap);
    const x0 = Number(start.value), dx = Number(step.value), n = Math.min(200, Math.max(1, Number(rows.value) || 10));
    const table = h('table', { class: 'values' }, h('thead', {}, h('tr', {}, h('th', { text: 'x' }), ...fns.map((f) => h('th', { text: f.e.text })))));
    const tb = h('tbody');
    const lines = [['x', ...fns.map((f) => f.e.text)].join('\t')];
    for (let i = 0; i < n; i++) {
      const x = x0 + i * dx;
      const ys = fns.map((f) => safe(f.f, x));
      tb.append(h('tr', {}, h('td', { text: fmtNum(x, 6) }), ...ys.map((y) => h('td', { text: Number.isFinite(y) ? fmtNum(y, 6) : '—' }))));
      lines.push([x, ...ys].join('\t'));
    }
    table.append(tb);
    tableWrap.append(table);
    tableWrap.dataset.tsv = lines.join('\n');
  };
  [start, step, rows].forEach((i) => i.addEventListener('input', render));
  render();
  void target;
  openSheet({
    title: t('graph.table'), wide: true,
    body: h('div', { class: 'panel' }, h('div', { class: 'tool-grid' }, field(t('graph.tStart'), start), field(t('graph.tStep'), step), field(t('graph.rows'), rows)),
      tableWrap, button(t('common.copy'), () => import('./ui.js').then((u) => u.copyText(tableWrap.dataset.tsv)), { cls: 'btn', iconName: 'copy' })),
  });
}

const EXAMPLES = [
  ['graph.ex.parabola', ['y = x^2 - 4', 'y = 2x + 1']],
  ['graph.ex.circle', ['x^2 + y^2 = 9']],
  ['graph.ex.rose', ['r = 2cos(3θ)']],
  ['graph.ex.lissajous', ['(sin(3t), cos(2t))']],
  ['graph.ex.fourier', ['y = 4/pi sum(sin((2k-1)x)/(2k-1), k, 1, n)']],
  ['graph.ex.trig', ['y = a sin(b x)']],
  ['graph.ex.inequality', ['y < 2x + 1', 'x^2 + y^2 <= 9']],
  ['graph.ex.field', ['field(-y, x)']],
  ['graph.ex.surface', ['z = sin(x)cos(y)']],
];
function openExamples() {
  const s = openSheet({
    title: t('graph.examples'),
    body: h('div', { class: 'list' }, EXAMPLES.map(([key, exprs]) => h('button', {
      class: 'list-item', type: 'button', style: { background: 'none', border: '0', borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'var(--text)', width: '100%' },
      on: {
        click: () => {
          state.exprs = exprs.map((x, i) => newExpr(x, { color: i }));
          state.view = { ...DEFAULT_VIEW };
          if (key === 'graph.ex.fourier') state.sliders = { n: { value: 5, min: 1, max: 25, step: 1 } };
          if (key === 'graph.ex.trig') state.sliders = { a: { value: 2, min: -5, max: 5, step: 0.1 }, b: { value: 1, min: 0.1, max: 5, step: 0.1 } };
          s.close();
          rebuild();
          updateDemoLoop();
          if (key === 'graph.ex.surface') { modeSeg.setValue('3d'); setMode('3d'); }
        },
      },
    }, h('span', { class: 'grow' }, h('div', { class: 't1', text: t(key) }), h('div', { class: 't2 mono', text: exprs.join('   ') }))))),
  });
}

function describe() {
  const lines = [];
  for (const it of items) {
    if (!it.e.visible || it.kind === 'empty') continue;
    if (it.kind !== 'function') { lines.push(`${it.e.text}: ${t(`graph.kind.${kindKey(it.kind)}`)}`); continue; }
    const pts = keyPoints().filter((p) => p.it === it);
    const parts = pts.slice(0, 8).map((p) => `${t(`graph.${p.kind === 'root' ? 'root' : p.kind === 'yint' ? 'yint' : p.kind}`)} (${fmtNum(p.x, 4)}, ${fmtNum(p.y, 4)})`);
    lines.push(`${it.e.text}${parts.length ? ': ' + parts.join('; ') : ''}`);
  }
  return lines.length ? lines : [t('graph.emptyDesc')];
}
function updateDescription() { if (descEl) descEl.textContent = describe().join('. '); }
const updateDescriptionSoon = debounce(updateDescription, 600);
function showDescription() {
  openSheet({ title: t('graph.textAlt'), body: h('div', { class: 'list' }, describe().map((l) => h('div', { class: 'list-item', text: l }))) });
}

// ---------- export and share ----------
async function exportPng() {
  const w = W(), hh = H();
  const off = document.createElement('canvas');
  off.width = Math.round(w * 2); off.height = Math.round(hh * 2);
  const oc = off.getContext('2d');
  render(oc, w, hh, 2, true);
  if (app.settings.watermark) {
    oc.setTransform(2, 0, 0, 2, 0, 0);
    oc.globalAlpha = 0.55;
    oc.fillStyle = cssVar('--text-2');
    oc.font = '600 12px "Geist", system-ui, sans-serif';
    oc.textAlign = 'right';
    oc.fillText(t('graph.watermark'), w - 12, hh - 12);
    const g = oc.createLinearGradient(0, 0, 11, 10);
    g.addColorStop(0, '#00C3F3'); g.addColorStop(0.55, '#00A2DC'); g.addColorStop(1, '#006AB1');
    oc.fillStyle = g;
    const mw = oc.measureText(t('graph.watermark')).width;
    const bx = w - 12 - mw - 16, by = hh - 24;
    [[0, 14], [2.3, 14], [4.6, 14], [6.9, 10], [9.2, 10]].forEach(([x, hgt]) => oc.fillRect(bx + x, by, 1.6, hgt));
    oc.globalAlpha = 1;
  }
  off.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], 'nexlyr-graph.png', { type: 'image/png' });
    shareOrCopy({ title: t('app.name'), files: [file] }).then((r) => { if (r === 'downloaded') toast(t('toast.imageSaved')); });
  }, 'image/png');
}
function shareLink() {
  const json = JSON.stringify(serialize());
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  const code = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  shareOrCopy({ title: t('app.name'), url: `${location.origin}${location.pathname}#/graph?g=${code}` });
}

// ---------- 3D ----------
async function setMode(m) {
  if (m === '3d') {
    const mod = await import('./graph3d.js');
    if (!mode3d) mode3d = mod.create(wrap, () => items.filter((it) => it.e.visible && it.kind === 'surface').map((it) => ({ fn: it.G, color: colour(it.e.color), text: it.e.text })), state);
    mode3d.show();
    canvas.hidden = true;
    toolsEl.hidden = true;
    if (!items.some((it) => it.kind === 'surface')) toast(t('graph.need3d'));
  } else {
    if (mode3d) mode3d.hide();
    canvas.hidden = false;
    toolsEl.hidden = false;
    invalidate();
  }
  renderPanel();
}
bus.on('graph:3d-changed', () => { if (mode3d) mode3d.update(); });
