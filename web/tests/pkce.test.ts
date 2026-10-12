import { describe, expect, it } from 'vitest';
import { authorizeUrl, logoutUrl } from '../src/auth/cognito';
import { challengeFor, createVerifier, randomString } from '../src/auth/pkce';
import { safeReturn } from '../src/auth/session';

describe('PKCE helpers', () => {
  it('creates RFC 7636 compliant verifiers (43-128 url-safe chars)', () => {
    const v = createVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(createVerifier()).not.toBe(v);
  });

  it('derives the S256 challenge (RFC 7636 appendix B vector)', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('generates unpredictable state values', () => {
    expect(randomString(16)).not.toBe(randomString(16));
  });

  it('builds the hosted UI authorize URL with code flow and S256', () => {
    const url = new URL(
      authorizeUrl({ domain: 'auth.example.com', clientId: 'cid' }, { origin: 'https://console.example.com', state: 's1', challenge: 'c1' }),
    );
    expect(url.origin + url.pathname).toBe('https://auth.example.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'cid',
      redirect_uri: 'https://console.example.com/auth/callback',
      state: 's1',
      code_challenge: 'c1',
      code_challenge_method: 'S256',
    });
  });

  it('builds the logout URL', () => {
    const url = new URL(logoutUrl({ domain: 'auth.example.com', clientId: 'cid' }, 'https://console.example.com'));
    expect(url.pathname).toBe('/logout');
    expect(url.searchParams.get('logout_uri')).toBe('https://console.example.com/');
  });

  it('only allows same-origin return paths', () => {
    expect(safeReturn('/sites/1')).toBe('/sites/1');
    expect(safeReturn('//evil.com')).toBe('/');
    expect(safeReturn('https://evil.com')).toBe('/');
    expect(safeReturn('/auth/callback')).toBe('/');
  });
});
