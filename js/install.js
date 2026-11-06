// Install Nexlyr Calculator as an app (PWA). Uses the browser's own install
// prompt where it exists (Chrome, Edge, Samsung Internet, Android); otherwise
// shows the right steps for the device (iPhone/iPad Safari, Firefox, desktop).

import { h, icon, openSheet, toast } from './ui.js';
import { t } from './i18n/index.js';
import { app, bus } from './bus.js';
import { play } from './sfx.js';

export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
  syncButtons();
  bus.emit('installable', true);
});
window.addEventListener('appinstalled', () => {
  app.installPrompt = null;
  syncButtons();
  play('achieve');
  toast(t('install.done'), { kind: 'ok', duration: 4000 });
});

export function syncButtons() {
  const show = !isInstalled();
  document.querySelectorAll('[data-action="install"]').forEach((b) => {
    b.hidden = !show;
    b.classList.toggle('ready', !!app.installPrompt);
  });
}

export async function installApp() {
  if (isInstalled()) { toast(t('install.already'), { kind: 'ok' }); return; }
  const p = app.installPrompt;
  if (p) {
    try {
      p.prompt();
      const choice = await p.userChoice;
      if (choice && choice.outcome === 'accepted') app.installPrompt = null;
    } catch { /* prompt already used */ }
    syncButtons();
    return;
  }
  showSteps();
}

function platform() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return /firefox/i.test(ua) ? 'androidFirefox' : 'android';
  if (/firefox/i.test(ua)) return 'firefox';
  if (/safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua)) return 'mac';
  return 'desktop';
}

function showSteps() {
  const p = platform();
  const steps = { ios: ['install.ios1', 'install.ios2', 'install.ios3'], android: ['install.and1', 'install.and2', 'install.and3'],
    androidFirefox: ['install.aff1', 'install.aff2'], firefox: ['install.ff1', 'install.ff2'], mac: ['install.mac1', 'install.mac2'],
    desktop: ['install.dk1', 'install.dk2', 'install.dk3'] }[p];
  const perks = ['install.p1', 'install.p2', 'install.p3', 'install.p4'];
  const body = h('div', { class: 'panel install' },
    h('div', { class: 'inst-hero' },
      h('img', { src: '/icons/icon-192.png', alt: '', width: 72, height: 72, class: 'inst-icon' }),
      h('div', {}, h('b', { text: t('app.name') }), h('span', { class: 't2', text: t('install.body') }))),
    h('ul', { class: 'inst-perks' }, perks.map((k) => h('li', {}, icon('check', 'sm'), t(k)))),
    h('h3', { class: 'ln-h', text: t('install.how') }),
    h('ol', { class: 'inst-steps' }, steps.map((k, i) => h('li', {}, h('span', { class: 'n', text: String(i + 1) }), h('span', { text: t(k) })))));
  openSheet({ title: t('install.title'), icon: 'download', body });
}
