// Number theory: prime test and factorisation (BigInt), divisors, φ(n),
// HCF/LCM, next/previous prime, number facts, Roman numerals and words.

import { h, clear } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { isPrime, factorInt, gcd, lcm } from '../core/numtheory.js';
import { toolPage, outList, message, record, section } from './kit.js';

const SUPER = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUPER[c]).join('');
const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function readBig(raw) {
  const s = String(raw || '').trim().replace(/[,\s_]/g, '').replace(/^\+/, '').replace(/[−–]/, '-');
  if (!s) return { empty: true };
  if (/^-?\d{1,60}$/.test(s)) return { v: BigInt(s) };
  if (/^-?\d+(\.\d+)?e\d+$/i.test(s)) { const [m, e] = s.toLowerCase().split('e'); if (!m.includes('.') && Number(e) < 60) return { v: BigInt(m) * 10n ** BigInt(e) }; }
  return { error: true };
}

function roman(n) {
  if (n < 1 || n > 3999) return null;
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
export function fromRoman(s) {
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  s = s.toUpperCase().trim();
  if (!/^[IVXLCDM]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) { const a = v[s[i]], b = v[s[i + 1]] || 0; total += a < b ? -a : a; }
  return roman(total) === s ? total : null;
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function under1000(n) {
  const parts = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} hundred`); n %= 100; if (n) parts.push('and'); }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  else if (n > 0 || !parts.length) parts.push(ONES[n]);
  return parts.join(' ');
}
export function words(big, system = 'intl') {
  let n = big < 0n ? -big : big;
  if (n > 10n ** 21n - 1n) return null;
  if (n === 0n) return 'zero';
  const out = [];
  const units = system === 'lakh' ? [[10n ** 7n, 'crore'], [10n ** 5n, 'lakh'], [1000n, 'thousand']] : [[10n ** 18n, 'quintillion'], [10n ** 15n, 'quadrillion'], [10n ** 12n, 'trillion'], [10n ** 9n, 'billion'], [10n ** 6n, 'million'], [1000n, 'thousand']];
  if (system === 'lakh' && n >= 10n ** 9n) {
    const crores = n / 10n ** 7n;
    out.push(`${words(crores, 'lakh')} crore`);
    n %= 10n ** 7n;
  }
  for (const [v, name] of units) if (n >= v) { const q = n / v; out.push(`${under1000(Number(q))} ${name}`); n %= v; }
  if (n > 0n) out.push((out.length && n < 100n ? 'and ' : '') + under1000(Number(n)));
  return (big < 0n ? 'minus ' : '') + out.join(' ').replace(/\s+/g, ' ').trim();
}

export function create() {
  const { root, body } = toolPage('numtheory');
  const saved = store.get('numtheory', {});
  const nIn = h('input', { class: 'input mono', inputmode: 'numeric', autocomplete: 'off', value: saved.n ?? '360', 'aria-label': t('nt.n') });
  const mIn = h('input', { class: 'input mono', inputmode: 'numeric', autocomplete: 'off', value: saved.m ?? '84', 'aria-label': t('nt.m') });
  const romanIn = h('input', { class: 'input mono', autocomplete: 'off', placeholder: 'MMXXVI', 'aria-label': t('nt.romanIn') });
  const warn = message('warn');
  const out = outList(), pair = outList(), facts = h('div', { class: 'chips' }), divs = h('p', { class: 'mono small wrap' });
  const romanOut = outList();
  body.append(
    h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' },
      h('div', { class: 'field' }, h('label', { text: t('nt.n') }), nIn),
      h('div', { class: 'field' }, h('label', { text: t('nt.m') }), mIn)),
      h('p', { class: 'help', text: t('nt.help') })),
    warn.el, out.el, facts,
    section(t('nt.divisors'), divs),
    section(t('nt.pair'), pair.el),
    section(t('nt.roman'), h('div', { class: 'field' }, h('label', { text: t('nt.romanIn') }), romanIn), romanOut.el));

  function up() {
    store.set('numtheory', { n: nIn.value, m: mIn.value });
    warn.set('');
    clear(facts);
    const a = readBig(nIn.value), b = readBig(mIn.value);
    if (a.error || b.error) { warn.set(t('nt.whole')); out.set([]); pair.set([]); return; }
    if (a.empty) { out.set([]); pair.set([]); divs.textContent = ''; return; }
    const n = a.v, abs = n < 0n ? -n : n;
    const rows = [];
    let fz = null;
    try { if (abs > 1n) fz = factorInt(abs); } catch { /* too big */ }
    const prime = abs > 1n && isPrime(abs);
    rows.push([t('nt.isPrime'), abs < 2n ? t('common.no') : prime ? t('nt.yesPrime') : t('nt.noComposite'), { big: true }]);
    if (fz) rows.push([t('nt.factors'), fz.factors.map(([p, e]) => `${p}${e > 1 ? sup(e) : ''}`).join(' × ')]);
    let nd = null, sd = null, phi = null, list = null;
    if (fz) {
      nd = fz.factors.reduce((s, [, e]) => s * BigInt(e + 1), 1n);
      sd = fz.factors.reduce((s, [p, e]) => s * ((p ** BigInt(e + 1) - 1n) / (p - 1n)), 1n);
      phi = fz.factors.reduce((s, [p, e]) => s * (p - 1n) * p ** BigInt(e - 1), 1n);
      if (nd <= 4000n) {
        list = [1n];
        for (const [p, e] of fz.factors) { const next = []; for (const d of list) { let pk = 1n; for (let i = 0; i <= e; i++) { next.push(d * pk); pk *= p; } } list = next; }
        list.sort((x, y) => (x < y ? -1 : 1));
      }
      rows.push([t('nt.numDivisors'), group(nd.toString())], [t('nt.sumDivisors'), group(sd.toString())], [t('nt.phi'), group(phi.toString())]);
    }
    if (abs < 10n ** 15n && abs > 1n) {
      let p = abs + 1n; while (!isPrime(p)) p++;
      let q = abs - 1n; while (q > 1n && !isPrime(q)) q--;
      rows.push([t('nt.nextPrime'), group(p.toString())]);
      if (q > 1n) rows.push([t('nt.prevPrime'), group(q.toString())]);
    }
    rows.push([t('nt.words'), words(n, 'intl')], [t('nt.wordsLakh'), words(n, 'lakh')]);
    if (n >= 1n && n <= 3999n) rows.push([t('nt.roman'), roman(Number(n))]);
    rows.push([t('nt.binary'), (n < 0n ? '-' : '') + abs.toString(2)], [t('nt.hex'), (n < 0n ? '-' : '') + abs.toString(16).toUpperCase()]);
    rows.push([t('nt.digitSum'), String([...abs.toString()].reduce((s, c) => s + Number(c), 0))]);
    out.set(rows);
    divs.textContent = list ? list.map(String).join(', ') : nd ? t('nt.tooMany', { n: group(nd.toString()) }) : '—';
    const tags = [];
    const isqrt = (x) => { if (x < 2n) return x; let r = BigInt(Math.floor(Math.sqrt(Number(x)))); while (r * r > x) r--; while ((r + 1n) * (r + 1n) <= x) r++; return r; };
    const r2 = isqrt(abs); if (r2 * r2 === abs) tags.push(t('nt.square', { r: r2 }));
    const c = BigInt(Math.round(Math.cbrt(Number(abs)))); if (c * c * c === abs) tags.push(t('nt.cube', { r: c }));
    if (sd !== null && sd - abs === abs) tags.push(t('nt.perfect'));
    if (sd !== null && sd - abs > abs) tags.push(t('nt.abundant'));
    if (abs % 2n === 0n) tags.push(t('nt.even')); else tags.push(t('nt.odd'));
    const fibTest = (x) => { const s = 5n * x * x; const a1 = isqrt(s + 4n), a2 = isqrt(s - 4n > 0n ? s - 4n : 0n); return a1 * a1 === s + 4n || a2 * a2 === s - 4n; };
    if (abs < 10n ** 30n && fibTest(abs)) tags.push(t('nt.fib'));
    const str = abs.toString(); if (str.length > 1 && str === [...str].reverse().join('')) tags.push(t('nt.palindrome'));
    tags.forEach((x) => facts.append(h('span', { class: 'chip', text: x })));
    if (!b.empty) {
      const m = b.v;
      const g = gcd(n, m), l = lcm(n, m);
      pair.set([[t('nt.hcf'), group(g.toString()), { big: true }], [t('nt.lcm'), group(l.toString())], [t('nt.coprime'), g === 1n ? t('common.yes') : t('common.no')],
        m !== 0n ? [t('nt.divmod', { n: n.toString(), m: m.toString() }), `${(n / m).toString()} r ${(((n % m) + m) % m).toString()}`] : null]);
    } else pair.set([]);
    record('numtheory', n.toString(), fz ? fz.factors.map(([p, e]) => `${p}${e > 1 ? sup(e) : ''}`).join(' × ') : prime ? 'prime' : n.toString());
  }
  function upRoman() {
    const s = romanIn.value.trim();
    if (!s) { romanOut.set([]); return; }
    if (/^\d+$/.test(s)) { const r = roman(Number(s)); romanOut.set([[t('nt.roman'), r || t('nt.romanRange'), { big: true }]]); return; }
    const v = fromRoman(s);
    romanOut.set([[t('nt.value'), v === null ? t('nt.romanBad') : String(v), { big: true }]]);
  }
  nIn.addEventListener('input', up); mIn.addEventListener('input', up); romanIn.addEventListener('input', upRoman);
  up();
  return { root };
}
