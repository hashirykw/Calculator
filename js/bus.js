// Small event bus and shared app state, so modules react to each other
// (history, achievements, Amy) without importing each other.

const handlers = new Map();

export const bus = {
  on(evt, fn) {
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => handlers.get(evt).delete(fn);
  },
  emit(evt, data) {
    (handlers.get(evt) || []).forEach((fn) => {
      try { fn(data); } catch (e) { console.error(`[bus] ${evt}`, e); }
    });
  },
};

// Settings live here once loaded; modules read app.settings directly.
export const app = { settings: null, route: null, online: navigator.onLine };
