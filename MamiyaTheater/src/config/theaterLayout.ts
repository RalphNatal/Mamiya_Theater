// ── Dr. Richard T. Mamiya Theatre — 500-seat square grid ───────────────────
//
// A deliberately simple, rock-solid rectangular house: 20 rows (A–T) × 25
// seats (1–25) = 500 seats. No Left/Center/Right sections, no aisle spacers —
// every row is identical, so the UI renders a perfect rectangle the user can
// pan across horizontally. This replaced an earlier segmented/aisle blueprint
// whose variable-width rows collapsed the web flex layout.
//
// IMPORTANT: the seat `id`s produced here are the canonical seat identifiers.
// They must line up with `venue_seats.seat_identifier` (and the
// `booking_seats.seat_number` written at checkout) in Supabase, otherwise the
// availability / accessibility overlays won't match.

export type SeatStatus = 'available' | 'blocked' | 'broken';

export type Seat = {
  id: string;          // canonical identifier, e.g. 'A-1'
  row: string;         // 'A'..'T'
  seatNumber: number;  // 1..25
  status: SeatStatus;  // venue-level default; live state is overlaid in the UI
};

export type SeatRow = {
  rowId: string;   // 'A'..'T'
  seats: Seat[];
};

export const GRID_ROWS = 20;      // A..T
export const SEATS_PER_ROW = 25;  // 1..25

// Canonical id builder — the ONE place the seat-identifier format is decided,
// so it can be matched against the DB in exactly one spot. Keep in sync with
// however `venue_seats.seat_identifier` is seeded.
export const seatId = (row: string, num: number): string => `${row}-${num}`;

// Row letters A..T (65 = 'A').
const ROW_IDS: string[] = Array.from({ length: GRID_ROWS }, (_, i) =>
  String.fromCharCode(65 + i),
);

// ── Generator ──────────────────────────────────────────────────────────────
// Straightforward nested loop: 20 rows, each holding 25 seats numbered 1–25.
export function generateSquareSeatGrid(): SeatRow[] {
  return ROW_IDS.map(rowId => ({
    rowId,
    seats: Array.from({ length: SEATS_PER_ROW }, (_, i) => {
      const seatNumber = i + 1;
      return {
        id: seatId(rowId, seatNumber),
        row: rowId,
        seatNumber,
        status: 'available' as SeatStatus,
      };
    }),
  }));
}

// Precomputed once at module load — the grid is static.
export const theaterSeatGrid: SeatRow[] = generateSquareSeatGrid();

// Flat list of every seat — handy for counts / seeding.
export const allSeats: Seat[] = theaterSeatGrid.flatMap(r => r.seats);

export const TOTAL_SEATS = allSeats.length;
