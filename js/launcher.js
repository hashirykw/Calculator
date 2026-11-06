// "Everything" panel: every screen, panel, tool and game in one place, each
// with its own icon and colour, plus quick switches for theme, sound and
// glass. Opened from the grid button in the top bar or Ctrl+/ (Cmd+/).

import { h, icon, openSheet, clear } from './ui.js';
import { t } from './i18n/index.js';
import { app } from './bus.js';
import { updateSettings } from './prefs.js';
import { TOOL_ID, GAME_ID, SCREEN_ID } from './identity.js';
import { play } from './sfx.js';
import { installApp, isInstalled } from './install.js';

let sheet = null;
const GROUPS = { maths: ['equations', 'fractions', 'matrix', 'stats', 'trig', 'base', 'formulas', 'numtheory', 'sequences', 'vectors', 'complex'],
  student: ['grades', 'gpa', 'physics', 'chemistry', 'constants'], everyday: ['geo', 'converter', 'finance', 'zakat', 'dates', 'time', 'health', 'random'] };
const GAMES = Object.keys(GAME_ID);
const QUICK_THEMES = ['frost', 'aurora', 'nebula', 'lagoon', 'ember', 'sakura', 'citrus', 'mint', 'arctic', 'nexlyr-dark', 'nexlyr-light'];

export function openLauncher() {
  if (sheet) return;
  const filter = h('input', { class: 'input', type: 'search', placeholder: t('ln.filter'), 'aria-label': t('ln.filter') });
  const body = h('div', { class: 'launcher' });
  const go = (fn) => () => { sheet.close(); setTimeout(fn, 170); };
  const nav = (hash) => go(() => { location.hash = hash; });
  const tile = (iconName, color, title, sub, onClick, extra = {}) => h('button', {
    class: 'ln-tile', type: 'button', style: { '--c': color }, 'data-words': `${title} ${sub || ''}`.toLowerCase(), on: { click: onClick }, ...extra },
  h('span', { class: 'ln-ic' }, icon(iconName)), h('span', { class: 'ln-t' }, h('b', { text: title }), sub ? h('small', { text: sub }) : null));
  const section = (title, tiles, cls = '') => h('section', { class: `ln-sec ${cls}` }, h('h3', { class: 'ln-h', text: title }), h('div', { class: 'ln-grid' }, tiles));

  // quick switches
  const quick = h('div', { class: 'ln-quick' });
  const drawQuick = () => {
    const s = app.settings;
    clear(quick).append(
      h('button', { class: 'ln-q', type: 'button', 'aria-pressed': String(s.sfx !== false), 'data-nosfx': '', on: { click: () => { const v = s.sfx === false; updateSettings({ sfx: v }); if (v) play('on', { force: true }); drawQuick(); } } },
        icon(s.sfx === false ? 'offline' : 'music', 'sm'), t('ln.sound')),
      h('button', { class: 'ln-q', type: 'button', 'aria-pressed': String(!!s.glass), on: { click: () => { updateSettings({ glass: !s.glass }); drawQuick(); } } }, icon('layers', 'sm'), t('set.glass')),
      h('button', { class: 'ln-q', type: 'button', on: { click: () => {
        const i = QUICK_THEMES.indexOf(s.theme);
        updateSettings({ theme: QUICK_THEMES[(i + 1) % QUICK_THEMES.length] }); drawQuick();
      } } }, icon('palette', 'sm'), h('span', {}, t('ln.theme'), ': ', h('b', { text: t(`theme.${s.theme}`) }))),
      h('button', { class: 'ln-q', type: 'button', on: { click: go(() => import('./settings.js').then((m) => m.openSettings())) } }, icon('settings', 'sm'), t('nav.settings')),
      isInstalled() ? null : h('button', { class: 'ln-q ln-install', type: 'button', on: { click: go(() => installApp()) } }, icon('download', 'sm'), t('install.btn')));
  };
  drawQuick();

  const exam = !!app.settings.examMode;
  const screens = [
    ['calc', t('nav.calc'), t('ln.calc.d'), '#/calc'], ['solve', t('nav.solve'), t('ln.solve.d'), '#/solve'], ['graph', t('nav.graph'), t('ln.graph.d'), '#/graph'],
    ['tools', t('nav.tools'), t('ln.tools.d'), '#/tools'], ...(exam ? [] : [['arcade', t('nav.arcade'), t('ln.arcade.d'), '#/arcade'], ['amy', t('nav.amy'), t('ln.amy.d'), '#/amy']]),
    ['manual', t('nav.manual'), t('ln.manual.d'), '#/manual'],
    ['help', t('nav.help'), t('ln.help.d'), '#/help'],
  ].map(([id, title, sub, hash]) => tile(SCREEN_ID[id][0], SCREEN_ID[id][1], title, sub, nav(hash)));
  const panels = [
    ['search', '#4382EE', t('nav.search'), 'Ctrl + K', () => import('./search.js').then((m) => m.openSearch())],
    ['history', '#1584A8', t('nav.history'), t('ln.history.d'), () => import('./history.js').then((m) => m.openHistory())],
    ['settings', '#8A6CF0', t('nav.settings'), t('ln.settings.d'), () => import('./settings.js').then((m) => m.openSettings())],
    ['trophy', '#E09A00', t('set.achievements'), t('ln.ach.d'), () => import('./settings.js').then((m) => m.openSettings('achievements'))],
    ['info', '#0E9CC4', t('nav.about'), t('ln.about.d'), () => import('./about.js').then((m) => m.openAbout())],
  ].map(([ic, c, title, sub, fn]) => tile(ic, c, title, sub, go(fn)));

  body.append(h('div', { class: 'ln-top' }, filter), quick,
    section(t('ln.screens'), screens), section(t('ln.panels'), panels),
    ...Object.entries(GROUPS).map(([g, ids]) => section(`${t('nav.tools')} · ${t(`tools.g.${g}`)}`, ids.map((id) => tile(TOOL_ID[id][0], TOOL_ID[id][1], t(`tool.${id}`), t(`tool.${id}.d`), nav(`#/tools/${id}`))))),
    exam ? null : section(t('nav.arcade'), GAMES.map((id) => tile(GAME_ID[id][0], GAME_ID[id][1], t(`game.${id}`), t(`game.${id}.d`), nav(`#/arcade/${id}`))), 'ln-games'),
    h('p', { class: 'note-box', hidden: true, 'data-none': '', text: t('search.empty') }));

  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let any = false;
    body.querySelectorAll('.ln-sec').forEach((sec) => {
      let n = 0;
      sec.querySelectorAll('.ln-tile').forEach((b) => { const hit = !q || q.split(/\s+/).every((w) => b.dataset.words.includes(w)); b.hidden = !hit; if (hit) n++; });
      sec.hidden = !n; if (n) any = true;
    });
    body.querySelector('[data-none]').hidden = any;
  });
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = [...body.querySelectorAll('.ln-tile')].find((b) => !b.hidden && !b.closest('[hidden]')); first && first.click(); }
  });

  sheet = openSheet({ title: t('ln.title'), icon: 'apps', body, wide: true, onClose: () => { sheet = null; } });
}
