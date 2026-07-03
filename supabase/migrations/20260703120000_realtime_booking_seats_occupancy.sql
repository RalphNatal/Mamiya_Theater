-- ─────────────────────────────────────────────────────────────────────────
-- REALTIME SEAT OCCUPANCY — stream booking_seats INSERT/DELETE to the map
--
-- The seat picker (SeatSelectionScreen) fetches occupancy once on mount, so a
-- seat someone else grabs while you're choosing is invisible until your booking
-- RPC fails. This migration adds booking_seats to the Realtime publication so
-- the client can apply live deltas: an INSERT = a seat just went sold ('booked')
-- or on hold ('blocked'); a DELETE = a lifted admin hold or a swept/abandoned
-- reservation freed the seat again.
--
-- ⚠️  HOSTED PROJECT — this migration does NOT take effect merely by living in
--     the repo. It must be applied to the hosted Supabase project, either with
--     `supabase db push` or by pasting it into the SQL editor. Confirm Realtime
--     is enabled for the project (Database → Replication, or Project Settings →
--     it's on by default) — publication membership below is what actually opts
--     this table in to Postgres Changes.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Opt booking_seats into the Realtime publication ───────────────────────
--    `supabase_realtime` is created by default on hosted projects; guard both
--    the publication and the membership so this migration is safely re-runnable
--    (ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS and errors on a dupe).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'booking_seats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_seats;
  END IF;
END
$$;

-- 2. REPLICA IDENTITY FULL — carry the old row on DELETE ────────────────────
--    Without this, a DELETE's "old" record contains only the primary key (id).
--    The client subscribes filtered by `showtime_id=eq.<id>`, and Realtime
--    evaluates that filter against the old record — so on DELETE it would see no
--    showtime_id, the filter wouldn't match, and the free-up event would never
--    arrive. FULL puts the whole pre-delete row (showtime_id, seat_number,
--    status, …) in the payload so both the filter and the client's seat lookup
--    work. Idempotent — safe to re-run.
ALTER TABLE public.booking_seats REPLICA IDENTITY FULL;

-- 3. Keep anon's exposure to exactly (showtime_id, seat_number, status) ─────
--    The public seat-occupancy read policy (20260701170000) is `using (true)`
--    for SELECT, which is correct — occupancy is not sensitive. But REPLICA
--    IDENTITY FULL would otherwise let a FULL row (including booking_id and the
--    row id) reach anon subscribers on every INSERT/DELETE.
--
--    Supabase Realtime (walrus) filters each change's columns by the subscriber
--    role's column-level SELECT privileges (has_column_privilege) AND its RLS
--    SELECT policy. So narrowing anon's grant from table-wide to just these
--    three columns strips booking_id / id from BOTH ordinary PostgREST reads and
--    the Realtime payload, without touching the `using (true)` policy. The three
--    columns are exactly what the seat map needs (status to paint, seat_number
--    to locate, showtime_id for the WHERE filter).
--
--    Only anon is narrowed. `authenticated` keeps its default table-wide SELECT
--    because that role also covers admins, whose Seat Map / Box Office tools read
--    more of booking_seats; their reads stay gated by the same RLS policy.
REVOKE SELECT ON public.booking_seats FROM anon;
GRANT SELECT (showtime_id, seat_number, status) ON public.booking_seats TO anon;

-- Refresh PostgREST so the grant change is reflected immediately.
NOTIFY pgrst, 'reload schema';
