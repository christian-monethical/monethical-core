import createClient from 'openapi-fetch';
import { sessionExpired, tokens } from '../auth/session';
import { config } from '../env';
import { createAuthedFetch } from './fetcher';
import type { paths } from './schema';

export const authedFetch = createAuthedFetch({
  getToken: () => tokens.getAccessToken(),
  refresh: () => tokens.refresh(),
  onSessionExpired: sessionExpired,
});

/** Typed client generated from docs/openapi/console.json. Errors surface as thrown ApiError. */
export const api = createClient<paths>({ baseUrl: config.apiBase, fetch: authedFetch });

/** Unwrap a successful response body (the fetcher already threw on every non-2xx). */
export function body<T>(res: { data?: T }): T {
  if (res.data === undefined) throw new Error('Empty response body');
  return res.data;
}

/** Authenticated download of a text file, returned as a Blob. */
export async function download(path: string): Promise<Blob> {
  const res = await authedFetch(new Request(`${config.apiBase}${path}`));
  return res.blob();
}
