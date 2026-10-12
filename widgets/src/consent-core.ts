/** Consent logic without UI: persistence, expiry/version rules, Consent Mode v2, script gating. */
import type { ConsentState as Choice } from './types';

export type { Choice };

export interface Stored {
  banner_version: number;
  categories: { preferences: boolean; analytics: boolean; marketing: boolean };
  /** Epoch ms of the decision. */
  updated: number;
  /** Epoch ms after which the visitor is asked again. */
  expires: number;
  visitor_id: string;
}

export const STORAGE_KEY = 'monethical_consent';
const DAY_MS = 86_400_000;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function toChoice(c: Stored['categories']): Choice {
  return { necessary: true, preferences: c.preferences, analytics: c.analytics, marketing: c.marketing };
}

export function newVisitorId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_ALPHABET.charAt(b % ID_ALPHABET.length)).join('');
}

/** Strictly validates untrusted storage content. */
export function parseStored(raw: unknown): Stored | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const cats = r.categories as Record<string, unknown> | null;
  if (
    typeof r.banner_version !== 'number' ||
    typeof r.updated !== 'number' ||
    typeof r.expires !== 'number' ||
    typeof r.visitor_id !== 'string' ||
    !ID_RE.test(r.visitor_id) ||
    typeof cats !== 'object' ||
    cats === null
  ) {
    return null;
  }
  return {
    banner_version: r.banner_version,
    updated: r.updated,
    expires: r.expires,
    visitor_id: r.visitor_id,
    categories: {
      preferences: cats.preferences === true,
      analytics: cats.analytics === true,
      marketing: cats.marketing === true,
    },
  };
}

/** A stored decision is honored until it expires or the banner version increases. */
export function isValid(stored: Stored | null, version: number, now: number): stored is Stored {
  return stored !== null && stored.expires > now && stored.banner_version >= version;
}

function fromCookie(): unknown {
  const prefix = `${STORAGE_KEY}=`;
  const part = document.cookie.split('; ').find((c) => c.startsWith(prefix));
  if (!part) return null;
  try {
    return JSON.parse(decodeURIComponent(part.slice(prefix.length)));
  } catch {
    return null;
  }
}

function fromStorage(): unknown {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** The cookie wins; localStorage is the fallback (and keeps the visitor id after the cookie expired). */
export function readStored(): Stored | null {
  return parseStored(fromCookie()) ?? parseStored(fromStorage());
}

export function writeStored(value: Stored): void {
  const json = JSON.stringify(value);
  const maxAge = Math.max(0, Math.floor((value.expires - Date.now()) / 1000));
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(json)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* storage may be blocked: the cookie is enough */
  }
}

export function buildStored(choice: Choice, version: number, expiryDays: number, visitorId: string, now: number): Stored {
  return {
    banner_version: version,
    categories: { preferences: choice.preferences, analytics: choice.analytics, marketing: choice.marketing },
    updated: now,
    expires: now + expiryDays * DAY_MS,
    visitor_id: visitorId,
  };
}

// ----------------------------------------------------------------------- Consent Mode v2

type Grant = 'granted' | 'denied';

const MODE_KEYS = [
  'ad_storage',
  'analytics_storage',
  'ad_user_data',
  'ad_personalization',
  'functionality_storage',
  'personalization_storage',
  'security_storage',
] as const;

/** Google tags require the `arguments` object itself on the dataLayer. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]): void {
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ??= []).push(arguments);
}

export function consentModeDefault(waitForUpdateMs: number): void {
  const denied = Object.fromEntries(MODE_KEYS.map((k) => [k, 'denied'])) as Record<string, string | number>;
  if (waitForUpdateMs > 0) denied.wait_for_update = waitForUpdateMs;
  gtag('consent', 'default', denied);
}

export function consentModeUpdate(c: Choice): void {
  const g = (on: boolean): Grant => (on ? 'granted' : 'denied');
  gtag('consent', 'update', {
    ad_storage: g(c.marketing),
    ad_user_data: g(c.marketing),
    ad_personalization: g(c.marketing),
    analytics_storage: g(c.analytics),
    functionality_storage: g(c.preferences),
    personalization_storage: g(c.preferences),
    security_storage: 'granted',
  });
  (window.dataLayer ??= []).push({ event: 'monethical_consent_update' });
}

// ----------------------------------------------------------------------- script gating

const GATED = 'script[type="text/plain"][data-monethical-category], iframe[data-monethical-category]';

function allowed(el: Element, choice: Choice | null): boolean {
  const cat = (el as HTMLElement).dataset.monethicalCategory;
  if (cat === 'necessary') return true;
  return choice !== null && (cat === 'preferences' || cat === 'analytics' || cat === 'marketing') && choice[cat];
}

function httpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value, location.href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function activateScript(el: HTMLScriptElement): void {
  const live = document.createElement('script');
  for (const { name, value } of Array.from(el.attributes)) {
    if (name === 'type' || name === 'data-monethical-category') continue;
    if (name === 'data-src') {
      const url = httpUrl(value);
      if (url) live.src = url;
    } else {
      live.setAttribute(name, value);
    }
  }
  live.textContent = el.textContent;
  el.replaceWith(live);
}

/** Activate (or, for iframes, deactivate) gated embeds according to the current choice. */
export function gate(choice: Choice | null, root: ParentNode = document): void {
  for (const el of Array.from(root.querySelectorAll(GATED))) {
    const ok = allowed(el, choice);
    if (el instanceof HTMLScriptElement) {
      if (ok) activateScript(el);
    } else if (ok) {
      const url = httpUrl((el as HTMLIFrameElement).dataset.src);
      if (url && el.getAttribute('src') !== url) el.setAttribute('src', url);
    } else {
      el.removeAttribute('src');
    }
  }
}
