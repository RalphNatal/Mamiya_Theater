-- ─────────────────────────────────────────────────────────────────────────
-- VISUAL SEATING + BOX OFFICE POS
--
-- Adds a master seat map for the single flat-rate auditorium, lets walk-up
-- (box office) sales attach to no account, and gives admins a server-side
-- entry point that processes a flat-rate cash/card sale safely.
--
-- Pricing stays flat: every seat for a given showtime is sold at that
-- showtime's single `price` column. There is NO per-seat or zone pricing.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. venue_seats — the physical auditorium, standardized once ───────────────
--    One row per physical seat. `is_accessible` and `status` are venue-level
--    facts (a seat is wheelchair-accessible / blocked for VIP-press / broken
--    for maintenance regardless of showtime).
--
--    NOTE ON 'booked': a seat is only ever "booked" for a SPECIFIC showtime,
--    so booked is NOT a venue-level status — it is derived per-showtime from
--    booking_seats. venue_seats.status is therefore the set of *static* states
--    {available, blocked, broken}; the UI overlays "booked" per showtime.
CREATE TABLE IF NOT EXISTS public.venue_seats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_identifier TEXT NOT NULL UNIQUE,                 -- e.g. "A1"
  row_label       TEXT NOT NULL,                        -- "A".."J"
  col_number      INT  NOT NULL,                        -- 1..10
  is_accessible   BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'blocked', 'broken')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed the A–J × 10 = 100-seat layout to match the fixed grid the public
-- seat picker already renders. Idempotent via the unique seat_identifier.
INSERT INTO public.venue_seats (seat_identifier, row_label, col_number)
SELECT r || c::text, r, c
FROM unnest(ARRAY['A','B','C','D','E','F','G','H','I','J']) AS r,
     generate_series(1, 10) AS c
ON CONFLICT (seat_identifier) DO NOTHING;

-- RLS: anyone may read the layout (public picker shows accessible/blocked
-- seats); only admins may change it. Gated like every other admin-write table.
ALTER TABLE public.venue_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue seats are viewable by everyone" ON public.venue_seats;
CREATE POLICY "Venue seats are viewable by everyone"
  ON public.venue_seats FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Admins can insert venue seats" ON public.venue_seats;
CREATE POLICY "Admins can insert venue seats"
  ON public.venue_seats FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update venue seats" ON public.venue_seats;
CREATE POLICY "Admins can update venue seats"
  ON public.venue_seats FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete venue seats" ON public.venue_seats;
CREATE POLICY "Admins can delete venue seats"
  ON public.venue_seats FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. bookings — allow account-less walk-up sales + record the sale channel ──
--    Walk-up box office sales have no customer account, so user_id becomes
--    nullable; channel/payment_method capture how the sale was made.
ALTER TABLE public.bookings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS channel        TEXT NOT NULL DEFAULT 'online'
                             CHECK (channel IN ('online', 'box_office')),
  ADD COLUMN IF NOT EXISTS payment_method TEXT
                             CHECK (payment_method IN ('cash', 'card'));

-- 3. Harden the public booking RPC to refuse blocked/broken seats ──────────
--    (Recreated from the theater-pivot migration; only the venue_seats
--    availability guard is added. Booked-seat conflicts are still caught by
--    booking_seats' unique (showtime_id, seat_number) constraint.)
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_num_tickets := coalesce(array_length(p_seats, 1), 0);
  IF v_num_tickets = 0 THEN
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
    FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showtime not found';
  END IF;

  IF v_num_tickets > v_available_seats THEN
    RAISE EXCEPTION 'Not enough seats';
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

-- 4. Box office sale — admin-only, flat-rate, account-less, paid ───────────
--    SECURITY DEFINER so it can write a booking with user_id = NULL and skip
--    the per-user RLS path; it gates on the CALLER being an admin instead.
--    total_price is computed server-side as seats × showtimes.price, so the
--    client can never dictate the amount.
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

  SELECT s.price, coalesce(s.available_seats, 0), s.start_time, p.title
    INTO v_price, v_available_seats, v_start_time, v_title
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

-- Refresh PostgREST so the new table and RPC are exposed immediately.
NOTIFY pgrst, 'reload schema';
