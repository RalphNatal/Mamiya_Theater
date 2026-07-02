-- ─────────────────────────────────────────────────────────────────────────
-- PER-PRODUCTION TICKET CAPACITY
--
-- Lets an admin cap how many tickets may be sold for a production, applied to
-- EVERY one of its showtimes. This is a business cap on the ticket COUNT, laid
-- on top of the existing assigned-seat model:
--
--   remaining_tickets(showtime) = productions.total_tickets_capacity
--                               − count(booking_seats WHERE status = 'booked')
--
-- booking_seats already holds exactly one 'booked' row per sold ticket AND per
-- still-pending online reservation (create_pending_booking inserts seats as
-- 'booked' the instant checkout starts), so the count above is the true, live
-- number of tickets taken for a performance. Admin 'blocked' holds are NOT
-- tickets, so they are excluded from the cap (they already remove a physical
-- seat via booking_seats' UNIQUE (showtime_id, seat_number)).
--
-- The cap is DYNAMIC: lowering a production's capacity immediately tightens
-- every one of its showtimes (existing and future) — there is no per-showtime
-- snapshot to keep in sync. showtimes.available_seats is left untouched; it
-- stays the physical-house counter the dashboard occupancy math relies on, and
-- now simply acts as a looser secondary guard alongside this cap.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. The capacity column ────────────────────────────────────────────────────
--    Defaults to 100 (the physical A–J × 10 house) so every existing
--    production keeps its current behaviour until an admin narrows it. The
--    CHECK is defence-in-depth behind the form's "> 0" validation.
ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS total_tickets_capacity INTEGER NOT NULL DEFAULT 100
    CHECK (total_tickets_capacity > 0);

-- 2. Dynamic remaining-tickets view ─────────────────────────────────────────
--    One row per showtime with its live cap arithmetic. Occupancy counts are
--    not sensitive (the public seat map already reveals them — see
--    public_seat_occupancy_read), so this is granted to anon + authenticated.
--    Only 'booked' seats count against the cap; 'blocked' admin holds do not.
CREATE OR REPLACE VIEW public.showtime_availability AS
SELECT
  s.id,
  s.production_id,
  s.start_time,
  s.price,
  s.available_seats,
  p.total_tickets_capacity,
  COUNT(bs.id) FILTER (WHERE bs.status = 'booked')::int AS tickets_booked,
  GREATEST(
    0,
    p.total_tickets_capacity - COUNT(bs.id) FILTER (WHERE bs.status = 'booked')
  )::int AS remaining_tickets,
  (COUNT(bs.id) FILTER (WHERE bs.status = 'booked') >= p.total_tickets_capacity) AS is_sold_out
FROM public.showtimes s
JOIN public.productions p ON p.id = s.production_id
LEFT JOIN public.booking_seats bs ON bs.showtime_id = s.id
GROUP BY s.id, p.total_tickets_capacity;

GRANT SELECT ON public.showtime_availability TO anon, authenticated;

-- 3. Enforce the cap inside every booking RPC ───────────────────────────────
--    Each of the three write paths already takes FOR UPDATE OF s on the
--    showtime row, which serializes concurrent sales for the same performance —
--    so counting booking_seats after that lock cannot be raced past the cap.
--    The bodies below are the current versions verbatim; the ONLY additions are
--    v_capacity/v_booked and the capacity guard.

-- 3a. create_booking (authenticated online sale) ───────────────────────────
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

  v_total := v_price * v_num_tickets;

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

-- 3b. create_box_office_booking (admin walk-up POS sale) ───────────────────
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

  v_total := v_price * v_num;  -- flat rate: seats × showtimes.price

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

-- 3c. create_pending_booking (online RESERVE, phase 1) ──────────────────────
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
  v_capacity int;
  v_booked int;
BEGIN
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

  -- Production ticket cap: a reservation holds seats as 'booked', so it counts
  -- against the cap immediately and can't oversell a nearly-full performance.
  SELECT count(*) INTO v_booked
    FROM public.booking_seats
    WHERE showtime_id = p_showtime_id AND status = 'booked';
  IF v_booked + v_num > v_capacity THEN
    RAISE EXCEPTION 'Sold out: only % ticket(s) remain for this performance', greatest(0, v_capacity - v_booked);
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

  BEGIN
    FOREACH v_seat IN ARRAY p_seats LOOP
      INSERT INTO public.booking_seats (booking_id, showtime_id, seat_number)
      VALUES (v_booking_id, p_showtime_id, v_seat);
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'One or more selected seats are no longer available';
  END;

  RETURN json_build_object('booking_id', v_booking_id, 'amount', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_pending_booking(uuid, text[], text, text) TO anon, authenticated;

-- 4. Refresh PostgREST so the new column, view and RPC signatures are exposed.
NOTIFY pgrst, 'reload schema';
