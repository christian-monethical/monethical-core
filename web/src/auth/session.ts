import { signal } from '@preact/signals';
import { config } from '../env';
import { authorizeUrl, cognitoConfig, exchangeCode, logoutUrl } from './cognito';
import { decodeClaims } from './jwt';
import type { IdClaims } from './jwt';
import { challengeFor, createVerifier, randomString } from './pkce';
import { createTokenStore } from './tokens';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

const PKCE_KEY = 'mc.pkce';
export const tokens = createTokenStore(cognitoConfig);
export const authStatus = signal<AuthStatus>('loading');
export const displayClaims = signal<IdClaims>({});

interface PkceState {
  verifier: string;
  state: string;
  returnTo: string;
}

/** Only same-origin, non-auth paths are valid return targets (no open redirect). */
export function safeReturn(path: string): string {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/auth/') ? path : '/';
}

tokens.subscribe((signedIn) => {
  authStatus.value = signedIn ? 'authenticated' : 'anonymous';
  displayClaims.value = decodeClaims(tokens.idToken());
});

/** Restore a session from the refresh token kept in sessionStorage (if any). */
export async function initSession(): Promise<void> {
  if (config.mock) {
    tokens.accept({ access_token: 'mock', expires_in: 3600 * 24 });
    displayClaims.value = { email: 'demo@monethical.com' };
    return;
  }
  if (!tokens.hasRefreshToken()) {
    authStatus.value = 'anonymous';
    return;
  }
  const token = await tokens.refresh();
  if (!token) authStatus.value = 'anonymous';
}

/** Redirect to the Cognito Hosted UI, remembering where to come back to. */
export async function login(returnTo: string): Promise<void> {
  const verifier = createVerifier();
  const state = randomString(16);
  const pkce: PkceState = { verifier, state, returnTo: safeReturn(returnTo) };
  sessionStorage.setItem(PKCE_KEY, JSON.stringify(pkce));
  const challenge = await challengeFor(verifier);
  window.location.assign(authorizeUrl(cognitoConfig, { origin: window.location.origin, state, challenge }));
}

/** Complete the code flow on /auth/callback. Resolves to the path to navigate to. */
export async function completeLogin(search: string): Promise<string> {
  const params = new URLSearchParams(search);
  const raw = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  const stored = raw ? (JSON.parse(raw) as PkceState) : null;
  const code = params.get('code');
  if (params.get('error') || !code || !stored || stored.state !== params.get('state')) {
    throw new Error(params.get('error_description') ?? 'invalid_callback');
  }
  const t = await exchangeCode(cognitoConfig, { code, verifier: stored.verifier, origin: window.location.origin });
  tokens.accept(t);
  return safeReturn(stored.returnTo);
}

export function logout(): void {
  tokens.clear();
  window.location.assign(config.mock ? '/' : logoutUrl(cognitoConfig, window.location.origin));
}

/** Called when the API answered 401 and a refresh did not help. */
export function sessionExpired(): void {
  tokens.clear();
  void login(window.location.pathname + window.location.search);
}
