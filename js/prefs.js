// Applying and changing settings. Every screen reads app.settings and
// listens for the 'settings' event.

import { app, bus } from './bus.js';
import { saveSettings } from './store.js';
import { setLang, currentLang } from './i18n/index.js';

const media = window.matchMedia('(prefers-color-scheme: light)');
media.addEventListener?.('change', () => { if (app.settings && app.settings.theme === 'system') applySettings(); });

export function resolvedTheme(s = app.settings) {
  if (!s || s.theme === 'system') return media.matches ? 'nexlyr-light' : 'nexlyr-dark';
  return s.theme;
}

export async function applySettings() {
  const s = app.settings;
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(s);
  root.dataset.font = s.fontSize;
  if (s.glass) root.dataset.glass = ''; else delete root.dataset.glass;
  if (s.motion === 'system') delete root.dataset.motion; else root.dataset.motion = s.motion;
  if (currentLang() !== s.lang || root.lang !== s.lang) await setLang(s.lang);
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') || (() => {
    const m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m); return m;
  })();
  meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#04070C';
  document.querySelectorAll('[data-exam-hide]').forEach((el) => { el.hidden = !!s.examMode; });
  document.querySelectorAll('[data-amy-entry]').forEach((el) => { if (!s.examMode) el.hidden = !s.amy; });
  bus.emit('settings', s);
}

export function updateSettings(patch) {
  Object.assign(app.settings, patch);
  saveSettings(app.settings);
  return applySettings();
}

export const reducedMotion = () => {
  const s = app.settings;
  if (s && s.motion === 'reduced') return true;
  if (s && s.motion === 'full') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};
