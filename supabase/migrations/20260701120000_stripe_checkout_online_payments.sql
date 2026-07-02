-- ─────────────────────────────────────────────────────────────────────────
-- ONLINE PAYMENTS (Stripe Checkout) — reserved → paid lifecycle
--
-- Online sales are now a two-phase flow, unlike the single-shot box office
-- sale (create_box_office_booking, which is already 'paid' at insert):
--
--   1. RESERVE  — create_pending_booking() writes a booking with
--                 status='reserved', payment_status='pending', and grabs the
--                 seats in booking_seats so nobody else can take them while
--                 the customer is on Stripe's hosted page. NO money has moved
--                 and available_seats is NOT decremented yet.
--   2. FINALIZE — the stripe-webhook Edge Function (service role), on a
--                 verified checkout.session.completed, flips the booking to
--                 status='confirmed'/payment_status='paid', marks the payments
--                 row 'succeeded', and decrements showtimes.available_seats.
--
-- The amount is ALWAYS recomputed server-side (seats × showtimes.price) — in
-- this RPC and again in the webhook — never trusted from the client.
-- ─────────────────────────────────────────────────────────────────────────

-- 1a. bookings — guest identity + payment lifecycle ────────────────────────
--     Guests (no account) supply name/email here; logged-in buyers leave them
--     NULL and are identified by user_id. payment_status tracks the money
--     independently of the fulfilment `status` column.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_email    TEXT,
  ADD COLUMN IF NOT EXISTS guest_name     TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded'));

-- 1b. payments — one row per provider payment attempt ──────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  provider_ref TEXT,                       -- e.g. Stripe Checkout Session id
  amount       NUMERIC NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'usd',
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_booking_id_idx ON public.payments(booking_id);

-- RLS: a customer can read the payments for a booking they own (or an admin
-- can read any). All WRITES happen through Edge Functions using the service
-- role, which bypasses RLS entirely — so there is deliberately NO insert/
-- update policy here; the client can never fabricate a payment row.
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bookings' payments" ON public.payments;
CREATE POLICY "Users can view their own bookings' payments"
  ON public.payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = payments.booking_id
        AND (
          b.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        )
    )
  );

-- 1c. create_pending_booking — phase 1 (RESERVE) ───────────────────────────
--     Called by BOTH anon (guest) and authenticated clients, so it is granted
--     to anon + authenticated. SECURITY DEFINER so a guest can write a booking
--     with user_id = NULL. Returns { booking_id, amount }; the amount is the
--     authoritative server-side total the checkout function will re-verify.
CREATE OR REPLACE FUNCTION public.create_pending_booking(
  p_showtime_id uuid,
  p_seats       text[],
  p_guest_name  text,
  p_guest_email text
)
RETURNS json AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_price numeric;
  v_available_seats int;
  v_start_time timestamptz;
  v_title text;
  v_num int;
  v_total numeric;
  v_booking_id uuid;
  v_seat text;
BEGIN
  -- Guest checkout: no account, so name + email are required to hold the seats.
  IF v_user_id IS NULL THEN
    IF p_guest_name IS NULL OR btrim(p_guest_name) = ''
       OR p_guest_email IS NULL OR btrim(p_guest_email) = '' THEN
      RAISE EXCEPTION 'Guest name and email are required';
    END IF;
  END IF;

  v_num := coalesce(array_length(p_seats, 1), 0);
  IF v_num = 0 THEN
    RAISE EXCEPTION 'Select at least one seat';
  END IF;

  -- Reject seats the box office has blocked or flagged broken.
  IF EXISTS (
    SELECT 1 FROM public.venue_seats vs
    WHERE vs.seat_identifier = ANY(p_seats) AND vs.status <> 'available'
  ) THEN
    RAISE EXCEPTION 'One or more selected seats are not available for sale';
  END IF;

  SELECT s.price, coalesce(s.available_seats, 0), s.start_time, p.title
    INTO v_price, v_available_seats, v_start_time, v_title
    FROM public.showtimes s
    LEFT JOIN public.productions p ON p.id = s.production_id
    WHERE s.id = p_showtime_id
    FOR UPDATE OF s;          -- lock the showtime row for the duration

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showtime not found';
  END IF;

  IF v_num > v_available_seats THEN
    RAISE EXCEPTION 'Not enough seats';
  END IF;

  v_total := v_price * v_num;  -- server-side price, never from the client

  INSERT INTO public.bookings (
    user_id, showtime_id, movie_title, show_start_time,
    num_tickets, total_price, status, payment_status, channel,
    guest_name, guest_email
  ) VALUES (
    v_user_id, p_showtime_id, v_title, v_start_time,
    v_num, v_total, 'reserved', 'pending', 'online',
    CASE WHEN v_user_id IS NULL THEN p_guest_name  ELSE NULL END,
    CASE WHEN v_user_id IS NULL THEN p_guest_email ELSE NULL END
  )
  RETURNING id INTO v_booking_id;

  -- Reserve the seats. The UNIQUE (showtime_id, seat_number) guarantees no two
  -- reservations (or a reservation + a sale) can grab the same seat.
  BEGIN
    FOREACH v_seat IN ARRAY p_seats LOOP
      INSERT INTO public.booking_seats (booking_id, showtime_id, seat_number)
      VALUES (v_booking_id, p_showtime_id, v_seat);
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'One or more selected seats are no longer available';
  END;

  -- available_seats is deliberately NOT decremented here — that happens at
  -- FINALIZE in the webhook once the payment actually succeeds.

  RETURN json_build_object('booking_id', v_booking_id, 'amount', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_pending_booking(uuid, text[], text, text) TO anon, authenticated;

-- 1c-b. cancel_reservation — free a still-unpaid hold immediately ──────────
--     Used by the ?checkout=cancel return path. Safe to grant broadly because
--     it can ONLY delete a booking that is still status='reserved' AND
--     payment_status='pending' — i.e. a hold where no money has moved. A paid
--     or confirmed booking is untouched. Cascade removes its booking_seats.
CREATE OR REPLACE FUNCTION public.cancel_reservation(p_booking_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM public.bookings
   WHERE id = p_booking_id
     AND status = 'reserved'
     AND payment_status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid) TO anon, authenticated;

-- 1c-c. get_booking_confirmation — read a single booking for the return page ─
--     The confirmation screen POLLS this until payment_status flips to 'paid'.
--     Guests have no session, so the bookings RLS SELECT policy (owner/admin)
--     can't serve them — this SECURITY DEFINER RPC returns only the fields the
--     confirmation card shows, keyed by the unguessable random booking UUID.
--     Grant to anon + authenticated (guests poll it too).
CREATE OR REPLACE FUNCTION public.get_booking_confirmation(p_booking_id uuid)
RETURNS json AS $$
  SELECT json_build_object(
    'id',             b.id,
    'payment_status', b.payment_status,
    'status',         b.status,
    'movie_title',    b.movie_title,
    'show_start_time', b.show_start_time,
    'num_tickets',    b.num_tickets,
    'total_price',    b.total_price,
    'seats',          coalesce(
                        (SELECT array_agg(bs.seat_number ORDER BY bs.seat_number)
                           FROM public.booking_seats bs
                          WHERE bs.booking_id = b.id),
                        ARRAY[]::text[]
                      )
  )
  FROM public.bookings b
  WHERE b.id = p_booking_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_booking_confirmation(uuid) TO anon, authenticated;

-- 1d. cleanup_expired_reservations — sweep abandoned holds ─────────────────
--     Deletes reservations left 'pending' for >20 min (customer closed the
--     Stripe tab, etc.). Cascade frees their booking_seats. available_seats
--     was never decremented for a reservation, so nothing to restore there.
--     Schedule with pg_cron (see the schedule line at the bottom).
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
RETURNS void AS $$
BEGIN
  DELETE FROM public.bookings
   WHERE status = 'reserved'
     AND payment_status = 'pending'
     AND created_at < now() - interval '20 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Refresh PostgREST so the new table/columns/RPCs are exposed immediately.
NOTIFY pgrst, 'reload schema';

-- ── pg_cron schedule (run ONCE, in the SQL editor, after enabling pg_cron) ──
-- Requires the pg_cron extension. Runs the sweep every 5 minutes:
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule(
--     'cleanup-expired-reservations',
--     '*/5 * * * *',
--     $$ SELECT public.cleanup_expired_reservations(); $$
--   );
