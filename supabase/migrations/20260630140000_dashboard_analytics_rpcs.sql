-- ─────────────────────────────────────────────────────────────────────────
-- ANALYTICAL DASHBOARD — SERVER-SIDE AGGREGATION RPCS
--
-- Three admin-only functions that aggregate booking data in Postgres so the
-- React Native Web dashboard never has to pull raw booking rows and total them
-- on the client. All three accept an inclusive [start_date, end_date] window.
--
-- IMPORTANT — which bookings count as a sale:
--   Online sales (create_booking)        → status = 'confirmed'
--   Box office walk-ups (create_box_...) → status = 'paid'
-- Revenue therefore sums over BOTH statuses; counting only 'paid' would drop
-- every online sale. This mirrors REVENUE_STATUSES in the dashboard client.
--
-- IMPORTANT — sales channel:
--   bookings.channel is the authoritative flag: 'online' vs 'box_office'.
--   (Box office rows also have user_id IS NULL, but channel is explicit.)
--
-- SECURITY: these expose every customer's revenue, so each is SECURITY DEFINER
-- gated on the CALLER being an admin — without that gate, plain RLS would only
-- let a caller aggregate their own bookings.
-- ─────────────────────────────────────────────────────────────────────────

-- Small helper: raise unless the current user is an admin. -------------------
CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ── PART 1 — KPI cards ─────────────────────────────────────────────────────
-- Single-row summary for the headline metrics.
--   total_revenue     : Σ total_price of paid/confirmed bookings in range
--   tickets_sold      : Σ num_tickets of those same bookings
--   projected_revenue : forward-looking estimate = Σ (unsold seats × price)
--                       over every UPCOMING showtime. This is intentionally
--                       independent of the date filter (it describes the
--                       future, not the selected historical window). Swap
--                       available_seats → 100 if you want gross potential
--                       at full house instead of remaining inventory.
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
  start_date date,
  end_date   date
)
RETURNS TABLE (
  total_revenue     numeric,
  tickets_sold      bigint,
  projected_revenue numeric
) AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    coalesce((
      SELECT sum(b.total_price)
      FROM public.bookings b
      WHERE b.status IN ('paid', 'confirmed')
        AND b.created_at::date BETWEEN start_date AND end_date
    ), 0)::numeric AS total_revenue,
    coalesce((
      SELECT sum(b.num_tickets)
      FROM public.bookings b
      WHERE b.status IN ('paid', 'confirmed')
        AND b.created_at::date BETWEEN start_date AND end_date
    ), 0)::bigint AS tickets_sold,
    coalesce((
      SELECT sum(coalesce(s.available_seats, 0) * s.price)
      FROM public.showtimes s
      WHERE s.start_time >= now()
    ), 0)::numeric AS projected_revenue;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ── PART 2 — daily time series (for the bar chart) ─────────────────────────
-- One row PER DAY across the whole window, including days with no sales (those
-- return 0 instead of being skipped) — done by left-joining a generated date
-- spine against the per-day booking aggregate.
CREATE OR REPLACE FUNCTION public.get_sales_timeseries(
  start_date date,
  end_date   date
)
RETURNS TABLE (
  day          date,
  tickets_sold bigint,
  revenue      numeric
) AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    d::date AS day,
    coalesce(sum(b.num_tickets), 0)::bigint  AS tickets_sold,
    coalesce(sum(b.total_price), 0)::numeric AS revenue
  FROM generate_series(start_date, end_date, interval '1 day') AS d
  LEFT JOIN public.bookings b
    ON b.created_at::date = d::date
   AND b.status IN ('paid', 'confirmed')
  GROUP BY d
  ORDER BY d;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ── PART 3 — Online vs Walk-in split ───────────────────────────────────────
-- Always returns exactly two rows ('Online', 'Walk-in') so the UI can render a
-- stable split even when one channel had zero sales in the window.
CREATE OR REPLACE FUNCTION public.get_sales_channels(
  start_date date,
  end_date   date
)
RETURNS TABLE (
  channel      text,
  tickets_sold bigint,
  revenue      numeric
) AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    c.label AS channel,
    coalesce(sum(b.num_tickets), 0)::bigint  AS tickets_sold,
    coalesce(sum(b.total_price), 0)::numeric AS revenue
  FROM (VALUES ('Online'), ('Walk-in')) AS c(label)
  LEFT JOIN public.bookings b
    ON (CASE WHEN b.channel = 'box_office' THEN 'Walk-in' ELSE 'Online' END) = c.label
   AND b.status IN ('paid', 'confirmed')
   AND b.created_at::date BETWEEN start_date AND end_date
  GROUP BY c.label
  ORDER BY c.label;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Grants: callable by any authenticated user; each function self-gates on admin.
GRANT EXECUTE ON FUNCTION public.assert_admin()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(date, date)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_timeseries(date, date)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_channels(date, date)          TO authenticated;

-- Refresh PostgREST so the new RPCs are exposed immediately.
NOTIFY pgrst, 'reload schema';
