import { describe, expect, it } from 'vitest';
import { safeUrl } from '../src/dom';
import { DEFAULT_SURFACE, contrast, readable, sanitizeSurface, tokenVars } from '../src/tokens';

describe('sanitizeSurface', () => {
  it('keeps valid tokens (lower-casing hex)', () => {
    const s = sanitizeSurface({ ...DEFAULT_SURFACE, accent: '#FF00AA', radius: 8, font: 'serif', density: 'compact' });
    expect(s).toMatchObject({ accent: '#ff00aa', radius: 8, font: 'serif', density: 'compact' });
  });

  it('accepts 8-digit hex', () => {
    expect(sanitizeSurface({ border: '#11223344' }).border).toBe('#11223344');
  });

  it('falls back to defaults for anything unexpected', () => {
    const s = sanitizeSurface({
      background: 'url(javascript:alert(1))',
      text: 'red;background:url(x)',
      accent: '#12345',
      radius: 9999,
      elevation: 'huge',
      density: '__proto__',
      font: 'Comic Sans',
    });
    expect(s.background).toBe(DEFAULT_SURFACE.background);
    expect(s.text).toBe(DEFAULT_SURFACE.text);
    expect(s.accent).toBe(DEFAULT_SURFACE.accent);
    expect(s.radius).toBe(32);
    expect(s.elevation).toBe('medium');
    expect(s.density).toBe('comfortable');
    expect(s.font).toBe('system');
  });

  it('survives non-objects', () => {
    expect(sanitizeSurface(null)).toEqual(DEFAULT_SURFACE);
    expect(sanitizeSurface('x')).toEqual(DEFAULT_SURFACE);
  });
});

describe('readable colors', () => {
  it('keeps a readable pair and repairs an unreadable one', () => {
    expect(readable('#000000', '#ffffff')).toBe('#000000');
    expect(readable('#fafafa', '#ffffff')).toBe('#000000');
    expect(readable('#111111', '#000000')).toBe('#ffffff');
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('derives accent_text when the configured one is unreadable', () => {
    const vars = tokenVars({ accent: '#ffffff', accent_text: '#fefefe' });
    expect(vars['--at']).toBe('#000000');
  });

  it('only emits whitelisted custom properties with safe values', () => {
    for (const value of Object.values(tokenVars({ font: '};x{', radius: 'NaN' }))) {
      expect(value).not.toMatch(/[;{}<>]/);
    }
  });
});

describe('safeUrl', () => {
  it('accepts https only and rejects attribute breakers', () => {
    expect(safeUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    for (const bad of ['http://a.com', 'javascript:alert(1)', 'data:text/html,x', 'https://a.com/"onload=', 'https://a.com/ x', '//a.com', 5, null]) {
      expect(safeUrl(bad)).toBeNull();
    }
  });
});
