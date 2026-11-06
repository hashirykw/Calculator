// BMI for adults (14.8) with the WHO categories, optional lower cut-offs
// used for South Asian adults, the healthy weight range for your height and
// a clear note about what BMI can't tell you.

import { h, clear, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { bmi } from '../core/finance.js';
import { toolPage, numField, outList, message, fmt, record, ok } from './kit.js';

const CUTS = { who: [18.5, 25, 30], asian: [18.5, 23, 27.5] };

export function create() {
  const { root, body } = toolPage('health');
  const s = store.get('health', {});
  let hu = s.hu || 'cm', wu = s.wu || 'kg', cut = s.cut || 'who';
  const cm = numField(t('hl.height'), { value: s.cm ?? '170', unit: 'cm', onInput: up });
  const ft = numField(t('hl.feet'), { value: s.ft ?? '5', unit: 'ft', onInput: up });
  const inch = numField(t('hl.inches'), { value: s.in ?? '7', unit: 'in', onInput: up });
  const kg = numField(t('hl.weight'), { value: s.kg ?? '65', unit: 'kg', onInput: up });
  const lb = numField(t('hl.weight'), { value: s.lb ?? '143', unit: 'lb', onInput: up });
  const hSeg = seg([['cm', 'cm'], ['ft', 'ft + in']], hu, (v) => { hu = v; layout(); up(); }, t('hl.heightUnit'));
  const wSeg = seg([['kg', 'kg'], ['lb', 'lb']], wu, (v) => { wu = v; layout(); up(); }, t('hl.weightUnit'));
  const cSeg = seg([['who', t('hl.cutWho')], ['asian', t('hl.cutAsian')]], cut, (v) => { cut = v; up(); }, t('hl.cutoffs'));
  const warn = message('warn');
  const out = outList();
  const gauge = h('div', { class: 'bmi-gauge', 'aria-hidden': 'true' });
  const heightBox = h('div', { class: 'tool-grid' });
  const weightBox = h('div', { class: 'tool-grid' });
  body.append(
    h('div', { class: 'card panel' },
      h('div', { class: 'btn-row' }, hSeg, wSeg), heightBox, weightBox,
      h('div', { class: 'field' }, h('span', { class: 'label', text: t('hl.cutoffs') }), cSeg), h('p', { class: 'help', text: t('hl.cutHelp') })),
    warn.el, out.el, gauge,
    h('p', { class: 'note-box', text: t('hl.note') }));

  function layout() {
    clear(heightBox).append(...(hu === 'cm' ? [cm.el] : [ft.el, inch.el]));
    clear(weightBox).append(wu === 'kg' ? kg.el : lb.el);
  }
  function up() {
    store.set('health', { hu, wu, cut, cm: cm.input.value, ft: ft.input.value, in: inch.input.value, kg: kg.input.value, lb: lb.input.value });
    warn.set('');
    let m;
    if (hu === 'cm') { const c = cm.get(); m = ok(c) ? c / 100 : NaN; }
    else { const f = ft.get(), i = Number.isNaN(inch.get()) ? 0 : inch.get(); m = ok(f, i) ? (f * 12 + i) * 0.0254 : NaN; }
    const w = wu === 'kg' ? kg.get() : ok(lb.get()) ? lb.get() * 0.45359237 : NaN;
    if (!ok(m, w)) { out.set([]); clear(gauge); return; }
    if (m < 0.5 || m > 2.6 || w < 10 || w > 400) { warn.set(t('hl.range')); out.set([]); clear(gauge); return; }
    const r = bmi(w, m);
    const [a, b, c] = CUTS[cut];
    const cat = r.value < a ? 'under' : r.value < b ? 'healthy' : r.value < c ? 'over' : 'obese';
    const lo = a * m * m, hi = (b - 0.1) * m * m;
    const wf = (x) => (wu === 'kg' ? `${fmt(x, 3)} kg` : `${fmt(x / 0.45359237, 3)} lb`);
    out.set([
      ['BMI', fmt(Math.round(r.value * 10) / 10, 4), { big: true }],
      [t('hl.category'), t(`hl.cat.${cat}`)],
      [t('hl.healthyRange'), `${wf(lo)} – ${wf(hi)}`],
      [t('hl.formula'), `${fmt(w, 4)} kg ÷ (${fmt(m, 3)} m)²`],
    ]);
    record('health', `${fmt(w, 4)} kg, ${fmt(m * 100, 4)} cm`, `BMI ${fmt(Math.round(r.value * 10) / 10, 4)} (${t(`hl.cat.${cat}`)})`);
    // gauge from BMI 15 to 40
    clear(gauge);
    const span = [15, 40];
    const pos = (v) => `${Math.max(0, Math.min(100, ((v - span[0]) / (span[1] - span[0])) * 100))}%`;
    const bands = [[span[0], a, 'under'], [a, b, 'healthy'], [b, c, 'over'], [c, span[1], 'obese']];
    const bar = h('div', { class: 'bar' }, bands.map(([x, y, k]) => h('span', { class: `band ${k}`, style: { left: pos(x), width: `calc(${pos(y)} - ${pos(x)})` } })));
    bar.append(h('span', { class: 'needle', style: { left: pos(r.value) } }));
    gauge.append(bar, h('div', { class: 'ticks' }, [a, b, c].map((v) => h('span', { style: { left: pos(v) }, text: String(v) }))));
  }
  layout();
  up();
  return { root };
}
