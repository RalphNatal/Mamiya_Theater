-- ─────────────────────────────────────────────────────────────────────────
-- PROMO CODES — per-recipient ticket limits (the graduation use case).
--
-- e.g. 400 graduating students, each allowed exactly 1 ticket: an admin
-- generates a batch of 400 unguessable codes (max_tickets = 1, discount 'free'),
-- exports it as CSV, and hands one code to each student. A 'free' code makes
-- the seat $0, so it carries no fees (compute_ticket_fees) and the order is
-- finalized by confirm_free_booking (20261004130000).
--
--   1. public.promo_codes — one row per code. Never readable by anon /
--      authenticated users; admins read via RLS (current_user_is_admin), and
--      everything else goes through the SECURITY DEFINER RPCs below.
--   2. showtimes.promo_code_required — make a show code-only (otherwise anyone
--      could buy around the limit); showtimes.max_tickets_per_order — the
--      lightweight per-order cap for shows that don't need per-recipient codes.
--   3. apply_promo_discount(price, type, value) — THE discount rule, per ticket,
--      cent-exact; mirrored by applyPromoDiscount() in both venue.ts files:
--        free    → 0
--        percent → price − round(price × value / 100, 2)
--        fixed   → max(price − value, 0)
--        none    → price (the code only gates access / enforces the limit)
--   4. create_pending_booking(…, p_promo_code) — validates + applies the code
--      SERVER-SIDE under a row lock on the code: rejects unknown / inactive /
--      expired / wrong-show / over-limit codes with clear messages, then
--      atomically adds the order's tickets to used_tickets. Fees are computed
--      on the DISCOUNTED prices. The 4-arg overload is dropped (PostgREST would
--      find two candidates); the new arg defaults to NULL so old callers work.
--   5. Trigger: when a held booking is deleted (cancel_reservation, the expiry
--      sweep), its tickets go back to the code — an abandoned checkout never
--      burns a student's only ticket.
--   6. preview_promo_code — read-only check for the checkout summary (consumes
--      nothing; the booking RPC re-validates).
--   7. Admin RPCs (assert_admin): generate_promo_codes, get_promo_batches,
--      get_promo_batch_codes (CSV export), set_promo_batch_active.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push`, with the frontend deploy.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Codes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE CHECK (code = upper(code) AND length(code) BETWEEN 4 AND 40),
  batch_id       uuid NOT NULL,
  batch_label    text NOT NULL,
  production_id  uuid REFERENCES public.productions(id) ON DELETE CASCADE,  -- NULL = any event
  showtime_id    uuid REFERENCES public.showtimes(id)   ON DELETE CASCADE,  -- NULL = any show
  max_tickets    int  NOT NULL CHECK (max_tickets > 0),
  used_tickets   int  NOT NULL DEFAULT 0 CHECK (used_tickets >= 0),
  discount_type  text NOT NULL CHECK (discount_type IN ('free', 'percent', 'fixed', 'none')),
  discount_value numeric NOT NULL DEFAULT 0 CHECK (
    discount_value >= 0 AND discount_value = round(discount_value, 2)
    AND (discount_type <> 'percent' OR discount_value <= 100)),
  expires_at     timestamptz,
  active         boolean NOT NULL DEFAULT true,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_within_limit CHECK (used_tickets <= max_tickets)
);
CREATE INDEX IF NOT EXISTS promo_codes_batch_idx ON public.promo_codes (batch_id);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read promo codes" ON public.promo_codes;
CREATE POLICY "Admins read promo codes" ON public.promo_codes
  FOR SELECT TO authenticated USING (public.current_user_is_admin());
REVOKE ALL ON public.promo_codes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.promo_codes FROM authenticated;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS promo_code_id  uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promo_tickets  int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS bookings_promo_code_idx ON public.bookings (promo_code_id) WHERE promo_code_id IS NOT NULL;

-- 2. Per-show settings ──────────────────────────────────────────────────────
ALTER TABLE public.showtimes
  ADD COLUMN IF NOT EXISTS promo_code_required   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_tickets_per_order int CHECK (max_tickets_per_order IS NULL OR max_tickets_per_order > 0);

-- 3. THE discount rule ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_promo_discount(p_price numeric, p_type text, p_value numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT CASE p_type
    WHEN 'free'    THEN 0::numeric
    WHEN 'percent' THEN greatest(p_price - round(p_price * p_value / 100, 2), 0)
    WHEN 'fixed'   THEN greatest(p_price - p_value, 0)
    ELSE p_price
  END;
$$;

-- Normalize what a buyer types: trim, upper-case. Codes never contain spaces.
CREATE OR REPLACE FUNCTION public.normalize_promo_code(p_code text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT nullif(upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')), ''); $$;

-- Shared validation: the reason a code can't be used for p_tickets more tickets
-- on this showtime, or NULL when it can. Callers hold the row lock if they will
-- consume it.
CREATE OR REPLACE FUNCTION public.promo_code_problem(
  p_code public.promo_codes, p_showtime_id uuid, p_production_id uuid, p_tickets int
)
RETURNS text
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT p_code.active THEN 'This promo code is no longer active.'
    WHEN p_code.expires_at IS NOT NULL AND p_code.expires_at <= now() THEN 'This promo code has expired.'
    WHEN p_code.showtime_id IS NOT NULL AND p_code.showtime_id <> p_showtime_id THEN 'This promo code is not valid for this show.'
    WHEN p_code.production_id IS NOT NULL AND p_code.production_id IS DISTINCT FROM p_production_id THEN 'This promo code is not valid for this event.'
    WHEN p_code.used_tickets >= p_code.max_tickets THEN 'This promo code has already been used.'
    WHEN p_code.used_tickets + p_tickets > p_code.max_tickets THEN
      format('This promo code covers %s more ticket%s — please select no more than that.',
             p_code.max_tickets - p_code.used_tickets,
             CASE WHEN p_code.max_tickets - p_code.used_tickets = 1 THEN '' ELSE 's' END)
    ELSE NULL
  END;
$$;

-- 4. create_pending_booking with promo codes ────────────────────────────────
DROP FUNCTION IF EXISTS public.create_pending_booking(uuid, text[], text, text);
CREATE FUNCTION public.create_pending_booking(
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
         s.promo_code_required, s.max_tickets_per_order
    INTO v_price, v_available_seats, v_start_time, v_title, v_production_id,
         v_code_required, v_max_per_order
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

-- 5. Release a deleted hold's tickets back to its code ──────────────────────
CREATE OR REPLACE FUNCTION public.release_promo_tickets()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.promo_code_id IS NOT NULL AND OLD.promo_tickets > 0 THEN
    UPDATE public.promo_codes
       SET used_tickets = greatest(used_tickets - OLD.promo_tickets, 0)
     WHERE id = OLD.promo_code_id;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS bookings_release_promo_tickets ON public.bookings;
CREATE TRIGGER bookings_release_promo_tickets
  AFTER DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.release_promo_tickets();

-- 6. Checkout preview (consumes nothing) ────────────────────────────────────
-- Same messages as the booking RPC. Returns only what the buyer needs to price
-- the summary — never the code's batch or other codes.
CREATE OR REPLACE FUNCTION public.preview_promo_code(p_code text, p_showtime_id uuid, p_tickets int DEFAULT 1)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code public.promo_codes%ROWTYPE;
  v_production_id uuid;
  v_problem text;
BEGIN
  SELECT * INTO v_code FROM public.promo_codes WHERE code = public.normalize_promo_code(p_code);
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'message', 'That promo code was not found. Check it and try again.');
  END IF;
  SELECT s.production_id INTO v_production_id FROM public.showtimes s WHERE s.id = p_showtime_id;
  v_problem := public.promo_code_problem(v_code, p_showtime_id, v_production_id, greatest(coalesce(p_tickets, 1), 1));
  IF v_problem IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'message', v_problem);
  END IF;
  RETURN json_build_object(
    'ok', true,
    'code', v_code.code,
    'discount_type', v_code.discount_type,
    'discount_value', v_code.discount_value,
    'remaining', v_code.max_tickets - v_code.used_tickets
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.preview_promo_code(text, uuid, int) TO anon, authenticated;

-- 7. Admin: generate / list / export / (de)activate ─────────────────────────
-- Codes: optional PREFIX + 10 characters from a 32-letter alphabet without
-- look-alikes (no 0/O, 1/I), as XXXXX-XXXXX — 50 random bits each, from
-- gen_random_uuid()'s fully random bytes. Retries on the (astronomically rare)
-- collision until exactly p_quantity codes exist in the batch.
CREATE OR REPLACE FUNCTION public.random_promo_suffix()
RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- exactly 32: byte % 32 is uniform
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_out text := '';
  v_idx int[] := ARRAY[0, 1, 2, 3, 4, 5, 10, 11, 12, 13];  -- skip version/variant bytes 6–9
  i int;
BEGIN
  FOR i IN 1..10 LOOP
    v_out := v_out || substr(v_alpha, (get_byte(v_bytes, v_idx[i]) % 32) + 1, 1);
    IF i = 5 THEN v_out := v_out || '-'; END IF;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.random_promo_suffix() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_promo_codes(
  p_quantity       int,
  p_batch_label    text,
  p_prefix         text,
  p_production_id  uuid,
  p_showtime_id    uuid,
  p_max_tickets    int,
  p_discount_type  text,
  p_discount_value numeric,
  p_expires_at     timestamptz
)
RETURNS TABLE (batch_id uuid, created int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_prefix text := upper(regexp_replace(coalesce(p_prefix, ''), '[^A-Za-z0-9]', '', 'g'));
  v_made int := 0;
  v_tries int := 0;
  v_ins int;
BEGIN
  PERFORM public.assert_admin();

  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 5000 THEN
    RAISE EXCEPTION 'Quantity must be between 1 and 5000.';
  END IF;
  IF p_batch_label IS NULL OR btrim(p_batch_label) = '' THEN
    RAISE EXCEPTION 'Give the batch a label (e.g. "Class of 2027 graduation").';
  END IF;
  IF length(v_prefix) > 12 THEN
    RAISE EXCEPTION 'Prefix can be at most 12 letters/digits.';
  END IF;
  IF p_showtime_id IS NOT NULL AND p_production_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.showtimes s WHERE s.id = p_showtime_id AND s.production_id = p_production_id) THEN
    RAISE EXCEPTION 'That show does not belong to that event.';
  END IF;

  WHILE v_made < p_quantity LOOP
    v_tries := v_tries + 1;
    IF v_tries > p_quantity * 3 + 10 THEN
      RAISE EXCEPTION 'Could not generate enough unique codes; try again.';
    END IF;
    INSERT INTO public.promo_codes (
      code, batch_id, batch_label, production_id, showtime_id,
      max_tickets, discount_type, discount_value, expires_at, created_by
    ) VALUES (
      CASE WHEN v_prefix = '' THEN '' ELSE v_prefix || '-' END || public.random_promo_suffix(),
      v_batch, btrim(p_batch_label), p_production_id, p_showtime_id,
      p_max_tickets, p_discount_type,
      CASE WHEN p_discount_type IN ('free', 'none') THEN 0 ELSE coalesce(p_discount_value, 0) END,
      p_expires_at, auth.uid()
    )
    ON CONFLICT (code) DO NOTHING;
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    v_made := v_made + v_ins;
  END LOOP;

  RETURN QUERY SELECT v_batch, v_made;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_promo_codes(int, text, text, uuid, uuid, int, text, numeric, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_promo_codes(int, text, text, uuid, uuid, int, text, numeric, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_promo_batches()
RETURNS TABLE (
  batch_id uuid, batch_label text, created_at timestamptz,
  production_title text, showtime_start timestamptz,
  discount_type text, discount_value numeric, max_tickets int, expires_at timestamptz,
  codes bigint, codes_active bigint, codes_used bigint, tickets_used bigint, tickets_allowed bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT c.batch_id, max(c.batch_label), min(c.created_at),
         max(p.title), max(s.start_time),
         max(c.discount_type), max(c.discount_value), max(c.max_tickets), max(c.expires_at),
         count(*), count(*) FILTER (WHERE c.active), count(*) FILTER (WHERE c.used_tickets > 0),
         coalesce(sum(c.used_tickets), 0)::bigint, coalesce(sum(c.max_tickets), 0)::bigint
  FROM public.promo_codes c
  LEFT JOIN public.productions p ON p.id = c.production_id
  LEFT JOIN public.showtimes s ON s.id = c.showtime_id
  GROUP BY c.batch_id
  ORDER BY min(c.created_at) DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_promo_batches() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_promo_batches() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_promo_batch_codes(p_batch_id uuid)
RETURNS TABLE (code text, max_tickets int, used_tickets int, active boolean, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT c.code, c.max_tickets, c.used_tickets, c.active, c.expires_at
  FROM public.promo_codes c WHERE c.batch_id = p_batch_id ORDER BY c.code;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_promo_batch_codes(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_promo_batch_codes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_promo_batch_active(p_batch_id uuid, p_active boolean)
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.promo_codes SET active = p_active WHERE batch_id = p_batch_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_promo_batch_active(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_promo_batch_active(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
