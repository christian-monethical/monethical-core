import { toApiError, networkError } from './errors';

export interface FetcherDeps {
  getToken: () => Promise<string | null>;
  refresh: () => Promise<string | null>;
  onSessionExpired: () => void;
  fetchImpl?: (request: Request) => Promise<Response>;
}

/**
 * Authenticated fetch used by the OpenAPI client and by raw downloads.
 * - attaches the bearer token
 * - on 401 refreshes once and retries, otherwise asks for a new login
 * - turns every non-2xx into an ApiError (typed `{error:{code,message,details}}` envelope)
 */
export function createAuthedFetch(deps: FetcherDeps) {
  const doFetch = deps.fetchImpl ?? ((r: Request): Promise<Response> => fetch(r));

  async function send(request: Request, token: string | null): Promise<Response> {
    const req = request.clone();
    if (token) req.headers.set('Authorization', `Bearer ${token}`);
    try {
      return await doFetch(req);
    } catch {
      throw networkError();
    }
  }

  return async function authedFetch(request: Request): Promise<Response> {
    let res = await send(request, await deps.getToken());
    if (res.status === 401) {
      const fresh = await deps.refresh();
      if (fresh) res = await send(request, fresh);
      if (res.status === 401) {
        deps.onSessionExpired();
        throw await toApiError(res);
      }
    }
    if (!res.ok) throw await toApiError(res);
    return res;
  };
}
