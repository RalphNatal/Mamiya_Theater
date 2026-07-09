-- ─────────────────────────────────────────────────────────────────────────
-- ATOMIC SHOWTIME-INVENTORY DECREMENT
--
-- The three finalize paths (stripe-webhook, stripe-verify-checkout, and the
-- shared finalize-paypal-booking) each used to decrement showtimes.available_seats
-- with a read-modify-write: SELECT available_seats → subtract in JS → UPDATE.
-- Every decrement is correctly gated behind the compare-and-swap winner, so it
-- runs once PER BOOKING — but two DIFFERENT bookings finalizing for the same
-- showtime concurrently can both read the same available_seats and each write
-- back a decrement that only accounts for its own tickets. That lost update
-- leaves the counter too high.
--
-- This is a display/aggregate drift, not an oversell: true seat integrity is
-- enforced at the seat level by booking_seats' UNIQUE (showtime_id, seat_number).
-- available_seats is a denormalized counter shown to buyers, so we still want it
-- correct. Doing the subtraction inside a single UPDATE makes it atomic across
-- concurrent different bookings — Postgres serializes the row write and each
-- call subtracts from the latest value.
--
-- greatest(0, …) clamps at zero so a late/duplicate decrement can never push the
-- counter negative. Callers still gate the call behind the compare-and-swap, so
-- it stays once-per-booking; this only removes the read-modify-write race.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.decrement_showtime_seats(p_showtime_id uuid, p_n integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.showtimes
     set available_seats = greatest(0, available_seats - p_n)
   where id = p_showtime_id;
$$;

-- Only the finalize edge functions (service-role) may call this. Lock out the
-- Postgres default of granting EXECUTE to PUBLIC so a client can't arbitrarily
-- decrement a showtime's inventory through this SECURITY DEFINER function.
revoke execute on function public.decrement_showtime_seats(uuid, integer) from public;
grant execute on function public.decrement_showtime_seats(uuid, integer) to service_role;

notify pgrst, 'reload schema';
