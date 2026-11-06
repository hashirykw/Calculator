// Grades (16.3): marks to percentage, weighted components (coursework,
// tests, finals) with the score you still need to reach a target, and your
// own grade boundaries, since these differ between schools and exam boards.

import { h, clear, icon } from '../ui.js';
import { t } from '../i18n/index.js';
import { store } from '../store.js';
import { toolPage, numField, outList, message, fmt, record, pctf, ok, section } from './kit.js';

export function create() {
  const { root, body } = toolPage('grades');
  const saved = store.get('grades', {});
  const persist = (patch) => store.set('grades', { ...store.get('grades', {}), ...patch });

  // boundaries the student enters (none by default)
  let bounds = Array.isArray(saved.bounds) ? saved.bounds.filter((b) => b && typeof b.g === 'string') : [];
  const gradeFor = (p) => {
    const sorted = bounds.filter((b) => Number.isFinite(Number(b.min)) && b.g.trim()).sort((a, b) => Number(b.min) - Number(a.min));
    const hit = sorted.find((b) => p >= Number(b.min) - 1e-9);
    return sorted.length ? (hit ? hit.g : t('gr.belowAll')) : null;
  };

  // ---------- marks to percentage ----------
  const got = numField(t('gr.marks'), { value: saved.got ?? '68', onInput: up1 });
  const total = numField(t('gr.total'), { value: saved.total ?? '80', onInput: up1 });
  const target = numField(t('gr.targetPct'), { value: saved.target ?? '90', unit: '%', onInput: up1 });
  const out1 = outList();
  function up1() {
    persist({ got: got.input.value, total: total.input.value, target: target.input.value });
    const g = got.get(), tt = total.get(), tg = target.get();
    if (!ok(g, tt) || tt <= 0) { out1.set([]); return; }
    const p = (g / tt) * 100;
    const grade = gradeFor(p);
    out1.set([
      [t('gr.percentage'), pctf(p), { big: true }],
      grade ? [t('gr.grade'), grade] : null,
      ok(tg) ? [t('gr.marksFor', { p: fmt(tg) }), `${fmt(Math.ceil((tg / 100) * tt - 1e-9))} / ${fmt(tt)}`] : null,
    ]);
    record('grades', `${fmt(g)} / ${fmt(tt)}`, pctf(p));
  }

  // ---------- weighted components ----------
  const rows = h('div', { class: 'rows' });
  const wTarget = numField(t('gr.overallTarget'), { value: saved.wTarget ?? '75', unit: '%', onInput: up2 });
  const warn2 = message('warn');
  const out2 = outList();
  function addRow(c = {}) {
    const name = h('input', { class: 'input', value: c.n ?? '', placeholder: t('gr.component'), 'aria-label': t('gr.component') });
    const weight = h('input', { class: 'input mono', inputmode: 'decimal', value: c.w ?? '', placeholder: '%', 'aria-label': t('gr.weight') });
    const score = h('input', { class: 'input mono', inputmode: 'decimal', value: c.s ?? '', placeholder: t('gr.scorePh'), 'aria-label': t('gr.score') });
    const outOf = h('input', { class: 'input mono', inputmode: 'decimal', value: c.o ?? '100', 'aria-label': t('gr.outOf') });
    const row = h('div', { class: 'comp-row' }, name, weight, score, outOf, h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.remove'), on: { click: () => { row.remove(); up2(); } } }, icon('close', 'sm')));
    [name, weight, score, outOf].forEach((x) => x.addEventListener('input', up2));
    rows.append(row);
  }
  (Array.isArray(saved.comps) && saved.comps.length ? saved.comps : [{ n: t('gr.ex.course'), w: '20', s: '82', o: '100' }, { n: t('gr.ex.mid'), w: '30', s: '35', o: '50' }, { n: t('gr.ex.final'), w: '50', s: '', o: '100' }]).forEach(addRow);
  function up2() {
    warn2.set('');
    const comps = [...rows.children].map((r) => { const [n, w, s, o] = r.querySelectorAll('input'); return { n: n.value, w: w.value, s: s.value, o: o.value }; });
    persist({ comps, wTarget: wTarget.input.value });
    let W = 0, done = 0, doneW = 0, remW = 0;
    for (const c of comps) {
      const w = Number(c.w), s = c.s.trim() === '' ? null : Number(c.s), o = Number(c.o) || 100;
      if (!Number.isFinite(w) || w < 0) { warn2.set(t('gr.badWeight')); out2.set([]); return; }
      if (s !== null && (!Number.isFinite(s) || s < 0)) { warn2.set(t('gr.badScore')); out2.set([]); return; }
      W += w;
      if (s === null) remW += w; else { done += w * (s / o); doneW += w; }
    }
    if (!W) { out2.set([]); return; }
    if (Math.abs(W - 100) > 1e-9) warn2.set(t('gr.weightsSum', { w: fmt(W) }));
    const rowsOut = [];
    if (doneW) {
      rowsOut.push([t('gr.soFar'), pctf((done / doneW) * 100), { big: !remW }]);
      rowsOut.push([t('gr.secured'), pctf((done / W) * 100)]);
    }
    const tg = wTarget.get();
    if (remW && ok(tg)) {
      const need = ((tg / 100) * W - done) / remW * 100;
      rowsOut.push([t('gr.need', { p: fmt(tg) }), need > 100 ? t('gr.impossible', { p: pctf(need) }) : need <= 0 ? t('gr.alreadySecured') : pctf(need), { big: true }]);
    } else if (!remW) {
      const overall = (done / W) * 100;
      const grade = gradeFor(overall);
      rowsOut.push([t('gr.overall'), pctf(overall), { big: true }]);
      if (grade) rowsOut.push([t('gr.grade'), grade]);
    }
    out2.set(rowsOut);
    record('grades', t('gr.weighted'), rowsOut.map((r) => `${r[0]} ${r[1]}`).join('; '));
  }

  // ---------- boundaries ----------
  const bRows = h('div', { class: 'rows' });
  function drawBounds() {
    clear(bRows);
    bounds.forEach((b, i) => {
      const g = h('input', { class: 'input', value: b.g, placeholder: t('gr.gradePh'), 'aria-label': t('gr.grade') });
      const m = h('input', { class: 'input mono', inputmode: 'decimal', value: b.min, placeholder: t('gr.minPh'), 'aria-label': t('gr.min') });
      const save = () => { bounds[i] = { g: g.value, min: m.value }; persist({ bounds }); up1(); up2(); };
      g.addEventListener('input', save); m.addEventListener('input', save);
      bRows.append(h('div', { class: 'pair-row' }, g, m, h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.remove'), on: { click: () => { bounds.splice(i, 1); persist({ bounds }); drawBounds(); up1(); up2(); } } }, icon('close', 'sm'))));
    });
    if (!bounds.length) bRows.append(h('p', { class: 'help', text: t('gr.noBounds') }));
  }

  body.append(
    section(t('gr.toPct'), h('div', { class: 'tool-grid' }, got.el, total.el, target.el), out1.el),
    section(t('gr.weighted'), h('div', { class: 'comp-head', 'aria-hidden': 'true' }, h('span', { text: t('gr.component') }), h('span', { text: t('gr.weight') }), h('span', { text: t('gr.score') }), h('span', { text: t('gr.outOf') })), rows,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', on: { click: () => { addRow(); up2(); } } }, icon('plus', 'sm'), t('gr.addComponent'))),
      wTarget.el, h('p', { class: 'help', text: t('gr.weightedHelp') }), warn2.el, out2.el),
    section(t('gr.boundaries'), h('p', { class: 'help', text: t('gr.boundHelp') }), bRows,
      h('button', { class: 'btn sm', type: 'button', on: { click: () => { bounds.push({ g: '', min: '' }); persist({ bounds }); drawBounds(); } } }, icon('plus', 'sm'), t('gr.addBoundary'))));
  drawBounds();
  up1();
  up2();
  return { root };
}
