// Runs tests/cases.js in Node (used by the GitHub Action). Exit code 1 on failure.
//   node tests/run-node.mjs
import { runAll } from './cases.js';

const results = await runAll();
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  [${r.group}] ${r.name}${r.pass ? '' : `\n      expected: ${r.expected}\n      actual:   ${r.actual}`}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
