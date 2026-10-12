import type { Boot } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Public API client bound to one site key. Paths are relative to `/public/<key>`. */
export interface Api {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown, opts?: { keepalive?: boolean }): Promise<T>;
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: 'omit' });
  } catch {
    throw new ApiError(0, 'network', 'network');
  }
  const body = (await res.json().catch(() => null)) as (ErrorBody & T) | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'error', body?.error?.message ?? '', body?.error?.details);
  }
  return body as T;
}

export function createApi(origin: string, key: string): Api {
  const base = `${origin.replace(/\/+$/, '')}/public/${encodeURIComponent(key)}`;
  return {
    get: (path) => request(base + path, { method: 'GET', headers: { accept: 'application/json' } }),
    post: (path, body, opts) =>
      request(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: opts?.keepalive,
      }),
  };
}

export function apiFor(boot: Boot): Api {
  return createApi(boot.api, boot.key);
}
