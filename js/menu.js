// One themed dropdown menu (a glass listbox) used by every select and by the
// place search. It floats above everything, follows its anchor, flips upward
// when there is no room below, and works with mouse, touch and keyboard
// (↑ ↓ Home End Enter Esc, and typing to jump).

import { h, icon, clear } from './ui.js';

let open = null;   // the menu currently shown

export function closeMenu() { if (open) open.close(); }

// items: [{value, label, sub?, icon?, color?, group?, disabled?, selected?}]
// opts: {anchor, items, onPick(item), onClose?, label, className?, header?, footer?, keepFocus?}
export function openMenu(opts) {
  closeMenu();
  const { anchor } = opts;
  const list = h('div', { class: 'nx-menu-list', role: 'listbox', 'aria-label': opts.label || '' });
  const el = h('div', { class: `nx-menu ${opts.className || ''}`.trim() }, opts.header || null, list, opts.footer || null);
  let items = [], active = -1, typed = '', typedAt = 0;

  function render(newItems) {
    items = newItems || items;
    clear(list);
    let lastGroup = null;
    items.forEach((it, i) => {
      if (it.group && it.group !== lastGroup) { list.append(h('div', { class: 'nx-menu-group', role: 'presentation', text: it.group })); lastGroup = it.group; }
      const row = h('div', {
        class: `nx-opt${it.selected ? ' sel' : ''}${it.disabled ? ' dis' : ''}`, role: 'option', id: `nxo-${i}`,
        'aria-selected': String(!!it.selected), 'aria-disabled': it.disabled ? 'true' : undefined, 'data-i': String(i),
        style: it.color ? { '--c': it.color } : undefined,
      },
      it.icon ? h('span', { class: 'nx-opt-ic' }, icon(it.icon, 'sm')) : null,
      h('span', { class: 'nx-opt-t' }, h('b', { text: it.label }), it.sub ? h('small', { text: it.sub }) : null),
      it.meta ? h('span', { class: 'nx-opt-meta', text: it.meta }) : null,
      it.selected ? icon('check', 'sm nx-opt-check') : null);
      list.append(row);
    });
    if (opts.empty && !items.length) list.append(h('div', { class: 'nx-menu-empty', text: opts.empty }));
    const sel = items.findIndex((x) => x.selected);
    setActive(active >= 0 && active < items.length ? active : sel >= 0 ? sel : (opts.autoActive ? 0 : -1), true);
    place();
  }
  function setActive(i, quiet) {
    active = i;
    list.querySelectorAll('.nx-opt').forEach((r) => r.classList.toggle('act', Number(r.dataset.i) === i));
    const row = list.querySelector(`.nx-opt[data-i="${i}"]`);
    if (row) { row.scrollIntoView({ block: 'nearest' }); (opts.keepFocus ? anchor : el).setAttribute?.('aria-activedescendant', row.id); }
    if (!quiet && opts.onActive) opts.onActive(items.at(i));
  }
  function move(d) {
    if (!items.length) return;
    let i = active;
    for (let n = 0; n < items.length; n++) { i = (i + d + items.length) % items.length; if (!items.at(i).disabled) break; }
    setActive(i);
  }
  function pick(i) {
    const it = items.at(i);
    if (!it || it.disabled) return;
    api.close(true);
    opts.onPick(it);
  }
  function place() {
    const r = anchor.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight, gap = 6;
    const w = Math.min(Math.max(r.width, opts.minWidth || 220), vw - 16);
    el.style.width = `${w}px`;
    el.style.left = `${Math.max(8, Math.min(r.left, vw - w - 8))}px`;
    const below = vh - r.bottom - gap - 8, above = r.top - gap - 8;
    const up = below < 220 && above > below;
    const maxH = Math.max(140, Math.min(up ? above : below, 360));
    el.style.maxHeight = `${maxH}px`;
    el.classList.toggle('up', up);
    if (up) { el.style.top = ''; el.style.bottom = `${vh - r.top + gap}px`; } else { el.style.bottom = ''; el.style.top = `${r.bottom + gap}px`; }
  }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === 'Enter' || (e.key === ' ' && !opts.keepFocus)) { if (active >= 0) { e.preventDefault(); pick(active); } else if (opts.onEnter) { e.preventDefault(); opts.onEnter(); } }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); }
    else if (e.key === 'Tab') api.close(true);
    else if (!opts.keepFocus && e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now(); typed = now - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase(); typedAt = now;
      const i = items.findIndex((x) => !x.disabled && x.label.toLowerCase().startsWith(typed));
      if (i >= 0) setActive(i);
    }
  };
  list.addEventListener('pointerdown', (e) => e.preventDefault());   // keep focus where it is
  list.addEventListener('click', (e) => { const row = e.target.closest('.nx-opt'); if (row) pick(Number(row.dataset.i)); });
  list.addEventListener('pointermove', (e) => { const row = e.target.closest('.nx-opt'); if (row && Number(row.dataset.i) !== active) setActive(Number(row.dataset.i), true); });
  const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) api.close(true); };
  const onScroll = (e) => { if (!el.contains(e.target)) place(); };
  const keyTarget = opts.keepFocus ? anchor : el;

  const api = {
    el,
    update: (newItems) => render(newItems),
    keyDown: onKey,
    close(quiet) {
      if (open !== api) return;
      open = null;
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
      if (!opts.keepFocus) el.removeEventListener('keydown', onKey);
      el.classList.add('out');
      setTimeout(() => el.remove(), 140);
      if (!quiet && !opts.keepFocus && anchor.focus) anchor.focus({ preventScroll: true });
      opts.onClose && opts.onClose();
    },
  };
  open = api;
  document.body.append(el);
  render(opts.items || []);
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', place);
  if (!opts.keepFocus) { el.tabIndex = -1; el.addEventListener('keydown', onKey); el.focus({ preventScroll: true }); }
  void keyTarget;
  return api;
}
