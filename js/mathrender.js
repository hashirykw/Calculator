// KaTeX on demand: loaded after first paint (idle) or on first use.
// Until it arrives, a plain-text fallback is shown and swapped in place.

let katex = null;
let loading = null;
const pending = new Set();

export function loadKatex() {
  if (katex) return Promise.resolve(katex);
  if (!loading) {
    if (!document.querySelector('link[data-katex]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('../vendor/katex/katex.min.css', import.meta.url).href;
      link.dataset.katex = '';
      document.head.append(link);
    }
    loading = import('../vendor/katex/katex.min.mjs').then((m) => {
      katex = m.default;
      for (const job of pending) job();
      pending.clear();
      return katex;
    });
  }
  return loading;
}

// Render TeX into el. `fallback` is shown (as text) until KaTeX loads or if it fails.
export function renderTex(el, tex, { display = false, fallback = '' } = {}) {
  const go = () => {
    try {
      katex.render(tex, el, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml', trust: false });
    } catch {
      el.textContent = fallback || tex;
    }
  };
  if (katex) { go(); return; }
  el.textContent = fallback || tex;
  pending.add(go);
  loadKatex();
}

export function texSpan(tex, opts = {}) {
  const span = document.createElement(opts.display ? 'div' : 'span');
  renderTex(span, tex, opts);
  return span;
}

export const katexReady = () => !!katex;
