import { randomBytes } from 'node:crypto';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Rec = { [k: string]: Json };
interface Reply {
  status?: number;
  body?: Json | string;
  type?: string;
  headers?: Record<string, string>;
}
export interface Db {
  route(method: string, path: string, query: URLSearchParams, body: Json): Reply;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Json,
  ) {
    super(message);
  }
}

const id = (): string => randomBytes(13).toString('hex').toUpperCase();
const now = (): string => new Date().toISOString();
const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();
const rec = (v: Json): Rec => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {});
const str = (v: Json | undefined): string => (typeof v === 'string' ? v : '');
const list = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : []);

const SURFACE: Rec = {
  background: '#ffffff', text: '#1d1d1f', muted: '#6e6e73', accent: '#0f172a', accent_text: '#ffffff',
  border: '#e5e5ea', radius: 14, elevation: 'medium', density: 'comfortable', font: 'system',
};
const PLAN_MAX_SITES: Record<string, number> = { FREE: 1, PRO: 5, EMPIRE: 50 };
const PLAN_NAMES: Record<string, string> = { FREE: 'Starter', PRO: 'Business', EMPIRE: 'Empire' };

function page(items: Json[], query: URLSearchParams): Json {
  const limit = Math.min(Number(query.get('limit') ?? 50), 100);
  const start = query.get('cursor') ? Number(Buffer.from(query.get('cursor') ?? '', 'base64url').toString()) : 0;
  const slice = items.slice(start, start + limit);
  const next = start + limit < items.length ? Buffer.from(String(start + limit)).toString('base64url') : null;
  return { items: slice, next_cursor: next };
}

function validation(field: string, message: string): never {
  throw new HttpError(400, 'validation_error', 'Invalid request', [{ field, message }]);
}

export function createDb(): Db {
  const me: Rec = { tenant_id: id(), email: 'demo@monethical.com', is_staff: true, plan: 'PRO', plan_name: 'Business', max_sites: 5, limits: { max_sites: 5, max_forms_per_site: 5, max_items_per_site: 50, max_surveys_per_site: 10 }, stripe_connected: false, stripe_charges_enabled: false };
  let stripe = { connected: false, charges_enabled: false };

  const siteA = id();
  const siteB = id();
  const mkSite = (site_id: string, name: string, domains: string[]): Rec => ({
    site_id, name, site_key: `pk_live_${randomBytes(16).toString('hex')}`, domains, status: 'active', created_at: daysAgo(40), updated_at: daysAgo(2),
  });
  const sites: Rec[] = [mkSite(siteA, 'Villa Aurora', ['www.villaaurora.it', 'villaaurora.it']), mkSite(siteB, 'Studio Bianchi', ['studiobianchi.example'])];

  const banners = new Map<string, Rec>();
  const forms = new Map<string, Rec[]>();
  const newsletters = new Map<string, Rec>();
  const surveys = new Map<string, Rec[]>();
  const items = new Map<string, Rec[]>();
  const prices = new Map<string, Rec[]>();
  const blocks = new Map<string, Rec[]>();
  const keys = new Map<string, Rec[]>();
  const submissions: Rec[] = [];
  const bookings: Rec[] = [];
  const consents: Rec[] = [];
  const subscribers: Rec[] = [];

  const formId = id();
  forms.set(siteA, [{
    form_id: formId, name: 'Contatti', enabled: true,
    fields: [
      { key: 'name', label: 'Nome', type: 'text', required: true, max_length: 120, options: [] },
      { key: 'email', label: 'Email', type: 'email', required: true, max_length: 254, options: [] },
      { key: 'message', label: 'Messaggio', type: 'textarea', required: true, max_length: 3000, options: [] },
    ],
    recipients: ['info@villaaurora.it'], subject: '', submit_label: 'Invia', success_message: 'Grazie!', privacy_text: '', privacy_required: false, privacy_url: null,
    autoresponder: { enabled: false, subject: 'Abbiamo ricevuto il tuo messaggio', body: 'Grazie.' }, surface: SURFACE, created_at: daysAgo(30), updated_at: daysAgo(3),
  }]);
  for (let i = 0; i < 70; i++) {
    submissions.push({ submission_id: id(), form_id: formId, form_name: 'Contatti', created_at: daysAgo(i / 3), status: i < 5 ? 'new' : i < 40 ? 'read' : 'archived', data: { name: `Cliente ${i + 1}`, email: `cliente${i + 1}@example.com`, message: 'Vorrei informazioni sulla disponibilità per agosto.' } });
  }
  const roomId = id();
  items.set(siteA, [{
    item_id: roomId, name: 'Suite Panoramica', slug: 'suite-panoramica', type: 'ROOM', description: 'Vista sul lago, 40 mq.', price_cents: 18000, capacity: 2, cta_mode: 'book',
    image_url: null, gallery: [], amenities: ['Wi-Fi', 'Colazione'], discount_per_missing_guest_cents: 0, available_from: null, available_to: null, min_nights: 2, slots: [], duration_min: null,
    active: true, button_text: '', surface: SURFACE, created_at: daysAgo(20), updated_at: daysAgo(5),
  }]);
  prices.set(roomId, [{ day: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10), price_cents: 24000 }]);
  for (let i = 0; i < 60; i++) {
    const start = new Date(Date.now() + (i - 20) * 86_400_000).toISOString().slice(0, 10);
    bookings.push({
      booking_id: id(), item_id: roomId, item_name: 'Suite Panoramica', start, end: new Date(Date.parse(start) + 2 * 86_400_000).toISOString().slice(0, 10), slot: null, guests: 2,
      name: `Ospite ${i + 1}`, email: `ospite${i + 1}@example.com`, phone: '+39 333 1234567', notes: null, total_cents: 36000, currency: 'eur',
      status: (['PENDING', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELLED'] as const)[i % 5], cta_mode: 'book', created_at: daysAgo(i / 2),
    });
  }
  for (let i = 0; i < 120; i++) {
    consents.push({ consent_id: id(), created_at: daysAgo(i / 4), banner_version: 3, necessary: true, preferences: i % 2 === 0, analytics: i % 3 !== 0, marketing: i % 5 === 0, ip_prefix: `93.45.${i % 255}.0/24`, user_agent: 'Mozilla/5.0 (Macintosh) Safari/605.1', visitor_id: null });
  }
  for (let i = 0; i < 30; i++) subscribers.push({ email: `iscritto${i}@example.com`, status: i % 7 === 0 ? 'unsubscribed' : 'subscribed', created_at: daysAgo(i) });
  const surveyId = id();
  surveys.set(siteA, [{
    survey_id: surveyId, title: 'Come è stato il soggiorno?', description: '', active: true, submit_label: 'Invia', success_message: 'Grazie!', surface: SURFACE,
    questions: [
      { key: 'voto', text: 'Voto complessivo', type: 'rating', required: true, options: [], rating_max: 5 },
      { key: 'ritorno', text: 'Ci tornerai?', type: 'boolean', required: true, options: [], rating_max: 5 },
      { key: 'motivo', text: 'Perché hai scelto noi?', type: 'choice', required: false, options: ['Posizione', 'Prezzo', 'Recensioni'], rating_max: 5 },
      { key: 'note', text: 'Commenti', type: 'text', required: false, options: [], rating_max: 5 },
    ], created_at: daysAgo(10), updated_at: daysAgo(10), response_count: 48,
  }]);
  const accounts: Rec[] = Array.from({ length: 63 }, (_, i) => ({
    tenant_id: i === 0 ? String(me.tenant_id) : id(), email: i === 0 ? 'demo@monethical.com' : `cliente${i}@azienda${i}.it`, company: i === 0 ? 'Monethical' : `Azienda ${i}`,
    plan: i === 0 ? 'PRO' : (['FREE', 'PRO', 'EMPIRE'][i % 3] ?? 'FREE'), status: i % 11 === 10 ? 'suspended' : 'active', created_at: daysAgo(i * 3), stripe_connected: i % 2 === 0, stripe_charges_enabled: i % 4 === 0,
  }));

  const siteOf = (sid: string): Rec => {
    const s = sites.find((x) => x.site_id === sid);
    if (!s) throw new HttpError(404, 'site_not_found', 'Site not found');
    return s;
  };
  const arr = (m: Map<string, Rec[]>, k: string): Rec[] => {
    let v = m.get(k);
    if (!v) m.set(k, (v = []));
    return v;
  };
  const normDomain = (d: string): string => d.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]?.split(':')[0] ?? '';
  const taken = (domains: string[], except?: string): boolean => sites.some((s) => s.site_id !== except && list(s.domains).some((d) => domains.includes(String(d))));

  function route(method: string, path: string, query: URLSearchParams, body: Json): Reply {
    const b = rec(body);
    const m = (re: RegExp): RegExpMatchArray | null => re.exec(path);
    let r: RegExpMatchArray | null;

    if (path === '/me' && method === 'GET') return { body: me };
    if (path === '/sites' && method === 'GET') return { body: sites };
    if (path === '/sites' && method === 'POST') {
      if (!str(b.name).trim()) validation('name', 'String should have at least 1 character');
      if (sites.length >= (PLAN_MAX_SITES[String(me.plan)] ?? 1)) throw new HttpError(403, 'plan_limit', 'Site limit reached for your plan');
      const domains = [...new Set(list(b.domains).map((d) => normDomain(String(d))))];
      if (taken(domains)) throw new HttpError(409, 'domain_taken', 'A domain is already registered on another site');
      const site = mkSite(id(), str(b.name).trim(), domains.map(String));
      sites.push(site);
      return { status: 200, body: site };
    }
    if ((r = m(/^\/sites\/([^/]+)$/))) {
      const site = siteOf(r[1] ?? '');
      if (method === 'GET') return { body: site };
      if (method === 'PATCH') {
        if (b.name !== undefined) site.name = str(b.name);
        if (b.status !== undefined) site.status = str(b.status);
        if (b.domains !== undefined) {
          const domains = [...new Set(list(b.domains).map((d) => normDomain(String(d))))];
          if (taken(domains, String(site.site_id))) throw new HttpError(409, 'domain_taken', 'A domain is already registered on another site');
          site.domains = domains;
        }
        site.updated_at = now();
        return { body: site };
      }
      if (method === 'DELETE') {
        sites.splice(sites.indexOf(site), 1);
        return { status: 204 };
      }
    }
    if (!(r = m(/^\/sites\/([^/]+)\/(.+)$/))) return other(method, path, query, b);
    const sid = r[1] ?? '';
    const rest = r[2] ?? '';
    siteOf(sid);

    if (rest === 'banner') {
      if (method === 'GET') return { body: banners.get(sid) ?? defaultBanner(0) };
      const saved = { ...b, version: Number(banners.get(sid)?.version ?? 0) + 1, updated_at: now() };
      banners.set(sid, saved);
      return { body: saved };
    }
    if (rest === 'consents') return { body: page(consents, query) };
    if (rest === 'consents.csv') {
      const rows = consents.map((c) => [c.consent_id, c.created_at, c.banner_version, c.preferences, c.analytics, c.marketing, c.ip_prefix, c.user_agent].join(','));
      return { type: 'text/csv; charset=utf-8', body: ['consent_id,created_at,banner_version,preferences,analytics,marketing,ip_prefix,user_agent', ...rows].join('\n') };
    }
    if (rest === 'forms') return crud(method, arr(forms, sid), b, 'form_id');
    if ((r = /^forms\/([^/]+)$/.exec(rest))) return crud(method, arr(forms, sid), b, 'form_id', r[1]);
    if (rest === 'submissions') return { body: page(submissions, query) };
    if ((r = /^submissions\/([^/]+)$/.exec(rest))) {
      const i = submissions.findIndex((s) => s.submission_id === r?.[1]);
      if (i < 0) throw new HttpError(404, 'not_found', 'Not found');
      if (method === 'DELETE') {
        submissions.splice(i, 1);
        return { status: 204 };
      }
      const target = submissions[i];
      if (target) target.status = str(b.status);
      return { body: { ok: true } };
    }
    if (rest === 'newsletter') {
      if (method === 'GET') return { body: newsletters.get(sid) ?? defaultNewsletter() };
      newsletters.set(sid, b);
      return { body: b };
    }
    if (rest === 'subscribers') return { body: page(subscribers, query) };
    if (rest === 'surveys') return crud(method, arr(surveys, sid), b, 'survey_id');
    if ((r = /^surveys\/([^/]+)$/.exec(rest))) return crud(method, arr(surveys, sid), b, 'survey_id', r[1]);
    if ((r = /^surveys\/([^/]+)\/results$/.exec(rest))) {
      return { body: { survey_id: r[1] ?? '', responses: 48, questions: {
        voto: { average: 4.35, distribution: { 3: 4, 4: 18, 5: 26 }, count: 48 },
        ritorno: { distribution: { True: 40, False: 8 }, count: 48 },
        motivo: { distribution: { Posizione: 21, Prezzo: 9, Recensioni: 14 }, count: 44 },
        note: { samples: ['Colazione fantastica', 'Camera pulitissima', 'Torneremo!'], count: 12 },
      } } };
    }
    if (rest === 'items') return crud(method, arr(items, sid), b, 'item_id');
    if ((r = /^items\/([^/]+)$/.exec(rest))) return crud(method, arr(items, sid), b, 'item_id', r[1]);
    if ((r = /^items\/([^/]+)\/prices$/.exec(rest))) {
      const list_ = arr(prices, r[1] ?? '');
      if (method === 'GET') return { body: list_ };
      const day = b.slot ? `${str(b.date)}T${str(b.slot)}` : str(b.date);
      const existing = list_.find((p) => p.day === day);
      if (existing) existing.price_cents = Number(b.price_cents);
      else list_.push({ day, price_cents: Number(b.price_cents) });
      return { body: { ok: true } };
    }
    if ((r = /^items\/([^/]+)\/prices\/([^/]+)$/.exec(rest))) {
      const list_ = arr(prices, r[1] ?? '');
      const slot = query.get('slot');
      const key = slot ? `${r[2]}T${slot}` : r[2];
      const i = list_.findIndex((p) => p.day === key);
      if (i >= 0) list_.splice(i, 1);
      return { status: 204 };
    }
    if ((r = /^items\/([^/]+)\/block$/.exec(rest))) {
      const set = arr(blocks, r[1] ?? '');
      for (let d = str(b.start); d < str(b.end); d = new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10)) {
        const i = set.findIndex((x) => x.day === d);
        if (b.blocked && i < 0) set.push({ day: d });
        if (!b.blocked && i >= 0) set.splice(i, 1);
      }
      return { body: { ok: true } };
    }
    if ((r = /^items\/([^/]+)\/calendar$/.exec(rest))) {
      const set = arr(blocks, r[1] ?? '');
      const base = Number(arr(items, sid).find((x) => x.item_id === r?.[1])?.price_cents ?? 0);
      const over = arr(prices, r[1] ?? '');
      const out: Rec[] = [];
      for (let d = query.get('from') ?? ''; d < (query.get('to') ?? ''); d = new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10)) {
        const blocked = set.some((x) => x.day === d);
        out.push({ day: d, available: !blocked, remaining: blocked ? 0 : 1, price_cents: Number(over.find((p) => p.day === d)?.price_cents ?? base), blocked });
      }
      return { body: out };
    }
    if (rest === 'bookings') return { body: page(bookings, query) };
    if ((r = /^bookings\/([^/]+)$/.exec(rest))) {
      const bk = bookings.find((x) => x.booking_id === r?.[1]);
      if (!bk) throw new HttpError(404, 'not_found', 'Not found');
      if (bk.status === 'CANCELLED') throw new HttpError(409, 'booking_cancelled', 'A cancelled booking cannot be reopened');
      bk.status = str(b.status);
      return { body: bk };
    }
    if (rest === 'keys') {
      const ks = arr(keys, sid);
      if (method === 'GET') return { body: ks };
      if (ks.length >= 5) throw new HttpError(403, 'key_limit', 'Key limit reached for this site');
      if (!str(b.label).trim()) validation('label', 'String should have at least 1 character');
      const secret = `sk_live_${randomBytes(20).toString('hex')}`;
      const k: Rec = { key_id: id(), site_id: sid, label: str(b.label), prefix: secret.slice(0, 14), scopes: list(b.scopes), created_at: now(), last_used_at: null };
      ks.push(k);
      return { body: { ...k, secret } };
    }
    if ((r = /^keys\/([^/]+)\/rotate$/.exec(rest))) {
      const k = arr(keys, sid).find((x) => x.key_id === r?.[1]);
      if (!k) throw new HttpError(404, 'not_found', 'Not found');
      const secret = `sk_live_${randomBytes(20).toString('hex')}`;
      k.prefix = secret.slice(0, 14);
      return { body: { ...k, secret } };
    }
    if ((r = /^keys\/([^/]+)$/.exec(rest)) && method === 'DELETE') {
      const ks = arr(keys, sid);
      const i = ks.findIndex((x) => x.key_id === r?.[1]);
      if (i >= 0) ks.splice(i, 1);
      return { status: 204 };
    }
    if (rest === 'analytics') {
      const days = Number(query.get('days') ?? 30);
      const series = Array.from({ length: days }, (_, i) => {
        const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
        const w = 20 + Math.round(15 * Math.sin(i / 3)) + (i % 7);
        return { day, consent_total: w, consent_analytics: Math.round(w * 0.6), consent_marketing: Math.round(w * 0.3), form_submissions: i % 4, newsletter_signups: i % 3, survey_responses: i % 5, bookings: i % 6 === 0 ? 1 : 0 };
      });
      const totals: Rec = {};
      for (const k of ['consent_total', 'consent_analytics', 'consent_marketing', 'form_submissions', 'newsletter_signups', 'survey_responses', 'bookings']) totals[k] = series.reduce((s, p) => s + Number((p as Rec)[k]), 0);
      return { body: { days, totals, series } };
    }
    throw new HttpError(404, 'not_found', 'Route not found');
  }

  function other(method: string, path: string, query: URLSearchParams, b: Rec): Reply {
    let r: RegExpMatchArray | null;
    if (path === '/stripe/status') return { body: stripe };
    if (path === '/stripe/connect') {
      const ok = sites.some((s) => list(s.domains).some((d) => str(b.return_url).startsWith(`https://${String(d)}`)));
      if (!ok) throw new HttpError(400, 'invalid_return_url', 'URL must be on one of your site domains');
      stripe = { connected: true, charges_enabled: true };
      me.stripe_connected = true;
      return { body: { url: str(b.return_url) } };
    }
    if (path === '/admin/accounts' && method === 'GET') return { body: page(accounts, query) };
    if (path === '/admin/accounts' && method === 'POST') {
      if (accounts.some((a) => a.email === str(b.email).toLowerCase())) throw new HttpError(409, 'account_exists', 'An account with this email already exists');
      const a: Rec = { tenant_id: id(), email: str(b.email).toLowerCase(), company: str(b.company), plan: str(b.plan) || 'FREE', status: 'active', created_at: now(), stripe_connected: false, stripe_charges_enabled: false };
      accounts.unshift(a);
      return { body: a };
    }
    if ((r = /^\/admin\/accounts\/([^/]+)$/.exec(path)) && method === 'PATCH') {
      const a = accounts.find((x) => x.tenant_id === r?.[1]);
      if (!a) throw new HttpError(404, 'account_not_found', 'Account not found');
      Object.assign(a, b);
      if (a.tenant_id === me.tenant_id) Object.assign(me, { plan: a.plan, plan_name: PLAN_NAMES[String(a.plan)], max_sites: PLAN_MAX_SITES[String(a.plan)] });
      return { body: a };
    }
    throw new HttpError(404, 'not_found', 'Route not found');
  }

  function crud(method: string, store: Rec[], b: Rec, idKey: string, itemId?: string): Reply {
    if (itemId === undefined) {
      if (method === 'GET') return { body: store };
      if (store.length >= 5) throw new HttpError(403, 'plan_limit', 'Limit reached for your plan');
      const created: Rec = { ...b, [idKey]: id(), created_at: now(), updated_at: now(), ...(idKey === 'survey_id' ? { response_count: 0 } : {}) };
      store.push(created);
      return { body: created };
    }
    const i = store.findIndex((x) => x[idKey] === itemId);
    const current = store[i];
    if (!current) throw new HttpError(404, 'not_found', 'Not found');
    if (method === 'DELETE') {
      store.splice(i, 1);
      return { status: 204 };
    }
    if (method === 'GET') return { body: current };
    const updated: Rec = { ...b, [idKey]: itemId, created_at: current.created_at, updated_at: now(), ...(idKey === 'survey_id' ? { response_count: current.response_count ?? 0 } : {}) };
    store[i] = updated;
    return { body: updated };
  }

  return { route };
}

function defaultBanner(version: number): Rec {
  return {
    enabled: true, layout: 'bar-bottom', language: 'it', surface: SURFACE,
    texts: {
      title: 'Rispettiamo la tua privacy', body: 'Usiamo i cookie per far funzionare il sito, misurare il traffico e, con il tuo consenso, per il marketing.', accept_all: 'Accetta tutto', reject_all: 'Solo necessari',
      customize: 'Personalizza', save: 'Salva scelte', privacy_link_label: 'Informativa privacy', reopen_label: 'Impostazioni cookie', necessary_label: 'Necessari', necessary_description: 'Indispensabili al funzionamento.',
      preferences_label: 'Preferenze', preferences_description: 'Ricordano le tue impostazioni.', analytics_label: 'Statistiche', analytics_description: 'Ci aiutano a capire come viene usato il sito.', marketing_label: 'Marketing', marketing_description: 'Per mostrarti offerte pertinenti.',
    },
    logo_url: null, privacy_url: null, categories: ['necessary', 'preferences', 'analytics', 'marketing'], show_reopen_badge: true, consent_expiry_days: 180, google_consent_mode: true, version, updated_at: '',
  };
}

function defaultNewsletter(): Rec {
  return {
    enabled: false, headline: 'Iscriviti alla newsletter', subheadline: 'Novità e offerte, niente spam.', button_label: 'Iscriviti', email_placeholder: 'La tua email', privacy_text: 'Acconsento a ricevere la newsletter.',
    privacy_url: null, success_message: 'Grazie per l’iscrizione!', surface: SURFACE,
  };
}
