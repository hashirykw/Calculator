// About sheet: version, what's new, keyboard shortcuts, Nexlyr contact,
// privacy and open-source licences.

import { h, icon, mark, openSheet } from './ui.js';
import { t } from './i18n/index.js';
import { CONFIG } from './config.js';

let sheet = null;
export async function mount(el) { el.append(build()); }

export function openAbout(focus) {
  if (sheet) return;
  sheet = openSheet({ title: t('about.title'), body: build(), onClose: () => { sheet = null; } });
  if (focus) setTimeout(() => sheet && sheet.el.querySelector(`[data-sec="${focus}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
}

const link = (href, iconName, label) => h('a', { class: 'btn', href, target: href.startsWith('http') ? '_blank' : undefined, rel: 'noopener' }, icon(iconName, 'sm'), label);
const SHORTCUTS = [
  ['Ctrl / ⌘ + K', 'about.k.search'], ['Ctrl / ⌘ + /', 'about.k.launcher'], ['Enter or =', 'about.k.equals'], ['Esc', 'about.k.clear'], ['Backspace', 'about.k.back'],
  ['↑ ↓', 'about.k.history'], ['s c t l', 'about.k.fns'], ['( )  ^  !  %', 'about.k.ops'], ['p / e', 'about.k.consts'],
];

function build() {
  const n = CONFIG.nexlyr;
  return h('div', { class: 'panel about' },
    h('div', { class: 'about-head' }, mark('about-mark'),
      h('div', {}, h('h3', { text: t('app.name') }), h('div', { class: 't2', text: `${t('about.version', { v: CONFIG.version })} · ${t('app.credit')}` }))),
    h('section', { class: 'card' }, h('h3', { class: 'section-title', text: t('about.whatsNew') }), h('p', { text: t('about.whatsNewBody') }),
      h('ul', { class: 'about-list' }, ['about.new6', 'about.new1', 'about.new2', 'about.new3', 'about.new4', 'about.new5'].map((k) => h('li', { text: t(k) })))),
    h('section', { class: 'card' }, h('h3', { class: 'section-title', text: t('about.shortcuts') }),
      h('div', { class: 'kbd-grid' }, SHORTCUTS.map(([k, d]) => [h('kbd', { text: k }), h('span', { text: t(d) })]))),
    h('section', { class: 'card about-cta' }, h('p', { text: t('about.nexlyr') }), h('p', { class: 'strong', text: t('about.cta') }),
      h('div', { class: 'btn-row' },
        link(n.website, 'external', t('about.website')), link(`mailto:${n.email}`, 'mail', t('about.email')),
        link(n.instagram, 'instagram', `${t('about.instagram')} ${n.instagramHandle}`), link(n.whatsapp, 'whatsapp', t('about.whatsapp')))),
    h('section', { class: 'card', data: { sec: 'privacy' } }, h('h3', { class: 'section-title', text: t('about.privacy') }),
      ...['about.privacy1', 'about.privacy2', 'about.privacy5', 'about.privacy3', 'about.privacy4'].map((k) => h('p', { text: t(k) }))),
    h('section', { class: 'card' }, h('h3', { class: 'section-title', text: t('about.licences') }), h('p', { class: 't2', text: t('about.licencesBody') })),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/help', on: { click: (e) => { e.preventDefault(); sheet && sheet.close(); setTimeout(() => { location.hash = '#/help'; }, 140); } } }, icon('help', 'sm'), t('about.help'))));
}
