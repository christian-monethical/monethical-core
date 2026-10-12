# Architecture

## Components

| Component | Tech | Responsibility |
|---|---|---|
| Console API (`handlers/console.py`) | Lambda, Powertools, Pydantic | Authenticated CRUD for sites, banner, forms, items, bookings, keys, analytics, staff admin |
| Public API (`handlers/public.py`) | Lambda | Visitor writes (consent, form, newsletter, survey, booking), availability reads, Stripe webhook, legacy adapters |
| Worker (`handlers/worker.py`) | Lambda + SQS | Sends e-mails (form notification, autoresponder, booking mails) through SES with retries and a DLQ |
| DynamoDB | single table `PK/SK` + `gsi1` | All data; TTL attribute `expires_at` |
| S3 + CloudFront (edge) | static | Widget bundles (`/w/*`, content-hashed) and per-site config snapshots (`/config/<site_key>/site.json`, 60 s cache) |
| S3 + CloudFront (console) | static | Preact console. `/api/*` is routed to the API (path prefix stripped) so there is no CORS |
| Cognito | User pool | Staff-created accounts, PKCE login, optional TOTP MFA, `staff` group |

## Why a page view costs no Lambda invocation

Widgets never call the API to *render*. When a customer saves a configuration the console
rebuilds `config/<site_key>/site.json` (banner + public form definitions + newsletter + surveys +
catalog) and uploads it to S3. Widgets read that file from CloudFront. Only visitor *actions*
(consent given, form sent, booking made) reach Lambda.

## Data model (single table)

```
ACCOUNT#<tenant>   PROFILE                 plan, status, stripe account, e-mail      (GSI1: ACCOUNTS)
ACCOUNT#<tenant>   SITE#<site>             name, site_key, domains, status
ACCOUNT#<tenant>   KEY#<key_id>            secret-key record (hash only)
SITEKEY#<pk_live>  LOOKUP                  site_id, tenant_id, domains, status      (1 GetItem per public request)
DOMAIN#<host>      LOOKUP                  uniqueness: a host belongs to one site
SECRET#<sha256>    LOOKUP                  tenant, site, scopes
SITE#<site>        BANNER                  config + version
SITE#<site>        FORM#<id>               form definition
SITE#<site>        SUB#<ulid>              submission (TTL 2 y)
SITE#<site>        CONSENT#<ulid>          consent proof incl. banner version (TTL 5 y)
SITE#<site>        ITEM#<id> / SLUG#<slug> catalog item and unique slug lookup
SITE#<site>        OCC#<item>#<day[Thh:mm]> capacity counter  (taken, blocked)
SITE#<site>        PRICE#<item>#<day>      price override
SITE#<site>        BOOKING#<id>            booking          (GSI1: SITE#<site>#BOOKINGS, newest first)
SITE#<site>        NLSUB#<hash> / NEWSLETTER / SURVEY#<id> / STAT#<day>
SITE#<site>#SURVEY#<id>  RESP#<ulid>       survey responses
RL#<scope>#<subject> <window>              rate-limit counter (TTL)
```

IDs are 26-char time-sortable (ULID-style), so lists are newest-first with a plain range query.
All lists are cursor-paginated; the cursor must belong to the queried partition.

## Booking without double-booking

`OCC#<item>#<day>` is a counter updated inside the *same* DynamoDB transaction that writes the
booking, with a condition (`taken <= capacity - guests`, not blocked). Two concurrent visitors can
never both take the last room-night or seat. Cancelling releases the counters in a transaction.
Paid bookings stay `PENDING` (capacity held) until Stripe confirms; Checkout sessions expire after
~30 minutes and the `checkout.session.expired` webhook cancels the booking.

Prices are always computed server side from the item and its overrides; the client never sends a total.

## Compatibility with the retired services

* `GET /banners/by-site?site_url=` and `POST /consents` mimic Agriconsent. The `id` in the banner
  response is the new `site_id`, so sites that fetch the banner first keep working.
* `POST /contact` mimics FormRelay (`{ok: true}`, honeypot `website`, Origin allow-list). It posts
  into the site's first enabled form, which must keep the `name`, `email`, `phone`, `message` keys.
* Sites only need their base URL repointed to the edge distribution.
