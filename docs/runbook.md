# Runbook

## First deployment of an environment

1. Verify the SES sender identity in the target region; request SES production access if still in sandbox.
2. `sam build --use-container && sam deploy --guided` with the parameters from `infra/template.yaml`
   (`Stage`, `CognitoDomainPrefix`, `SesFromAddress`, `SesIdentityArn`, `OriginVerifySecret`, `AlarmEmail`,
   `ConsoleCallbackUrls`). Keep the answers in `samconfig.toml` (git-ignored).
3. Put the Stripe keys in the secret created by the stack:
   `aws secretsmanager put-secret-value --secret-id <StripeSecretArn> --secret-string '{"secret_key":"sk_...","webhook_secret":"whsec_..."}'`
   and point a Stripe webhook (events: `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`, `account.updated`) at `<EdgeUrl>/webhooks/stripe`.
4. Create the first staff user and add it to the `staff` group:
   ```bash
   aws cognito-idp admin-create-user --user-pool-id <UserPoolId> --username you@monethical.com
   aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username you@monethical.com --group-name staff
   ```
5. `make publish-web publish-widgets` with the stack outputs exported as environment variables.

## Day to day

| Task | How |
|---|---|
| New customer | Console → Admin → Accounts → *Invite* (e-mail + plan). Cognito e-mails a temporary password |
| Change a plan / suspend | Console → Admin → Accounts. Suspending pauses and unpublishes every site |
| Add a site | Customer: Sites → *New site* with its domains; copy the embed snippet from the site page |
| Rotate a secret key | Site → API keys → *Rotate* (old key stops working immediately) |
| Deploy a backend change | CI runs `make check`, then `sam deploy` to test; promote to prod by tag |
| Roll back | Redeploy the previous tag (`sam deploy` is idempotent); data is untouched, table has PITR |
| Widget hotfix | `make publish-widgets`; `loader.js` has a 5-minute cache, bundles are immutable |

## Alarms

* **DLQ not empty**: e-mails failed 5 times. Inspect with `aws sqs receive-message`, fix (usually SES
  identity or recipient bounce), then redrive from the queue console.
* **API 5xx / Lambda errors**: CloudWatch Logs Insights on the function log group,
  `fields @timestamp, message, exception_name | filter level = "ERROR"`.

## Data protection requests

* **Erase a visitor's data**: consents are keyed by an opaque `visitor_id` held by the visitor; query
  `SITE#<site>` / `CONSENT#` and delete matching items. Submissions and subscribers are deleted from the console.
* **Erase a customer**: delete its sites from the console (removes all site data and snapshots), then
  delete the Cognito user and the `ACCOUNT#<tenant>` profile.

## Migrating the retired services

1. Create the customer's account and site; register **every** domain the old service allowed (with and without `www`).
2. Banner: configure the banner in the console (the old graphic fields map onto the new tokens).
3. Form: create a form that keeps the keys `name`, `email`, `phone`, `message`; set the recipients that were in
   `SITE_TO_EMAIL_MAP`.
4. Repoint the site: banner script/`by-site` URL and form `POST /contact` URL → the edge distribution URL.
5. After all sites are moved: disable the old Lambda Function URL and the old API, rotate and revoke the Google
   service-account key, delete the `agriconsent` Firebase project data you no longer need.
