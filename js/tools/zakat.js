// Zakat (16.5): zakatable assets minus debts due now, compared with the
// gold or silver nisab, and 2.5% of the total when it is due. Gold and
// silver prices can be typed in or fetched (spot price, dated, with source).

import { h, clear, icon, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { app } from '../bus.js';
import { store } from '../store.js';
import { CONFIG } from '../config.js';
import { zakat, NISAB_GRAMS } from '../core/finance.js';
import { toolPage, numField, outList, message, money, fmt, record, ok, section, plain } from './kit.js';

const TROY_OZ_G = 31.1034768;

export function create() {
  const { root, body } = toolPage('zakat');
  const s = store.get('zakat', {});
  const cur = app.settings.currency || 'PKR';
  let basis = s.basis === 'gold' ? 'gold' : 'silver';
  const f = {
    cash: numField(t('zk.cash'), { value: s.cash ?? '', unit: cur }),
    goldG: numField(t('zk.goldG'), { value: s.goldG ?? '', unit: 'g', help: t('zk.tolaHelp') }),
    goldP: numField(t('zk.goldP'), { value: s.goldP ?? '', unit: `${cur}/g` }),
    silverG: numField(t('zk.silverG'), { value: s.silverG ?? '', unit: 'g' }),
    silverP: numField(t('zk.silverP'), { value: s.silverP ?? '', unit: `${cur}/g` }),
    stock: numField(t('zk.stock'), { value: s.stock ?? '', unit: cur }),
    owed: numField(t('zk.owed'), { value: s.owed ?? '', unit: cur }),
    other: numField(t('zk.other'), { value: s.other ?? '', unit: cur }),
    debts: numField(t('zk.debts'), { value: s.debts ?? '', unit: cur }),
  };
  Object.values(f).forEach((x) => x.input.addEventListener('input', up));
  const basisSeg = seg([['silver', t('zk.silverNisab')], ['gold', t('zk.goldNisab')]], basis, (v) => { basis = v; up(); }, t('zk.nisab'));
  const priceInfo = h('p', { class: 'help' });
  const warn = message('warn');
  const out = outList();
  const fetchBtn = h('button', { class: 'btn sm', type: 'button', on: { click: livePrices } }, icon('refresh', 'sm'), t('zk.live'));

  body.append(
    section(t('zk.assets'), h('div', { class: 'tool-grid two' }, f.cash.el, f.stock.el, f.owed.el, f.other.el)),
    section(t('zk.metals'), h('div', { class: 'tool-grid two' }, f.goldG.el, f.goldP.el, f.silverG.el, f.silverP.el), h('div', { class: 'btn-row' }, fetchBtn), priceInfo),
    section(t('zk.liabilities'), f.debts.el),
    section(t('zk.nisab'), basisSeg, h('p', { class: 'help', text: t('zk.nisabHelp', { gold: fmt(NISAB_GRAMS.gold), silver: fmt(NISAB_GRAMS.silver) }) })),
    warn.el, out.el,
    h('p', { class: 'note-box', text: t('zk.scholar') }));

  async function livePrices() {
    if (!navigator.onLine) { priceInfo.textContent = t('err.offline'); return; }
    fetchBtn.disabled = true;
    priceInfo.textContent = t('common.loading');
    try {
      const get = (sym) => fetch(`${CONFIG.goldPriceUrl}${sym}/${cur}`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
      const [g, sv] = await Promise.all([get('XAU'), get('XAG')]);
      if (!(g.price > 0) || !(sv.price > 0) || g.currency !== cur) throw new Error('price');
      f.goldP.set(plain(g.price / TROY_OZ_G, 8));
      f.silverP.set(plain(sv.price / TROY_OZ_G, 8));
      const when = new Date(g.updatedAt || Date.now()).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      priceInfo.textContent = t('zk.liveInfo', { time: when });
      store.set('zakatPrice', { gold: g.price, silver: sv.price, cur, at: g.updatedAt });
      up();
    } catch {
      priceInfo.textContent = t('zk.liveFailed');
    }
    fetchBtn.disabled = false;
  }

  function up() {
    store.set('zakat', { basis, ...Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.input.value])) });
    warn.set('');
    const v = {};
    for (const [k, x] of Object.entries(f)) {
      const n = x.get();
      if (n === null) { warn.set(t('zk.badValue')); out.set([]); return; }
      if (n < 0) { warn.set(t('zk.negative')); out.set([]); return; }
      v[k] = Number.isNaN(n) ? 0 : n;
    }
    const goldValue = v.goldG * v.goldP, silverValue = v.silverG * v.silverP;
    const price = basis === 'gold' ? v.goldP : v.silverP;
    if (!(price > 0)) {
      out.set([]);
      warn.set(t('zk.needPrice', { metal: t(basis === 'gold' ? 'zk.gold' : 'zk.silver') }));
      return;
    }
    if ((v.goldG > 0 && !(v.goldP > 0)) || (v.silverG > 0 && !(v.silverP > 0))) warn.set(t('zk.needBothPrices'));
    const nisab = NISAB_GRAMS[basis] * price;
    const r = zakat({ cash: v.cash, gold: goldValue, silver: silverValue, stock: v.stock, receivables: v.owed, other: v.other, liabilities: v.debts }, nisab);
    out.set([
      [t('zk.totalAssets'), money(r.assets)],
      [t('zk.net'), money(r.net)],
      [t('zk.threshold', { metal: t(basis === 'gold' ? 'zk.gold' : 'zk.silver') }), money(nisab)],
      [t('zk.due'), r.due ? money(r.amount) : t('zk.notDue'), { big: true }],
    ]);
    if (r.assets > 0) record('zakat', `${t('zk.net')} ${money(r.net)}`, r.due ? money(r.amount) : t('zk.notDue'));
  }
  up();
  return { root };
}
