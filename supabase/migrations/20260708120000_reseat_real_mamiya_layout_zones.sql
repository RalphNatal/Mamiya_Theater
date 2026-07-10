ALTER TABLE public.venue_seats
  ADD COLUMN IF NOT EXISTS zone TEXT NOT NULL DEFAULT 'general'
    CHECK (zone IN ('premium', 'general', 'limited_view'));

-- 2. Reseat. Wipe the old square grid in full (its "A-1".."T-25" identifiers no
--    longer exist under the new numbering) and seed the exact chart above.
DELETE FROM public.venue_seats;

-- 2a. Standard seats, driven by a per-row (row_label, seat_count, kind) list and
--     explicit zone-range CASE logic. `kind` is the row's zone rule:
--       'general'  → every seat general
--       'limited'  → every seat limited_view
--       'premium'  → limited_view at both ENDS, premium in the middle
WITH consts AS (
  -- ⭐ VERIFY-AGAINST-CHART — the ONLY soft numbers in this whole migration.
  -- On the premium rows C/D/E, this many seats at EACH end are limited_view
  -- (pink); everything between is premium (yellow). Read off the rendered chart:
  --   house-LEFT end  = 5 seats (cols 01..05)
  --   house-RIGHT end = 6 seats (the last 6 cols)
  -- If the official chart ever disagrees, THIS is the one-line edit. It must stay
  -- identical to PREMIUM_PINK_END in src/config/theaterLayout.ts.
  SELECT 5 AS left_pink_end, 6 AS right_pink_end
),
rows(row_label, seat_count, kind) AS (
  VALUES
    ('A', 26, 'limited'),
    ('B', 29, 'limited'),
    ('C', 31, 'premium'),
    ('D', 33, 'premium'),
    ('E', 35, 'premium'),
    ('F', 35, 'general'),
    ('G', 35, 'general'),
    ('H', 35, 'general'),
    ('J', 35, 'general'),
    ('K', 35, 'general'),
    ('L', 35, 'general'),
    ('M', 35, 'general'),
    ('N', 35, 'general'),
    ('O', 35, 'limited'),
    ('P', 30, 'limited')
),
seats AS (
  SELECT
    r.row_label,
    c AS col_number,
    -- zero-padded 2-digit identifier: "A-01", "E-35", "P-30"
    r.row_label || '-' || lpad(c::text, 2, '0') AS seat_identifier,
    CASE r.kind
      WHEN 'general' THEN 'general'
      WHEN 'limited' THEN 'limited_view'
      WHEN 'premium' THEN
        CASE
          WHEN c <= k.left_pink_end THEN 'limited_view'                 -- house-left end
          WHEN c >  r.seat_count - k.right_pink_end THEN 'limited_view' -- house-right end
          ELSE 'premium'                                               -- premium middle
        END
    END AS zone
  FROM rows r
  CROSS JOIN consts k,
  LATERAL generate_series(1, r.seat_count) AS c
)
INSERT INTO public.venue_seats (seat_identifier, row_label, col_number, is_accessible, zone)
SELECT seat_identifier, row_label, col_number, false, zone
FROM seats;

-- 2b. Row-P wheelchair spaces: two at house-LEFT (before seat 01), two at
--     house-RIGHT (after seat 30). row_label='P', col_number 1..4 (seat order),
--     is_accessible=true, zone limited_view. seat_identifier is the literal
--     "P-WC1".."P-WC4" (matches the frontend). NOTE: col_number 1..4 here overlaps
--     the standard P seats' 1..4 — that's intentional per spec; the seat_identifier
--     is what's unique, and the frontend renders WC at the row ends explicitly.
INSERT INTO public.venue_seats (seat_identifier, row_label, col_number, is_accessible, zone)
VALUES
  ('P-WC1', 'P', 1, true, 'limited_view'),
  ('P-WC2', 'P', 2, true, 'limited_view'),
  ('P-WC3', 'P', 3, true, 'limited_view'),
  ('P-WC4', 'P', 4, true, 'limited_view');

-- 2c. Build-time assertion: fail LOUDLY if the seed didn't produce the exact
--     chart. Groups by zone (limited_view here INCLUDES the 4 wheelchair spaces).
DO $$
DECLARE
  v_prem  int;
  v_gen   int;
  v_lim   int;
  v_acc   int;
  v_total int;
BEGIN
  SELECT
    count(*) FILTER (WHERE zone = 'premium'),
    count(*) FILTER (WHERE zone = 'general'),
    count(*) FILTER (WHERE zone = 'limited_view'),
    count(*) FILTER (WHERE is_accessible),
    count(*)
  INTO v_prem, v_gen, v_lim, v_acc, v_total
  FROM public.venue_seats;

  IF v_prem <> 66 OR v_gen <> 280 OR v_lim <> 157 OR v_acc <> 4 OR v_total <> 503 THEN
    RAISE EXCEPTION
      'Reseat count mismatch: premium=%, general=%, limited_view=%, accessible=%, total=% (expected 66 / 280 / 157 / 4 / 503)',
      v_prem, v_gen, v_lim, v_acc, v_total;
  END IF;
END $$;

-- 3. Capacity guards: the house is now 503 sellable positions (499 standard +
--    4 wheelchair). New defaults for freshly-created productions/showtimes.
ALTER TABLE public.productions ALTER COLUMN total_tickets_capacity SET DEFAULT 503;
ALTER TABLE public.showtimes   ALTER COLUMN available_seats        SET DEFAULT 503;

-- 3a. Reset EXISTING showtimes' available_seats to 503 minus the tickets already
--     taken, so already-sold counts are preserved across the capacity bump.
--     booking_seats holds one 'booked' row per sold ticket (and per still-pending
--     online reservation), so that count is the tickets taken. greatest(0, …)
--     clamps in the (impossible-in-practice) event booked > 503.
--     (In sandbox with no live sales this simplifies to a flat 503, but the
--      correct expression is kept so it's right against real data too.)
UPDATE public.showtimes s
SET available_seats = greatest(0, 503 - COALESCE((
  SELECT count(*)
  FROM public.booking_seats bs
  WHERE bs.showtime_id = s.id
    AND bs.status = 'booked'
), 0));

-- 4. Refresh PostgREST so the new column is exposed immediately.
NOTIFY pgrst, 'reload schema';
