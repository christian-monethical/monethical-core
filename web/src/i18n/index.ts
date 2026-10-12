import { signal } from '@preact/signals';
import { it } from './it';
import type { Key } from './it';

export type Lang = 'it' | 'en';
export type { Key };

const LS_KEY = 'mc.lang';
const dictionaries: Record<Lang, Record<Key, string>> = { it, en: it };

function stored(): Lang {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'it' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return 'it';
}

export const lang = signal<Lang>('it');

/** Load the dictionary for `next` (English is a separate lazy chunk) and switch to it. */
export async function setLang(next: Lang, persist = true): Promise<void> {
  if (next === 'en' && dictionaries.en === it) dictionaries.en = (await import('./en')).en;
  lang.value = next;
  document.documentElement.lang = next;
  if (persist) {
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {
      /* ignore */
    }
  }
}

export const initLang = (): Promise<void> => setLang(stored(), false);

/** Translate. Reading `lang.value` subscribes the calling component to language changes. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const text = dictionaries[lang.value][key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''));
}

const locale = (): string => (lang.value === 'it' ? 'it-IT' : 'en-GB');

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(locale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatMoney = (cents: number, currency = 'EUR'): string =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(cents / 100);

export const formatNumber = (n: number): string => new Intl.NumberFormat(locale()).format(n);
