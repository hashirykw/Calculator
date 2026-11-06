// Every tool and game has its own icon and colour. The colour feeds --c on
// cards, tool headers and game bars, so each one is recognisable at a glance
// on every theme. Colours are mid-tone so white icons read on them in light
// and dark themes alike.

export const TOOL_ID = {
  equations: ['func', '#5B7CFA'],
  fractions: ['divide', '#F07A4A'],
  matrix: ['matrix', '#8A6CF0'],
  stats: ['bars', '#1FAE9F'],
  trig: ['triangle', '#E8507F'],
  base: ['binary', '#0E9CC4'],
  formulas: ['book', '#D99A1E'],
  numtheory: ['hash', '#B266E8'],
  sequences: ['list', '#2E9FD6'],
  vectors: ['move', '#2F9C78'],
  complex: ['orbit', '#6E58F0'],
  grades: ['cap', '#D94E9F'],
  gpa: ['trophy', '#E09A00'],
  physics: ['atom', '#3A78F0'],
  chemistry: ['flask', '#0FA982'],
  constants: ['bulb', '#D9A21C'],
  geo: ['globe', '#F28C12'],
  converter: ['ruler', '#4382EE'],
  finance: ['money', '#25A563'],
  zakat: ['coins', '#C3920F'],
  dates: ['calendar', '#E0485F'],
  time: ['clock', '#1584A8'],
  health: ['health', '#E85A5A'],
  random: ['dice', '#8E52DB'],
};

export const GAME_ID = {
  mathquiz: ['zap', '#E09A00'],
  calcchain: ['link', '#2E9FD6'],
  numrush: ['target', '#E85A5A'],
  sudoku: ['grid', '#5B7CFA'],
  wordle: ['type', '#2F9C78'],
  memory: ['layers', '#B266E8'],
  snake: ['snake', '#25A563'],
  g2048: ['tiles', '#E8873A'],
  tetris: ['box', '#8E52DB'],
  breakout: ['bricks', '#E0485F'],
  pong: ['paddle', '#0E9CC4'],
  asteroids: ['rocket', '#6E58F0'],
  flappy: ['bird', '#D9A21C'],
  bubble: ['bubbles', '#4382EE'],
  whack: ['hammer', '#F07A4A'],
  dodge: ['shield', '#0FA982'],
  gravdraw: ['magnet', '#D94E9F'],
  typing: ['keyboard', '#3A78F0'],
  colormatch: ['palette', '#E8507F'],
  reaction: ['gauge', '#F28C12'],
};

export const SCREEN_ID = {
  calc: ['calc', '#0E9CC4'], solve: ['solve', '#5B7CFA'], graph: ['graph', '#1FAE9F'], tools: ['tools', '#E09A00'],
  arcade: ['arcade', '#D94E9F'], amy: ['amy', '#8A6CF0'], help: ['help', '#4382EE'], manual: ['book', '#25A563'],
};

export const toolIcon = (id) => (TOOL_ID[id] || ['tools'])[0];
export const toolColor = (id) => (TOOL_ID[id] || [0, 'var(--accent)'])[1];
export const gameIcon = (id) => (GAME_ID[id] || ['arcade'])[0];
export const gameColor = (id) => (GAME_ID[id] || [0, 'var(--accent)'])[1];
