-- ─────────────────────────────────────────────────────────────────────────
-- PER-SHOW TICKET STATS — materialized production_stats table + trigger
--
-- A dedicated, always-current per-production tally so the dashboard can read
-- separated ticket counts with a single flat query — no client-side grouping,
-- no admin-gated view. One row per production; a trigger on `bookings` keeps
-- it in sync as sales are confirmed.
--
-- COUNT RULE (confirmed sales, matching the rest of the dashboard):
--   A ticket counts once its booking reaches status IN ('paid','confirmed')
--   ('confirmed' = online/create_booking + Stripe/PayPal finalize, 'paid' =
--   box office). We drive the trigger off the BOOKINGS status — NOT off
--   booking_seats — because booking_seats rows are inserted at RESERVE time
--   (create_pending_booking), before any payment; counting those would tally
--   unpaid holds and require undo logic when the 20-min cleanup sweep deletes
--   them. Keying on the bookings status transition instead means reservations
--   never inflate the count and refunds/cancellations self-correct.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Table ───────────────────────────────────────────────────────────────
--    movie_id is UNIQUE so there is exactly one tally row per production and
--    the trigger can upsert against it. FK → productions (the table 'movies'
--    was renamed to 'productions' in the theater pivot). CASCADE so removing a
--    production drops its stats row too.
CREATE TABLE IF NOT EXISTS public.production_stats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id     UUID NOT NULL UNIQUE REFERENCES public.productions(id) ON DELETE CASCADE,
  tickets_sold INTEGER NOT NULL DEFAULT 0,
  revenue      NUMERIC NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS — admins may READ; nobody writes directly ─────────────────────────
--    All mutation happens through the SECURITY DEFINER trigger below (which
--    bypasses RLS), so there are deliberately no INSERT/UPDATE/DELETE policies
--    for clients — the numbers can't be forged from the API.
ALTER TABLE public.production_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read production stats" ON public.production_stats;
CREATE POLICY "Admins can read production stats"
  ON public.production_stats FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. Trigger function — keep the tally in step with confirmed sales ─────────
--    Fires on the bookings row. Computes whether the booking counted as a sale
--    BEFORE and AFTER the change and applies the difference, so:
--      • reserve INSERT (status='reserved')      → no change
--      • box office INSERT (status='paid')        → + tickets/revenue
--      • webhook UPDATE reserved→confirmed        → + tickets/revenue
--      • refund/cancel UPDATE confirmed→refunded  → − tickets/revenue
--      • DELETE of a confirmed booking            → − tickets/revenue
--      • DELETE of an abandoned reservation       → no change
--    GREATEST(0, …) guards the counters against ever going negative.
CREATE OR REPLACE FUNCTION public.sync_production_stats()
RETURNS trigger AS $$
DECLARE
  v_prod_id       uuid;
  v_showtime_id   uuid;
  v_was_sold      boolean;
  v_is_sold       boolean;
  v_delta_tickets integer := 0;
  v_delta_revenue numeric := 0;
BEGIN
  v_showtime_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.showtime_id ELSE NEW.showtime_id END;

  SELECT s.production_id INTO v_prod_id
  FROM public.showtimes s
  WHERE s.id = v_showtime_id;

  IF v_prod_id IS NULL THEN
    RETURN NULL;                      -- unattributable; nothing to tally
  END IF;

  v_was_sold := (TG_OP <> 'INSERT') AND (OLD.status IN ('paid', 'confirmed'));
  v_is_sold  := (TG_OP <> 'DELETE') AND (NEW.status IN ('paid', 'confirmed'));

  IF v_was_sold THEN
    v_delta_tickets := v_delta_tickets - OLD.num_tickets;
    v_delta_revenue := v_delta_revenue - OLD.total_price;
  END IF;
  IF v_is_sold THEN
    v_delta_tickets := v_delta_tickets + NEW.num_tickets;
    v_delta_revenue := v_delta_revenue + NEW.total_price;
  END IF;

  IF v_delta_tickets = 0 AND v_delta_revenue = 0 THEN
    RETURN NULL;                      -- e.g. reserved→reserved edit: no sold-state change
  END IF;

  INSERT INTO public.production_stats (movie_id, tickets_sold, revenue)
  VALUES (v_prod_id, GREATEST(0, v_delta_tickets), GREATEST(0, v_delta_revenue))
  ON CONFLICT (movie_id) DO UPDATE
    SET tickets_sold = GREATEST(0, production_stats.tickets_sold + v_delta_tickets),
        revenue      = GREATEST(0, production_stats.revenue      + v_delta_revenue),
        updated_at   = now();

  RETURN NULL;                        -- AFTER trigger: return value ignored
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_bookings_sync_production_stats ON public.bookings;
CREATE TRIGGER trg_bookings_sync_production_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_production_stats();

-- 4. Backfill — seed a row for EVERY production (0 if it has no sales yet) and
--    total up existing paid/confirmed bookings. Idempotent: safe to re-run, it
--    overwrites each row with a freshly recomputed total.
INSERT INTO public.production_stats (movie_id, tickets_sold, revenue)
SELECT
  p.id,
  coalesce(sum(b.num_tickets) FILTER (WHERE b.status IN ('paid', 'confirmed')), 0),
  coalesce(sum(b.total_price) FILTER (WHERE b.status IN ('paid', 'confirmed')), 0)
FROM public.productions p
LEFT JOIN public.showtimes s ON s.production_id = p.id
LEFT JOIN public.bookings  b ON b.showtime_id  = s.id
GROUP BY p.id
ON CONFLICT (movie_id) DO UPDATE
  SET tickets_sold = EXCLUDED.tickets_sold,
      revenue      = EXCLUDED.revenue,
      updated_at   = now();

-- Expose the table through PostgREST so supabase.from('production_stats') and
-- the productions(title) embed resolve immediately.
NOTIFY pgrst, 'reload schema';
