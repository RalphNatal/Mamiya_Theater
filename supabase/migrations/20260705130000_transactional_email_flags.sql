-- ─────────────────────────────────────────────────────────────────────────
-- TRANSACTIONAL EMAIL FLAGS — exactly-once markers for the welcome + reminder
-- emails (Task 2's new transactional set).
--
-- Both columns are the "have we already sent this?" flag used by a COMPARE-AND-
-- SWAP in the sending edge function (mirroring the finalize routines' unpaid→paid
-- flip, invariant #3): the sender flips NULL → now() and only sends when its own
-- flip won, so re-invoking the sender any number of times still emails once.
--
--   • profiles.welcomed_at — set the first time send-welcome-email runs for a
--     user (fired from App.tsx after a confirmed sign-in). Independent of
--     Supabase's built-in verification mail, which we deliberately leave alone.
--   • bookings.reminded_at — set when send-showtime-reminders claims a paid
--     booking whose show is ~24h out, so the hourly scheduler reminds once.
--
-- Both nullable with no default: NULL means "not yet sent". Existing rows stay
-- NULL, so already-welcomed users could in principle receive one back-fill
-- welcome on their next sign-in, and already-imminent bookings one reminder —
-- acceptable for a one-time rollout.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

-- Partial index: the reminder scheduler scans only still-unreminded paid
-- bookings, so index just those (keeps it tiny — sent rows drop out).
CREATE INDEX IF NOT EXISTS bookings_pending_reminder_idx
  ON public.bookings (show_start_time)
  WHERE reminded_at IS NULL AND payment_status = 'paid';

-- Refresh PostgREST so the new columns are exposed immediately.
NOTIFY pgrst, 'reload schema';
