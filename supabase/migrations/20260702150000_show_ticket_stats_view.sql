-- ─────────────────────────────────────────────────────────────────────────
-- PER-SHOW TICKET STATS — show_ticket_stats VIEW
--
-- The dashboard's headline "Tickets Sold" KPI aggregates every show together.
-- This view gives an all-time, per-production breakdown so an admin can read
-- "<Title> — N tickets sold" for each show individually. One row per
-- production (including shows with zero sales); the client orders by
-- total_tickets_sold.
--
-- "Sold" mirrors the rest of the dashboard: a booking with
--   status IN ('paid','confirmed')   ('confirmed' = online, 'paid' = box office)
-- We SUM bookings.num_tickets rather than COUNT booking_seats rows, because
-- booking_seats.status='booked' also covers still-pending (unpaid) reservations
-- inserted by create_pending_booking — counting those would overstate sales.
--
-- SECURITY: this exposes every show's sales + revenue. A plain view runs with
-- its owner's rights (bypassing bookings' RLS), which would otherwise let ANY
-- authenticated user read business revenue straight off the REST API. The
-- `WHERE current_user_is_admin()` guard makes the view return ZERO rows to
-- non-admins while admins get the full aggregate — the same admin-only posture
-- as the get_dashboard_kpis / get_top_shows RPCs.
-- ─────────────────────────────────────────────────────────────────────────

-- Boolean sibling of assert_admin() (which RAISEs). SECURITY DEFINER so it can
-- read profiles regardless of the caller's RLS; used to gate the view below.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

-- One row per production, all-time. LEFT JOINs keep shows with no sales (their
-- totals fall through the FILTER/coalesce to 0). The admin gate lives in WHERE
-- so a non-admin caller matches no rows at all.
CREATE OR REPLACE VIEW public.show_ticket_stats AS
SELECT
  p.id    AS production_id,
  p.title AS title,
  coalesce(sum(b.num_tickets) FILTER (WHERE b.status IN ('paid', 'confirmed')), 0)::bigint  AS total_tickets_sold,
  coalesce(sum(b.total_price) FILTER (WHERE b.status IN ('paid', 'confirmed')), 0)::numeric AS total_revenue
FROM public.productions p
LEFT JOIN public.showtimes s ON s.production_id = p.id
LEFT JOIN public.bookings  b ON b.showtime_id  = s.id
WHERE public.current_user_is_admin()          -- admin-only; non-admins get zero rows
GROUP BY p.id, p.title;

-- Expose the view through PostgREST so supabase.from('show_ticket_stats') works.
GRANT SELECT ON public.show_ticket_stats TO authenticated;

-- Refresh PostgREST so the new function + view are exposed immediately.
NOTIFY pgrst, 'reload schema';
