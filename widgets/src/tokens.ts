import type { Density, Elevation, FontFamily, Surface } from './types';

export const DEFAULT_SURFACE: Surface = {
  background: '#ffffff',
  text: '#1d1d1f',
  muted: '#6e6e73',
  accent: '#0f172a',
  accent_text: '#ffffff',
  border: '#e5e5ea',
  radius: 14,
  elevation: 'medium',
  density: 'comfortable',
  font: 'system',
};

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/** System font stacks only: no webfonts, no third-party requests. */
const FONTS: Record<FontFamily, string> = {
  system: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  serif: 'Georgia,"Times New Roman",Times,serif',
  rounded: 'ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",Quicksand,Nunito,system-ui,sans-serif',
  mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace',
};

const SHADOWS: Record<Elevation, string> = {
  none: 'none',
  low: '0 1px 3px rgba(0,0,0,.12)',
  medium: '0 8px 24px rgba(0,0,0,.14)',
  high: '0 16px 48px rgba(0,0,0,.24)',
};

const PADDING: Record<Density, string> = { compact: '12px', comfortable: '18px', spacious: '26px' };

type ColorKey = 'background' | 'text' | 'muted' | 'accent' | 'accent_text' | 'border';

function member<T extends string>(table: Record<T, string>, value: unknown, fallback: T): T {
  return typeof value === 'string' && Object.hasOwn(table, value) ? (value as T) : fallback;
}

/** Re-validate every token client side; anything unexpected falls back to the default. */
export function sanitizeSurface(raw: unknown): Surface {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const color = (key: ColorKey): string => {
    const v = src[key];
    return typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : DEFAULT_SURFACE[key];
  };
  const r = src.radius;
  return {
    background: color('background'),
    text: color('text'),
    muted: color('muted'),
    accent: color('accent'),
    accent_text: color('accent_text'),
    border: color('border'),
    radius:
      typeof r === 'number' && Number.isFinite(r)
        ? Math.min(32, Math.max(0, Math.round(r)))
        : DEFAULT_SURFACE.radius,
    elevation: member(SHADOWS, src.elevation, DEFAULT_SURFACE.elevation),
    density: member(PADDING, src.density, DEFAULT_SURFACE.density),
    font: member(FONTS, src.font, DEFAULT_SURFACE.font),
  };
}

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Keep the configured color when readable, otherwise the better of black/white. */
export function readable(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg;
  return contrast('#000000', bg) >= contrast('#ffffff', bg) ? '#000000' : '#ffffff';
}

/** CSS custom properties for a surface (sanitized first). */
export function tokenVars(raw: unknown): Record<string, string> {
  const s = sanitizeSurface(raw);
  const text = readable(s.text, s.background);
  return {
    '--bg': s.background,
    '--tx': text,
    '--mu': readable(s.muted, s.background, 3),
    '--ac': s.accent,
    '--at': readable(s.accent_text, s.accent),
    '--bd': s.border,
    '--fc': contrast(s.accent, s.background) >= 3 ? s.accent : text,
    '--r': `${s.radius}px`,
    '--r2': `${Math.round(s.radius * 0.6)}px`,
    '--sh': SHADOWS[s.elevation],
    '--pad': PADDING[s.density],
    '--font': FONTS[s.font],
  };
}

export function applyTokens(el: HTMLElement, raw: unknown): void {
  for (const [name, value] of Object.entries(tokenVars(raw))) el.style.setProperty(name, value);
}
