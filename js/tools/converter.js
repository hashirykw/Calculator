// Unit and currency converter (14.1): 16 unit categories plus live currency
// rates (cached 12 hours, shown with their source and time, usable offline
// from the cache), the formula used, every unit at once, and unit search.

import { h, clear, iconButton, icon } from '../ui.js';
import { t } from '../i18n/index.js';
import { app, bus } from '../bus.js';
import { store } from '../store.js';
import { CONFIG } from '../config.js';
import { CATEGORIES, convert, formulaText, CURRENCIES } from '../core/units.js';
import { toolPage, numField, outList, message, fmt, record, selectField, tabs } from './kit.js';

const CATS = [...Object.keys(CATEGORIES), 'currency'];
const RATES_TTL = 12 * 3600 * 1000;
const NAMES = (() => { try { return new Intl.DisplayNames([navigator.language || 'en'], { type: 'currency' }); } catch { return null; } })();
const curName = (c) => { try { return NAMES ? NAMES.of(c) : c; } catch { return c; } };

export function create() {
  const { root, body } = toolPage('converter');
  const saved = store.get('conv', {});
  let cat = CATS.includes(saved.cat) ? saved.cat : 'length';
  const picks = typeof saved.picks === 'object' && saved.picks ? saved.picks : {};
  let rates = null;

  const catTabs = tabs(CATS.map((c) => [c, t(`conv.cat.${c}`)]), (c) => { cat = c; buildUnits(); update(); }, cat);
  const value = numField(t('conv.value'), { value: saved.value ?? '1', onInput: update });
  const from = selectField(t('common.from'), [], '', (v) => { picks[cat] = [v, to.get()]; update(); });
  const to = selectField(t('common.to'), [], '', (v) => { picks[cat] = [from.get(), v]; update(); });
  const swap = iconButton('swap', t('common.swap'), () => { const a = from.get(); from.set(to.get()); to.set(a); picks[cat] = [from.get(), to.get()]; update(); });
  swap.classList.add('swap-btn');
  const result = outList();
  const formula = h('p', { class: 'help mono' });
  const rateInfo = h('p', { class: 'help' });
  const warn = message('warn');
  const allHead = h('h2', { class: 'section-title', text: t('conv.all') });
  const all = outList();

  // unit search across every category
  const search = h('input', { class: 'input', type: 'search', placeholder: t('conv.search'), 'aria-label': t('conv.search') });
  const hits = h('div', { class: 'search-results', hidden: true });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    clear(hits);
    if (!q) { hits.hidden = true; return; }
    const found = [];
    for (const c of Object.keys(CATEGORIES)) {
      for (const u of CATEGORIES[c].units) if (u.id.toLowerCase().includes(q) || u.label.toLowerCase().includes(q)) found.push([c, u.id, u.label]);
    }
    for (const cur of currencyList()) if (cur.toLowerCase().includes(q) || curName(cur).toLowerCase().includes(q)) found.push(['currency', cur, curName(cur)]);
    found.slice(0, 8).forEach(([c, id, label]) => hits.append(h('button', { type: 'button', on: { click: () => {
      cat = c;
      catTabs.select(c);
      from.set(id);
      picks[cat] = [id, to.get() === id ? from.get() : to.get()];
      search.value = '';
      hits.hidden = true;
      update();
    } } }, icon('ruler', 'sm'), h('span', { text: label === id ? id : `${label} (${id})` }), h('span', { class: 'k', text: t(`conv.cat.${c}`) }))));
    if (!found.length) hits.append(h('p', { class: 'help', text: t('search.empty') }));
    hits.hidden = false;
  });

  body.append(
    h('div', { class: 'conv-search' }, search, hits),
    catTabs.el,
    h('div', { class: 'card panel' },
      value.el,
      h('div', { class: 'conv-pair' }, from.el, swap, to.el),
      result.el, formula, rateInfo, warn.el),
    allHead, all.el);

  function currencyList() {
    const extra = rates ? Object.keys(rates.rates).filter((c) => !CURRENCIES.includes(c)).sort() : [];
    return [...CURRENCIES, ...extra];
  }
  function unitOptions() {
    if (cat === 'currency') return currencyList().map((c) => [c, `${c} – ${curName(c)}`]);
    return CATEGORIES[cat].units.map((u) => [u.id, u.label === u.id ? u.id : `${u.label} (${u.id})`]);
  }
  function buildUnits() {
    const opts = unitOptions();
    for (const s of [from, to]) {
      clear(s.input);
      opts.forEach(([v, text]) => s.input.append(h('option', { value: v, text })));
    }
    const def = cat === 'currency' ? [app.settings.currency === 'USD' ? 'PKR' : 'USD', app.settings.currency || 'PKR'] : [opts[0][0], opts[1][0]];
    const p = picks[cat] && opts.some((o) => o[0] === picks[cat][0]) && opts.some((o) => o[0] === picks[cat][1]) ? picks[cat] : def;
    from.set(p[0]);
    to.set(p[1]);
  }

  async function loadRates(force = false) {
    const cached = store.get('rates');
    const valid = cached && cached.rates && typeof cached.rates === 'object';
    if (valid && !force && Date.now() - cached.fetched < RATES_TTL) { rates = cached; return; }
    if (!navigator.onLine) { rates = valid ? { ...cached, offline: true } : null; return; }
    try {
      const res = await fetch(CONFIG.ratesUrl, { cache: 'no-store' });
      const j = await res.json();
      if (j.result !== 'success' || !j.rates) throw new Error('rates');
      rates = { rates: j.rates, time: j.time_last_update_unix * 1000, fetched: Date.now() };
      store.set('rates', rates);
    } catch {
      rates = valid ? { ...cached, stale: true } : null;
    }
  }

  async function update() {
    const v = value.get();
    store.set('conv', { cat, value: value.input.value, picks });
    warn.set('');
    rateInfo.textContent = '';
    if (cat === 'currency') {
      if (!rates) {
        result.set([]);
        all.set([]);
        allHead.hidden = true;
        rateInfo.textContent = t('common.loading');
        await loadRates();
        if (!rates) { rateInfo.textContent = ''; warn.set(navigator.onLine ? t('conv.ratesFailed') : t('conv.ratesOffline')); return; }
        buildUnits();
      }
      const when = new Date(rates.time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      clear(rateInfo).append(t('conv.ratesFrom', { time: when }), ' ', h('a', { href: 'https://www.exchangerate-api.com', target: '_blank', rel: 'noopener', text: 'Rates By Exchange Rate API' }));
      if (rates.offline || rates.stale) warn.set(t('conv.ratesCached'));
    }
    const f = from.get(), tu = to.get();
    if (v === null) { result.set([[t('common.result'), t('conv.badNumber')]]); return; }
    if (Number.isNaN(v)) { result.set([]); all.set([]); allHead.hidden = true; formula.textContent = ''; return; }
    const out = convert(cat, v, f, tu, rates && rates.rates);
    const shown = cat === 'currency' ? fmt(out, 8) : fmt(out);
    result.set([[`${fmt(v)} ${f} =`, `${shown} ${tu}`, { big: true, copy: shown.replace(/,/g, '') }]]);
    formula.textContent = cat === 'currency'
      ? (rates ? `1 ${f} = ${fmt(convert('currency', 1, f, tu, rates.rates), 6)} ${tu}` : '')
      : formulaText(cat, f, tu);
    allHead.hidden = false;
    const list = cat === 'currency' ? CURRENCIES : CATEGORIES[cat].units.map((u) => u.id);
    all.set(list.filter((u) => u !== f).map((u) => [cat === 'currency' ? `${u} – ${curName(u)}` : (CATEGORIES[cat].units.find((x) => x.id === u).label === u ? u : `${CATEGORIES[cat].units.find((x) => x.id === u).label}`), `${fmt(convert(cat, v, f, u, rates && rates.rates))} ${u}`]));
    record('converter', `${value.input.value} ${f} → ${tu}`, `${shown} ${tu}`);
  }

  buildUnits();
  catTabs.select(cat);
  bus.on('online', (on) => { if (on && cat === 'currency' && rates && (rates.offline || rates.stale)) loadRates(true).then(update); });
  return { root, show() { update(); } };
}
