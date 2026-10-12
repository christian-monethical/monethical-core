# Monethical Core

Multi-tenant platform for customer websites: **cookie-consent banner**, **contact forms**,
**newsletter**, **surveys** and **booking / commerce**, configured by each customer from a web
console. Replaces the former `agriconsent-cookiesbanner` and `formrelay` services (both keep
working through compatibility adapters until every site has migrated).

```
backend/    Python 3.13 on AWS Lambda (Powertools + Pydantic v2), DynamoDB single table
widgets/    Embeddable customer-site widgets (TypeScript, zero dependencies, Shadow DOM)
web/        Customer console (Preact + TypeScript + Vite), Cognito login
infra/      AWS SAM template: Cognito, HTTP API, 3 Lambdas, DynamoDB, S3, CloudFront, SQS, alarms
docs/       Architecture, security model, runbooks, generated OpenAPI specs
```

## How it fits together

```
 visitor browser ──► /w/loader.js ──► /config/<site_key>/site.json   (CloudFront + S3, no Lambda)
        │                                   ▲ rebuilt by the console on every save
        └─ POST /public/<site_key>/…  ──► Public Lambda ──► DynamoDB ──► SQS ──► Worker ──► SES

 customer (console)  ──► Cognito (PKCE) ──► /api/v1/…  ──► Console Lambda ──► DynamoDB
 Monethical staff    ──► same console, `staff` group: creates and manages customer accounts
```

* **Accounts** are created only by Monethical staff (Cognito `AdminCreateUser`). One account owns
  many **sites**; everything else (banner, forms, items, consents…) belongs to a site.
* **Public site key** (`pk_live_…`) identifies a site in the embed snippet. It is not a secret:
  writes are accepted only from the site's registered domains, are rate limited, and are
  re-validated server side.
* **Secret keys** (`sk_live_…`) are for server-to-server access, shown once, stored as hashes.
* **Styling** is a closed set of validated design tokens (colors, radius, font family…), never raw
  CSS/HTML, so a configuration cannot inject code into a customer's page.

See [docs/architecture.md](docs/architecture.md), [docs/security.md](docs/security.md) and
[docs/runbook.md](docs/runbook.md).

## Develop

```bash
make setup        # backend venv + web/widgets npm install
make check        # ruff, mypy --strict, pytest (coverage gate 85 %), lint + tests for web/widgets
make openapi      # regenerate docs/openapi/*.json after API changes
```

Backend tests run entirely against `moto` (no AWS account needed).

## Deploy (test environment)

```bash
cd infra
sam build --use-container -t template.yaml
sam deploy --guided --config-env test       # first time; then: sam deploy --config-env test
make publish-web  publish-widgets          # S3 sync + CloudFront invalidation
```

Required once per environment: verify the SES sender, set the Stripe secret
(`aws secretsmanager put-secret-value`), add the first staff user to the Cognito `staff` group.
Details in the [runbook](docs/runbook.md).

## Conventions

* Python: ruff (`E W F I B UP S C4 SIM RUF PT`), `mypy --strict`, ≥ 85 % coverage.
* One reason to change per module; domain code never imports API code.
* Every console route reaches site data through `console_ctx.site_context()` (ownership check).
* No secrets in the repository or in Lambda environment variables (Secrets Manager only).
