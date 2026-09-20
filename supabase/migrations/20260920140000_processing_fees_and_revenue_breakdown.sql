-- ─────────────────────────────────────────────────────────────────────────
-- PROCESSING FEES + REVENUE BREAKDOWN (theater net)
--
-- 1. payments.processing_fee / payments.net — what the payment processor
--    actually kept (USD) and what settled to us, per succeeded payment.
--      • Stripe: written by stripe-webhook / stripe-verify-checkout from the
--        PaymentIntent → latest_charge → balance_transaction (fee, net; cents
--        → dollars). Non-fatal: a fee-fetch failure never blocks finalization,
--        the columns just stay NULL until a later backfill.
--      • PayPal: from the capture's seller_receivable_breakdown
--        (paypal_fee / net_amount) in paypal-capture-order and paypal-webhook.
--
-- 2. get_revenue_breakdown(start_date, end_date) — admin-only (assert_admin)
--    aggregate over bookings CREATED in the inclusive window, counting the same
--    rows as get_dashboard_kpis (status IN ('paid','confirmed') — online sales
--    are 'confirmed', box-office walk-ups are 'paid'), so "gross collected"
--    here equals the Total Sales KPI. Returns every bucket separately plus the
--    THEATER NET, whose formula is deliberately a single expression below:
--
--      theater_net = face_revenue − ticketing_fee_total − processing_fees
--
--    Beautification and school fees are pass-throughs to their funds: shown
--    separately, NOT part of theater net. ⚠ CONFIRM WITH THE STAKEHOLDER — if
--    the ticketing fee is instead collected on top of face and kept by the
--    platform, the theater's take is face_revenue − processing_fees; change the
--    one line marked "NET FORMULA" and redeploy this migration.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Processor fee capture ──────────────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS processing_fee numeric,   -- USD the processor kept (Stripe fee / PayPal fee)
  ADD COLUMN IF NOT EXISTS net            numeric,   -- USD settled to us (amount − processing_fee)
  ADD COLUMN IF NOT EXISTS fee_recorded_at timestamptz;

-- 2. Revenue breakdown ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_breakdown(
  start_date date,
  end_date   date
)
RETURNS TABLE (
  orders               bigint,   -- counted bookings
  tickets_sold         bigint,
  gross_collected      numeric,  -- Σ total_price (= Total Sales KPI)
  face_revenue         numeric,  -- Σ (total_price − the three fee buckets): ticket face value
  beautification_total numeric,  -- pass-through
  school_total         numeric,  -- pass-through
  ticketing_fee_total  numeric,  -- platform / ticketing fee
  processing_fees      numeric,  -- Σ payments.processing_fee (succeeded, recorded)
  fees_unrecorded      bigint,   -- succeeded payments in range with NO fee captured yet
  theater_net          numeric   -- see NET FORMULA
) AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  WITH sales AS (
    SELECT b.id, b.num_tickets, b.total_price,
           b.beautification_total, b.school_total, b.ticketing_fee_total,
           (b.total_price - b.beautification_total - b.school_total - b.ticketing_fee_total) AS face
    FROM public.bookings b
    WHERE b.status IN ('paid', 'confirmed')
      AND b.created_at::date BETWEEN start_date AND end_date
  ),
  proc AS (
    SELECT coalesce(sum(p.processing_fee), 0)::numeric                 AS fees,
           count(*) FILTER (WHERE p.processing_fee IS NULL)::bigint    AS unrecorded
    FROM public.payments p
    JOIN sales s ON s.id = p.booking_id
    WHERE p.status = 'succeeded'
  ),
  agg AS (
    -- Every reference is qualified: RETURNS TABLE column names are variables in
    -- PL/pgSQL, so a bare `beautification_total` here would be ambiguous.
    SELECT count(*)::bigint                                  AS orders,
           coalesce(sum(s.num_tickets), 0)::bigint           AS tickets_sold,
           coalesce(sum(s.total_price), 0)::numeric          AS gross_collected,
           coalesce(sum(s.face), 0)::numeric                 AS face_revenue,
           coalesce(sum(s.beautification_total), 0)::numeric AS beautification_total,
           coalesce(sum(s.school_total), 0)::numeric         AS school_total,
           coalesce(sum(s.ticketing_fee_total), 0)::numeric  AS ticketing_fee_total
    FROM sales s
  )
  SELECT
    agg.orders,
    agg.tickets_sold,
    agg.gross_collected,
    agg.face_revenue,
    agg.beautification_total,
    agg.school_total,
    agg.ticketing_fee_total,
    proc.fees            AS processing_fees,
    proc.unrecorded      AS fees_unrecorded,
    -- NET FORMULA (one line; keep in step with the dashboard card's caption):
    (agg.face_revenue - agg.ticketing_fee_total - proc.fees)::numeric AS theater_net
  FROM agg, proc;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) TO authenticated;

-- Refresh PostgREST so the new columns/RPC are exposed immediately.
NOTIFY pgrst, 'reload schema';
