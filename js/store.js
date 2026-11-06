// All saving goes through here. Versioned keys (nxc:v1:*), every read and
// write wrapped in try/catch (private browsing can block storage), and bad
// or old saved data never crashes the app.

const PREFIX = 'nxc:v1:';
const LIMITS = { history: 500, favs: 200, amy: 30 };

export const DEFAULT_SETTINGS = {
  theme: 'system',          // 'system' follows light/dark until the user picks one
  motion: 'system',         // 'system' | 'reduced' | 'full'
  fontSize: 'm',
  angle: 'deg',
  exactFirst: false,
  sig: 10,
  sciHigh: 12,
  complex: false,
  group: 'intl',            // 'intl' | 'lakh' | 'none'
  keypad: 'scientific',     // 'scientific' | 'basic'
  sound: false,
  vibrate: false,
  amy: true,
  amyHistory: false,
  amyMode: 'fast',
  lang: 'en',
  currency: 'PKR',
  watermark: true,
  quartile: 'halves',
  examMode: false,
  memory: '0',
  visits: 0,
  installHintShown: false,
};

const memoryFallback = new Map();
let available = true;
try {
  const k = PREFIX + '__test';
  localStorage.setItem(k, '1');
  localStorage.removeItem(k);
} catch { available = false; }

function rawGet(key) {
  try { return available ? localStorage.getItem(PREFIX + key) : memoryFallback.get(key) ?? null; } catch { return memoryFallback.get(key) ?? null; }
}
function rawSet(key, value) {
  try {
    if (available) localStorage.setItem(PREFIX + key, value);
    else memoryFallback.set(key, value);
    return true;
  } catch {
    memoryFallback.set(key, value);
    return false;
  }
}

export const store = {
  available,
  get(key, fallback = null) {
    const raw = rawGet(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) {
    if (Array.isArray(value) && LIMITS[key]) value = value.slice(-LIMITS[key]);
    return rawSet(key, JSON.stringify(value));
  },
  remove(key) {
    try { if (available) localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
    memoryFallback.delete(key);
  },
  // Everything this app saved on this device.
  exportAll() {
    const out = {};
    for (const k of ['settings', 'history', 'favs', 'graph', 'scores', 'ach', 'amy', 'rates', 'sudoku', 'formulaFavs', 'recentTools']) {
      const v = store.get(k);
      if (v !== null) out[k] = v;
    }
    return { app: 'Nexlyr Calculator', version: 1, exported: new Date().toISOString(), data: out };
  },
  importAll(obj) {
    if (!obj || obj.app !== 'Nexlyr Calculator' || !obj.data) throw new Error('not a Nexlyr Calculator export');
    for (const [k, v] of Object.entries(obj.data)) store.set(k, v);
  },
  clearAll() {
    try {
      if (available) Object.keys(localStorage).filter((k) => k.startsWith('nxc:')).forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    memoryFallback.clear();
  },
};

// Settings with defaults merged in and unknown/invalid values dropped.
export function loadSettings() {
  const saved = store.get('settings', {});
  const s = { ...DEFAULT_SETTINGS };
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved)) {
      if (k in DEFAULT_SETTINGS && typeof v === typeof DEFAULT_SETTINGS[k]) s[k] = v;
    }
  }
  return s;
}
export function saveSettings(s) { store.set('settings', s); }

// One-time migration hook: older keys from YKW or future versions go here.
(function migrate() {
  try {
    const ver = store.get('schema', 0);
    if (ver < 1) store.set('schema', 1);
  } catch { /* never block start-up */ }
})();
