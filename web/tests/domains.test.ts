import { describe, expect, it } from 'vitest';
import { normalizeDomain, validateDomain } from '../src/features/sites/domains';

describe('domain normalization (mirrors backend normalize_domain)', () => {
  it.each([
    ['https://WWW.Example.com/path?x=1', 'www.example.com'],
    ['example.com:8080', 'example.com'],
    ['  Example.COM.  ', 'example.com'],
    ['*.example.com', '*.example.com'],
    ['http://localhost:5173/', 'localhost'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeDomain(raw)).toBe(expected);
  });

  it('validates hosts like the server', () => {
    expect(validateDomain('www.example.com')).toBeNull();
    expect(validateDomain('*.example.com')).toBeNull();
    expect(validateDomain('localhost')).toBeNull();
    expect(validateDomain('not a domain')).not.toBeNull();
    expect(validateDomain('singlelabel')).not.toBeNull();
    expect(validateDomain('exa_mple.com')).not.toBeNull();
  });
});
