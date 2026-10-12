import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/loader';
import type { SiteDoc } from '../src/types';
import { banner, doc, flush, form } from './fixtures';

const KEY = `pk_live_${'a'.repeat(32)}`;

function scriptTag(attrs: Record<string, string> = {}): HTMLScriptElement {
  const s = document.createElement('script');
  s.src = 'https://edge.example.com/w/loader.js';
  s.dataset.siteKey = KEY;
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  return s;
}

const loaded: string[] = [];
const mount = vi.fn();
const start = vi.fn();
const load = (url: string): Promise<{ mount: typeof mount; start: typeof start }> => {
  loaded.push(url);
  return Promise.resolve({ mount, start });
};

let fetchMock: ReturnType<typeof vi.fn>;
const stops: (() => void)[] = [];
const start_ = (script: HTMLScriptElement | null, loader: Parameters<typeof run>[1] = load): void => {
  stops.push(run(script, loader));
};
const serve = (d: SiteDoc | number): void => {
  fetchMock.mockImplementation(() =>
    Promise.resolve(typeof d === 'number' ? new Response('{}', { status: d }) : new Response(JSON.stringify(d), { status: 200 })),
  );
};

beforeEach(() => {
  loaded.length = 0;
  mount.mockReset();
  start.mockReset();
  window.Monethical = undefined;
  document.body.replaceChildren();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.unstubAllGlobals();
});

describe('loader', () => {
  it('fetches the site document from the script origin with the default cache mode', async () => {
    serve(doc());
    start_(scriptTag(), load);
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(`https://edge.example.com/config/${KEY}/site.json`, { cache: 'default', credentials: 'omit' });
    expect(loaded).toEqual([]);
  });

  it('honors data-api-base and data-base', async () => {
    serve(doc({ banner }));
    start_(scriptTag({ 'data-api-base': 'https://api.example.com/', 'data-base': 'https://cdn.example.com/x' }), load);
    await flush();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`https://api.example.com/config/${KEY}/site.json`);
    expect(loaded).toEqual(['https://cdn.example.com/x/consent-AAAA.js']);
  });

  it('imports consent only when the document has a banner, from the loader base URL', async () => {
    serve(doc({ banner }));
    start_(scriptTag(), load);
    await flush();
    expect(loaded).toEqual(['https://edge.example.com/w/consent-AAAA.js']);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[1]).toMatchObject({ key: KEY, api: 'https://edge.example.com' });
  });

  it('imports only the modules whose containers exist, in parallel, once each', async () => {
    document.body.innerHTML = `
      <div data-monethical-widget="contact-form" data-form-id="f1"></div>
      <div data-monethical-widget="contact-form" data-form-id="f2"></div>
      <div data-monethical-widget="survey" data-id="s1"></div>`;
    serve(doc({ forms: [form] }));
    start_(scriptTag(), load);
    await flush();
    expect(loaded.sort()).toEqual(['https://edge.example.com/w/forms-BBBB.js', 'https://edge.example.com/w/survey-DDDD.js']);
    expect(mount).toHaveBeenCalledTimes(3);
  });

  it('picks up containers added later, without remounting known ones', async () => {
    serve(doc({ forms: [form] }));
    start_(scriptTag(), load);
    await flush();
    expect(mount).not.toHaveBeenCalled();
    const late = document.createElement('div');
    late.setAttribute('data-monethical-widget', 'newsletter');
    const wrap = document.createElement('section');
    const nested = document.createElement('div');
    nested.setAttribute('data-monethical-widget', 'contact-form');
    wrap.appendChild(nested);
    document.body.append(late, wrap);
    await flush();
    expect(mount).toHaveBeenCalledTimes(2);
    document.body.appendChild(late);
    await flush();
    expect(mount).toHaveBeenCalledTimes(2);
  });

  it('ignores unknown widget names', async () => {
    document.body.innerHTML = '<div data-monethical-widget="evil"></div><div data-monethical-widget="constructor"></div>';
    serve(doc());
    start_(scriptTag(), load);
    await flush();
    expect(loaded).toEqual([]);
  });

  it('is idempotent: a second injection does nothing', async () => {
    serve(doc());
    start_(scriptTag(), load);
    start_(scriptTag(), load);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a site key', () => {
    const s = scriptTag();
    delete s.dataset.siteKey;
    start_(s, load);
    start_(null, load);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.Monethical).toBeUndefined();
  });

  it('exposes a queueing consent stub immediately', async () => {
    serve(doc());
    start_(scriptTag(), load);
    const api = window.Monethical?.consent;
    expect(api?.get()).toBeNull();
    const cb = vi.fn();
    const off = api?.onChange(cb);
    api?.open();
    expect(api?.o).toBe(true);
    expect(api?.l).toEqual([cb]);
    off?.();
    expect(api?.l).toEqual([]);
    await flush();
  });

  it('never throws into the page: failures become monethical:error events', async () => {
    const errors: string[] = [];
    window.addEventListener('monethical:error', (e) => errors.push((e as CustomEvent<{ message: string }>).detail.message));
    serve(404);
    expect(() => { start_(scriptTag(), load); }).not.toThrow();
    await flush();
    expect(errors).toEqual(['config 404']);

    window.Monethical = undefined;
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')));
    start_(scriptTag(), load);
    await flush();
    expect(errors).toHaveLength(2);

    window.Monethical = undefined;
    serve(doc({ banner }));
    start_(scriptTag(), () => Promise.reject(new Error('chunk failed')));
    await flush();
    expect(errors).toContain('chunk failed');

    window.Monethical = undefined;
    expect(() => { start_(scriptTag({ 'data-base': 'x' }), () => { throw new Error('sync'); }); }).not.toThrow();
  });

  it('makes no console noise', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    serve(404);
    start_(scriptTag(), load);
    await flush();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
