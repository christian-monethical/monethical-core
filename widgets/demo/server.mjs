// Local demo: serves dist/ under /w/, the demo page, a mocked /config/<key>/site.json and
// mocked /public/<key>/* endpoints (same shapes and error format as the real API).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);
const KEY = `pk_live_${'0123456789abcdef'.repeat(2)}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

const surface = (over = {}) => ({
  background: '#ffffff', text: '#1d1d1f', muted: '#6e6e73', accent: '#0f172a', accent_text: '#ffffff',
  border: '#e5e5ea', radius: 14, elevation: 'medium', density: 'comfortable', font: 'system', ...over,
});

const item = (over) => ({
  item_id: over.slug, description: '', capacity: 2, cta_mode: 'request', image_url: null, gallery: [], amenities: [],
  discount_per_missing_guest_cents: 0, available_from: null, available_to: null, min_nights: 1, slots: [],
  duration_min: null, active: true, button_text: '', surface: surface(), ...over,
});

const siteDoc = () => ({
  v: 1,
  site_key: KEY,
  generated_at: new Date().toISOString(),
  banner: {
    enabled: true, layout: 'bar-bottom', language: 'en', surface: surface(), logo_url: null,
    privacy_url: 'https://example.com/privacy', categories: ['necessary', 'preferences', 'analytics', 'marketing'],
    show_reopen_badge: true, consent_expiry_days: 180, google_consent_mode: true, version: 1,
    texts: {
      title: 'We value your privacy',
      body: 'We use cookies to make the site work, to measure traffic and, with your consent, for marketing.',
      accept_all: 'Accept all', reject_all: 'Only necessary', customize: 'Customize', save: 'Save choices',
      privacy_link_label: 'Privacy policy', reopen_label: 'Cookie settings', necessary_label: 'Necessary',
      necessary_description: 'Required for the site to function. Always on.', preferences_label: 'Preferences',
      preferences_description: 'Remember your settings such as language.', analytics_label: 'Analytics',
      analytics_description: 'Help us understand how the site is used.', marketing_label: 'Marketing',
      marketing_description: 'Used to show relevant offers.',
    },
  },
  forms: [{
    form_id: 'contact', name: 'Contact', submit_label: 'Send message', success_message: 'Thank you! We will reply soon.',
    privacy_text: 'I agree to the processing of my data.', privacy_required: true, privacy_url: 'https://example.com/privacy',
    surface: surface(),
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, options: [], max_length: 120 },
      { key: 'email', label: 'Email', type: 'email', required: true, options: [], max_length: 254 },
      { key: 'phone', label: 'Phone', type: 'tel', required: false, options: [], max_length: 50 },
      { key: 'topic', label: 'Topic', type: 'select', required: false, options: ['Booking', 'Press', 'Other'], max_length: 50 },
      { key: 'message', label: 'Message', type: 'textarea', required: true, options: [], max_length: 3000 },
    ],
  }],
  newsletter: {
    enabled: true, headline: 'Subscribe to our newsletter', subheadline: 'News and offers, no spam.', button_label: 'Subscribe',
    email_placeholder: 'Your email', privacy_text: 'I agree to receive the newsletter.', privacy_url: 'https://example.com/privacy',
    success_message: 'Thanks for subscribing!', surface: surface({ accent: '#0b6b4f', radius: 24 }),
  },
  surveys: [{
    survey_id: 'nps', title: 'How did we do?', description: 'Two quick questions.', submit_label: 'Send feedback',
    success_message: 'Thank you for your feedback!', surface: surface({ font: 'serif' }),
    questions: [
      { key: 'score', text: 'How likely are you to recommend us?', type: 'rating', required: true, options: [], rating_max: 10 },
      { key: 'again', text: 'Would you come back?', type: 'boolean', required: false, options: [], rating_max: 5 },
      { key: 'comment', text: 'Anything else?', type: 'text', required: false, options: [], rating_max: 5 },
    ],
  }],
  catalog: [
    item({ name: 'Sea view room', slug: 'sea-view-room', type: 'ROOM', price_cents: 14000, capacity: 3, min_nights: 2, cta_mode: 'book',
      description: 'Bright room with a balcony over the bay.', amenities: ['Wi-Fi', 'Breakfast', 'Air conditioning'],
      discount_per_missing_guest_cents: 2000, surface: surface({ accent: '#0f4c81' }) }),
    item({ name: 'Sunset boat tour', slug: 'sunset-tour', type: 'EXPERIENCE', price_cents: 4500, capacity: 8, slots: ['17:30', '19:00'],
      duration_min: 120, cta_mode: 'pay', description: 'Two hours along the coast with an aperitivo.' }),
    item({ name: 'Local honey', slug: 'honey', type: 'PRODUCT', price_cents: 900, capacity: 20, description: 'Raw wildflower honey, 500 g.' }),
  ],
});

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const fail = (res, status, code, message) => json(res, status, { error: { code, message } });

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
};

const iso = (d) => d.toISOString().slice(0, 10);
const availability = (url, price) => {
  const from = new Date(`${url.searchParams.get('from')}T00:00:00Z`);
  const to = new Date(`${url.searchParams.get('to')}T00:00:00Z`);
  const out = [];
  for (let d = from; d < to; d = new Date(d.getTime() + 86_400_000)) {
    const blocked = d.getUTCDate() % 9 === 0; // every 9th day is "full"
    out.push({ day: iso(d), available: !blocked, remaining: blocked ? 0 : 1, price_cents: price + (d.getUTCDay() >= 5 ? 2000 : 0) });
  }
  return out;
};

async function api(req, res, url) {
  const [, , key, ...rest] = url.pathname.split('/');
  if (key !== KEY) return fail(res, 404, 'site_not_found', 'Site not found');
  const path = `/${rest.join('/')}`;
  if (req.method === 'POST') {
    const body = await readBody(req);
    console.log(`[mock] POST ${path}`, JSON.stringify(body));
    if (path === '/consent') return json(res, 200, { ok: true });
    if (/^\/forms\/[^/]+\/submit$/.test(path)) {
      if (String(body.data?.message ?? '').trim().toLowerCase() === 'rate') return fail(res, 429, 'rate_limited', 'Too many requests');
      if (String(body.data?.email ?? '').endsWith('@invalid.test')) {
        return fail(res, 400, 'invalid_submission', 'Validation failed: email:invalid_email');
      }
      return json(res, 200, { ok: true });
    }
    if (path === '/newsletter/subscribe') return body.consent ? json(res, 200, { ok: true }) : fail(res, 400, 'consent_required', 'Consent is required');
    if (/^\/surveys\/[^/]+\/respond$/.test(path)) return json(res, 200, { ok: true });
    const book = /^\/items\/([^/]+)\/book$/.exec(path);
    if (book) {
      const item = siteDoc().catalog.find((i) => i.slug === book[1]);
      if (!item) return fail(res, 404, 'item_not_found', 'Item not found');
      if (String(body.name).toLowerCase() === 'conflict') return fail(res, 409, 'not_available', 'Not available for the selected dates');
      const booking = {
        booking_id: 'demo', item_id: item.item_id, item_name: item.name, start: body.start, end: body.end ?? body.start,
        slot: body.slot ?? null, guests: body.guests, total_cents: item.price_cents * body.guests, currency: 'eur',
        status: item.cta_mode === 'book' ? 'CONFIRMED' : 'PENDING', cta_mode: item.cta_mode,
      };
      return json(res, 200, { booking, checkout_url: item.cta_mode === 'pay' ? 'https://example.com/checkout-demo' : null });
    }
  }
  const avail = /^\/items\/([^/]+)\/availability$/.exec(path);
  if (req.method === 'GET' && avail) {
    const item = siteDoc().catalog.find((i) => i.slug === avail[1]);
    return item ? json(res, 200, availability(url, item.price_cents)) : fail(res, 404, 'item_not_found', 'Item not found');
  }
  return fail(res, 404, 'not_found', 'Not found');
}

async function file(res, path, cache) {
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': cache,
      'access-control-allow-origin': '*',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const run = async () => {
    if (url.pathname === '/' || url.pathname === '/index.html') return file(res, join(root, 'demo', 'index.html'), 'no-store');
    if (url.pathname === '/frame.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<p style="font:14px system-ui;padding:8px">Gated iframe content (loaded after marketing consent)</p>');
    }
    if (url.pathname === `/config/${KEY}/site.json`) {
      res.setHeader('cache-control', 'public, max-age=60');
      return json(res, 200, siteDoc());
    }
    if (url.pathname.startsWith('/public/')) return api(req, res, url);
    if (url.pathname.startsWith('/w/')) {
      const name = normalize(url.pathname.slice(3)).replace(/^([/\\]|\.\.)+/, '');
      const cache = name === 'loader.js' ? 'no-cache' : 'public, max-age=31536000, immutable';
      return file(res, join(root, 'dist', name), cache);
    }
    res.writeHead(404).end('not found');
  };
  run().catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => {
  console.log(`Monethical widgets demo: http://localhost:${PORT}  (site key ${KEY})`);
  console.log('Tips: message "rate" -> 429, email x@invalid.test -> field error, booking name "conflict" -> 409');
});
