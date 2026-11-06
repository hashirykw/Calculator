// Nexlyr Calculator service worker: the app works offline after the first visit.
// App files are precached; KaTeX fonts, Urdu font and formulas load into a runtime cache on use.
// Live data (exchange rates, gold price) and Amy always go to the network.
const VERSION = 'nxc-2026-11-06-3';
const CORE = [
  '/',
  'index.html',
  'favicon.ico',
  'manifest.webmanifest',
  'css/app.css',
  'css/glass.css',
  'css/fx.css',
  'data/formulas.json',
  'fonts/Geist-Variable.woff2',
  'fonts/GeistMono-Variable.woff2',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512-maskable.png',
  'icons/icon-512.png',
  'js/about.js',
  'js/achievements.js',
  'js/amy-local.js',
  'js/amy.js',
  'js/app.js',
  'js/arcade/action.js',
  'js/arcade/brain.js',
  'js/arcade/classic.js',
  'js/arcade/index.js',
  'js/arcade/skill.js',
  'js/boot-theme.js',
  'js/bus.js',
  'js/calc.js',
  'js/config.js',
  'js/core/asttex.js',
  'js/core/base.js',
  'js/core/calcmodel.js',
  'js/core/calculus.js',
  'js/core/compile.js',
  'js/core/decimal.js',
  'js/core/diff.js',
  'js/core/finance.js',
  'js/core/format.js',
  'js/core/integrate.js',
  'js/core/matrix.js',
  'js/core/numeric.js',
  'js/core/numeval.js',
  'js/core/numtheory.js',
  'js/core/parse.js',
  'js/core/rational.js',
  'js/core/recognize.js',
  'js/core/science.js',
  'js/core/solve.js',
  'js/core/stats.js',
  'js/core/sym.js',
  'js/core/triangle.js',
  'js/core/units.js',
  'js/engine-client.js',
  'js/engine-worker.js',
  'js/engine.js',
  'js/funcs.js',
  'js/graph.js',
  'js/graph3d.js',
  'js/history-store.js',
  'js/history.js',
  'js/i18n/en-extra.js',
  'js/i18n/en-funcs.js',
  'js/i18n/en-tools.js',
  'js/i18n/en.js',
  'js/i18n/index.js',
  'js/i18n/ur.js',
  'js/icons.js',
  'js/install.js',
  'js/identity.js',
  'js/launcher.js',
  'js/sfx.js',
  'js/mathrender.js',
  'js/prefs.js',
  'js/scheduler.js',
  'js/search.js',
  'js/settings.js',
  'js/solve.js',
  'js/steps.js',
  'js/store.js',
  'js/tools/base.js',
  'js/tools/chemistry.js',
  'js/tools/complex.js',
  'js/tools/constants.js',
  'js/tools/converter.js',
  'js/tools/dates.js',
  'js/tools/equations.js',
  'js/tools/finance.js',
  'js/tools/formulas.js',
  'js/tools/fractions.js',
  'js/tools/geo-data.js',
  'js/tools/geo.js',
  'js/tools/gpa.js',
  'js/tools/grades.js',
  'js/tools/health.js',
  'js/tools/index.js',
  'js/tools/kit.js',
  'js/tools/matrix.js',
  'js/tools/numtheory.js',
  'js/tools/physics.js',
  'js/tools/random.js',
  'js/tools/sequences.js',
  'js/tools/stats.js',
  'js/tools/time.js',
  'js/tools/trig.js',
  'js/tools/vectors.js',
  'js/tools/zakat.js',
  'js/ui.js',
  'vendor/katex/contrib/auto-render.min.mjs',
  'vendor/katex/katex.min.css',
  'vendor/katex/katex.min.mjs',
  'vendor/marked.min.mjs',
  'vendor/purify.min.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // rates, gold price: straight to network
  if (url.pathname.startsWith('/api/')) return;         // Amy: never cached

  if (req.mode === 'navigate') {
    // pages: network first so updates arrive; offline, the same page from cache, else the app shell
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(url.pathname, copy)); }
      return res;
    }).catch(async () => (await caches.match(url.pathname)) || (await caches.match('/')) || caches.match('index.html')));
    return;
  }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  })));
});
