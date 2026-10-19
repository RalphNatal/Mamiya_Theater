import { Platform } from 'react-native';

// Cloudflare Turnstile site key, injected at build time by webpack's
// DefinePlugin from process.env.TURNSTILE_SITE_KEY (see webpack.config.js).
// Site keys are PUBLIC. Empty = CAPTCHA off: no widget renders and forms send
// no token. Turn it on in this order (docs/security-hardening.md §3):
//   1. build + deploy the frontend with TURNSTILE_SITE_KEY set,
//   2. `supabase secrets set TURNSTILE_SECRET_KEY=…` (contact / newsletter),
//   3. Supabase dashboard → Auth → Bot and Abuse Protection → Turnstile.
export const TURNSTILE_SITE_KEY: string = process.env.TURNSTILE_SITE_KEY || '';

// Web only — native has no DOM for the widget (and so sends no token).
export const isCaptchaEnabled = (): boolean => Platform.OS === 'web' && TURNSTILE_SITE_KEY !== '';

// True when a form must wait: CAPTCHA is on and no token has arrived yet.
export const captchaPending = (token: string | null): boolean => isCaptchaEnabled() && !token;

export const CAPTCHA_PENDING_MESSAGE = 'Please complete the quick verification, then try again.';
