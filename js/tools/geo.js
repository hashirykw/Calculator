// Geo: an Earth calculator laid out like a mission-control screen.
// Great-circle distance, bearings, Qibla, midpoint, destination point, local
// times, sunrise/sunset and daylight through the year, coordinate formats,
// antipodes and nearest cities — around a rotating dotted globe.

import { h, clear, icon, copyText } from '../ui.js';
import { t } from '../i18n/index.js';
import { app } from '../bus.js';
import { store } from '../store.js';
import { reducedMotion } from '../prefs.js';
import { fmt, record } from './kit.js';
import { CITIES, KAABA, LAND, WATER } from './geo-data.js';
import { placeInput } from '../place-input.js';
import { resolveLocal, timezoneFor } from '../places.js';

const R = 6371.0088;                       // mean Earth radius, km
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const norm360 = (x) => ((x % 360) + 360) % 360;
const norm180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;

// ---------- geodesy ----------
export function distance(a, b) {
  const [p1, p2] = [rad(a.lat), rad(b.lat)], dl = rad(b.lon - a.lon), dp = p2 - p1;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
export function bearing(a, b) {
  const [p1, p2] = [rad(a.lat), rad(b.lat)], dl = rad(b.lon - a.lon);
  return norm360(deg(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl))));
}
export function midpoint(a, b) {
  const [p1, p2, l1] = [rad(a.lat), rad(b.lat), rad(a.lon)], dl = rad(b.lon - a.lon);
  const bx = Math.cos(p2) * Math.cos(dl), by = Math.cos(p2) * Math.sin(dl);
  return { lat: deg(Math.atan2(Math.sin(p1) + Math.sin(p2), Math.hypot(Math.cos(p1) + bx, by))), lon: norm180(deg(l1 + Math.atan2(by, Math.cos(p1) + bx))) };
}
export function destination(a, brg, km) {
  const p1 = rad(a.lat), l1 = rad(a.lon), th = rad(brg), d = km / R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lon: norm180(deg(l2)) };
}
export function rhumb(a, b) {
  const p1 = rad(a.lat), p2 = rad(b.lat), dp = p2 - p1;
  let dl = rad(b.lon - a.lon);
  if (Math.abs(dl) > Math.PI) dl = dl > 0 ? -(2 * Math.PI - dl) : 2 * Math.PI + dl;
  const dq = Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
  const q = Math.abs(dq) > 1e-12 ? dp / dq : Math.cos(p1);
  return { km: Math.hypot(dp, q * dl) * R, brg: norm360(deg(Math.atan2(dl, dq))) };
}
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (b) => POINTS[Math.round(norm360(b) / 22.5) % 16];

export function dms(v, posChar, negChar) {
  const a = Math.abs(v); let d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60;
  if (s >= 59.995) { s = 0; m++; } if (m >= 60) { m = 0; d++; }
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(2).padStart(5, '0')}″ ${v < 0 ? negChar : posChar}`;
}
const fmtLL = (p) => `${dms(p.lat, 'N', 'S')}  ${dms(p.lon, 'E', 'W')}`;
const fmtDec = (p) => `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;

// "Karachi", "24.86, 67.01", "24°51′38″N 67°0′4″E"
export function parsePlace(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const nums = s.match(/-?\d+(\.\d+)?/g);
  const dmsRe = /(\d+(?:\.\d+)?)\s*[°d\s]\s*(?:(\d+(?:\.\d+)?)\s*['′m]?\s*)?(?:(\d+(?:\.\d+)?)\s*["″s]?\s*)?([NSEW])/gi;
  const parts = [...s.matchAll(dmsRe)];
  if (parts.length === 2) {
    const val = (m) => (Number(m[1]) + Number(m[2] || 0) / 60 + Number(m[3] || 0) / 3600) * (/[SW]/i.test(m[4]) ? -1 : 1);
    let lat = val(parts[0]), lon = val(parts[1]);
    if (/[EW]/i.test(parts[0][4])) [lat, lon] = [lon, lat];
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { name: fmtDec({ lat, lon }), lat, lon, custom: true };
  }
  if (nums && nums.length === 2 && /^[-\d.\s,;]+$/.test(s)) {
    const lat = Number(nums[0]), lon = Number(nums[1]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { name: fmtDec({ lat, lon }), lat, lon, custom: true };
  }
  const q = s.toLowerCase();
  const hit = CITIES.find((c) => c[0].toLowerCase() === q) || CITIES.find((c) => `${c[0]}, ${c[1]}`.toLowerCase() === q) || CITIES.find((c) => c[0].toLowerCase().startsWith(q));
  return hit ? { name: hit[0], country: hit[1], lat: hit[2], lon: hit[3], tz: hit[4] } : null;
}

// ---------- time ----------
function tzOffsetMin(tz, date = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map((x) => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch { return null; }
}
const offTxt = (m) => (m === null ? '—' : `UTC${m < 0 ? '−' : '+'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? `:${String(Math.abs(m) % 60).padStart(2, '0')}` : ''}`);
const placeOffset = (p, d) => (p.tz ? tzOffsetMin(p.tz, d) : Math.round((p.lon / 15) * 60));
function clock(p, date = new Date(), withDay = true) {
  const off = placeOffset(p, date);
  const local = new Date(date.getTime() + off * 60000);
  const hh = String(local.getUTCHours()).padStart(2, '0'), mm = String(local.getUTCMinutes()).padStart(2, '0');
  const day = local.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return withDay ? `${hh}:${mm} · ${day}` : `${hh}:${mm}`;
}

const dayOf = (p, date) => new Date(date.getTime() + placeOffset(p, date) * 60000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Sunrise equation (NOAA-style), accurate to about a minute away from the poles.
export function sunTimes(p, date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = Math.round(jd - 2451545.0 + 0.0008);
  const Js = n - p.lon / 360;
  const M = norm360(357.5291 + 0.98560028 * Js);
  const C = 1.9148 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 0.0003 * Math.sin(rad(3 * M));
  const L = norm360(M + C + 180 + 102.9372);
  const Jt = 2451545.0 + Js + 0.0053 * Math.sin(rad(M)) - 0.0069 * Math.sin(rad(2 * L));
  const dec = Math.asin(Math.sin(rad(L)) * Math.sin(rad(23.4397)));
  const cosw = (Math.sin(rad(-0.833)) - Math.sin(rad(p.lat)) * Math.sin(dec)) / (Math.cos(rad(p.lat)) * Math.cos(dec));
  const toDate = (j) => new Date((j - 2440587.5) * 86400000);
  if (cosw > 1) return { polar: 'night', dec: deg(dec), noon: toDate(Jt), length: 0 };
  if (cosw < -1) return { polar: 'day', dec: deg(dec), noon: toDate(Jt), length: 24 };
  const w = deg(Math.acos(cosw));
  return { rise: toDate(Jt - w / 360), set: toDate(Jt + w / 360), noon: toDate(Jt), length: (2 * w) / 15, dec: deg(dec) };
}

// ---------- globe ----------
function buildLand() {
  const inPoly = (lon, lat, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const pts = [];
  for (let lat = -84; lat <= 84; lat += 1.8) {
    const step = 1.8 / Math.max(0.2, Math.cos(rad(lat)));
    for (let lon = -180; lon < 180; lon += step) {
      if (LAND.some((p) => inPoly(lon, lat, p)) && !WATER.some((p) => inPoly(lon, lat, p))) pts.push([lat, lon]);
    }
  }
  return pts;
}
let LAND_PTS = null;

export function create() {
  const saved = store.get('geo', {});
  const fromIn = h('input', { class: 'hud-input', type: 'text', value: saved.fromPlace?.label || saved.from || 'Karachi, Pakistan', placeholder: t('geo.placeHint'), 'aria-label': t('geo.from'), autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  const toIn = h('input', { class: 'hud-input', type: 'text', value: saved.toPlace?.label || saved.to || 'London, United Kingdom', placeholder: t('geo.placeHint'), 'aria-label': t('geo.to'), autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  if (saved.fromPlace) fromIn._place = saved.fromPlace;
  if (saved.toPlace) toIn._place = saved.toPlace;
  const brgIn = h('input', { class: 'hud-input mono', inputmode: 'decimal', value: saved.brg ?? '45', 'aria-label': t('geo.bearingIn') });
  const kmIn = h('input', { class: 'hud-input mono', inputmode: 'decimal', value: saved.km ?? '1000', 'aria-label': t('geo.distIn') });
  const canvas = h('canvas', { class: 'globe', role: 'img', 'aria-label': t('geo.globe') });
  const rose = h('canvas', { class: 'rose', width: 120, height: 120, 'aria-hidden': 'true' });
  const sunChart = h('canvas', { class: 'hud-chart', 'aria-hidden': 'true' });
  const utc = h('span', { class: 'mono hud-clock' });
  const val = (k) => h('b', { class: 'mono', data: { k } });
  const kv = (label, k, copy) => h('div', { class: 'hud-kv' }, h('span', { text: label }), copy ? h('button', { class: 'hud-copy', type: 'button', title: t('common.copy'), on: { click: (e) => copyText(e.currentTarget.textContent) } }, val(k)) : val(k));
  const panel = (title, tag, ...kids) => h('section', { class: 'hud-panel' }, h('header', {}, h('h3', { text: title }), tag ? h('span', { class: 'hud-tag', text: tag }) : null), ...kids);
  const stat = (k, unit) => h('div', { class: 'hud-stat' }, h('b', { class: 'mono', data: { k } }), h('span', { text: unit }));
  const near = h('div', { class: 'hud-bars' });
  const ticker = h('div', { class: 'hud-ticker' });
  const msg = h('p', { class: 'hud-msg', hidden: true });
  let spin = !reducedMotion();
  const spinBtn = h('button', { class: 'hud-btn', type: 'button', 'aria-pressed': String(spin), on: { click: () => { spin = !spin; spinBtn.setAttribute('aria-pressed', String(spin)); } } }, icon('rotate3d', 'sm'), t('geo.spin'));

  const root = h('div', { class: 'geo-hud' },
    h('header', { class: 'hud-top' },
      h('a', { class: 'hud-back', href: '#/tools' }, icon('left', 'sm'), t('nav.tools')),
      h('div', { class: 'hud-title' }, h('span', { class: 'hud-kicker', text: 'NEXLYR · EARTH' }), h('h1', { text: t('tool.geo') })),
      h('div', { class: 'hud-top-r' }, h('span', { class: 'hud-tag', text: 'UTC' }), utc, spinBtn)),
    h('div', { class: 'hud-grid' },
      h('aside', { class: 'hud-col' },
        panel(t('geo.route'), 'GREAT CIRCLE',
          h('div', { class: 'hud-route' },
            h('label', {}, h('span', { text: t('geo.from') }), fromIn),
            h('button', { class: 'hud-swap', type: 'button', 'aria-label': t('common.swap'), on: { click: () => { [fromIn.value, toIn.value] = [toIn.value, fromIn.value]; [fromIn._place, toIn._place] = [toIn._place, fromIn._place]; update(true); } } }, icon('swap', 'sm')),
            h('label', {}, h('span', { text: t('geo.to') }), toIn)),
          msg,
          h('div', { class: 'hud-stats' }, stat('km', 'km'), stat('mi', t('geo.miles')), stat('nmi', t('geo.nmi'))),
          kv(t('geo.rhumb'), 'rhumb'), kv(t('geo.flight'), 'flight')),
        panel(t('geo.bearing'), 'COMPASS',
          h('div', { class: 'hud-rose' }, rose, h('div', {}, kv(t('geo.initial'), 'b1'), kv(t('geo.final'), 'b2'), kv(t('geo.qibla'), 'qibla'), kv(t('geo.kaaba'), 'kaabaKm')))),
        panel(t('geo.dest'), 'DIRECT',
          h('div', { class: 'hud-two' }, h('label', {}, h('span', { text: t('geo.bearingIn') }), brgIn), h('label', {}, h('span', { text: t('geo.distIn') }), kmIn)),
          kv(t('geo.destPoint'), 'dest', true), kv(t('geo.destDms'), 'destDms', true))),
      h('div', { class: 'hud-globe' }, canvas,
        h('div', { class: 'hud-corner tl' }, h('span', { 'data-k': 'gFrom' }), h('small', { 'data-k': 'gFromLL' })),
        h('div', { class: 'hud-corner tr' }, h('span', { 'data-k': 'gTo' }), h('small', { 'data-k': 'gToLL' })),
        h('div', { class: 'hud-corner bl' }, h('small', { text: t('geo.drag') })),
        h('div', { class: 'hud-corner br' }, h('span', { 'data-k': 'gMid' }), h('small', { text: t('geo.midpoint') }))),
      h('aside', { class: 'hud-col' },
        panel(t('geo.time'), 'LOCAL',
          h('div', { class: 'hud-clocks' }, h('div', {}, h('small', { 'data-k': 'tFromName' }), h('b', { class: 'mono', 'data-k': 'tFrom' }), h('small', { 'data-k': 'tFromOff' })),
            h('div', {}, h('small', { 'data-k': 'tToName' }), h('b', { class: 'mono', 'data-k': 'tTo' }), h('small', { 'data-k': 'tToOff' }))),
          kv(t('geo.diff'), 'tDiff')),
        panel(t('geo.sun'), 'SOLAR',
          h('div', { class: 'hud-stats three' }, stat('rise', t('geo.sunrise')), stat('set', t('geo.sunset')), stat('day', t('geo.daylight'))),
          kv(t('geo.noon'), 'noon'), kv(t('geo.decl'), 'decl'), sunChart, h('small', { class: 'hud-note', text: t('geo.sunNote') })),
        panel(t('geo.coords'), 'WGS 84',
          kv(t('geo.decimal'), 'dec', true), kv(t('geo.dmsFmt'), 'dms', true), kv(t('geo.antipode'), 'anti', true),
          kv(t('geo.toEquator'), 'eq'), kv(t('geo.latCircle'), 'circle')))),
    h('div', { class: 'hud-bottom' },
      panel(t('geo.nearest'), 'RANGE', near),
      h('section', { class: 'hud-panel hud-wc' }, h('header', {}, h('h3', { text: t('geo.worldClock') }), h('span', { class: 'hud-tag', text: 'LIVE' })), ticker)));

  const $ = (k) => root.querySelectorAll(`[data-k="${k}"]`);
  const set = (k, v) => $(k).forEach((el) => { el.textContent = v; });

  // ---------- state ----------
  // a place picked from the suggestions wins; otherwise the typed text is read (coordinates, saved places, cities)
  const placeOf = (inp) => (inp._place && inp.value === inp._place.label ? inp._place : resolveLocal(inp.value));
  let A = placeOf(fromIn) || parsePlace('Karachi');
  let B = placeOf(toIn) || parsePlace('London');
  let D = null;
  let view = { lon: A.lon, lat: 18, zoom: 1 }, target = null;

  function update(focus) {
    const a = placeOf(fromIn), b = placeOf(toIn);
    // only nag about an unknown place once the person has left the box
    msg.hidden = !!(a && b) || [fromIn, toIn].includes(document.activeElement);
    if (!a || !b) { msg.textContent = t('geo.notFound'); }
    if (a) A = a; if (b) B = b;
    store.set('geo', { from: fromIn.value, to: toIn.value, fromPlace: a || undefined, toPlace: b || undefined, brg: brgIn.value, km: kmIn.value });
    const km = distance(A, B), b1 = bearing(A, B), b2 = norm360(bearing(B, A) + 180), m = midpoint(A, B), rh = rhumb(A, B);
    const big = (v) => (v >= 100 ? Math.round(v).toLocaleString('en') : fmt(v, 4));
    set('km', big(km)); set('mi', big(km / 1.609344)); set('nmi', big(km / 1.852));
    set('rhumb', `${fmt(rh.km, 6)} km · ${rh.brg.toFixed(1)}°`);
    const hrs = km / 850 + 0.5;
    set('flight', km < 150 ? '—' : `≈ ${Math.floor(hrs)} h ${String(Math.round((hrs % 1) * 60)).padStart(2, '0')} min`);
    set('b1', `${b1.toFixed(2)}° ${compass(b1)}`); set('b2', `${b2.toFixed(2)}° ${compass(b2)}`);
    const k = { lat: KAABA[0], lon: KAABA[1] }, qb = bearing(A, k);
    set('qibla', distance(A, k) < 0.05 ? t('geo.atKaaba') : `${qb.toFixed(2)}° ${compass(qb)}`);
    set('kaabaKm', `${fmt(distance(A, k), 6)} km`);
    set('gFrom', A.name); set('gTo', B.name); set('gFromLL', fmtDec(A)); set('gToLL', fmtDec(B)); set('gMid', fmtDec(m));
    // destination
    const bi = Number(brgIn.value), di = Number(kmIn.value);
    if (Number.isFinite(bi) && Number.isFinite(di) && di >= 0 && di <= 40075) { D = destination(A, norm360(bi), di); set('dest', fmtDec(D)); set('destDms', fmtLL(D)); }
    else { D = null; set('dest', '—'); set('destDms', '—'); }
    // coordinates of A
    set('dec', fmtDec(A)); set('dms', fmtLL(A));
    set('anti', fmtDec({ lat: -A.lat, lon: norm180(A.lon + 180) }));
    set('eq', `${fmt(Math.abs(A.lat) * (Math.PI * R / 180), 6)} km ${A.lat >= 0 ? t('geo.north') : t('geo.south')}`);
    set('circle', `${fmt(2 * Math.PI * R * Math.cos(rad(A.lat)), 6)} km`);
    drawRose(b1, qb);
    sun();
    nearest();
    tick();
    if (focus) target = { lon: m.lon, lat: Math.max(-60, Math.min(60, m.lat)) };
    record('geo', `${A.name} → ${B.name}`, `${fmt(km, 6)} km, ${b1.toFixed(1)}°`);
  }

  function sun() {
    const s = sunTimes(A);
    const lt = (d) => clock(A, d, false);
    if (s.polar) { set('rise', '—'); set('set', '—'); set('day', s.polar === 'day' ? '24 h' : '0 h'); }
    else { set('rise', lt(s.rise)); set('set', lt(s.set)); set('day', `${Math.floor(s.length)}h ${String(Math.round((s.length % 1) * 60)).padStart(2, '0')}m`); }
    set('noon', lt(s.noon)); set('decl', `${s.dec.toFixed(2)}°`);
    // daylight through the year
    const yr = new Date().getUTCFullYear();
    const pts = Array.from({ length: 12 }, (_, i) => sunTimes(A, new Date(Date.UTC(yr, i, 15, 12))).length);
    const dpr = Math.min(2, devicePixelRatio || 1), w = sunChart.clientWidth || 260, hh = 86;
    sunChart.width = w * dpr; sunChart.height = hh * dpr; sunChart.style.height = `${hh}px`;
    const g = sunChart.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
    const X = (i) => 14 + (i * (w - 28)) / 11, Y = (v) => hh - 16 - (v / 24) * (hh - 26);
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
    for (const v of [6, 12, 18]) { g.beginPath(); g.moveTo(10, Y(v)); g.lineTo(w - 6, Y(v)); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '9px ui-monospace, monospace';
    'JFMAMJJASOND'.split('').forEach((c, i) => g.fillText(c, X(i) - 3, hh - 3));
    g.fillText('12h', 0, Y(12) - 3);
    const grad = g.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, '#f5b14a'); grad.addColorStop(1, '#ffe4a8');
    g.strokeStyle = grad; g.lineWidth = 2; g.beginPath(); pts.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
    const mo = new Date().getUTCMonth();
    pts.forEach((v, i) => { g.fillStyle = i === mo ? '#ffb347' : 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(X(i), Y(v), i === mo ? 3.5 : 1.8, 0, 7); g.fill(); });
  }

  function nearest() {
    clear(near);
    const others = CITIES.map((c) => ({ name: c[0], country: c[1], lat: c[2], lon: c[3] })).filter((c) => distance(A, c) > 1)
      .map((c) => ({ ...c, km: distance(A, c) })).sort((x, y) => x.km - y.km).slice(0, 7);
    const max = others[others.length - 1]?.km || 1;
    for (const c of others) {
      near.append(h('button', { class: 'hud-bar', type: 'button', on: { click: () => { toIn.value = c.name; update(true); } } },
        h('span', { class: 'n', text: c.name }), h('span', { class: 'track' }, h('i', { style: { width: `${Math.max(4, (c.km / max) * 100)}%` } })),
        h('span', { class: 'mono v', text: `${fmt(c.km, 4)} km` })));
    }
  }

  const WORLD = ['London', 'New York', 'Dubai', 'Makkah', 'Karachi', 'Beijing', 'Tokyo', 'Sydney'].map((n) => parsePlace(n));
  function tick() {
    const now = new Date();
    utc.textContent = now.toISOString().slice(11, 19);
    set('tFromName', A.name); set('tToName', B.name);
    set('tFrom', clock(A, now, false)); set('tTo', clock(B, now, false));
    const oa = placeOffset(A, now), ob = placeOffset(B, now);
    set('tFromOff', `${dayOf(A, now)} · ${A.tz ? offTxt(oa) : `${offTxt(oa)} · ${t('geo.solar')}`}`); set('tToOff', `${dayOf(B, now)} · ${B.tz ? offTxt(ob) : `${offTxt(ob)} · ${t('geo.solar')}`}`);
    const d = ob - oa;
    set('tDiff', d === 0 ? t('geo.same') : `${B.name} ${t(d > 0 ? 'geo.ahead' : 'geo.behind', { h: `${Math.floor(Math.abs(d) / 60)}${Math.abs(d) % 60 ? `:${String(Math.abs(d) % 60).padStart(2, '0')}` : ''}` })}`);
    if (!ticker.childElementCount) WORLD.forEach((p) => ticker.append(h('div', { class: 'wc' }, h('small', { text: p.name }), h('b', { class: 'mono' }), h('span', {}))));
    [...ticker.children].forEach((el, i) => { el.children[1].textContent = clock(WORLD[i], now, false); el.children[2].textContent = offTxt(placeOffset(WORLD[i], now)); });
  }

  function drawRose(b, qb) {
    const g = rose.getContext('2d'), c = 60;
    const dpr = Math.min(2, devicePixelRatio || 1);
    rose.width = 120 * dpr; rose.height = 120 * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, 120, 120);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
    g.beginPath(); g.arc(c, c, 50, 0, 7); g.stroke(); g.beginPath(); g.arc(c, c, 36, 0, 7); g.stroke();
    for (let i = 0; i < 72; i++) {
      const a = rad(i * 5), r1 = i % 18 === 0 ? 42 : i % 2 === 0 ? 46 : 48;
      g.beginPath(); g.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); g.lineTo(c + Math.sin(a) * 50, c - Math.cos(a) * 50); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '600 9px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([s, a]) => g.fillText(s, c + Math.sin(rad(a)) * 28, c - Math.cos(rad(a)) * 28));
    const needle = (a, col, len, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.sin(rad(a)) * len, c - Math.cos(rad(a)) * len); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(c + Math.sin(rad(a)) * len, c - Math.cos(rad(a)) * len, 3, 0, 7); g.fill(); };
    needle(qb, 'rgba(120,230,170,.85)', 40, 1.5);
    needle(b, '#ffb347', 46, 2.5);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(c, c, 3, 0, 7); g.fill();
  }

  // ---------- globe rendering ----------
  let raf = 0, last = 0, drag = null, idleUntil = 0, visible = false;
  const project = (lat, lon) => {
    const p = rad(lat), l = rad(lon - view.lon), p0 = rad(view.lat);
    return [Math.cos(p) * Math.sin(l), Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l), Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l)];
  };
  const vec = (p) => [Math.cos(rad(p.lat)) * Math.cos(rad(p.lon)), Math.cos(rad(p.lat)) * Math.sin(rad(p.lon)), Math.sin(rad(p.lat))];
  const unvec = (v) => ({ lat: deg(Math.asin(Math.max(-1, Math.min(1, v[2])))), lon: deg(Math.atan2(v[1], v[0])) });
  function arcPoints(a, b, n = 72, lift = 0.18) {
    const va = vec(a), vb = vec(b);
    const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])), om = Math.acos(dot);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const s = Math.sin(om) || 1;
      const k1 = om ? Math.sin((1 - f) * om) / s : 1 - f, k2 = om ? Math.sin(f * om) / s : f;
      const p = unvec([va[0] * k1 + vb[0] * k2, va[1] * k1 + vb[1] * k2, va[2] * k1 + vb[2] * k2]);
      out.push([p, 1 + lift * Math.sin(Math.PI * f) * Math.min(1, om / 1.2)]);
    }
    return out;
  }
  const HUBS = ['London', 'Dubai', 'New York', 'Beijing', 'Singapore', 'Makkah', 'Istanbul', 'Johannesburg', 'Sydney', 'Tokyo'].map((n) => parsePlace(n));

  function frame(ts) {
    raf = 0;
    if (!visible || !root.isConnected) return;
    const dt = Math.min(64, ts - (last || ts)); last = ts;
    if (target) {
      const dl = norm180(target.lon - view.lon), dp = target.lat - view.lat;
      view.lon = norm180(view.lon + dl * 0.06); view.lat += dp * 0.06;
      if (Math.abs(dl) < 0.2 && Math.abs(dp) < 0.2) target = null;
    } else if (spin && !drag && ts > idleUntil) view.lon = norm180(view.lon + dt * 0.006);
    draw(ts);
    raf = requestAnimationFrame(frame);
  }
  function draw(ts) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    if (!w || !hh) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const r = Math.min(w, hh) * 0.4 * view.zoom, cx = w / 2, cy = hh / 2;
    const S = (x, y) => [cx + x * r, cy - y * r];
    // outer HUD rings
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, r * 1.18, 0, 7); g.stroke();
    g.setLineDash([2, 6]); g.beginPath(); g.arc(cx, cy, r * 1.28, 0, 7); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2 + ts * 0.00005, r1 = r * (i % 10 === 0 ? 1.13 : 1.155);
      g.strokeStyle = i % 10 === 0 ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.08)';
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r * 1.18, cy + Math.sin(a) * r * 1.18); g.stroke();
    }
    // sphere
    const sph = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    sph.addColorStop(0, '#1b2430'); sph.addColorStop(0.7, '#0b1017'); sph.addColorStop(1, '#05080c');
    g.fillStyle = sph; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    const rim = g.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.08);
    rim.addColorStop(0, 'rgba(120,180,255,0)'); rim.addColorStop(0.5, 'rgba(140,190,255,.18)'); rim.addColorStop(1, 'rgba(140,190,255,0)');
    g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, r * 1.08, 0, 7); g.fill();
    // graticule
    g.lineWidth = 0.7;
    const line = (pts) => { let pen = false; g.beginPath(); for (const [la, lo] of pts) { const [x, y, z] = project(la, lo); if (z > 0) { const [sx, sy] = S(x, y); if (pen) g.lineTo(sx, sy); else g.moveTo(sx, sy); pen = true; } else pen = false; } g.stroke(); };
    g.strokeStyle = 'rgba(255,255,255,.07)';
    for (let lo = -180; lo < 180; lo += 15) line(Array.from({ length: 61 }, (_, i) => [-90 + i * 3, lo]));
    for (let la = -75; la <= 75; la += 15) line(Array.from({ length: 121 }, (_, i) => [la, -180 + i * 3]));
    g.strokeStyle = 'rgba(255,255,255,.16)'; line(Array.from({ length: 121 }, (_, i) => [0, -180 + i * 3]));
    // land dots
    for (const [la, lo] of LAND_PTS) {
      const [x, y, z] = project(la, lo);
      if (z <= 0.02) continue;
      const [sx, sy] = S(x, y);
      const a = 0.18 + 0.72 * z;
      g.fillStyle = `rgba(214,226,236,${a.toFixed(2)})`;
      const sz = (0.9 + z * 1.1) * view.zoom;
      g.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
    }
    // cities
    for (const c of CITIES) {
      const [x, y, z] = project(c[2], c[3]);
      if (z <= 0) continue;
      const [sx, sy] = S(x, y);
      g.fillStyle = `rgba(120,200,255,${(0.35 + 0.55 * z).toFixed(2)})`;
      g.beginPath(); g.arc(sx, sy, 1.6, 0, 7); g.fill();
    }
    // arcs: hubs (faint) and the route (bright, flowing)
    const drawArc = (pts, style, width, dash, off) => {
      g.strokeStyle = style; g.lineWidth = width; g.setLineDash(dash || []); g.lineDashOffset = off || 0;
      let pen = false; g.beginPath();
      for (const [p, lift] of pts) {
        const [x, y, z] = project(p.lat, p.lon);
        const X = x * lift, Y = y * lift, vis = z > 0 || X * X + Y * Y > 1;
        if (vis) { const [sx, sy] = S(X, Y); if (pen) g.lineTo(sx, sy); else g.moveTo(sx, sy); pen = true; } else pen = false;
      }
      g.stroke(); g.setLineDash([]);
    };
    for (const hub of HUBS) if (hub && distance(A, hub) > 300) drawArc(arcPoints(A, hub, 40, 0.1), 'rgba(255,170,70,.18)', 1);
    const route = arcPoints(A, B);
    g.shadowColor = 'rgba(255,160,60,.9)'; g.shadowBlur = 12;
    drawArc(route, 'rgba(255,170,70,.95)', 2.2);
    g.shadowBlur = 0;
    drawArc(route, 'rgba(255,240,210,.9)', 1.2, [6, 14], -ts * 0.04);
    if (D) drawArc(arcPoints(A, D, 48, 0.06), 'rgba(120,230,170,.8)', 1.4, [3, 5]);
    // markers
    const marker = (p, col, label, pulse) => {
      const [x, y, z] = project(p.lat, p.lon);
      if (z <= 0) return;
      const [sx, sy] = S(x, y);
      if (pulse) { const k = (ts % 1800) / 1800; g.strokeStyle = col.replace(/[\d.]+\)$/, `${(1 - k) * 0.8})`); g.lineWidth = 1.5; g.beginPath(); g.arc(sx, sy, 4 + k * 16, 0, 7); g.stroke(); }
      g.fillStyle = col; g.beginPath(); g.arc(sx, sy, 3.6, 0, 7); g.fill();
      // spike
      g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + x * 26, sy - y * 26); g.stroke();
      g.font = '600 11px ui-monospace, monospace'; g.fillStyle = '#fff'; g.textAlign = x < 0 ? 'right' : 'left';
      g.fillText(label, sx + x * 30 + (x < 0 ? -4 : 4), sy - y * 30 + 4);
    };
    marker(A, 'rgba(255,179,71,1)', A.name.toUpperCase(), true);
    marker(B, 'rgba(255,220,160,1)', B.name.toUpperCase(), true);
    if (D) marker(D, 'rgba(120,230,170,1)', 'DEST', false);
    g.textAlign = 'left';
  }
  function start() { if (!raf && visible) { last = 0; raf = requestAnimationFrame(frame); } }

  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, lon: view.lon, lat: view.lat }; canvas.setPointerCapture(e.pointerId); target = null; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = 0.35 / view.zoom;
    view.lon = norm180(drag.lon - (e.clientX - drag.x) * k);
    view.lat = Math.max(-80, Math.min(80, drag.lat + (e.clientY - drag.y) * k));
  });
  const endDrag = () => { drag = null; idleUntil = performance.now() + 3500; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom = Math.max(0.7, Math.min(2.4, view.zoom * (e.deltaY < 0 ? 1.08 : 0.93))); }, { passive: false });
  canvas.addEventListener('dblclick', () => { const m = midpoint(A, B); target = { lon: m.lon, lat: Math.max(-60, Math.min(60, m.lat)) }; view.zoom = 1; });

  let deb;
  const onInput = () => { clearTimeout(deb); deb = setTimeout(() => update(true), 250); };
  // any place on Earth: suggestions as you type; a picked place gets its time zone looked up if it has none
  const picked = async (p) => {
    update(true);
    if (!p.tz) { const tz = await timezoneFor(p); if (tz) { p.tz = tz; update(false); } }
  };
  placeInput(fromIn, { onPick: picked, className: 'hud' });
  placeInput(toIn, { onPick: picked, className: 'hud' });
  [fromIn, toIn].forEach((i) => { i.addEventListener('input', onInput); i.addEventListener('change', () => update(true)); i.addEventListener('blur', () => setTimeout(() => update(false), 200)); });
  [brgIn, kmIn].forEach((i) => i.addEventListener('input', onInput));
  let clockTimer = 0;

  return {
    root,
    show() {
      document.documentElement.dataset.hud = '';
      if (!LAND_PTS) LAND_PTS = buildLand();
      visible = true;
      update(true);
      start();
      clearInterval(clockTimer);
      clockTimer = setInterval(() => { if (visible) tick(); }, 1000);
    },
    hide() { visible = false; delete document.documentElement.dataset.hud; clearInterval(clockTimer); if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}
