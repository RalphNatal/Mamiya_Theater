-- ─────────────────────────────────────────────────────────────────────────
-- PUBLIC SEAT-OCCUPANCY READ
--
-- The seat picker is public (guest checkout is allowed with no login). The old
-- booking_seats SELECT policy —
--     using (auth.uid() is not null)
-- — let ONLY authenticated users see taken seats, so guests loaded an empty
-- taken-seats set, could pick an already-sold/held/reserved seat, and only hit
-- the "seats no longer available" error mid-checkout.
--
-- Seat occupancy for a showtime is not sensitive (it's exactly what a seat map
-- must reveal). The booking rows themselves stay protected by their own RLS —
-- this only exposes which (showtime_id, seat_number) slots are occupied and
-- whether each is 'booked' (sold or reserved) or 'blocked' (admin hold).
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists "Authenticated users can view booked seats." on public.booking_seats;
drop policy if exists "Anyone can view seat occupancy." on public.booking_seats;
create policy "Anyone can view seat occupancy."
  on public.booking_seats for select
  using (true);

-- Ensure the anon role actually has the table-level SELECT privilege the policy
-- now permits (authenticated already did).
grant select on public.booking_seats to anon;

-- Refresh PostgREST so the policy change is exposed immediately.
notify pgrst, 'reload schema';
