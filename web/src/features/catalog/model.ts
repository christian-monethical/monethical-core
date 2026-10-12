import type { ItemConfig, ItemStored } from '../../api/types';
import { t } from '../../i18n';
import { DEFAULT_SURFACE } from '../design/defaults';
import { Check, ISO_DATE_RE, isHttpsUrl, LIMITS, SLOT_RE, SLUG_RE, validateSurface } from '../design/rules';
import type { Errors } from '../design/rules';

export type ItemType = ItemConfig['type'];
export type CtaMode = ItemConfig['cta_mode'];
export const ITEM_TYPES: ItemType[] = ['ROOM', 'EXPERIENCE', 'PRODUCT'];
export const CTA_MODES: CtaMode[] = ['request', 'book', 'pay'];
export const MAX_CENTS = 10_000_000;

export function defaultItem(): ItemConfig {
  return {
    name: '',
    slug: '',
    type: 'ROOM',
    description: '',
    price_cents: 0,
    capacity: 1,
    cta_mode: 'request',
    image_url: null,
    gallery: [],
    amenities: [],
    discount_per_missing_guest_cents: 0,
    available_from: null,
    available_to: null,
    min_nights: 1,
    slots: [],
    duration_min: null,
    active: true,
    button_text: '',
    surface: { ...DEFAULT_SURFACE },
  };
}

export function itemFromStored(stored: ItemStored): ItemConfig {
  const { item_id, created_at, updated_at, ...config } = stored;
  return config;
}

/** `Camera Vista Mare!` -> `camera-vista-mare` (server rule: lowercase words joined by single dashes). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** "12,50" / "12.5" -> 1250. Returns NaN when not a number. */
export function parseMoney(text: string): number {
  const n = Number(text.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Number.NaN;
}

export const centsToInput = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

export function validateItem(c: ItemConfig): Errors {
  const k = new Check();
  k.text('name', c.name, LIMITS.short, { required: true });
  if (!c.slug || c.slug.length > 80 || !SLUG_RE.test(c.slug)) k.fail('slug', t('catalog.slug_rule'));
  k.text('description', c.description, LIMITS.long);
  k.range('price_cents', c.price_cents, 0, MAX_CENTS);
  k.range('capacity', c.capacity, 0, 1000);
  k.range('discount_per_missing_guest_cents', c.discount_per_missing_guest_cents, 0, MAX_CENTS);
  k.range('min_nights', c.min_nights, 1, 60);
  k.url('image_url', c.image_url);
  const gallery = c.gallery ?? [];
  if (gallery.length > 8 || gallery.some((u) => !isHttpsUrl(u))) k.fail('gallery', t('catalog.gallery_rule'));
  const amenities = c.amenities ?? [];
  if (amenities.length > 20 || amenities.some((a) => a.length > LIMITS.short)) k.fail('amenities', t('catalog.amenities_rule'));
  for (const f of ['available_from', 'available_to'] as const) {
    const v = c[f];
    if (v && !ISO_DATE_RE.test(v)) k.fail(f, t('catalog.date_rule'));
  }
  if (c.available_from && c.available_to && c.available_from > c.available_to) k.fail('available_to', t('err.invalid_range'));
  const slots = c.slots ?? [];
  if (c.type !== 'EXPERIENCE' && slots.length > 0) k.fail('slots', t('err.invalid_slots'));
  if (slots.length > 12 || slots.some((s) => !SLOT_RE.test(s))) k.fail('slots', t('catalog.slots_rule'));
  if (c.duration_min != null) k.range('duration_min', c.duration_min, 5, 1440);
  k.text('button_text', c.button_text, LIMITS.short);
  k.merge('surface', validateSurface(c.surface ?? DEFAULT_SURFACE));
  return k.errors;
}
