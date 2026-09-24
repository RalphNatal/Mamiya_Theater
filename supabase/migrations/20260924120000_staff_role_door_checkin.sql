-- ─────────────────────────────────────────────────────────────────────────
-- STAFF ROLE — a lower admin tier for the door: check guests in, NO money.
--
-- Roles are now  'user' < 'staff' < 'admin'.
--
-- Why this is safe by construction: every sales / revenue / payout surface is
-- gated on role = 'admin' EXACTLY —
--   RPCs   get_dashboard_kpis, get_sales_timeseries, get_sales_channels,
--          get_top_shows, get_revenue_breakdown, funnel_counts   (assert_admin)
--          create_box_office_booking, verify_ticket               (inline check)
--   views  show_ticket_stats                          (current_user_is_admin)
--   RLS    production_stats read; bookings + payments "own row OR admin";
--          every admin write policy (productions, showtimes, seat prices,
--          venue seats, seat holds, contact messages, subscribers, images)
-- — so a NEW distinct value 'staff' is refused by all of them automatically.
-- This migration does NOT touch assert_admin() or any of those guards. It only
-- ADDS the one operational permission staff need:
--
--   1. profiles.role check → ('user', 'staff', 'admin').
--   2. set_user_role()     → admins may assign any of the three (still admin-only).
--   3. assert_staff()      → raises unless the caller is 'staff' OR 'admin'.
--   4. check_in_ticket()   → guard switched assert_admin → assert_staff. Body is
--                            otherwise IDENTICAL to 20260920120000. It returns
--                            the scanned seat + that one booking's seat list and
--                            check-in progress — no prices, totals or counts
--                            beyond the booking being admitted.
--
-- Walk-up SELLING stays admin-only (create_box_office_booking checks role =
-- 'admin'). To let staff sell too: change that function's role check to
-- `role IN ('staff', 'admin')` in a new migration AND flip `walkUpSales` for
-- staff in src/config/permissions.ts. Either change alone is not enough.
--
-- Verify after applying: supabase/checks/staff_access_checklist.sql.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push` (or the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Allow the new role value ───────────────────────────────────────────────
--    The original inline CHECK (20260623110314) is auto-named
--    profiles_role_check; drop whatever role CHECK exists by definition rather
--    than by name, so this is correct even if it was ever recreated by hand.
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.profiles'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'staff', 'admin'));

-- 2. set_user_role — admins may now assign 'staff' as well ──────────────────
--    Same as 20260627090000 apart from the accepted values. The caller check is
--    unchanged (admin only), and the role-protection trigger still only lets an
--    admin (or service_role) change a role — staff can never promote anyone.
CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role text)
RETURNS void AS $$
BEGIN
  IF new_role NOT IN ('user', 'staff', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %. Must be ''user'', ''staff'' or ''admin''.', new_role;
  END IF;

  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Not authorized: only admins can change another user''s role.';
  END IF;

  UPDATE public.profiles SET role = new_role WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

-- 3. assert_staff — the door-operations guard ───────────────────────────────
--    Sibling of assert_admin() (which stays admin-only). Use it ONLY on
--    operational RPCs that expose no money; anything financial keeps
--    assert_admin().
CREATE OR REPLACE FUNCTION public.assert_staff()
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('staff', 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff privileges required';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.assert_staff() TO authenticated;

-- 4. check_in_ticket — staff may scan + admit ───────────────────────────────
--    Copy of 20260920120000 §6b; ONLY the guard line changes.
CREATE OR REPLACE FUNCTION public.check_in_ticket(
  p_input    text,
  p_check_in boolean DEFAULT true
)
RETURNS json AS $$
DECLARE
  v_token   text;
  v_hex     text;
  v_uuid    uuid;
  v_seat    public.booking_seats%ROWTYPE;
  v_bid     uuid;
  v_pay     text;
  v_was     timestamptz;
  v_now     timestamptz;
  v_result  text;
BEGIN
  PERFORM public.assert_staff();

  -- A scanned ticket URL → keep only the segment after /ticket/.
  v_token := btrim(coalesce(p_input, ''));
  IF position('/ticket/' IN v_token) > 0 THEN
    v_token := regexp_replace(v_token, '^.*/ticket/', '');
    v_token := regexp_replace(v_token, '[/?#].*$', '');
  END IF;

  -- Hex-only view: a uuid yields 32 hex chars, a shortRef (MT-XXXXXXXX) yields 8.
  v_hex := regexp_replace(lower(v_token), '[^0-9a-f]', '', 'g');

  IF length(v_hex) >= 32 THEN
    v_uuid := (substr(v_hex, 1, 8) || '-' || substr(v_hex, 9, 4) || '-' ||
               substr(v_hex, 13, 4) || '-' || substr(v_hex, 17, 4) || '-' ||
               substr(v_hex, 21, 12))::uuid;

    -- (a) Per-seat ticket token — the normal scan path.
    SELECT bs.* INTO v_seat
      FROM public.booking_seats bs
     WHERE bs.ticket_token = v_uuid AND bs.status = 'booked' AND bs.booking_id IS NOT NULL;

    IF FOUND THEN
      SELECT b.payment_status INTO v_pay FROM public.bookings b WHERE b.id = v_seat.booking_id;
      v_bid := v_seat.booking_id;

      IF v_pay IS DISTINCT FROM 'paid' THEN
        v_result := 'not_paid';
      ELSE
        v_was := v_seat.checked_in_at;
        IF p_check_in AND v_was IS NULL THEN
          -- Atomic + idempotent: only a still-unstamped row is updated. A racing
          -- duplicate scan blocks on the row lock, re-evaluates the WHERE, and
          -- updates nothing — it then reads back the winner's stamp below.
          UPDATE public.booking_seats
             SET checked_in_at = now(), checked_in_by = auth.uid()
           WHERE id = v_seat.id AND checked_in_at IS NULL
           RETURNING checked_in_at INTO v_now;

          IF v_now IS NULL THEN
            -- Lost the race: someone stamped it between our SELECT and UPDATE.
            SELECT checked_in_at INTO v_was FROM public.booking_seats WHERE id = v_seat.id;
            v_result := 'already_checked_in';
          ELSE
            v_result := 'ok';
            -- Keep the legacy booking-level marker in step (first seat admitted).
            UPDATE public.bookings SET checked_in_at = v_now
             WHERE id = v_bid AND checked_in_at IS NULL;
          END IF;
        ELSIF v_was IS NOT NULL THEN
          v_result := 'already_checked_in';
        ELSE
          v_result := 'ok';          -- p_check_in = false: valid, not stamped
        END IF;
      END IF;

      RETURN json_build_object(
        'result',  v_result,
        'ticket',  (SELECT json_build_object(
                      'token', bs.ticket_token, 'seat', bs.seat_number, 'zone', vs.zone,
                      'checked_in_at', bs.checked_in_at)
                    FROM public.booking_seats bs
                    LEFT JOIN public.venue_seats vs ON vs.seat_identifier = bs.seat_number
                    WHERE bs.id = v_seat.id),
        'booking', public.booking_checkin_summary(v_bid)
      );
    END IF;

    -- (b) Legacy booking-level QR (…/ticket/<booking uuid>) — no auto check-in.
    SELECT b.id INTO v_bid FROM public.bookings b WHERE b.id = v_uuid;

  ELSIF length(v_hex) >= 8 THEN
    -- Typed shortRef: first 8 hex of the booking id (oldest wins a rare collision).
    SELECT b.id INTO v_bid
      FROM public.bookings b
     WHERE left(replace(b.id::text, '-', ''), 8) = left(v_hex, 8)
     ORDER BY b.created_at
     LIMIT 1;
  END IF;

  IF v_bid IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  SELECT b.payment_status INTO v_pay FROM public.bookings b WHERE b.id = v_bid;
  RETURN json_build_object(
    'result',  CASE WHEN v_pay = 'paid' THEN 'booking' ELSE 'not_paid' END,
    'booking', public.booking_checkin_summary(v_bid)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.check_in_ticket(text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_in_ticket(text, boolean) TO authenticated;

-- Refresh PostgREST so the new constraint / RPC guard are live immediately.
NOTIFY pgrst, 'reload schema';
