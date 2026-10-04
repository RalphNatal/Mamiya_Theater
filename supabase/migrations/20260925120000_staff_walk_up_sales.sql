-- ─────────────────────────────────────────────────────────────────────────
-- STAFF WALK-UP SALES — staff may sell at the door, still NO money totals.
--
-- Stakeholder decision (Sept 2026): staff get full box-office ability — see
-- seats remaining / available, the seat map, and SELL walk-up tickets — but
-- never the theatre's earnings. 20260924120000 left selling admin-only and
-- said how to open it: this migration is the data half, and
-- PERMISSIONS.staff.walkUpSales = true in src/config/permissions.ts is the UI
-- half.
--
--   create_box_office_booking() → guard switched from the inline role = 'admin'
--                                 check to assert_staff() (staff OR admin).
--                                 Body otherwise IDENTICAL to 20260708130000
--                                 §3b. It returns only the new booking's id.
--
-- What staff still CANNOT reach (all unchanged, all role = 'admin' exactly):
--   RPCs   get_dashboard_kpis, get_sales_timeseries, get_sales_channels,
--          get_top_shows, get_revenue_breakdown, funnel_counts (assert_admin)
--   views  show_ticket_stats (current_user_is_admin)
--   RLS    bookings + payments "own row OR admin"; production_stats admin-only
-- Everything else the walk-up screen reads (showtimes, showtime_seat_prices,
-- showtime_availability, venue_seats, booking_seats occupancy) is already
-- readable by anonymous visitors for the public seat picker.
--
-- Verify after applying: supabase/checks/staff_access_checklist.sql.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

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

REVOKE EXECUTE ON FUNCTION public.create_box_office_booking(uuid, text[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_box_office_booking(uuid, text[], text) TO authenticated;

-- Refresh PostgREST so the widened guard is live immediately.
NOTIFY pgrst, 'reload schema';
