/** Decode a JWT payload for DISPLAY only. Authorization always comes from the API (`/v1/me`). */
export interface IdClaims {
  email?: string;
  name?: string;
}

export function decodeClaims(token: string | undefined): IdClaims {
  if (!token) return {};
  try {
    const part = token.split('.')[1] ?? '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as IdClaims;
  } catch {
    return {};
  }
}
