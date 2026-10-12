import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTokenStore } from '../src/auth/tokens';

const cfg = { domain: 'auth.example.com', clientId: 'cid' };
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe('token store', () => {
  let now = 1_000_000;
  const clock = (): number => now;
  beforeEach(() => {
    now = 1_000_000;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the access token in memory and the refresh token in sessionStorage only', () => {
    const store = createTokenStore(cfg, clock);
    store.accept({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 });
    expect(sessionStorage.getItem('mc.rt')).toBe('r1');
    expect(localStorage.length).toBe(0);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('a1');
  });

  it('returns the cached token while valid, without calling the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const store = createTokenStore(cfg, clock);
    store.accept({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 });
    await expect(store.getAccessToken()).resolves.toBe('a1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes with the refresh token when the access token is about to expire', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ access_token: 'a2', expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);
    const store = createTokenStore(cfg, clock);
    store.accept({ access_token: 'a1', refresh_token: 'r1', expires_in: 100 });
    now += 50_000; // 50 s left, inside the 60 s skew
    await expect(store.getAccessToken()).resolves.toBe('a2');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://auth.example.com/oauth2/token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('r1');
    expect(sessionStorage.getItem('mc.rt')).toBe('r1'); // Cognito does not rotate it
  });

  it('shares one refresh request between concurrent callers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ access_token: 'a2', expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);
    const store = createTokenStore(cfg, clock);
    sessionStorage.setItem('mc.rt', 'r1');
    const results = await Promise.all([store.getAccessToken(), store.getAccessToken(), store.refresh()]);
    expect(results).toEqual(['a2', 'a2', 'a2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signs out when the refresh token is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, 400)));
    const store = createTokenStore(cfg, clock);
    const listener = vi.fn();
    store.subscribe(listener);
    sessionStorage.setItem('mc.rt', 'r1');
    await expect(store.refresh()).resolves.toBeNull();
    expect(sessionStorage.getItem('mc.rt')).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('keeps the session on transient network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const store = createTokenStore(cfg, clock);
    sessionStorage.setItem('mc.rt', 'r1');
    await expect(store.refresh()).resolves.toBeNull();
    expect(sessionStorage.getItem('mc.rt')).toBe('r1');
  });

  it('schedules a silent refresh before expiry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ access_token: 'a2', expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);
    const store = createTokenStore(cfg, clock);
    store.accept({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 });
    await vi.advanceTimersByTimeAsync(3600 * 1000 - 60_000 + 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
