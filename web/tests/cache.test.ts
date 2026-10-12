import { describe, expect, it, vi } from 'vitest';
import { createQueryStore, store } from '../src/api/cache';
import { optimistic, patchCache } from '../src/api/hooks';

describe('query store', () => {
  it('de-duplicates concurrent requests for the same key', async () => {
    const s = createQueryStore();
    const fetcher = vi.fn().mockResolvedValue('data');
    const [a, b] = await Promise.all([s.fetch('k', fetcher), s.fetch('k', fetcher)]);
    expect([a, b]).toEqual(['data', 'data']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('is stale-while-revalidate: old data stays readable during a refetch', async () => {
    let t = 0;
    const s = createQueryStore(() => t);
    await s.fetch('k', async () => 'v1');
    expect(s.isStale('k', 1000)).toBe(false);
    t = 5000;
    expect(s.isStale('k', 1000)).toBe(true);
    let release: (v: string) => void = () => undefined;
    const pending = s.fetch('k', () => new Promise<string>((r) => (release = r)));
    expect(s.get<string>('k')?.data).toBe('v1'); // stale value still served
    expect(s.get<string>('k')?.inflight).toBeDefined();
    release('v2');
    await pending;
    expect(s.get<string>('k')?.data).toBe('v2');
    expect(s.isStale('k', 1000)).toBe(false);
  });

  it('invalidates by prefix and notifies subscribers', async () => {
    const s = createQueryStore();
    await s.fetch('site:1:forms', async () => 1);
    await s.fetch('site:2:forms', async () => 2);
    const listener = vi.fn();
    s.subscribe('site:1:forms', listener);
    s.invalidate('site:1:');
    expect(s.isStale('site:1:forms', 60_000)).toBe(true);
    expect(s.isStale('site:2:forms', 60_000)).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('keeps the error on the entry and lets the next call retry', async () => {
    const s = createQueryStore();
    await expect(s.fetch('k', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(s.get('k')?.error).toBeInstanceOf(Error);
    await expect(s.fetch('k', async () => 'ok')).resolves.toBe('ok');
    expect(s.get('k')?.error).toBeUndefined();
  });
});

describe('optimistic updates', () => {
  it('applies the patch immediately and keeps it on success', async () => {
    store.set('o1', { on: false });
    await optimistic([patchCache<{ on: boolean }>('o1', () => ({ on: true }))], async () => {
      expect(store.get<{ on: boolean }>('o1')?.data).toEqual({ on: true });
    });
    expect(store.get<{ on: boolean }>('o1')?.data).toEqual({ on: true });
  });

  it('rolls back when the request fails', async () => {
    store.set('o2', { on: false });
    await expect(
      optimistic([patchCache<{ on: boolean }>('o2', () => ({ on: true }))], () => Promise.reject(new Error('nope'))),
    ).rejects.toThrow('nope');
    expect(store.get<{ on: boolean }>('o2')?.data).toEqual({ on: false });
  });
});
