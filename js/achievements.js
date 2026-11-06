// Light, saved achievements (17.5). One quiet toast, never while typing,
// and nothing for simply opening a screen.

import { store } from './store.js';
import { bus } from './bus.js';
import { toast, isTyping } from './ui.js';
import { t } from './i18n/index.js';

export const ALL_TOOLS = ['converter', 'matrix', 'stats', 'trig', 'formulas', 'base', 'finance', 'health', 'equations', 'fractions', 'grades', 'gpa', 'zakat', 'dates', 'time', 'physics', 'chemistry', 'numtheory', 'sequences', 'vectors', 'complex', 'constants', 'geo', 'random'];
export const LIST = ['first', 'solve', 'graph', 'hundred', 'allTools', 'sudokuHard', 'arcade5', 'globe'];

const data = (() => {
  const d = store.get('ach', {});
  return {
    unlocked: d && typeof d.unlocked === 'object' ? d.unlocked : {},
    calcs: Number(d && d.calcs) || 0,
    tools: Array.isArray(d && d.tools) ? d.tools : [],
  };
})();
const save = () => store.set('ach', data);

function unlock(id) {
  if (data.unlocked[id]) return;
  data.unlocked[id] = new Date().toISOString().slice(0, 10);
  save();
  announce(t('toast.achievement', { name: t(`ach.${id}`) }), 0);
}
function announce(msg, tries) {
  if (isTyping() && tries < 6) { setTimeout(() => announce(msg, tries + 1), 2500); return; }
  toast(msg, { kind: 'achieve', duration: 3500 });
}

bus.on('result', (e) => {
  data.calcs++;
  save();
  if (data.calcs >= 1) unlock('first');
  if (data.calcs >= 100) unlock('hundred');
  if (e && e.kind === 'solve' && e.task === 'solve') unlock('solve');
  if (e && e.kind === 'graph') unlock('graph');
});
bus.on('tool:used', (id) => {
  if (!ALL_TOOLS.includes(id) || data.tools.includes(id)) return;
  data.tools.push(id);
  save();
  if (ALL_TOOLS.every((x) => data.tools.includes(x))) unlock('allTools');
});
bus.on('game:won', (g) => { if (g && g.game === 'sudoku' && g.level === 'hard') unlock('sudokuHard'); });
bus.on('game:played', (id) => {
  data.games = Array.isArray(data.games) ? data.games : [];
  if (!data.games.includes(id)) { data.games.push(id); save(); }
  if (data.games.length >= 5) unlock('arcade5');
});
bus.on('tool:used', (id) => { if (id === 'geo') unlock('globe'); });

export const getAchievements = () => LIST.map((id) => ({ id, date: data.unlocked[id] || null }));
