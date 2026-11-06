// "Download app": installs Nexlyr Calculator as an app in one tap.
// Chrome, Edge, Samsung Internet, Opera and Android browsers: the button opens
// the browser's own install dialog straight away (the install event is caught
// early in boot-theme.js so it is never missed).
// iPhone and iPad Safari have no install API, so the button shows one arrow
// pointing at Safari's Share button with the single tap to make.

import { h, icon, toast } from './ui.js';
import { t } from './i18n/index.js';
import { app, bus } from './bus.js';
import { play } from './sfx.js';

export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: window-controls-overlay)').matches
  || window.matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;

function take() {
  if (window.__nxInstall) { app.installPrompt = window.__nxInstall; syncButtons(); bus.emit('installable', true); }
}
take();
window.addEventListener('nx-installable', take);
window.addEventListener('appinstalled', () => {
  app.installPrompt = null; window.__nxInstall = null;
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

const ua = navigator.userAgent;
const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
const isIPad = /ipad/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

export async function installApp() {
  if (isInstalled()) { toast(t('install.already'), { kind: 'ok' }); return; }
  const p = app.installPrompt || window.__nxInstall;
  if (p) {
    try {
      await p.prompt();                       // the browser's own install dialog, right away
      const choice = await p.userChoice;
      if (choice && choice.outcome === 'accepted') { app.installPrompt = null; window.__nxInstall = null; }
    } catch { /* a prompt can be used once; the browser offers a new one later */ }
    syncButtons();
    return;
  }
  if (isIOS) { pointAtShare(); return; }
  // Desktop or Android browser that hasn't offered installing yet (for example it was dismissed a moment ago)
  toast(t('install.browser'), { kind: 'info', duration: 7000 });
}

// iPhone / iPad: one arrow to Safari's Share button and the single option to tap.
function pointAtShare() {
  document.querySelector('.ios-coach')?.remove();
  const close = () => { coach.classList.add('out'); setTimeout(() => coach.remove(), 220); };
  const coach = h('div', { class: `ios-coach ${isIPad ? 'top' : 'bottom'}`, role: 'dialog', 'aria-label': t('install.btn'), on: { click: close } },
    h('div', { class: 'ios-card' },
      h('img', { src: '/icons/icon-192.png', alt: '', width: 48, height: 48 }),
      h('div', {}, h('b', { text: t('install.iosTap') }), h('span', {}, icon('iosshare', 'sm'), t('install.iosThen')))),
    h('div', { class: 'ios-arrow', 'aria-hidden': 'true' }, icon(isIPad ? 'up' : 'down')));
  document.body.append(coach);
  setTimeout(close, 12000);
}
