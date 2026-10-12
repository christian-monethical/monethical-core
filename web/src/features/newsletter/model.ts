import type { NewsletterConfig } from '../../api/types';
import { DEFAULT_SURFACE } from '../design/defaults';
import { Check, LIMITS, validateSurface } from '../design/rules';
import type { Errors } from '../design/rules';

export function validateNewsletter(c: NewsletterConfig): Errors {
  const k = new Check();
  k.text('headline', c.headline, LIMITS.short);
  k.text('subheadline', c.subheadline, LIMITS.medium);
  k.text('button_label', c.button_label, LIMITS.short, { required: true });
  k.text('email_placeholder', c.email_placeholder, LIMITS.short);
  k.text('privacy_text', c.privacy_text, LIMITS.medium);
  k.text('success_message', c.success_message, LIMITS.medium);
  k.url('privacy_url', c.privacy_url);
  k.merge('surface', validateSurface(c.surface ?? DEFAULT_SURFACE));
  return k.errors;
}

/** The GET response already has the exact shape of the PUT body. */
export const newsletterFromStored = (c: NewsletterConfig): NewsletterConfig => c;
