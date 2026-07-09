-- ─────────────────────────────────────────────────────────────────────────
-- RESEAT THE HOUSE: square 20×25 grid → the REAL Dr. Richard T. Mamiya Theatre
-- seating chart, PLUS three price zones (premium / general / limited_view).
--
-- The public seat picker (src/config/theaterLayout.ts) is being rewritten to the
-- official chart: rows A–P (theatre convention SKIPS "I"), per-row seat counts
-- that vary front→back, and a Premium/General/Limited-View colour split. This
-- migration brings the master seat map in line so venue_seats.seat_identifier
-- matches the frontend seatId() byte-for-byte again.
--
-- Canonical identifier format: "<ROW>-<NN>" with a ZERO-PADDED 2-digit number
-- ("A-01".."P-30"); the four wheelchair spaces are "P-WC1".."P-WC4". This CHANGES
-- the previous unpadded "A-1" scheme — zero-padding also fixes lexical sorting
-- (A-2 vs A-10). The DB seed here and the frontend seatId() MUST produce IDENTICAL
-- strings; the build-time count assertions on both sides catch any divergence.
--
-- Non-destructive to sales: booking_seats.seat_number is FREE TEXT with no FK to
-- venue_seats (same rationale as every prior reseat), so historical bookings keep
-- their labels. Any accessible/blocked flags an admin set on the old square grid
-- are cleared because those identifiers no longer exist — admins re-flag from the
-- Seat Map tab. The 4 wheelchair rows below are pre-flagged is_accessible.
--
-- Per-row map (front → back; ⭐ = the ONE soft spot, see the VERIFY block):
--   A: 01–26  ALL limited_view
--   B: 01–29  ALL limited_view
--   C: 01–31  01–05 limited_view | 06–25 premium | 26–31 limited_view  ⭐
--   D: 01–33  01–05 limited_view | 06–27 premium | 28–33 limited_view  ⭐
--   E: 01–35  01–05 limited_view | 06–29 premium | 30–35 limited_view  ⭐
--   F–N (F,G,H,J,K,L,M,N): 01–35  ALL general
--   O: 01–35  ALL limited_view
--   P: 01–30  ALL limited_view  +  P-WC1..P-WC4 (4 wheelchair spaces)
--
-- Totals (build-time assertion below): premium 66, general 280,
-- limited_view 157 (153 standard + 4 wheelchair), accessible 4 → 503 total.
--
-- DEPLOYMENT: this migration must be applied to the HOSTED Supabase project
-- (`supabase db push`, or paste into the SQL editor) — living in the repo is NOT
-- enough. It does not touch Vercel.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Add the zone column. Default 'general' keeps any row inserted before the
--    reseed valid; the reseed below sets every seat's zone explicitly.
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
