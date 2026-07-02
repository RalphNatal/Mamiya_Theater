-- ─────────────────────────────────────────────────────────────────────────
-- RESEAT THE HOUSE: 100-seat A–J×10 grid → 500-seat Mamiya blueprint
--
-- The public seat picker no longer renders a plain 10×10 grid; it renders the
-- three-block (Left / Center / Right) 500-seat layout defined in
-- src/config/theaterLayout.ts. This migration brings the database in line:
--
--   1. Reseed venue_seats to the new blueprint (500 seats, dashed identifiers
--      "A-1".."U-16" matching seatId() in the frontend), flagging ADA seats.
--   2. Grow the capacity guards from the old 100-seat house to 500.
--
-- Nothing destructive to sales: booking_seats.seat_number is free text with no
-- FK to venue_seats, so historical bookings keep their seat labels untouched;
-- we only swap out the *master seat map* and lift the capacity ceilings.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. venue_seats ────────────────────────────────────────────────────────────
-- Drop the old grid. The previous seed used dashless identifiers ("A1".."J10");
-- every new identifier carries a dash ("A-1"), so this cleanly removes only the
-- legacy 100-seat house and is safe to re-run.
DELETE FROM public.venue_seats WHERE seat_identifier NOT LIKE '%-%';

-- Seed the 500-seat blueprint. Per-row totals are left+center+right from
-- theaterLayoutConfig; seats are numbered continuously L→R (col_number), and
-- the identifier is "<row>-<col>" to match seatId(row, num). Idempotent via the
-- unique seat_identifier.
INSERT INTO public.venue_seats (seat_identifier, row_label, col_number)
SELECT layout.row_label || '-' || c::text, layout.row_label, c
FROM (VALUES
  ('A', 18), ('B', 18), ('C', 20), ('D', 22), ('E', 22),
  ('F', 24), ('G', 24), ('H', 26), ('I', 26), ('J', 26),
  ('K', 26), ('L', 26), ('M', 28), ('N', 28), ('O', 28),
  ('P', 28), ('Q', 28), ('R', 24), ('S', 24), ('T', 18),
  ('U', 16)
) AS layout(row_label, seats)
CROSS JOIN LATERAL generate_series(1, layout.seats) AS c
ON CONFLICT (seat_identifier) DO NOTHING;

-- Wheelchair-accessible (ADA) seats: aisle/wall ends of the rear rows, matching
-- the `ada` lists in theaterLayoutConfig.
UPDATE public.venue_seats
SET is_accessible = true
WHERE seat_identifier IN (
  'R-1', 'R-2', 'R-23', 'R-24',
  'S-1', 'S-2', 'S-23', 'S-24',
  'U-1', 'U-2', 'U-15', 'U-16'
);

-- 2. Capacity guards: 100-seat house → 500 ──────────────────────────────────
-- New defaults so freshly-created productions/showtimes assume the full house.
ALTER TABLE public.productions ALTER COLUMN total_tickets_capacity SET DEFAULT 500;
ALTER TABLE public.showtimes   ALTER COLUMN available_seats        SET DEFAULT 500;

-- Grow existing showtimes' remaining counter by the +400 capacity delta BEFORE
-- bumping the production cap (so we can still key off the old value of 100).
-- Adding the delta preserves each showtime's already-sold decrements rather
-- than clobbering them. Only productions still at the old 100-seat house are
-- touched; any intentionally custom-capped show is left alone for an admin to
-- adjust.
UPDATE public.showtimes s
SET available_seats = available_seats + 400
FROM public.productions p
WHERE s.production_id = p.id
  AND p.total_tickets_capacity = 100;

UPDATE public.productions
SET total_tickets_capacity = 500
WHERE total_tickets_capacity = 100;
