// Fails when a bundle (entry + the shared chunks it statically imports) exceeds its budget.
import { readFile } from 'node:fs/promises';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const KB = 1024;
const BUDGETS = { loader: 3, consent: 9, forms: 7, newsletter: 5, survey: 7, items: 14 };

const measure = async (file) => {
  const buf = await readFile(`dist/${file}`);
  return {
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
};

const { modules } = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const targets = { loader: ['loader.js'] };
for (const [name, m] of Object.entries(modules)) targets[name] = [m.file, ...m.deps];

let failed = false;
console.log('bundle       gzip     brotli   budget');
for (const [name, files] of Object.entries(targets)) {
  let gzip = 0;
  let brotli = 0;
  for (const f of files) {
    const s = await measure(f);
    gzip += s.gzip;
    brotli += s.brotli;
  }
  const budget = BUDGETS[name] * KB;
  const bad = gzip > budget || brotli > budget;
  failed ||= bad;
  const kb = (n) => `${(n / KB).toFixed(2)} KB`.padStart(9);
  console.log(`${name.padEnd(12)}${kb(gzip)}${kb(brotli)}  ${BUDGETS[name]} KB ${bad ? 'EXCEEDED' : 'ok'}`);
}
if (failed) {
  console.error('Size budget exceeded');
  process.exit(1);
}
