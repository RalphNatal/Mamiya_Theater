-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY ADVISOR CHECKLIST — run on the HOSTED project after
-- 20261018120000_abuse_rate_limits.sql and 20261018130000_security_advisor_fixes.sql
-- are applied (and again after any future migration that adds a table,
-- view or SECURITY DEFINER function).
--
-- It re-asserts, against the live catalog, what Supabase's Security Advisor
-- (Dashboard → Advisors → Security) checks, plus this project's own rules:
--
--   A. every public table has RLS; no SECURITY DEFINER views; no write policy
--      that is simply `true`; no view exposes auth.users; no policy trusts
--      user_metadata
--   B. every public function pins search_path
--   C. payments is never client-writable (service role only) and anon can't
--      read it; bookings / contact_messages / subscribers / ticket_fees /
--      production_stats have no client write grants
--   D. promo_codes is unreadable by anon and by signed-in non-admins
--   E. profiles: anon sees nothing; a signed-in user sees only their own row
--   F. internal functions (decrement_showtime_seats, cleanup_expired_reservations,
--      consume_rate_limit, the private schema) are not callable by clients
--   G. every SECURITY DEFINER function anon can execute is on the reviewed list
--      below — a NEW one shows up as FAIL until someone reviews it
--   H. regressions: legacy create_booking stays revoked; the online booking
--      RPC still enforces the production ticket cap
--
-- HOW TO RUN: Supabase dashboard → SQL editor (runs as postgres) → paste this
-- whole file → Run. Every row should read PASS (WARN = review, not a failure).
-- It changes NOTHING: the impersonation probes run inside a DO block whose
-- role switch is transaction-local.
-- ─────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS pg_temp.security_advisor_results;
CREATE TEMP TABLE security_advisor_results (
  n       serial,
  area    text,
  "check" text,
  outcome text,
  detail  text
);

DO $$
DECLARE
  v_list text;
  v_n    bigint;
  v_ok   boolean;
  v_err  text;
  -- SECURITY DEFINER functions that are MEANT to be callable by anon (guest
  -- checkout, ticket links, the guards RLS policies call). Reviewed 2026-10-18.
  v_anon_ok text[] := ARRAY[
    'assert_admin', 'assert_staff', 'current_user_is_admin',
    'cancel_reservation', 'create_pending_booking', 'preview_promo_code',
    'get_booking_by_reference', 'get_booking_confirmation', 'get_ticket', 'get_ticket_by_token'
  ];
  v_probe_uid text := gen_random_uuid()::text;  -- a signed-in NON-admin (no profile row)
BEGIN
  -- A. Tables / views / policies ─────────────────────────────────────────────
  SELECT string_agg(c.relname, ', ') INTO v_list
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('A · RLS', 'every public table has RLS enabled (lint 0013)',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce('no RLS: ' || v_list, 'all tables'));

  SELECT string_agg(c.relname, ', ') INTO v_list
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND NOT coalesce('security_invoker=true' = ANY(c.reloptions) OR 'security_invoker=on' = ANY(c.reloptions), false);
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('A · views', 'no SECURITY DEFINER views (lint 0010)',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce('definer views: ' || v_list, 'all views are security_invoker'));

  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_list
    FROM pg_policies
   WHERE schemaname = 'public' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND coalesce(qual, 'true') = 'true' AND coalesce(with_check, 'true') = 'true';
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('A · policies', 'no write policy that is just `true` (lint 0024)',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_list, 'none'));

  SELECT string_agg(DISTINCT v.relname, ', ') INTO v_list
    FROM pg_class v JOIN pg_namespace n ON n.oid = v.relnamespace
    JOIN pg_depend d ON d.objid = (SELECT r.oid FROM pg_rewrite r WHERE r.ev_class = v.oid LIMIT 1)
   WHERE n.nspname = 'public' AND v.relkind IN ('v', 'm') AND d.refobjid = 'auth.users'::regclass;
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('A · views', 'no public view exposes auth.users (lint 0002)',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_list, 'none'));

  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_list
    FROM pg_policies
   WHERE schemaname = 'public' AND (coalesce(qual, '') ~ 'user_metadata' OR coalesce(with_check, '') ~ 'user_metadata');
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('A · policies', 'no policy trusts user_metadata (lint 0015)',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_list, 'none'));

  SELECT string_agg(e.extname, ', ') INTO v_list
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE n.nspname = 'public';
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('A · extensions', 'no extensions installed in public (lint 0014)',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'WARN' END, coalesce('in public: ' || v_list || ' — move to the extensions schema', 'none'));

  -- B. search_path on every function ─────────────────────────────────────────
  SELECT string_agg(p.proname || CASE WHEN p.prosecdef THEN ' (DEFINER)' ELSE '' END, ', ') INTO v_list
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'private')
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');  -- skip extension-owned
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('B · functions', 'every function pins search_path (lint 0011)',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce('mutable search_path: ' || v_list, 'all pinned'));

  -- C. Server-owned tables ───────────────────────────────────────────────────
  v_ok := NOT (has_table_privilege('anon', 'public.payments', 'INSERT') OR has_table_privilege('anon', 'public.payments', 'UPDATE')
            OR has_table_privilege('anon', 'public.payments', 'DELETE') OR has_table_privilege('authenticated', 'public.payments', 'INSERT')
            OR has_table_privilege('authenticated', 'public.payments', 'UPDATE') OR has_table_privilege('authenticated', 'public.payments', 'DELETE'))
          AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payments' AND cmd <> 'SELECT');
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('C · payments', 'payments: no client write grant and no write policy (service role only)',
          CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, CASE WHEN v_ok THEN 'writes only via Edge Functions' ELSE 'a client role can write payments' END);

  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('C · payments', 'anon cannot read payments',
          CASE WHEN has_table_privilege('anon', 'public.payments', 'SELECT') THEN 'FAIL' ELSE 'PASS' END, 'SELECT revoked from anon');

  SELECT string_agg(t || ' (' || r || ')', ', ') INTO v_list
    FROM unnest(ARRAY['bookings', 'contact_messages', 'subscribers', 'ticket_fees', 'production_stats', 'promo_codes']) t
   CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r
   WHERE has_table_privilege(r, 'public.' || t, 'INSERT') OR has_table_privilege(r, 'public.' || t, 'UPDATE')
      OR has_table_privilege(r, 'public.' || t, 'DELETE');
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('C · tables', 'no client write grants on server-owned tables',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce('writable: ' || v_list, 'none'));

  -- D. promo_codes ───────────────────────────────────────────────────────────
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('D · promo_codes', 'anon has no privileges on promo_codes',
          CASE WHEN has_table_privilege('anon', 'public.promo_codes', 'SELECT') THEN 'FAIL' ELSE 'PASS' END, 'SELECT revoked');

  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_probe_uid)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT count(*) FROM public.promo_codes' INTO v_n;
  EXECUTE 'RESET ROLE';
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('D · promo_codes', 'a signed-in NON-admin sees 0 promo codes',
          CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, format('%s row(s) visible; real total %s', v_n, (SELECT count(*) FROM public.promo_codes)));

  -- E. profiles ──────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  EXECUTE 'SELECT count(*) FROM public.profiles' INTO v_n;
  EXECUTE 'RESET ROLE';
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('E · profiles', 'anon sees 0 profiles (no emails / phones / roles)',
          CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, format('%s of %s visible', v_n, (SELECT count(*) FROM public.profiles)));

  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_probe_uid)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT count(*) FROM public.profiles' INTO v_n;
  EXECUTE 'RESET ROLE';
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('E · profiles', 'a signed-in non-admin sees only their own profile',
          CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, format('probe user (no profile row) sees %s', v_n));
  PERFORM set_config('request.jwt.claims', '', true);

  -- F. Internal functions ────────────────────────────────────────────────────
  SELECT string_agg(f || ' (' || r || ')', ', ') INTO v_list
    FROM unnest(ARRAY['public.decrement_showtime_seats(uuid, integer)', 'public.cleanup_expired_reservations()',
                      'public.consume_rate_limit(text, text, integer, integer)', 'public.sum_effective_seat_total(uuid, text[], numeric)']) f
   CROSS JOIN unnest(ARRAY['anon', 'authenticated']) r
   WHERE has_function_privilege(r, f, 'EXECUTE');
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('F · functions', 'internal functions are not callable by clients',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce('callable: ' || v_list, 'service role / definer only'));

  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('F · functions', 'service role can still finalize payments (decrement_showtime_seats)',
          CASE WHEN has_function_privilege('service_role', 'public.decrement_showtime_seats(uuid, integer)', 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END,
          'needed by stripe-webhook / stripe-verify-checkout / PayPal finalize');

  v_ok := NOT has_schema_privilege('anon', 'private', 'USAGE') AND NOT has_schema_privilege('authenticated', 'private', 'USAGE');
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('F · rate limits', 'private schema (rate-limit counters) is closed to clients',
          CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, CASE WHEN v_ok THEN 'no USAGE for anon / authenticated' ELSE 'clients can reach private.*' END);

  -- G. Anon-executable SECURITY DEFINER functions ────────────────────────────
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ') INTO v_list
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND p.prorettype <> 'trigger'::regtype            -- PostgREST cannot call trigger functions
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT p.proname = ANY(v_anon_ok);
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('G · definers', 'every anon-callable SECURITY DEFINER function is on the reviewed list (lint 0028)',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END,
          coalesce('UNREVIEWED: ' || v_list || ' — revoke from anon, or review it and add it to v_anon_ok', 'only: ' || array_to_string(v_anon_ok, ', ')));

  -- H. Regressions ───────────────────────────────────────────────────────────
  SELECT string_agg(r, ', ') INTO v_list
    FROM unnest(ARRAY['anon', 'authenticated']) r
   WHERE to_regprocedure('public.create_booking(uuid, text[])') IS NOT NULL
     AND has_function_privilege(r, 'public.create_booking(uuid, text[])', 'EXECUTE');
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('H · regressions', 'legacy create_booking (confirmed-but-unpaid holds) stays revoked',
          CASE WHEN v_list IS NULL THEN 'PASS' ELSE 'FAIL' END, coalesce('executable by: ' || v_list, 'revoked'));

  v_ok := pg_get_functiondef('public.create_pending_booking(uuid, text[], text, text, text)'::regprocedure) ~ 'total_tickets_capacity'
      AND pg_get_functiondef('public.create_pending_booking(uuid, text[], text, text, text)'::regprocedure) ~ 'Sold out';
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('H · regressions', 'online create_pending_booking enforces the production ticket cap',
          CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, CASE WHEN v_ok THEN 'capacity check present' ELSE 'cap check MISSING — oversell risk' END);

  v_ok := pg_get_functiondef('public.create_pending_booking(uuid, text[], text, text, text)'::regprocedure) ~ 'hold_start'
      AND pg_get_functiondef('public.preview_promo_code(text, uuid, integer)'::regprocedure) ~ 'promo_locked_out';
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('H · regressions', 'promo-guess lockout and seat-hold limits are in place',
          CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, CASE WHEN v_ok THEN '20261018120000 applied' ELSE 'rate limits missing' END);
EXCEPTION WHEN others THEN
  GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  RESET ROLE;
  INSERT INTO security_advisor_results (area, "check", outcome, detail)
  VALUES ('!', 'checklist aborted', 'FAIL', v_err || ' — are both 20261018 migrations applied?');
END;
$$;

SELECT n, area, "check", outcome, detail FROM security_advisor_results ORDER BY n;
