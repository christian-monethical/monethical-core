import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, buildStored, writeStored } from '../src/consent-core';
import { mountBanner, start } from '../src/consent';
import type { BannerConfig, Boot, ConsentState } from '../src/types';
import { banner, doc, flush } from './fixtures';

const boot = (cfg: BannerConfig): Boot => ({ key: 'pk_live_' + 'a'.repeat(32), api: 'https://edge.example.com', doc: doc({ banner: cfg }) });

function root(): ShadowRoot {
  const holder = Array.from(document.body.children).find((c) => c.shadowRoot);
  if (!holder?.shadowRoot) throw new Error('banner not mounted');
  return holder.shadowRoot;
}
const button = (label: string): HTMLButtonElement => {
  const el = Array.from(root().querySelectorAll('button')).find((b) => b.textContent === label);
  if (!el) throw new Error(`no button ${label}`);
  return el;
};
const dialog = (): HTMLElement | null => root().querySelector('[role=dialog]');

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.cookie = `${STORAGE_KEY}=; Max-Age=0; Path=/`;
  localStorage.clear();
  window.dataLayer = undefined;
  window.Monethical = undefined;
  document.body.replaceChildren();
  fetchMock = vi.fn(() => Promise.resolve(new Response('{"ok":true}', { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('banner UI', () => {
  it.each(['bar-bottom', 'bar-top', 'card-left', 'card-right', 'modal'] as const)('renders layout %s as an accessible dialog', (layout) => {
    mountBanner(document.body, { ...banner, layout }, { preview: false, initial: null, onChoice: () => undefined });
    const dlg = dialog();
    expect(dlg?.classList.contains(layout)).toBe(true);
    expect(dlg?.getAttribute('role')).toBe('dialog');
    expect(dlg?.getAttribute('aria-modal')).toBe(layout === 'modal' ? 'true' : 'false');
    const title = root().getElementById(dlg?.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe('We value your privacy');
    expect(root().getElementById(dlg?.getAttribute('aria-describedby') ?? '')?.textContent).toContain('We use cookies.');
  });

  it('accept and reject have the same prominence and report the choice', () => {
    const seen: ConsentState[] = [];
    mountBanner(document.body, banner, { preview: false, initial: null, onChoice: (c) => seen.push(c) });
    expect(button('Accept all').className).toBe(button('Only necessary').className);
    button('Only necessary').click();
    expect(seen[0]).toEqual({ necessary: true, preferences: false, analytics: false, marketing: false });
    expect(dialog()).toBeNull();
  });

  it('customize shows toggles with necessary locked on, and saves the draft', () => {
    const seen: ConsentState[] = [];
    mountBanner(document.body, banner, { preview: false, initial: null, onChoice: (c) => seen.push(c) });
    button('Customize').click();
    const switches = Array.from(root().querySelectorAll<HTMLInputElement>('input[role=switch]'));
    expect(switches).toHaveLength(4);
    expect(switches[0]?.disabled).toBe(true);
    expect(switches[0]?.checked).toBe(true);
    const analytics = switches[2];
    if (!analytics) throw new Error('missing toggle');
    analytics.checked = true;
    analytics.dispatchEvent(new Event('change'));
    button('Save choices').click();
    expect(seen[0]).toEqual({ necessary: true, preferences: false, analytics: true, marketing: false });
  });

  it('only offers the configured categories; accept all grants only those', () => {
    const seen: ConsentState[] = [];
    mountBanner(document.body, { ...banner, categories: ['necessary', 'analytics'] }, { preview: false, initial: null, onChoice: (c) => seen.push(c) });
    button('Accept all').click();
    expect(seen[0]).toEqual({ necessary: true, preferences: false, analytics: true, marketing: false });
  });

  it('shows the reopen badge after a choice and reopens the preferences panel', () => {
    const handle = mountBanner(document.body, banner, { preview: false, initial: null, onChoice: () => undefined });
    expect(root().querySelector<HTMLElement>('.badge')?.hidden).toBe(true);
    button('Accept all').click();
    const badge = root().querySelector<HTMLElement>('.badge');
    expect(badge?.hidden).toBe(false);
    expect(badge?.getAttribute('aria-label')).toBe('Cookie settings');
    badge?.click();
    expect(root().querySelectorAll('input[role=switch]')).toHaveLength(4);
    handle.destroy();
  });

  it('has no badge when disabled', () => {
    mountBanner(document.body, { ...banner, show_reopen_badge: false }, { preview: false, initial: null, onChoice: () => undefined });
    button('Accept all').click();
    expect(root().querySelector<HTMLElement>('.badge')?.hidden).toBe(true);
  });

  it('starts closed (badge only) when a choice already exists', () => {
    mountBanner(document.body, banner, { preview: false, initial: { necessary: true, preferences: false, analytics: false, marketing: false }, onChoice: () => undefined });
    expect(dialog()).toBeNull();
    expect(root().querySelector<HTMLElement>('.badge')?.hidden).toBe(false);
  });

  it('ESC steps back from preferences, and closes a reopened panel', () => {
    mountBanner(document.body, banner, { preview: false, initial: null, onChoice: () => undefined });
    button('Customize').click();
    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root().querySelectorAll('input[role=switch]')).toHaveLength(0);
    expect(dialog()).not.toBeNull();
    // without a decision the banner cannot be dismissed with ESC
    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog()).not.toBeNull();
    button('Accept all').click();
    root().querySelector<HTMLElement>('.badge')?.click();
    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog()).toBeNull();
  });

  it('traps focus inside the modal', () => {
    mountBanner(document.body, { ...banner, layout: 'modal' }, { preview: false, initial: null, onChoice: () => undefined });
    const buttons = Array.from(root().querySelectorAll('button')).filter((b) => !b.classList.contains('badge'));
    const last = buttons[buttons.length - 1];
    const first = root().querySelector('a');
    const focusFirst = vi.spyOn(first as HTMLAnchorElement, 'focus');
    const focusLast = vi.spyOn(last as HTMLElement, 'focus');
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last?.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(focusFirst).toHaveBeenCalled();
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    first?.dispatchEvent(back);
    expect(focusLast).toHaveBeenCalled();
  });

  it('renders https logo/privacy links only', () => {
    mountBanner(document.body, { ...banner, logo_url: 'javascript:alert(1)', privacy_url: 'http://insecure.example.com' }, { preview: false, initial: null, onChoice: () => undefined });
    expect(root().querySelector('img')).toBeNull();
    expect(root().querySelector('a')).toBeNull();
  });

  it('preview mode positions inside the host', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    mountBanner(host, banner, { preview: true, initial: null, onChoice: () => undefined });
    expect(host.firstElementChild?.shadowRoot?.querySelector('.pv')).not.toBeNull();
  });
});

describe('controller', () => {
  it('sets Consent Mode defaults first, then persists, updates, and sends proof', async () => {
    start(doc({ banner }), boot(banner));
    const dl = (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
    expect(dl[0]?.slice(0, 2)).toEqual(['consent', 'default']);
    button('Accept all').click();
    expect((window.dataLayer ?? []).some((a) => Array.from(a as ArrayLike<unknown>)[1] === 'update')).toBe(true);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    expect(stored.banner_version).toBe(3);
    expect(document.cookie).toContain(STORAGE_KEY);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://edge.example.com/public/pk_live_${'a'.repeat(32)}/consent`);
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ banner_version: 3, preferences: true, analytics: true, marketing: true });
    expect(String(body.visitor_id)).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });

  it('does not touch Consent Mode when disabled', () => {
    const cfg = { ...banner, google_consent_mode: false };
    start(doc({ banner: cfg }), boot(cfg));
    button('Accept all').click();
    expect(window.dataLayer ?? []).toHaveLength(0);
  });

  it('retries the proof once, then reports through an event', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')));
    const errors: unknown[] = [];
    window.addEventListener('monethical:error', (e) => errors.push((e as CustomEvent).detail));
    start(doc({ banner }), boot(banner));
    button('Accept all').click();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errors).toHaveLength(1);
  });

  it('honors a stored valid choice: no banner, gated scripts run, same visitor id reused', async () => {
    const stored = buildStored({ necessary: true, preferences: false, analytics: true, marketing: false }, 3, 180, 'visitor_ABCDEFGH1', Date.now());
    writeStored(stored);
    const gated = document.createElement('iframe');
    gated.setAttribute('data-monethical-category', 'analytics');
    gated.setAttribute('data-src', 'https://stats.example.com/frame');
    document.body.appendChild(gated);
    const events: ConsentState[] = [];
    window.addEventListener('monethical:consent', (e) => events.push((e as CustomEvent<ConsentState>).detail));
    start(doc({ banner }), boot(banner));
    expect(dialog()).toBeNull();
    expect(gated.getAttribute('src')).toBe('https://stats.example.com/frame');
    expect(window.Monethical?.consent.get()).toEqual({ necessary: true, preferences: false, analytics: true, marketing: false });
    expect(events).toHaveLength(1);
    const kinds = (window.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>)[1]);
    expect(kinds.slice(0, 2)).toEqual(['default', 'update']);
    root().querySelector<HTMLElement>('.badge')?.click();
    button('Accept all').click();
    await flush();
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as Record<string, unknown>;
    expect(body.visitor_id).toBe('visitor_ABCDEFGH1');
  });

  it('asks again after the banner version increased', () => {
    writeStored(buildStored({ necessary: true, preferences: true, analytics: true, marketing: true }, 2, 180, 'visitor_ABCDEFGH1', Date.now()));
    start(doc({ banner }), boot(banner));
    expect(dialog()).not.toBeNull();
    expect(window.Monethical?.consent.get()).toBeNull();
  });

  it('asks again after the consent expired', () => {
    writeStored(buildStored({ necessary: true, preferences: true, analytics: true, marketing: true }, 3, 180, 'visitor_ABCDEFGH1', Date.now() - 181 * 86_400_000));
    start(doc({ banner }), boot(banner));
    expect(dialog()).not.toBeNull();
  });

  it('exposes get/open/onChange and the monethical:consent event', () => {
    window.Monethical = { v: 1, consent: { get: () => null, open: () => undefined, onChange: () => () => undefined } };
    const early: ConsentState[] = [];
    // listener registered through the loader's pre-load queue
    window.Monethical.consent.l = [(c) => early.push(c)];
    start(doc({ banner }), boot(banner));
    const api = window.Monethical.consent;
    const later: ConsentState[] = [];
    const off = api.onChange((c) => later.push(c));
    const events: ConsentState[] = [];
    window.addEventListener('monethical:consent', (e) => events.push((e as CustomEvent<ConsentState>).detail));
    button('Only necessary').click();
    expect(early).toHaveLength(1);
    expect(later).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(api.get()).toEqual({ necessary: true, preferences: false, analytics: false, marketing: false });
    off();
    api.open();
    expect(root().querySelectorAll('input[role=switch]')).toHaveLength(4);
    button('Accept all').click();
    expect(later).toHaveLength(1);
  });

  it('a throwing listener cannot break the page', () => {
    start(doc({ banner }), boot(banner));
    window.Monethical?.consent.onChange(() => {
      throw new Error('boom');
    });
    expect(() => { button('Accept all').click(); }).not.toThrow();
  });
});
