// Builds content-hashed ES modules (shared code in hashed chunks), then the stable loader
// with the {module -> file} manifest injected at build time.
import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const MODULES = ['consent', 'forms', 'newsletter', 'survey', 'items'];
const common = { bundle: true, minify: true, target: 'es2022', charset: 'utf8', legalComments: 'none', logLevel: 'warning' };

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const result = await build({
  ...common,
  entryPoints: Object.fromEntries(MODULES.map((m) => [m, `src/${m}.ts`])),
  outdir: 'dist',
  format: 'esm',
  splitting: true,
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  metafile: true,
});

const outputs = result.metafile.outputs;
const staticImports = (file) =>
  outputs[file].imports.filter((i) => i.kind === 'import-statement').map((i) => i.path);
const closure = (file, seen = new Set()) => {
  for (const dep of staticImports(file)) {
    if (!seen.has(dep)) {
      seen.add(dep);
      closure(dep, seen);
    }
  }
  return seen;
};

const manifest = {};
const detail = {};
for (const [file, meta] of Object.entries(outputs)) {
  if (!meta.entryPoint) continue;
  const name = basename(meta.entryPoint, '.ts');
  manifest[name] = basename(file);
  detail[name] = { file: basename(file), deps: [...closure(file)].map((d) => basename(d)) };
}

await build({
  ...common,
  entryPoints: ['src/loader.ts'],
  outfile: 'dist/loader.js',
  format: 'iife',
  define: { __MANIFEST__: JSON.stringify(manifest) },
});

await writeFile('dist/manifest.json', `${JSON.stringify({ modules: detail }, null, 2)}\n`);
console.log('built', Object.values(manifest).join(', '));
