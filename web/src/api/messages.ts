import { t } from '../i18n';
import type { Key } from '../i18n';
import { ApiError } from './errors';

/** Error codes of the backend that have a localized, actionable message. */
const KNOWN: Record<string, Key> = {
  plan_limit: 'err.plan_limit',
  key_limit: 'err.key_limit',
  domain_taken: 'err.domain_taken',
  invalid_domain: 'err.invalid_domain',
  slug_taken: 'err.slug_taken',
  invalid_return_url: 'err.invalid_return_url',
  account_suspended: 'err.account_suspended',
  account_exists: 'err.account_exists',
  duplicate_field: 'err.duplicate_field',
  missing_options: 'err.missing_options',
  autoresponder_needs_email: 'err.autoresponder_needs_email',
  invalid_categories: 'err.invalid_categories',
  network_error: 'err.network',
  rate_limited: 'err.rate_limited',
  forbidden: 'err.forbidden',
  booking_cancelled: 'err.booking_cancelled',
  invalid_range: 'err.invalid_range',
  invalid_slots: 'err.invalid_slots',
};

/** Human message for any thrown value: localized when the code is known, else the server's text. */
export function describeError(e: unknown): string {
  if (!(e instanceof ApiError)) return t('err.unknown');
  const known = KNOWN[e.code];
  if (known) return t(known);
  if (e.code === 'validation_error' && e.details.length > 0) {
    return e.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join(' · ');
  }
  return e.message || t('err.unknown');
}
