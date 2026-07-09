-- ─────────────────────────────────────────────────────────────────────────
-- PER-ZONE, PER-SHOWTIME PRICING (server-authoritative)
--
-- Pricing was a single flat showtimes.price per seat. This adds an OPTIONAL
-- per-zone override per showtime, while staying fully backward compatible:
--
--   effective price(seat, showtime)
--     = COALESCE(showtime_seat_prices.price for that seat's venue_seats.zone,
--                showtimes.price)
--
-- So a showtime with NO zone rows still sells EVERY seat at its flat price and
-- nothing breaks for existing data. When zone rows exist, each seat is priced by
-- its zone and the booking TOTAL is the SUM of every selected seat's effective
-- price — never a flat price × quantity, and never a client-supplied amount.
--
-- This migration changes ONLY how the monetary total is computed inside the three
-- booking RPCs. Every other line (seat-availability / blocked / broken checks,
-- capacity guards, the FOR UPDATE lock, idempotency, seat inserts, the
-- reserved→paid lifecycle, grants) is a faithful copy of each function's CURRENT
-- newest definition:
--   • create_booking            → 20260702120000_production_ticket_capacity.sql
--   • create_box_office_booking → 20260702120000_production_ticket_capacity.sql
--   • create_pending_booking    → 20260707130000_service_fee_in_pending_booking.sql
--
-- DEPLOYMENT: apply to the HOSTED Supabase project (supabase db push / SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. showtime_seat_prices — one optional price override per (showtime, zone) ──
CREATE TABLE IF NOT EXISTS public.showtime_seat_prices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showtime_id UUID NOT NULL REFERENCES public.showtimes(id) ON DELETE CASCADE,
  zone        TEXT NOT NULL CHECK (zone IN ('premium', 'general', 'limited_view')),
  price       NUMERIC NOT NULL CHECK (price >= 0),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (showtime_id, zone)
);

CREATE INDEX IF NOT EXISTS showtime_seat_prices_showtime_id_idx
  ON public.showtime_seat_prices(showtime_id);

-- RLS: readable by EVERYONE (anon + authenticated) — the public seat picker needs
-- the prices to render the running total. Writable only by admins, mirroring the
-- venue_seats admin-write policies exactly.
ALTER TABLE public.showtime_seat_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Showtime seat prices are viewable by everyone" ON public.showtime_seat_prices;
CREATE POLICY "Showtime seat prices are viewable by everyone"
  ON public.showtime_seat_prices FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Admins can insert showtime seat prices" ON public.showtime_seat_prices;
CREATE POLICY "Admins can insert showtime seat prices"
  ON public.showtime_seat_prices FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update showtime seat prices" ON public.showtime_seat_prices;
CREATE POLICY "Admins can update showtime seat prices"
  ON public.showtime_seat_prices FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete showtime seat prices" ON public.showtime_seat_prices;
CREATE POLICY "Admins can delete showtime seat prices"
  ON public.showtime_seat_prices FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. sum_effective_seat_total — the ONE place the summed-total rule lives ──────
--    Given a showtime + a set of selected seat_identifiers, returns the SUM of
--    each seat's effective price: its zone override if the showtime has one, else
--    the flat p_flat_price. A seat_identifier not present in venue_seats simply
--    contributes nothing (callers validate seats/availability separately). Kept
--    SQL + STABLE so the three RPCs share identical pricing math.
CREATE OR REPLACE FUNCTION public.sum_effective_seat_total(
  p_showtime_id uuid,
  p_seats       text[],
  p_flat_price  numeric
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(COALESCE(ssp.price, p_flat_price)), 0)
  FROM public.venue_seats vs
  LEFT JOIN public.showtime_seat_prices ssp
    ON ssp.showtime_id = p_showtime_id
   AND ssp.zone = vs.zone
  WHERE vs.seat_identifier = ANY(p_seats);
$$;

-- 3a. create_booking (authenticated online sale) ─────────────────────────────
--     Copy of 20260702120000; ONLY v_total changes to the summed zone total.
CREATE OR REPLACE FUNCTION public.create_booking(p_showtime_id uuid, p_seats text[])
RETURNS uuid AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_price numeric;
  v_available_seats int;
  v_start_time timestamptz;
  v_title text;
  v_num_tickets int;
  v_total numeric;
  v_booking_id uuid;
  v_seat text;
  v_capacity int;
  v_booked int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_num_tickets := coalesce(array_length(p_seats, 1), 0);
  IF v_num_tickets = 0 THEN
    RAISE EXCEPTION 'Select at least one seat';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.venue_seats vs
    WHERE vs.seat_identifier = ANY(p_seats) AND vs.status <> 'available'
  ) THEN
    RAISE EXCEPTION 'One or more selected seats are not available for sale';
  END IF;

  SELECT s.price, coalesce(s.available_seats, 0), s.start_time, p.title, p.total_tickets_capacity
    INTO v_price, v_available_seats, v_start_time, v_title, v_capacity
    FROM public.showtimes s
    LEFT JOIN public.productions p ON p.id = s.production_id
    WHERE s.id = p_showtime_id
    FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showtime not found';
  END IF;

  IF v_num_tickets > v_available_seats THEN
    RAISE EXCEPTION 'Not enough seats';
  END IF;

  -- Production ticket cap: block if this sale would push tickets past capacity.
  SELECT count(*) INTO v_booked
    FROM public.booking_seats
    WHERE showtime_id = p_showtime_id AND status = 'booked';
  IF v_booked + v_num_tickets > v_capacity THEN
    RAISE EXCEPTION 'Sold out: only % ticket(s) remain for this performance', greatest(0, v_capacity - v_booked);
  END IF;

  -- TOTAL = sum of each selected seat's effective zone price (falls back to the
  -- flat showtimes.price for any zone without an override). Server-side only.
  v_total := public.sum_effective_seat_total(p_showtime_id, p_seats, v_price);

  INSERT INTO public.bookings (
    user_id, showtime_id, movie_title, show_start_time, num_tickets, total_price, status
  ) VALUES (
    v_user_id, p_showtime_id, v_title, v_start_time, v_num_tickets, v_total, 'confirmed'
  )
  RETURNING id INTO v_booking_id;

  BEGIN
    FOREACH v_seat IN ARRAY p_seats LOOP
      INSERT INTO public.booking_seats (booking_id, showtime_id, seat_number)
      VALUES (v_booking_id, p_showtime_id, v_seat);
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'One or more selected seats are no longer available';
  END;

  UPDATE public.showtimes
    SET available_seats = available_seats - v_num_tickets
    WHERE id = p_showtime_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_booking(uuid, text[]) TO authenticated;

-- 3b. create_box_office_booking (admin walk-up POS sale) ─────────────────────
--     Copy of 20260702120000; ONLY v_total changes to the summed zone total.
CREATE OR REPLACE FUNCTION public.create_box_office_booking(
  p_showtime_id uuid,
  p_seats text[],
  p_payment_method text
)
RETURNS uuid AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_price numeric;
  v_available_seats int;
  v_start_time timestamptz;
  v_title text;
  v_num int;
  v_total numeric;
  v_booking_id uuid;
  v_seat text;
  v_capacity int;
  v_booked int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND role = 'admin')
    INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can process box office sales';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'Payment method must be cash or card';
  END IF;

  v_num := coalesce(array_length(p_seats, 1), 0);
  IF v_num = 0 THEN
    RAISE EXCEPTION 'Select at least one seat';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.venue_seats vs
    WHERE vs.seat_identifier = ANY(p_seats) AND vs.status <> 'available'
  ) THEN
    RAISE EXCEPTION 'One or more selected seats are not available for sale';
  END IF;

  SELECT s.price, coalesce(s.available_seats, 0), s.start_time, p.title, p.total_tickets_capacity
    INTO v_price, v_available_seats, v_start_time, v_title, v_capacity
    FROM public.showtimes s
    LEFT JOIN public.productions p ON p.id = s.production_id
    WHERE s.id = p_showtime_id
    FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showtime not found';
  END IF;

  IF v_num > v_available_seats THEN
    RAISE EXCEPTION 'Not enough seats';
  END IF;

  -- Production ticket cap: block if this sale would push tickets past capacity.
  SELECT count(*) INTO v_booked
    FROM public.booking_seats
    WHERE showtime_id = p_showtime_id AND status = 'booked';
  IF v_booked + v_num > v_capacity THEN
    RAISE EXCEPTION 'Sold out: only % ticket(s) remain for this performance', greatest(0, v_capacity - v_booked);
  END IF;

  -- TOTAL = sum of each selected seat's effective zone price (flat fallback).
  -- Walk-up sales pay the same per-zone door price; no online service fee.
  v_total := public.sum_effective_seat_total(p_showtime_id, p_seats, v_price);

  INSERT INTO public.bookings (
    user_id, showtime_id, movie_title, show_start_time,
    num_tickets, total_price, status, channel, payment_method
  ) VALUES (
    NULL, p_showtime_id, v_title, v_start_time,
    v_num, v_total, 'paid', 'box_office', p_payment_method
  )
  RETURNING id INTO v_booking_id;

  BEGIN
    FOREACH v_seat IN ARRAY p_seats LOOP
      INSERT INTO public.booking_seats (booking_id, showtime_id, seat_number)
      VALUES (v_booking_id, p_showtime_id, v_seat);
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'One or more selected seats are no longer available';
  END;

  UPDATE public.showtimes
    SET available_seats = available_seats - v_num
    WHERE id = p_showtime_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_box_office_booking(uuid, text[], text) TO authenticated;

-- 3c. create_pending_booking (online RESERVE, phase 1) ───────────────────────
--     Copy of 20260707130000 (service-fee version); ONLY the ticket subtotal
--     changes to the summed zone total. The flat $0.75 per-booking service fee is
--     preserved verbatim: added ONCE, only when the ticket subtotal is > 0.
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

  -- Ticket subtotal = sum of each selected seat's effective zone price (falls
  -- back to the flat showtimes.price for any zone without an override). Never
  -- from the client.
  v_total := public.sum_effective_seat_total(p_showtime_id, p_seats, v_price);
  -- Flat $0.75 per-booking service fee (mirrors withServiceFee): only on a
  -- paid order, so a $0 subtotal (comp) stays $0. Keep this literal in sync with
  -- SERVICE_FEE_USD in the app/functions config.
  IF v_total > 0 THEN
    v_total := v_total + 0.75;
  END IF;

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

-- Refresh PostgREST so the new table and RPC signatures are exposed immediately.
NOTIFY pgrst, 'reload schema';
