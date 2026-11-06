// Find any place on Earth by name, address or coordinates.
//  1. Coordinates (decimal or degrees-minutes-seconds) are read directly.
//  2. The built-in city list answers instantly and offline.
//  3. Online, two free services with no key are asked in parallel:
//     Open-Meteo geocoding (cities, towns, villages, with their time zone) and
//     OpenStreetMap Nominatim (areas, addresses, landmarks, buildings).
// Places picked by the person are remembered on the device, so they keep
// working offline. A place without a known time zone gets one from Open-Meteo.

import { CITIES } from './tools/geo-data.js';
import { store } from './store.js';

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const OSM = 'https://nominatim.openstreetmap.org';
const TZ = 'https://api.open-meteo.com/v1/forecast';
const cache = new Map();
const tzCache = new Map();
let lastOsm = 0;

const clean = (s) => String(s || '').trim();
const key = (p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
const fmtDec = (lat, lon) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

// a place: {name, sub, lat, lon, tz?, kind: 'city'|'place'|'coords'|'me'|'recent', label}
const mk = (o) => ({ ...o, label: o.sub ? `${o.name}, ${o.sub}` : o.name });

export function parseCoords(raw) {
  const s = clean(raw);
  if (!s) return null;
  const dmsRe = /(\d+(?:\.\d+)?)\s*[°d\s]\s*(?:(\d+(?:\.\d+)?)\s*['′m]?\s*)?(?:(\d+(?:\.\d+)?)\s*["″s]?\s*)?([NSEW])/gi;
  const parts = [...s.matchAll(dmsRe)];
  if (parts.length === 2) {
    const val = (m) => (Number(m[1]) + Number(m[2] || 0) / 60 + Number(m[3] || 0) / 3600) * (/[SW]/i.test(m[4]) ? -1 : 1);
    let lat = val(parts[0]), lon = val(parts[1]);
    if (/[EW]/i.test(parts[0][4])) [lat, lon] = [lon, lat];
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return mk({ name: fmtDec(lat, lon), lat, lon, kind: 'coords' });
  }
  const nums = s.match(/-?\d+(\.\d+)?/g);
  if (nums && nums.length === 2 && /^[-\d.\s,;]+$/.test(s)) {
    const lat = Number(nums[0]), lon = Number(nums[1]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return mk({ name: fmtDec(lat, lon), lat, lon, kind: 'coords' });
  }
  return null;
}

const fromCity = (c) => mk({ name: c[0], sub: c[1], lat: c[2], lon: c[3], tz: c[4], kind: 'city' });

export function recent() { return store.get('places', []).map(mk); }
export function remember(p) {
  if (!p || p.kind === 'coords') return;
  const list = store.get('places', []).filter((x) => key(x) !== key(p));
  list.unshift({ name: p.name, sub: p.sub, lat: p.lat, lon: p.lon, tz: p.tz, kind: 'recent' });
  store.set('places', list.slice(0, 12));
}

// Offline match: coordinates, saved places, built-in cities.
export function localMatches(raw, limit = 6) {
  const q = clean(raw).toLowerCase();
  if (!q) return [...recent().slice(0, 4), ...CITIES.slice(0, 4).map(fromCity)].slice(0, limit);
  const out = [];
  const c = parseCoords(raw);
  if (c) out.push(c);
  const score = (name, sub) => {
    const n = name.toLowerCase(), full = `${n}, ${(sub || '').toLowerCase()}`;
    if (n === q || full === q) return 0;
    if (n.startsWith(q) || full.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    return 9;
  };
  const pool = [...recent(), ...CITIES.map(fromCity)];
  const seen = new Set();
  pool.map((p) => [score(p.name, p.sub), p]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0])
    .forEach(([, p]) => { const k = key(p); if (!seen.has(k)) { seen.add(k); out.push(p); } });
  return out.slice(0, limit);
}

// Best offline answer for typed text (used before anything is picked).
export function resolveLocal(raw) {
  const c = parseCoords(raw);
  if (c) return c;
  const q = clean(raw).toLowerCase();
  if (!q) return null;
  const pool = [...recent(), ...CITIES.map(fromCity)];
  return pool.find((p) => p.label.toLowerCase() === q) || pool.find((p) => p.name.toLowerCase() === q)
    || pool.find((p) => p.label.toLowerCase().startsWith(q)) || pool.find((p) => p.name.toLowerCase().startsWith(q)) || null;
}

async function getJSON(url, signal) {
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

// Online search: both services in parallel, merged, nearest duplicates removed.
export async function searchOnline(raw, { signal } = {}) {
  const q = clean(raw);
  if (q.length < 2 || parseCoords(q)) return [];
  if (cache.has(q.toLowerCase())) return cache.get(q.toLowerCase());
  const lang = document.documentElement.lang === 'ur' ? 'ur' : 'en';
  const om = getJSON(`${GEO}?name=${encodeURIComponent(q)}&count=8&language=${lang}&format=json`, signal)
    .then((d) => (d.results || []).map((r) => mk({
      name: r.name, sub: [r.admin1, r.country].filter((x, i, a) => x && a.indexOf(x) === i && x !== r.name).join(', '),
      lat: r.latitude, lon: r.longitude, tz: r.timezone, kind: 'city', pop: r.population || 0,
    }))).catch((e) => { if (e.name === 'AbortError') throw e; return []; });
  // Nominatim asks for at most one request a second from each user
  const wait = Math.max(0, 1100 - (Date.now() - lastOsm));
  const osm = (q.length < 3 ? Promise.resolve([]) : new Promise((res) => setTimeout(res, wait)).then(() => {
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    lastOsm = Date.now();
    return getJSON(`${OSM}/search?format=jsonv2&addressdetails=1&limit=8&accept-language=${lang}&q=${encodeURIComponent(q)}`, signal);
  }).then((d) => (d || []).map((r) => {
    const a = r.address || {};
    const name = r.name || clean(String(r.display_name).split(',')[0]);
    const town = a.city || a.town || a.village || a.suburb || a.county || '';
    const sub = [town !== name ? town : '', a.state, a.country].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ');
    return mk({ name, sub, lat: Number(r.lat), lon: Number(r.lon), kind: 'place', type: r.type || r.category });
  })).catch((e) => { if (e.name === 'AbortError') throw e; return []; }));
  const [a, b] = await Promise.all([om, osm]);
  const out = [];
  const near = (p) => out.some((x) => Math.abs(x.lat - p.lat) < 0.02 && Math.abs(x.lon - p.lon) < 0.02 && x.name.toLowerCase() === p.name.toLowerCase());
  [...a, ...b].forEach((p) => { if (Number.isFinite(p.lat) && Number.isFinite(p.lon) && !near(p)) out.push(p); });
  cache.set(q.toLowerCase(), out.slice(0, 10));
  return out.slice(0, 10);
}

// Time zone for any point (cached); null offline, then local solar time is used.
export async function timezoneFor(p) {
  if (p.tz) return p.tz;
  const k = key(p);
  if (tzCache.has(k)) return tzCache.get(k);
  try {
    const d = await getJSON(`${TZ}?latitude=${p.lat}&longitude=${p.lon}&timezone=auto&forecast_days=1&daily=sunrise`);
    const tz = d && typeof d.timezone === 'string' && d.timezone !== 'GMT' ? d.timezone : null;
    tzCache.set(k, tz);
    return tz;
  } catch { return null; }
}

// "Use my location": browser location, named by OpenStreetMap when online.
export function myLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('unsupported')); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      let name = '', sub = '';
      try {
        const r = await getJSON(`${OSM}/reverse?format=jsonv2&zoom=12&lat=${lat}&lon=${lon}&accept-language=${document.documentElement.lang === 'ur' ? 'ur' : 'en'}`);
        const a = (r && r.address) || {};
        name = a.suburb || a.city || a.town || a.village || a.county || '';
        sub = [a.city !== name ? a.city : '', a.state, a.country].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ');
      } catch { /* offline: coordinates only */ }
      resolve(mk({ name: name || fmtDec(lat, lon), sub, lat, lon, kind: 'me', tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    }, (err) => reject(err), { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  });
}
