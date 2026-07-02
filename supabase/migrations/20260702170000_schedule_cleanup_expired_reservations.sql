-- ─────────────────────────────────────────────────────────────────────────
-- SCHEDULE THE ABANDONED-RESERVATION SWEEP (pg_cron)
--
-- Online checkout is a two-phase flow (see 20260701120000_stripe_checkout_...):
--   1. RESERVE  — create_pending_booking() writes status='reserved',
--                 payment_status='pending' and grabs the seats in
--                 booking_seats while the customer is on Stripe's hosted page.
--   2. FINALIZE — the stripe-webhook Edge Function flips the booking to
--                 confirmed/paid once the payment actually succeeds.
--
-- cleanup_expired_reservations() sweeps holds abandoned between those two
-- phases (customer closed the tab, session expired, etc.). That function was
-- shipped in 20260701120000, but its pg_cron schedule was left COMMENTED OUT —
-- so nothing ever calls it and an abandoned hold keeps its seats FOREVER.
-- This migration turns the sweep on, and hardens the TTL so it can never race
-- a customer who is still able to pay.
--
-- ── TTL vs. Stripe session lifetime ───────────────────────────────────────
-- The sweep must NEVER free seats while the customer's Checkout session is
-- still payable, or the webhook could later finalize a booking whose seats
-- were already released (and possibly resold). So the DB TTL must be >= the
-- Stripe session lifetime, with margin. The two values are:
--
--   * Stripe Checkout session expires_at .... 30 minutes  (Stripe's MINIMUM;
--       set in supabase/functions/stripe-create-checkout/index.ts, replacing
--       Stripe's 24-hour default so seats aren't held hostage for a full day)
--   * DB reservation sweep TTL .............. 35 minutes  (this migration)
--   * Sweep cadence ......................... every 5 minutes
--
-- 35 > 30 gives a 5-minute cushion that comfortably absorbs (a) the seconds
-- between create_pending_booking() setting bookings.created_at and the Edge
-- Function creating the Stripe session (the sweep measures from created_at,
-- which happens FIRST, so the real payable window ends slightly before
-- created_at + 35 min), and (b) any clock skew. Once the Stripe session
-- expires at 30 min the customer can no longer pay, so freeing at 35 min is
-- always safe. If you change either number, keep DB TTL comfortably > Stripe.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Reservation sweep — reconfirm the predicate + widen the TTL to 35 min ──
--    Re-created verbatim from 20260701120000 EXCEPT the interval (20 → 35 min),
--    so this file is the single source of truth for the sweep going forward.
--
--    Correctness guarantees (unchanged):
--      * Only touches abandoned ONLINE holds: status='reserved' AND
--        payment_status='pending'. That excludes every other row —
--          - normal online sales     → status='confirmed'
--          - box office walk-up sales → status='paid' (channel='box_office')
--          - any paid/refunded row    → payment_status <> 'pending'
--      * Seats are released automatically: booking_seats.booking_id is
--        ON DELETE CASCADE (see 20260629110000), so deleting the hold row
--        drops its booking_seats and reopens the seats for sale.
--      * Admin per-showtime holds are safe: those are booking_seats rows with
--        status='blocked' and booking_id IS NULL — attached to NO booking, so
--        a booking DELETE can never cascade into them.
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
RETURNS void AS $$
BEGIN
  DELETE FROM public.bookings
   WHERE status = 'reserved'
     AND payment_status = 'pending'
     AND created_at < now() - interval '35 minutes';  -- >= Stripe 30-min session
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Enable pg_cron ────────────────────────────────────────────────────────
--    Idempotent; creates the `cron` schema + cron.schedule()/cron.job on first
--    run and is a no-op thereafter. Requires the extension to be allow-listed
--    (it is, on Supabase).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. Schedule the sweep every 5 minutes — idempotently ──────────────────────
--    cron.unschedule(text) THROWS if no such job exists, so guard it: only
--    unschedule when a job with our stable name is already present. That makes
--    re-running this migration safe and guarantees we never accumulate
--    duplicate schedules for the same sweep.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-reservations'
  ) THEN
    PERFORM cron.unschedule('cleanup-expired-reservations');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-expired-reservations',           -- stable job name (see guard above)
  '*/5 * * * *',                            -- every 5 minutes
  $$ SELECT public.cleanup_expired_reservations(); $$
);

-- 4. Refresh PostgREST so the replaced function is exposed immediately. ─────
NOTIFY pgrst, 'reload schema';
