import { t } from '../../i18n';
import type { Surface } from '../../api/types';
import { isHexColor } from '../../ui/ColorField';

/**
 * Client-side mirror of the server rules (backend/src/monethical/domain/*.py).
 * The server stays authoritative: its `details` are shown next to these.
 * Errors are keyed by dotted field path, the same shape the API uses in `details[].field`.
 */
export type Errors = Record<string, string>;

export const LIMITS = { short: 120, medium: 500, long: 2000 } as const;

export const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isHttpsUrl = (v: string): boolean => v.startsWith('https://') && v.length <= 500 && !/[\s"'<>\\]/.test(v);
export const isEmail = (v: string): boolean => v.length <= 254 && EMAIL_RE.test(v);

/** Collects errors; `check` returns an error message or null. */
export class Check {
  readonly errors: Errors = {};

  text(path: string, value: string, max: number, opts: { required?: boolean } = {}): void {
    if (opts.required && value.trim() === '') this.errors[path] = t('rules.required');
    else if (value.trim().length > max) this.errors[path] = t('rules.too_long', { n: max });
  }

  url(path: string, value: string | null | undefined): void {
    if (value && !isHttpsUrl(value)) this.errors[path] = t('rules.https');
  }

  range(path: string, value: number, min: number, max: number): void {
    if (!Number.isInteger(value) || value < min || value > max) this.errors[path] = t('rules.range', { min, max });
  }

  fail(path: string, message: string): void {
    this.errors[path] = message;
  }

  merge(prefix: string, errors: Errors): void {
    for (const [k, v] of Object.entries(errors)) this.errors[`${prefix}.${k}`] = v;
  }

  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }
}

export function validateSurface(s: Surface): Errors {
  const c = new Check();
  for (const key of ['background', 'text', 'muted', 'accent', 'accent_text', 'border'] as const) {
    if (!isHexColor(s[key])) c.fail(key, t('color.invalid'));
  }
  c.range('radius', s.radius, 0, 32);
  return c.errors;
}

/** Strip the dotted prefix, for passing a sub-object's errors to a child editor. */
export function scoped(errors: Errors, prefix: string): Errors {
  const out: Errors = {};
  for (const [k, v] of Object.entries(errors)) if (k.startsWith(`${prefix}.`)) out[k.slice(prefix.length + 1)] = v;
  return out;
}
