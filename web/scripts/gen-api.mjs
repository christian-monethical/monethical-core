// Generates src/api/schema.d.ts from ../docs/openapi/console.json.
// Unreferenced schemas with dangling $refs (e.g. ResponseValidationError) are dropped first,
// because openapi-typescript refuses to bundle a spec with unresolved references.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const spec = JSON.parse(readFileSync(new URL('../../docs/openapi/console.json', import.meta.url), 'utf8'));
const schemas = spec.components?.schemas ?? {};
const text = (o) => JSON.stringify(o);
for (const [name, schema] of Object.entries(schemas)) {
  const refs = [...text(schema).matchAll(/#\/components\/schemas\/([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const dangling = refs.some((r) => !(r in schemas));
  const used = text({ ...spec, components: { ...spec.components, schemas: {} } }).includes(`#/components/schemas/${name}"`);
  if (dangling && !used) delete schemas[name];
}
const tmp = join(mkdtempSync(join(tmpdir(), 'mc-api-')), 'console.json');
writeFileSync(tmp, JSON.stringify(spec));
execFileSync(process.execPath, ['node_modules/openapi-typescript/bin/cli.js', tmp, '-o', 'src/api/schema.d.ts'], { stdio: 'inherit' });
