-- ─────────────────────────────────────────────────────────────────────────
-- FEES ON PRICED SEATS ONLY — a $0 seat never carries per-ticket fees.
--
-- Stakeholder: "if a ticket is $0, don't charge platform or beautification
-- fees on it." Until now fees were per SEAT whenever the order subtotal was
-- above $0, so one comp seat in an otherwise-paid order still paid $2.25.
-- Now:  fees = Σ(fee rate) × (number of seats whose face price > $0).
-- The RATES are unchanged (still public.ticket_fees).
--
--   1. count_priced_seats() — sibling of sum_effective_seat_total(): the same
--      venue_seats × showtime_seat_prices join and flat-price fallback, so a
--      seat counts toward fees exactly when it adds > $0 to the face subtotal.
--   2. create_pending_booking() — body IDENTICAL to 20260920130000 §3 except
--      the fee count: v_num (every seat) → v_priced (priced seats). The old
--      `IF v_face > 0` guard is subsumed: an all-$0 order has 0 priced seats.
--
-- Nothing else moves: the fee buckets are still snapshotted on the booking,
-- stripe-create-checkout still itemizes from that snapshot, and
-- stripe-verify-checkout / paypal-capture-order still compare against
-- total_price, so reserve / charge / verify agree to the cent. The client
-- mirror is pricedTicketCount() + withFees() in src/config/venue.ts (and the
-- functions copy). Walk-up box-office sales still pay no fees.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. How many of these seats have a face price above $0 ─────────────────────
CREATE OR REPLACE FUNCTION public.count_priced_seats(
  p_showtime_id uuid,
  p_seats       text[],
  p_flat_price  numeric
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.venue_seats vs
  LEFT JOIN public.showtime_seat_prices ssp
    ON ssp.showtime_id = p_showtime_id
   AND ssp.zone = vs.zone
  WHERE vs.seat_identifier = ANY(p_seats)
    AND COALESCE(ssp.price, p_flat_price) > 0;
$$;
REVOKE EXECUTE ON FUNCTION public.count_priced_seats(uuid, text[], numeric) FROM PUBLIC, anon, authenticated;

-- 2. create_pending_booking — fees × priced seats ────────────────────────────
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
  v_face numeric;
  v_priced int;
  v_beaut numeric := 0;
  v_school numeric := 0;
  v_ticketing numeric := 0;
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

  -- Ticket FACE subtotal = sum of each selected seat's effective zone price
  -- (falls back to the flat showtimes.price for any zone without an override).
  -- Never from the client.
  v_face := public.sum_effective_seat_total(p_showtime_id, p_seats, v_price);

  -- Per-TICKET fees (rate card: public.ticket_fees), × the number of PRICED
  -- seats (face price > $0), each bucket rounded to cents. A $0 seat (comp /
  -- free zone) adds no fees even when the rest of the order is paid, and an
  -- all-$0 order stays $0.
  v_priced    := public.count_priced_seats(p_showtime_id, p_seats, v_price);
  v_beaut     := round(public.ticket_fee_usd('beautification') * v_priced, 2);
  v_school    := round(public.ticket_fee_usd('school')         * v_priced, 2);
  v_ticketing := round(public.ticket_fee_usd('ticketing')      * v_priced, 2);

  v_total := v_face + v_beaut + v_school + v_ticketing;

  INSERT INTO public.bookings (
    user_id, showtime_id, movie_title, show_start_time,
    num_tickets, total_price, status, payment_status, channel,
    guest_name, guest_email,
    beautification_total, school_total, ticketing_fee_total
  ) VALUES (
    v_user_id, p_showtime_id, v_title, v_start_time,
    v_num, v_total, 'reserved', 'pending', 'online',
    CASE WHEN v_user_id IS NULL THEN p_guest_name  ELSE NULL END,
    CASE WHEN v_user_id IS NULL THEN p_guest_email ELSE NULL END,
    v_beaut, v_school, v_ticketing
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

  RETURN json_build_object(
    'booking_id', v_booking_id,
    'amount',     v_total,
    'face_total', v_face,
    'fees', json_build_object(
      'beautification', v_beaut,
      'school',         v_school,
      'ticketing',      v_ticketing
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_pending_booking(uuid, text[], text, text) TO anon, authenticated;

-- Refresh PostgREST so the new RPC body is live immediately.
NOTIFY pgrst, 'reload schema';
