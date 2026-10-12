import type { BannerConfig, BannerStored, BannerTexts } from '../../api/types';
import { t } from '../../i18n';
import { DEFAULT_SURFACE } from '../design/defaults';
import { Check, LIMITS, validateSurface } from '../design/rules';
import type { Errors } from '../design/rules';

export type Layout = BannerConfig['layout'];
export const LAYOUTS: Layout[] = ['bar-bottom', 'bar-top', 'card-left', 'card-right', 'modal'];
export const LANGUAGES = ['it', 'en', 'de', 'fr', 'es', 'pt', 'nl', 'pl'] as const;

/** Text keys with their server limit (domain/banner.py: ShortText 120, MediumText 500, LongText 2000). */
export const TEXT_FIELDS: { key: keyof BannerTexts; max: number; multiline?: boolean }[] = [
  { key: 'title', max: LIMITS.short },
  { key: 'body', max: LIMITS.long, multiline: true },
  { key: 'accept_all', max: LIMITS.short },
  { key: 'reject_all', max: LIMITS.short },
  { key: 'customize', max: LIMITS.short },
  { key: 'save', max: LIMITS.short },
  { key: 'privacy_link_label', max: LIMITS.short },
  { key: 'reopen_label', max: LIMITS.short },
  { key: 'necessary_label', max: LIMITS.short },
  { key: 'necessary_description', max: LIMITS.medium },
  { key: 'preferences_label', max: LIMITS.short },
  { key: 'preferences_description', max: LIMITS.medium },
  { key: 'analytics_label', max: LIMITS.short },
  { key: 'analytics_description', max: LIMITS.medium },
  { key: 'marketing_label', max: LIMITS.short },
  { key: 'marketing_description', max: LIMITS.medium },
];

/** The PUT schema is `extra=forbid`: version/updated_at must not be sent back. */
export function bannerFromStored(stored: BannerStored): BannerConfig {
  const { version, updated_at, ...config } = stored;
  return config;
}

export const emptyTexts = (): BannerTexts =>
  Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, ''])) as unknown as BannerTexts;

export function validateBanner(c: BannerConfig): Errors {
  const check = new Check();
  for (const f of TEXT_FIELDS) check.text(`texts.${f.key}`, c.texts?.[f.key] ?? '', f.max);
  check.url('logo_url', c.logo_url);
  check.url('privacy_url', c.privacy_url);
  check.range('consent_expiry_days', c.consent_expiry_days, 1, 395);
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(c.language)) check.fail('language', t('rules.language'));
  if (!c.categories?.includes('necessary')) check.fail('categories', t('banner.necessary_locked'));
  check.merge('surface', validateSurface(c.surface ?? DEFAULT_SURFACE));
  return check.errors;
}
