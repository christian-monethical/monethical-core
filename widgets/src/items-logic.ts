/** Pure date / price logic of the booking widget (mirrors backend catalog rules). */
import type { CatalogItem, DayAvailability } from './types';

export const MAX_NIGHTS = 60;
const DAY_MS = 86_400_000;

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` -> Date at UTC midnight (all calendar math is UTC so DST never shifts days). */
export function parseIso(iso: string): Date {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(parseIso(iso).getTime() + days * DAY_MS));
}

/** Visitor's local calendar day. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(monthIso: string, delta: number): string {
  const d = parseIso(monthStart(monthIso));
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)));
}

/** Month cells, Monday first: `null` pads the first week. */
export function monthCells(monthIso: string): (string | null)[] {
  const first = parseIso(monthStart(monthIso));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < days; i += 1) cells.push(addDays(monthStart(monthIso), i));
  return cells;
}

/** Every `YYYY-MM` month touched by the nights [start, end). */
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let m = monthStart(start); m < end; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function nightsBetween(start: string, end: string): number {
  return Math.round((parseIso(end).getTime() - parseIso(start).getTime()) / DAY_MS);
}

export function eachNight(start: string, end: string): string[] {
  return Array.from({ length: Math.max(0, nightsBetween(start, end)) }, (_, i) => addDays(start, i));
}

export type RangeProblem = 'order' | 'min_stay' | 'max_stay' | 'unavailable' | 'unknown';

/** Can the nights [start, end) be booked, given the availability loaded so far? */
export function checkRange(
  item: Pick<CatalogItem, 'min_nights'>,
  avail: ReadonlyMap<string, DayAvailability>,
  start: string,
  end: string,
): RangeProblem | null {
  const nights = nightsBetween(start, end);
  if (nights < 1) return 'order';
  if (nights < item.min_nights) return 'min_stay';
  if (nights > MAX_NIGHTS) return 'max_stay';
  for (const night of eachNight(start, end)) {
    const day = avail.get(night);
    if (!day) return 'unknown';
    if (!day.available) return 'unavailable';
  }
  return null;
}

export function guestBounds(item: Pick<CatalogItem, 'type' | 'capacity'>): { min: number; max: number } {
  if (item.type === 'ROOM') return { min: 1, max: Math.max(item.capacity, 1) };
  return { min: 1, max: item.capacity > 0 ? item.capacity : item.type === 'PRODUCT' ? 99 : 20 };
}

/** Client-side estimate; the server recomputes the authoritative total. */
export function estimate(
  item: Pick<CatalogItem, 'type' | 'capacity' | 'discount_per_missing_guest_cents'>,
  days: readonly Pick<DayAvailability, 'price_cents'>[],
  guests: number,
): number {
  if (item.type !== 'ROOM') return days.reduce((sum, d) => sum + d.price_cents, 0) * guests;
  const cap = Math.max(item.capacity, 1);
  const missing = Math.max(0, cap - Math.min(guests, cap));
  return days.reduce((sum, d) => sum + Math.max(0, d.price_cents - missing * item.discount_per_missing_guest_cents), 0);
}

export function safeLocale(lang: string | undefined): string {
  try {
    return Intl.NumberFormat.supportedLocalesOf(lang ?? '').length ? (lang ?? 'en') : 'en';
  } catch {
    return 'en';
  }
}

/** Prices are in euro cents (the backend currency). */
export function formatMoney(cents: number, locale: string, currency = 'EUR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parseIso(iso));
}
