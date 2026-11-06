// GPA and CGPA (16.4): courses with credit hours and grades on an editable
// 4.0 scale (universities differ, so the table is yours to change), the
// semester GPA, and a new CGPA from your previous one.

import { h, clear, icon } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { toolPage, numField, outList, message, fmt, record, ok, section } from './kit.js';

// TO REVIEW: a common 4.0 scale; students should edit it to match their university.
const DEFAULT_SCALE = [['A', '4.00'], ['A-', '3.67'], ['B+', '3.33'], ['B', '3.00'], ['B-', '2.67'], ['C+', '2.33'], ['C', '2.00'], ['C-', '1.67'], ['D+', '1.33'], ['D', '1.00'], ['F', '0.00']];

export function create() {
  const { root, body } = toolPage('gpa');
  const saved = store.get('gpa', {});
  let scale = Array.isArray(saved.scale) && saved.scale.length ? saved.scale : DEFAULT_SCALE.map((r) => r.slice());
  const persist = (patch) => store.set('gpa', { ...store.get('gpa', {}), ...patch });
  const courses = h('div', { class: 'rows' });
  const warn = message('warn');
  const out = outList();
  const prevG = numField(t('gpa.prevCgpa'), { value: saved.pg ?? '', onInput: up });
  const prevC = numField(t('gpa.prevCredits'), { value: saved.pc ?? '', inputmode: 'numeric', onInput: up });
  const outC = outList();
  const scaleRows = h('div', { class: 'rows' });

  const pointsOf = (g) => { const r = scale.find((x) => x[0] === g); return r ? Number(r[1]) : NaN; };
  function gradeSelect(value) {
    const sel = h('select', { class: 'input', 'aria-label': t('gpa.grade') }, scale.map(([g, p]) => h('option', { value: g, text: `${g} (${p})` })));
    sel.value = scale.some((x) => x[0] === value) ? value : scale[0][0];
    sel.addEventListener('change', up);
    return sel;
  }
  function addCourse(c = {}) {
    const name = h('input', { class: 'input', value: c.n ?? '', placeholder: t('gpa.course'), 'aria-label': t('gpa.course') });
    const cr = h('input', { class: 'input mono', inputmode: 'decimal', value: c.c ?? '3', 'aria-label': t('gpa.credits') });
    const gr = gradeSelect(c.g);
    const row = h('div', { class: 'tri-row wide' }, name, cr, gr, h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.remove'), on: { click: () => { row.remove(); up(); } } }, icon('close', 'sm')));
    [name, cr].forEach((x) => x.addEventListener('input', up));
    courses.append(row);
  }
  (Array.isArray(saved.courses) && saved.courses.length ? saved.courses : [{ n: t('gpa.ex1'), c: '3', g: 'A' }, { n: t('gpa.ex2'), c: '3', g: 'B+' }, { n: t('gpa.ex3'), c: '4', g: 'A-' }, { n: t('gpa.ex4'), c: '2', g: 'B' }]).forEach(addCourse);

  function up() {
    warn.set('');
    const list = [...courses.children].map((r) => { const [n, c] = r.querySelectorAll('input'); const g = r.querySelector('select').value; return { n: n.value, c: c.value, g }; });
    persist({ courses: list, pg: prevG.input.value, pc: prevC.input.value });
    let credits = 0, qp = 0;
    for (const c of list) {
      const cr = Number(c.c);
      if (!Number.isFinite(cr) || cr < 0) { warn.set(t('gpa.badCredits')); out.set([]); outC.set([]); return; }
      const p = pointsOf(c.g);
      if (!Number.isFinite(p)) { warn.set(t('gpa.badScale')); out.set([]); return; }
      credits += cr; qp += cr * p;
    }
    if (!credits) { out.set([]); outC.set([]); return; }
    const gpa = qp / credits;
    out.set([[t('gpa.gpa'), fmt(Math.round(gpa * 100) / 100, 4), { big: true }], [t('gpa.totalCredits'), fmt(credits)], [t('gpa.qualityPoints'), fmt(qp, 6)]]);
    record('gpa', `${list.length} ${t('gpa.courses')}, ${fmt(credits)} ${t('gpa.credits')}`, `GPA ${fmt(Math.round(gpa * 100) / 100, 4)}`);
    const pg = prevG.get(), pc = prevC.get();
    if (ok(pg, pc) && pc >= 0) {
      if (pg < 0 || pg > 4.0001) { outC.set([[t('gpa.cgpa'), t('gpa.prevRange')]]); return; }
      const cg = (pg * pc + qp) / (pc + credits);
      outC.set([[t('gpa.newCgpa'), fmt(Math.round(cg * 100) / 100, 4), { big: true }], [t('gpa.allCredits'), fmt(pc + credits)]]);
    } else outC.set([]);
  }

  function drawScale() {
    clear(scaleRows);
    scale.forEach((r, i) => {
      const g = h('input', { class: 'input', value: r[0], 'aria-label': t('gpa.grade') });
      const p = h('input', { class: 'input mono', inputmode: 'decimal', value: r[1], 'aria-label': t('gpa.points') });
      const save = () => { scale[i] = [g.value.trim(), p.value.trim()]; persist({ scale }); refreshSelects(); up(); };
      g.addEventListener('change', save); p.addEventListener('input', save);
      scaleRows.append(h('div', { class: 'pair-row' }, g, p, h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.remove'), on: { click: () => { scale.splice(i, 1); persist({ scale }); drawScale(); refreshSelects(); up(); } } }, icon('close', 'sm'))));
    });
  }
  function refreshSelects() {
    courses.querySelectorAll('select').forEach((sel) => { const v = sel.value; const n = gradeSelect(v); sel.replaceWith(n); });
  }

  body.append(
    section(t('gpa.semester'), h('div', { class: 'comp-head three', 'aria-hidden': 'true' }, h('span', { text: t('gpa.course') }), h('span', { text: t('gpa.credits') }), h('span', { text: t('gpa.grade') })), courses,
      h('button', { class: 'btn sm', type: 'button', on: { click: () => { addCourse(); up(); } } }, icon('plus', 'sm'), t('gpa.addCourse')), warn.el, out.el),
    section(t('gpa.cgpa'), h('div', { class: 'tool-grid' }, prevG.el, prevC.el), outC.el),
    section(t('gpa.scale'), h('p', { class: 'help', text: t('gpa.scaleHelp') }), scaleRows,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm', type: 'button', on: { click: () => { scale.push(['', '']); drawScale(); } } }, icon('plus', 'sm'), t('gpa.addGrade')),
        h('button', { class: 'btn sm ghost', type: 'button', on: { click: () => { scale = DEFAULT_SCALE.map((r) => r.slice()); persist({ scale }); drawScale(); refreshSelects(); up(); } } }, t('common.reset')))));
  drawScale();
  up();
  return { root };
}
