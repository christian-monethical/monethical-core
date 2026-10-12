import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/errors';
import { createAuthedFetch } from '../src/api/fetcher';
import { describeError } from '../src/api/messages';

const json = (body: unknown, status: number): Response => new Response(JSON.stringify(body), { status });
const req = (): Request =>
  new Request('https://x.test/api/v1/sites', { method: 'POST', body: '{"a":1}', headers: { 'Content-Type': 'application/json' } });

function setup(responses: Response[], tokens: { first: string | null; fresh: string | null } = { first: 't1', fresh: 't2' }) {
  const fetchImpl = vi.fn<(r: Request) => Promise<Response>>();
  responses.forEach((r) => fetchImpl.mockResolvedValueOnce(r));
  const deps = {
    getToken: vi.fn().mockResolvedValue(tokens.first),
    refresh: vi.fn().mockResolvedValue(tokens.fresh),
    onSessionExpired: vi.fn(),
    fetchImpl,
  };
  return { deps, fetch: createAuthedFetch(deps), fetchImpl };
}

describe('authed fetch', () => {
  it('adds the bearer token', async () => {
    const { fetch, fetchImpl } = setup([json({}, 200)]);
    await fetch(req());
    expect(fetchImpl.mock.calls[0]?.[0].headers.get('Authorization')).toBe('Bearer t1');
  });

  it('maps the error envelope to ApiError with field details', async () => {
    const { fetch } = setup([
      json({ error: { code: 'validation_error', message: 'Invalid request', details: [{ field: 'texts.title', message: 'too long' }] } }, 400),
    ]);
    const err = await fetch(req()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const api = err as ApiError;
    expect([api.status, api.code]).toEqual([400, 'validation_error']);
    expect(api.fieldErrors).toEqual({ 'texts.title': 'too long' });
    expect(describeError(api)).toContain('texts.title');
  });

  it('survives non-JSON error bodies', async () => {
    const { fetch } = setup([new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' })]);
    await expect(fetch(req())).rejects.toMatchObject({ status: 502, code: 'unknown_error' });
  });

  it('refreshes once on 401 and retries the same request with the new token and body', async () => {
    const { fetch, deps, fetchImpl } = setup([json({ error: { code: 'unauthorized', message: 'x' } }, 401), json({ ok: true }, 200)]);
    const res = await fetch(req());
    expect(res.status).toBe(200);
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retry = fetchImpl.mock.calls[1]?.[0];
    expect(retry?.headers.get('Authorization')).toBe('Bearer t2');
    expect(await retry?.text()).toBe('{"a":1}');
    expect(deps.onSessionExpired).not.toHaveBeenCalled();
  });

  it('asks for a new login when the retry is still 401', async () => {
    const { fetch, deps } = setup([json({}, 401), json({}, 401)]);
    await expect(fetch(req())).rejects.toMatchObject({ status: 401 });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(deps.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('asks for a new login when no refresh is possible', async () => {
    const { fetch, deps } = setup([json({}, 401)], { first: null, fresh: null });
    await expect(fetch(req())).rejects.toBeInstanceOf(ApiError);
    expect(deps.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('turns network failures into a network_error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('offline'));
    const f = createAuthedFetch({ getToken: async () => 't', refresh: async () => null, onSessionExpired: vi.fn(), fetchImpl });
    await expect(f(req())).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
});
