import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BannerConfig, BannerStored } from '../src/api/types';
import { bannerFromStored, validateBanner } from '../src/features/banner/model';
import { DEFAULT_SURFACE } from '../src/features/design/defaults';

/**
 * Independent re-statement of the server schema (backend/src/monethical/domain/banner.py + styles.py)
 * so the editor payload can be checked against the documented limits, not against our own validator.
 */
const COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const SURFACE_KEYS = ['background', 'text', 'muted', 'accent', 'accent_text', 'border', 'radius', 'elevation', 'density', 'font'];
const TEXT_LIMITS: Record<string, number> = {
  title: 120, body: 2000, accept_all: 120, reject_all: 120, customize: 120, save: 120, privacy_link_label: 120, reopen_label: 120,
  necessary_label: 120, necessary_description: 500, preferences_label: 120, preferences_description: 500,
  analytics_label: 120, analytics_description: 500, marketing_label: 120, marketing_description: 500,
};
const BANNER_KEYS = ['enabled', 'layout', 'language', 'surface', 'texts', 'logo_url', 'privacy_url', 'categories', 'show_reopen_badge', 'consent_expiry_days', 'google_consent_mode'];

function serverValidate(payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const extra = Object.keys(payload).filter((k) => !BANNER_KEYS.includes(k));
  if (extra.length) errors.push(`extra keys: ${extra.join(',')}`); // extra="forbid"
  const surface = payload.surface as Record<string, unknown>;
  for (const k of Object.keys(surface)) if (!SURFACE_KEYS.includes(k)) errors.push(`surface extra ${k}`);
  for (const k of ['background', 'text', 'muted', 'accent', 'accent_text', 'border']) if (!COLOR.test(String(surface[k]))) errors.push(`surface.${k}`);
  const radius = surface.radius as number;
  if (!Number.isInteger(radius) || radius < 0 || radius > 32) errors.push('surface.radius');
  const texts = payload.texts as Record<string, string>;
  for (const [k, v] of Object.entries(texts)) {
    const max = TEXT_LIMITS[k];
    if (max === undefined) errors.push(`texts extra ${k}`);
    else if (v.trim().length > max) errors.push(`texts.${k}`);
  }
  for (const k of ['logo_url', 'privacy_url']) {
    const v = payload[k] as string | null;
    if (v !== null && v !== undefined && (!v.startsWith('https://') || v.length > 500 || /[ "'<>\\]/.test(v))) errors.push(k);
  }
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(String(payload.language))) errors.push('language');
  const days = payload.consent_expiry_days as number;
  if (!Number.isInteger(days) || days < 1 || days > 395) errors.push('consent_expiry_days');
  const cats = payload.categories as string[];
  if (cats.length > 4 || !cats.includes('necessary')) errors.push('categories');
  if (!['bar-bottom', 'bar-top', 'card-left', 'card-right', 'modal'].includes(String(payload.layout))) errors.push('layout');
  return errors;
}

const stored: BannerStored = {
  enabled: true,
  layout: 'bar-bottom',
  language: 'it',
  surface: { ...DEFAULT_SURFACE },
  texts: Object.fromEntries(Object.keys(TEXT_LIMITS).map((k) => [k, 'Testo'])) as unknown as BannerStored['texts'],
  logo_url: null,
  privacy_url: 'https://example.com/privacy',
  categories: ['necessary', 'preferences', 'analytics', 'marketing'],
  show_reopen_badge: true,
  consent_expiry_days: 180,
  google_consent_mode: true,
  version: 7,
  updated_at: '2026-01-01T00:00:00Z',
};

describe('banner editor payload', () => {
  it('strips server-only fields so the PUT body satisfies the extra=forbid schema', () => {
    const payload = bannerFromStored(stored);
    expect(payload).not.toHaveProperty('version');
    expect(payload).not.toHaveProperty('updated_at');
    expect(serverValidate(payload as unknown as Record<string, unknown>)).toEqual([]);
    expect(validateBanner(payload)).toEqual({});
  });

  it('only sends properties documented in docs/openapi/console.json', () => {
    const spec = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/openapi/console.json'), 'utf8')) as {
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    };
    const allowed = Object.keys(spec.components.schemas.BannerConfig?.properties ?? {});
    expect(allowed.length).toBeGreaterThan(5);
    for (const key of Object.keys(bannerFromStored(stored))) expect(allowed).toContain(key);
    const textKeys = Object.keys(spec.components.schemas.BannerTexts?.properties ?? {});
    expect(Object.keys(TEXT_LIMITS).sort()).toEqual(textKeys.sort());
  });

  it.each<[string, Partial<BannerConfig>, string]>([
    ['too long title', { texts: { ...bannerFromStored(stored).texts!, title: 'x'.repeat(121) } }, 'texts.title'],
    ['body over 2000', { texts: { ...bannerFromStored(stored).texts!, body: 'x'.repeat(2001) } }, 'texts.body'],
    ['http logo url', { logo_url: 'http://example.com/a.png' }, 'logo_url'],
    ['url with space', { privacy_url: 'https://example.com/a b' }, 'privacy_url'],
    ['expiry 0', { consent_expiry_days: 0 }, 'consent_expiry_days'],
    ['expiry 396', { consent_expiry_days: 396 }, 'consent_expiry_days'],
    ['bad language', { language: 'ITA' }, 'language'],
    ['no necessary category', { categories: ['analytics'] }, 'categories'],
    ['bad color', { surface: { ...DEFAULT_SURFACE, accent: 'red' } }, 'surface.accent'],
    ['radius 33', { surface: { ...DEFAULT_SURFACE, radius: 33 } }, 'surface.radius'],
  ])('client validation rejects what the server rejects: %s', (_name, patch, field) => {
    const payload = { ...bannerFromStored(stored), ...patch };
    expect(Object.keys(validateBanner(payload))).toContain(field);
    expect(serverValidate(payload as unknown as Record<string, unknown>).length).toBeGreaterThan(0);
  });
});
