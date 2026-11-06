// Settings sheet: appearance (theme gallery, glass, text size, motion), maths,
// keypad & feedback, Amy, language & region, exam mode, achievements and data.

import { play, SFX_PACKS } from './sfx.js';
import { h, icon, clear, openSheet, seg, switchInput, confirmDialog, downloadBlob, toast, button } from './ui.js';
import { t } from './i18n/index.js';
import { app } from './bus.js';
import { store } from './store.js';
import { updateSettings } from './prefs.js';
import { getAchievements } from './achievements.js';
import { QUARTILE_METHODS } from './core/stats.js';

// bg, surface, accent — for the swatches (from css/app.css tokens)
export const THEMES = {
  frost: ['#2A2826', '#5C5955', '#F1EBDA'],
  'nexlyr-dark': ['#04070C', '#0A1420', '#00A2DC'], 'nexlyr-light': ['#F4F7FA', '#FFFFFF', '#006AB1'], paper: ['#FFFFFF', '#F2F2F2', '#003C96'],
  'cyber-lab': ['#050B14', '#0B1626', '#22D3EE'], kawaii: ['#FFF5FA', '#FFFFFF', '#C2185B'], 'rose-gold': ['#1A1214', '#241A1C', '#E8A598'],
  rainbow: ['#0E0E14', '#17171F', '#A78BFA'], forest: ['#0C1410', '#13201A', '#4ADE80'], 'deep-ocean': ['#041019', '#08202F', '#38BDF8'],
  gothic: ['#0A0A0A', '#141414', '#E5E5E5'], 'candy-pop': ['#FFF8EC', '#FFFFFF', '#C2410C'], sunset: ['#170D0A', '#22140F', '#FB923C'],
  'midnight-rose': ['#12080E', '#1C0F17', '#F472B6'],
  aurora: ['#0A0B1E', '#1B1D45', '#6FF0C8'], nebula: ['#0C0716', '#2A1747', '#D18CFF'], lagoon: ['#031A1F', '#0E3A44', '#3EE6D0'], ember: ['#170908', '#3A1A14', '#FF8A4C'],
  sakura: ['#FFF0F4', '#FFFFFF', '#D63A74'], citrus: ['#FFF7E0', '#FFFFFF', '#D9620B'], mint: ['#EAFBF4', '#FFFFFF', '#0C9A72'], arctic: ['#EEF3FB', '#FFFFFF', '#2F6BEA'],
};
const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'INR', 'BDT', 'CNY', 'JPY', 'MYR', 'TRY', 'CAD', 'AUD'];
let sheet = null;

export async function mount(el) { el.append(build()); }

export function openSettings(focus) {
  if (sheet) return;
  sheet = openSheet({ title: t('set.title'), body: build(), wide: true, onClose: () => { sheet = null; } });
  if (focus) setTimeout(() => sheet && sheet.el.querySelector(`[data-sec="${focus}"]`)?.scrollIntoView({ block: 'start' }), 120);
}

function sfxPacks() {
  const wrap = h('div', { class: 'sfx-packs', role: 'radiogroup', 'aria-label': t('set.sfxPack') });
  const draw = () => {
    clear(wrap);
    for (const p of SFX_PACKS) {
      const on = (app.settings.sfxPack || 'soft') === p;
      wrap.append(h('button', { class: 'sfx-pack', type: 'button', role: 'radio', 'aria-checked': String(on), 'data-nosfx': '',
        on: { click: () => { updateSettings({ sfxPack: p }); play('success', { force: true, pack: p }); draw(); } } },
      icon(on ? 'play' : 'music', 'sm'), h('b', { text: t(`sfx.${p}`) }), h('small', { text: t(`sfx.${p}.d`) })));
    }
  };
  draw();
  return wrap;
}
function volumeSlider() {
  const r = h('input', { type: 'range', min: '0', max: '100', step: '5', class: 'range', value: String(Math.round((app.settings.sfxVolume ?? 0.6) * 100)), 'aria-label': t('set.sfxVolume') });
  r.addEventListener('change', () => { updateSettings({ sfxVolume: Number(r.value) / 100 }); play('eq', { force: true }); });
  return r;
}

const row = (label, help, control, iconName) => h('div', { class: 'set-row' }, iconName ? icon(iconName) : null,
  h('div', { class: 'grow' }, h('div', { text: label }), help ? h('div', { class: 't2', text: help }) : null), control);
const sw = (key, label, help, iconName, after) => row(label, help, switchInput(app.settings[key], (v) => { updateSettings({ [key]: v }); after && after(v); }, label), iconName);
const select = (key, options, label, after) => {
  const s = h('select', { class: 'input', 'aria-label': label, on: { change: () => { const v = typeof app.settings[key] === 'number' ? Number(s.value) : s.value; updateSettings({ [key]: v }); after && after(v); } } },
    options.map(([v, text]) => h('option', { value: String(v), text })));
  s.value = String(app.settings[key]);
  return s;
};
const group = (id, title, ...rows) => h('section', { class: 'set-group card', data: { sec: id } }, h('h3', { class: 'section-title', text: title }), ...rows);

function build() {
  const s = app.settings;
  const root = h('div', { class: 'panel settings' });
  if (!store.available) root.append(h('p', { class: 'note-box', text: t('set.storageOff') }));

  // ---- appearance ----
  const gallery = h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': t('set.theme') });
  const drawGallery = () => {
    clear(gallery);
    for (const id of ['system', ...Object.keys(THEMES)]) {
      const [bg, su, ac] = id === 'system' ? ['#04070C', '#F4F7FA', '#00A2DC'] : THEMES[id];
      const on = app.settings.theme === id;
      gallery.append(h('button', { class: 'theme-swatch', type: 'button', role: 'radio', 'aria-checked': String(on), title: t(`theme.sb.${id}`),
        style: { '--sw-bg': bg, '--sw-su': su, '--sw-ac': ac }, on: { click: () => { updateSettings({ theme: id }); drawGallery(); } } },
        h('span', { class: 'sw-chip', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('span', { class: 'sw-name', text: t(`theme.${id}`) }),
        h('span', { class: 'sw-sub', text: t(`theme.sb.${id}`) })));
    }
  };
  drawGallery();
  root.append(group('appearance', t('set.appearance'),
    h('div', { class: 'field' }, h('span', { class: 'label', text: t('set.theme') }), gallery),
    sw('glass', t('set.glass'), t('set.glass.help'), 'layers'),
    row(t('set.fontSize'), null, seg([['s', t('set.font.s')], ['m', t('set.font.m')], ['l', t('set.font.l')]], s.fontSize, (v) => updateSettings({ fontSize: v }), t('set.fontSize')), 'type'),
    row(t('set.motion'), null, seg([['system', t('set.motion.system')], ['reduced', t('set.motion.reduced')], ['full', t('set.motion.full')]], s.motion, (v) => updateSettings({ motion: v }), t('set.motion')), 'sliders')));

  // ---- maths ----
  root.append(group('maths', t('set.maths'),
    row(t('set.angle'), null, seg([['deg', 'DEG'], ['rad', 'RAD'], ['grad', 'GRAD']], s.angle, (v) => updateSettings({ angle: v }), t('set.angle')), 'triangle'),
    sw('exactFirst', t('set.exactFirst'), t('set.exactFirst.help'), 'divide'),
    row(t('set.sig'), null, select('sig', [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => [n, String(n)]), t('set.sig')), 'hash'),
    row(t('set.sciHigh'), null, select('sciHigh', [6, 8, 9, 10, 12, 15, 18, 21].map((n) => [n, `10^${n}`]), t('set.sciHigh')), 'expand'),
    sw('complex', t('set.complex'), t('set.complex.help'), 'orbit'),
    row(t('set.group'), null, select('group', [['intl', t('set.group.intl')], ['lakh', t('set.group.lakh')], ['none', t('set.group.none')]], t('set.group')), 'grid'),
    row(t('set.quartile'), t('set.quartile.help'), select('quartile', Object.keys(QUARTILE_METHODS).map((k) => [k, t(`stats.q.${k}`)]), t('set.quartile')), 'bars')));

  // ---- keypad & feedback ----
  root.append(group('feedback', t('set.feedback'),
    row(t('set.keypad'), null, seg([['scientific', t('calc.scientific')], ['basic', t('calc.basic')]], s.keypad, (v) => updateSettings({ keypad: v }), t('set.keypad')), 'keyboard'),
    sw('sfx', t('set.sfx'), t('set.sfx.help'), 'music'),
    h('div', { class: 'field sfx-field' }, h('span', { class: 'label', text: t('set.sfxPack') }), sfxPacks()),
    row(t('set.sfxVolume'), null, volumeSlider(), 'sound'),
    sw('sound', t('set.sound'), t('set.sound.help'), 'keyboard'),
    sw('vibrate', t('set.vibrate'), t('set.vibrate.help'), 'vibrate')));

  // ---- Amy ----
  root.append(group('amy', t('set.amy'),
    sw('amy', t('set.amyOn'), t('set.amyOn.help'), 'amy'),
    row(t('set.amyMode'), null, seg([['fast', t('amy.fast')], ['deep', t('amy.deep')]], s.amyMode, (v) => updateSettings({ amyMode: v }), t('set.amyMode')), 'bulb'),
    sw('amyHistory', t('set.amyHistory'), null, 'archive', (v) => { if (!v) store.remove('amy'); })));

  // ---- language & region ----
  root.append(group('region', t('set.region'),
    row(t('set.language'), null, seg([['en', 'English'], ['ur', 'اردو']], s.lang, async (v) => { await updateSettings({ lang: v }); toast(t('set.langChanged')); setTimeout(() => location.reload(), 450); /* rebuild every screen in the new language */ }, t('set.language')), 'lang'),
    row(t('set.currency'), null, select('currency', CURRENCIES.map((c) => [c, c]), t('set.currency')), 'money'),
    sw('watermark', t('set.watermark'), null, 'image')));

  // ---- exam mode ----
  root.append(group('exam', t('set.exam'), sw('examMode', t('set.exam'), t('set.exam.help'), 'shield')));

  // ---- achievements ----
  const ach = h('div', { class: 'ach-grid' }, getAchievements().map((a) => h('div', { class: `ach${a.date ? ' on' : ''}` },
    icon(a.date ? 'trophy' : 'target'), h('div', {}, h('b', { text: t(`ach.${a.id}`) }), h('div', { class: 't2', text: a.date ? t('ach.unlockedOn', { date: a.date }) : t('ach.locked') })))));
  root.append(group('achievements', t('set.achievements'), ach));

  // ---- data ----
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    try {
      if (f.size > 5_000_000) throw new Error('big');
      store.importAll(JSON.parse(await f.text()));
      toast(t('set.imported'));
      setTimeout(() => location.reload(), 700);
    } catch { toast(t('set.importFailed')); }
  });
  root.append(group('data', t('set.data'),
    h('div', { class: 'btn-row' },
      button(t('set.export'), () => downloadBlob(new Blob([JSON.stringify(store.exportAll(), null, 2)], { type: 'application/json' }), `nexlyr-calculator-${new Date().toISOString().slice(0, 10)}.json`), { iconName: 'download' }),
      button(t('set.import'), () => fileIn.click(), { iconName: 'filedown' }),
      button(t('set.clearAll'), async () => {
        if (await confirmDialog(t('set.clearConfirm'), { okLabel: t('set.clearAll'), danger: true })) {
          store.clearAll();
          toast(t('set.cleared'));
          setTimeout(() => location.reload(), 700);
        }
      }, { iconName: 'remove', cls: 'btn danger' })),
    fileIn,
    h('p', { class: 'help', text: t('set.dataHelp') })));
  return root;
}
