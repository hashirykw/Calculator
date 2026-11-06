// Formula library (14.5): checked formulas from data/formulas.json with
// search, groups, favourites and recent. Open one, fill in every value but
// one, and the engine solves for the one left blank (any variable).

import { h, clear, icon, copyText } from '../ui.js';
import { t } from '../i18n/index.js';
import { app } from '../bus.js';
import { store } from '../store.js';
import { texSpan, renderTex } from '../mathrender.js';
import * as engine from '../engine-client.js';
import { errorText } from '../calc.js';
import { toolPage, numField, message, fmt, record, plain, numTex } from './kit.js';

let dataPromise = null;
export function loadFormulas() {
  if (!dataPromise) {
    dataPromise = fetch(new URL('../../data/formulas.json', import.meta.url)).then((r) => r.json()).catch(() => { dataPromise = null; return { groups: [], formulas: [] }; });
  }
  return dataPromise;
}

const VAR_TEX = { theta: '\\theta', lambda: '\\lambda', rho: '\\rho', mu: '\\mu', sigma: '\\sigma', theta_1: '\\theta_1', theta_2: '\\theta_2' };
const varTex = (s) => VAR_TEX[s] || s.replace(/^([A-Za-z]+)_([A-Za-z0-9]+)$/, '$1_{$2}');

export function create() {
  const { root, body } = toolPage('formulas');
  const listView = h('div', { class: 'panel' });
  const detail = h('div', { class: 'panel', hidden: true });
  const search = h('input', { class: 'input', type: 'search', placeholder: t('fm.search'), 'aria-label': t('fm.search') });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': t('fm.groups') });
  const countEl = h('p', { class: 'help' });
  const lists = h('div', { class: 'panel' });
  listView.append(search, chips, countEl, lists);
  body.append(listView, detail);
  let data = null, group = 'all';
  const favs = new Set(Array.isArray(store.get('fFavs')) ? store.get('fFavs') : []);
  let recent = Array.isArray(store.get('fRecent')) ? store.get('fRecent') : [];

  loadFormulas().then((d) => { data = d; buildChips(); renderList(); });
  search.addEventListener('input', renderList);

  function buildChips() {
    clear(chips);
    for (const [id, name] of [['all', t('fm.all')], ['favs', t('hist.favs')], ...data.groups.map((g) => [g.id, g.name])]) {
      chips.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(id === group), on: { click: () => { group = id; buildChips(); renderList(); } } }, id === 'favs' ? icon('star', 'sm') : null, name));
    }
  }

  function item(f) {
    const fm = h('div', { class: 'fm' });
    renderTex(fm, f.tex, { fallback: f.expr });
    return h('button', { class: 'formula-item', type: 'button', on: { click: () => open(f.id) } },
      h('span', { class: 'fi-head' }, h('span', { class: 't1', text: f.name }), favs.has(f.id) ? icon('star', 'sm') : null), fm);
  }

  function renderList() {
    if (!data) return;
    clear(lists);
    const q = search.value.trim().toLowerCase();
    const match = (f) => !q || q.split(/\s+/).every((w) => `${f.name} ${f.expr} ${f.vars.map((v) => v.n).join(' ')} ${(data.groups.find((g) => g.id === f.g) || {}).name}`.toLowerCase().includes(w));
    let shown = data.formulas.filter(match);
    if (group === 'favs') shown = shown.filter((f) => favs.has(f.id));
    else if (group !== 'all') shown = shown.filter((f) => f.g === group);
    countEl.textContent = t('fm.count', { n: shown.length, total: data.formulas.length });
    if (!q && group === 'all' && recent.length) {
      const rec = recent.map((id) => data.formulas.find((f) => f.id === id)).filter(Boolean);
      if (rec.length) lists.append(h('h2', { class: 'section-title', text: t('fm.recent') }), h('div', { class: 'tool-grid two' }, rec.map(item)));
    }
    if (!shown.length) { lists.append(h('p', { class: 'note-box', text: group === 'favs' ? t('fm.noFavs') : t('search.empty') })); return; }
    for (const g of data.groups) {
      const fs = shown.filter((f) => f.g === g.id);
      if (!fs.length) continue;
      lists.append(h('h2', { class: 'section-title', text: g.name }), h('div', { class: 'tool-grid two' }, fs.map(item)));
    }
  }

  function open(id) {
    const f = data && data.formulas.find((x) => x.id === id);
    if (!f) return;
    recent = [id, ...recent.filter((x) => x !== id)].slice(0, 6);
    store.set('fRecent', recent);
    listView.hidden = true;
    detail.hidden = false;
    clear(detail);
    const fields = f.vars.map((v) => numField(`${v.n[0].toUpperCase()}${v.n.slice(1)}`, { unit: v.u || '', value: v.value !== undefined ? plain(v.value, 12) : '', onInput: () => auto() }));
    fields.forEach((fl, i) => fl.el.querySelector('label').prepend(texSpan(varTex(f.vars[i].s)), ' · '));
    const favBtn = h('button', { class: 'btn sm', type: 'button', 'aria-pressed': String(favs.has(id)), on: { click: () => {
      if (favs.has(id)) favs.delete(id); else favs.add(id);
      store.set('fFavs', [...favs]);
      favBtn.setAttribute('aria-pressed', String(favs.has(id)));
      favBtn.lastChild.textContent = favs.has(id) ? t('hist.unpin') : t('hist.pin');
    } } }, icon('star', 'sm'), h('span', { text: favs.has(id) ? t('hist.unpin') : t('hist.pin') }));
    const big = h('div', { class: 'fm-big' });
    renderTex(big, f.tex, { display: true, fallback: f.expr });
    const warn = message('warn');
    const out = h('div', { class: 'result-card', hidden: true, 'aria-live': 'polite' });
    const go = h('button', { class: 'btn primary', type: 'button', on: { click: () => solve(true) } }, t('fm.solve'));
    detail.append(
      h('button', { class: 'back', type: 'button', on: { click: () => { detail.hidden = true; listView.hidden = false; renderList(); search.focus(); } } }, icon('left', 'sm'), t('fm.back')),
      h('div', { class: 'card panel' }, h('div', { class: 'fi-head' }, h('h2', { text: f.name }), favBtn), big,
        f.info ? h('p', { class: 'help', text: f.info }) : null,
        f.angle === 'deg' ? h('p', { class: 'help', text: t('fm.degrees') }) : null),
      h('div', { class: 'card panel' }, h('p', { class: 'help', text: t('fm.howto') }), h('div', { class: 'tool-grid two' }, fields.map((x) => x.el)), h('div', { class: 'btn-row' }, go,
        h('button', { class: 'btn ghost', type: 'button', on: { click: () => { fields.forEach((x, i) => x.set(f.vars[i].value !== undefined ? plain(f.vars[i].value, 12) : '')); out.hidden = true; warn.set(''); } } }, t('common.clear')))),
      warn.el, out);
    let seq = 0;
    function auto() { const blanks = fields.filter((x) => Number.isNaN(x.get())); if (blanks.length === 1) solve(false); }

    async function solve(explicit) {
      warn.set('');
      const vals = fields.map((x) => x.get());
      if (vals.some((v) => v === null)) { warn.set(t('fm.badValue')); return; }
      const blank = vals.map((v, i) => (Number.isNaN(v) ? i : -1)).filter((i) => i >= 0);
      if (blank.length !== 1) { if (explicit) warn.set(blank.length ? t('fm.oneBlank') : t('fm.leaveBlank')); return; }
      const k = blank[0], v = f.vars[k];
      const known = Object.fromEntries(f.vars.map((x, i) => [x.s, vals[i]]).filter((_, i) => i !== k));
      let expr = f.expr;
      for (const [s, val] of Object.entries(known)) expr = expr.replace(new RegExp(`\\b${s}\\b`, 'g'), `(${plain(val, 15)})`);
      const text = `solve(${expr}, ${v.s})`;
      const my = ++seq;
      const r = await engine.solve(text, { angle: f.angle || 'rad', complex: false, sig: app.settings.sig, group: app.settings.group });
      if (my !== seq) return;
      show(r, v, text, known);
    }

    function show(r, v, text, known) {
      clear(out);
      if (!r.ok) { out.hidden = true; warn.set(errorText(r.error)); return; }
      let vals = (r.values || []).filter(Number.isFinite);
      const before = vals.length;
      if (v.pos) vals = vals.filter((x) => x > 0);
      if (v.acute) vals = vals.filter((x) => x > 0 && x < 90);
      if (v.tri) vals = vals.filter((x) => x > 0 && x < 180);
      out.hidden = false;
      const name = `${v.n[0].toUpperCase()}${v.n.slice(1)}`;
      out.append(h('div', { class: 'task' }, name, r.verified ? h('span', { class: 'badge' }, icon('check', 'sm'), t(r.verified === 'symbolic' ? 'solve.checkedSym' : 'solve.checked')) : null));
      const unit = v.u ? (v.u === '°' ? '°' : ` ${v.u}`) : '';
      if (vals.length) {
        const main = h('div', { class: 'exact' });
        const tex = vals.map((x) => `${varTex(v.s)} ${Number.isInteger(x) ? '=' : '\\approx'} ${numTex(fmt(x, 8))}${v.u === '°' ? '^{\\circ}' : ''}`).join(',\\quad ');
        renderTex(main, tex, { display: true, fallback: vals.map((x) => `${v.s} ≈ ${fmt(x, 8)}${unit}`).join(', ') });
        out.append(main);
        if (v.u && v.u !== '°') out.append(h('div', { class: 'decimal', text: t('fm.unit', { u: v.u }) }));
        if (r.exact && r.exact.text.length < 48 && !/asin|acos|atan/.test(r.exact.text) && vals.length === before) {
          const ex = h('div', { class: 'decimal' });
          renderTex(ex, r.exact.latex, { fallback: r.exact.text });
          out.append(h('div', { class: 'tiny muted', text: t('fm.exact') }), ex);
        }
        if (vals.length < before) out.append(h('p', { class: 'note', text: t(v.acute ? 'fm.acuteOnly' : v.tri ? 'fm.triOnly' : 'fm.positiveOnly') }));
        else if (r.note && r.note.key === 'note.trigRange') out.append(h('p', { class: 'note', text: t('note.trigRange', r.note.params) }));
        record('formulas', `${f.name}: ${Object.entries(known).map(([s, x]) => `${s}=${fmt(x, 6)}`).join(', ')}`, vals.map((x) => `${v.s} = ${fmt(x, 8)}${unit}`).join(', '));
      } else {
        out.append(h('p', { class: 'msg', text: before ? t('fm.noValid') : t('fm.noSolution') }));
      }
      out.append(h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm', type: 'button', on: { click: () => copyText(vals.map((x) => plain(x, 10)).join(', ')) } }, icon('copy', 'sm'), t('common.copy')),
        h('button', { class: 'btn sm', type: 'button', on: { click: () => { app.pending = { ...(app.pending || {}), solve: text }; location.hash = '#/solve'; } } }, icon('solve', 'sm'), t('calc.openSolve'))));
    }
    setTimeout(() => (fields.find((x) => !x.input.value) || fields[0]).input.focus({ preventScroll: true }), 50);
  }

  return {
    root,
    show(r) {
      const id = r && r.query && r.query.get('f');
      if (id) loadFormulas().then((d) => { data = d; buildChips(); renderList(); open(id); history.replaceState(null, '', '#/tools/formulas'); });
    },
  };
}
