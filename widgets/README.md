# Monethical widgets

Embeddable customer-site widgets: cookie-consent banner (GDPR + Google Consent Mode v2), contact form,
newsletter signup, survey, and a catalog/booking widget. Zero runtime dependencies, TypeScript strict,
Shadow DOM, no webfonts, no third-party requests.

## Embed

```html
<script src="https://EDGE/w/loader.js" data-site-key="pk_live_..." async></script>

<div data-monethical-widget="contact-form" data-form-id="FORM_ID"></div>
<div data-monethical-widget="newsletter"></div>
<div data-monethical-widget="survey" data-id="SURVEY_ID"></div>
<div data-monethical-widget="items"></div>            <!-- all active items -->
<div data-monethical-widget="items" data-slug="sea-room"></div>  <!-- one item -->
```

Place the loader as high in `<head>` as possible (before Google tags) so Consent Mode defaults are set early.
Containers may exist before the loader or be added later (SPA): a `MutationObserver` limited to
`[data-monethical-widget]` mounts them.

### Script attributes

| Attribute | Default | Meaning |
|---|---|---|
| `data-site-key` | required | public site key (`pk_live_...`) |
| `data-base` | directory of the loader's own `src` | where the content-hashed modules live |
| `data-api-base` | origin of the loader's `src` | serves `/config/<key>/site.json` and `/public/*` |

The loader is idempotent (a second injection does nothing), fetches `/config/<key>/site.json` immediately
(`cache: 'default'`), and imports only the modules the page needs, in parallel. The edge distribution
must send `Access-Control-Allow-Origin: *` for `/w/*` (ES modules are fetched in CORS mode).

### Container attributes

| Widget | Attributes |
|---|---|
| `contact-form` | `data-form-id` (omit to use the first form) |
| `survey` | `data-id` (omit to use the first survey) |
| `items` | `data-slug` (optional, one item) |
| `newsletter` | none |

### Consent gating

```html
<script type="text/plain" data-monethical-category="analytics" data-src="https://stats.example.com/a.js" async></script>
<script type="text/plain" data-monethical-category="marketing">/* inline */</script>
<iframe data-monethical-category="marketing" data-src="https://video.example.com/embed"></iframe>
```

Categories: `necessary` (always), `preferences`, `analytics`, `marketing`. Scripts are replaced by live
copies after consent (a script cannot be un-run: withdrawal takes full effect on the next page load).
Iframes get their `src` removed again when consent is withdrawn.

## Public API and events

```js
Monethical.consent.get()            // {necessary, preferences, analytics, marketing} | null (no valid choice yet)
Monethical.consent.open()           // open the preferences panel
const off = Monethical.consent.onChange(state => {...})   // returns an unsubscribe function
```

`window` events (all `CustomEvent`, payload in `detail`):

| Event | Detail |
|---|---|
| `monethical:consent` | consent state; fired on load when a valid stored choice exists and on every change |
| `monethical:submit` | `{widget, id?}` after a successful form / newsletter / survey submission |
| `monethical:booking` | `{item, booking_id, status}` |
| `monethical:error` | `{message, widget?}`; the only way errors surface, the loader never throws and never logs |

Consent is stored in the first-party cookie and `localStorage` key `monethical_consent`
(`banner_version`, `categories`, `updated`, `expires`, `visitor_id`). It is requested again when the banner
version increases or `consent_expiry_days` have passed. The proof is sent to `POST /public/<key>/consent`
with `fetch(..., {keepalive: true})`, fire-and-forget with one retry.

Google Consent Mode v2: with `google_consent_mode`, the seven signals are pushed to `dataLayer` as
`denied` (with `wait_for_update: 500` for new visitors) before anything else, then updated on load (stored
choice) and on every choice. Only `window.Monethical` and `dataLayer` are touched on the host page.

## Size budgets (gzip, entry + shared chunks it imports; `npm run size`)

| Bundle | Budget | Measured |
|---|---|---|
| `loader.js` | 3 KB | see `npm run size` |
| consent | 9 KB | |
| forms | 7 KB | |
| newsletter | 5 KB (brief: 4 KB, see note) | |
| survey | 7 KB (brief: 6 KB, see note) | |
| items / booking | 14 KB | |

Note: the shared infrastructure (DOM helpers, token sanitizer, API client, five-language messages, form
building blocks) is about 4 KB gzip and is counted in every form-like module, so newsletter and survey
budgets were raised slightly above the original brief. Brotli numbers are printed too.

## Security rules (enforced by tests)

* No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `srcdoc`,
  `DOMParser`, `javascript:` or inline `on*` attributes anywhere in `src/` (`tests/security.test.ts` greps).
  All DOM is built with `createElement` / `textContent`.
* Styling only through CSS custom properties derived from validated tokens: hex colors are re-validated
  (fallback to defaults), radius clamped, font/elevation/density from closed lists, system font stacks only.
  Text/background and accent/accent-text are repaired to a readable contrast if the configured pair is not.
* Only `https:` image and link URLs are rendered; checkout redirects require `https:`.
* No third-party requests; all network goes to the configured API base. Requests use `credentials: 'omit'`.
* Honeypot field `website` (visually hidden, `tabindex=-1`, `autocomplete=off`).

## i18n

Default UI strings (buttons and messages not in the config) exist for `it`, `en`, `de`, `fr`, `es`, chosen
from `document.documentElement.lang`, then the banner `language`, then `en`. Each module owns its own tiny
dictionary, so only what a module uses is bundled with it.

## Console previews

`@widgets/preview` (`package.json` `exports`, types in `@widgets/types`):

```ts
mountBannerPreview(host, bannerConfig)      // -> { update(config), destroy() }
mountFormPreview(host, publicForm)
mountNewsletterPreview(host, newsletterConfig)
mountSurveyPreview(host, publicSurvey)
mountItemPreview(host, catalogItem)
```

They run the production rendering code but never use the network, cookies, storage, `dataLayer` or script
gating. The banner is positioned inside `host`, which must be `position: relative`.

## Development

```
npm ci
npm run lint && npm run typecheck && npm test
npm run build        # dist/loader.js (stable name) + content-hashed ES modules and chunks
npm run size         # fails when a budget is exceeded
npm run demo         # http://localhost:4173 with mocked config and API
```

`dist/loader.js` embeds the manifest `{module -> hashed file}` at build time (`scripts/build.mjs`);
`dist/manifest.json` additionally lists each module's shared chunks (used by `scripts/size.mjs`).

### Adding a module

1. Create `src/<name>.ts` exporting `mount(el, doc, boot)` (container based) or `start(doc, boot)`
   (page-wide); render with `mountShadow`, `h`, `applyTokens` and keep strings in a module-local dictionary.
2. Add the name to `MODULES` in `scripts/build.mjs`, the widget type to `WIDGETS` in `src/loader.ts` and a
   budget to `scripts/size.mjs`.
3. Export a `mountXxx(parent, config, api, lang)` function and wrap it in `src/preview.ts`.
4. Add tests (including a malicious-config case in `tests/xss.test.ts`).
