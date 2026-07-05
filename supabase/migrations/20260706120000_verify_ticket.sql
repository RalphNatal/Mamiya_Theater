-- ─────────────────────────────────────────────────────────────────────────
-- QR E-TICKET — public ticket read + box-office verify/check-in.
--
-- The QR in the receipt email (and on the /ticket page) encodes the ticket URL
-- built from the UNGUESSABLE booking UUID — same trust model as
-- get_booking_confirmation (20260701120000): possession of the 122-bit id is the
-- credential, no signed token yet (that's a deliberate later option). shortRef()
-- (MT-XXXXXXXX) is only ever the human-readable label, never the lookup key for
-- the public page.
--
--   • get_ticket(uuid)     — PUBLIC read for /ticket/:ref. Keyed strictly by the
--                            full booking UUID (unguessable), so it can't be
--                            enumerated the way an 8-hex shortRef could. Returns
--                            payment_status so the page can show a "not yet paid"
--                            state; anon + authenticated.
--   • verify_ticket(text)  — ADMIN scan/verify + check-in for the box office.
--                            Accepts a scanned ticket URL, a bare UUID, OR a
--                            typed shortRef, resolves the booking, and (by
--                            default) stamps checked_in_at once so re-scans read
--                            as "already checked in". Strictly paid-only.
-- ─────────────────────────────────────────────────────────────────────────

-- Optional check-in marker: NULL = not yet scanned at the door.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

-- ── get_ticket ─────────────────────────────────────────────────────────────
-- Public, unguessable-UUID-keyed read for the /ticket page. Mirrors the
-- get_booking_confirmation shape and adds checked_in_at. Returns NULL when no
-- booking has that id.
CREATE OR REPLACE FUNCTION public.get_ticket(p_booking_id uuid)
RETURNS json AS $$
  SELECT json_build_object(
    'id',              b.id,
    'payment_status',  b.payment_status,
    'movie_title',     b.movie_title,
    'show_start_time', b.show_start_time,
    'num_tickets',     b.num_tickets,
    'total_price',     b.total_price,
    'checked_in_at',   b.checked_in_at,
    'seats',           coalesce(
                         (SELECT array_agg(bs.seat_number ORDER BY bs.seat_number)
                            FROM public.booking_seats bs
                           WHERE bs.booking_id = b.id),
                         ARRAY[]::text[]
                       )
  )
  FROM public.bookings b
  WHERE b.id = p_booking_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_ticket(uuid) TO anon, authenticated;

-- ── verify_ticket ──────────────────────────────────────────────────────────
-- Box-office scan/verify. ADMIN ONLY (checked via auth.uid()). p_input may be a
-- scanned ".../ticket/<uuid>" URL, a bare UUID, or a typed shortRef. When
-- p_check_in is true (default) and the ticket isn't already checked in, it
-- stamps checked_in_at once; `already_checked_in` reflects the state BEFORE this
-- call, so the first scan reads false and a second reads true.
CREATE OR REPLACE FUNCTION public.verify_ticket(
  p_input     text,
  p_check_in  boolean DEFAULT true
)
RETURNS json AS $$
DECLARE
  v_token   text;
  v_hex     text;
  v_id      uuid;
  v_bid     uuid;
  v_pay     text;
  v_title   text;
  v_start   timestamptz;
  v_num     int;
  v_checked timestamptz;
  v_was     boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- If a full ticket URL was scanned, keep only the ref segment after /ticket/.
  v_token := btrim(coalesce(p_input, ''));
  IF position('/ticket/' IN v_token) > 0 THEN
    v_token := regexp_replace(v_token, '^.*/ticket/', '');
    v_token := regexp_replace(v_token, '[/?#].*$', '');   -- drop trailing path/query
  END IF;

  -- Hex-only view of the token: a full id yields 32 hex, a shortRef yields 8.
  v_hex := regexp_replace(lower(btrim(v_token)), '[^0-9a-f]', '', 'g');

  IF length(v_hex) >= 32 THEN
    -- Rebuild the canonical UUID from its 32 hex chars (handles dashed or not).
    v_id := (substr(v_hex, 1, 8) || '-' || substr(v_hex, 9, 4) || '-' ||
             substr(v_hex, 13, 4) || '-' || substr(v_hex, 17, 4) || '-' ||
             substr(v_hex, 21, 12))::uuid;
    SELECT b.id, b.payment_status, b.movie_title, b.show_start_time, b.num_tickets, b.checked_in_at
      INTO v_bid, v_pay, v_title, v_start, v_num, v_checked
      FROM public.bookings b WHERE b.id = v_id;
  ELSIF length(v_hex) >= 8 THEN
    -- shortRef: match the first 8 hex of the id (oldest wins any rare collision).
    SELECT b.id, b.payment_status, b.movie_title, b.show_start_time, b.num_tickets, b.checked_in_at
      INTO v_bid, v_pay, v_title, v_start, v_num, v_checked
      FROM public.bookings b
      WHERE left(replace(b.id::text, '-', ''), 8) = left(v_hex, 8)
      ORDER BY b.created_at
      LIMIT 1;
  END IF;

  IF v_bid IS NULL THEN
    RETURN json_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_pay <> 'paid' THEN
    RETURN json_build_object('valid', false, 'reason', 'not_paid', 'id', v_bid);
  END IF;

  v_was := v_checked IS NOT NULL;

  IF p_check_in AND NOT v_was THEN
    UPDATE public.bookings SET checked_in_at = now()
      WHERE id = v_bid
      RETURNING checked_in_at INTO v_checked;
  END IF;

  RETURN json_build_object(
    'valid',              true,
    'id',                 v_bid,
    'movie_title',        v_title,
    'show_start_time',    v_start,
    'num_tickets',        v_num,
    'already_checked_in', v_was,
    'checked_in_at',      v_checked,
    'seats',              coalesce(
                            (SELECT array_agg(bs.seat_number ORDER BY bs.seat_number)
                               FROM public.booking_seats bs
                              WHERE bs.booking_id = v_bid),
                            ARRAY[]::text[]
                          )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.verify_ticket(text, boolean) TO authenticated;

-- Refresh PostgREST so the new column + RPCs are exposed immediately.
NOTIFY pgrst, 'reload schema';
