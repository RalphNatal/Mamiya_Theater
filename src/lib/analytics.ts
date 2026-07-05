// ─────────────────────────────────────────────────────────────────────────
// FUNNEL ANALYTICS (client) — a tiny, privacy-first event tracker.
//
// track() fire-and-forgets an INSERT into analytics_events (append-only; the
// table has no client SELECT policy — see 20260706130000). It is deliberately
// best-effort: it NEVER throws, NEVER blocks the UI, and swallows every error,
// so an analytics hiccup can never affect the booking flow.
//
// No PII is collected — only an anonymous per-browser session id (a random UUID
// in localStorage) plus the production/showtime ids and small metadata already
// visible in the URL/state.
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { logger } from './logger';

// The canonical funnel events. Keep this in step with funnel_counts (the RPC
// only aggregates these exact strings).
export const AnalyticsEvent = {
  ProductionViewed: 'production_viewed',
  SeatsConfirmed: 'seats_confirmed',
  CheckoutStarted: 'checkout_started',
  PaymentSucceeded: 'payment_succeeded',
  PaymentFailed: 'payment_failed',
  CheckoutAbandoned: 'checkout_abandoned',
} as const;

export type AnalyticsEventType = typeof AnalyticsEvent[keyof typeof AnalyticsEvent];

const SESSION_KEY = 'mt_analytics_session';

function makeId(): string {
  const c = (globalThis as any)?.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for the rare context without crypto.randomUUID (e.g. non-secure
  // origin). Good enough for an anonymous, non-security session id.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// In-memory fallback when localStorage is unavailable (private mode, native).
let memorySession: string | null = null;

// Stable anonymous id for this browser: persisted in localStorage, regenerated
// only when absent. Never tied to a user account (no cross-device stitching).
function getSessionId(): string {
  try {
    const ls = (globalThis as any)?.localStorage;
    if (ls) {
      let id = ls.getItem(SESSION_KEY);
      if (!id) {
        id = makeId();
        ls.setItem(SESSION_KEY, id);
      }
      return id;
    }
  } catch {
    // localStorage blocked/unavailable — fall through to the in-memory id.
  }
  if (!memorySession) memorySession = makeId();
  return memorySession;
}

type TrackProps = {
  productionId?: string | null;
  showtimeId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Record a funnel event. Fire-and-forget: does not return a promise, never
 * throws, never blocks, and swallows all errors — analytics must not affect UX.
 */
export function track(eventType: AnalyticsEventType, props: TrackProps = {}): void {
  try {
    const row = {
      session_id: getSessionId(),
      event_type: eventType,
      production_id: props.productionId ?? null,
      showtime_id: props.showtimeId ?? null,
      metadata: props.metadata ?? null,
    };
    // Execute the insert without awaiting; swallow both a Postgres error result
    // and any thrown/rejected network error.
    void supabase
      .from('analytics_events')
      .insert(row)
      .then(
        ({ error }) => { if (error) logger.warn('analytics insert failed:', error.message); },
        () => { /* network/transport error — ignore */ },
      );
  } catch (err) {
    // Guard against a synchronous failure (getSessionId, client init, etc.).
    logger.warn('analytics track failed:', err);
  }
}
