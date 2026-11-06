// Physical, chemical, astronomical and mathematical constants (CODATA 2018
// values; SI-defined constants are exact). Tap to copy, or send to the
// calculator.

import { h, clear, icon, iconButton, copyText } from '../ui.js';
import { t } from '../i18n/index.js';
import { bus } from '../bus.js';
import { toolPage } from './kit.js';

// [symbol, name key, value, unit, exact?, calc expression]
const DATA = {
  physics: [
    ['c', 'k.c', '299792458', 'm s⁻¹', 1, '299792458'],
    ['G', 'k.G', '6.67430 × 10⁻¹¹', 'N m² kg⁻²', 0, '6.6743e-11'],
    ['h', 'k.h', '6.62607015 × 10⁻³⁴', 'J s', 1, '6.62607015e-34'],
    ['ħ', 'k.hbar', '1.054571817 × 10⁻³⁴', 'J s', 0, '1.054571817e-34'],
    ['e', 'k.e', '1.602176634 × 10⁻¹⁹', 'C', 1, '1.602176634e-19'],
    ['mₑ', 'k.me', '9.1093837015 × 10⁻³¹', 'kg', 0, '9.1093837015e-31'],
    ['mₚ', 'k.mp', '1.67262192369 × 10⁻²⁷', 'kg', 0, '1.67262192369e-27'],
    ['mₙ', 'k.mn', '1.67492749804 × 10⁻²⁷', 'kg', 0, '1.67492749804e-27'],
    ['ε₀', 'k.e0', '8.8541878128 × 10⁻¹²', 'F m⁻¹', 0, '8.8541878128e-12'],
    ['μ₀', 'k.mu0', '1.25663706212 × 10⁻⁶', 'N A⁻²', 0, '1.25663706212e-6'],
    ['k', 'k.kB', '1.380649 × 10⁻²³', 'J K⁻¹', 1, '1.380649e-23'],
    ['σ', 'k.sigma', '5.670374419 × 10⁻⁸', 'W m⁻² K⁻⁴', 0, '5.670374419e-8'],
    ['g', 'k.g', '9.80665', 'm s⁻²', 1, '9.80665'],
    ['α', 'k.alpha', '7.2973525693 × 10⁻³', '', 0, '7.2973525693e-3'],
    ['a₀', 'k.a0', '5.29177210903 × 10⁻¹¹', 'm', 0, '5.29177210903e-11'],
    ['R∞', 'k.rinf', '10 973 731.568160', 'm⁻¹', 0, '10973731.56816'],
  ],
  chemistry: [
    ['Nₐ', 'k.NA', '6.02214076 × 10²³', 'mol⁻¹', 1, '6.02214076e23'],
    ['R', 'k.R', '8.314462618', 'J mol⁻¹ K⁻¹', 0, '8.314462618'],
    ['F', 'k.F', '96 485.33212', 'C mol⁻¹', 0, '96485.33212'],
    ['u', 'k.u', '1.66053906660 × 10⁻²⁷', 'kg', 0, '1.6605390666e-27'],
    ['Vₘ', 'k.vmstp', '22.41396954', 'dm³ mol⁻¹', 0, '22.41396954'],
    ['Vₘ', 'k.vmrtp', '24', 'dm³ mol⁻¹', 0, '24'],
    ['atm', 'k.atm', '101 325', 'Pa', 1, '101325'],
    ['K', 'k.zeroC', '273.15', 'K', 1, '273.15'],
  ],
  space: [
    ['AU', 'k.au', '1.495978707 × 10¹¹', 'm', 1, '1.495978707e11'],
    ['ly', 'k.ly', '9.4607304725808 × 10¹⁵', 'm', 1, '9.4607304725808e15'],
    ['M⊕', 'k.mEarth', '5.972 × 10²⁴', 'kg', 0, '5.972e24'],
    ['R⊕', 'k.rEarth', '6 371', 'km', 0, '6371'],
    ['M☉', 'k.mSun', '1.989 × 10³⁰', 'kg', 0, '1.989e30'],
    ['M☾', 'k.mMoon', '7.342 × 10²²', 'kg', 0, '7.342e22'],
  ],
  maths: [
    ['π', 'k.pi', '3.14159 26535 89793', '', 0, 'π'],
    ['e', 'k.euler', '2.71828 18284 59045', '', 0, 'e'],
    ['φ', 'k.phi', '1.61803 39887 49895', '', 0, '(1+√5)/2'],
    ['√2', 'k.sqrt2', '1.41421 35623 73095', '', 0, '√2'],
    ['γ', 'k.gamma', '0.57721 56649 01533', '', 0, '0.577215664901533'],
    ['ln 2', 'k.ln2', '0.69314 71805 59945', '', 0, 'ln(2)'],
  ],
};

export function create() {
  const { root, body } = toolPage('constants');
  const filter = h('input', { class: 'input', type: 'search', placeholder: t('k.filter'), 'aria-label': t('k.filter') });
  const host = h('div', { class: 'panel' });
  body.append(filter, host);
  function render() {
    clear(host);
    const q = filter.value.trim().toLowerCase();
    for (const [grp, rows] of Object.entries(DATA)) {
      const list = rows.filter(([sym, key, , unit]) => !q || `${sym} ${t(key)} ${unit}`.toLowerCase().includes(q));
      if (!list.length) continue;
      host.append(h('section', { class: 'card' }, h('h3', { class: 'section-title', text: t(`k.g.${grp}`) }),
        h('div', { class: 'list const-list' }, list.map(([sym, key, val, unit, exact, expr]) => h('div', { class: 'list-item' },
          h('span', { class: 'const-sym', text: sym }),
          h('div', { class: 'grow' }, h('div', { class: 't1', text: t(key) }), h('div', { class: 't2 mono', text: `${val}${unit ? ` ${unit}` : ''}${exact ? ` · ${t('k.exact')}` : ''}` })),
          iconButton('copy', t('common.copy'), () => copyText(expr)),
          iconButton('calc', t('k.toCalc'), () => {
            const send = () => bus.emit('calc:insert', expr);
            const off = bus.on('route', (r) => { if (r.screen === 'calc') { off(); setTimeout(send, 60); } });
            location.hash = '#/calc';
          }))))));
    }
    if (!host.childElementCount) host.append(h('div', { class: 'empty' }, icon('search'), h('p', { text: t('search.empty') })));
  }
  filter.addEventListener('input', render);
  render();
  return { root };
}
