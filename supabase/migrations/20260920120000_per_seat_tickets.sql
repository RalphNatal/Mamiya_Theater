-- ─────────────────────────────────────────────────────────────────────────
-- PER-SEAT TICKETS — one scannable QR per seat, with independent check-in.
--
-- Until now a booking had ONE QR (…/ticket/<booking uuid>) and check-in was a
-- single bookings.checked_in_at stamp, so a 3-seat party could only be admitted
-- all at once. Each booking_seats row is now its own ticket:
--
--   • ticket_token   — unguessable uuid the QR encodes as …/ticket/<token>.
--                      Same trust model as the booking uuid (possession is the
--                      credential); a token only ever resolves ONE seat.
--   • checked_in_at  — per-seat door stamp (NULL = not yet admitted)
--   • checked_in_by  — the admin who scanned it
--
-- Public reads:
--   get_ticket_by_token(uuid) — the ONE seat for a per-seat QR / link.
--   get_ticket(uuid)          — the whole booking (kept for /ticket/<booking id>
--                               links already in sent emails); now also returns a
--                               `tickets` array with each seat's token + state so
--                               the ticket page renders one QR per seat.
--
-- Box office (admin, assert_admin):
--   check_in_ticket(text, boolean) — accepts a scanned URL, a bare uuid (seat
--     token OR legacy booking id) or a typed MT- reference. A seat token is
--     checked in atomically and idempotently: ok / already_checked_in (with when)
--     / not_paid / not_found. A booking-level match returns every seat's state
--     WITHOUT checking anything in, so staff pick seats one by one (partial
--     admission of a multi-seat booking). Double scans can never double-stamp:
--     the UPDATE is guarded by `checked_in_at IS NULL`, and READ COMMITTED
--     re-checks that after the row lock, so a concurrent duplicate sees 0 rows.
--
-- verify_ticket(text, boolean) (20260706120000) is left in place but no longer
-- used by the dashboard; bookings.checked_in_at is kept in step (stamped when a
-- booking's FIRST seat is admitted) so anything still reading it stays sane.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Per-ticket identity + check-in state ──────────────────────────────────
--    gen_random_uuid() is volatile, so ADD COLUMN evaluates it PER EXISTING ROW —
--    every pre-existing seat gets its own distinct token (the UPDATE below is a
--    belt-and-braces backfill for any NULL that could ever slip through).
ALTER TABLE public.booking_seats
  ADD COLUMN IF NOT EXISTS ticket_token  uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.booking_seats SET ticket_token = gen_random_uuid() WHERE ticket_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS booking_seats_ticket_token_key
  ON public.booking_seats(ticket_token);

-- 2. Never expose tokens through plain table reads ──────────────────────────
--    The seat-occupancy SELECT policy is `using (true)` (the public seat map
--    needs it), and anon was already narrowed to (showtime_id, seat_number,
--    status) in 20260703120000. `authenticated` still had table-wide SELECT,
--    which would let ANY signed-in user list every ticket token (and receive
--    them in Realtime payloads, since REPLICA IDENTITY is FULL). Narrow it to
--    everything except ticket_token. Tokens are served ONLY by the SECURITY
--    DEFINER RPCs below. Client code never selects `*` from booking_seats
--    (the admin seat tools read seat_number/status; ProfileScreen embeds
--    booking_seats(seat_number)); the admin-hold INSERT/DELETE paths return
--    minimal and are unaffected.
REVOKE SELECT ON public.booking_seats FROM authenticated;
GRANT SELECT (id, booking_id, showtime_id, seat_number, status, checked_in_at, checked_in_by)
  ON public.booking_seats TO authenticated;

-- 3. Shared: the per-seat ticket list for a booking ─────────────────────────
--    Ordered by seat label; zone comes from the canonical venue_seats row.
CREATE OR REPLACE FUNCTION public.booking_ticket_list(p_booking_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(json_agg(json_build_object(
           'token',         bs.ticket_token,
           'seat',          bs.seat_number,
           'zone',          vs.zone,
           'checked_in_at', bs.checked_in_at
         ) ORDER BY bs.seat_number), '[]'::json)
  FROM public.booking_seats bs
  LEFT JOIN public.venue_seats vs ON vs.seat_identifier = bs.seat_number
  WHERE bs.booking_id = p_booking_id
    AND bs.status = 'booked';
$$;
-- Internal helper for the RPCs below — not callable from the client.
REVOKE EXECUTE ON FUNCTION public.booking_ticket_list(uuid) FROM PUBLIC, anon, authenticated;

-- 4. get_ticket(booking uuid) — whole booking + per-seat tickets ─────────────
--    Same top-level shape as before (TicketScreen/BookingLookup read it) plus
--    `tickets`. Returns NULL when no booking has that id.
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
                           WHERE bs.booking_id = b.id AND bs.status = 'booked'),
                         ARRAY[]::text[]
                       ),
    'tickets',         public.booking_ticket_list(b.id)
  )
  FROM public.bookings b
  WHERE b.id = p_booking_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_ticket(uuid) TO anon, authenticated;

-- 5. get_ticket_by_token(token) — exactly one seat ───────────────────────────
--    Public read for a per-seat QR / link. Returns NULL when the token matches
--    no sold seat (including admin holds, which have tokens but no booking).
CREATE OR REPLACE FUNCTION public.get_ticket_by_token(p_token uuid)
RETURNS json AS $$
  SELECT json_build_object(
    'booking_id',      b.id,
    'payment_status',  b.payment_status,
    'movie_title',     b.movie_title,
    'show_start_time', b.show_start_time,
    'num_tickets',     b.num_tickets,
    'token',           bs.ticket_token,
    'seat',            bs.seat_number,
    'zone',            vs.zone,
    'checked_in_at',   bs.checked_in_at
  )
  FROM public.booking_seats bs
  JOIN public.bookings b ON b.id = bs.booking_id
  LEFT JOIN public.venue_seats vs ON vs.seat_identifier = bs.seat_number
  WHERE bs.ticket_token = p_token
    AND bs.status = 'booked';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_ticket_by_token(uuid) TO anon, authenticated;

-- 6a. booking_checkin_summary — progress + every seat's state for the result card.
CREATE OR REPLACE FUNCTION public.booking_checkin_summary(p_booking_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'id',               b.id,
    'movie_title',      b.movie_title,
    'show_start_time',  b.show_start_time,
    'num_tickets',      b.num_tickets,
    'payment_status',   b.payment_status,
    'checked_in_count', (SELECT count(*) FROM public.booking_seats bs
                          WHERE bs.booking_id = b.id AND bs.status = 'booked'
                            AND bs.checked_in_at IS NOT NULL),
    'tickets',          public.booking_ticket_list(b.id)
  )
  FROM public.bookings b
  WHERE b.id = p_booking_id;
$$;
REVOKE EXECUTE ON FUNCTION public.booking_checkin_summary(uuid) FROM PUBLIC, anon, authenticated;

-- 6b. check_in_ticket — box-office scan / verify / admit ──────────────────────
--    ADMIN ONLY. Result envelope:
--      { result: 'ok' | 'already_checked_in' | 'not_paid' | 'booking' | 'not_found',
--        ticket:  { token, seat, zone, checked_in_at }        -- per-seat results
--        booking: { id, movie_title, show_start_time, num_tickets, payment_status,
--                   checked_in_count, tickets: [ {token, seat, zone, checked_in_at}… ] } }
--    'booking' = the input identified a whole booking (legacy booking-id QR or a
--    typed MT- reference): nothing is stamped; the caller shows the seat list.
CREATE OR REPLACE FUNCTION public.check_in_ticket(
  p_input    text,
  p_check_in boolean DEFAULT true
)
RETURNS json AS $$
DECLARE
  v_token   text;
  v_hex     text;
  v_uuid    uuid;
  v_seat    public.booking_seats%ROWTYPE;
  v_bid     uuid;
  v_pay     text;
  v_was     timestamptz;
  v_now     timestamptz;
  v_result  text;
BEGIN
  PERFORM public.assert_admin();

  -- A scanned ticket URL → keep only the segment after /ticket/.
  v_token := btrim(coalesce(p_input, ''));
  IF position('/ticket/' IN v_token) > 0 THEN
    v_token := regexp_replace(v_token, '^.*/ticket/', '');
    v_token := regexp_replace(v_token, '[/?#].*$', '');
  END IF;

  -- Hex-only view: a uuid yields 32 hex chars, a shortRef (MT-XXXXXXXX) yields 8.
  v_hex := regexp_replace(lower(v_token), '[^0-9a-f]', '', 'g');

  IF length(v_hex) >= 32 THEN
    v_uuid := (substr(v_hex, 1, 8) || '-' || substr(v_hex, 9, 4) || '-' ||
               substr(v_hex, 13, 4) || '-' || substr(v_hex, 17, 4) || '-' ||
               substr(v_hex, 21, 12))::uuid;

    -- (a) Per-seat ticket token — the normal scan path.
    SELECT bs.* INTO v_seat
      FROM public.booking_seats bs
     WHERE bs.ticket_token = v_uuid AND bs.status = 'booked' AND bs.booking_id IS NOT NULL;

    IF FOUND THEN
      SELECT b.payment_status INTO v_pay FROM public.bookings b WHERE b.id = v_seat.booking_id;
      v_bid := v_seat.booking_id;

      IF v_pay IS DISTINCT FROM 'paid' THEN
        v_result := 'not_paid';
      ELSE
        v_was := v_seat.checked_in_at;
        IF p_check_in AND v_was IS NULL THEN
          -- Atomic + idempotent: only a still-unstamped row is updated. A racing
          -- duplicate scan blocks on the row lock, re-evaluates the WHERE, and
          -- updates nothing — it then reads back the winner's stamp below.
          UPDATE public.booking_seats
             SET checked_in_at = now(), checked_in_by = auth.uid()
           WHERE id = v_seat.id AND checked_in_at IS NULL
           RETURNING checked_in_at INTO v_now;

          IF v_now IS NULL THEN
            -- Lost the race: someone stamped it between our SELECT and UPDATE.
            SELECT checked_in_at INTO v_was FROM public.booking_seats WHERE id = v_seat.id;
            v_result := 'already_checked_in';
          ELSE
            v_result := 'ok';
            -- Keep the legacy booking-level marker in step (first seat admitted).
            UPDATE public.bookings SET checked_in_at = v_now
             WHERE id = v_bid AND checked_in_at IS NULL;
          END IF;
        ELSIF v_was IS NOT NULL THEN
          v_result := 'already_checked_in';
        ELSE
          v_result := 'ok';          -- p_check_in = false: valid, not stamped
        END IF;
      END IF;

      RETURN json_build_object(
        'result',  v_result,
        'ticket',  (SELECT json_build_object(
                      'token', bs.ticket_token, 'seat', bs.seat_number, 'zone', vs.zone,
                      'checked_in_at', bs.checked_in_at)
                    FROM public.booking_seats bs
                    LEFT JOIN public.venue_seats vs ON vs.seat_identifier = bs.seat_number
                    WHERE bs.id = v_seat.id),
        'booking', public.booking_checkin_summary(v_bid)
      );
    END IF;

    -- (b) Legacy booking-level QR (…/ticket/<booking uuid>) — no auto check-in.
    SELECT b.id INTO v_bid FROM public.bookings b WHERE b.id = v_uuid;

  ELSIF length(v_hex) >= 8 THEN
    -- Typed shortRef: first 8 hex of the booking id (oldest wins a rare collision).
    SELECT b.id INTO v_bid
      FROM public.bookings b
     WHERE left(replace(b.id::text, '-', ''), 8) = left(v_hex, 8)
     ORDER BY b.created_at
     LIMIT 1;
  END IF;

  IF v_bid IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  SELECT b.payment_status INTO v_pay FROM public.bookings b WHERE b.id = v_bid;
  RETURN json_build_object(
    'result',  CASE WHEN v_pay = 'paid' THEN 'booking' ELSE 'not_paid' END,
    'booking', public.booking_checkin_summary(v_bid)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- check_in_ticket self-gates on assert_admin(); grant to authenticated like the
-- other admin RPCs, and lock out anon / PUBLIC.
REVOKE EXECUTE ON FUNCTION public.check_in_ticket(text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_in_ticket(text, boolean) TO authenticated;

-- Refresh PostgREST so the new columns/RPCs and the narrowed grant are live.
NOTIFY pgrst, 'reload schema';
