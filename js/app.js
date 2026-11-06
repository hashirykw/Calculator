// Boot, hash router, layout (rail / bottom nav / Amy panel), global actions,
// keyboard shortcuts, offline and install handling, service worker updates.

import { store, loadSettings, saveSettings } from './store.js';
import { t } from './i18n/index.js';
import { bus, app } from './bus.js';
import { h, toast, isTyping, sheetOpen } from './ui.js';
import { applySettings, updateSettings } from './prefs.js';
import { loadKatex } from './mathrender.js';
import { CONFIG } from './config.js';
import './history-store.js';
import './achievements.js';

const SCREENS = {
  calc: () => import('./calc.js'),
  solve: () => import('./solve.js'),
  graph: () => import('./graph.js'),
  tools: () => import('./tools/index.js'),
  arcade: () => import('./arcade/index.js'),
};
const FILL = new Set(['calc', 'graph', 'arcade', 'amy']);
const main = document.getElementById('main');
const sections = {};
const modules = {};
let current = null;
let lastNonAmy = 'calc';

// ---------- boot ----------
app.settings = loadSettings();
app.settings.visits = (app.settings.visits || 0) + 1;
saveSettings(app.settings);
await applySettings();
translateStatic();
bus.on('settings', () => translateStatic());

function translateStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
    if (el.title) el.title = t(el.dataset.i18nAria);
  });
}

// ---------- router ----------
export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const parts = (path || '').split('/').filter(Boolean).map(decodeURIComponent);
  return { screen: parts[0] || 'calc', sub: parts.slice(1), query: new URLSearchParams(query || '') };
}

const isWide = () => window.matchMedia('(min-width: 768px)').matches;
const isDesktop = () => window.matchMedia('(min-width: 1200px)').matches;

async function route() {
  const r = parseHash();
  let screen = r.screen;
  if (screen === 'help') return show('help', r);
  if (screen === 'amy') {
    if (!app.settings.amy || app.settings.examMode) { location.replace('#/calc'); return; }
    if (isWide()) { setAmyOpen(true); location.replace(`#/${lastNonAmy}`); return; }
    return show('amy', r);
  }
  if (!(screen in SCREENS)) { location.replace('#/calc'); return; }
  if (screen === 'arcade' && app.settings.examMode) { location.replace('#/calc'); return; }
  return show(screen, r);
}

async function show(screen, r) {
  if (current && current !== screen) {
    const m = modules[current];
    if (m && m.hide) { try { m.hide(); } catch (e) { console.error(e); } }
    if (sections[current]) sections[current].hidden = true;
  }
  let sec = sections[screen];
  if (!sec) {
    if (screen === 'help') sec = main.querySelector('[data-route="help"]');
    else {
      sec = h('section', { class: 'view', data: { route: screen }, 'aria-label': t(`nav.${screen}`) });
      if (FILL.has(screen)) sec.dataset.fill = '';
      main.append(sec);
    }
    sections[screen] = sec;
  }
  sec.hidden = false;
  current = screen;
  app.route = { ...r, screen };
  if (screen !== 'amy') lastNonAmy = screen === 'help' ? lastNonAmy : screen;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === screen) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const titleKey = `title.${screen}`;
  if (screen !== 'tools' || !r.sub.length) document.title = t(titleKey);
  try {
    if (screen === 'amy') { await mountAmy(); placeAmy(); }
    else if (screen !== 'help') {
      if (!modules[screen]) {
        sec.append(h('div', { class: 'empty' }, h('span', { class: 'spinner' })));
        const mod = await SCREENS[screen]();
        sec.textContent = '';
        modules[screen] = mod;
        await mod.mount(sec, r);
      } else if (modules[screen].show) {
        await modules[screen].show(r);
      }
    }
  } catch (e) {
    console.error(e);
    sec.textContent = '';
    sec.append(h('div', { class: 'empty' }, t('err.internal')));
  }
  bus.emit('route', app.route);
  if (!sheetOpen()) main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);

// ---------- Amy: one component, placed in the side panel or its own view ----------
const amyPanel = document.getElementById('amy-panel');
let amyInstance = null;
async function mountAmy() {
  if (amyInstance) return amyInstance;
  const mod = await import('./amy.js');
  amyInstance = mod.createAmy();
  return amyInstance;
}
function placeAmy() {
  if (!amyInstance) return;
  const target = isWide() || current !== 'amy' ? amyPanel : sections.amy;
  if (target && amyInstance.root.parentElement !== target) target.append(amyInstance.root);
}
function setAmyOpen(open) {
  if (open) {
    mountAmy().then(() => { placeAmy(); amyPanel.dataset.open = ''; amyInstance.focus && amyInstance.focus(); });
  } else delete amyPanel.dataset.open;
  document.querySelectorAll('[data-action="toggle-amy"]').forEach((b) => b.setAttribute('aria-pressed', String(!!open)));
  app.amyOpen = !!open;
}
export function openAmy(prefill) {
  if (!app.settings.amy || app.settings.examMode) return;
  if (isWide()) setAmyOpen(true); else location.hash = '#/amy';
  mountAmy().then((a) => { placeAmy(); if (prefill) a.ask(prefill); });
}
bus.on('amy:ask', (p) => openAmy(p));
bus.on('amy:close', () => { if (isWide()) setAmyOpen(false); else history.back(); });

function syncAmyLayout() {
  const toggle = document.getElementById('amy-toggle');
  toggle.hidden = !isWide() || !app.settings.amy || app.settings.examMode;
  if (isDesktop() && app.settings.amy && !app.settings.examMode && app.amyOpen === undefined) setAmyOpen(true);
  if (!app.settings.amy || app.settings.examMode) setAmyOpen(false);
  placeAmy();
}
window.matchMedia('(min-width: 768px)').addEventListener?.('change', () => {
  if (!isWide() && current === 'amy') placeAmy();
  if (isWide() && current === 'amy') location.replace(`#/${lastNonAmy}`);
  syncAmyLayout();
});
bus.on('settings', syncAmyLayout);

// ---------- global actions ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  if (a === 'about') import('./about.js').then((m) => m.openAbout());
  else if (a === 'search') import('./search.js').then((m) => m.openSearch());
  else if (a === 'history') import('./history.js').then((m) => m.openHistory());
  else if (a === 'settings') import('./settings.js').then((m) => m.openSettings());
  else if (a === 'toggle-amy') {
    if (isWide()) setAmyOpen(!app.amyOpen); else location.hash = '#/amy';
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    import('./search.js').then((m) => m.openSearch());
  }
});

// ---------- online / offline ----------
const offlineBadge = document.getElementById('offline');
function syncOnline() {
  app.online = navigator.onLine;
  offlineBadge.hidden = app.online;
  bus.emit('online', app.online);
}
window.addEventListener('online', syncOnline);
window.addEventListener('offline', syncOnline);
syncOnline();

// ---------- service worker and updates ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const promptUpdate = (w) => toast(t('toast.update'), {
      label: t('toast.reload'),
      action: () => { w.postMessage('skipWaiting'); },
    });
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(w);
      });
    });
  }).catch(() => { /* offline support unavailable here */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

// ---------- install prompt (third visit or later, never on first load) ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  maybeInstallHint();
});
function maybeInstallHint() {
  const s = app.settings;
  if (s.installHintShown || s.visits < 3) return;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (deferredInstall) {
    updateSettings({ installHintShown: true });
    toast(`${t('install.title')}. ${t('install.body')}`, { label: t('install.add'), action: () => deferredInstall.prompt() });
  } else if (ios) {
    updateSettings({ installHintShown: true });
    toast(`${t('install.title')}. ${t('install.ios')}`, { duration: 8000 });
  }
}

// ---------- start ----------
await route();
syncAmyLayout();
setTimeout(maybeInstallHint, 4000);
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
idle(() => {
  loadKatex();
  import('./engine-client.js').then((c) => c.preview('1+1'));   // warm the engine worker
  if (CONFIG.ga4Id) import('./analytics.js').then((m) => m.init());
});
