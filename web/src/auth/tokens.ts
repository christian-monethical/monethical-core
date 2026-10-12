import { refreshTokens, TokenError } from './cognito';
import type { CognitoConfig, TokenResponse } from './cognito';

const RT_KEY = 'mc.rt';
const SKEW_MS = 60_000;

interface Memory {
  access: string;
  id?: string;
  expiresAt: number;
}

/**
 * Token store. The access token lives in memory only; the refresh token in sessionStorage
 * (cleared when the tab closes). Nothing is ever written to localStorage.
 */
export function createTokenStore(cfg: CognitoConfig, now: () => number = Date.now) {
  let memory: Memory | null = null;
  let inflight: Promise<string | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(signedIn: boolean) => void>();

  const readRefresh = (): string | null => {
    try {
      return sessionStorage.getItem(RT_KEY);
    } catch {
      return null;
    }
  };
  const writeRefresh = (value: string | null): void => {
    try {
      if (value) sessionStorage.setItem(RT_KEY, value);
      else sessionStorage.removeItem(RT_KEY);
    } catch {
      /* storage unavailable: the session lasts until reload */
    }
  };
  const emit = (): void => listeners.forEach((l) => l(memory !== null));

  function schedule(): void {
    clearTimeout(timer);
    if (!memory) return;
    const delay = Math.max(memory.expiresAt - now() - SKEW_MS, 5_000);
    timer = setTimeout(() => void refresh(), delay);
  }

  function accept(t: TokenResponse): void {
    memory = { access: t.access_token, id: t.id_token ?? memory?.id, expiresAt: now() + t.expires_in * 1000 };
    if (t.refresh_token) writeRefresh(t.refresh_token);
    schedule();
    emit();
  }

  function clear(): void {
    memory = null;
    clearTimeout(timer);
    writeRefresh(null);
    emit();
  }

  /** Refresh once; concurrent callers share the same request. Resolves to the new access token or null. */
  function refresh(): Promise<string | null> {
    const rt = readRefresh();
    if (!rt) return Promise.resolve(null);
    inflight ??= refreshTokens(cfg, rt)
      .then((t) => {
        accept(t);
        return t.access_token;
      })
      .catch((e: unknown) => {
        if (e instanceof TokenError && e.fatal) clear();
        return null;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  return {
    accept,
    clear,
    refresh,
    hasRefreshToken: (): boolean => readRefresh() !== null,
    idToken: (): string | undefined => memory?.id,
    subscribe(l: (signedIn: boolean) => void): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** A valid access token, refreshed transparently when it is about to expire. */
    async getAccessToken(): Promise<string | null> {
      if (memory && memory.expiresAt - now() > SKEW_MS) return memory.access;
      return refresh();
    },
  };
}

export type TokenStore = ReturnType<typeof createTokenStore>;
