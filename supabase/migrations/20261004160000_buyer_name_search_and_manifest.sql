-- ─────────────────────────────────────────────────────────────────────────
-- DOOR OPERATIONS — find a booking by the buyer's LAST NAME, and a printable
-- per-show manifest sorted by last name.
--
--   1. bookings.buyer_name — the purchaser's name SNAPSHOTTED at purchase: the
--      guest name for guest checkout, else the account's profile full_name
--      (BEFORE INSERT trigger; backfilled for existing rows). Walk-up sales
--      have no name (NULL).
--   2. bookings.buyer_last_name — STORED generated last-name key
--      (last_name_key(): lower-case; "Smith, John" → smith; drops Jr/Sr/II…;
--      otherwise the last word) with a text_pattern_ops index for prefix search.
--   3. search_bookings_by_last_name(query, showtime?) — assert_staff: door
--      staff look up a party by last name (works for guest bookings). Returns
--      paid bookings only, with seats + check-in progress — NO prices or totals.
--      Defaults to shows from 12 h ago onward unless a showtime is given.
--   4. get_show_manifest(showtime) — assert_staff: one row per paid booking for
--      the door list: name · seats · ticket count · checked-in · reference.
--
-- Staff never see money here (guardrail: finance stays assert_admin).
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push`.
-- ─────────────────────────────────────────────────────────────────────────

-- 1/2. Name snapshot + last-name key ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.last_name_key(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public
AS $$
  WITH n AS (
    -- trim, collapse spaces, drop a trailing generational suffix
    SELECT regexp_replace(
             regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'),
             '[, ]+(jr|sr|ii|iii|iv|v)\.?$', '', 'i') AS s
  )
  SELECT nullif(lower(btrim(
           CASE WHEN position(',' IN s) > 0 THEN split_part(s, ',', 1)       -- "Last, First"
                ELSE regexp_replace(s, '^.* ', '') END                        -- "First Middle Last"
         )), '')
  FROM n;
$$;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS buyer_name text;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS buyer_last_name text GENERATED ALWAYS AS (public.last_name_key(buyer_name)) STORED;

CREATE INDEX IF NOT EXISTS bookings_buyer_last_name_idx
  ON public.bookings (buyer_last_name text_pattern_ops);
CREATE INDEX IF NOT EXISTS bookings_showtime_last_name_idx
  ON public.bookings (showtime_id, buyer_last_name);

CREATE OR REPLACE FUNCTION public.set_booking_buyer_name()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.buyer_name IS NULL OR btrim(NEW.buyer_name) = '' THEN
    NEW.buyer_name := coalesce(
      nullif(btrim(NEW.guest_name), ''),
      (SELECT nullif(btrim(p.full_name), '') FROM public.profiles p WHERE p.id = NEW.user_id)
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bookings_set_buyer_name ON public.bookings;
CREATE TRIGGER bookings_set_buyer_name
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_buyer_name();

-- Backfill existing rows (idempotent).
UPDATE public.bookings b
   SET buyer_name = coalesce(nullif(btrim(b.guest_name), ''),
                             (SELECT nullif(btrim(p.full_name), '') FROM public.profiles p WHERE p.id = b.user_id))
 WHERE b.buyer_name IS NULL
   AND (nullif(btrim(b.guest_name), '') IS NOT NULL OR b.user_id IS NOT NULL);

-- Shared: a booking's live seats and check-in progress.
CREATE OR REPLACE FUNCTION public.booking_seat_summary(p_booking_id uuid)
RETURNS TABLE (seats text[], checked_in int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(array_agg(bs.seat_number ORDER BY bs.seat_number), ARRAY[]::text[]),
         count(*) FILTER (WHERE bs.checked_in_at IS NOT NULL)::int
  FROM public.booking_seats bs
  WHERE bs.booking_id = p_booking_id AND bs.status = 'booked';
$$;
REVOKE EXECUTE ON FUNCTION public.booking_seat_summary(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Last-name search (door staff) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_bookings_by_last_name(
  p_query       text,
  p_showtime_id uuid DEFAULT NULL
)
RETURNS TABLE (
  booking_id      uuid,
  buyer_name      text,
  movie_title     text,
  show_start_time timestamptz,
  showtime_id     uuid,
  num_tickets     int,
  seats           text[],
  checked_in      int,
  payment_status  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  -- Escape LIKE wildcards in what staff typed.
  v_q text := replace(replace(replace(lower(btrim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_');
BEGIN
  PERFORM public.assert_staff();
  IF length(v_q) < 2 THEN
    RAISE EXCEPTION 'Type at least 2 letters of the last name.';
  END IF;

  RETURN QUERY
  SELECT b.id, b.buyer_name, b.movie_title, b.show_start_time, b.showtime_id, b.num_tickets,
         ss.seats, ss.checked_in, b.payment_status
  FROM public.bookings b
  CROSS JOIN LATERAL public.booking_seat_summary(b.id) ss
  WHERE b.status IN ('paid', 'confirmed')
    AND (p_showtime_id IS NULL OR b.showtime_id = p_showtime_id)
    AND (p_showtime_id IS NOT NULL OR b.show_start_time >= now() - interval '12 hours')
    AND (b.buyer_last_name LIKE v_q || '%'
         OR lower(b.buyer_name) LIKE '% ' || v_q || '%')   -- also a middle / compound surname
  ORDER BY (b.buyer_last_name LIKE v_q || '%') DESC, b.show_start_time, b.buyer_last_name, b.buyer_name
  LIMIT 50;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.search_bookings_by_last_name(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_bookings_by_last_name(text, uuid) TO authenticated;

-- 4. Door manifest ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_show_manifest(p_showtime_id uuid)
RETURNS TABLE (
  booking_id      uuid,
  buyer_name      text,
  buyer_last_name text,
  channel         text,
  seats           text[],
  ticket_count    int,
  checked_in      int,
  payment_status  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_staff();
  RETURN QUERY
  SELECT b.id, b.buyer_name, b.buyer_last_name, b.channel,
         ss.seats, b.num_tickets, ss.checked_in, b.payment_status
  FROM public.bookings b
  CROSS JOIN LATERAL public.booking_seat_summary(b.id) ss
  WHERE b.showtime_id = p_showtime_id
    AND b.status IN ('paid', 'confirmed')
  ORDER BY b.buyer_last_name NULLS LAST, lower(b.buyer_name) NULLS LAST, b.created_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_show_manifest(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_show_manifest(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
