# FAVOURWELD deployment and payment configuration

FAVOURWELD ELECTRONICS is a Cloudflare Worker application backed by Cloudflare D1. The application supports customer and repair-job records, invoices, payment tracking, and a hybrid M-Pesa architecture.

## Requirements

- Node.js 20 or later
- npm
- A Cloudflare account with Workers and D1 access
- IntaSend credentials for the preferred M-Pesa checkout flow
- Safaricom Daraja credentials only if direct Daraja STK Push is enabled

## Install and authenticate

```bash
npm install
wrangler login
```

## D1 configuration

The repository configuration uses a D1 binding named `DB`. Confirm that `wrangler.jsonc` contains the correct production database name and ID before deployment.

Apply the schema to the database:

```bash
wrangler d1 execute favourweldelectronics --file=./schemas/schema.sql
```

For a newly created database, use the ID returned by:

```bash
wrangler d1 create favourweldelectronics
```

Do not replace a production database ID without verifying the target account and environment.

## Worker secrets

Store credentials as Worker secrets. Never commit secret values to GitHub or expose them in browser JavaScript.

### Preferred IntaSend integration

```bash
wrangler secret put INTASEND_API_KEY
wrangler secret put INTASEND_SECRET_KEY
wrangler secret put INTASEND_WEBHOOK_SECRET
wrangler secret put INTASEND_CALLBACK_URL
```

Configure `INTASEND_CALLBACK_URL` to the public HTTPS URL for:

```text
/api/payments/callback
```

The exact IntaSend endpoint, request fields, and webhook signature rules must match the current IntaSend developer documentation.

### Optional direct Daraja integration

Only configure these when the application is explicitly using Safaricom Daraja directly:

```bash
wrangler secret put MPESA_CONSUMER_KEY
wrangler secret put MPESA_CONSUMER_SECRET
wrangler secret put MPESA_SHORTCODE
wrangler secret put MPESA_PASSKEY
wrangler secret put MPESA_CALLBACK_URL
```

IntaSend and Daraja are different integration layers. IntaSend is the preferred customer-facing gateway in this project; direct Daraja should not be enabled accidentally or treated as the same callback protocol.

### Application/session secrets

Configure these when authentication is enabled:

```bash
wrangler secret put SESSION_SECRET
```

Do not use a default admin password in production. If an admin bootstrap mechanism is added, require a one-time secret and force a password change after first login.

## Local development

Start the Worker locally:

```bash
npm run dev
```

Run the test suite:

```bash
npm test
```

Run a TypeScript check:

```bash
npx tsc --noEmit
```

Use local secret files or Wrangler local secret configuration for development. Do not commit `.dev.vars` or any file containing credentials.

## Deployment

Before deploying, verify the target account, Worker name, D1 database ID, and environment.

```bash
npm run deploy
```

After deployment, verify the health endpoint:

```text
https://YOUR_WORKER_DOMAIN/api/health
```

Then confirm the payment callback URL is reachable over HTTPS and configured in the active IntaSend environment.

## Hybrid payment architecture

The payment architecture is:

1. The customer submits an invoice ID, amount, and Kenyan phone number.
2. The backend validates the request and checks that the invoice exists.
3. The backend starts an IntaSend checkout request.
4. IntaSend sends an M-Pesa prompt or checkout response.
5. IntaSend sends a callback to the public callback endpoint.
6. The backend verifies the callback using the exact provider verification method.
7. The backend records the payment in D1.
8. The backend recalculates the invoice paid amount, balance, and status.

Direct Daraja STK Push can be added as a separate provider path, but it must have its own request and callback implementation. Do not assume an IntaSend callback can be verified using Daraja rules, or vice versa.

## Payment security requirements

The following rules are mandatory:

- Never mark an invoice paid from a browser redirect or front-end response.
- Mark a payment completed only after a verified provider callback or trusted reconciliation response.
- Use the exact current IntaSend webhook signature rules from IntaSend documentation.
- Use the exact current Daraja callback and reconciliation rules for direct Safaricom integration.
- Validate invoice ID, amount, currency, phone number, and provider reference.
- Ensure the confirmed amount cannot exceed the outstanding invoice balance without an explicit overpayment policy.
- Protect against duplicate callbacks using a unique provider reference and an idempotent update path.
- Store provider callback payloads only as needed for audit and troubleshooting; avoid logging secrets or unnecessary personal data.
- Use HTTPS for every public callback URL.
- Rotate leaked or compromised provider secrets immediately.
- Rate-limit payment initiation endpoints and protect privileged invoice operations with authentication and authorization.

## Invoice reconciliation

After a verified successful callback:

- Resolve the invoice from provider metadata or the stored payment request.
- Confirm the provider reference has not already been processed.
- Record the payment with provider, method, amount, currency, reference, status, and completion timestamp.
- Recalculate `amount_paid` from completed payment records.
- Recalculate `balance` as `max(0, total - amount_paid)`.
- Set status to `paid` when the invoice is fully paid, otherwise `part_paid` when a valid partial payment exists.

A failed, cancelled, pending, or unsigned callback must not increase `amount_paid` or change an invoice to `paid`.

## Production checklist

- [ ] `wrangler.jsonc` points to the intended Worker and D1 database.
- [ ] The schema has been applied to the intended D1 database.
- [ ] IntaSend secrets are configured in the correct Cloudflare environment.
- [ ] IntaSend webhook URL is public, HTTPS, and matches the deployed Worker.
- [ ] Direct Daraja secrets are configured only if direct Daraja is intentionally enabled.
- [ ] Callback verification uses the provider's current documented rules.
- [ ] Duplicate callback protection is enabled.
- [ ] Invoice reconciliation is based on completed payment records.
- [ ] Authentication and role-based authorization protect staff/admin operations.
- [ ] Payment initiation is rate-limited.
- [ ] No secrets are present in source control, logs, or client-side code.
- [ ] `npm test` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run deploy` completes successfully.
- [ ] `/api/health` responds successfully after deployment.

## Documentation maintenance

Provider APIs can change. Before enabling production payments, compare the implementation with the current IntaSend and Safaricom Daraja documentation and update this file when endpoint names, headers, payloads, or callback verification rules change.
