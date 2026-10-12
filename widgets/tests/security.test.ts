import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');
const FORBIDDEN = [
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /insertAdjacentHTML/,
  /document\.write/,
  /\beval\s*\(/,
  /new Function\s*\(/,
  /createContextualFragment/,
  /DOMParser/,
  /\.srcdoc\b/,
  /javascript:/,
  /setAttribute\(\s*['"]on/,
];

describe('forbidden DOM sinks', () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));
  it('finds the sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });
  for (const file of files) {
    it(`${file} uses no unsafe sink`, () => {
      const code = readFileSync(join(SRC, file), 'utf8');
      for (const pattern of FORBIDDEN) expect(code, `${file} matches ${String(pattern)}`).not.toMatch(pattern);
    });
  }
});
