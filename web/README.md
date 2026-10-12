# Monethical console (`web/`)

Customer + staff console. Preact 10-compatible stack (Preact 11, `@preact/signals`, `wouter-preact`),
TypeScript strict, Vite, plain CSS with design tokens. No UI framework, no chart/date/utility libraries.

* Customers manage their sites: banner, forms + submissions, newsletter, surveys, catalog + bookings,
  consents (CSV), secret API keys, analytics, Stripe payments.
* Staff (Cognito group `staff`, decided by `GET /v1/me` -> `is_staff`) invite and manage accounts.
* Italian by default, English available (account page; stored in `localStorage`).

## Setup

```bash
cd web
npm ci
cp .env.example .env.local      # fill in the Cognito values
npm run dev                     # real API: set VITE_API_BASE to the API origin (needs CORS) or add a dev proxy
npm run dev:mock                # fixtures served by a Vite middleware, no AWS, no login
```

| Script | What it does |
|---|---|
| `npm run dev` / `dev:mock` | dev server (`dev:mock` fakes `/api/v1/*` and the session) |
| `npm run build` | `tsc --noEmit` then `vite build` into `dist/` |
| `npm run preview` | serve `dist/` |
| `npm run lint` | ESLint flat config (typescript-eslint + jsx-a11y) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest + @testing-library/preact + happy-dom |
| `npm run gen:api` | regenerate `src/api/schema.d.ts` from `../docs/openapi/console.json` (generated file is committed) |
| `npm run size` | real gzip sizes of the build, fails above the initial-JS budget |

### Environment (`import.meta.env`)

| Variable | Meaning |
|---|---|
| `VITE_COGNITO_DOMAIN` | Hosted UI domain without scheme |
| `VITE_COGNITO_CLIENT_ID` | public app client (PKCE, no secret); callback `<origin>/auth/callback`, logout `<origin>/` |
| `VITE_API_BASE` | console API base, default `/api` (CloudFront strips the prefix, so no CORS) |
| `VITE_EDGE_URL` | edge distribution; used by the embed snippet (`<EDGE>/w/loader.js`) |

## Structure

```
src/
  app/        shell (sidebar, skip link, unsaved-changes guard), routes (lazy), prefetch, error boundary
  auth/       PKCE helpers, Cognito endpoints, token store (refresh), session signals, JWT display decode
  api/        openapi-fetch client, authed fetch (401 -> refresh once -> re-login), ApiError mapping,
              query cache (SWR + dedupe), hooks (useQuery, useMutation, usePaged, optimistic), generated schema
  features/   sites, banner, forms, newsletter, surveys, catalog, bookings, consents, keys, analytics,
              payments, admin, account, design (shared editor pieces: SurfaceEditor, EditorShell, rules, useEditor)
  preview/    adapter.tsx (real widget previews), lazy.tsx (lazy wrappers), convert.ts, widget-types.ts
  ui/         Button, Field/TextInput/TextArea/Select, Switch, Segmented, Tabs, SubNav, Dialog, ConfirmDialog,
              Toaster, Table, TagInput, ColorField, Slider, Skeleton, EmptyState/ErrorState, LoadMore, CopyButton, charts
  i18n/       it.ts (defines the key type), en.ts (lazy chunk), t()/formatters
  styles/     tokens.css (light/dark), base, layout, components; route CSS lives next to each feature
mock/         dev-only mock API (Vite plugin) with realistic fixtures
tests/        vitest suites
```

### Add a feature

1. `src/features/<name>/api.ts`: typed calls with `api.GET/PUT/...` and `body()`; add cache keys to `src/api/keys.ts`.
2. UI: `useQuery(K.x, fetcher)` for reads, `useMutation(fn, { invalidate: [K.x] })` for writes,
   `optimistic([patchCache(...)], action)` for toggles. Editors use `useEditor` (draft, validation,
   server `details` mapping, unsaved guard) + `EditorShell`/`SaveBar`.
3. Add strings to `i18n/it.ts` (TypeScript then forces them into `en.ts`).
4. Register the screen: site tab in `features/sites/tabs.ts`, or a page in `app/routes.ts` + `app/App.tsx`.
   Everything is `lazy()`; keep the loader reference so links can prefetch it.

## Auth

Authorization Code + PKCE against the Cognito Hosted UI, implemented in `src/auth` (no Amplify).
Access token in memory, refresh token in `sessionStorage` (never `localStorage`), silent refresh one minute
before expiry, concurrent refreshes share one request, `401` -> refresh once -> otherwise login again.
The id token is decoded only to display the e-mail; authorization always comes from `/v1/me`.
The post-login return path is validated (same-origin, not `/auth/*`).

## Widget previews

`src/preview/adapter.tsx` imports the real `@widgets/preview` (alias `@widgets -> ../widgets/src` in
`vite.config.ts` / `tsconfig.json`, which also includes `../widgets/src/env.d.ts`) and converts the editing
models into the public `site.json` shapes (`convert.ts`). Editors use `preview/lazy.tsx`, so the widgets
runtime is a separate chunk loaded while the controls render. Widgets render in a Shadow DOM; the preview
stage is `position: relative` so the banner is positioned inside it.

## Performance budget

* Initial JS <= 55 KB gzip (`npm run size` enforces it). Every screen and site tab is a separate lazy chunk;
  English and the widget previews are lazy too; CSS of editors/charts/calendar is split per chunk.
* Links prefetch their chunk on hover/focus/touch; the site workspace is prefetched when idle.
* System fonts, no web fonts, no images; skeletons have fixed heights to avoid layout shift.
* Requests are de-duplicated and cached (30 s stale window, SWR); mutations invalidate by key prefix.

## Security notes

No `innerHTML` (lint rule), no inline scripts (CSP `script-src 'self'`), tokens never in `localStorage`,
all user input validated client-side with the server rules (`features/design/rules.ts`) and the server's
`details` shown next to the fields. Secret keys are shown once in a non-dismissable dialog and never stored.
