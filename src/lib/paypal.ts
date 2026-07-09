// PayPal client ID for the browser SDK. Injected at build time by webpack's
// DefinePlugin from process.env.PAYPAL_CLIENT_ID (see webpack.config.js). The
// literal below is only a sandbox fallback for when that env var is unset — it
// is NOT a secret (PayPal client IDs are public and safe to ship). To switch
// sandbox → live, set PAYPAL_CLIENT_ID in .env; don't edit this file.
//
// Keep this in sync with the backend PayPal app (PAYPAL_CLIENT_ID / PAYPAL_SECRET
// on the edge functions) — a frontend/backend app mismatch makes create/capture
// fail.
const SANDBOX_CLIENT_ID_FALLBACK =
  'AWaH1YqBKfGHITAYxYPteEZgdCtOcsc9NCXRAVZPibXrmkvw8LuagoVFOJ22QNYJbVYLa_hEg1PwK3fo';

export const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || SANDBOX_CLIENT_ID_FALLBACK;

export const PAYPAL_CURRENCY = 'USD';
