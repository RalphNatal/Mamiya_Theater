-- ─────────────────────────────────────────────────────────────────────────
-- ABUSE / RATE LIMITS ON THE PUBLIC (anon) ENDPOINTS.
--
-- Supabase has no per-RPC throttle, so the limits live in the database, keyed
-- by the caller's IP (PostgREST exposes the request headers as the
-- `request.headers` GUC) or, for signed-in buyers, their user id.
--
--   1. private.rate_limits — fixed-window counters in a schema PostgREST does
--      NOT expose. Subjects are salted SHA-256 hashes, never raw IPs.
--      private.rate_limit_take() / rate_limit_count() are the primitives;
--      public.consume_rate_limit() exposes them to the Edge Functions
--      (service_role ONLY) for contact-message / newsletter-subscribe.
--   2. Promo-code guessing (preview_promo_code is anon):
--      • a code that doesn't exist, is inactive, or belongs to another
--        show/event now gets ONE generic "isn't valid for this show" message —
--        a guess can't tell "no such code" from "real code, wrong show";
--      • each such failure counts against the caller's IP; at 25 failures in
--        15 minutes the IP is locked out of promo checks until the window ends.
--        Codes are 50 random bits, so this is defence in depth, but it makes
--        guessing cost a real amount of time per IP;
--      • create_pending_booking applies the same lockout and counts its own
--        failures. A RAISE would roll back the counter, so an invalid code now
--        RETURNS {"error": …} without holding anything (the client shows it;
--        older clients already treated a missing booking_id as a failure).
--      Expired / used-up / over-limit codes keep their specific messages
--      (they only reach someone holding a real code) and are not counted.
--   3. Seat-hold abuse (create_pending_booking is anon): without a promo
--      code, one caller (IP, or user id when signed in) may hold at most
--      20 seats AT ONCE and start at most 12 holds per 15 minutes. Cancelling
--      or paying frees the room immediately, so a real buyer who changes seats
--      never notices; a bot can no longer pin the house. Promo-code orders
--      are exempt — each code already caps its own tickets, and a class of
--      graduates sharing one campus IP must not lock each other out.
--   4. Input caps: guest name ≤ 120 chars without control characters, guest
--      email ≤ 254 chars and email-shaped, ≤ 50 seats per order.
--
-- If the IP can't be determined (no request headers — e.g. a service-role or
-- SQL-editor call) the IP-based limits are skipped rather than lumping every
-- such caller into one shared bucket.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Counters ───────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.rate_limits (
  bucket       text        NOT NULL,
  subject      text        NOT NULL,   -- private.subject_hash(…), never a raw IP
  window_start timestamptz NOT NULL,
  hits         int         NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, subject, window_start)
);
ALTER TABLE private.rate_limits ENABLE ROW LEVEL SECURITY;  -- no policies: definer-only
REVOKE ALL ON private.rate_limits FROM PUBLIC, anon, authenticated;

-- One random salt per project, generated here, so stored hashes can't be
-- reversed by hashing the (small) IPv4 space.
CREATE TABLE IF NOT EXISTS private.settings (key text PRIMARY KEY, value text NOT NULL);
ALTER TABLE private.settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.settings FROM PUBLIC, anon, authenticated;
INSERT INTO private.settings (key, value)
VALUES ('rate_limit_salt', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (key) DO NOTHING;

-- The caller's IP from the PostgREST request headers: Cloudflare's
-- cf-connecting-ip (set by the edge, not the client), else the first
-- X-Forwarded-For hop, else X-Real-IP. NULL when there are no headers.
CREATE OR REPLACE FUNCTION private.client_ip()
RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  v_headers json;
  v_ip text;
BEGIN
  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;
  v_ip := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    nullif(btrim(v_headers ->> 'x-real-ip'), '')
  );
  -- Only something IP-shaped becomes a key (IPv4 / IPv6 characters, ≤ 45).
  IF v_ip IS NULL OR length(v_ip) > 45 OR v_ip !~ '^[0-9A-Fa-f:.]+$' THEN
    RETURN NULL;
  END IF;
  RETURN lower(v_ip);
END;
$$;

CREATE OR REPLACE FUNCTION private.subject_hash(p_key text)
RETURNS text
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(
    (SELECT value FROM private.settings WHERE key = 'rate_limit_salt') || '|' || p_key, 'UTF8')), 'hex');
$$;

-- Record p_cost hits for (bucket, subject) in the current window IF that keeps
-- the window at or under p_limit. Returns whether it was allowed; a refused
-- call records nothing. Atomic under concurrency (single upsert).
CREATE OR REPLACE FUNCTION private.rate_limit_take(
  p_bucket text, p_subject text, p_window_seconds int, p_limit int, p_cost int DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  v_window timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
BEGIN
  IF p_cost > p_limit THEN
    RETURN false;
  END IF;
  INSERT INTO private.rate_limits AS r (bucket, subject, window_start, hits)
  VALUES (p_bucket, p_subject, v_window, p_cost)
  ON CONFLICT (bucket, subject, window_start)
    DO UPDATE SET hits = r.hits + excluded.hits
    WHERE r.hits + excluded.hits <= p_limit
  RETURNING hits INTO v_hits;
  -- Opportunistic cleanup (~1% of calls) instead of another cron job.
  IF random() < 0.01 THEN
    DELETE FROM private.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;
  RETURN v_hits IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.rate_limit_count(p_bucket text, p_subject text, p_window_seconds int)
RETURNS int
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT coalesce((
    SELECT hits FROM private.rate_limits
     WHERE bucket = p_bucket AND subject = p_subject
       AND window_start = to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds)
  ), 0);
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- For the Edge Functions (service role): take one hit for p_key (an IP the
-- function read from its own request headers). Never callable by clients.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_bucket text, p_key text, p_window_seconds int, p_limit int)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN
    RETURN true;  -- unknown caller: don't lump everyone into one bucket
  END IF;
  RETURN private.rate_limit_take(p_bucket, private.subject_hash(lower(btrim(p_key))), p_window_seconds, p_limit, 1);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.consume_rate_limit(text, text, int, int) TO service_role;

-- 2. Promo codes: one generic message for "no such code / not usable here" ──
CREATE OR REPLACE FUNCTION public.promo_invalid_message()
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT 'That promo code isn''t valid for this show. Check it and try again.'::text; $$;

CREATE OR REPLACE FUNCTION public.promo_lockout_message()
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT 'Too many promo code attempts from your connection. Please wait 15 minutes and try again.'::text; $$;

CREATE OR REPLACE FUNCTION public.promo_code_problem(
  p_code public.promo_codes, p_showtime_id uuid, p_production_id uuid, p_tickets int
)
RETURNS text
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT p_code.active
      OR (p_code.showtime_id IS NOT NULL AND p_code.showtime_id <> p_showtime_id)
      OR (p_code.production_id IS NOT NULL AND p_code.production_id IS DISTINCT FROM p_production_id)
      THEN public.promo_invalid_message()
    WHEN p_code.expires_at IS NOT NULL AND p_code.expires_at <= now() THEN 'This promo code has expired.'
    WHEN p_code.used_tickets >= p_code.max_tickets THEN 'This promo code has already been used.'
    WHEN p_code.used_tickets + p_tickets > p_code.max_tickets THEN
      format('This promo code covers %s more ticket%s — please select no more than that.',
             p_code.max_tickets - p_code.used_tickets,
             CASE WHEN p_code.max_tickets - p_code.used_tickets = 1 THEN '' ELSE 's' END)
    ELSE NULL
  END;
$$;

-- Lockout policy, in one place: 25 invalid codes per IP per 15 minutes.
CREATE OR REPLACE FUNCTION private.promo_locked_out(p_subject text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT p_subject IS NOT NULL AND private.rate_limit_count('promo_fail', p_subject, 900) >= 25; $$;

CREATE OR REPLACE FUNCTION private.promo_record_failure(p_subject text)
RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
BEGIN
  IF p_subject IS NOT NULL THEN
    -- A refused take just means the window is already full (locked out).
    PERFORM private.rate_limit_take('promo_fail', p_subject, 900, 1000000, 1);
  END IF;
END;
$$;

-- The subject promo failures count against: the IP, else (signed in, but no
-- IP header) the user id, else NULL = not limited.
CREATE OR REPLACE FUNCTION private.promo_subject()
RETURNS text
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT CASE
    WHEN private.client_ip() IS NOT NULL THEN private.subject_hash('ip:' || private.client_ip())
    WHEN auth.uid() IS NOT NULL THEN private.subject_hash('user:' || auth.uid()::text)
  END;
$$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- VOLATILE now (it records failures). supabase-js rpc() uses POST, so this is
-- transparent to the client.
CREATE OR REPLACE FUNCTION public.preview_promo_code(p_code text, p_showtime_id uuid, p_tickets int DEFAULT 1)
RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code public.promo_codes%ROWTYPE;
  v_production_id uuid;
  v_problem text;
  v_subject text := private.promo_subject();
BEGIN
  IF private.promo_locked_out(v_subject) THEN
    RETURN json_build_object('ok', false, 'message', public.promo_lockout_message());
  END IF;

  SELECT * INTO v_code FROM public.promo_codes WHERE code = public.normalize_promo_code(p_code);
  IF NOT FOUND THEN
    PERFORM private.promo_record_failure(v_subject);
    RETURN json_build_object('ok', false, 'message', public.promo_invalid_message());
  END IF;
  SELECT s.production_id INTO v_production_id FROM public.showtimes s WHERE s.id = p_showtime_id;
  v_problem := public.promo_code_problem(v_code, p_showtime_id, v_production_id, greatest(coalesce(p_tickets, 1), 1));
  IF v_problem IS NOT NULL THEN
    IF v_problem = public.promo_invalid_message() THEN
      PERFORM private.promo_record_failure(v_subject);
    END IF;
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

-- 3. Hold tracking ──────────────────────────────────────────────────────────
-- Which caller (salted hash of 'ip:…' / 'user:…') started a hold, so their
-- seats currently on hold can be counted. Only set on online holds.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_key text;
CREATE INDEX IF NOT EXISTS bookings_active_hold_key_idx
  ON public.bookings (hold_key)
  WHERE hold_key IS NOT NULL AND status = 'reserved' AND payment_status = 'pending';

-- 4. create_pending_booking ─────────────────────────────────────────────────
-- Body identical to 20261004190000 (promo codes, fee lines, production cap,
-- per-order cap) plus: input caps, the promo lockout / non-raising invalid
-- path, and the seat-hold limits. Same signature and default, so CREATE OR
-- REPLACE keeps the grants and the single PostgREST overload.
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
  v_ip text := private.client_ip();
  v_hold_key text;
  v_promo_subject text;
  v_on_hold int;
BEGIN
  -- Guest checkout: no account, so name + email are required to hold the seats.
  IF v_user_id IS NULL THEN
    IF p_guest_name IS NULL OR btrim(p_guest_name) = ''
       OR p_guest_email IS NULL OR btrim(p_guest_email) = '' THEN
      RAISE EXCEPTION 'Guest name and email are required';
    END IF;
    IF length(btrim(p_guest_name)) > 120 OR p_guest_name ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'Please enter a shorter name (120 characters at most).';
    END IF;
    IF length(btrim(p_guest_email)) > 254 OR btrim(p_guest_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RAISE EXCEPTION 'Please enter a valid email address.';
    END IF;
  END IF;

  v_num := coalesce(array_length(p_seats, 1), 0);
  IF v_num = 0 THEN
    RAISE EXCEPTION 'Select at least one seat';
  END IF;
  IF v_num > 50 THEN
    RAISE EXCEPTION 'Too many seats in one order (50 at most).';
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

  -- Production ticket cap (same rule as create_box_office_booking): every
  -- booked seat for this showtime counts — paid, walk-up, or a pending online
  -- hold — so concurrent checkouts can't jointly oversell. The showtime row
  -- lock above serializes the count.
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
    v_promo_subject := private.promo_subject();
    IF private.promo_locked_out(v_promo_subject) THEN
      RAISE EXCEPTION '%', public.promo_lockout_message();
    END IF;
    SELECT * INTO v_code FROM public.promo_codes WHERE code = v_code_text FOR UPDATE;
    IF NOT FOUND THEN
      v_problem := public.promo_invalid_message();
    ELSE
      v_problem := public.promo_code_problem(v_code, p_showtime_id, v_production_id, v_num);
    END IF;
    IF v_problem = public.promo_invalid_message() THEN
      -- RETURN, not RAISE: a raise would roll back the failure we just
      -- counted. Nothing has been written yet, so nothing is held.
      PERFORM private.promo_record_failure(v_promo_subject);
      RETURN json_build_object('error', v_problem, 'error_code', 'promo_invalid');
    ELSIF v_problem IS NOT NULL THEN
      RAISE EXCEPTION '%', v_problem;
    END IF;
    UPDATE public.promo_codes SET used_tickets = used_tickets + v_num WHERE id = v_code.id;
  ELSIF v_code_required THEN
    RAISE EXCEPTION 'A promo code is required for this show.';
  END IF;

  -- Seat-hold limits (no promo code): ≤ 20 seats on hold at once and ≤ 12
  -- holds started per 15 minutes, per signed-in user, else per IP.
  IF v_code.id IS NULL THEN
    v_hold_key := CASE
      WHEN v_user_id IS NOT NULL THEN private.subject_hash('user:' || v_user_id::text)
      WHEN v_ip IS NOT NULL THEN private.subject_hash('ip:' || v_ip)
    END;
    IF v_hold_key IS NOT NULL THEN
      -- Serialize one caller's concurrent requests so they can't jointly pass.
      PERFORM pg_advisory_xact_lock(hashtextextended(v_hold_key, 0));
      SELECT coalesce(sum(b.num_tickets), 0) INTO v_on_hold
        FROM public.bookings b
       WHERE b.hold_key = v_hold_key
         AND b.status = 'reserved' AND b.payment_status = 'pending'
         AND b.created_at > now() - interval '1 hour';
      IF v_on_hold + v_num > 20 THEN
        RAISE EXCEPTION 'Too many seats are on hold from your connection right now. Finish or cancel the checkout you already have open, or try again in a few minutes.';
      END IF;
      IF NOT private.rate_limit_take('hold_start', v_hold_key, 900, 12, 1) THEN
        RAISE EXCEPTION 'Too many reservations were started from your connection. Please wait a few minutes and try again.';
      END IF;
    END IF;
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
    promo_code_id, promo_tickets, discount_total,
    hold_key
  ) VALUES (
    v_user_id, p_showtime_id, v_title, v_start_time,
    v_num, v_total, 'reserved', 'pending', 'online',
    CASE WHEN v_user_id IS NULL THEN btrim(p_guest_name)  ELSE NULL END,
    CASE WHEN v_user_id IS NULL THEN btrim(p_guest_email) ELSE NULL END,
    v_fees, v_fees_total,
    v_code.id, CASE WHEN v_code.id IS NULL THEN 0 ELSE v_num END, v_list_face - v_face,
    v_hold_key
  )
  RETURNING id INTO v_booking_id;

  -- Reserve the seats. The UNIQUE (showtime_id, seat_number) guarantees no two
  -- reservations (or a reservation + a sale) can grab the same seat. A failure
  -- here aborts the whole call, including the promo-code increment and the
  -- hold-limit hit.
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

-- Helpers the RPCs above call internally; nobody calls them directly.
REVOKE EXECUTE ON FUNCTION public.promo_invalid_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promo_lockout_message() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
