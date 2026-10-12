import { t } from '../../i18n';

/** Mirrors backend `normalize_domain` (core/origin.py): bare lowercase host or `*.host`. */
const HOST_RE = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function normalizeDomain(raw: string): string {
  let v = raw.trim().toLowerCase();
  if (v.includes('://')) {
    try {
      v = new URL(v).host;
    } catch {
      v = v.split('://')[1] ?? v;
    }
  }
  return (v.split('/')[0] ?? '').split(':')[0]?.replace(/\.$/, '') ?? '';
}

/** Error message for a normalized domain, or null when the server will accept it. */
export function validateDomain(domain: string): string | null {
  if (domain.length > 253) return t('domains.too_long');
  return LOCAL_HOSTS.has(domain) || HOST_RE.test(domain) ? null : t('domains.invalid', { v: domain });
}

export const MAX_DOMAINS = 10;
