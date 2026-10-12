/**
 * Tiny in-memory query store: request de-duplication + stale-while-revalidate.
 * Entries are keyed by string; invalidation is by key prefix.
 */
export interface Entry<T = unknown> {
  data?: T;
  error?: unknown;
  updatedAt: number;
  /** Set by invalidate(); mounted queries refetch when they see it. */
  stale?: boolean;
  inflight?: Promise<T>;
}

type Listener = () => void;

export function createQueryStore(now: () => number = Date.now) {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<Listener>>();

  const notify = (key: string): void => listeners.get(key)?.forEach((l) => l());
  const entry = (key: string): Entry => {
    let e = entries.get(key);
    if (!e) {
      e = { updatedAt: 0 };
      entries.set(key, e);
    }
    return e;
  };

  /** Fetch unless a request is in flight; callers share the same promise. */
  function fetchKey<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const e = entry(key) as Entry<T>;
    if (e.inflight) return e.inflight;
    e.stale = false;
    const p = fetcher()
      .then((data) => {
        e.data = data;
        e.error = undefined;
        e.updatedAt = now();
        return data;
      })
      .catch((error: unknown) => {
        e.error = error;
        throw error;
      })
      .finally(() => {
        e.inflight = undefined;
        notify(key);
      });
    e.inflight = p;
    notify(key);
    return p;
  }

  return {
    get: <T>(key: string): Entry<T> | undefined => entries.get(key) as Entry<T> | undefined,
    fetch: fetchKey,
    isStale: (key: string, staleMs: number): boolean => {
      const e = entries.get(key);
      return !e || e.data === undefined || e.stale === true || now() - e.updatedAt > staleMs;
    },
    /** Replace cached data (optimistic updates, or after a mutation returned fresh data). */
    set<T>(key: string, data: T): void {
      const e = entry(key);
      e.data = data;
      e.error = undefined;
      e.updatedAt = now();
      notify(key);
    },
    /** Mark everything under a prefix stale; mounted subscribers refetch. */
    invalidate(prefix: string): void {
      for (const [key, e] of entries) {
        if (key.startsWith(prefix)) {
          e.stale = true;
          notify(key);
        }
      }
    },
    subscribe(key: string, l: Listener): () => void {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(l);
      return () => {
        set.delete(l);
      };
    },
    clear(): void {
      entries.clear();
    },
  };
}

export const store = createQueryStore();
