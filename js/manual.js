// The illustrated manual screen (#/manual): a sticky contents list, chapters
// with real screenshots, numbered tour hotspots, steps, tips, shortcuts and FAQ.
// "Print / save as PDF" uses the browser's print dialog with print styles.

import { h, icon, openSheet, clear } from './ui.js';
import { CHAPTERS, QUICK, SHORTCUTS, FAQ } from './manual-content.js';
import { CONFIG } from './config.js';

const img = (name) => new URL(`../manual/${name}.webp`, import.meta.url).href;
let sec, scroller, spotsP = null, observer = null;

const loadSpots = () => (spotsP = spotsP || fetch(new URL('../manual/spots.json', import.meta.url)).then((r) => r.json()).catch(() => ({})));

export async function mount(el) {
  sec = el;
  scroller = el;   // the view itself scrolls
  const spots = await loadSpots();
  el.append(build(spots));
  watch();
}
export function show() { watch(); }
export function hide() { if (observer) { observer.disconnect(); observer = null; } }

function build(spots) {
  const pad = (n) => String(n).padStart(2, '0');
  const filter = h('input', { class: 'input', type: 'search', placeholder: 'Search the manual', 'aria-label': 'Search the manual' });
  const progress = h('div', { class: 'man-progress', 'aria-hidden': 'true' }, h('i'));

  const toc = h('nav', { class: 'man-toc', 'aria-label': 'Manual contents' },
    h('div', { class: 'man-toc-h' }, icon('book', 'sm'), 'Contents'),
    h('ol', {}, [...CHAPTERS.map((c, i) => h('li', {}, h('a', { href: `#m-${c.id}`, 'data-id': c.id, style: { '--c': c.color }, on: { click: (e) => jump(e, c.id) } },
      h('span', { class: 'n', text: pad(i + 1) }), h('span', { class: 'ti' }, icon(c.icon, 'sm')), h('span', { class: 'tt', text: c.title })))),
    h('li', {}, h('a', { href: '#m-keys', 'data-id': 'keys', style: { '--c': '#6E58F0' }, on: { click: (e) => jump(e, 'keys') } }, h('span', { class: 'n', text: '⌘' }), h('span', { class: 'ti' }, icon('keyboard', 'sm')), h('span', { class: 'tt', text: 'Keyboard shortcuts' }))),
    h('li', {}, h('a', { href: '#m-faq', 'data-id': 'faq', style: { '--c': '#E09A00' }, on: { click: (e) => jump(e, 'faq') } }, h('span', { class: 'n', text: '?' }), h('span', { class: 'ti' }, icon('help', 'sm')), h('span', { class: 'tt', text: 'Questions' })))]));

  const hero = h('header', { class: 'man-hero' },
    h('div', { class: 'man-hero-txt' },
      h('span', { class: 'man-kick' }, icon('book', 'sm'), 'User manual'),
      h('h1', {}, 'How to use ', h('span', { class: 'grad-t', text: 'Nexlyr Calculator' })),
      h('p', { text: 'A visual guide to every screen: the calculator, step-by-step solving, graphs, all 24 tools, the Earth & Geo globe, Amy, the arcade, themes, sounds and installing the app.' }),
      h('div', { class: 'man-hero-actions' }, filter,
        h('button', { class: 'btn', type: 'button', on: { click: () => window.print() } }, icon('filedown', 'sm'), 'Print or save as PDF'))),
    h('div', { class: 'man-quick' }, QUICK.map(([ic, title, text], i) => h('div', { class: 'mq' },
      h('span', { class: 'mq-n', text: String(i + 1) }), h('span', { class: 'mq-ic' }, icon(ic)), h('b', { text: title }), h('p', { text })))));

  const chapters = CHAPTERS.map((c, i) => chapter(c, i, spots));
  const keys = h('section', { class: 'man-ch', id: 'm-keys', style: { '--c': '#6E58F0' }, 'data-words': 'keyboard shortcuts keys ctrl' },
    head({ icon: 'keyboard', title: 'Keyboard shortcuts', lead: 'Work faster on a computer.' }, 0, 'Reference'),
    h('div', { class: 'man-keys' }, SHORTCUTS.map(([k, d]) => h('div', { class: 'mk' }, h('kbd', { text: k }), h('span', { text: d })))));
  const faq = h('section', { class: 'man-ch', id: 'm-faq', style: { '--c': '#E09A00' }, 'data-words': FAQ.flat().join(' ').toLowerCase() },
    head({ icon: 'help', title: 'Questions', lead: 'Quick answers to common questions.' }, 0, 'Help'),
    h('div', { class: 'man-faq' }, FAQ.map(([q, a], i) => h('details', { open: i === 0 }, h('summary', {}, h('span', { text: q }), icon('down', 'sm')), h('p', { text: a })))));
  const end = h('footer', { class: 'man-end' },
    h('div', {}, h('b', { text: 'Still stuck?' }), h('p', { text: 'Ask Amy, or write to Nexlyr and we’ll help.' })),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn primary', href: '#/amy' }, icon('amy', 'sm'), 'Ask Amy'),
      h('a', { class: 'btn', href: `mailto:${CONFIG.nexlyr.email}?subject=Nexlyr%20Calculator%20help` }, icon('mail', 'sm'), CONFIG.nexlyr.email)));
  const none = h('p', { class: 'note-box', hidden: true, text: 'Nothing in the manual matches that. Try a shorter word.' });

  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let any = false;
    [...chapters, keys, faq].forEach((s) => { const hit = !q || q.split(/\s+/).every((w) => s.dataset.words.includes(w)); s.hidden = !hit; if (hit) any = true; });
    none.hidden = any;
    toc.querySelectorAll('a[data-id]').forEach((a) => { const s = document.getElementById(`m-${a.dataset.id}`); a.parentElement.hidden = !!(s && s.hidden); });
  });

  return h('div', { class: 'manual' }, progress, hero,
    h('div', { class: 'man-layout' }, toc, h('div', { class: 'man-main' }, ...chapters, keys, faq, none, end)));
}

function head(c, n, label) {
  return h('div', { class: 'man-head' },
    h('span', { class: 'man-badge' }, icon(c.icon)),
    h('div', { class: 'man-ht' }, h('span', { class: 'man-num', text: label || `Chapter ${n}` }), h('h2', { text: c.title }), c.lead ? h('p', { text: c.lead }) : null),
    c.go ? h('a', { class: 'btn man-go', href: c.go[0] }, c.go[1], icon('right', 'sm')) : null);
}

function figure(f, kind = 'desk', tour = null, side = false) {
  const pic = h('img', { src: img(f.src), alt: f.alt, loading: 'lazy', decoding: 'async', width: kind === 'phone' ? 390 : 1280, height: kind === 'phone' ? 844 : 800 });
  const frame = h('div', { class: `man-frame ${kind}` },
    kind === 'desk' ? h('div', { class: 'man-bar', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('span', { text: 'calculator.nexlyr.solutions' })) : null,
    h('div', { class: 'man-shot' }, pic, tour ? hotspots(tour) : null,
      h('button', { class: 'man-zoom', type: 'button', 'aria-label': `Enlarge: ${f.alt}`, title: 'Enlarge', on: { click: () => zoom(f) } }, icon('expand', 'sm'))));
  const fig = h('figure', { class: `man-fig ${kind}${side ? ' side' : ''}` }, frame, f.caption ? h('figcaption', { text: f.caption }) : null);
  if (tour) fig.append(legend(tour, fig));
  return fig;
}

function hotspots(list) {
  return h('div', { class: 'man-spots' }, list.map((s) => h('button', {
    class: 'man-spot', type: 'button', style: { left: `${s.x}%`, top: `${s.y}%`, '--d': `${s.n * 60}ms` }, 'data-n': String(s.n), 'aria-label': `${s.n}: ${s.label}`,
    on: { mouseenter: (e) => mark(e, s.n, true), mouseleave: (e) => mark(e, s.n, false), focus: (e) => mark(e, s.n, true), blur: (e) => mark(e, s.n, false) } },
  h('span', { text: String(s.n) }), h('em', { text: s.label }))));
}
function legend(list, fig) {
  return h('ol', { class: 'man-legend' }, list.map((s) => h('li', {
    'data-n': String(s.n), tabindex: '0',
    on: { mouseenter: () => markIn(fig, s, true), mouseleave: () => markIn(fig, s, false), focus: () => markIn(fig, s, true), blur: () => markIn(fig, s, false) } },
  h('span', { class: 'n', text: String(s.n) }), s.label)));
}
function markIn(fig, s, on) {
  const shot = fig.querySelector('.man-shot');
  shot.querySelector(`.man-spot[data-n="${s.n}"]`)?.classList.toggle('on', on);
  let box = shot.querySelector('.man-box');
  if (!on) { box && box.remove(); return; }
  if (!box) { box = h('i', { class: 'man-box' }); shot.append(box); }
  Object.assign(box.style, { left: `${s.box[0]}%`, top: `${s.box[1]}%`, width: `${s.box[2]}%`, height: `${s.box[3]}%` });
}
function mark(e, n, on) {
  e.currentTarget.closest('.man-fig')?.querySelectorAll(`.man-legend li[data-n="${n}"]`).forEach((li) => li.classList.toggle('on', on));
}

function chapter(c, i, spots) {
  const n = String(i + 1).padStart(2, '0');
  const words = [c.title, c.lead, ...(c.steps || []), ...(c.tips || []), ...(c.keys || []).flat(), c.img?.caption, c.img2?.caption].join(' ').toLowerCase();
  // the tour shows the computer full width, then the phone with its numbered list beside it
  const media = c.tour
    ? [figure(c.img, 'desk', spots[c.tour]), h('h3', { class: 'man-h3 man-phone-h' }, icon('phone', 'sm'), 'On a phone'), figure(c.phone, 'phone', spots[c.phone.tour], true)]
    : c.phone
      ? h('div', { class: 'man-pair' }, figure(c.img, 'desk'), figure(c.phone, 'phone'))
      : figure(c.img, 'desk');
  return h('section', { class: 'man-ch', id: `m-${c.id}`, style: { '--c': c.color }, 'data-words': words },
    head(c, n), media,
    c.steps ? h('div', { class: 'man-steps-wrap' }, h('h3', { class: 'man-h3' }, icon('list', 'sm'), 'Step by step'),
      h('ol', { class: 'man-steps' }, c.steps.map((s, k) => h('li', { style: { '--k': String(k) } }, h('span', { class: 'n', text: String(k + 1) }), h('span', { text: s }))))) : null,
    c.img2 ? figure(c.img2) : null,
    c.keys ? h('div', { class: 'man-keys small' }, c.keys.map(([k, d]) => h('div', { class: 'mk' }, h('kbd', { text: k }), h('span', { text: d })))) : null,
    c.tips ? h('aside', { class: 'man-tips' }, h('b', {}, icon('bulb', 'sm'), 'Tips'), h('ul', {}, c.tips.map((tx) => h('li', { text: tx })))) : null);
}

function zoom(f) {
  openSheet({ title: f.alt, icon: 'image', wide: true, body: h('div', { class: 'man-zoomed' }, h('img', { src: img(f.src), alt: f.alt }), f.caption ? h('p', { class: 't2', text: f.caption }) : null) });
}

function jump(e, id) {
  e.preventDefault();   // the address bar hash belongs to the app router
  const el = document.getElementById(`m-${id}`);
  if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function watch() {
  if (!sec || observer) return;
  const links = () => sec.querySelectorAll('.man-toc a[data-id]');
  observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const id = en.target.id.replace('m-', '');
      links().forEach((a) => a.classList.toggle('on', a.dataset.id === id));
      const on = sec.querySelector(`.man-toc a[data-id="${id}"]`);
      if (on && matchMedia('(max-width: 1023px)').matches) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, { root: scroller, rootMargin: '-20% 0px -70% 0px' });
  sec.querySelectorAll('.man-ch').forEach((s) => observer.observe(s));
  const bar = sec.querySelector('.man-progress i');
  scroller.addEventListener('scroll', () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? scroller.scrollTop / max : 0})`;
  }, { passive: true });
}
