-- ─────────────────────────────────────────────────────────────────────────
-- $0.75 PER-BOOKING SERVICE FEE — persist it in the booking's total_price.
--
-- The flat platform/service fee is charged server-side in the Stripe/PayPal
-- create functions and re-checked in their verify/capture anti-tamper guards
-- (see SERVICE_FEE_USD in supabase/functions/_shared/venue.ts and its client
-- mirror). This migration folds the SAME fee into total_price at RESERVE time so
-- the confirmation screen, receipt email, and ticket lookups all show the exact
-- amount the customer was charged (tickets + fee), not just the ticket subtotal.
--
-- Rule (must match withServiceFee()): flat $0.75 ONCE PER BOOKING, applied only
-- when the ticket subtotal is > 0. A $0 subtotal (a free/comp online order) stays
-- $0 — no fee. Box-office bookings use create_box_office_booking and are untouched.
--
-- Only the v_total computation changes; the rest of create_pending_booking is a
-- faithful copy of 20260701120000_stripe_checkout_online_payments.sql.
-- ─────────────────────────────────────────────────────────────────────────

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

NOTIFY pgrst, 'reload schema';
