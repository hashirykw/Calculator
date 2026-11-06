// Builds one real HTML page per screen, tool and game (e.g. /tools/geo/index.html)
// from index.html, each with its own title, description, keywords, canonical
// URL, Open Graph/Twitter tags, structured data and crawlable text and links.
// The app itself is the same on every page; <meta name="nxc-route"> tells it
// which screen to open first. Also writes sitemap.xml.
//
// Run after changing index.html or any tool/game names:  node scripts/build-pages.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://calculator.nexlyr.solutions';
const BRAND = 'Nexlyr Calculator';
const TODAY = new Date().toISOString().slice(0, 10);
const { default: T } = await import(join(ROOT, 'js/i18n/en.js'));
const { TOOL_ID, GAME_ID } = await import(join(ROOT, 'js/identity.js'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BASE_KW = 'scientific calculator, online calculator, free calculator, graphing calculator, equation solver, step by step, maths, math, O Level, IGCSE, A Level, Matric, Pakistan, Nexlyr';

// search-friendly titles: what people type, then the brand
const TOOL_TITLE = {
  equations: 'Equation Solver with Steps: Linear, Quadratic, Cubic & Simultaneous',
  fractions: 'Fraction Calculator with Working',
  matrix: 'Matrix Calculator: Determinant, Inverse, RREF & Eigenvalues',
  stats: 'Statistics Calculator: Mean, Median, Standard Deviation & Regression',
  trig: 'Trigonometry Calculator: Unit Circle & Triangle Solver',
  base: 'Number Base Converter: Binary, Octal, Hex & Bitwise',
  formulas: 'Formula Solver: Solve Any Formula for Any Variable',
  numtheory: 'Prime Factors, HCF & LCM Calculator',
  sequences: 'Arithmetic & Geometric Sequence Calculator (nth Term & Sums)',
  vectors: 'Vector Calculator: Magnitude, Dot & Cross Product',
  complex: 'Complex Number Calculator with Argand Diagram',
  grades: 'Marks to Percentage & Grade Calculator',
  gpa: 'GPA & CGPA Calculator (4.0 Scale)',
  physics: 'Physics Calculator: SUVAT, Ohm’s Law, Density & Waves',
  chemistry: 'Chemistry Calculator: Molar Mass, Moles & Concentration',
  constants: 'Physical & Maths Constants (CODATA)',
  geo: 'Distance, Bearing & Qibla Calculator with Live Globe',
  converter: 'Unit Converter with Live Currency Rates',
  finance: 'Loan Instalment, Savings & Discount Calculator',
  zakat: 'Zakat Calculator: Savings, Gold & Silver Nisab',
  dates: 'Age Calculator & Days Between Dates',
  time: 'Time Calculator: Add Hours & Minutes, Decimal Hours',
  health: 'BMI Calculator for Adults',
  random: 'Random Number Generator, Dice, Coin & Password Generator',
};

const TOOL_KW = {
  equations: 'equation solver, quadratic equation solver, simultaneous equations calculator, cubic equation solver, solve equations with steps',
  fractions: 'fraction calculator, adding fractions, simplify fractions, mixed numbers calculator',
  matrix: 'matrix calculator, determinant calculator, inverse matrix calculator, rref calculator, eigenvalue calculator',
  stats: 'statistics calculator, mean median mode calculator, standard deviation calculator, regression calculator, normal distribution',
  trig: 'trigonometry calculator, unit circle, exact trig values, triangle solver, sine rule cosine rule',
  base: 'binary converter, hex converter, octal converter, base conversion, two’s complement calculator',
  formulas: 'formula solver, physics formulas, maths formulas, rearrange formula, solve for variable',
  numtheory: 'prime factorisation calculator, hcf calculator, lcm calculator, prime number checker, roman numerals converter, number to words',
  sequences: 'arithmetic sequence calculator, geometric sequence calculator, nth term calculator, series sum calculator',
  vectors: 'vector calculator, dot product calculator, cross product calculator, angle between vectors, vector projection',
  complex: 'complex number calculator, polar form calculator, argand diagram, complex roots, modulus argument',
  grades: 'percentage calculator for marks, grade calculator, weighted grade calculator, marks needed calculator',
  gpa: 'gpa calculator, cgpa calculator, semester gpa, 4.0 scale gpa',
  physics: 'physics calculator, suvat calculator, ohms law calculator, density calculator, pressure calculator, wave speed',
  chemistry: 'molar mass calculator, moles calculator, concentration calculator, chemistry calculator',
  constants: 'physical constants, codata constants, speed of light, avogadro constant, planck constant',
  geo: 'distance calculator, great circle distance, bearing calculator, qibla direction, sunrise sunset calculator, time zone converter, coordinates converter',
  converter: 'unit converter, currency converter, length converter, temperature converter, pkr converter',
  finance: 'loan calculator, emi calculator, instalment calculator, savings calculator, discount calculator, bill splitter',
  zakat: 'zakat calculator, nisab gold silver, zakat on gold, zakat on savings, zakat pakistan',
  dates: 'age calculator, date difference calculator, days between dates, add days to date',
  time: 'time calculator, hours and minutes calculator, time duration calculator, decimal hours',
  health: 'bmi calculator, body mass index, healthy weight range',
  random: 'random number generator, dice roller, coin flip, random picker, password generator',
};
const pages = [];
const add = (path, route, title, description, keywords, crumbs = [], kind = 'WebPage') => pages.push({ path, route, title, description, keywords, crumbs, kind });

add('/', '', `${BRAND}: Free Scientific Calculator, Equation Solver & Graphing`,
  'Free online scientific calculator with exact answers, a step-by-step equation solver, 2D and 3D graphing, 24 maths and student tools, a maths arcade and Amy, a maths tutor. Works offline and installs as an app.',
  BASE_KW, [], 'WebApplication');
add('/solve/', '#/solve', `Step-by-Step Equation Solver | ${BRAND}`,
  'Type any maths question and get a checked, step-by-step answer: equations, inequalities, derivatives, integrals, limits, factorising and more. Free and works offline.',
  `step by step solver, equation solver, derivative calculator, integral calculator, factorise, ${BASE_KW}`, [['Solve', '/solve/']]);
add('/graph/', '#/graph', `Free Graphing Calculator (2D & 3D) | ${BRAND}`,
  'Plot functions, polar and parametric curves, inequalities and 3D surfaces. Find roots, turning points and intersections, use sliders and export images. Free and works offline.',
  `graphing calculator, graph plotter, 3D graph, plot function online, ${BASE_KW}`, [['Graph', '/graph/']]);
add('/tools/', '#/tools', `24 Free Maths & Student Tools | ${BRAND}`,
  'Equation solver, fractions, matrices, statistics, trigonometry, number bases, formulas, GPA, physics, chemistry, unit converter, zakat, BMI, Earth & Geo and more. All free.',
  `maths tools, student calculator, GPA calculator, unit converter, ${BASE_KW}`, [['Tools', '/tools/']]);
for (const id of Object.keys(TOOL_ID)) {
  add(`/tools/${id}/`, `#/tools/${id}`, `${TOOL_TITLE[id] || T[`tool.${id}`]} | ${BRAND}`,
    `${T[`tool.${id}.d`]}. Free online, no sign-up, and it works offline.`,
    `${TOOL_KW[id] || T[`tool.${id}`].toLowerCase()}, free online calculator, Nexlyr`,
    [['Tools', '/tools/'], [T[`tool.${id}`], `/tools/${id}/`]], 'WebApplication');
}
add('/arcade/', '#/arcade', `Free Maths Games: 20-Game Arcade | ${BRAND}`,
  'Mental maths practice and quick-break games: Math Blitz, Sudoku, Math Wordle, 2048, Tetris, Snake and more. Free in your browser, best scores saved on your device.',
  'maths games, math games online, mental maths practice, sudoku, 2048, free browser games, Nexlyr', [['Arcade', '/arcade/']]);
for (const id of Object.keys(GAME_ID)) {
  add(`/arcade/${id}/`, `#/arcade/${id}`, `${T[`game.${id}`]}: Free Online Game | ${BRAND} Arcade`,
    `${T[`game.${id}.d`]} Play ${T[`game.${id}`]} free in your browser with no download. Best score saved on your device.`,
    `${T[`game.${id}`].toLowerCase()}, ${T[`game.${id}`].toLowerCase()} online, free game, maths game, Nexlyr arcade`,
    [['Arcade', '/arcade/'], [T[`game.${id}`], `/arcade/${id}/`]], 'VideoGame');
}
add('/amy/', '#/amy', `Amy: Free Maths Tutor | ${BRAND}`,
  'Ask Amy any maths or science question, or send a photo of one, and she works through it with you step by step. Has a built-in tutor that works offline.',
  `maths tutor, homework help, math help, ask a maths question, ${BASE_KW}`, [['Amy', '/amy/']]);
add('/help/', '#/help', `How to Use ${BRAND}: Guide & Tips`,
  'How the keys, exact answers, the solver, graphs, tools and Amy work in Nexlyr Calculator, with keyboard shortcuts.',
  `calculator help, how to use scientific calculator, ${BASE_KW}`, [['Help', '/help/']]);

const shared = {
  '@type': 'Organization', name: 'Nexlyr Solutions', url: 'https://nexlyr.solutions/',
};
function jsonld(p) {
  const url = SITE + p.path;
  const graph = [];
  const main = { '@type': p.kind, '@id': `${url}#page`, name: p.title.split(' | ')[0], url, description: p.description, inLanguage: ['en', 'ur'], publisher: shared, isPartOf: { '@id': `${SITE}/#site` } };
  if (p.kind === 'WebApplication') Object.assign(main, { applicationCategory: 'EducationalApplication', operatingSystem: 'Any (web browser, installable)', browserRequirements: 'Requires JavaScript', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, image: `${SITE}/og.png` });
  if (p.kind === 'VideoGame') Object.assign(main, { gamePlatform: 'Web browser', genre: 'Educational', applicationCategory: 'Game', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } });
  graph.push(main);
  if (p.path === '/') graph.push({ '@type': 'WebSite', '@id': `${SITE}/#site`, name: BRAND, url: `${SITE}/`, publisher: shared, inLanguage: ['en', 'ur'] });
  if (p.crumbs.length) graph.push({ '@type': 'BreadcrumbList', itemListElement: [['Nexlyr Calculator', '/'], ...p.crumbs].map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })) });
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

function head(p) {
  const url = SITE + p.path;
  return `  <!-- SEO:START -->
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}">
  <meta name="keywords" content="${esc(p.keywords)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <meta name="author" content="Nexlyr Solutions">
  <meta name="creator" content="Nexlyr Solutions">
  <meta name="theme-color" content="#2A2826">
  <meta name="color-scheme" content="dark light">
  <meta name="application-name" content="Nexlyr Calc">
  <meta name="apple-mobile-web-app-title" content="Nexlyr Calc">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="format-detection" content="telephone=no">
  <meta name="msapplication-TileColor" content="#2A2826">
  <meta name="msapplication-TileImage" content="/icons/mstile-150.png">
  <meta name="msapplication-config" content="/browserconfig.xml">
  ${p.route ? `<meta name="nxc-route" content="${p.route}">\n  ` : ''}<meta property="og:type" content="website">
  <meta property="og:site_name" content="${BRAND}">
  <meta property="og:locale" content="en_GB">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(p.description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/og.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Nexlyr Calculator with a worked equation on a frosted-glass keypad">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(p.title)}">
  <meta name="twitter:description" content="${esc(p.description)}">
  <meta name="twitter:image" content="${SITE}/og.png">
  <meta name="twitter:image:alt" content="Nexlyr Calculator with a worked equation on a frosted-glass keypad">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/icons/favicon-16.png" sizes="16x16" type="image/png">
  <link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="icon" href="/icons/favicon-48.png" sizes="48x48" type="image/png">
  <link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180">
  <link rel="author" href="https://nexlyr.solutions/">
  <script type="application/ld+json">${jsonld(p)}</script>
  <!-- SEO:END -->`;
}

// crawlable text and real links (read by search engines and shown only without JavaScript)
function bodyBlock(p) {
  const name = p.title.split(' | ')[0];
  const toolLinks = Object.keys(TOOL_ID).map((id) => `<li><a href="/tools/${id}/">${esc(T[`tool.${id}`])}</a> – ${esc(T[`tool.${id}.d`])}</li>`).join('');
  const gameLinks = Object.keys(GAME_ID).map((id) => `<li><a href="/arcade/${id}/">${esc(T[`game.${id}`])}</a></li>`).join('');
  return `  <!-- SEOBODY:START -->
  <noscript>
    <div class="seo-static">
      <h1>${esc(name)}</h1>
      <p>${esc(p.description)}</p>
      <p>Nexlyr Calculator needs JavaScript turned on to run.</p>
      <nav aria-label="All pages">
        <h2>Screens</h2>
        <ul><li><a href="/">Calculator</a></li><li><a href="/solve/">Step-by-step solver</a></li><li><a href="/graph/">Graphing calculator</a></li><li><a href="/tools/">All tools</a></li><li><a href="/arcade/">Maths arcade</a></li><li><a href="/amy/">Amy, maths tutor</a></li><li><a href="/help/">Help</a></li></ul>
        <h2>Tools</h2><ul>${toolLinks}</ul>
        <h2>Games</h2><ul>${gameLinks}</ul>
      </nav>
      <p>A free product by <a href="https://nexlyr.solutions/">Nexlyr Solutions</a>.</p>
    </div>
  </noscript>
  <!-- SEOBODY:END -->`;
}

const template = readFileSync(join(ROOT, 'index.html'), 'utf8');
const fill = (html, p) => html
  .replace(/  <!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/, head(p))
  .replace(/  <!-- SEOBODY:START -->[\s\S]*?<!-- SEOBODY:END -->/, bodyBlock(p));

for (const p of pages) {
  const out = join(ROOT, p.path, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, fill(template, p));
}

const urls = pages.map((p) => `  <url>\n    <loc>${SITE}${p.path}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>${p.path === '/' ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${p.path === '/' ? '1.0' : p.path.split('/').length > 3 ? '0.7' : '0.8'}</priority>\n  </url>`).join('\n');
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
console.log(`Built ${pages.length} pages and sitemap.xml`);
