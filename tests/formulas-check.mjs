// Checks every formula in data/formulas.json with the app's own engine:
// work out the first variable from the sample values, then solve for each
// other variable in turn and make sure the sample value comes back.
// Run: node tests/formulas-check.mjs

import { readFileSync } from 'node:fs';
import { run } from '../js/engine.js';

const data = JSON.parse(readFileSync(new URL('../data/formulas.json', import.meta.url), 'utf8'));
const plain = (x) => x.toLocaleString('en-US', { useGrouping: false, maximumSignificantDigits: 15 });

export function substitute(expr, values) {
  let s = expr;
  for (const [k, v] of Object.entries(values)) s = s.replace(new RegExp(`\\b${k}\\b`, 'g'), `(${plain(v)})`);
  return s;
}

let pass = 0, fail = 0;
const ids = new Set();
for (const f of data.formulas) {
  if (ids.has(f.id)) { console.log(`FAIL ${f.id}: duplicate id`); fail++; continue; }
  ids.add(f.id);
  if (!data.groups.some((g) => g.id === f.g)) { console.log(`FAIL ${f.id}: unknown group ${f.g}`); fail++; continue; }
  const settings = { angle: f.angle || 'rad', sig: 12 };
  const subject = f.vars[0].s;
  const r0 = run(`solve(${substitute(f.expr, f.ex)}, ${subject})`, settings);
  const v0 = r0.ok && r0.values && r0.values.find((v) => Number.isFinite(v) && (!f.vars[0].pos || v > 0));
  if (v0 === undefined) { console.log(`FAIL ${f.id}: couldn't work out ${subject}`, r0.error || r0.exact); fail++; continue; }
  const all = { ...f.ex, [subject]: v0 };
  let ok = true;
  for (const v of f.vars.slice(1)) {
    const known = Object.fromEntries(Object.entries(all).filter(([k]) => k !== v.s));
    const r = run(`solve(${substitute(f.expr, known)}, ${v.s})`, settings);
    const target = all[v.s];
    const hit = r.ok && (r.values || []).some((x) => Math.abs(x - target) <= 1e-6 * Math.max(1, Math.abs(target)));
    if (!hit) { ok = false; console.log(`FAIL ${f.id}: solving for ${v.s} expected ${target}, got`, r.ok ? (r.values || r.exact && r.exact.text) : r.error); }
  }
  if (ok) pass++; else fail++;
}
console.log(`\n${pass}/${pass + fail} formulas check out`);
if (fail) process.exitCode = 1;
