/**
 * Inert previews for the console: same rendering code as production, but no network,
 * no cookies, no Consent Mode, no script gating. The banner is positioned inside `host`
 * (which the console makes `position: relative`).
 */
import type { Api } from './api';
import { mountBanner } from './consent';
import { mountForm } from './forms';
import { pageLang } from './i18n';
import { addDays } from './items-logic';
import { mountItems } from './items';
import { mountNewsletter } from './newsletter';
import { mountSurvey } from './survey';
import type {
  BannerConfig,
  CatalogItem,
  DayAvailability,
  NewsletterConfig,
  PublicForm,
  PublicSurvey,
} from './types';

export interface Preview<T> {
  update(config: T): void;
  destroy(): void;
}

interface Rendered {
  destroy(): void;
}

function previewOf<T>(host: HTMLElement, render: (host: HTMLElement, config: T) => Rendered, initial: T): Preview<T> {
  let current = render(host, initial);
  return {
    update(config) {
      current.destroy();
      current = render(host, config);
    },
    destroy() {
      current.destroy();
    },
  };
}

/** Pretends every request succeeds; availability is "open every day at the item's price". */
function inertApi(priceCents = 0): Api {
  return {
    get<T>(path: string): Promise<T> {
      const query = new URLSearchParams(path.split('?')[1] ?? '');
      const days: DayAvailability[] = [];
      for (let day = query.get('from') ?? '', end = query.get('to') ?? ''; day && day < end; day = addDays(day, 1)) {
        days.push({ day, available: true, remaining: null, price_cents: priceCents });
      }
      return Promise.resolve(days as T);
    },
    post<T>(path: string, body: unknown): Promise<T> {
      if (!path.endsWith('/book')) return Promise.resolve({ ok: true } as T);
      const b = body as { start: string; end?: string; guests: number };
      const booking = {
        booking_id: 'preview',
        item_id: 'preview',
        item_name: '',
        start: b.start,
        end: b.end ?? b.start,
        slot: null,
        guests: b.guests,
        total_cents: priceCents * b.guests,
        currency: 'eur',
        status: 'PENDING',
        cta_mode: 'request',
      };
      return Promise.resolve({ booking, checkout_url: null } as T);
    },
  };
}

export function mountBannerPreview(host: HTMLElement, config: BannerConfig): Preview<BannerConfig> {
  return previewOf(host, (el, cfg) => mountBanner(el, cfg, { preview: true, initial: null, onChoice: () => undefined }), config);
}

export function mountFormPreview(host: HTMLElement, form: PublicForm): Preview<PublicForm> {
  return previewOf(host, (el, f) => mountForm(el, f, inertApi(), pageLang()), form);
}

export function mountNewsletterPreview(host: HTMLElement, cfg: NewsletterConfig): Preview<NewsletterConfig> {
  return previewOf(host, (el, c) => mountNewsletter(el, c, inertApi(), pageLang()), cfg);
}

export function mountSurveyPreview(host: HTMLElement, survey: PublicSurvey): Preview<PublicSurvey> {
  return previewOf(host, (el, s) => mountSurvey(el, s, inertApi(), pageLang()), survey);
}

export function mountItemPreview(host: HTMLElement, item: CatalogItem): Preview<CatalogItem> {
  return previewOf(host, (el, i) => mountItems(el, [i], inertApi(i.price_cents), pageLang()), item);
}
