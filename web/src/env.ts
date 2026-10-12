/** Build-time configuration (see .env.example). */
const env = import.meta.env;

export const config = {
  cognitoDomain: (env.VITE_COGNITO_DOMAIN ?? '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
  clientId: env.VITE_COGNITO_CLIENT_ID ?? '',
  apiBase: (env.VITE_API_BASE ?? '/api').replace(/\/$/, ''),
  edgeUrl: (env.VITE_EDGE_URL ?? '').replace(/\/$/, ''),
  mock: env.MODE === 'mock',
} as const;
