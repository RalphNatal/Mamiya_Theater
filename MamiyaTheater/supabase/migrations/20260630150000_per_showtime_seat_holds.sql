-- ─────────────────────────────────────────────────────────────────────────
-- PER-SHOWTIME SEAT HOLDS
--
-- Blocking a seat is a per-PERFORMANCE decision: A1 held for a VIP on Friday
-- is still on sale Saturday. So holds live in booking_seats keyed by
-- showtime_id — NOT in the venue_seats master, which stays venue-wide for
-- the physical facts that are true every night (wheelchair access, a seat
-- that is permanently broken).
--
-- Each booking_seats row gets a status so a SOLD seat ('booked') and an admin
-- HOLD ('blocked') are distinguishable when painting the seat map. The existing
-- UNIQUE (showtime_id, seat_number) already stops a seat from being both sold
-- and held, and stops a customer from buying a held seat (the hold row occupies
-- the slot, so create_booking's insert hits a unique_violation).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Distinguish sold seats from admin holds ───────────────────────────────
--    Default 'booked' so every existing row (all of which are sales) classifies
--    correctly with no backfill.
ALTER TABLE public.booking_seats
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'blocked'));

-- 2. Let admins place / lift per-showtime holds straight from the client ────
--    booking_id stays NULL for a hold (no sale, no money changed hands). Both
--    policies are scoped to status = 'blocked', so this client path can NEVER
--    create or remove a real SOLD seat — those only ever move through the
--    SECURITY DEFINER booking RPCs. (booking_id is already nullable, from the
--    create_bookings_tables migration.)
DROP POLICY IF EXISTS "Admins can place seat holds" ON public.booking_seats;
CREATE POLICY "Admins can place seat holds"
  ON public.booking_seats FOR INSERT
  WITH CHECK (
    status = 'blocked'
    AND booking_id IS NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can lift seat holds" ON public.booking_seats;
CREATE POLICY "Admins can lift seat holds"
  ON public.booking_seats FOR DELETE
  USING (
    status = 'blocked'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Refresh PostgREST so the new column is exposed to the API immediately.
NOTIFY pgrst, 'reload schema';
