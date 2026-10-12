/** Calendar-date helpers working on `YYYY-MM-DD` strings (UTC arithmetic, no timezone drift). */

export const toIso = (d: Date): string => d.toISOString().slice(0, 10);
export const fromIso = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Inclusive list of days between two dates in any order. */
export function daysBetween(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 6x7 grid (Monday first) of ISO days for a month; days outside the month are included for padding. */
export function monthMatrix(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month, 1 - offset));
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => toIso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + w * 7 + d)))),
  );
}

export const todayIso = (): string => toIso(new Date());
