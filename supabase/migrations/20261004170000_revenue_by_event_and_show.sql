-- ─────────────────────────────────────────────────────────────────────────
-- EARNINGS BY EVENT / SHOW — admin dashboard grouping.
--
--   1. get_revenue_breakdown(start, end, p_production_id?, p_showtime_id?) —
--      the 20261004120000 breakdown, optionally narrowed to one EVENT
--      (production) and/or one SHOW (showtime). With both NULL it is exactly
--      the overall breakdown (the existing Payouts cards). The 2-arg overload is
--      dropped; the new args default to NULL so 2-arg named calls still resolve.
--   2. get_revenue_by_show(start, end, p_production_id?) — one row per showtime:
--      tickets sold, gross, fees (platform + pass-through), processing fees and
--      theatre take-home, using the SAME NET FORMULA line as (1).
--
-- Both read paid rows only (status IN ('paid','confirmed')) and the per-booking
-- fee snapshot (fee_breakdown / fees_total), and both are assert_admin — staff
-- never see earnings.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push`, with the frontend deploy.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Breakdown, optionally per event / show ────────────────────────────────
DROP FUNCTION IF EXISTS public.get_revenue_breakdown(date, date);
CREATE OR REPLACE FUNCTION public.get_revenue_breakdown(
  start_date      date,
  end_date        date,
  p_production_id uuid DEFAULT NULL,
  p_showtime_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  orders             bigint,
  tickets_sold       bigint,
  gross_collected    numeric,
  face_revenue       numeric,
  fees_total         numeric,
  platform_fee_total numeric,
  pass_through       jsonb,
  processing_fees    numeric,
  fees_unrecorded    bigint,
  theater_net        numeric
) AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  WITH sales AS (
    SELECT b.id, b.num_tickets, b.total_price, b.fees_total, b.fee_breakdown
    FROM public.bookings b
    LEFT JOIN public.showtimes s ON s.id = b.showtime_id
    WHERE b.status IN ('paid', 'confirmed')
      AND b.created_at::date BETWEEN start_date AND end_date
      AND (p_showtime_id   IS NULL OR b.showtime_id = p_showtime_id)
      AND (p_production_id IS NULL OR s.production_id = p_production_id)
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
    agg.orders, agg.tickets_sold, agg.gross_collected, agg.face_revenue, agg.fees_total,
    plat.total, pass.lines, proc.fees, proc.unrecorded,
    -- NET FORMULA (one line; keep in step with the dashboard card's caption).
    -- ⚠ CONFIRM WITH THE STAKEHOLDER (unchanged from 20260920140000).
    (agg.face_revenue - plat.total - proc.fees)::numeric AS theater_net
  FROM agg, plat, pass, proc;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date, uuid, uuid) TO authenticated;

-- 2. Per-show rows ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_by_show(
  start_date      date,
  end_date        date,
  p_production_id uuid DEFAULT NULL
)
RETURNS TABLE (
  showtime_id        uuid,
  production_id      uuid,
  production_title   text,
  show_start_time    timestamptz,
  orders             bigint,
  tickets_sold       bigint,
  gross_collected    numeric,
  face_revenue       numeric,
  fees_total         numeric,
  platform_fee_total numeric,
  processing_fees    numeric,
  theater_net        numeric
) AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  WITH sales AS (
    SELECT b.id, b.showtime_id, b.num_tickets, b.total_price, b.fees_total,
           coalesce((SELECT sum((l ->> 'total')::numeric)
                       FROM jsonb_array_elements(b.fee_breakdown) l
                      WHERE l ->> 'key' IN ('platform', 'ticketing')), 0) AS platform
    FROM public.bookings b
    LEFT JOIN public.showtimes s ON s.id = b.showtime_id
    WHERE b.status IN ('paid', 'confirmed')
      AND b.showtime_id IS NOT NULL
      AND b.created_at::date BETWEEN start_date AND end_date
      AND (p_production_id IS NULL OR s.production_id = p_production_id)
  ),
  proc AS (
    SELECT s.showtime_id, coalesce(sum(p.processing_fee), 0)::numeric AS fees
    FROM public.payments p
    JOIN sales s ON s.id = p.booking_id
    WHERE p.status = 'succeeded'
    GROUP BY s.showtime_id
  ),
  agg AS (
    SELECT s.showtime_id,
           count(*)::bigint                                 AS orders,
           sum(s.num_tickets)::bigint                       AS tickets_sold,
           sum(s.total_price)::numeric                      AS gross_collected,
           sum(s.total_price - s.fees_total)::numeric       AS face_revenue,
           sum(s.fees_total)::numeric                       AS fees_total,
           sum(s.platform)::numeric                         AS platform_fee_total
    FROM sales s GROUP BY s.showtime_id
  )
  SELECT a.showtime_id, st.production_id, p.title, st.start_time,
         a.orders, a.tickets_sold, a.gross_collected, a.face_revenue, a.fees_total,
         a.platform_fee_total, coalesce(pr.fees, 0),
         -- NET FORMULA — identical to get_revenue_breakdown.
         (a.face_revenue - a.platform_fee_total - coalesce(pr.fees, 0))::numeric
  FROM agg a
  JOIN public.showtimes st ON st.id = a.showtime_id
  LEFT JOIN public.productions p ON p.id = st.production_id
  LEFT JOIN proc pr ON pr.showtime_id = a.showtime_id
  ORDER BY st.start_time;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_revenue_by_show(date, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_revenue_by_show(date, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
