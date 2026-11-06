// The illustrated manual: chapters, steps, tips and screenshots (in /manual).
// Screenshots are real captures of this app. Hotspot positions come from
// manual/spots.json (measured from the live layout when the shots were taken).

export const QUICK = [
  ['calc', 'Type a sum', 'Tap the keys or use your keyboard, then press =. The answer updates live as you type.'],
  ['solve', 'Ask a question', 'In Solve, type “solve x^2 − 5x + 6 = 0” or “derivative of x^3” to get checked steps.'],
  ['apps', 'Find anything', 'The grid button at the top opens every tool, game and setting in one place.'],
];

export const CHAPTERS = [
  {
    id: 'tour', icon: 'home', color: '#0E9CC4', title: 'A quick tour',
    lead: 'Everything on the main screen, numbered. Hover or tap a number to see what it does.',
    tour: 'overview', img: { src: 'overview', alt: 'The calculator screen on a computer with the Amy panel open' },
    phone: { src: 'phone', alt: 'The calculator on a phone', tour: 'phone' },
    tips: ['On a phone the screens are in the bar at the bottom; on a computer they are in the rail on the left.', 'Tap the NEXLYR name at the top left any time to open About, shortcuts and privacy.'],
  },
  {
    id: 'calc', icon: 'calc', color: '#0E9CC4', title: 'Calculator', go: ['#/calc', 'Open the calculator'],
    lead: 'A real scientific calculator: it follows the order of operations, previews the answer as you type and gives exact answers like ⅓, 2√2 and √3/2.',
    img: { src: 'calc-exact', alt: 'The calculator showing an exact answer with a surd', caption: 'S⇔D switches between the exact answer and the decimal.' },
    steps: [
      'Type the whole sum, for example 2 + 3 × 4, then press = (you get 14, not 20).',
      'Press S⇔D to switch between an exact answer (fractions, surds, π) and a decimal.',
      'Press 2nd, then a key, to use the small function written above it (sin⁻¹, eˣ, ∛ and more). On a computer these keys also sit on the left.',
      'The DEG key switches the angle unit between degrees, radians and grads; the display shows which one is on.',
      'MC, MR, M+ and M− work the memory; Ans uses your last answer.',
      'Tap the answer to copy it. Hold ⌫ to clear everything.',
    ],
    img2: { src: 'calc-functions', alt: 'The Functions list with calculus, powers and roots', caption: 'Functions: every function with an example you can tap to try.' },
    tips: ['Percent: 200 × 15% = 30 and 200 + 15% = 230.', 'Press = again to repeat the last operation.', 'Use ↑ and ↓ on a keyboard to bring back earlier sums.'],
    keys: [['0–9 . + − × ÷', 'Type numbers and operators'], ['Enter or =', 'Calculate'], ['Backspace', 'Delete one character'], ['Esc', 'Clear'], ['( ) ^ ! %', 'Brackets, powers, factorial, percent'], ['s c t l', 'sin, cos, tan, log'], ['p / e', 'π and e']],
  },
  {
    id: 'solve', icon: 'solve', color: '#5B7CFA', title: 'Solve with steps', go: ['#/solve', 'Open Solve'],
    lead: 'Type a question in plain words or maths. Solve shows every step and checks the answer for you.',
    img: { src: 'solve', alt: 'Solve showing x = 2 and x = 3 with a checked badge', caption: '“Checked by substitution” means the answer was put back into the question and it works.' },
    steps: [
      'Type a question, for example: solve 2x + 3 = 11, factor(x^2 − 9), integrate sin(x) from 0 to pi.',
      'Press Solve (or Enter). “Understood as” shows how your question was read.',
      'Press Steps to see the full working, with the rule used at each step.',
      'Use Plot to graph it, Explain with Amy for a talk-through, or Save to keep it in Favourites.',
      'Tap any example under “Try these” to see what Solve can do.',
    ],
    tips: ['Simultaneous equations: solve(2x + y = 7, x − y = 2).', 'Inequalities work too: solve(3x − 4 > 8).', 'The microphone button lets you speak a question, in browsers that support voice input.'],
  },
  {
    id: 'graph', icon: 'graph', color: '#1FAE9F', title: 'Graphs in 2D and 3D', go: ['#/graph', 'Open Graph'],
    lead: 'Plot up to ten expressions: functions, circles, polar and parametric curves, inequalities and 3D surfaces.',
    img: { src: 'graph', alt: 'A parabola and a straight line plotted together', caption: 'Each expression gets its own colour. Drag to move, pinch or scroll to zoom.' },
    steps: [
      'Press Add expression and type y = x^2 − 4 (or just x^2 − 4).',
      'Letters like a or k become sliders you can drag or animate.',
      'Use the buttons on the right to zoom, fit the curves, reset, trace and show key points (roots, turning points, intersections).',
      'Press 3D and type z = sin(x)cos(y) for a surface you can spin.',
      'Export PNG saves a picture; Share link copies a link to the same graph.',
    ],
    img2: { src: 'graph-3d', alt: 'A 3D surface z = sin(x)cos(y)', caption: '3D surfaces: drag to turn, scroll to zoom.' },
    tips: ['Examples (top bar of the graph) loads ready-made graphs to explore.', 'Table of values lists x and y for every curve.'],
  },
  {
    id: 'tools', icon: 'tools', color: '#E09A00', title: '24 tools', go: ['#/tools', 'Open Tools'],
    lead: 'Converters, money, statistics and student tools. Each one has its own colour and icon so you can spot it quickly.',
    img: { src: 'tools', alt: 'The Tools page with coloured tool cards', caption: 'Type in “Filter tools” to find one fast, for example “gpa” or “binary”.' },
    steps: ['Open Tools and tap a card.', 'Fill in the boxes. Results update as you type and every row can be copied.', 'Use the tabs at the top of a tool for its other modes (for example Statistics: Data, Grouped data, Regression, Distributions).', 'Tap “Tools” at the top left of a tool to go back.'],
    img2: { src: 'tool-stats', alt: 'The Statistics tool with mean, median and standard deviation', caption: 'Statistics: mean, median, quartiles, standard deviation and more from a list of values.' },
    tips: ['Exam mode (at the end of the Student tools) hides Amy, Solve steps and the arcade for classroom practice.', 'Live currency and gold prices need internet; everything else works offline.'],
  },
  {
    id: 'geo', icon: 'globe', color: '#F28C12', title: 'Earth & Geo', go: ['#/tools/geo', 'Open Earth & Geo'],
    lead: 'A mission-control style screen with a live globe: distance, bearing, Qibla direction, time zones, sunrise and coordinates.',
    img: { src: 'geo', alt: 'Earth & Geo with a route from Karachi to London on a dotted globe', caption: 'The orange arc is the shortest route (great circle).' },
    phone: { src: 'phone-geo', alt: 'Earth & Geo on a phone' },
    steps: ['Type a city in From and To (or coordinates like 24.86, 67.01).', 'Read the distance in km, miles and nautical miles, the bearing and the flight time.', 'Drag the globe to turn it; Spin makes it rotate on its own.', 'Destination point: enter a bearing and a distance to find where you end up.', 'Tap any value to copy it.'],
    tips: ['Qibla from start shows the direction to the Kaaba from your From city.', 'Sunrise times are accurate to about a minute.'],
  },
  {
    id: 'amy', icon: 'amy', color: '#8A6CF0', title: 'Amy, your maths tutor', go: ['#/amy', 'Ask Amy'],
    lead: 'Ask any maths or science question, or send a photo of one. Amy explains the method step by step.',
    img: { src: 'amy', alt: 'Amy explaining how to complete the square', caption: 'Amy answers even offline with her built-in tutor.' },
    steps: ['On a computer, Amy sits on the right (use the chat button at the top right to show or hide her). On a phone, tap Amy in the bottom bar.', 'Type your question or tap one of the suggestions.', 'Use the camera button to send a photo of a question.', 'Fast gives short answers; Deep solve gives fuller working.', 'Under an answer: copy it, copy the LaTeX, open it in Solve or ask again.'],
    tips: ['In Solve, “Explain with Amy” sends that question and answer to Amy.', 'Don’t share personal information in chats.'],
  },
  {
    id: 'arcade', icon: 'arcade', color: '#D94E9F', title: 'Maths arcade', go: ['#/arcade', 'Open the arcade'],
    lead: '20 short games for mental maths practice or a quick break. Your best scores are saved on this device.',
    img: { src: 'arcade', alt: 'The arcade with coloured game cards', caption: 'Brain, Classic, Action and Skill games.' },
    img2: { src: 'game', alt: 'A game of 2048 in progress', caption: 'Use the arrow keys, swipe, or the on-screen pad.' },
    steps: ['Tap a game, choose a level (and a topic for quiz games), then press Play.', 'Pause with the pause button at the top; restart with the circular arrow. On a keyboard, Space starts the game.', 'The speaker button turns game sounds on or off.', 'After a quiz game, “Mistakes to review” lists the questions you missed.'],
    tips: ['On a phone, open the arcade from Tools (the Arcade card) or the grid button.'],
  },
  {
    id: 'history', icon: 'history', color: '#1584A8', title: 'History, favourites and search',
    lead: 'Every answer is saved on this device. Star the ones you want to keep, and search across everything.',
    img: { src: 'history', alt: 'The history drawer grouped by day', caption: 'History: search, filter by kind, reuse, star, copy, delete (with undo) and export as CSV.' },
    img2: { src: 'search', alt: 'Search finding the Earth & Geo tool from the word qibla', caption: 'Search (Ctrl + K) finds tools, settings, formulas, games and past answers. Type a sum and press Enter to solve it.' },
    steps: ['Open History with the clock button at the top.', 'Tap an entry to use it again; tap the star to add it to Favourites.', 'Open Search with the magnifying glass or Ctrl + K, type a word, then press Enter or tap a result.'],
  },
  {
    id: 'everything', icon: 'apps', color: '#4382EE', title: 'The Everything panel',
    lead: 'The grid button at the top (or Ctrl + /) opens every screen, panel, tool and game in one place, with quick switches.',
    img: { src: 'everything', alt: 'The Everything panel with coloured tiles', caption: 'Quick switches: sounds, frosted glass, theme and Download app.' },
    steps: ['Tap the grid button at the top.', 'Type to filter, or scroll to the section you want.', 'Tap a tile to go straight there. Press Enter to open the first match.'],
  },
  {
    id: 'style', icon: 'palette', color: '#E8507F', title: 'Themes and sounds',
    lead: 'Make it yours: 22 themes, a frosted-glass look, text size, animations and five sound packs.',
    img: { src: 'settings-themes', alt: 'The theme gallery in Settings', caption: 'Tap a theme to switch at once.' },
    img2: { src: 'settings-sound', alt: 'Sound settings with five sound packs and a volume slider', caption: 'Sound packs: Soft, Marimba, Crystal, Retro and Mechanical. Tap one to hear it.' },
    steps: ['Open Settings (the gear at the top).', 'Appearance: choose a theme, turn frosted glass on or off, change text size and animations.', 'Feedback: turn sound effects on or off, pick a pack, set the volume, and choose keypad clicks and vibration.', 'Maths: angle unit, exact answers first, significant figures, number grouping (including lakh/crore).'],
    tips: ['Language: English or Urdu (Settings → Region).', 'Export my data (JSON) makes a backup of your history and settings.'],
  },
  {
    id: 'install', icon: 'download', color: '#25A563', title: 'Install the app and use it offline',
    lead: 'Nexlyr Calculator installs like an app on phones and computers, opens in its own window and works offline.',
    img: { src: 'install', alt: 'The install window with steps', caption: 'Download app opens your browser’s install dialog in one tap (on iPhone it points to Safari’s Share button).' },
    steps: ['Tap Download app at the top (or in the Everything panel).', 'Chrome, Edge and Android: confirm “Install”.', 'iPhone and iPad (Safari): tap Share, then “Add to Home Screen”, then Add.', 'Open it from your home screen or apps list like any other app.'],
    tips: ['After the first visit everything works without internet except Amy’s online answers and live currency or metal prices.', 'The app updates itself; when a new version is ready you’ll see a Reload button.'],
  },
];

export const SHORTCUTS = [
  ['Ctrl / ⌘ + K', 'Search everything'], ['Ctrl / ⌘ + /', 'Open the Everything panel'], ['Enter or =', 'Calculate'], ['Esc', 'Clear, or close a panel'],
  ['Backspace', 'Delete one character'], ['↑ ↓', 'Earlier sums'], ['Ctrl / ⌘ + Z', 'Undo'], ['Ctrl / ⌘ + C', 'Copy the answer'],
  ['s c t l', 'sin, cos, tan, log'], ['p / e', 'π and e'], ['( ) ^ ! %', 'Brackets, powers, factorial, percent'],
];

export const FAQ = [
  ['Is it free?', 'Yes. Every feature is free, with no sign-up and no adverts.'],
  ['Does it work without internet?', 'Yes, after your first visit. Only Amy’s online answers and live currency or gold prices need a connection; Amy still answers offline with her built-in tutor.'],
  ['Where is my history saved?', 'Only in this browser on this device. Nothing is uploaded. You can export a backup or clear it in Settings → Data.'],
  ['Why is my answer a fraction or a surd?', 'Exact answers are shown first. Press S⇔D to see the decimal, or turn off “Show exact answers first” in Settings → Maths.'],
  ['My trig answers look wrong.', 'Check the angle unit (DEG, RAD or GRAD) shown at the top left of the display. Press the DEG key to change it, or set it in Settings → Maths.'],
  ['How do I install it?', 'Tap Download app at the top, or see the “Install the app” chapter for your device.'],
  ['Can I keep this manual?', 'Yes. Download the PDF manual from the top of this page or from the Everything panel.'],
];
