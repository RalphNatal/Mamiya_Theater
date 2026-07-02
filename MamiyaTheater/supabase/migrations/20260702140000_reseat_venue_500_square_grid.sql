-- ─────────────────────────────────────────────────────────────────────────
-- RESEAT THE HOUSE: fan blueprint → 500-seat square grid (A–T × 25)
--
-- The seat picker was reverted from the segmented Left/Center/Right blueprint
-- (whose variable-width rows collapsed the web flex layout) to a simple, stable
-- 20×25 rectangle defined in src/config/theaterLayout.ts. This realigns the
-- master seat map so identifiers ("A-1".."T-25") match seatId() again.
--
-- Still 500 seats, so the capacity guards set in
-- 20260702130000_reseat_venue_500_mamiya_blueprint.sql are unchanged.
--
-- Non-destructive to sales: booking_seats.seat_number is free text with no FK
-- to venue_seats, so historical bookings keep their labels. Any accessible/
-- blocked flags an admin set on the previous (U-*, variable-count) layout are
-- cleared because those seats no longer exist under the new numbering — admins
-- re-flag accessible seats from the Seat Map tab.
-- ─────────────────────────────────────────────────────────────────────────

-- Clear the previous fan blueprint in full. Every prior identifier is dashed
-- ("A-1".."U-16"), so a targeted LIKE won't catch them — wipe and reseed.
DELETE FROM public.venue_seats;

-- Seed the 20×25 = 500-seat square grid. Identifier is "<row>-<col>" to match
-- seatId(row, num); every row A–T has seats 1–25. Idempotent via the unique
-- seat_identifier.
INSERT INTO public.venue_seats (seat_identifier, row_label, col_number)
SELECT r || '-' || c::text, r, c
FROM unnest(ARRAY[
  'A','B','C','D','E','F','G','H','I','J',
  'K','L','M','N','O','P','Q','R','S','T'
]) AS r,
     generate_series(1, 25) AS c
ON CONFLICT (seat_identifier) DO NOTHING;
