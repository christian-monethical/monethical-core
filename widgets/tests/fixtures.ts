import type { Api } from '../src/api';
import type { BannerConfig, CatalogItem, NewsletterConfig, PublicForm, PublicSurvey, SiteDoc, Surface } from '../src/types';

export const surface: Surface = {
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

export const banner: BannerConfig = {
  enabled: true,
  layout: 'bar-bottom',
  language: 'en',
  surface,
  texts: {
    title: 'We value your privacy',
    body: 'We use cookies.',
    accept_all: 'Accept all',
    reject_all: 'Only necessary',
    customize: 'Customize',
    save: 'Save choices',
    privacy_link_label: 'Privacy policy',
    reopen_label: 'Cookie settings',
    necessary_label: 'Necessary',
    necessary_description: 'Always on.',
    preferences_label: 'Preferences',
    preferences_description: 'Settings.',
    analytics_label: 'Analytics',
    analytics_description: 'Traffic.',
    marketing_label: 'Marketing',
    marketing_description: 'Offers.',
  },
  logo_url: null,
  privacy_url: 'https://example.com/privacy',
  categories: ['necessary', 'preferences', 'analytics', 'marketing'],
  show_reopen_badge: true,
  consent_expiry_days: 180,
  google_consent_mode: true,
  version: 3,
};

export const form: PublicForm = {
  form_id: 'f1',
  name: 'Contact',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, options: [], max_length: 50 },
    { key: 'email', label: 'Email', type: 'email', required: true, options: [], max_length: 254 },
    { key: 'phone', label: 'Phone', type: 'tel', required: false, options: [], max_length: 50 },
    { key: 'topic', label: 'Topic', type: 'select', required: false, options: ['A', 'B'], max_length: 20 },
    { key: 'message', label: 'Message', type: 'textarea', required: true, options: [], max_length: 100 },
  ],
  submit_label: 'Send it',
  success_message: 'Thanks!',
  privacy_text: 'I accept the privacy policy',
  privacy_required: true,
  privacy_url: 'https://example.com/privacy',
  surface,
};

export const newsletter: NewsletterConfig = {
  enabled: true,
  headline: 'Subscribe',
  subheadline: 'No spam',
  button_label: 'Join',
  email_placeholder: 'Your email',
  privacy_text: 'I agree',
  privacy_url: null,
  success_message: 'Welcome!',
  surface,
};

export const survey: PublicSurvey = {
  survey_id: 's1',
  title: 'Feedback',
  description: 'Tell us',
  submit_label: 'Send',
  success_message: 'Thanks for the feedback',
  surface,
  questions: [
    { key: 'score', text: 'Score?', type: 'rating', required: true, options: [], rating_max: 5 },
    { key: 'color', text: 'Color?', type: 'choice', required: false, options: ['red', 'blue'], rating_max: 5 },
    { key: 'again', text: 'Again?', type: 'boolean', required: false, options: [], rating_max: 5 },
    { key: 'note', text: 'Note?', type: 'text', required: false, options: [], rating_max: 5 },
  ],
};

export const room: CatalogItem = {
  item_id: 'i1',
  name: 'Sea room',
  slug: 'sea-room',
  type: 'ROOM',
  description: 'Lovely',
  price_cents: 10000,
  capacity: 2,
  cta_mode: 'book',
  image_url: 'https://cdn.example.com/a.jpg',
  gallery: [],
  amenities: ['WiFi'],
  discount_per_missing_guest_cents: 1000,
  available_from: null,
  available_to: null,
  min_nights: 2,
  slots: [],
  duration_min: null,
  active: true,
  button_text: '',
  surface,
};

export const doc = (over: Partial<SiteDoc> = {}): SiteDoc => ({
  v: 1,
  site_key: 'pk_live_' + 'a'.repeat(32),
  generated_at: '2026-01-01T00:00:00Z',
  banner: null,
  forms: [],
  newsletter: null,
  surveys: [],
  catalog: [],
  ...over,
});

export interface Call {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

/** Recording Api double; `respond` decides the result of every call. */
export function fakeApi(respond: (call: Call) => unknown = () => ({ ok: true })): { api: Api; calls: Call[] } {
  const calls: Call[] = [];
  const run = async (call: Call): Promise<unknown> => {
    calls.push(call);
    await Promise.resolve();
    const out = respond(call);
    if (out instanceof Error) throw out;
    return out;
  };
  const api: Api = {
    get: (path) => run({ method: 'GET', path }) as Promise<never>,
    post: (path, body) => run({ method: 'POST', path, body }) as Promise<never>,
  };
  return { api, calls };
}

export const flush = async (n = 5): Promise<void> => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};

export function shadowOf(host: Element): ShadowRoot {
  const holder = host.firstElementChild;
  if (!holder?.shadowRoot) throw new Error('no shadow root');
  return holder.shadowRoot;
}
