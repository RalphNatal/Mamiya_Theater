-- ─────────────────────────────────────────────────────────────────────────
-- WALK-UP TICKETS ARE PAID — fix "not paid" at the door scanner.
--
-- create_box_office_booking() inserted status = 'paid' but never set
-- payment_status, so it took the column default 'unpaid'. check_in_ticket /
-- verify_ticket gate on payment_status = 'paid', so every walk-up ticket was
-- rejected as not_paid.
--
--   1. create_box_office_booking() → also inserts payment_status = 'paid' (the
--      money changed hands at the door). Body otherwise IDENTICAL to
--      20260925120000 — status stays 'paid', so production_stats and
--      show_ticket_stats (status IN ('paid','confirmed')) are unaffected.
--   2. Backfill: existing walk-ups (channel 'box_office', status 'paid') still
--      marked 'unpaid' become 'paid'. Only payment_status changes, so the
--      production_stats trigger sees no sold-state change (delta 0).
--
-- Side effects checked: walk-ups have no user/guest email, so the reminder and
-- booking-lookup paths that key off payment_status = 'paid' skip them cleanly.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Walk-up sale RPC ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_box_office_booking(
  p_showtime_id uuid,
  p_seats text[],
  p_payment_method text
)
RETURNS uuid AS $$
DECLARE
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
  PERFORM public.assert_staff();

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
    num_tickets, total_price, status, payment_status, channel, payment_method
  ) VALUES (
    NULL, p_showtime_id, v_title, v_start_time,
    v_num, v_total, 'paid', 'paid', 'box_office', p_payment_method
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

REVOKE EXECUTE ON FUNCTION public.create_box_office_booking(uuid, text[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_box_office_booking(uuid, text[], text) TO authenticated;

-- 2. Backfill ───────────────────────────────────────────────────────────────
UPDATE public.bookings
   SET payment_status = 'paid'
 WHERE channel = 'box_office'
   AND status = 'paid'
   AND payment_status = 'unpaid';

NOTIFY pgrst, 'reload schema';
