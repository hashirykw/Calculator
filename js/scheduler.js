// One frame scheduler for every canvas. Views register a draw function and
// mark themselves dirty; nothing is drawn unless something changed, the view
// is visible and the tab is in the foreground. Loops (animations, games)
// keep requesting frames only while they are active.

const views = new Map();     // id -> {draw, dirty, visible, loop}
let raf = 0;
let last = 0;

function tick(now) {
  raf = 0;
  if (document.hidden) return;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
  last = now;
  let again = false;
  for (const v of views.values()) {
    if (!v.visible) continue;
    if (v.loop || v.dirty) {
      v.dirty = false;
      try { v.draw(dt, now); } catch (e) { console.error(e); }
      if (v.loop) again = true;
    }
    if (v.dirty) again = true;
  }
  if (again) schedule(); else last = 0;
}
function schedule() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }

export const scheduler = {
  register(id, draw, el = null) {
    const v = { draw, dirty: true, visible: true, loop: false, io: null };
    if (el && 'IntersectionObserver' in window) {
      v.io = new IntersectionObserver(([entry]) => {
        v.visible = entry.isIntersecting;
        if (v.visible) schedule();
      });
      v.io.observe(el);
    }
    views.set(id, v);
    schedule();
  },
  unregister(id) {
    const v = views.get(id);
    if (v && v.io) v.io.disconnect();
    views.delete(id);
  },
  invalidate(id) {
    const v = views.get(id);
    if (v) { v.dirty = true; schedule(); }
  },
  setLoop(id, on) {
    const v = views.get(id);
    if (v) { v.loop = on; if (on) { last = 0; schedule(); } }
  },
  setVisible(id, on) {
    const v = views.get(id);
    if (v) { v.visible = on; if (on) schedule(); }
  },
};

document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; schedule(); } });

// Canvas sized for the device pixel ratio so lines are sharp on phones.
export function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w: r.width, h: r.height, dpr };
}

// Read a CSS custom property as a colour string.
export const cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();
