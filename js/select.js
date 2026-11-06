// Every <select> in the app becomes a themed dropdown (glass menu, theme
// colours, keyboard and touch friendly) instead of the system's plain list.
// The real <select> stays in the page, hidden, so every tool keeps reading
// .value and listening for 'change' exactly as before. Setting .value or
// .selectedIndex from code updates the button too.

import { h, icon } from './ui.js';
import { openMenu } from './menu.js';

const proto = HTMLSelectElement.prototype;
const valueDesc = Object.getOwnPropertyDescriptor(proto, 'value');
const indexDesc = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');
let uid = 0;

function enhance(sel) {
  if (sel.dataset.nx || sel.multiple || sel.size > 1 || sel.hasAttribute('data-native')) return;
  sel.dataset.nx = '1';
  const id = sel.id || `nxs-${++uid}`;
  if (!sel.id) sel.id = id;
  const label = sel.id ? document.querySelector(`label[for="${CSS.escape(sel.id)}"]`) : null;
  const text = h('span', { class: 'nx-select-text' });
  const btn = h('button', {
    class: `nx-select-btn ${sel.className}`.trim(), type: 'button', id: `${id}-btn`,
    'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    'aria-label': sel.getAttribute('aria-label') || undefined,
    title: sel.getAttribute('title') || undefined,
  }, text, icon('down', 'sm nx-select-chev'));
  if (label) { label.setAttribute('for', btn.id); btn.setAttribute('aria-labelledby', `${label.id || (label.id = `${id}-lbl`)} ${btn.id}`); }
  const wrap = h('span', { class: 'nx-select' });
  sel.replaceWith(wrap);
  wrap.append(btn, sel);
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');

  const refresh = () => {
    const o = sel.options[sel.selectedIndex];
    text.textContent = o ? o.textContent : '';
    btn.disabled = sel.disabled;
  };
  // keep the button in step when code sets the value
  Object.defineProperty(sel, 'value', { configurable: true, get() { return valueDesc.get.call(this); }, set(v) { valueDesc.set.call(this, v); refresh(); } });
  Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return indexDesc.get.call(this); }, set(v) { indexDesc.set.call(this, v); refresh(); } });
  sel.addEventListener('change', refresh);
  new MutationObserver(refresh).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'label'] });
  refresh();

  const items = () => [...sel.options].map((o, i) => ({
    value: o.value, label: o.textContent, i, disabled: o.disabled, selected: i === sel.selectedIndex,
    group: o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : undefined,
  }));
  const show = () => {
    if (sel.disabled) return;
    btn.setAttribute('aria-expanded', 'true');
    wrap.classList.add('open');
    openMenu({
      anchor: btn, items: items(), label: label ? label.textContent : sel.getAttribute('aria-label') || '',
      className: btn.closest('.geo-hud') ? 'hud' : '', minWidth: 180,
      onPick: (it) => {
        if (it.i !== sel.selectedIndex) {
          indexDesc.set.call(sel, it.i);
          refresh();
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        btn.focus({ preventScroll: true });
      },
      onClose: () => { btn.setAttribute('aria-expanded', 'false'); wrap.classList.remove('open'); },
    });
  };
  btn.addEventListener('click', show);
  btn.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
  });
}

export function initSelects(root = document.body) {
  root.querySelectorAll('select').forEach(enhance);
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'SELECT') enhance(n); else if (n.querySelectorAll) n.querySelectorAll('select').forEach(enhance);
    }
  }).observe(root, { childList: true, subtree: true });
}
