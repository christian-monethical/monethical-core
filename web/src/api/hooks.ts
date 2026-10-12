import { useCallback, useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { toast } from '../ui/toast';
import { store } from './cache';
import { describeError } from './messages';
import type { Page } from './types';

const DEFAULT_STALE_MS = 30_000;

export interface QueryResult<T> {
  data: T | undefined;
  error: unknown;
  /** First load, nothing to show yet. */
  loading: boolean;
  /** Showing cached data while revalidating. */
  refreshing: boolean;
  refetch: () => Promise<void>;
}

/**
 * Cached query with stale-while-revalidate and request de-duplication.
 * `key` null disables the query. Keys are strings; invalidate by prefix.
 */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, staleMs = DEFAULT_STALE_MS): QueryResult<T> {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (): Promise<void> => {
    if (!key) return;
    try {
      await store.fetch(key, () => fetcherRef.current());
    } catch {
      /* the error is kept on the entry and rendered by the caller */
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    const unsubscribe = store.subscribe(key, () => {
      rerender(0);
      const e = store.get(key);
      if (e?.stale && !e.inflight) void run();
    });
    if (store.isStale(key, staleMs)) void run();
    return unsubscribe;
  }, [key, staleMs, run]);

  const e = key ? store.get<T>(key) : undefined;
  return {
    data: e?.data,
    error: e?.error,
    loading: key !== null && e?.data === undefined && e?.error === undefined,
    refreshing: e?.inflight !== undefined && e.data !== undefined,
    refetch: run,
  };
}

export interface MutationOptions<R> {
  /** Cache key prefixes to invalidate on success. */
  invalidate?: string[];
  onSuccess?: (result: R) => void;
  /** Show the error as a toast (default true). Set false when the form renders field errors itself. */
  toastError?: boolean;
}

export interface Mutation<A, R> {
  run: (arg: A) => Promise<R | undefined>;
  pending: boolean;
  error: unknown;
}

export function useMutation<A, R>(fn: (arg: A) => Promise<R>, opts: MutationOptions<R> = {}): Mutation<A, R> {
  const [state, setState] = useState<{ pending: boolean; error: unknown }>({ pending: false, error: undefined });
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (arg: A): Promise<R | undefined> => {
    setState({ pending: true, error: undefined });
    try {
      const result = await fnRef.current(arg);
      optsRef.current.invalidate?.forEach((p) => store.invalidate(p));
      if (alive.current) setState({ pending: false, error: undefined });
      optsRef.current.onSuccess?.(result);
      return result;
    } catch (error) {
      if (alive.current) setState({ pending: false, error });
      if (optsRef.current.toastError !== false) toast('error', describeError(error));
      return undefined;
    }
  }, []);

  return { run, pending: state.pending, error: state.error };
}

export type Revert = () => void;

/** Optimistically rewrite a cached value; returns the function that restores it. */
export function patchCache<T>(key: string, update: (current: T) => T): Revert {
  const previous = store.get<T>(key)?.data;
  if (previous !== undefined) store.set(key, update(previous));
  return () => {
    if (previous !== undefined) store.set(key, previous);
  };
}

/** Run `action`; if it fails, undo the optimistic patches and rethrow. */
export async function optimistic<R>(reverts: Revert[], action: () => Promise<R>): Promise<R> {
  try {
    return await action();
  } catch (error) {
    reverts.forEach((revert) => revert());
    throw error;
  }
}

export interface Paged<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
  /** Local edit (optimistic updates, deletions). */
  update: (fn: (items: T[]) => T[]) => void;
}

/** Cursor-paginated list. First page is cached (SWR); `loadMore` appends. */
export function usePaged<T>(key: string, load: (cursor: string | undefined) => Promise<Page<T>>): Paged<T> {
  const cached = store.get<Page<T>>(key)?.data;
  const [page, setPage] = useState<Page<T> | undefined>(cached);
  const [error, setError] = useState<unknown>();
  const [loadingMore, setLoadingMore] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  const commit = useCallback(
    (next: Page<T>) => {
      store.set(key, next);
      setPage(next);
    },
    [key],
  );

  const reload = useCallback(async (): Promise<void> => {
    setError(undefined);
    try {
      commit(await store.fetch(`${key}#req`, () => loadRef.current(undefined)));
    } catch (e) {
      setError(e);
    }
  }, [key, commit]);

  useEffect(() => {
    setPage(store.get<Page<T>>(key)?.data);
    void reload();
  }, [key, reload]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!page?.next_cursor) return;
    setLoadingMore(true);
    try {
      const next = await loadRef.current(page.next_cursor);
      commit({ items: [...page.items, ...next.items], next_cursor: next.next_cursor });
    } catch (e) {
      toast('error', describeError(e));
    } finally {
      setLoadingMore(false);
    }
  }, [page, commit]);

  const update = useCallback(
    (fn: (items: T[]) => T[]) => {
      if (page) commit({ ...page, items: fn(page.items) });
    },
    [page, commit],
  );

  return {
    items: page?.items ?? [],
    loading: page === undefined && error === undefined,
    loadingMore,
    error: page === undefined ? error : undefined,
    hasMore: Boolean(page?.next_cursor),
    loadMore,
    reload,
    update,
  };
}
