// Random tools using the browser's cryptographic generator: numbers in a
// range (with or without repeats), dice, coins, pick or shuffle a list, and
// a password generator.

import { h, clear, button, copyText, switchInput } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { toolPage, numField, outList, message, fmt, record, tabbed, fieldRow, ok } from './kit.js';

// unbiased integer in [0, n)
function randInt(n) {
  if (n <= 0) return 0;
  const max = 2 ** 32, lim = max - (max % n), buf = new Uint32Array(1);
  let x;
  do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= lim);
  return x % n;
}
const between = (a, b) => a + randInt(b - a + 1);
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function create() {
  const { root, body } = toolPage('random');
  const s = store.get('random', {});
  const tb = tabbed([['num', t('rnd.num')], ['dice', t('rnd.dice')], ['coin', t('rnd.coin')], ['list', t('rnd.list')], ['pass', t('rnd.pass')]], {
    num(p) {
      const lo = numField(t('rnd.min'), { value: s.lo ?? '1', inputmode: 'numeric' }), hi = numField(t('rnd.max'), { value: s.hi ?? '100', inputmode: 'numeric' });
      const cnt = numField(t('rnd.count'), { value: s.cnt ?? '1', inputmode: 'numeric' });
      let unique = s.unique ?? false;
      const big = h('div', { class: 'rnd-big', 'aria-live': 'polite' }), warn = message('warn');
      const go = () => {
        const a = lo.get(), b = hi.get(), n = cnt.get();
        warn.set('');
        if (!ok(a, b, n) || !Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(n) || n < 1 || n > 1000 || b < a || b - a > 2 ** 31) { warn.set(t('rnd.bad')); return; }
        if (unique && n > b - a + 1) { warn.set(t('rnd.tooMany')); return; }
        store.set('random', { ...store.get('random', {}), lo: lo.input.value, hi: hi.input.value, cnt: cnt.input.value, unique });
        let out;
        if (unique) { const set = new Set(); while (set.size < n) set.add(between(a, b)); out = [...set]; } else out = Array.from({ length: n }, () => between(a, b));
        big.textContent = out.join(', ');
        big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
        record('random', `${n} from ${a}–${b}`, out.slice(0, 20).join(', '));
      };
      p.append(h('div', { class: 'card panel' }, fieldRow(lo, hi, cnt),
        h('label', { class: 'set-row' }, h('span', { class: 'grow', text: t('rnd.unique') }), switchInput(unique, (v) => { unique = v; }, t('rnd.unique'))),
        h('div', { class: 'btn-row' }, button(t('rnd.generate'), go, { cls: 'btn primary', iconName: 'dice' }), button(t('common.copy'), () => copyText(big.textContent), { iconName: 'copy' }))), warn.el, big);
      go();
    },
    dice(p) {
      const n = numField(t('rnd.diceCount'), { value: s.dn ?? '2', inputmode: 'numeric' }), sides = numField(t('rnd.sides'), { value: s.ds ?? '6', inputmode: 'numeric' });
      const big = h('div', { class: 'rnd-big dice', 'aria-live': 'polite' }), out = outList(), warn = message('warn');
      const go = () => {
        const k = n.get(), m = sides.get();
        warn.set('');
        if (!ok(k, m) || !Number.isInteger(k) || !Number.isInteger(m) || k < 1 || k > 100 || m < 2 || m > 1000) { warn.set(t('rnd.bad')); return; }
        store.set('random', { ...store.get('random', {}), dn: n.input.value, ds: sides.input.value });
        const rolls = Array.from({ length: k }, () => between(1, m));
        big.textContent = m === 6 && k <= 12 ? rolls.map((r) => DIE[r - 1]).join(' ') : rolls.join('  ');
        big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
        const sum = rolls.reduce((a, b) => a + b, 0);
        out.set([[t('rnd.total'), String(sum), { big: true }], [t('rnd.rolls'), rolls.join(', ')], [t('rnd.expected'), fmt((k * (m + 1)) / 2)]]);
        record('random', `${k}d${m}`, `${rolls.join(', ')} = ${sum}`);
      };
      p.append(h('div', { class: 'card panel' }, fieldRow(n, sides), h('div', { class: 'btn-row' }, button(t('rnd.roll'), go, { cls: 'btn primary', iconName: 'dice' }))), warn.el, big, out.el);
      go();
    },
    coin(p) {
      const n = numField(t('rnd.flips'), { value: s.cn ?? '1', inputmode: 'numeric' });
      const big = h('div', { class: 'rnd-big', 'aria-live': 'polite' }), out = outList(), warn = message('warn');
      const go = () => {
        const k = n.get();
        warn.set('');
        if (!ok(k) || !Number.isInteger(k) || k < 1 || k > 10000) { warn.set(t('rnd.bad')); return; }
        store.set('random', { ...store.get('random', {}), cn: n.input.value });
        const f = Array.from({ length: k }, () => (randInt(2) ? 'H' : 'T'));
        const heads = f.filter((x) => x === 'H').length;
        big.textContent = k === 1 ? (heads ? t('rnd.heads') : t('rnd.tails')) : f.slice(0, 60).join(' ') + (k > 60 ? ' …' : '');
        big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
        out.set([[t('rnd.heads'), `${heads} (${fmt((heads / k) * 100, 4)}%)`], [t('rnd.tails'), `${k - heads} (${fmt(((k - heads) / k) * 100, 4)}%)`]]);
        record('random', `${k} coin flips`, `${heads} heads, ${k - heads} tails`);
      };
      p.append(h('div', { class: 'card panel' }, fieldRow(n), h('div', { class: 'btn-row' }, button(t('rnd.flip'), go, { cls: 'btn primary', iconName: 'coins' }))), warn.el, big, out.el);
      go();
    },
    list(p) {
      const ta = h('textarea', { class: 'input', rows: '5', 'aria-label': t('rnd.items'), placeholder: t('rnd.itemsPh') });
      ta.value = s.list ?? 'Ali\nSara\nHamza\nAyesha\nBilal';
      const big = h('div', { class: 'rnd-big', 'aria-live': 'polite' }), out = h('ol', { class: 'rnd-ol' }), warn = message('warn');
      const items = () => ta.value.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
      const save = () => store.set('random', { ...store.get('random', {}), list: ta.value });
      p.append(h('div', { class: 'card panel' }, h('div', { class: 'field' }, h('label', { text: t('rnd.items') }), ta),
        h('div', { class: 'btn-row' },
          button(t('rnd.pick'), () => { const l = items(); warn.set(l.length ? '' : t('err.emptylist')); if (!l.length) return; save(); clear(out); big.textContent = l[randInt(l.length)]; big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop'); }, { cls: 'btn primary', iconName: 'target' }),
          button(t('rnd.shuffle'), () => { const l = items(); warn.set(l.length ? '' : t('err.emptylist')); if (!l.length) return; save(); big.textContent = ''; clear(out); shuffle(l).forEach((x) => out.append(h('li', { text: x }))); }, { iconName: 'refresh' }))),
      warn.el, big, out);
    },
    pass(p) {
      const len = numField(t('rnd.length'), { value: s.pl ?? '16', inputmode: 'numeric' });
      const opts = { lower: true, upper: true, digits: true, symbols: s.psym ?? true };
      const big = h('div', { class: 'rnd-big mono pass', 'aria-live': 'polite' }), out = outList(), warn = message('warn');
      const SETS = { lower: 'abcdefghijkmnopqrstuvwxyz', upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', digits: '23456789', symbols: '!@#$%^&*()-_=+[]{};:,.?' };
      const go = () => {
        const n = len.get();
        warn.set('');
        const pool = Object.entries(opts).filter(([, v]) => v).map(([k]) => SETS[k]);
        if (!ok(n) || !Number.isInteger(n) || n < 4 || n > 128 || !pool.length) { warn.set(t('rnd.bad')); return; }
        store.set('random', { ...store.get('random', {}), pl: len.input.value, psym: opts.symbols });
        const all = pool.join('');
        let chars = pool.map((set) => set[randInt(set.length)]);
        while (chars.length < n) chars.push(all[randInt(all.length)]);
        chars = shuffle(chars).slice(0, n);
        big.textContent = chars.join('');
        const bits = n * Math.log2(all.length);
        out.set([[t('rnd.entropy'), `${Math.round(bits)} bits`], [t('rnd.strength'), bits >= 100 ? t('rnd.vstrong') : bits >= 70 ? t('rnd.strong') : bits >= 50 ? t('rnd.ok') : t('rnd.weak')]]);
      };
      const toggle = (k) => h('label', { class: 'set-row' }, h('span', { class: 'grow', text: t(`rnd.${k}`) }), switchInput(opts[k], (v) => { opts[k] = v; go(); }, t(`rnd.${k}`)));
      p.append(h('div', { class: 'card panel' }, fieldRow(len), toggle('lower'), toggle('upper'), toggle('digits'), toggle('symbols'),
        h('div', { class: 'btn-row' }, button(t('rnd.generate'), go, { cls: 'btn primary', iconName: 'refresh' }), button(t('common.copy'), () => copyText(big.textContent), { iconName: 'copy' }))),
      warn.el, big, out.el, h('p', { class: 'help', text: t('rnd.passNote') }));
      go();
    },
  }, 'num');
  body.append(tb.el);
  return { root };
}
