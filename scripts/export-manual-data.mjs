// Exports the manual's content, icons and hotspot positions to JSON for
// scripts/build-manual-pdf.py.   node scripts/export-manual-data.mjs [out.json]
import { CHAPTERS, QUICK, SHORTCUTS, FAQ } from '../js/manual-content.js';
import { ICONS } from '../js/icons.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/tmp/mpdf/data.json';
mkdirSync(dirname(out), { recursive: true });
const spots = JSON.parse(readFileSync(join(root, 'manual/spots.json'), 'utf8'));
writeFileSync(out, JSON.stringify({ CHAPTERS, QUICK, SHORTCUTS, FAQ, ICONS, spots }));
console.log('wrote', out);
