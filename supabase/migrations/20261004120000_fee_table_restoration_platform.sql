-- ─────────────────────────────────────────────────────────────────────────
-- FEE TABLE v2 — restoration + beautification + platform, typed rates,
-- generic per-booking fee snapshot.
--
-- Stakeholder (2026-10): the beautification fee REPLACES the old school fee and
-- the old theatre/ticketing fee; a new restoration fee is $2.75 per ticket; the
-- CALLED platform fee still exists. Rate card after this migration:
--
--   restoration     flat_per_ticket  2.75   confirmed
--   beautification  flat_per_ticket  0.00   ⚠ CONFIRM amount AND type (flat or %)
--   platform        flat_per_ticket  0.75   ⚠ CONFIRM amount (old ticketing rate kept)
--
-- ⚠ CONFIRM BLOCK — each answer is a one-line UPDATE here PLUS the FEES entry in
--   both venue.ts mirrors (src/config/venue.ts, supabase/functions/_shared/venue.ts):
--     update public.ticket_fees set fee_type = 'percent', amount = 5    where key = 'beautification';
--     update public.ticket_fees set amount = 1.00                       where key = 'platform';
--
--   1. public.ticket_fees gains fee_type ('flat_per_ticket' | 'percent') and
--      `usd` becomes `amount` (dollars for flat, percent for percent). The old
--      school / ticketing rows stay as INACTIVE history (labels for old orders).
--   2. bookings.fee_breakdown (jsonb) + bookings.fees_total — the resolved fee
--      lines SNAPSHOTTED at reservation time: [{key,label,type,rate,tickets,total}].
--      Historical rows are backfilled from the three legacy bucket columns,
--      which are now frozen (no longer written). Face revenue of ANY booking is
--      total_price − fees_total.
--   3. seat_face_prices() — every selected seat's effective face price (zone
--      override or the flat showtime price) as an array; sum_effective_seat_total
--      and count_priced_seats stay as thin wrappers for existing callers.
--   4. compute_ticket_fees(prices[]) — THE fee rule: only seats priced > $0
--      carry fees; flat = amount per priced seat; percent = round(price × % / 100,
--      2) per priced seat. Mirrored by feeTotals() in both venue.ts files.
--   5. create_pending_booking — prices fees via compute_ticket_fees and writes
--      the snapshot. Same signature / JSON keys (+ fee_breakdown).
--   6. get_booking_confirmation — returns the snapshot.
--   7. get_revenue_breakdown — reads the snapshot: platform fee = the 'platform'
--      line (+ legacy 'ticketing'); every other fee is a pass-through fund.
--   8. REVOKE create_booking from authenticated: a legacy RPC (unused by the
--      app) that wrote 'confirmed' bookings with no payment, no fees and no hold
--      expiry — it bypassed every rule above.
--
-- Charged total = stored total_price = Stripe/PayPal verify guard, to the cent:
-- stripe-create-checkout itemizes from fee_breakdown, the guards compare against
-- total_price.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor), together
--     with the frontend + functions deploy (stripe-create-checkout reads
--     fee_breakdown; the checkout summary reads ticket_fees.fee_type/amount).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Typed rate card ────────────────────────────────────────────────────────
ALTER TABLE public.ticket_fees DROP CONSTRAINT IF EXISTS ticket_fees_key_check;
ALTER TABLE public.ticket_fees
  ADD COLUMN IF NOT EXISTS fee_type text NOT NULL DEFAULT 'flat_per_ticket';

-- First run only (the `usd` column still exists): rename it, retire the old
-- school / ticketing rows, and reset beautification to the ⚠ CONFIRM placeholder.
-- A re-run skips this, so it never reverts a rate the stakeholder has since set.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'ticket_fees' AND column_name = 'usd') THEN
    ALTER TABLE public.ticket_fees RENAME COLUMN usd TO amount;
    UPDATE public.ticket_fees SET active = false, sort_order = 10 + sort_order, updated_at = now()
     WHERE key IN ('school', 'ticketing');
    UPDATE public.ticket_fees SET fee_type = 'flat_per_ticket', amount = 0.00, sort_order = 2, updated_at = now()
     WHERE key = 'beautification';  -- ⚠ CONFIRM
  END IF;
END $$;

ALTER TABLE public.ticket_fees DROP CONSTRAINT IF EXISTS ticket_fees_fee_type_check;
ALTER TABLE public.ticket_fees ADD CONSTRAINT ticket_fees_fee_type_check
  CHECK (fee_type IN ('flat_per_ticket', 'percent'));
-- Flat fees are whole cents; percentages have at most 2 decimals (e.g. 2.5%) and
-- stay ≤ 100 — so the client's integer-cent mirror can reproduce every result.
ALTER TABLE public.ticket_fees DROP CONSTRAINT IF EXISTS ticket_fees_amount_check;
ALTER TABLE public.ticket_fees ADD CONSTRAINT ticket_fees_amount_check
  CHECK (amount >= 0 AND amount = round(amount, 2) AND (fee_type <> 'percent' OR amount <= 100));

INSERT INTO public.ticket_fees (key, label, fee_type, amount, sort_order, active) VALUES
  ('restoration',    'Restoration fee',    'flat_per_ticket', 2.75, 1, true),
  ('beautification', 'Beautification fee', 'flat_per_ticket', 0.00, 2, true),  -- ⚠ CONFIRM
  ('platform',       'Platform fee',       'flat_per_ticket', 0.75, 3, true)   -- ⚠ CONFIRM
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS public.ticket_fee_usd(text);

-- 2. Generic fee snapshot on the booking ────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS fee_breakdown jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fees_total    numeric NOT NULL DEFAULT 0;

-- Backfill every pre-v2 row from the legacy buckets (idempotent: only rows that
-- have no snapshot yet). Their rates aren't known per row, so `rate` is null.
UPDATE public.bookings b
   SET fees_total    = b.beautification_total + b.school_total + b.ticketing_fee_total,
       fee_breakdown = (
         SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'key', l.key, 'label', l.label, 'type', 'flat_per_ticket',
                  'rate', NULL, 'tickets', NULL, 'total', l.total) ORDER BY l.ord), '[]'::jsonb)
           FROM (VALUES (1, 'beautification', 'Beautification fee', b.beautification_total),
                        (2, 'school',         'School fee',         b.school_total),
                        (3, 'ticketing',      'Ticketing fee',      b.ticketing_fee_total)) AS l(ord, key, label, total)
          WHERE l.total > 0)
 WHERE b.fee_breakdown = '[]'::jsonb
   AND (b.beautification_total + b.school_total + b.ticketing_fee_total) > 0;

COMMENT ON COLUMN public.bookings.beautification_total IS 'LEGACY (pre-2026-10 fee model); frozen — read fee_breakdown / fees_total.';
COMMENT ON COLUMN public.bookings.school_total         IS 'LEGACY (pre-2026-10 fee model); frozen — read fee_breakdown / fees_total.';
COMMENT ON COLUMN public.bookings.ticketing_fee_total  IS 'LEGACY (pre-2026-10 fee model); frozen — read fee_breakdown / fees_total.';

-- 3. Per-seat face prices ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seat_face_prices(
  p_showtime_id uuid,
  p_seats       text[],
  p_flat_price  numeric
)
RETURNS numeric[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(array_agg(COALESCE(ssp.price, p_flat_price) ORDER BY vs.seat_identifier), ARRAY[]::numeric[])
  FROM public.venue_seats vs
  LEFT JOIN public.showtime_seat_prices ssp
    ON ssp.showtime_id = p_showtime_id
   AND ssp.zone = vs.zone
  WHERE vs.seat_identifier = ANY(p_seats);
$$;
REVOKE EXECUTE ON FUNCTION public.seat_face_prices(uuid, text[], numeric) FROM PUBLIC, anon, authenticated;

-- 4. THE fee rule ───────────────────────────────────────────────────────────
-- One line per ACTIVE fee (sort_order), including $0 lines (e.g. a placeholder
-- rate) so the snapshot records which rates were in force. Only prices > 0
-- count: a $0 seat carries no fee of any kind, an all-$0 order stays $0.
CREATE OR REPLACE FUNCTION public.compute_ticket_fees(p_prices numeric[])
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'key', f.key, 'label', f.label, 'type', f.fee_type, 'rate', f.amount,
           'tickets', c.n, 'total', c.total) ORDER BY f.sort_order, f.key), '[]'::jsonb)
  FROM public.ticket_fees f
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n,
           coalesce(sum(CASE WHEN f.fee_type = 'percent'
                             THEN round(p.price * f.amount / 100, 2)
                             ELSE f.amount END), 0)::numeric AS total
    FROM unnest(p_prices) AS p(price)
    WHERE p.price > 0
  ) c
  WHERE f.active;
$$;
REVOKE EXECUTE ON FUNCTION public.compute_ticket_fees(numeric[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fee_breakdown_total(p_breakdown jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT coalesce(sum((l ->> 'total')::numeric), 0) FROM jsonb_array_elements(p_breakdown) l;
$$;

-- Existing helpers now delegate to seat_face_prices (one pricing rule).
CREATE OR REPLACE FUNCTION public.sum_effective_seat_total(
  p_showtime_id uuid, p_seats text[], p_flat_price numeric
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(sum(p), 0) FROM unnest(public.seat_face_prices(p_showtime_id, p_seats, p_flat_price)) p;
$$;

CREATE OR REPLACE FUNCTION public.count_priced_seats(
  p_showtime_id uuid, p_seats text[], p_flat_price numeric
)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int FROM unnest(public.seat_face_prices(p_showtime_id, p_seats, p_flat_price)) p WHERE p > 0;
$$;

-- 5. create_pending_booking — fee snapshot v2 ───────────────────────────────
--    Body identical to 20260925130000 §2 except the fee block + INSERT columns.
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
  v_prices numeric[];
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

  -- Each seat's FACE price (zone override, else the flat showtime price) — never
  -- from the client — then the fee lines over those prices (priced seats only).
  v_prices     := public.seat_face_prices(p_showtime_id, p_seats, v_price);
  v_face       := coalesce((SELECT sum(x) FROM unnest(v_prices) x), 0);
  v_fees       := public.compute_ticket_fees(v_prices);
  v_fees_total := public.fee_breakdown_total(v_fees);
  v_total      := v_face + v_fees_total;

  INSERT INTO public.bookings (
    user_id, showtime_id, movie_title, show_start_time,
    num_tickets, total_price, status, payment_status, channel,
    guest_name, guest_email,
    fee_breakdown, fees_total
  ) VALUES (
    v_user_id, p_showtime_id, v_title, v_start_time,
    v_num, v_total, 'reserved', 'pending', 'online',
    CASE WHEN v_user_id IS NULL THEN p_guest_name  ELSE NULL END,
    CASE WHEN v_user_id IS NULL THEN p_guest_email ELSE NULL END,
    v_fees, v_fees_total
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
    'booking_id',    v_booking_id,
    'amount',        v_total,
    'face_total',    v_face,
    'fees_total',    v_fees_total,
    'fee_breakdown', v_fees
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_pending_booking(uuid, text[], text, text) TO anon, authenticated;

-- 6. get_booking_confirmation — the snapshot ─────────────────────────────────
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
    'fees_total',      b.fees_total,
    'fee_breakdown',   b.fee_breakdown
  )
  FROM public.bookings b
  WHERE b.id = p_booking_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_booking_confirmation(uuid) TO anon, authenticated;

-- 7. get_revenue_breakdown — from the snapshot ───────────────────────────────
--    Return shape changes, so DROP + CREATE. Still assert_admin (staff never
--    see earnings). Platform fee = the 'platform' line (+ legacy 'ticketing');
--    every other line is a pass-through fund, returned per key in `pass_through`
--    as [{key, label, total}] so a new fee needs no dashboard change.
DROP FUNCTION IF EXISTS public.get_revenue_breakdown(date, date);
CREATE FUNCTION public.get_revenue_breakdown(
  start_date date,
  end_date   date
)
RETURNS TABLE (
  orders             bigint,   -- counted bookings
  tickets_sold       bigint,
  gross_collected    numeric,  -- Σ total_price (= Total Sales KPI)
  face_revenue       numeric,  -- Σ (total_price − fees_total)
  fees_total         numeric,  -- every per-ticket fee
  platform_fee_total numeric,  -- CALLED platform fee (+ legacy ticketing fee)
  pass_through       jsonb,    -- [{key,label,total}] — restoration, beautification, legacy school…
  processing_fees    numeric,  -- Σ payments.processing_fee (succeeded, recorded)
  fees_unrecorded    bigint,   -- succeeded payments in range with NO fee captured yet
  theater_net        numeric   -- see NET FORMULA
) AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  WITH sales AS (
    SELECT b.id, b.num_tickets, b.total_price, b.fees_total, b.fee_breakdown
    FROM public.bookings b
    WHERE b.status IN ('paid', 'confirmed')
      AND b.created_at::date BETWEEN start_date AND end_date
  ),
  lines AS (
    SELECT l ->> 'key' AS key, l ->> 'label' AS label, (l ->> 'total')::numeric AS total
    FROM sales s, jsonb_array_elements(s.fee_breakdown) l
  ),
  per_key AS (
    SELECT ln.key, max(ln.label) AS label, sum(ln.total) AS total
    FROM lines ln GROUP BY ln.key
  ),
  proc AS (
    SELECT coalesce(sum(p.processing_fee), 0)::numeric                 AS fees,
           count(*) FILTER (WHERE p.processing_fee IS NULL)::bigint    AS unrecorded
    FROM public.payments p
    JOIN sales s ON s.id = p.booking_id
    WHERE p.status = 'succeeded'
  ),
  agg AS (
    SELECT count(*)::bigint                                          AS orders,
           coalesce(sum(s.num_tickets), 0)::bigint                   AS tickets_sold,
           coalesce(sum(s.total_price), 0)::numeric                  AS gross_collected,
           coalesce(sum(s.total_price - s.fees_total), 0)::numeric   AS face_revenue,
           coalesce(sum(s.fees_total), 0)::numeric                   AS fees_total
    FROM sales s
  ),
  plat AS (
    SELECT coalesce(sum(pk.total), 0)::numeric AS total
    FROM per_key pk WHERE pk.key IN ('platform', 'ticketing')
  ),
  pass AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'label', t.label, 'total', pk.total)
                              ORDER BY coalesce(t.sort_order, 99), pk.key), '[]'::jsonb) AS lines
    FROM per_key pk
    LEFT JOIN public.ticket_fees t ON t.key = pk.key
    WHERE pk.key NOT IN ('platform', 'ticketing')
  )
  SELECT
    agg.orders,
    agg.tickets_sold,
    agg.gross_collected,
    agg.face_revenue,
    agg.fees_total,
    plat.total            AS platform_fee_total,
    pass.lines            AS pass_through,
    proc.fees             AS processing_fees,
    proc.unrecorded       AS fees_unrecorded,
    -- NET FORMULA (one line; keep in step with the dashboard card's caption).
    -- ⚠ CONFIRM WITH THE STAKEHOLDER (unchanged from 20260920140000).
    (agg.face_revenue - plat.total - proc.fees)::numeric AS theater_net
  FROM agg, plat, pass, proc;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) TO authenticated;

-- 8. Close the unpaid-booking bypass ─────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_booking(uuid, text[]) FROM PUBLIC, anon, authenticated;

-- Refresh PostgREST so the new columns/RPC shapes are exposed immediately.
NOTIFY pgrst, 'reload schema';
