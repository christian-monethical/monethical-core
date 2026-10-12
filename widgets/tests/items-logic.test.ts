import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  checkRange,
  eachNight,
  estimate,
  formatMoney,
  guestBounds,
  monthCells,
  monthStart,
  monthsBetween,
  nightsBetween,
  safeLocale,
  todayIso,
} from '../src/items-logic';
import type { DayAvailability } from '../src/types';

const day = (d: string, available = true, price = 10000): DayAvailability => ({ day: d, available, remaining: 1, price_cents: price });
const map = (...days: DayAvailability[]): Map<string, DayAvailability> => new Map(days.map((d) => [d.day, d]));

describe('date math', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 3)).toBe('2026-03-31');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('counts nights', () => {
    expect(nightsBetween('2026-05-01', '2026-05-04')).toBe(3);
    expect(nightsBetween('2026-05-04', '2026-05-01')).toBe(-3);
    expect(eachNight('2026-05-30', '2026-06-02')).toEqual(['2026-05-30', '2026-05-31', '2026-06-01']);
  });

  it('builds month grids starting on Monday', () => {
    const cells = monthCells('2026-05-15');
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, '2026-05-01']);
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(monthCells('2026-06-01')[0]).toBe('2026-06-01');
  });

  it('navigates months', () => {
    expect(monthStart('2026-05-20')).toBe('2026-05-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
    expect(monthsBetween('2026-05-28', '2026-07-03')).toEqual(['2026-05-01', '2026-06-01', '2026-07-01']);
    expect(monthsBetween('2026-05-28', '2026-06-01')).toEqual(['2026-05-01']);
  });

  it('formats the visitor local day', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('range rules', () => {
  const item = { min_nights: 2 };
  const free = map(day('2026-05-01'), day('2026-05-02'), day('2026-05-03'), day('2026-05-04', false));

  it('accepts a fully available stay', () => {
    expect(checkRange(item, free, '2026-05-01', '2026-05-03')).toBeNull();
    expect(checkRange(item, free, '2026-05-01', '2026-05-04')).toBeNull();
  });

  it('the checkout day itself need not be available (only nights count)', () => {
    expect(checkRange(item, free, '2026-05-02', '2026-05-04')).toBeNull();
  });

  it('rejects order, minimum stay, unavailable and unloaded nights', () => {
    expect(checkRange(item, free, '2026-05-03', '2026-05-01')).toBe('order');
    expect(checkRange(item, free, '2026-05-01', '2026-05-02')).toBe('min_stay');
    expect(checkRange(item, free, '2026-05-03', '2026-05-05')).toBe('unavailable');
    expect(checkRange(item, free, '2026-05-04', '2026-05-06')).toBe('unavailable');
    expect(checkRange(item, free, '2026-05-03', '2026-05-06')).toBe('unavailable');
    expect(checkRange(item, free, '2026-04-30', '2026-05-02')).toBe('unknown');
  });

  it('caps stays at 60 nights', () => {
    expect(checkRange({ min_nights: 1 }, new Map(), '2026-01-01', '2026-03-05')).toBe('max_stay');
  });
});

describe('guest bounds and estimate', () => {
  it('bounds by type', () => {
    expect(guestBounds({ type: 'ROOM', capacity: 0 })).toEqual({ min: 1, max: 1 });
    expect(guestBounds({ type: 'ROOM', capacity: 4 })).toEqual({ min: 1, max: 4 });
    expect(guestBounds({ type: 'EXPERIENCE', capacity: 0 }).max).toBe(20);
    expect(guestBounds({ type: 'PRODUCT', capacity: 0 }).max).toBe(99);
    expect(guestBounds({ type: 'PRODUCT', capacity: 5 }).max).toBe(5);
  });

  it('applies the per-missing-guest discount to rooms exactly like the backend', () => {
    const room = { type: 'ROOM', capacity: 4, discount_per_missing_guest_cents: 1500 } as const;
    const nights = [day('a', true, 20000), day('b', true, 20000)];
    expect(estimate(room, nights, 4)).toBe(40000);
    expect(estimate(room, nights, 2)).toBe(2 * (20000 - 2 * 1500));
    expect(estimate(room, nights, 9)).toBe(40000);
    expect(estimate({ ...room, discount_per_missing_guest_cents: 99999 }, nights, 1)).toBe(0);
  });

  it('multiplies by guests/quantity for experiences and products', () => {
    const exp = { type: 'EXPERIENCE', capacity: 10, discount_per_missing_guest_cents: 0 } as const;
    expect(estimate(exp, [day('a', true, 5000)], 3)).toBe(15000);
    expect(estimate({ ...exp, type: 'PRODUCT' }, [day('a', true, 700)], 2)).toBe(1400);
  });
});

describe('formatting', () => {
  it('formats euro with the page language', () => {
    expect(formatMoney(12345, 'en')).toContain('123.45');
    expect(formatMoney(12345, 'it')).toContain('123,45');
    expect(formatMoney(12345, 'it')).toContain('€');
  });

  it('falls back to en for unusable locales', () => {
    expect(safeLocale('not a locale!!')).toBe('en');
    expect(safeLocale('')).toBe('en');
    expect(safeLocale('de')).toBe('de');
  });
});
