import { config } from '../env';

export interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
}

export interface CognitoConfig {
  domain: string;
  clientId: string;
}

export const cognitoConfig: CognitoConfig = { domain: config.cognitoDomain, clientId: config.clientId };

export const callbackUri = (origin: string): string => `${origin}/auth/callback`;

export function authorizeUrl(
  cfg: CognitoConfig,
  p: { origin: string; state: string; challenge: string },
): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: callbackUri(p.origin),
    scope: 'openid email profile',
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
  });
  return `https://${cfg.domain}/oauth2/authorize?${q.toString()}`;
}

export function logoutUrl(cfg: CognitoConfig, origin: string): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, logout_uri: `${origin}/` });
  return `https://${cfg.domain}/logout?${q.toString()}`;
}

/** `fatal` = the server rejected the grant (4xx): the refresh token is no longer usable. */
export class TokenError extends Error {
  constructor(
    message: string,
    readonly fatal: boolean,
  ) {
    super(message);
  }
}

async function tokenRequest(cfg: CognitoConfig, body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(`https://${cfg.domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.clientId, ...body }),
    });
  } catch {
    throw new TokenError('network', false);
  }
  if (!res.ok) throw new TokenError(`token endpoint ${res.status}`, res.status >= 400 && res.status < 500);
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(
  cfg: CognitoConfig,
  p: { code: string; verifier: string; origin: string },
): Promise<TokenResponse> {
  return tokenRequest(cfg, {
    grant_type: 'authorization_code',
    code: p.code,
    code_verifier: p.verifier,
    redirect_uri: callbackUri(p.origin),
  });
}

export function refreshTokens(cfg: CognitoConfig, refreshToken: string): Promise<TokenResponse> {
  return tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken });
}
