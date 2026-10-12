import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  buildStored,
  consentModeDefault,
  consentModeUpdate,
  gate,
  isValid,
  newVisitorId,
  parseStored,
  readStored,
  toChoice,
  writeStored,
} from '../src/consent-core';

const choice = { necessary: true, preferences: false, analytics: true, marketing: false } as const;
const ID = 'abcdefgh12345678';

beforeEach(() => {
  document.cookie = `${STORAGE_KEY}=; Max-Age=0; Path=/`;
  localStorage.clear();
  window.dataLayer = undefined;
  document.body.replaceChildren();
});

describe('state machine (expiry and version)', () => {
  const stored = buildStored(choice, 3, 180, ID, 1_000);

  it('is valid until it expires', () => {
    expect(stored.expires).toBe(1_000 + 180 * 86_400_000);
    expect(isValid(stored, 3, 2_000)).toBe(true);
    expect(isValid(stored, 3, stored.expires)).toBe(false);
    expect(isValid(stored, 3, stored.expires + 1)).toBe(false);
  });

  it('re-asks when the banner version increases, not when it stays or decreases', () => {
    expect(isValid(stored, 4, 2_000)).toBe(false);
    expect(isValid(stored, 3, 2_000)).toBe(true);
    expect(isValid(stored, 2, 2_000)).toBe(true);
  });

  it('treats missing consent as invalid', () => {
    expect(isValid(null, 1, 0)).toBe(false);
  });
});

describe('persistence', () => {
  it('writes cookie and localStorage and reads them back', () => {
    const s = buildStored(choice, 2, 30, ID, Date.now());
    writeStored(s);
    expect(document.cookie).toContain(STORAGE_KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"banner_version":2');
    expect(readStored()).toEqual(s);
    expect(toChoice(s.categories)).toEqual(choice);
  });

  it('falls back to localStorage when the cookie is gone', () => {
    const s = buildStored(choice, 2, 30, ID, Date.now());
    writeStored(s);
    document.cookie = `${STORAGE_KEY}=; Max-Age=0; Path=/`;
    expect(readStored()).toEqual(s);
  });

  it('rejects tampered or malformed content', () => {
    expect(parseStored(null)).toBeNull();
    expect(parseStored({ banner_version: 'x' })).toBeNull();
    expect(parseStored({ banner_version: 1, updated: 1, expires: 2, visitor_id: 'bad id!', categories: {} })).toBeNull();
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(readStored()).toBeNull();
  });

  it('generates ids matching the backend pattern', () => {
    for (let i = 0; i < 20; i += 1) expect(newVisitorId()).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(newVisitorId()).not.toBe(newVisitorId());
  });
});

describe('Google Consent Mode v2', () => {
  const entries = (): unknown[][] => (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));

  it('denies all seven signals by default, as an arguments object', () => {
    consentModeDefault(500);
    const [first] = window.dataLayer ?? [];
    expect(Object.prototype.toString.call(first)).toBe('[object Arguments]');
    const [cmd, kind, state] = entries()[0] ?? [];
    expect([cmd, kind]).toEqual(['consent', 'default']);
    expect(state).toEqual({
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'denied',
      wait_for_update: 500,
    });
  });

  it('omits wait_for_update when not needed', () => {
    consentModeDefault(0);
    expect((entries()[0]?.[2] as Record<string, unknown>).wait_for_update).toBeUndefined();
  });

  it('maps categories to signals on update', () => {
    consentModeUpdate({ necessary: true, preferences: true, analytics: false, marketing: true });
    const state = entries()[0]?.[2] as Record<string, string>;
    expect(entries()[0]?.slice(0, 2)).toEqual(['consent', 'update']);
    expect(state).toMatchObject({
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'denied',
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted',
    });
  });

  it('keeps pre-existing dataLayer content', () => {
    window.dataLayer = [{ event: 'x' }];
    consentModeDefault(0);
    expect(window.dataLayer[0]).toEqual({ event: 'x' });
    expect(window.dataLayer).toHaveLength(2);
  });
});

describe('script gating', () => {
  const all = { necessary: true, preferences: true, analytics: true, marketing: true } as const;
  const setup = (): void => {
    const add = (tag: string, attrs: Record<string, string>, text = ''): void => {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.textContent = text;
      document.body.appendChild(el);
    };
    add('script', { type: 'text/plain', 'data-monethical-category': 'analytics', 'data-src': 'https://stats.example.com/a.js', async: '', id: 'a' });
    add('script', { type: 'text/plain', 'data-monethical-category': 'marketing' }, 'window.__m = 1;');
    add('script', { type: 'text/plain', 'data-monethical-category': 'analytics', 'data-src': 'javascript:alert(1)' });
    add('iframe', { 'data-monethical-category': 'marketing', 'data-src': 'https://video.example.com/embed' });
  };

  it('activates nothing without consent', () => {
    setup();
    gate(null);
    expect(document.querySelectorAll('script[type="text/plain"]')).toHaveLength(3);
    expect(document.querySelector('iframe')?.hasAttribute('src')).toBe(false);
  });

  it('activates only the consented categories', () => {
    setup();
    gate({ necessary: true, preferences: false, analytics: true, marketing: false });
    const live = document.querySelector<HTMLScriptElement>('script#a');
    expect(live?.getAttribute('src')).toBe('https://stats.example.com/a.js');
    expect(live?.hasAttribute('type')).toBe(false);
    expect(live?.hasAttribute('async')).toBe(true);
    expect(live?.hasAttribute('data-monethical-category')).toBe(false);
    expect(document.querySelectorAll('script[type="text/plain"]')).toHaveLength(1);
    expect(document.querySelector('iframe')?.hasAttribute('src')).toBe(false);
  });

  it('activates inline scripts and iframes, refuses non-http data-src, and is idempotent', () => {
    setup();
    gate(all);
    gate(all);
    const inline = Array.from(document.scripts).find((s) => s.textContent === 'window.__m = 1;');
    expect(inline).toBeDefined();
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('https://video.example.com/embed');
    expect(Array.from(document.scripts).filter((s) => s.getAttribute('src')?.startsWith('javascript'))).toHaveLength(0);
  });

  it('removes iframe sources again when consent is withdrawn', () => {
    setup();
    gate(all);
    gate({ necessary: true, preferences: false, analytics: false, marketing: false });
    expect(document.querySelector('iframe')?.hasAttribute('src')).toBe(false);
  });

  it('ignores unknown categories', () => {
    const frame = document.createElement('iframe');
    frame.setAttribute('data-monethical-category', 'weird');
    frame.setAttribute('data-src', 'https://a.example.com');
    document.body.appendChild(frame);
    gate(all);
    expect(frame.hasAttribute('src')).toBe(false);
  });
});
