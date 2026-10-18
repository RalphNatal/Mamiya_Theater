import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { TURNSTILE_SITE_KEY, isCaptchaEnabled } from '../lib/turnstile';
import { logger } from '../lib/logger';

// Cloudflare Turnstile CAPTCHA (web). Renders nothing unless a site key was
// built in (src/lib/turnstile.ts). 'interaction-only' keeps it invisible for
// almost everyone; it only shows a checkbox when Cloudflare wants a click.
// Tokens are single-use: call ref.reset() after every submit attempt.
//
// The script comes from challenges.cloudflare.com, which the CSP in
// vercel.json allows in script-src and frame-src.

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<any> | null = null;
function loadTurnstile(): Promise<any> {
  const g = globalThis as any;
  if (g.turnstile) return Promise.resolve(g.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = g.document.createElement('script');
      s.src = SCRIPT_URL;
      s.async = true;
      s.onload = () => resolve(g.turnstile);
      s.onerror = () => { loading = null; reject(new Error('Turnstile script failed to load')); };
      g.document.head.appendChild(s);
    });
  }
  return loading;
}

export type TurnstileHandle = { reset: () => void };

type Props = {
  /** Receives a fresh token, or null when it expires / errors / is reset. */
  onToken: (token: string | null) => void;
  /** Turnstile "action" label shown in the Cloudflare dashboard, e.g. 'login'. */
  action?: string;
};

const TurnstileWidget = forwardRef<TurnstileHandle, Props>(({ onToken, action }, ref) => {
  const hostRef = useRef<any>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      const ts = (globalThis as any).turnstile;
      if (ts && widgetId.current) ts.reset(widgetId.current);
      onTokenRef.current(null);
    },
  }), []);

  useEffect(() => {
    if (!isCaptchaEnabled()) return undefined;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !hostRef.current) return;
        widgetId.current = ts.render(hostRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          appearance: 'interaction-only',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch((err) => logger.warn('Turnstile unavailable:', err?.message ?? err));
    return () => {
      cancelled = true;
      const ts = (globalThis as any).turnstile;
      if (ts && widgetId.current) ts.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action]);

  if (!isCaptchaEnabled()) return null;
  return React.createElement('div', { ref: hostRef, 'data-testid': 'turnstile', style: { marginTop: 8 } });
});

export default TurnstileWidget;
