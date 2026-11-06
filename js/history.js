// History and favourites drawer: search, filter by screen, tap to reuse,
// star, copy, delete with undo, copy all, export CSV, clear.

import { h, icon, iconButton, clear, openSheet, toast, copyText, confirmDialog, downloadBlob, button } from './ui.js';
import { t } from './i18n/index.js';
import { bus, app } from './bus.js';
import { getHistory, getFavs, isFav, toggleFav, removeEntry, restoreEntry, clearHistory, removeFav } from './history-store.js';

const KINDS = [['all', 'hist.all'], ['calc', 'hist.calc'], ['solve', 'hist.solve'], ['graph', 'hist.graph'], ['tool', 'hist.tool'], ['favs', 'hist.favs']];
const KIND_ICON = { calc: 'calc', solve: 'solve', graph: 'graph', tool: 'tools' };
let sheet = null;

export async function mount(el) { el.append(build(() => {})); }

export function openHistory() {
  if (sheet) return;
  const body = build(() => sheet && sheet.close());
  sheet = openSheet({ title: t('hist.title'), body, drawer: true, onClose: () => { sheet = null; off(); } });
  const off = bus.on('history:changed', () => body.refresh());
}

function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 864e5);
  if (diff === 0) return t('hist.today');
  if (diff === 1) return t('hist.yesterday');
  return d.toLocaleDateString(app.settings.lang === 'ur' ? 'ur-PK' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
const resultOf = (e) => e.exact || e.decimal || '';

// Send an entry back to the screen it came from.
function reuse(e, close) {
  close();
  setTimeout(() => reuseNow(e), 140);   // let the drawer's history entry pop first
}
function reuseNow(e) {
  if (e.kind === 'solve') { app.pending = { ...(app.pending || {}), solve: e.input }; location.hash = '#/solve'; return; }
  if (e.kind === 'graph') { app.pending = { ...(app.pending || {}), graph: e.input.split(/;\s*/) }; location.hash = '#/graph'; return; }
  if (e.kind === 'tool' && e.ref && e.ref.tool) { location.hash = `#/tools/${e.ref.tool}`; return; }
  const insert = () => bus.emit('calc:insert', e.input);
  if (app.route && app.route.screen === 'calc') { setTimeout(insert, 60); return; }
  const off = bus.on('route', (r) => { if (r.screen === 'calc') { off(); setTimeout(insert, 60); } });
  location.hash = '#/calc';
}

function build(close) {
  let kind = 'all', q = '';
  const search = h('input', { class: 'input', type: 'search', placeholder: t('hist.search'), 'aria-label': t('hist.search'), autocomplete: 'off' });
  const tabs = h('div', { class: 'chips hist-tabs', role: 'tablist' });
  const list = h('div', { class: 'list hist-list' });
  const foot = h('div', { class: 'btn-row hist-foot' },
    button(t('hist.copyAll'), () => {
      const rows = current();
      if (!rows.length) return;
      copyText(rows.map((e) => `${e.input}${resultOf(e) ? ` = ${resultOf(e)}` : ''}`).join('\n'));
    }, { iconName: 'copy', cls: 'btn sm' }),
    button(t('hist.export'), () => {
      const rows = current();
      if (!rows.length) return;
      const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = ['When,Screen,Input,Exact,Decimal', ...rows.map((e) => [new Date(e.ts).toISOString(), e.kind, e.input, e.exact, e.decimal].map(cell).join(','))].join('\r\n');
      downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `nexlyr-calculator-history-${new Date().toISOString().slice(0, 10)}.csv`);
    }, { iconName: 'filedown', cls: 'btn sm' }),
    button(t('hist.clear'), async () => {
      if (!getHistory().length) return;
      if (await confirmDialog(t('hist.clearConfirm'), { okLabel: t('hist.clear'), danger: true })) { clearHistory(); render(); }
    }, { iconName: 'remove', cls: 'btn sm danger' }));
  const root = h('div', { class: 'panel hist' }, h('div', { class: 'search-box' }, icon('search'), search), tabs, list, foot);

  function current() {
    const src = kind === 'favs' ? getFavs() : getHistory();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return src.filter((e) => (kind === 'all' || kind === 'favs' || e.kind === kind))
      .filter((e) => !words.length || words.every((w) => `${e.input} ${e.exact} ${e.decimal}`.toLowerCase().includes(w)))
      .sort((a, b) => b.ts - a.ts);
  }
  function renderTabs() {
    clear(tabs);
    for (const [k, key] of KINDS) {
      tabs.append(h('button', { class: 'chip', type: 'button', role: 'tab', 'aria-pressed': String(k === kind), 'aria-selected': String(k === kind),
        on: { click: () => { kind = k; renderTabs(); render(); } } }, k === 'favs' ? icon('star', 'sm') : null, t(key)));
    }
  }
  function render() {
    clear(list);
    const rows = current();
    foot.hidden = kind === 'favs' && !rows.length;
    if (!rows.length) {
      list.append(h('div', { class: 'empty' }, icon(kind === 'favs' ? 'star' : 'history', 'lg'), h('p', { text: q ? t('hist.noMatch') : kind === 'favs' ? t('hist.favsEmpty') : t('hist.empty') })));
      return;
    }
    let lastDay = '';
    for (const e of rows.slice(0, 300)) {
      const day = dayLabel(e.ts);
      if (day !== lastDay) { list.append(h('div', { class: 'hist-day', text: day })); lastDay = day; }
      const fav = kind === 'favs' || isFav(e.id);
      const starBtn = iconButton('star', fav ? t('hist.unpin') : t('hist.pin'), () => {
        if (kind === 'favs') removeFav(e.id); else toggleFav(e);
        render();
      }, { 'aria-pressed': String(fav), class: `icon-btn${fav ? ' on' : ''}` });
      const del = kind === 'favs' ? null : iconButton('remove', t('common.delete'), () => {
        const gone = removeEntry(e.id);
        render();
        if (gone) toast(t('hist.deleted'), { label: t('hist.undo'), action: () => { restoreEntry(gone); render(); } });
      });
      list.append(h('div', { class: 'list-item hist-item' },
        h('span', { class: 'hist-ic', 'aria-hidden': 'true' }, icon(KIND_ICON[e.kind] || 'calc', 'sm')),
        h('button', { class: 'grow', type: 'button', title: t('hist.reuse'), on: { click: () => reuse(e, close) } },
          h('div', { class: 't1 mono', text: e.input }),
          resultOf(e) ? h('div', { class: 't2 mono res', text: `= ${resultOf(e)}` }) : null,
          h('div', { class: 't2', text: new Date(e.ts).toLocaleTimeString(app.settings.lang === 'ur' ? 'ur-PK' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) })),
        iconButton('copy', t('common.copy'), () => copyText(resultOf(e) || e.input)),
        starBtn, del));
    }
  }
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); render(); }, 120); });
  renderTabs();
  render();
  root.refresh = render;
  return root;
}
