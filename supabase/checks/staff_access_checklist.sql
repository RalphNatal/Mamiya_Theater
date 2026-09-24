-- ─────────────────────────────────────────────────────────────────────────
-- STAFF ACCESS CHECKLIST — run on the HOSTED project after
-- 20260924120000_staff_role_door_checkin.sql is applied.
--
-- Proves at the DATA layer (not the UI) that a 'staff' account:
--   A. is refused by every sales / tickets-sold / payout RPC —
--      get_dashboard_kpis, get_sales_timeseries, get_sales_channels,
--      get_top_shows, get_revenue_breakdown, funnel_counts (all assert_admin) —
--      and by the admin-only walk-up sale, legacy verify_ticket and role changes;
--   B. sees NO other customer's bookings, NO other payments, and no per-show
--      sales (bookings + payments RLS is "own row OR admin"; production_stats
--      is admin-only RLS; show_ticket_stats is gated on current_user_is_admin());
--   C. CAN check a paid ticket in through check_in_ticket (assert_staff), and
--      the response carries no price / total / revenue field.
-- The client half — no staff-visible screen calls a finance RPC — is pinned by
-- __tests__/staffAccess.test.tsx.
--
-- HOW TO RUN (Supabase dashboard → SQL editor; it runs as `postgres`):
--   1. Have a staff account: sign up normally, then Admin → Users → "Staff".
--      Or from SQL (the role-protection trigger admits the service role):
--        begin;
--        select set_config('request.jwt.claims', '{"role":"service_role"}', true);
--        update public.profiles set role = 'staff' where email = 'door@example.com';
--        commit;
--   2. Put that email on the line marked ▶ below and run this whole file.
--   3. Every row should read PASS. SKIP means there was nothing in the database
--      to test that item against (e.g. no paid, un-scanned ticket yet).
--
-- It impersonates the account exactly as PostgREST does for a request carrying
-- the user's JWT (SET ROLE authenticated + request.jwt.claims). It changes
-- NOTHING: the one real check-in it performs is rolled back inside the script.
-- ─────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS pg_temp.staff_access_results;
CREATE TEMP TABLE staff_access_results (
  n       int,
  area    text,
  "check" text,
  outcome text,
  detail  text
);

DO $$
DECLARE
  v_email text := 'door@example.com';   -- ▶ the STAFF account to test

  v_uid    uuid;
  v_role   text;
  v_out    jsonb := '[]'::jsonb;
  r        record;
  v_ok     boolean;
  v_msg    text;
  v_n      bigint;
  v_total  bigint;
  v_token  uuid;
  v_json   jsonb;
  v_res    text;
  v_undone boolean;
BEGIN
  SELECT p.id, p.role INTO v_uid, v_role
    FROM public.profiles p WHERE lower(p.email) = lower(v_email);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No profile has email %. Set v_email on the ▶ line.', v_email;
  END IF;
  IF v_role IS DISTINCT FROM 'staff' THEN
    RAISE EXCEPTION '% has role %, expected staff (see step 1 in the header).', v_email, v_role;
  END IF;

  -- Baselines, read as postgres BEFORE impersonating, so a PASS below means
  -- "hidden", not "there was nothing to see".
  SELECT count(*) INTO v_total FROM public.bookings b WHERE b.user_id IS DISTINCT FROM v_uid;
  SELECT bs.ticket_token INTO v_token
    FROM public.booking_seats bs
    JOIN public.bookings b ON b.id = bs.booking_id
   WHERE b.payment_status = 'paid' AND bs.status = 'booked' AND bs.checked_in_at IS NULL
   ORDER BY b.show_start_time DESC NULLS LAST
   LIMIT 1;

  -- ── Become the staff user (what PostgREST does with their access token) ──
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);   -- older auth.uid()
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  -- ── A. Every money RPC refuses staff ─────────────────────────────────────
  FOR r IN
    SELECT * FROM (VALUES
      ('get_dashboard_kpis (Total Sales / tickets sold)',
       'SELECT public.get_dashboard_kpis(current_date - 3650, current_date + 1)',
       'Admin privileges required'),
      ('get_sales_timeseries (daily sales)',
       'SELECT public.get_sales_timeseries(current_date - 30, current_date + 1)',
       'Admin privileges required'),
      ('get_sales_channels (online vs walk-in)',
       'SELECT public.get_sales_channels(current_date - 3650, current_date + 1)',
       'Admin privileges required'),
      ('get_top_shows (per-show sales)',
       'SELECT public.get_top_shows(current_date - 3650, current_date + 1, 50)',
       'Admin privileges required'),
      ('get_revenue_breakdown (payouts)',
       'SELECT public.get_revenue_breakdown(current_date - 3650, current_date + 1)',
       'Admin privileges required'),
      ('funnel_counts (conversion)',
       'SELECT public.funnel_counts(current_date - 3650, current_date + 1)',
       'Admin privileges required'),
      ('assert_admin() itself',
       'SELECT public.assert_admin()',
       'Admin privileges required'),
      ('create_box_office_booking (walk-up selling is admin-only)',
       'SELECT public.create_box_office_booking(gen_random_uuid(), ARRAY[''A1''], ''cash'')',
       'Only admins can process box office sales'),
      ('verify_ticket (legacy admin verify)',
       'SELECT public.verify_ticket(''MT-00000000'', false)',
       'Not authorized'),
      ('set_user_role (staff cannot promote anyone, incl. self)',
       format('SELECT public.set_user_role(%L, %L)', v_uid, 'admin'),
       'Not authorized: only admins can change another user''s role.')
    ) AS t(label, stmt, expect)
  LOOP
    BEGIN
      EXECUTE r.stmt;
      v_ok := false;
      v_msg := 'RETURNED WITHOUT ERROR — staff can reach this';
    EXCEPTION WHEN OTHERS THEN
      v_ok := (SQLERRM = r.expect);
      v_msg := CASE WHEN v_ok THEN 'refused: ' ELSE 'unexpected error: ' END || SQLERRM;
    END;
    v_out := v_out || jsonb_build_object('area', 'A · RPC', 'check', r.label,
               'outcome', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, 'detail', v_msg);
  END LOOP;

  -- ── B. RLS / views leak nothing ──────────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.bookings b WHERE b.user_id IS DISTINCT FROM v_uid;
  v_out := v_out || jsonb_build_object('area', 'B · RLS', 'check', 'bookings: other customers'' rows',
             'outcome', CASE WHEN v_total = 0 THEN 'SKIP' WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
             'detail', format('%s of %s visible', v_n, v_total));

  SELECT count(*) INTO v_n FROM public.payments p
   WHERE p.booking_id NOT IN (SELECT b.id FROM public.bookings b WHERE b.user_id = v_uid);
  v_out := v_out || jsonb_build_object('area', 'B · RLS', 'check', 'payments: rows for others'' bookings',
             'outcome', CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
             'detail', format('%s visible', v_n));

  SELECT count(*) INTO v_n FROM public.production_stats;
  v_out := v_out || jsonb_build_object('area', 'B · RLS', 'check', 'production_stats (per-show tickets + revenue)',
             'outcome', CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
             'detail', format('%s rows visible', v_n));

  SELECT count(*) INTO v_n FROM public.show_ticket_stats;
  v_out := v_out || jsonb_build_object('area', 'B · RLS', 'check', 'show_ticket_stats view',
             'outcome', CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END,
             'detail', format('%s rows visible', v_n));

  -- ── C. The door scan works, and says nothing about money ─────────────────
  IF v_token IS NULL THEN
    v_out := v_out || jsonb_build_object('area', 'C · check-in', 'check', 'check_in_ticket admits a paid seat',
               'outcome', 'SKIP', 'detail', 'no paid, un-scanned seat in the database to try');
  ELSE
    BEGIN
      v_json := public.check_in_ticket(v_token::text, true)::jsonb;
      v_res  := v_json->>'result';
      -- Undo the stamp: this sub-block's work rolls back, v_json/v_res survive.
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'undo test check-in';
    EXCEPTION
      WHEN SQLSTATE 'P0099' THEN NULL;
      WHEN OTHERS THEN v_res := 'error: ' || SQLERRM;
    END;
    v_out := v_out || jsonb_build_object('area', 'C · check-in', 'check', 'check_in_ticket admits a paid seat',
               'outcome', CASE WHEN v_res = 'ok' THEN 'PASS' ELSE 'FAIL' END,
               'detail', 'result = ' || coalesce(v_res, 'null'));
    v_ok := v_json IS NOT NULL
            AND NOT (v_json ?| ARRAY['total_price', 'price', 'amount', 'revenue'])
            AND NOT (coalesce(v_json->'ticket', '{}') ?| ARRAY['total_price', 'price', 'amount', 'revenue'])
            AND NOT (coalesce(v_json->'booking', '{}') ?| ARRAY['total_price', 'price', 'amount', 'revenue']);
    v_out := v_out || jsonb_build_object('area', 'C · check-in', 'check', 'check-in response has no money fields',
               'outcome', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
               'detail', coalesce(left(v_json::text, 300), 'no response'));
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);

  IF v_token IS NOT NULL THEN
    SELECT bs.checked_in_at IS NULL INTO v_undone FROM public.booking_seats bs WHERE bs.ticket_token = v_token;
    v_out := v_out || jsonb_build_object('area', 'C · check-in', 'check', 'test check-in was rolled back',
               'outcome', CASE WHEN v_undone THEN 'PASS' ELSE 'FAIL' END,
               'detail', CASE WHEN v_undone THEN 'seat is un-scanned again' ELSE 'seat still stamped — clear booking_seats.checked_in_at' END);
  END IF;

  INSERT INTO staff_access_results (n, area, "check", outcome, detail)
  SELECT e.n::int, e.v->>'area', e.v->>'check', e.v->>'outcome', e.v->>'detail'
    FROM jsonb_array_elements(v_out) WITH ORDINALITY AS e(v, n);
END;
$$;

SELECT n, area, "check", outcome, detail FROM staff_access_results ORDER BY n;
