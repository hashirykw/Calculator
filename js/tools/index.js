// Tools hub (section 14/16): grouped cards, a quick filter, and lazy-loaded
// tool pages at #/tools/<id>. Each tool page is built once and kept, so
// going back keeps what you typed.

import { h, icon, clear, switchInput } from '../ui.js';
import { t } from '../i18n/index.js';
import { bus, app } from '../bus.js';
import { updateSettings } from '../prefs.js';

export const TOOLS = [
  { id: 'equations', icon: 'func', group: 'maths', load: () => import('./equations.js') },
  { id: 'fractions', icon: 'divide', group: 'maths', load: () => import('./fractions.js') },
  { id: 'matrix', icon: 'grid', group: 'maths', load: () => import('./matrix.js') },
  { id: 'stats', icon: 'bars', group: 'maths', load: () => import('./stats.js') },
  { id: 'trig', icon: 'triangle', group: 'maths', load: () => import('./trig.js') },
  { id: 'base', icon: 'binary', group: 'maths', load: () => import('./base.js') },
  { id: 'formulas', icon: 'book', group: 'maths', load: () => import('./formulas.js') },
  { id: 'numtheory', icon: 'hash', group: 'maths', load: () => import('./numtheory.js') },
  { id: 'sequences', icon: 'list', group: 'maths', load: () => import('./sequences.js') },
  { id: 'vectors', icon: 'move', group: 'maths', load: () => import('./vectors.js') },
  { id: 'complex', icon: 'orbit', group: 'maths', load: () => import('./complex.js') },
  { id: 'grades', icon: 'cap', group: 'student', load: () => import('./grades.js') },
  { id: 'gpa', icon: 'trophy', group: 'student', load: () => import('./gpa.js') },
  { id: 'physics', icon: 'atom', group: 'student', load: () => import('./physics.js') },
  { id: 'chemistry', icon: 'flask', group: 'student', load: () => import('./chemistry.js') },
  { id: 'constants', icon: 'bulb', group: 'student', load: () => import('./constants.js') },
  { id: 'geo', icon: 'globe', group: 'everyday', load: () => import('./geo.js') },
  { id: 'converter', icon: 'ruler', group: 'everyday', load: () => import('./converter.js') },
  { id: 'finance', icon: 'money', group: 'everyday', load: () => import('./finance.js') },
  { id: 'zakat', icon: 'coins', group: 'everyday', load: () => import('./zakat.js') },
  { id: 'dates', icon: 'calendar', group: 'everyday', load: () => import('./dates.js') },
  { id: 'time', icon: 'clock', group: 'everyday', load: () => import('./time.js') },
  { id: 'health', icon: 'health', group: 'everyday', load: () => import('./health.js') },
  { id: 'random', icon: 'dice', group: 'everyday', load: () => import('./random.js') },
];
const GROUPS = ['maths', 'student', 'everyday'];

let sec, hub, host, filterInput, grids = {}, examSwitch;
const cache = new Map();
let currentId = null;

export async function mount(el, r) {
  sec = el;
  hub = buildHub();
  host = h('div', { class: 'tool-host', hidden: true });
  sec.append(hub, host);
  bus.on('settings', () => { if (examSwitch) examSwitch.querySelector('input').checked = !!app.settings.examMode; });
  await show(r);
}

function buildHub() {
  filterInput = h('input', { class: 'input', type: 'search', placeholder: t('tools.filter'), 'aria-label': t('tools.filter'), on: { input: filter } });
  const wrap = h('div', { class: 'screen tools-hub' },
    h('div', { class: 'screen-head' }, h('h1', { text: t('nav.tools') }), h('p', { text: t('tools.subtitle') }), filterInput),
    h('div', { class: 'hub-feature' },
      h('a', { class: 'feature-card geo', href: '#/tools/geo' }, h('span', { class: 'fc-kick', text: t('tools.new') }), h('b', { text: t('tool.geo') }), h('span', { text: t('tool.geo.d') }), icon('globe', 'fc-ic')),
      h('a', { class: 'feature-card arcade', href: '#/arcade', 'data-exam-hide': '' }, h('span', { class: 'fc-kick', text: t('arcade.g.brain') }), h('b', { text: t('arcade.title') }), h('span', { text: t('arcade.subtitle') }), icon('arcade', 'fc-ic'))));
  for (const g of GROUPS) {
    const grid = h('div', { class: 'hub-grid' });
    for (const tool of TOOLS.filter((x) => x.group === g)) {
      grid.append(h('a', { class: 'tool-card', href: `#/tools/${tool.id}`, data: { id: tool.id, words: `${t(`tool.${tool.id}`)} ${t(`tool.${tool.id}.d`)} ${t(`tool.${tool.id}.k`)}`.toLowerCase() } },
        h('span', { class: 'ic' }, icon(tool.icon)),
        h('span', {}, h('h3', { text: t(`tool.${tool.id}`) }), h('p', { text: t(`tool.${tool.id}.d`) }))));
    }
    grids[g] = h('section', { class: 'hub-group' }, h('h2', { class: 'section-title', text: t(`tools.g.${g}`) }), grid);
    wrap.append(grids[g]);
    if (g === 'student') {
      examSwitch = switchInput(app.settings.examMode, (v) => updateSettings({ examMode: v }), t('set.exam'));
      grids[g].append(h('div', { class: 'set-row exam-row' }, icon('shield'),
        h('div', { class: 'grow' }, h('div', { text: t('set.exam') }), h('div', { class: 't2', text: t('set.exam.help') })), examSwitch));
    }
  }
  wrap.append(h('p', { class: 'note-box', hidden: true, 'data-nomatch': '', text: t('search.empty') }));
  return wrap;
}

function filter() {
  const q = filterInput.value.trim().toLowerCase();
  let any = false;
  for (const g of GROUPS) {
    let shown = 0;
    grids[g].querySelectorAll('.tool-card').forEach((c) => {
      const hit = !q || q.split(/\s+/).every((w) => c.dataset.words.includes(w));
      c.hidden = !hit;
      if (hit) shown++;
    });
    grids[g].hidden = !shown && !!q;
    if (shown) any = true;
  }
  hub.querySelector('[data-nomatch]').hidden = any;
}

export async function show(r) {
  const id = r && r.sub && r.sub[0];
  if (currentId && currentId !== id) cache.get(currentId)?.hide?.();
  if (!id) {
    currentId = null;
    host.hidden = true;
    hub.hidden = false;
    document.title = t('title.tools');
    return;
  }
  const def = TOOLS.find((x) => x.id === id);
  if (!def) { location.replace('#/tools'); return; }
  hub.hidden = true;
  host.hidden = false;
  currentId = id;
  document.title = t('title.tool', { name: t(`tool.${id}`) });
  let inst = cache.get(id);
  if (!inst) {
    clear(host).append(h('div', { class: 'empty' }, h('span', { class: 'spinner' })));
    const mod = await def.load();
    inst = mod.create(r);
    cache.set(id, inst);
  }
  if (currentId !== id) return;
  clear(host).append(inst.root);
  inst.show && inst.show(r);
  sec.scrollTop = 0;
  bus.emit('tool:used', id);
}

export function hide() {
  if (currentId) cache.get(currentId)?.hide?.();
}
