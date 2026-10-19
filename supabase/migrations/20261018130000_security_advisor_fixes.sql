-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY ADVISOR PASS — least privilege on functions, views and tables.
--
-- Found by auditing the whole migration chain against Supabase's Security
-- Advisor lints (supabase/checks/security_advisor_checklist.sql re-asserts all
-- of this on the hosted project):
--
--   1. decrement_showtime_seats(showtime, n) was EXECUTABLE BY ANON. Migration
--      20260707120000 revoked it only FROM PUBLIC, but Supabase's default
--      privileges grant EXECUTE on new functions to anon and authenticated
--      DIRECTLY, so that revoke removed nothing. Anyone with the public anon
--      key could set every show's available_seats to 0 and stop all online
--      sales. Only the service role (the Stripe / PayPal finalizers) calls it;
--      confirm_free_booking calls it as definer, so it is unaffected.
--   2. cleanup_expired_reservations() — same gap. pg_cron runs it as postgres;
--      clients never call it. Likewise anon loses EXECUTE on the admin-only
--      RPCs (they already refused anon inside) and on an internal pricing
--      helper.
--   3. profiles had "Public profiles are viewable by everyone." USING (true):
--      every account's email, full name, mobile number and role — including
--      which accounts are admins — was readable with the anon key. Now: your
--      own row, or any row for an admin (the Users screen). Every client read
--      is .eq('id', user.id) or the admin Users list. Staff tools read through
--      SECURITY DEFINER RPCs, so they are unaffected. The admin checks inside
--      other policies (EXISTS … profiles WHERE id = auth.uid() …) only ever
--      read the caller's own row, which stays visible.
--   4. Two views ran as SECURITY DEFINER (lint 0010, an ERROR): they now run as
--      the caller (security_invoker), so RLS applies. Results are unchanged
--      (verified on PGlite for anon, a user and an admin):
--        • show_ticket_stats — already gated on current_user_is_admin(); an
--          admin's RLS sees every booking anyway.
--        • showtime_availability — counts booked seats via booking_seats, whose
--          RLS is "anyone can view occupancy". anon is granted only
--          (showtime_id, seat_number, status) on that table, so the count uses
--          bs.showtime_id instead of bs.id (identical: both are NULL exactly
--          for the LEFT JOIN's empty rows).
--   5. Table privileges: RLS already blocked every client write to payments,
--      bookings, contact_messages, subscribers, production_stats and
--      ticket_fees (no write policies). The write GRANTs are now revoked too,
--      so a future permissive policy can't open them by accident. payments is
--      service-role-write only; anon can't even SELECT it (it can never own a
--      row). promo_codes was already fully revoked (20261004140000).
--   6. analytics_events "Append-only analytics inserts" was WITH CHECK (true)
--      (lint 0024). It is now bounded: event_type shaped like the canonical
--      snake_case names, session_id ≤ 100 characters, metadata ≤ 2 KB. That
--      keeps the anonymous funnel tracking working while stopping arbitrary
--      blobs.
--
-- Already compliant (kept as-is): RLS enabled on every public table; every
-- public function sets search_path. The definers in the old migrations
-- create_profiles_table / add_mobile_number_to_profiles (handle_new_user) were
-- superseded by 20260701160000, which sets it, and per_showtime_seat_holds
-- defines no functions. Legacy create_booking stays revoked (20261004120000).
-- The trigger functions (handle_new_user, prevent_role_self_update, …) keep
-- their default grants: PostgREST cannot call a trigger function, and the auth
-- trigger fires as supabase_auth_admin.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor), then
--     run supabase/checks/security_advisor_checklist.sql.
-- ─────────────────────────────────────────────────────────────────────────

-- 1 + 2. Internal functions: service role / owner only ──────────────────────
REVOKE EXECUTE ON FUNCTION public.decrement_showtime_seats(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.decrement_showtime_seats(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reservations() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_expired_reservations() TO service_role;

-- Admin-only RPCs refuse anon inside (assert_admin / an admin role check), but
-- nothing anonymous ever calls them, so anon loses EXECUTE outright (lint
-- 0028). Signed-in admins keep it via authenticated.
REVOKE EXECUTE ON FUNCTION public.get_dashboard_kpis(date, date)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_timeseries(date, date)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_channels(date, date)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_top_shows(date, date, integer)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.funnel_counts(date, date)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_ticket(text, boolean)            FROM PUBLIC, anon;
-- Internal pricing helper (called by the booking RPCs as definer).
REVOKE EXECUTE ON FUNCTION public.sum_effective_seat_total(uuid, text[], numeric) FROM PUBLIC, anon, authenticated;

-- 3. profiles: own row, or admin ───────────────────────────────────────────
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile; admins all" ON public.profiles;
CREATE POLICY "Users can view their own profile; admins all" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.current_user_is_admin());

-- 4. Views run as the caller ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.showtime_availability
WITH (security_invoker = true) AS
SELECT s.id,
       s.production_id,
       s.start_time,
       s.price,
       s.available_seats,
       p.total_tickets_capacity,
       count(bs.showtime_id) FILTER (WHERE bs.status = 'booked')::integer AS tickets_booked,
       GREATEST(0::bigint, p.total_tickets_capacity - count(bs.showtime_id) FILTER (WHERE bs.status = 'booked'))::integer AS remaining_tickets,
       count(bs.showtime_id) FILTER (WHERE bs.status = 'booked') >= p.total_tickets_capacity AS is_sold_out
  FROM public.showtimes s
  JOIN public.productions p ON p.id = s.production_id
  LEFT JOIN public.booking_seats bs ON bs.showtime_id = s.id
 GROUP BY s.id, p.total_tickets_capacity;

ALTER VIEW public.show_ticket_stats SET (security_invoker = true);

-- 5. No client writes to server-owned tables ─────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.payments         FROM anon, authenticated;
REVOKE SELECT                                                ON public.payments         FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.bookings         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.contact_messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subscribers      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.production_stats FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ticket_fees      FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER         ON public.analytics_events FROM anon, authenticated;

-- 6. Bounded analytics inserts ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Append-only analytics inserts" ON public.analytics_events;
CREATE POLICY "Append-only analytics inserts" ON public.analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    event_type ~ '^[a-z][a-z_]{0,39}$'
    AND length(session_id) BETWEEN 1 AND 100
    AND (metadata IS NULL OR pg_column_size(metadata) <= 2048)
  );

NOTIFY pgrst, 'reload schema';
