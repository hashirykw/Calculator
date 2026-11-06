// Interface sounds, made live with Web Audio (no audio files to download).
// Five packs of short tonal sounds: clicks, ticks, chimes and little chords.
// There are deliberately no whoosh or swoosh sounds and no noise sweeps.
// Everything respects Settings: master on/off, pack, volume, keypad clicks.

import { app } from './bus.js';

let ctx = null, master = null, lastAt = 0;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// one tone with a quick attack and an exponential tail
function tone(f, { at = 0, dur = 0.08, vol = 0.2, type = 'sine', attack = 0.004, glide = 0 } = {}) {
  const c = ctx, t0 = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
// a struck sound: fundamental plus a quieter overtone that dies faster
const strike = (f, ratio, o = {}) => { tone(f, o); tone(f * ratio, { ...o, vol: (o.vol || 0.2) * 0.35, dur: (o.dur || 0.1) * 0.45 }); };

const N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568, C7: 2093 };

const PACKS = {
  // gentle rounded blips
  soft: {
    key: () => tone(N.A5, { dur: 0.045, vol: 0.12, type: 'triangle' }),
    tap: () => tone(N.E5, { dur: 0.035, vol: 0.08, type: 'triangle' }),
    tick: () => tone(N.C6, { dur: 0.025, vol: 0.06 }),
    on: () => { tone(N.E5, { dur: 0.05, vol: 0.1 }); tone(N.B5, { at: 0.05, dur: 0.07, vol: 0.1 }); },
    off: () => { tone(N.B5, { dur: 0.05, vol: 0.09 }); tone(N.E5, { at: 0.05, dur: 0.07, vol: 0.09 }); },
    open: () => { tone(N.C5, { dur: 0.16, vol: 0.08 }); tone(N.G5, { at: 0.03, dur: 0.16, vol: 0.07 }); },
    close: () => tone(N.G5, { dur: 0.06, vol: 0.06, glide: 0.8 }),
    eq: () => { tone(N.G5, { dur: 0.06, vol: 0.1 }); tone(N.C6, { at: 0.055, dur: 0.12, vol: 0.1 }); },
    toast: () => strike(N.E6, 2, { dur: 0.25, vol: 0.06 }),
    success: () => [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.14, vol: 0.09 })),
    error: () => { tone(330, { dur: 0.09, vol: 0.1, type: 'triangle' }); tone(262, { at: 0.1, dur: 0.14, vol: 0.1, type: 'triangle' }); },
    achieve: () => [N.C6, N.E6, N.G6, N.C7].forEach((f, i) => strike(f, 2.01, { at: i * 0.07, dur: 0.3, vol: 0.06 })),
  },
  // warm wooden mallets
  marimba: {
    key: () => strike(N.C6, 3.98, { dur: 0.12, vol: 0.16 }),
    tap: () => strike(N.G5, 3.98, { dur: 0.09, vol: 0.1 }),
    tick: () => strike(N.E6, 3.98, { dur: 0.05, vol: 0.06 }),
    on: () => { strike(N.C6, 3.98, { dur: 0.1, vol: 0.12 }); strike(N.G6, 3.98, { at: 0.06, dur: 0.12, vol: 0.12 }); },
    off: () => { strike(N.G6, 3.98, { dur: 0.1, vol: 0.1 }); strike(N.C6, 3.98, { at: 0.06, dur: 0.12, vol: 0.1 }); },
    open: () => { strike(N.E5, 3.98, { dur: 0.2, vol: 0.1 }); strike(N.B5, 3.98, { at: 0.05, dur: 0.22, vol: 0.09 }); },
    close: () => strike(N.B5, 3.98, { dur: 0.1, vol: 0.07 }),
    eq: () => { strike(N.E6, 3.98, { dur: 0.12, vol: 0.13 }); strike(N.C7, 3.98, { at: 0.07, dur: 0.18, vol: 0.12 }); },
    toast: () => strike(N.A5, 3.98, { dur: 0.25, vol: 0.1 }),
    success: () => [N.C6, N.E6, N.G6].forEach((f, i) => strike(f, 3.98, { at: i * 0.08, dur: 0.22, vol: 0.12 })),
    error: () => { strike(220, 3.98, { dur: 0.16, vol: 0.14 }); strike(196, 3.98, { at: 0.12, dur: 0.2, vol: 0.14 }); },
    achieve: () => [N.C6, N.E6, N.G6, N.C7, N.G6, N.C7].forEach((f, i) => strike(f, 3.98, { at: i * 0.07, dur: 0.25, vol: 0.1 })),
  },
  // bright glass chimes
  crystal: {
    key: () => strike(N.E6, 2.76, { dur: 0.14, vol: 0.08 }),
    tap: () => strike(N.C7, 2.76, { dur: 0.08, vol: 0.04 }),
    tick: () => tone(N.C7, { dur: 0.03, vol: 0.035 }),
    on: () => { strike(N.G6, 2.76, { dur: 0.16, vol: 0.06 }); strike(N.C7, 2.76, { at: 0.05, dur: 0.2, vol: 0.06 }); },
    off: () => { strike(N.C7, 2.76, { dur: 0.16, vol: 0.05 }); strike(N.G6, 2.76, { at: 0.05, dur: 0.2, vol: 0.05 }); },
    open: () => [N.C6, N.G6, N.E6].forEach((f, i) => strike(f, 2.76, { at: i * 0.035, dur: 0.4, vol: 0.045 })),
    close: () => strike(N.G6, 2.76, { dur: 0.15, vol: 0.04 }),
    eq: () => { strike(N.G6, 2.76, { dur: 0.2, vol: 0.07 }); strike(N.C7, 2.76, { at: 0.06, dur: 0.35, vol: 0.07 }); },
    toast: () => strike(N.E6, 2.76, { dur: 0.5, vol: 0.06 }),
    success: () => [N.C6, N.E6, N.G6, N.C7].forEach((f, i) => strike(f, 2.76, { at: i * 0.07, dur: 0.45, vol: 0.06 })),
    error: () => { strike(N.E5, 2.2, { dur: 0.2, vol: 0.07 }); strike(N.C5 * 0.94, 2.2, { at: 0.13, dur: 0.28, vol: 0.07 }); },
    achieve: () => [N.C6, N.G6, N.E6, N.C7, N.E6 * 2].forEach((f, i) => strike(f, 2.76, { at: i * 0.08, dur: 0.6, vol: 0.05 })),
  },
  // 8-bit arcade
  retro: {
    key: () => tone(N.A5, { dur: 0.035, vol: 0.05, type: 'square' }),
    tap: () => tone(N.E5, { dur: 0.03, vol: 0.035, type: 'square' }),
    tick: () => tone(N.C6, { dur: 0.02, vol: 0.03, type: 'square' }),
    on: () => { tone(N.C5, { dur: 0.04, vol: 0.05, type: 'square' }); tone(N.C6, { at: 0.045, dur: 0.05, vol: 0.05, type: 'square' }); },
    off: () => { tone(N.C6, { dur: 0.04, vol: 0.045, type: 'square' }); tone(N.C5, { at: 0.045, dur: 0.05, vol: 0.045, type: 'square' }); },
    open: () => [N.C5, N.E5, N.G5].forEach((f, i) => tone(f, { at: i * 0.035, dur: 0.04, vol: 0.04, type: 'square' })),
    close: () => [N.G5, N.C5].forEach((f, i) => tone(f, { at: i * 0.035, dur: 0.04, vol: 0.035, type: 'square' })),
    eq: () => { tone(N.E6, { dur: 0.05, vol: 0.05, type: 'square' }); tone(N.C7, { at: 0.05, dur: 0.08, vol: 0.05, type: 'square' }); },
    toast: () => [N.G5, N.G6].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.06, vol: 0.04, type: 'square' })),
    success: () => [N.C5, N.E5, N.G5, N.C6, N.G5, N.C6].forEach((f, i) => tone(f, { at: i * 0.055, dur: 0.06, vol: 0.045, type: 'square' })),
    error: () => [196, 147].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.1, vol: 0.06, type: 'square' })),
    achieve: () => [N.C6, N.E6, N.G6, N.C7, N.G6, N.C7, N.E6 * 2].forEach((f, i) => tone(f, { at: i * 0.05, dur: 0.06, vol: 0.04, type: 'square' })),
  },
  // crisp mechanical keyboard: tiny high tick plus a low thump
  mechanical: {
    key: () => { tone(2600, { dur: 0.012, vol: 0.05, type: 'square' }); tone(150, { dur: 0.05, vol: 0.18, glide: 0.6 }); },
    tap: () => { tone(2200, { dur: 0.01, vol: 0.035, type: 'square' }); tone(180, { dur: 0.035, vol: 0.1, glide: 0.6 }); },
    tick: () => tone(3000, { dur: 0.008, vol: 0.03, type: 'square' }),
    on: () => { tone(2600, { dur: 0.01, vol: 0.04, type: 'square' }); tone(220, { dur: 0.05, vol: 0.14, glide: 1.3 }); },
    off: () => { tone(2000, { dur: 0.01, vol: 0.04, type: 'square' }); tone(220, { dur: 0.05, vol: 0.14, glide: 0.7 }); },
    open: () => { tone(160, { dur: 0.06, vol: 0.14, glide: 0.6 }); tone(N.C6, { at: 0.04, dur: 0.1, vol: 0.05 }); },
    close: () => tone(140, { dur: 0.05, vol: 0.12, glide: 0.6 }),
    eq: () => { tone(2600, { dur: 0.012, vol: 0.05, type: 'square' }); tone(130, { dur: 0.08, vol: 0.2, glide: 0.5 }); tone(N.G5, { at: 0.05, dur: 0.12, vol: 0.06 }); },
    toast: () => strike(N.C6, 2, { dur: 0.18, vol: 0.06 }),
    success: () => [N.E5, N.A5, N.C6].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.1, vol: 0.07, type: 'triangle' })),
    error: () => [180, 140].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.08, vol: 0.18, glide: 0.7 })),
    achieve: () => [N.C6, N.E6, N.G6, N.C7].forEach((f, i) => strike(f, 2, { at: i * 0.07, dur: 0.22, vol: 0.06 })),
  },
};

export const SFX_PACKS = Object.keys(PACKS);

// play('tap' | 'key' | 'tick' | 'on' | 'off' | 'open' | 'close' | 'eq' | 'toast' | 'success' | 'error' | 'achieve')
export function play(name, { force = false, pack } = {}) {
  const s = app.settings || {};
  if (!force && s.sfx === false) return;
  if (!force && name === 'key' && !s.sound) return;
  if (document.hidden) return;
  const now = performance.now();
  if ((name === 'tap' || name === 'tick') && now - lastAt < 35) return;   // no machine-gun clicks
  lastAt = now;
  const c = audio();
  if (!c) return;
  const vol = Math.max(0, Math.min(1, s.sfxVolume ?? 0.6));
  master.gain.setValueAtTime(vol * 1.4, c.currentTime);
  const p = PACKS[pack || s.sfxPack] || PACKS.soft;
  try { (p[name] || p.tap)(); } catch { /* audio unavailable */ }
}

// Interface-wide wiring: taps on buttons and links, switches, segmented controls.
let wired = false;
export function wireSfx() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, a[href], [role="tab"], [role="option"], summary, select');
    if (!el || el.disabled || el.hasAttribute('data-nosfx')) return;
    if (el.closest('.key, .keypad, .game-stage, .game-pad, .game-keys, .sdk, .sdk-pad, .g-grid, .b2048, .wd-grid')) return;   // they have their own sounds
    if (el.closest('.seg, .tabs, .chips, [role="tablist"]')) play('tick');
    else play('tap');
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.matches && el.matches('input[type="checkbox"]')) play(el.checked ? 'on' : 'off');
    else if (el && el.matches && el.matches('input[type="range"], select')) play('tick');
  }, true);
}
