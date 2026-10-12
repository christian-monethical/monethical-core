# Security model

## Findings in the previous codebases that this design removes

| Previous issue | Now |
|---|---|
| Public `GET /dump/{collection}` exporting every collection (customer e-mails, phones) | No generic export endpoints. Data is read only through ownership-checked console routes or scoped `sk_live_` keys |
| Consents/config of any site readable or writable by anyone knowing the *public* site key (`/gdpr/config`, `/gdpr/consents`) | Site data is reachable only via `ACCOUNT#<sub>/SITE#<id>` loaded from the JWT subject; foreign and missing sites both return 404 (tested in `test_other_tenant_cannot_touch_site`) |
| Free-form `html_content`/`css_content` stored and injected into customers' pages | Closed token schema (`domain/styles.py`); colors validated as hex, URLs https-only; widgets render with `textContent` inside Shadow DOM |
| Fake/mock auth, HS256 self-issued JWT, API keys in clear | Cognito (PKCE, optional MFA), JWT verified by API Gateway; secret keys stored as SHA-256 only, shown once, rotatable |
| Origin-only protection, spoofable with `curl`, no rate limit | Origin allow-list **plus** DynamoDB-backed rate limiting per visitor (works across Lambda instances), honeypot, size limits, strict schemas |
| `X-Forwarded-For` first value trusted | Viewer IP from `CloudFront-Viewer-Address`; direct API access blocked by `x-origin-verify` |
| Reversible `sha256(ip+tenant)` | `HMAC(pepper, site\|ip)`; only a /24 (/48) prefix is stored for display |
| Service-account key in 3 places, never rotated | No Google dependency; secrets only in Secrets Manager |
| Logs without retention containing PII | 30-day retention, structured logs, no request bodies logged |
| Client-supplied booking totals | Totals computed server side |
| `str(e)` returned to clients | Typed errors with safe messages; unexpected errors return a generic 500 |

## Controls

* **AuthN/Z**: Cognito + API Gateway JWT authorizer; `staff` group for account administration;
  every site-scoped route calls `console_ctx.site_context()`.
* **Tenant isolation**: partition per site; ownership resolved server side; cursors bound to the partition.
* **Input**: Pydantic `extra="forbid"` everywhere, length limits, 32 KB body cap before parsing.
* **Output**: e-mail HTML escaped; CSV exports neutralize spreadsheet formulas; CSP and HSTS on the console.
* **Abuse**: rate limits (20 writes/min per visitor and site), honeypot, optional WAF on the edge distribution.
* **Payments**: Stripe Connect; webhook signature verified, events deduplicated, session id matched to the booking.
* **Privacy**: consent records keep banner version and a masked IP; TTLs on consents (5 y), submissions
  and survey responses (2 y); account export/erase runbooks in `docs/runbook.md`.
* **Supply chain**: pinned runtime dependencies, Dependabot, `pip-audit`/`npm audit` in CI.

## Known limits (accepted)

* A non-browser client can forge `Origin`; the damage is bounded by rate limits and validation.
  Add Turnstile to a form if a customer is targeted by spam.
* Config snapshots are public by design and must never contain private data (tested).
