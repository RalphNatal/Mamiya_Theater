-- ─────────────────────────────────────────────────────────────────────────
-- PER-TICKET ADDITIONAL FEES — replaces the flat $0.75 per-BOOKING service fee.
--
-- Model (confirm with the stakeholder; each rate is a one-line edit below):
--   per paid ticket:  beautification $0.75  +  school $0.75  +  ticketing $0.75
-- The old flat $0.75 "service fee" becomes the per-ticket ticketing fee.
-- Fees apply ONLY to paid online orders (a $0 comp stays $0); walk-up box-office
-- sales are unchanged (no online fees) pending the stakeholder's answer.
--
--   1. public.ticket_fees  — THE rate card the RPC prices from. Readable by
--      everyone (the checkout summary shows it), writable only from SQL /
--      service role. Seeded with the model above; mirrored as FEES in
--      src/config/venue.ts + supabase/functions/_shared/venue.ts.
--   2. bookings.beautification_total / school_total / ticketing_fee_total —
--      the fee breakdown SNAPSHOTTED at reservation time, so historical
--      dashboard figures stay correct if a rate changes later. Face (ticket)
--      revenue is always total_price − (the three fee columns), which makes
--      every existing row — box office (no fees) and pre-fee online sales —
--      correct without a face column.
--   3. create_pending_booking — supersedes 20260707130000 + 20260708130000
--      (3c): total_price = Σ seat face prices + Σ(fee × num_tickets), each fee
--      bucket rounded to cents and stored. This is the ONE place the charged
--      total is computed; stripe-create-checkout itemizes from the snapshot,
--      and stripe-verify-checkout / paypal-capture-order compare against
--      total_price, so create / charge / verify agree to the cent.
--   4. get_booking_confirmation — also returns the fee snapshot.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Rate card ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_fees (
  key        text PRIMARY KEY CHECK (key IN ('beautification', 'school', 'ticketing')),
  label      text NOT NULL,
  usd        numeric NOT NULL CHECK (usd >= 0),
  sort_order int  NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the default model. ON CONFLICT DO NOTHING so re-running this migration
-- never overwrites a rate the stakeholder has since changed.
INSERT INTO public.ticket_fees (key, label, usd, sort_order) VALUES
  ('beautification', 'Beautification fee', 0.75, 1),
  ('school',         'School fee',         0.75, 2),
  ('ticketing',      'Ticketing fee',      0.75, 3)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.ticket_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ticket fees are viewable by everyone" ON public.ticket_fees;
CREATE POLICY "Ticket fees are viewable by everyone"
  ON public.ticket_fees FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policies: the client can never change a rate.
GRANT SELECT ON public.ticket_fees TO anon, authenticated;

-- Per-ticket fee for one bucket (0 when inactive/missing). Used by the RPC.
CREATE OR REPLACE FUNCTION public.ticket_fee_usd(p_key text)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((SELECT f.usd FROM public.ticket_fees f WHERE f.key = p_key AND f.active), 0);
$$;
REVOKE EXECUTE ON FUNCTION public.ticket_fee_usd(text) FROM PUBLIC, anon, authenticated;

-- 2. Fee snapshot on the booking ────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS beautification_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS school_total         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticketing_fee_total  numeric NOT NULL DEFAULT 0;

-- Backfill: under the old model every paid online order (created since the
-- flat-fee RPC of 2026-07-07) carried ONE $0.75 service fee, which is today's
-- "ticketing" bucket. Box-office rows and pre-fee online rows keep 0, so their
-- face revenue = total_price. Review with:
--   select id, created_at, total_price, ticketing_fee_total from public.bookings
--    where channel = 'online' order by created_at;
UPDATE public.bookings
   SET ticketing_fee_total = 0.75
 WHERE channel = 'online'
   AND total_price > 0.75
   AND created_at >= '2026-07-07'
   AND beautification_total = 0 AND school_total = 0 AND ticketing_fee_total = 0;

-- 3. create_pending_booking — per-ticket fees, snapshotted ──────────────────
--    Copy of 20260708130000 (3c); ONLY the fee math + INSERT columns change.
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

  -- Per-TICKET fees (rate card: public.ticket_fees), × the number of seats,
  -- each bucket rounded to cents. Only on a paid order: a $0 comp stays $0.
  IF v_face > 0 THEN
    v_beaut     := round(public.ticket_fee_usd('beautification') * v_num, 2);
    v_school    := round(public.ticket_fee_usd('school')         * v_num, 2);
    v_ticketing := round(public.ticket_fee_usd('ticketing')      * v_num, 2);
  END IF;

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

-- 4. get_booking_confirmation — include the fee snapshot ────────────────────
--    Same shape as 20260701120000 plus `fees`, so the confirmation page can
--    show what was paid in fees without a second query.
CREATE OR REPLACE FUNCTION public.get_booking_confirmation(p_booking_id uuid)
RETURNS json AS $$
  SELECT json_build_object(
    'id',              b.id,
    'payment_status',  b.payment_status,
    'status',          b.status,
    'movie_title',     b.movie_title,
    'show_start_time', b.show_start_time,
    'num_tickets',     b.num_tickets,
    'total_price',     b.total_price,
    'seats',           coalesce(
                         (SELECT array_agg(bs.seat_number ORDER BY bs.seat_number)
                            FROM public.booking_seats bs
                           WHERE bs.booking_id = b.id AND bs.status = 'booked'),
                         ARRAY[]::text[]
                       ),
    'fees',            json_build_object(
                         'beautification', b.beautification_total,
                         'school',         b.school_total,
                         'ticketing',      b.ticketing_fee_total
                       )
  )
  FROM public.bookings b
  WHERE b.id = p_booking_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_booking_confirmation(uuid) TO anon, authenticated;

-- Refresh PostgREST so the new table/columns/RPC shapes are exposed immediately.
NOTIFY pgrst, 'reload schema';
