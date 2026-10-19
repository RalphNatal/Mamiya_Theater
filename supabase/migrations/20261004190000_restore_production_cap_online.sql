-- ─────────────────────────────────────────────────────────────────────────
-- RESTORE THE PRODUCTION TICKET CAP ON ONLINE CHECKOUT — no overselling.
--
-- 20260702120000 added productions.total_tickets_capacity and enforced it in
-- both booking RPCs ("Sold out: only N ticket(s) remain"). The online RPC lost
-- the check when 20260707130000 rewrote it, and every later redefinition
-- (20260920130000, 20260925130000, 20261004120000, 20261004140000) copied the
-- capless body. create_box_office_booking still has it (20261004180000).
--
--   create_pending_booking(…, p_promo_code) → body IDENTICAL to 20261004140000
--     (promo codes, fee lines, fee snapshot, per-order cap) plus the cap check,
--     placed right after the seat-count check — BEFORE the promo code is
--     consumed, though any raise rolls the whole call back anyway.
--
-- Same signature and default, so CREATE OR REPLACE keeps the grants and
-- there is still exactly one overload for PostgREST.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_pending_booking(
  p_showtime_id uuid,
  p_seats       text[],
  p_guest_name  text,
  p_guest_email text,
  p_promo_code  text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_price numeric;
  v_available_seats int;
  v_start_time timestamptz;
  v_title text;
  v_production_id uuid;
  v_code_required boolean;
  v_max_per_order int;
  v_code_text text := public.normalize_promo_code(p_promo_code);
  v_code public.promo_codes%ROWTYPE;
  v_problem text;
  v_num int;
  v_list_prices numeric[];
  v_prices numeric[];
  v_list_face numeric;
  v_face numeric;
  v_fees jsonb;
  v_fees_total numeric;
  v_total numeric;
  v_booking_id uuid;
  v_seat text;
  v_capacity int;
  v_booked int;
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

  SELECT s.price, coalesce(s.available_seats, 0), s.start_time, p.title, s.production_id,
         s.promo_code_required, s.max_tickets_per_order, p.total_tickets_capacity
    INTO v_price, v_available_seats, v_start_time, v_title, v_production_id,
         v_code_required, v_max_per_order, v_capacity
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

  -- Production ticket cap (restored; same rule as create_box_office_booking):
  -- every booked seat for this showtime counts — paid, walk-up, or a pending
  -- online hold — so concurrent checkouts can't jointly oversell. The showtime
  -- row lock above serializes the count.
  SELECT count(*) INTO v_booked
    FROM public.booking_seats
    WHERE showtime_id = p_showtime_id AND status = 'booked';
  IF v_booked + v_num > v_capacity THEN
    RAISE EXCEPTION 'Sold out: only % ticket(s) remain for this performance', greatest(0, v_capacity - v_booked);
  END IF;

  IF v_max_per_order IS NOT NULL AND v_num > v_max_per_order THEN
    RAISE EXCEPTION 'You can buy at most % ticket% per order for this show.',
      v_max_per_order, CASE WHEN v_max_per_order = 1 THEN '' ELSE 's' END;
  END IF;

  -- Promo code: validated and consumed HERE, under a row lock, never trusted
  -- from the client. Two buyers racing on one code serialize on the lock, so
  -- used_tickets can never pass max_tickets (also a CHECK constraint).
  IF v_code_text IS NOT NULL THEN
    SELECT * INTO v_code FROM public.promo_codes WHERE code = v_code_text FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That promo code was not found. Check it and try again.';
    END IF;
    v_problem := public.promo_code_problem(v_code, p_showtime_id, v_production_id, v_num);
    IF v_problem IS NOT NULL THEN
      RAISE EXCEPTION '%', v_problem;
    END IF;
    UPDATE public.promo_codes SET used_tickets = used_tickets + v_num WHERE id = v_code.id;
  ELSIF v_code_required THEN
    RAISE EXCEPTION 'A promo code is required for this show.';
  END IF;

  -- Each seat's FACE price (zone override, else the flat showtime price), then
  -- the promo discount per ticket, then the fee lines over the DISCOUNTED
  -- prices — so a 'free' code's $0 seats carry no fees.
  v_list_prices := public.seat_face_prices(p_showtime_id, p_seats, v_price);
  IF v_code.id IS NOT NULL THEN
    SELECT coalesce(array_agg(public.apply_promo_discount(x, v_code.discount_type, v_code.discount_value)), ARRAY[]::numeric[])
      INTO v_prices FROM unnest(v_list_prices) x;
  ELSE
    v_prices := v_list_prices;
  END IF;
  v_list_face  := coalesce((SELECT sum(x) FROM unnest(v_list_prices) x), 0);
  v_face       := coalesce((SELECT sum(x) FROM unnest(v_prices) x), 0);
  v_fees       := public.compute_ticket_fees(v_prices);
  v_fees_total := public.fee_breakdown_total(v_fees);
  v_total      := v_face + v_fees_total;

  INSERT INTO public.bookings (
    user_id, showtime_id, movie_title, show_start_time,
    num_tickets, total_price, status, payment_status, channel,
    guest_name, guest_email,
    fee_breakdown, fees_total,
    promo_code_id, promo_tickets, discount_total
  ) VALUES (
    v_user_id, p_showtime_id, v_title, v_start_time,
    v_num, v_total, 'reserved', 'pending', 'online',
    CASE WHEN v_user_id IS NULL THEN p_guest_name  ELSE NULL END,
    CASE WHEN v_user_id IS NULL THEN p_guest_email ELSE NULL END,
    v_fees, v_fees_total,
    v_code.id, CASE WHEN v_code.id IS NULL THEN 0 ELSE v_num END, v_list_face - v_face
  )
  RETURNING id INTO v_booking_id;

  -- Reserve the seats. The UNIQUE (showtime_id, seat_number) guarantees no two
  -- reservations (or a reservation + a sale) can grab the same seat. A failure
  -- here aborts the whole call, including the promo-code increment.
  BEGIN
    FOREACH v_seat IN ARRAY p_seats LOOP
      INSERT INTO public.booking_seats (booking_id, showtime_id, seat_number)
      VALUES (v_booking_id, p_showtime_id, v_seat);
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'One or more selected seats are no longer available';
  END;

  -- available_seats is deliberately NOT decremented here — that happens at
  -- FINALIZE once the payment actually succeeds (or confirm_free_booking).

  RETURN json_build_object(
    'booking_id',     v_booking_id,
    'amount',         v_total,
    'face_total',     v_face,
    'discount_total', v_list_face - v_face,
    'fees_total',     v_fees_total,
    'fee_breakdown',  v_fees
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_pending_booking(uuid, text[], text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
