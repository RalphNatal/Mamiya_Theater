-- ─────────────────────────────────────────────────────────────────────────
-- THEATER PIVOT: movies (cinema) → productions (live theater)
--
-- This repositions the catalog entity from a movie/cinema model to a live
-- theater model. We RENAME rather than drop so every existing relation and
-- row survives: the showtimes FK, the bookings created from those showtimes,
-- booking_seats, and all RLS policies keep pointing at the same data.
--
-- Postgres keeps foreign keys, indexes, and RLS policies attached across a
-- table/column RENAME (they track the object by OID, not by name), so the
-- showtimes→productions relationship and the public/admin policies continue
-- to work. We still drop+recreate the policies at the end purely so their
-- NAMES read "productions" instead of "movies"; the gating logic is identical.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Rename the table and the foreign-key column on showtimes ───────────────
ALTER TABLE public.movies RENAME TO productions;
ALTER TABLE public.showtimes RENAME COLUMN movie_id TO production_id;

-- Keep the FK constraint name in step with the column (cosmetic; PostgREST
-- resolves the embed by relationship, not by constraint name). Guarded so the
-- migration still applies if the constraint was auto-named differently.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'showtimes_movie_id_fkey'
  ) THEN
    ALTER TABLE public.showtimes
      RENAME CONSTRAINT showtimes_movie_id_fkey TO showtimes_production_id_fkey;
  END IF;
END $$;

-- 2. Add live-theater columns ──────────────────────────────────────────────
ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS playwright            TEXT,
  ADD COLUMN IF NOT EXISTS director              TEXT,
  ADD COLUMN IF NOT EXISTS intermission_duration INT4,
  ADD COLUMN IF NOT EXISTS opening_night         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closing_night         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_advisory          TEXT;

-- 3. Preserve existing cinema data into the closest theater equivalent ──────
--    A single "release_date" maps most naturally to a run's opening night.
UPDATE public.productions
  SET opening_night = release_date
  WHERE release_date IS NOT NULL AND opening_night IS NULL;

-- 4. Drop the cinema-only columns so no orphaned data remains ───────────────
--    "rating" (MPAA, e.g. PG-13) has no theater equivalent — age_advisory is
--    free-text content guidance, not a rating board classification — so it is
--    dropped rather than copied.
ALTER TABLE public.productions
  DROP COLUMN IF EXISTS release_date,
  DROP COLUMN IF EXISTS rating;

-- 5. Re-point RLS policies at the renamed entity (same admin-only gating) ───
--    The policies carried over on rename; we recreate them only to rename
--    them. Behaviour is unchanged: public SELECT, admin-only writes gated on
--    the caller's own profiles.role = 'admin'.
DROP POLICY IF EXISTS "Movies are viewable by everyone" ON public.productions;
CREATE POLICY "Productions are viewable by everyone"
  ON public.productions FOR SELECT USING ( true );

DROP POLICY IF EXISTS "Admins can insert movies." ON public.productions;
CREATE POLICY "Admins can insert productions."
  ON public.productions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update movies." ON public.productions;
CREATE POLICY "Admins can update productions."
  ON public.productions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete movies." ON public.productions;
CREATE POLICY "Admins can delete productions."
  ON public.productions FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 6. Recreate create_booking() against productions/production_id ────────────
--    The previous body joined public.movies on s.movie_id, both of which no
--    longer exist. The booking snapshot column (bookings.movie_title) is left
--    as-is — it stores the production's title at time of sale, and renaming it
--    would break historical bookings and the profile booking history view.
CREATE OR REPLACE FUNCTION public.create_booking(p_showtime_id uuid, p_seats text[])
RETURNS uuid AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_price numeric;
  v_available_seats int;
  v_start_time timestamptz;
  v_title text;
  v_num_tickets int;
  v_total numeric;
  v_booking_id uuid;
  v_seat text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_num_tickets := coalesce(array_length(p_seats, 1), 0);
  IF v_num_tickets = 0 THEN
    RAISE EXCEPTION 'Select at least one seat';
  END IF;

  SELECT s.price, coalesce(s.available_seats, 0), s.start_time, p.title
    INTO v_price, v_available_seats, v_start_time, v_title
    FROM public.showtimes s
    LEFT JOIN public.productions p ON p.id = s.production_id
    WHERE s.id = p_showtime_id
    FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Showtime not found';
  END IF;

  IF v_num_tickets > v_available_seats THEN
    RAISE EXCEPTION 'Not enough seats';
  END IF;

  v_total := v_price * v_num_tickets;

  INSERT INTO public.bookings (
    user_id, showtime_id, movie_title, show_start_time, num_tickets, total_price, status
  ) VALUES (
    v_user_id, p_showtime_id, v_title, v_start_time, v_num_tickets, v_total, 'confirmed'
  )
  RETURNING id INTO v_booking_id;

  BEGIN
    FOREACH v_seat IN ARRAY p_seats LOOP
      INSERT INTO public.booking_seats (booking_id, showtime_id, seat_number)
      VALUES (v_booking_id, p_showtime_id, v_seat);
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'One or more selected seats are no longer available';
  END;

  UPDATE public.showtimes
    SET available_seats = available_seats - v_num_tickets
    WHERE id = p_showtime_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_booking(uuid, text[]) TO authenticated;

-- 7. Nudge PostgREST to reload its schema cache so the renamed table and the
--    showtimes→productions relationship are resolvable by the API (and by the
--    client's embedded `productions(...)` selects) immediately after migrate.
NOTIFY pgrst, 'reload schema';
