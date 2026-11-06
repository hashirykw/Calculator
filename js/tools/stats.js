// Statistics (14.3): lists or frequency tables (sample s or population σ,
// named quartile method), grouped data, linear regression with a scatter
// plot that can go to Graph, and the normal, binomial and Poisson
// distributions with shaded charts.

import { h, clear, icon, seg } from '../ui.js';
import { t } from '../i18n/index.js';
import { app } from '../bus.js';
import { store } from '../store.js';
import { describe, describeGrouped, regression, normalCdf, normalPdf, invNorm, binomPdf, binomCdf, poissonPdf, poissonCdf, QUARTILE_METHODS } from '../core/stats.js';
import { toolPage, numField, outList, message, fmt, record, selectField, tabbed, chart, line, alpha, ok, plain } from './kit.js';

export function parseList(text) {
  const parts = String(text || '').replace(/[−–]/g, '-').split(/[\s,;]+/).filter(Boolean);
  const vals = [];
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isFinite(v)) return { error: p };
    vals.push(v);
  }
  return { vals };
}

export function create() {
  const { root, body } = toolPage('stats');
  const saved = store.get('stats', {});
  const tb = tabbed([['data', t('stats.data')], ['grouped', t('stats.grouped')], ['reg', t('stats.reg')], ['dist', t('stats.dist')]], {
    data: (p) => dataPanel(p, saved),
    grouped: (p) => groupedPanel(p, saved),
    reg: (p) => regPanel(p, saved),
    dist: (p) => distPanel(p),
  });
  body.append(tb.el);
  return { root };
}

const persist = (patch) => store.set('stats', { ...store.get('stats', {}), ...patch });

// ---------- list or frequency table ----------
function dataPanel(p, saved) {
  let mode = saved.mode === 'freq' ? 'freq' : 'list';
  let sample = saved.sample !== false;
  const ta = h('textarea', { class: 'input mono', rows: '3', placeholder: '4, 8, 15, 16, 23, 42', 'aria-label': t('stats.values'), spellcheck: 'false' });
  ta.value = typeof saved.list === 'string' ? saved.list : '4, 8, 15, 16, 23, 42';
  const freqRows = h('div', { class: 'rows' });
  const freqWrap = h('div', { class: 'panel', hidden: mode !== 'freq' },
    h('div', { class: 'row-head' }, h('span', { text: t('stats.value') }), h('span', { text: t('stats.freq') })), freqRows,
    h('button', { class: 'btn sm', type: 'button', on: { click: () => { addFreq('', ''); } } }, icon('plus', 'sm'), t('stats.addRow')));
  const listWrap = h('div', { class: 'field' }, h('label', { text: t('stats.values') }), ta, h('div', { class: 'help', text: t('stats.valuesHelp') }));
  listWrap.hidden = mode === 'freq';
  const modeSeg = seg([['list', t('stats.list')], ['freq', t('stats.freqTable')]], mode, (v) => { mode = v; listWrap.hidden = v === 'freq'; freqWrap.hidden = v !== 'freq'; persist({ mode }); update(); }, t('stats.inputMode'));
  const sSeg = seg([['s', t('stats.sample')], ['p', t('stats.population')]], sample ? 's' : 'p', (v) => { sample = v === 's'; persist({ sample }); update(); }, t('stats.kind'));
  const qSel = selectField(t('set.quartile'), Object.keys(QUARTILE_METHODS).map((k) => [k, t(`stats.q.${k}`)]), app.settings.quartile || 'halves', update);
  const warn = message('warn');
  const out = outList();
  const hist = chart(t('stats.histogram'));
  const box = chart(t('stats.boxplot'));
  box.canvas.classList.add('short');

  function addFreq(v, f) {
    const vi = h('input', { class: 'input mono', inputmode: 'decimal', value: v, 'aria-label': t('stats.value') });
    const fi = h('input', { class: 'input mono', inputmode: 'numeric', value: f, 'aria-label': t('stats.freq') });
    const row = h('div', { class: 'pair-row' }, vi, fi, h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.remove'), on: { click: () => { row.remove(); update(); } } }, icon('close', 'sm')));
    vi.addEventListener('input', update);
    fi.addEventListener('input', update);
    freqRows.append(row);
  }
  (Array.isArray(saved.freq) && saved.freq.length ? saved.freq : [['1', '3'], ['2', '5'], ['3', '4'], ['4', '2']]).forEach(([v, f]) => addFreq(v, f));

  ta.addEventListener('input', update);
  p.append(h('div', { class: 'card panel' }, h('div', { class: 'btn-row' }, modeSeg, sSeg), listWrap, freqWrap, qSel.el, h('p', { class: 'help', text: t('set.quartile.help') })), warn.el, out.el,
    h('div', { class: 'tool-grid two' }, h('div', {}, h('h3', { class: 'section-title', text: t('stats.histogram') }), hist.canvas), h('div', {}, h('h3', { class: 'section-title', text: t('stats.boxplot') }), box.canvas)));

  function read() {
    if (mode === 'list') {
      const r = parseList(ta.value);
      if (r.error) return { error: t('stats.badValue', { v: r.error }) };
      return { vals: r.vals, freqs: null };
    }
    const vals = [], freqs = [], rows = [];
    for (const row of freqRows.children) {
      const [vi, fi] = row.querySelectorAll('input');
      rows.push([vi.value, fi.value]);
      if (!vi.value.trim() && !fi.value.trim()) continue;
      const v = Number(vi.value.replace(/[−–]/g, '-')), f = Number(fi.value);
      if (!Number.isFinite(v)) return { error: t('stats.badValue', { v: vi.value }), rows };
      if (!Number.isInteger(f) || f < 0) return { error: t('stats.badFreq', { v: fi.value }), rows };
      vals.push(v); freqs.push(f);
    }
    return { vals, freqs, rows };
  }

  function update() {
    const r = read();
    persist({ list: ta.value, freq: r.rows || undefined });
    warn.set(r.error || '');
    if (r.error) return;
    const n = r.freqs ? r.freqs.reduce((a, b) => a + b, 0) : r.vals.length;
    if (!n) { out.set([]); warn.set(t('err.emptylist')); hist.draw(null); return; }
    const d = describe(r.vals, r.freqs, { sample, quartile: qSel.get() });
    const sd = sample ? 's' : 'σ';
    out.set([
      ['n', String(d.n)],
      ['Σx', fmt(d.sum)], ['Σx²', fmt(d.sumSq)],
      [`${t('stats.mean')} x̄`, fmt(d.mean), { big: true }],
      [t('stats.median'), fmt(d.median)],
      [t('stats.mode'), d.modes.length ? d.modes.map((v) => fmt(v)).join(', ') : t('err.nomode')],
      [t('stats.min'), fmt(d.min)], [t('stats.max'), fmt(d.max)], [t('stats.range'), fmt(d.range)],
      ['Q1', d.n >= 2 ? fmt(d.q1) : t('err.needtwo')], ['Q3', d.n >= 2 ? fmt(d.q3) : t('err.needtwo')], ['IQR', d.n >= 2 ? fmt(d.iqr) : '—'],
      [`${t('stats.sd')} ${sd}`, Number.isFinite(d.sd) ? fmt(d.sd) : t('err.needtwo'), { big: true }],
      [`${t('stats.variance')} ${sd}²`, Number.isFinite(d.variance) ? fmt(d.variance) : t('err.needtwo')],
      [t('stats.outliers'), d.outliers.length ? d.outliers.map((v) => fmt(v)).join(', ') : t('stats.none')],
    ]);
    record('stats', `${mode === 'list' ? ta.value.slice(0, 80) : `${n} values`}`, `x̄ = ${fmt(d.mean)}, ${sd} = ${fmt(d.sd)}`);
    drawHistogram(hist, d.sorted);
    drawBox(box, d);
  }
  update();
}

function drawHistogram(ch, sorted) {
  if (!sorted || !sorted.length) return;
  const distinct = [...new Set(sorted)];
  const n = sorted.length;
  let bins;
  if (distinct.length <= 15 && distinct.every(Number.isInteger)) {
    bins = distinct.map((v) => ({ lo: v - 0.4, hi: v + 0.4, label: v, f: sorted.filter((x) => x === v).length }));
  } else {
    const k = Math.max(4, Math.min(14, Math.ceil(Math.log2(n) + 1)));
    const lo = sorted[0], hi = sorted[n - 1];
    const w = (hi - lo) / k || 1;
    bins = Array.from({ length: k }, (_, i) => ({ lo: lo + i * w, hi: lo + (i + 1) * w, f: 0 }));
    for (const x of sorted) bins[Math.min(k - 1, Math.floor((x - lo) / w))].f++;
  }
  const maxF = Math.max(...bins.map((b) => b.f));
  ch.draw({
    x: [bins[0].lo - (bins[0].hi - bins[0].lo) * 0.3, bins[bins.length - 1].hi + (bins[0].hi - bins[0].lo) * 0.3], y: [0, maxF * 1.15],
    xTicks: bins.every((b) => b.label !== undefined) && bins.length <= 15 ? bins.map((b) => b.label) : undefined,
    fmtY: (v) => (Number.isInteger(v) ? String(v) : ''),
    plot(g) {
      const col = g.color(0);
      for (const b of bins) {
        const x0 = g.X(b.lo), x1 = g.X(b.hi), y = g.Y(b.f), y0 = g.Y(0);
        g.c.fillStyle = alpha(col, 0.35);
        g.c.fillRect(x0, y, x1 - x0, y0 - y);
        g.c.strokeStyle = col;
        g.c.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, y0 - y);
      }
    },
  }, t('stats.histDesc', { n: bins.length }));
}

function drawBox(ch, d) {
  if (d.n < 2) { ch.draw(null); return; }
  const span = d.max - d.min || 1;
  const nonOut = d.sorted.filter((x) => !d.outliers.includes(x));
  const wl = nonOut.length ? nonOut[0] : d.min, wh = nonOut.length ? nonOut[nonOut.length - 1] : d.max;
  ch.draw({
    x: [d.min - span * 0.08, d.max + span * 0.08], y: [0, 1], fmtY: () => '',
    plot(g) {
      const c = g.c, col = g.color(0), ym = g.Y(0.5), hh = (g.Y(0.2) - g.Y(0.8)) / 2;
      c.strokeStyle = col; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(g.X(wl), ym); c.lineTo(g.X(d.q1), ym); c.moveTo(g.X(d.q3), ym); c.lineTo(g.X(wh), ym);
      c.moveTo(g.X(wl), ym - hh / 2); c.lineTo(g.X(wl), ym + hh / 2); c.moveTo(g.X(wh), ym - hh / 2); c.lineTo(g.X(wh), ym + hh / 2); c.stroke();
      c.fillStyle = alpha(col, 0.25);
      c.fillRect(g.X(d.q1), ym - hh, g.X(d.q3) - g.X(d.q1), 2 * hh);
      c.strokeRect(g.X(d.q1), ym - hh, g.X(d.q3) - g.X(d.q1), 2 * hh);
      c.strokeStyle = g.css('--g2'); c.lineWidth = 2;
      c.beginPath(); c.moveTo(g.X(d.median), ym - hh); c.lineTo(g.X(d.median), ym + hh); c.stroke();
      c.fillStyle = g.css('--err');
      for (const o of d.outliers) { c.beginPath(); c.arc(g.X(o), ym, 3.5, 0, 7); c.fill(); }
    },
  }, t('stats.boxDesc', { min: fmt(d.min), q1: fmt(d.q1), med: fmt(d.median), q3: fmt(d.q3), max: fmt(d.max) }));
}

// ---------- grouped data ----------
function groupedPanel(p, saved) {
  let sample = saved.gSample !== false;
  const rows = h('div', { class: 'rows' });
  const warn = message('warn');
  const out = outList();
  const hist = chart(t('stats.histogram'));
  const sSeg = seg([['s', t('stats.sample')], ['p', t('stats.population')]], sample ? 's' : 'p', (v) => { sample = v === 's'; persist({ gSample: sample }); update(); }, t('stats.kind'));
  function addRow(lo, hi, f) {
    const ins = [lo, hi, f].map((v, i) => h('input', { class: 'input mono', inputmode: 'decimal', value: v, 'aria-label': [t('stats.lower'), t('stats.upper'), t('stats.freq')][i], on: { input: update } }));
    const row = h('div', { class: 'tri-row' }, ...ins, h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.remove'), on: { click: () => { row.remove(); update(); } } }, icon('close', 'sm')));
    rows.append(row);
  }
  (Array.isArray(saved.groups) && saved.groups.length ? saved.groups : [['0', '10', '4'], ['10', '20', '9'], ['20', '30', '12'], ['30', '40', '5']]).forEach((r) => addRow(...r));
  p.append(h('div', { class: 'card panel' }, sSeg,
    h('div', { class: 'row-head three' }, h('span', { text: t('stats.lower') }), h('span', { text: t('stats.upper') }), h('span', { text: t('stats.freq') })), rows,
    h('button', { class: 'btn sm', type: 'button', on: { click: () => addRow('', '', '') } }, icon('plus', 'sm'), t('stats.addClass')),
    h('p', { class: 'help', text: t('stats.groupedHelp') })), warn.el, out.el, hist.canvas);

  function update() {
    const classes = [], raw = [];
    warn.set('');
    for (const r of rows.children) {
      const [a, b, c] = [...r.querySelectorAll('input')].map((i) => i.value);
      raw.push([a, b, c]);
      if (!a.trim() && !b.trim() && !c.trim()) continue;
      const lo = Number(a.replace(/[−–]/g, '-')), hi = Number(b.replace(/[−–]/g, '-')), f = Number(c);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) { warn.set(t('stats.badClass', { a, b })); return; }
      if (!Number.isInteger(f) || f < 0) { warn.set(t('stats.badFreq', { v: c })); return; }
      classes.push([lo, hi, f]);
    }
    persist({ groups: raw });
    const N = classes.reduce((s, c) => s + c[2], 0);
    if (!N) { out.set([]); warn.set(t('err.emptylist')); return; }
    const d = describeGrouped(classes, { sample });
    const maxF = Math.max(...classes.map((c) => c[2]));
    const modal = classes.filter((c) => c[2] === maxF).map((c) => `${fmt(c[0])} – ${fmt(c[1])}`).join(', ');
    out.set([
      ['N = Σf', String(N)], ['Σfx', fmt(d.sum)],
      [`${t('stats.estMean')} x̄`, fmt(d.mean), { big: true }],
      [t('stats.estMedian'), fmt(d.median)],
      [t('stats.modalClass'), modal],
      [`${t('stats.estSd')} ${sample ? 's' : 'σ'}`, Number.isFinite(d.sd) ? fmt(d.sd) : t('err.needtwo')],
    ]);
    record('stats', `${t('stats.grouped')} N=${N}`, `x̄ ≈ ${fmt(d.mean)}`);
    // histogram with frequency density when class widths differ
    const widths = classes.map((c) => c[1] - c[0]);
    const equal = widths.every((w) => Math.abs(w - widths[0]) < 1e-9);
    const hs = classes.map((c, i) => (equal ? c[2] : c[2] / widths[i]));
    const maxH = Math.max(...hs);
    hist.draw({
      x: [Math.min(...classes.map((c) => c[0])), Math.max(...classes.map((c) => c[1]))], y: [0, maxH * 1.15],
      plot(g) {
        const col = g.color(0);
        classes.forEach((c, i) => {
          const x0 = g.X(c[0]), x1 = g.X(c[1]), y = g.Y(hs[i]), y0 = g.Y(0);
          g.c.fillStyle = alpha(col, 0.35); g.c.fillRect(x0, y, x1 - x0, y0 - y);
          g.c.strokeStyle = col; g.c.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, y0 - y);
        });
      },
    }, equal ? t('stats.histDesc', { n: classes.length }) : t('stats.densityDesc'));
  }
  update();
}

// ---------- regression ----------
function regPanel(p, saved) {
  const xs = h('textarea', { class: 'input mono', rows: '2', 'aria-label': 'x', spellcheck: 'false' });
  const ys = h('textarea', { class: 'input mono', rows: '2', 'aria-label': 'y', spellcheck: 'false' });
  xs.value = typeof saved.rx === 'string' ? saved.rx : '1, 2, 3, 4, 5, 6';
  ys.value = typeof saved.ry === 'string' ? saved.ry : '2.1, 3.9, 6.2, 7.8, 10.1, 12.2';
  const predict = numField(t('stats.predictX'), { onInput: () => update() });
  const warn = message('warn');
  const out = outList();
  const sc = chart(t('stats.scatter'));
  const toGraph = h('button', { class: 'btn sm', type: 'button', hidden: true }, icon('graph', 'sm'), t('stats.toGraph'));
  xs.addEventListener('input', update);
  ys.addEventListener('input', update);
  p.append(h('div', { class: 'card panel' },
    h('div', { class: 'field' }, h('label', { text: t('stats.xValues') }), xs),
    h('div', { class: 'field' }, h('label', { text: t('stats.yValues') }), ys), predict.el), warn.el, out.el, sc.canvas, h('div', { class: 'btn-row' }, toGraph));
  let last = null;
  toGraph.addEventListener('click', () => {
    if (!last) return;
    const { X, Y, r } = last;
    const pts = X.map((x, i) => `(${plain(x, 12)}, ${plain(Y[i], 12)})`).join(', ');
    const lineText = `y = ${plain(r.a)} ${r.b < 0 ? '-' : '+'} ${plain(Math.abs(r.b))}x`;
    const xmin = Math.min(...X), xmax = Math.max(...X), ymin = Math.min(...Y), ymax = Math.max(...Y);
    const px = (xmax - xmin) * 0.15 || 1, py = (ymax - ymin) * 0.15 || 1;
    app.pending = { ...(app.pending || {}), graph: [pts, lineText], graphView: { xmin: xmin - px, xmax: xmax + px, ymin: ymin - py, ymax: ymax + py, square: false } };
    location.hash = '#/graph';
  });

  function update() {
    persist({ rx: xs.value, ry: ys.value });
    warn.set('');
    const a = parseList(xs.value), b = parseList(ys.value);
    if (a.error || b.error) { warn.set(t('stats.badValue', { v: a.error || b.error })); return; }
    if (a.vals.length !== b.vals.length) { warn.set(t('err.listsize')); out.set([]); toGraph.hidden = true; return; }
    if (a.vals.length < 2) { warn.set(t('err.needtwo')); out.set([]); toGraph.hidden = true; return; }
    const r = regression(a.vals, b.vals);
    if (!r) { warn.set(t('stats.sameX')); out.set([]); toGraph.hidden = true; return; }
    last = { X: a.vals, Y: b.vals, r };
    const px = predict.get();
    const eq = `y = ${fmt(r.a, 6)} ${r.b < 0 ? '−' : '+'} ${fmt(Math.abs(r.b), 6)}x`;
    out.set([
      ['n', String(r.n)], ['x̄', fmt(r.mx)], ['ȳ', fmt(r.my)],
      [t('stats.line'), eq, { big: true, copy: eq }],
      [`${t('stats.gradient')} b`, fmt(r.b)], [`${t('stats.intercept')} a`, fmt(r.a)],
      [`${t('stats.pmcc')} r`, Number.isFinite(r.r) ? fmt(r.r, 6) : '—'], ['r²', Number.isFinite(r.r2) ? fmt(r.r2, 6) : '—'],
      ok(px) ? [`ŷ (x = ${fmt(px)})`, fmt(r.a + r.b * px)] : null,
    ]);
    toGraph.hidden = false;
    record('stats', `${t('stats.reg')} n=${r.n}`, eq);
    const X = a.vals, Y = b.vals;
    const xmin = Math.min(...X), xmax = Math.max(...X), ymin = Math.min(...Y, r.a + r.b * xmin, r.a + r.b * xmax), ymax = Math.max(...Y, r.a + r.b * xmin, r.a + r.b * xmax);
    const padx = (xmax - xmin) * 0.08 || 1, pady = (ymax - ymin) * 0.1 || 1;
    sc.draw({
      x: [xmin - padx, xmax + padx], y: [ymin - pady, ymax + pady],
      plot(g) {
        line(g, [[xmin - padx, r.a + r.b * (xmin - padx)], [xmax + padx, r.a + r.b * (xmax + padx)]], g.color(1), 2);
        g.c.fillStyle = g.color(0);
        X.forEach((x, i) => { g.c.beginPath(); g.c.arc(g.X(x), g.Y(Y[i]), 3.5, 0, 7); g.c.fill(); });
      },
    }, t('stats.scatterDesc', { n: X.length, eq }));
  }
  update();
}

// ---------- distributions ----------
function distPanel(p) {
  let kind = 'normal';
  const host = h('div', { class: 'panel' });
  const kSeg = seg([['normal', t('stats.normal')], ['binom', t('stats.binomial')], ['poisson', t('stats.poisson')]], kind, (v) => { kind = v; build(); }, t('stats.dist'));
  p.append(kSeg, host);
  function build() {
    clear(host);
    if (kind === 'normal') normal(host);
    else discrete(host, kind);
  }
  build();
}

function normal(host) {
  const mu = numField('μ', { value: '0', onInput: up }), sg = numField('σ', { value: '1', onInput: up });
  const a = numField(t('stats.lowerBound'), { placeholder: '−∞', value: '-1', onInput: up }), b = numField(t('stats.upperBound'), { placeholder: '∞', value: '1', onInput: up });
  const pIn = numField(t('stats.leftArea'), { value: '0.95', help: t('stats.leftAreaHelp'), onInput: up });
  const warn = message('warn');
  const out = outList();
  const ch = chart(t('stats.normal'));
  host.append(h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' }, mu.el, sg.el, a.el, b.el), pIn.el), warn.el, out.el, ch.canvas);
  function up() {
    const m = mu.get(), s = sg.get();
    let lo = a.get(), hi = b.get();
    warn.set('');
    if (!ok(m) || !ok(s) || s <= 0) { warn.set(t('stats.needSigma')); out.set([]); return; }
    if (lo === null || hi === null) return;
    if (Number.isNaN(lo)) lo = -Infinity;
    if (Number.isNaN(hi)) hi = Infinity;
    if (lo > hi) [lo, hi] = [hi, lo];
    const P = normalCdf(lo, hi, m, s);
    const pv = pIn.get();
    const inv = ok(pv) && pv > 0 && pv < 1 ? invNorm(pv, m, s) : NaN;
    const show = (v) => (v === -Infinity ? '−∞' : v === Infinity ? '∞' : fmt(v));
    out.set([
      [`P(${show(lo)} < X < ${show(hi)})`, fmt(P, 6), { big: true }],
      [`P(X < ${show(hi)})`, fmt(normalCdf(-Infinity, hi, m, s), 6)],
      [`P(X > ${show(lo)})`, fmt(normalCdf(lo, Infinity, m, s), 6)],
      [`z (${show(lo)}, ${show(hi)})`, `${Number.isFinite(lo) ? fmt((lo - m) / s, 6) : '−∞'}, ${Number.isFinite(hi) ? fmt((hi - m) / s, 6) : '∞'}`],
      ok(inv) ? [`x ${t('stats.withLeft', { p: fmt(pv) })}`, fmt(inv, 6)] : null,
    ]);
    record('stats', `N(${fmt(m)}, ${fmt(s)}²) ${show(lo)} < X < ${show(hi)}`, fmt(P, 6));
    const x0 = m - 4 * s, x1 = m + 4 * s;
    ch.draw({
      x: [x0, x1], y: [0, normalPdf(m, m, s) * 1.12], fmtY: () => '',
      plot(g) {
        const pts = [];
        for (let i = 0; i <= 240; i++) { const x = x0 + ((x1 - x0) * i) / 240; pts.push([x, normalPdf(x, m, s)]); }
        const L = Math.max(lo, x0), R = Math.min(hi, x1);
        if (R > L) {
          g.c.fillStyle = alpha(g.color(0), 0.3);
          g.c.beginPath(); g.c.moveTo(g.X(L), g.Y(0));
          for (const [x, y] of pts) if (x >= L && x <= R) g.c.lineTo(g.X(x), g.Y(y));
          g.c.lineTo(g.X(R), g.Y(normalPdf(R, m, s))); g.c.lineTo(g.X(R), g.Y(0)); g.c.closePath(); g.c.fill();
        }
        line(g, pts, g.color(0), 2);
      },
    }, t('stats.normalDesc', { p: fmt(P, 4) }));
  }
  up();
}

function discrete(host, kind) {
  const binom = kind === 'binom';
  const n = binom ? numField('n', { value: '10', inputmode: 'numeric', onInput: up }) : null;
  const pp = binom ? numField('p', { value: '0.3', onInput: up }) : numField('λ', { value: '3', onInput: up });
  const r = numField('r', { value: '3', inputmode: 'numeric', onInput: up });
  const warn = message('warn');
  const out = outList();
  const ch = chart(t(binom ? 'stats.binomial' : 'stats.poisson'));
  host.append(h('div', { class: 'card panel' }, h('div', { class: 'tool-grid' }, n && n.el, pp.el, r.el)), warn.el, out.el, ch.canvas);
  function up() {
    warn.set('');
    const N = n ? n.get() : null, P = pp.get(), R = r.get();
    if (binom && (!ok(N) || !Number.isInteger(N) || N < 0 || N > 100000)) { warn.set(t('stats.needN')); out.set([]); return; }
    if (binom ? !(ok(P) && P >= 0 && P <= 1) : !(ok(P) && P > 0)) { warn.set(t(binom ? 'stats.needP' : 'stats.needLambda')); out.set([]); return; }
    if (!ok(R) || !Number.isInteger(R) || R < 0) { warn.set(t('stats.needR')); out.set([]); return; }
    const pdf = (k) => (binom ? binomPdf(N, P, k) : poissonPdf(P, k));
    const cdf = (k) => (k < 0 ? 0 : binom ? binomCdf(N, P, k) : poissonCdf(P, k));
    const mean = binom ? N * P : P, vr = binom ? N * P * (1 - P) : P;
    out.set([
      [`P(X = ${R})`, fmt(pdf(R), 6), { big: true }],
      [`P(X ≤ ${R})`, fmt(cdf(R), 6)], [`P(X < ${R})`, fmt(cdf(R - 1), 6)],
      [`P(X ≥ ${R})`, fmt(Math.max(0, 1 - cdf(R - 1)), 6)], [`P(X > ${R})`, fmt(Math.max(0, 1 - cdf(R)), 6)],
      [t('stats.meanE'), fmt(mean)], [t('stats.varianceV'), fmt(vr)],
    ]);
    record('stats', binom ? `B(${N}, ${fmt(P)}) r = ${R}` : `Po(${fmt(P)}) r = ${R}`, fmt(pdf(R), 6));
    const kmax = binom ? Math.min(N, Math.max(R + 3, Math.ceil(mean + 4 * Math.sqrt(vr) + 1))) : Math.max(R + 3, Math.ceil(P + 4 * Math.sqrt(P) + 1));
    const kmin = binom ? Math.max(0, Math.min(R - 3, Math.floor(mean - 4 * Math.sqrt(vr)))) : 0;
    const ks = [];
    for (let k = kmin; k <= Math.min(kmax, kmin + 80); k++) ks.push(k);
    const ys = ks.map(pdf);
    ch.draw({
      x: [kmin - 0.7, ks[ks.length - 1] + 0.7], y: [0, Math.max(...ys) * 1.15],
      xTicks: ks.length <= 21 ? ks : undefined, fmtY: (v) => String(+v.toPrecision(2)),
      plot(g) {
        ks.forEach((k, i) => {
          const hit = k === R;
          g.c.fillStyle = hit ? g.color(1) : alpha(g.color(0), k <= R ? 0.55 : 0.25);
          const x0 = g.X(k - 0.38), x1 = g.X(k + 0.38);
          g.c.fillRect(x0, g.Y(ys[i]), x1 - x0, g.Y(0) - g.Y(ys[i]));
        });
      },
    }, t('stats.barsDesc', { r: R }));
  }
  up();
}
