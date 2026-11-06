# Nexlyr Calculator

Free scientific calculator, equation solver with steps, graphing studio (2D and 3D),
24 tools (including the Earth & Geo calculator), a 20-game maths arcade and the Amy maths
tutor. Plain HTML, CSS and JavaScript modules: no build step. Installable and works offline.

## Run it locally
The app uses JavaScript modules and a Web Worker, so open it through a local server,
not by double-clicking index.html:

    cd "Nexlyr Calculator"
    npx serve .          # or: python -m http.server 8000

Then open http://localhost:3000 (or :8000).

## What's in it
- Calculator: exact answers, S⇔D, memory, full function library, basic/scientific keypads.
- Solve: checked step-by-step working; `#/solve?q=...` links run a question directly.
- Graph: 2D (functions, polar, parametric, implicit, inequalities, sliders) and 3D surfaces.
- Tools (24): equations, fractions, matrices, statistics, trigonometry, number bases,
  formulas, number theory, sequences, vectors, complex numbers, grades, GPA, physics,
  chemistry, constants, Earth & Geo, converter, finance, zakat, dates, time, health, random.
- Arcade: 20 games (brain, classic, action, skill) with best scores saved on the device.
- History with favourites, global search (Ctrl+K), settings, achievements, data export.
- 14 themes plus a frosted-glass layer; Frost Glass is the default.
- English and Urdu (Urdu falls back to English for any string not yet translated).
- Offline: sw.js precaches the app; manifest.webmanifest makes it installable.
- Install as an app: the "Install app" button in the top bar (and in the Everything panel)
  uses the browser's install prompt, or shows the steps for iPhone, Android, Mac and desktop.
- Everything panel (grid button or Ctrl + /): every screen, panel, tool and game in one place.
- Sound effects: five packs made live with Web Audio (Soft, Marimba, Crystal, Retro,
  Mechanical), with volume, in Settings → Feedback. No whoosh or swoosh sounds.
- 22 themes, each tool and game with its own icon and colour (js/identity.js).

## SEO pages
Every screen, tool and game has its own real page with its own title, description,
keywords, canonical link, Open Graph/Twitter tags and structured data, for example
/tools/geo/, /tools/gpa/, /arcade/sudoku/ (51 pages). They are generated from index.html:

    node scripts/build-pages.mjs     # rebuilds all pages and sitemap.xml

Run it after editing index.html, then commit the output. Edit titles and keywords in
scripts/build-pages.mjs. Submit https://calculator.nexlyr.solutions/sitemap.xml in
Google Search Console and Bing Webmaster Tools.

## Amy (AI tutor) on Vercel
Amy always answers. Without a key, or offline, she uses the built-in tutor in
js/amy-local.js, which runs on the device. To switch on Claude answers, set
ANTHROPIC_API_KEY in Vercel → Project → Settings → Environment Variables and redeploy.
The site's own domain is allowed automatically; ALLOWED_ORIGINS is only needed for extra
domains (comma-separated). Optional shared rate limits: SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, RATE_LIMIT_SALT, and run supabase/amy_usage.sql once.

## Security
vercel.json sets a strict Content-Security-Policy (scripts only from this site), HSTS,
X-Frame-Options DENY, nosniff, Referrer-Policy and Permissions-Policy. The calculator
never uses eval or new Function. The Amy function checks the origin, rate-limits by IP,
and validates message size and image type.

## Tests
    node tests/run-node.mjs          # 79 maths cases
    node tests/formulas-check.mjs    # every formula solved for every variable

## To review
Formulas list, GPA scale (4.0, editable), zakat method and nisab wording, atomic masses
(IUPAC abridged), WhatsApp number in js/config.js, quartile method default.
