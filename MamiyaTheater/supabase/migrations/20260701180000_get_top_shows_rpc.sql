-- ─────────────────────────────────────────────────────────────────────────
-- TOP PERFORMING SHOWS — SERVER-SIDE AGGREGATION RPC
--
-- The Overview dashboard's "Top Performing Shows" panel calls
--   supabase.rpc('get_top_shows', { start_date, end_date, p_limit: 5 })
-- but the function did not exist (only get_dashboard_kpis / get_sales_timeseries
-- / get_sales_channels shipped in 20260630140000), so every dashboard load hit
--   "Could not find the function public.get_top_shows(...) in the schema cache".
--
-- This adds it, matching the exact param names the client sends
-- (start_date, end_date, p_limit) and the security pattern of the other
-- analytics RPCs: SECURITY DEFINER, gated on assert_admin().
--
-- Ranking rule mirrors the rest of the dashboard (see 20260630140000):
--   * a sale is a booking with status IN ('paid','confirmed')
--     — 'confirmed' = online (create_booking), 'paid' = box office.
--   * the window filters on b.created_at::date BETWEEN start_date AND end_date,
--     identical to get_dashboard_kpis / get_sales_channels.
--
-- Returned columns match the client TopShow shape so the existing
-- TopShowsPanel renders with no frontend change:
--   production_id, title, tickets_sold, capacity, revenue.
-- capacity is the total house across the DISTINCT performances that sold in the
-- window (fixed 100-seat auditorium × distinct showtimes), giving the panel a
-- real sold/house occupancy denominator. Productions with no sales in the window
-- simply do not appear — the panel shows its own empty state for zero rows.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_top_shows(
  start_date date,
  end_date   date,
  p_limit    integer
)
RETURNS TABLE (
  production_id uuid,
  title         text,
  tickets_sold  bigint,
  capacity      bigint,
  revenue       numeric
) AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    p.id                                       AS production_id,
    p.title                                    AS title,
    coalesce(sum(b.num_tickets), 0)::bigint    AS tickets_sold,
    (count(DISTINCT b.showtime_id) * 100)::bigint AS capacity,
    coalesce(sum(b.total_price), 0)::numeric   AS revenue
  FROM public.bookings b
  JOIN public.showtimes s   ON s.id = b.showtime_id
  JOIN public.productions p ON p.id = s.production_id
  WHERE b.status IN ('paid', 'confirmed')
    AND b.created_at::date BETWEEN start_date AND end_date
  GROUP BY p.id, p.title
  ORDER BY tickets_sold DESC, revenue DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Callable by any authenticated user; self-gates on admin like the others.
GRANT EXECUTE ON FUNCTION public.get_top_shows(date, date, integer) TO authenticated;

-- (get_sales_timeseries / get_sales_channels grants already shipped in
--  20260630140000; no missing grants to backfill here.)

-- Refresh PostgREST so the new function is exposed immediately and the
-- "schema cache" error clears without a manual restart.
NOTIFY pgrst, 'reload schema';
