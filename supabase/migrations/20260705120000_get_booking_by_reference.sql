-- ─────────────────────────────────────────────────────────────────────────
-- GUEST BOOKING LOOKUP — retrieve a paid booking by reference + email
--
-- Authenticated buyers see their bookings under Profile (owner RLS). Guests
-- have no account and no session — all they hold is the "MT-XXXXXXXX" reference
-- from their confirmation email. This SECURITY DEFINER RPC lets them pull that
-- one booking back by supplying BOTH the reference AND the email it was booked
-- with, so the lookup is never enumerable from the reference alone.
--
-- Reference matching: shortRef() (src/config/venue.ts + the functions mirror)
-- encodes the first 8 hex chars of the booking UUID, uppercased, prefixed "MT-".
-- We match by re-deriving those 8 hex chars from the UUID — no stored column.
--
--   Decision (see task note): match on left(replace(id::text,'-',''),8) rather
--   than adding a stored reference column. It reuses the exact bytes shortRef()
--   already encodes and needs no backfill/writes elsewhere. The ~1-in-4-billion
--   theoretical 8-hex collision is made irrelevant by the mandatory email gate
--   (a collision would also have to share the buyer's email). If a stored
--   canonical reference is ever wanted, populate it at booking creation and
--   swap the WHERE clause — the RPC signature and JSON shape stay the same.
--
-- Security: returns ONLY payment_status='paid' bookings, and ONLY when the
-- email matches (guest_email or the owning profile's email, case-insensitive).
-- Returns NULL for anything else — never revealing WHICH of reference/email was
-- wrong (no enumeration signal). Mirrors get_booking_confirmation's JSON shape.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_booking_by_reference(
  p_reference text,
  p_email     text
)
RETURNS json AS $$
DECLARE
  v_ref   text;
  v_email text;
BEGIN
  -- Normalize the reference to the 8 hex chars shortRef() encodes: lowercase,
  -- then drop everything that isn't a hex digit. This transparently strips the
  -- "MT-" prefix, spaces, and any casing, so "MT-1A2B3C4D", "1a2b3c4d", and
  -- "mt 1a2b3c4d" all normalize to the same "1a2b3c4d".
  v_ref   := regexp_replace(lower(coalesce(p_reference, '')), '[^0-9a-f]', '', 'g');
  v_email := lower(btrim(coalesce(p_email, '')));

  -- Require a full 8-hex reference and a non-empty email before touching the
  -- table, so a blank or garbage request can't be used to scan.
  IF length(v_ref) < 8 OR v_email = '' THEN
    RETURN NULL;
  END IF;
  v_ref := left(v_ref, 8);

  RETURN (
    SELECT json_build_object(
      'id',              b.id,
      'movie_title',     b.movie_title,
      'show_start_time', b.show_start_time,
      'num_tickets',     b.num_tickets,
      'total_price',     b.total_price,
      'seats',           coalesce(
                           (SELECT array_agg(bs.seat_number ORDER BY bs.seat_number)
                              FROM public.booking_seats bs
                             WHERE bs.booking_id = b.id),
                           ARRAY[]::text[]
                         )
    )
    FROM public.bookings b
    LEFT JOIN public.profiles p ON p.id = b.user_id
    WHERE left(replace(b.id::text, '-', ''), 8) = v_ref
      AND b.payment_status = 'paid'
      AND (
        lower(btrim(coalesce(b.guest_email, ''))) = v_email
        OR lower(btrim(coalesce(p.email, ''))) = v_email
      )
    LIMIT 1     -- an 8-hex + email collision is astronomically unlikely; be deterministic
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Called by anon (guests) and authenticated (signed-out account holders) alike.
GRANT EXECUTE ON FUNCTION public.get_booking_by_reference(text, text) TO anon, authenticated;

-- Refresh PostgREST so the new RPC is exposed immediately.
NOTIFY pgrst, 'reload schema';
