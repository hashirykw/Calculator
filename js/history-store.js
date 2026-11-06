// History and favourites data (UI lives in history.js). Every result from
// Calculator, Solve, Graph and Tools arrives on the bus as 'result'.

import { store } from './store.js';
import { bus } from './bus.js';

const MAX = 500;
let items = sanitize(store.get('history', []));
let favs = sanitize(store.get('favs', []));

function sanitize(list) {
  return Array.isArray(list) ? list.filter((e) => e && typeof e === 'object' && e.id && e.input) : [];
}
const save = () => { store.set('history', items); bus.emit('history:changed'); };
const saveFavs = () => { store.set('favs', favs); bus.emit('history:changed'); };

export function addEntry(e) {
  if (!e || !e.input) return null;
  const last = items[items.length - 1];
  // pressing = repeatedly on the same thing shouldn't flood the list
  if (last && last.input === e.input && last.decimal === e.decimal && last.kind === e.kind) return last;
  const entry = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    input: String(e.input).slice(0, 2000),
    exact: e.exact ? String(e.exact).slice(0, 2000) : '',
    decimal: e.decimal ? String(e.decimal).slice(0, 2000) : '',
    kind: e.kind || 'calc',
    ref: e.ref || null,
  };
  items.push(entry);
  if (items.length > MAX) items = items.slice(-MAX);
  save();
  return entry;
}

export const getHistory = () => items.slice();
export const getFavs = () => favs.slice();
export const isFav = (id) => favs.some((f) => f.id === id);

export function removeEntry(id) {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [gone] = items.splice(i, 1);
  save();
  return { entry: gone, index: i };
}
export function restoreEntry({ entry, index }) {
  items.splice(Math.min(index, items.length), 0, entry);
  save();
}
export function clearHistory() { items = []; save(); }

export function toggleFav(entry) {
  const i = favs.findIndex((f) => f.id === entry.id);
  if (i >= 0) favs.splice(i, 1);
  else { favs.push({ ...entry }); if (favs.length > 200) favs = favs.slice(-200); }
  saveFavs();
  return i < 0;
}
export function removeFav(id) { favs = favs.filter((f) => f.id !== id); saveFavs(); }

bus.on('result', (e) => {
  const entry = addEntry(e);
  if (entry && typeof e.onSaved === 'function') e.onSaved(entry);
});
