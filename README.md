# Mamiya Theater

Theater‑ticketing web app for the **Dr. Richard T. Mamiya Theatre** (Honolulu). Browse productions, pick seats, pay online (card or PayPal), and receive a QR e‑ticket by email. Includes an admin dashboard for productions, showtimes, box‑office sales, seat maps, and analytics.

> **All payment/email providers are in SANDBOX / TEST mode.** Stripe, PayPal, and Resend use test keys only. Do not add live keys.

## Stack

- **Frontend:** React Native + [react-native-web](https://necolas.github.io/react-native-web/), bundled with **webpack**, deployed to **Vercel** (web only — the `android`/`ios` scripts are unused).
- **Backend:** [Supabase](https://supabase.com) — Postgres + Row Level Security, Auth (email + Google), and **Deno Edge Functions**.
- **Payments:** Stripe Checkout and PayPal (both sandbox).
- **Email:** [Resend](https://resend.com) for transactional mail (confirmations, reminders, broadcasts).

## Prerequisites

- **Node ≥ 22.11** (see `engines` in `package.json`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for deploying functions / running migrations)
- A Supabase project (this repo is linked to ref `amwzkqlhskicfbuikzpl`)

## Local development (web)

```sh
npm install --legacy-peer-deps   # --legacy-peer-deps is required (recharts peer range)
npm run web                      # webpack dev server on http://localhost:3000
```

Client‑side routes (e.g. `/shows/:id`, `/ticket/:ref`, `/lookup`) work on refresh in dev via webpack `historyApiFallback`, and in production via the SPA rewrite in `vercel.json`.

### Production build

```sh
npm run build     # webpack --mode production → dist/bundle.web.js
```

Vercel runs `npm run build` on deploy, so `dist/` does not need to be committed.

## Environment variables

There are **two separate** env files — keep them distinct:

| File | Consumed by | Contains |
| --- | --- | --- |
| **`.env`** (repo root) | the webpack build + Node scripts | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (scripts only), `PAYPAL_CLIENT_ID` (public; injected into the bundle by webpack `DefinePlugin`) |
| **`supabase/functions/.env`** | Edge Functions (local `functions serve`) | Stripe / PayPal / Resend secrets, return URLs — see below |

Copy the templates and fill them in:

```sh
cp .env.example .env
cp supabase/functions/.env.example supabase/functions/.env
```

Nothing in `supabase/functions/.env` is ever bundled into the browser. The frontend PayPal **client ID** is public and safe to ship; the PayPal **secret** lives only in the function env.

### Edge Function secrets (sandbox)

Set these as Supabase project secrets for the deployed functions (`supabase secrets set KEY=VALUE`):

- **Stripe:** `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` (`whsec_…`)
- **PayPal:** `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`, `PAYPAL_WEBHOOK_ID` (from the sandbox app's webhook subscribed to `PAYMENT.CAPTURE.COMPLETED`, pointed at the deployed `paypal-webhook` URL)
- **Resend:** `RESEND_API_KEY` (`re_…`), `FROM_EMAIL` (a Resend‑verified sender). In sandbox, Resend only delivers to your own verified address.
- **URLs/links:** `FRONTEND_URL` (deployed domain — also gates QR generation and the ticket/lookup links), optionally `ALLOWED_ORIGINS`, `CONTACT_NOTIFY_EMAIL`.

> Do **not** set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` as function secrets — Supabase injects them automatically.

## Deploying Edge Functions

Function runtime config (including `verify_jwt`) lives in `supabase/config.toml` — it is the durable source of truth. `paypal-webhook` must run with `verify_jwt = false` (server‑to‑server, no Supabase JWT); the client‑ and cron‑invoked functions keep `verify_jwt = true`.

```sh
supabase functions deploy            # deploy all, or name one:
supabase functions deploy paypal-webhook
```

## Scheduled jobs (pg_cron + Vault)

Two jobs run in Postgres via `pg_cron` → `pg_net`:

- **Reservation sweep** — `cleanup_expired_reservations()` every **5 minutes** (frees holds after a 35‑min TTL, coordinated with the 30‑min Stripe session). Scheduled by `20260702170000_schedule_cleanup_expired_reservations.sql`.
- **Showtime reminders** — `send-showtime-reminders` **hourly** (24h‑before reminder, exactly‑once). Scheduled by `20260705140000_schedule_showtime_reminders.sql`.

The reminder job authenticates to the Edge Function using two **Vault** secrets — create them once:

```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- verify:  select name from vault.secrets;
```

## Provider setup (sandbox)

1. **Stripe** — create a test‑mode Checkout; add a webhook endpoint for `checkout.session.completed` pointed at the deployed `stripe-webhook` URL and copy its `whsec_…` into `STRIPE_WEBHOOK_SECRET`. Test card: `4242 4242 4242 4242`.
2. **PayPal** — create a sandbox REST app; put its client ID/secret in the function secrets and (for the browser) `PAYPAL_CLIENT_ID` in root `.env`. Add a webhook subscribed to `PAYMENT.CAPTURE.COMPLETED` → `paypal-webhook`, and copy its Webhook ID into `PAYPAL_WEBHOOK_ID`. Pay with a sandbox buyer account.
3. **Resend** — verify a sender, set `RESEND_API_KEY` + `FROM_EMAIL`, and confirm your test recipient is allowed in sandbox.

Keep the browser `PAYPAL_CLIENT_ID` and the functions' `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET` on the **same** PayPal app, or create/capture will fail.

## Pricing note

Every paid online order adds a flat **$0.75 per‑booking service fee** (not per ticket, never on $0 comps). It is enforced server‑side in the Stripe/PayPal create + verify/capture functions and stored in `total_price`; the single source of truth is `SERVICE_FEE_USD` (mirrored in `src/config/venue.ts` and `supabase/functions/_shared/venue.ts`).

## Verification

Run before every commit:

```sh
npx tsc --noEmit     # type check (frontend; edge functions are Deno-checked at deploy)
npm run lint         # eslint
npm run build        # production build must succeed
```

## Project layout

```
App.tsx                     app shell + auth/role routing
src/screens/                screens (incl. admin/ dashboard: shell + sections/)
src/config/venue.ts         venue + pricing config (mirrored to the functions tree)
src/lib/                     supabase client, router, paypal, logger
supabase/functions/         Deno Edge Functions (payments, email, contact/newsletter)
supabase/functions/_shared/ shared: venue mirror, Resend layer, email + finalize helpers
supabase/migrations/        SQL migrations (schema, RPCs, RLS, cron schedules)
```
