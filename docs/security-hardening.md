# Security hardening — perimeter pass (October 2026)

This pass adds perimeter defences around a core that was already sound: RLS on every table, `SECURITY DEFINER` functions that set `search_path` and call `assert_admin`/`assert_staff`, server-side pricing, signature-checked webhooks, and the role-escalation trigger. **None of those guards were loosened.**

Each section below lists what changed, how to deploy it, and how to verify it on a **preview deploy before production**.

---

## 1. HTTP security headers (`vercel.json`)

Vercel applies one header block to every route:

| Header | Value / purpose |
| --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (two years of HTTPS-only). Submitting to hstspreload.org is a separate, hard-to-undo step. It also covers every subdomain of a future custom domain, so only submit once the domain is final. |
| `X-Frame-Options` | `DENY` (clickjacking, for older browsers) |
| `Content-Security-Policy` (**enforced**) | `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`. These directives are safe to enforce on day one, so clickjacking protection on checkout does not wait for the report-only phase. |
| `Content-Security-Policy-Report-Only` | The full policy (below). It reports violations and blocks nothing. |
| `Reporting-Endpoints` | `csp="…/functions/v1/csp-report"` (Chromium's Reporting API) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self)` for the admin QR scanner. Microphone, geolocation, USB, serial, HID, MIDI, display capture and the rest are off. Features the YouTube iframe delegates (autoplay, fullscreen, encrypted-media, picture-in-picture) keep their defaults, so the embed works unchanged. |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups`, so the PayPal popup can still talk back to the page |

### How the CSP was derived

Every allowed source comes from the code:

| Directive | Sources | Why |
| --- | --- | --- |
| `script-src` | `'self'`, one `sha256` hash, `*.paypal.com`, `*.paypalobjects.com`, `*.venmo.com`, `challenges.cloudflare.com` | The webpack bundle; the PayPal JS SDK (`@paypal/react-paypal-js`, using PayPal's published CSP list); the hash of the one inline snippet the PayPal SDK injects (found by testing); Cloudflare Turnstile (section 3). **No `'unsafe-inline'` and no `'unsafe-eval'`.** The bundle's only `Function()` calls are `globalThis` fallbacks that never run in a browser. |
| `style-src` | `'self' 'unsafe-inline'`, `fonts.googleapis.com` | react-native-web injects inline styles, and so do `index.html`, html5-qrcode and the PayPal SDK. Inline styles cannot run code. |
| `font-src` | `'self' data:`, `fonts.gstatic.com` | Urbanist from Google Fonts; Ionicons / MaterialCommunityIcons from `/fonts`. |
| `img-src` | `'self' data: blob: https:` | Admins can paste any `https` poster or banner URL. Also covers Supabase Storage uploads, Google avatars, Unsplash placeholders and PayPal button images. Images cannot run code. |
| `connect-src` | `'self'`, `https://` + `wss://amwzkqlhskicfbuikzpl.supabase.co`, the PayPal hosts | PostgREST, Auth, Storage, Edge Functions and Realtime all live on the project host. The PayPal SDK makes its own XHR calls. |
| `frame-src` | `www.youtube-nocookie.com`, the PayPal hosts, `challenges.cloudflare.com` | The YouTube embed (`src/lib/youtube.ts`), the PayPal button and card iframes, and the Turnstile widget. |
| `worker-src` / `media-src` | `'self' blob:` | The html5-qrcode camera preview. |
| `form-action` | `'self'` | The app never posts a form cross-origin. |

**Intentionally absent:**

- **Stripe** (`js.stripe.com`, `api.stripe.com`, `checkout.stripe.com`). The app does not load Stripe.js. `stripe-create-checkout` returns a hosted Checkout URL and the page *navigates* to it, and CSP does not govern top-level navigation. Add Stripe's hosts only if Stripe.js / Elements is ever embedded.
- **Google OAuth** (`accounts.google.com`). `signInWithOAuth` is a full-page redirect via Supabase Auth, so it is not governed by CSP either.
- **`i.ytimg.com`**. YouTube thumbnails load inside the YouTube iframe, under YouTube's own policy, never in our document.

### Local verification

These checks ran headless in Microsoft Edge against the production build, served with exactly these headers. Supabase was stubbed. In **both** report-only and enforcing mode, the following pages had **zero** violations:

- Home, `/shows/:id` (the YouTube iframe loads), login (Google button present) and contact.
- The real PayPal sandbox SDK: buttons render.
- A Turnstile widget: a token is issued.
- `/admin` → Box Office → **Scan QR**: the camera stream plays under `camera=(self)`.

`__tests__/securityHeaders.test.ts` pins all of the above.

### Watching for violations

Browsers POST reports to the `csp-report` Edge Function (`verify_jwt = false`). It stores nothing and logs one line per violation, capped and with ticket refs and booking ids redacted:

```
csp: <directive> blocked <uri> on <page> {…}
```

To read them, go to **Supabase dashboard → Edge Functions → csp-report → Logs**, and search for `csp:`.

Deploy: `supabase functions deploy csp-report`. The function's `config.toml` entry sets `verify_jwt = false`. If you deploy by hand, pass `--no-verify-jwt`.

### Flipping CSP to enforcing

1. Deploy to a **preview**. Exercise, end to end:
   - a Stripe card checkout
   - a PayPal checkout, both the PayPal button **and** the expanded "Debit or Credit Card" form
   - Google sign-in
   - a show page with a YouTube video
   - the admin QR scanner on a phone
   - the contact form and the newsletter sign-up (Turnstile)
2. Promote to production. Leave it in report-only for **about a week** of real traffic.
3. Review the `csp-report` logs. Browser extensions produce noise such as `chrome-extension://` sources or injected inline scripts; ignore it. Add anything that is genuinely the app's to the policy.
4. Flip the policy to enforcing: in `vercel.json`, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. The full policy already includes `frame-ancestors`, `object-src` and `base-uri`, so it **replaces** the small enforced policy rather than sitting beside it. `__tests__/securityHeaders.test.ts` accepts either header.
5. Keep `report-uri` / `report-to`, so new third-party breakage shows up in the logs.

If PayPal ever changes its injected inline snippet, the browser's report states the new `sha256-…` value. Replace the hash in `script-src`; while in report-only mode nothing breaks. Never fall back to `'unsafe-inline'`.

---

## 2. CORS on Edge Functions (`supabase/functions/_shared/cors.ts`)

Every browser-facing function used to send `Access-Control-Allow-Origin: *`. Now each one wraps its handler in `withCors(...)`, which:

- **echoes** the request `Origin`, but only when the origin is allow-listed, with `Vary: Origin`
- answers the preflight
- **refuses** any other browser origin with `403`, *before* the handler runs
- passes requests that carry **no** `Origin` straight through, unchanged. These are server-to-server calls: pg_cron's reminder call, curl, and the payment providers.

The allow-list reuses `stripe-create-checkout`'s existing `FRONTEND_URL` / `ALLOWED_ORIGINS` logic, moved into the shared helper:

| Source | Example |
| --- | --- |
| built in | `http://localhost:3000`, `https://mamiya-theater.vercel.app` |
| `FRONTEND_URL` secret | the canonical domain (already used for Stripe return URLs) |
| `ALLOWED_ORIGINS` secret | comma-separated. An entry may contain `*` for one DNS label, which is how Vercel **preview** deploys are covered |

Wildcard entries apply to CORS only. Stripe return URLs still use exact entries only (`TRUSTED_ORIGINS`), so they cannot become an open redirect.

**Webhooks** (`stripe-webhook`, `paypal-webhook`) now send no CORS headers at all. Stripe and PayPal post server-to-server, so a browser has no reason to call them. Their signature checks and `verify_jwt` settings are untouched.

### Deploy

1. **Before** deploying the functions, check the secrets with `supabase secrets list`.
   - If production is **not** `https://mamiya-theater.vercel.app` (for example, a custom domain), `FRONTEND_URL` must be set to that domain. Otherwise every call from the live site gets a 403.
   - For preview testing, set the preview pattern. Find your team slug in any preview URL (`https://mamiya-theater-<hash>-<team-slug>.vercel.app`):
     ```
     supabase secrets set ALLOWED_ORIGINS='https://mamiya-theater-*-<team-slug>.vercel.app'
     ```
     If you already use `ALLOWED_ORIGINS` (for example for staging), keep those entries and add this one, comma-separated.
2. Deploy all functions: `supabase functions deploy`. `_shared/cors.ts` changed, so every function needs a redeploy.

### Verify

- Unit tests: `cd supabase/functions && npx -y deno test --no-config --allow-env _shared/cors_test.ts` (6 tests).
- Live check. The first call should return `Access-Control-Allow-Origin: https://mamiya-theater.vercel.app`; the second should return `403`:
  ```
  curl -si -X OPTIONS https://amwzkqlhskicfbuikzpl.supabase.co/functions/v1/stripe-create-checkout \
       -H 'Origin: https://mamiya-theater.vercel.app' | grep -i access-control-allow-origin
  curl -si -X OPTIONS https://amwzkqlhskicfbuikzpl.supabase.co/functions/v1/stripe-create-checkout \
       -H 'Origin: https://evil.example' | head -1
  ```
- On the preview deploy, a card checkout, a PayPal checkout, a free ($0) order, the contact form and the newsletter must all still succeed. In each function's logs, `CORS: refused origin …` lines show any origin you forgot to allow-list.
