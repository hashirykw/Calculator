# Nexlyr Calculator

Free scientific calculator, equation solver with steps, graphing studio (2D and 3D),
17 tools and the Amy maths tutor. Plain HTML, CSS and JavaScript modules: no build step.

## Run it locally
The app uses JavaScript modules and a Web Worker, so open it through a local server,
not by double-clicking index.html:

    cd "Nexlyr Calculator"
    npx serve .          # or: python -m http.server 8000

Then open http://localhost:3000 (or :8000).

## Status (work in progress)
Done: calculator (exact answers, S⇔D, memory, function library incl. integrals, limits,
derivatives, cube roots, powers), Solve with checked steps, Graph (2D, sliders, key points,
3D surfaces), Tools (17), Amy client + server function, English strings, tests.

Still to come: History, Settings, About and Search panels (buttons do nothing yet),
the 20 arcade games, offline/install support (manifest, service worker), SEO files,
Urdu translation, security headers (vercel.json).

## Amy (AI tutor) on Vercel
Set these environment variables: ANTHROPIC_API_KEY, ALLOWED_ORIGINS
(e.g. https://calculator.nexlyr.solutions). Optional shared rate limits: SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, RATE_LIMIT_SALT, and run supabase/amy_usage.sql once.

## Tests
    node tests/run-node.mjs          # 79 maths cases
    node tests/formulas-check.mjs    # every formula solved for every variable

## To review
Formulas list, GPA scale (4.0, editable), zakat method and nisab wording, atomic masses
(IUPAC abridged), WhatsApp number in js/config.js, quartile method default.
