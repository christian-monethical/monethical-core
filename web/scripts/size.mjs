// Reports real gzip sizes of the built bundle and enforces the performance budget.
// Usage: npm run build && npm run size
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BUDGET_INITIAL_JS_KB = 55;
const BUDGET_CHUNK_KB = 40; // any single lazy chunk (the shared editor chunk carries the widget previews)

const kb = (bytes) => (bytes / 1024).toFixed(2);
const gz = (file) => gzipSync(readFileSync(file)).length;

const assets = readdirSync(join(DIST, 'assets')).map((name) => ({ name, path: join(DIST, 'assets', name) }));
const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// Initial = what index.html loads (entry script, its CSS, and modulepreloads).
const initial = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((m) => m[1]));
const sizeOf = (name) => gz(join(DIST, 'assets', name));

let initialJs = 0;
let initialCss = 0;
for (const name of initial) {
  if (name.endsWith('.js')) initialJs += sizeOf(name);
  if (name.endsWith('.css')) initialCss += sizeOf(name);
}

const rows = assets
  .filter((a) => !initial.has(a.name))
  .map((a) => ({ name: a.name, raw: statSync(a.path).size, gzip: gz(a.path) }))
  .sort((a, b) => b.gzip - a.gzip);

console.log('\nInitial load (index.html)');
console.log(`  JS   ${kb(initialJs)} KB gzip   (budget ${BUDGET_INITIAL_JS_KB} KB)`);
console.log(`  CSS  ${kb(initialCss)} KB gzip`);
console.log('\nLazy chunks (loaded on demand), gzip');
for (const r of rows) console.log(`  ${r.name.padEnd(40)} ${kb(r.gzip).padStart(7)} KB   (raw ${kb(r.raw)} KB)`);

// Deploy contract (CSP `script-src 'self'`, no remote assets): checked on every size run.
const problems = [];
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('inline <script> in index.html');
if (/\son[a-z]+\s*=/i.test(html)) problems.push('inline event handler in index.html');
for (const [file, text] of [['index.html', html], ...assets.filter((a) => a.name.endsWith('.css')).map((a) => [a.name, readFileSync(a.path, 'utf8')])]) {
  const remote = text.match(/(?:src|href|url\()\s*=?\s*["']?https?:\/\/[^"')\s>]+/gi);
  if (remote) problems.push(`remote asset in ${file}: ${remote[0]}`);
}
const big = rows.find((r) => r.gzip / 1024 > BUDGET_CHUNK_KB && r.name.endsWith('.js'));
if (big) problems.push(`chunk ${big.name} is ${kb(big.gzip)} KB gzip (> ${BUDGET_CHUNK_KB} KB)`);
if (problems.length) {
  console.error(['', 'FAIL:', ...problems.map((p) => `  ${p}`)].join('\n'));
  process.exit(1);
}

if (initialJs / 1024 > BUDGET_INITIAL_JS_KB) {
  console.error(`\nFAIL: initial JS exceeds ${BUDGET_INITIAL_JS_KB} KB gzip`);
  process.exit(1);
}
console.log('\nOK: within budget');
