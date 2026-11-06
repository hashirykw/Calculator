// A place box with live suggestions: saved places and built-in cities appear
// instantly; places from anywhere in the world (towns, areas, landmarks,
// addresses) follow from the online search. Coordinates are accepted too,
// and "Use my location" fills it from the device.

import { h, icon, toast } from './ui.js';
import { t } from './i18n/index.js';
import { openMenu, closeMenu } from './menu.js';
import { localMatches, searchOnline, remember, myLocation, resolveLocal } from './places.js';

const kindIcon = { city: 'globe', place: 'point', coords: 'target', me: 'target', recent: 'history' };

export function placeInput(input, { onPick, className = '' }) {
  let menu = null, ctrl = null, timer = 0, loading = false, online = [];
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.autocomplete = 'off';

  const toItem = (p, group) => ({ ...p, value: p.label, label: p.name, sub: p.sub || (p.kind === 'coords' ? t('geo.coordsItem') : ''), icon: kindIcon[p.kind] || 'point', meta: `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`, group, place: p });
  const meItem = { value: '@me', label: t('geo.useMe'), sub: t('geo.useMeSub'), icon: 'target', group: '' };

  function items() {
    const q = input.value.trim();
    const local = localMatches(q, q ? 5 : 6).map((p) => toItem(p, q ? t('geo.gSaved') : t('geo.gSuggested')));
    const seen = new Set(local.map((x) => `${x.lat.toFixed(2)},${x.lon.toFixed(2)}`));
    const world = online.filter((p) => !seen.has(`${p.lat.toFixed(2)},${p.lon.toFixed(2)}`)).map((p) => toItem(p, t('geo.gWorld')));
    const list = [meItem, ...local, ...world];
    if (loading) list.push({ value: '@loading', label: t('geo.searching'), icon: 'refresh', disabled: true, group: t('geo.gWorld') });
    else if (q.length >= 2 && !world.length && navigator.onLine === false) list.push({ value: '@off', label: t('geo.offlineSearch'), icon: 'offline', disabled: true, group: t('geo.gWorld') });
    return list;
  }
  function show() {
    if (menu) { menu.update(items()); return; }
    input.setAttribute('aria-expanded', 'true');
    menu = openMenu({
      anchor: input, items: items(), keepFocus: true, autoActive: false, label: input.getAttribute('aria-label') || '',
      className: `places ${className}`.trim(), minWidth: 300,
      onPick: (it) => choose(it),
      onEnter: () => { const p = resolveLocal(input.value) || online.at(0); if (p) choose(toItem(p)); else closeMenu(); },
      onClose: () => { menu = null; input.setAttribute('aria-expanded', 'false'); },
    });
  }
  async function choose(it) {
    if (it.value === '@me') {
      input.value = t('geo.locating');
      try {
        const p = await myLocation();
        input.value = p.label; input._place = p; remember(p); onPick(p);
      } catch {
        input.value = '';
        toast(t('geo.meFailed'), { kind: 'warn', duration: 5000 });
      }
      return;
    }
    const p = it.place;
    if (!p) return;
    input.value = p.label;
    input._place = p;
    remember(p);
    onPick(p);
  }
  function search() {
    const q = input.value.trim();
    if (ctrl) ctrl.abort();
    online = [];
    if (q.length < 2 || navigator.onLine === false) { loading = false; show(); return; }
    loading = true; show();
    ctrl = new AbortController();
    const my = ctrl;
    searchOnline(q, { signal: my.signal }).then((res) => {
      if (my !== ctrl) return;
      online = res; loading = false; if (menu) show();
    }).catch(() => { if (my === ctrl) { loading = false; if (menu) show(); } });
  }
  input.addEventListener('focus', () => { input.select(); show(); });
  input.addEventListener('click', show);
  input.addEventListener('input', () => { input._place = null; show(); clearTimeout(timer); timer = setTimeout(search, 380); });
  input.addEventListener('keydown', (e) => {
    if (!menu && (e.key === 'ArrowDown' || e.key === 'Enter')) { show(); if (e.key === 'ArrowDown') { e.preventDefault(); return; } }
    if (menu) menu.keyDown(e);
  });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) closeMenu(); }, 120));
  return { search };
}

export const placeIcon = icon;
void h;
