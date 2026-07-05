-- ─────────────────────────────────────────────────────────────────────────
-- FUNNEL ANALYTICS — append-only events + admin funnel aggregate.
--
-- Build-your-own, privacy-first: an append-only events table written by the
-- client's track() helper (src/lib/analytics.ts). NO PII — only an anonymous
-- per-browser session id plus production/showtime ids and small metadata. Chosen
-- over a third-party (PostHog/Plausible) to fit the stack with no new vendor;
-- the tradeoff is we maintain it (which is trivial for a single funnel).
--
-- SECURITY (invariant #5): append-ONLY for anon/authenticated — there is NO
-- SELECT/UPDATE/DELETE policy, so a client can never read or mutate events.
-- Admins read ONLY aggregates, through the SECURITY DEFINER funnel_counts RPC
-- (gated on assert_admin, shipped in 20260630140000).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    text NOT NULL,          -- anonymous per-browser id (localStorage), NOT a user id
  event_type    text NOT NULL,          -- one of the canonical funnel events (see analytics.ts)
  production_id uuid,                    -- optional context; plain id, no FK/coupling
  showtime_id   uuid,
  metadata      jsonb,                   -- small non-PII extras (e.g. { "seats": 2 })
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The funnel RPC filters by event_type within a created_at window.
CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx
  ON public.analytics_events (event_type, created_at);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- INSERT-only (append) for everyone. Deliberately NO select/update/delete
-- policy → clients can never read the table or alter history.
DROP POLICY IF EXISTS "Append-only analytics inserts" ON public.analytics_events;
CREATE POLICY "Append-only analytics inserts"
  ON public.analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ── funnel_counts ──────────────────────────────────────────────────────────
-- Admin-only aggregate for the Overview funnel chart. Returns DISTINCT-SESSION
-- counts per funnel step over an inclusive [start_date, end_date] window — the
-- same window shape the other dashboard RPCs use — so the chart reads as a real
-- session funnel (a session that viewed 5 shows still counts once), and
-- step-to-step ratios show drop-off. Reuses assert_admin() from 20260630140000.
CREATE OR REPLACE FUNCTION public.funnel_counts(
  start_date date,
  end_date   date
)
RETURNS json AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN (
    SELECT json_build_object(
      'production_viewed',  count(DISTINCT session_id) FILTER (WHERE event_type = 'production_viewed'),
      'seats_confirmed',    count(DISTINCT session_id) FILTER (WHERE event_type = 'seats_confirmed'),
      'checkout_started',   count(DISTINCT session_id) FILTER (WHERE event_type = 'checkout_started'),
      'payment_succeeded',  count(DISTINCT session_id) FILTER (WHERE event_type = 'payment_succeeded'),
      'payment_failed',     count(DISTINCT session_id) FILTER (WHERE event_type = 'payment_failed'),
      'checkout_abandoned', count(DISTINCT session_id) FILTER (WHERE event_type = 'checkout_abandoned')
    )
    FROM public.analytics_events
    WHERE created_at::date BETWEEN start_date AND end_date
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Callable by any authenticated user; self-gates on admin like the other RPCs.
GRANT EXECUTE ON FUNCTION public.funnel_counts(date, date) TO authenticated;

-- Refresh PostgREST so the new table + RPC are exposed immediately.
NOTIFY pgrst, 'reload schema';
