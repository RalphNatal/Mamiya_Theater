// ── Dr. Richard T. Mamiya Theatre — the REAL seating chart ──────────────────
//
// The frontend MIRROR of the master seat map (public.venue_seats). Rows A–P in
// theatre order (there is NO row "I"), with per-row seat counts that vary from
// front to back and three price zones. The stage is at the FRONT, above row A.
//
// Zones (from the official chart):
//   premium      → yellow   — the middle of the raked rows C/D/E
//   general      → blue     — the main body, rows F–N
//   limited_view → pink     — front rows A/B, the ends of C/D/E, and rear O/P
//   + 4 wheelchair spaces at the ends of row P (accessible; limited_view)
//
// Per-row map (front → back):
//   A: 01–26  ALL limited_view
//   B: 01–29  ALL limited_view
//   C: 01–31  01–05 limited_view | 06–25 premium | 26–31 limited_view
//   D: 01–33  01–05 limited_view | 06–27 premium | 28–33 limited_view
//   E: 01–35  01–05 limited_view | 06–29 premium | 30–35 limited_view
//   F–N (F,G,H,J,K,L,M,N): 01–35  ALL general
//   O: 01–35  ALL limited_view
//   P: 01–30  ALL limited_view  +  P-WC1..P-WC4 (wheelchair, at the two ends)
//
// IMPORTANT — this file and the DB seed MUST generate BYTE-IDENTICAL identifiers.
// A seat's `id` here is the canonical identifier; it must equal
// venue_seats.seat_identifier and the booking_seats.seat_number written at
// checkout, or the availability / zone overlays silently mismatch. Both sides
// carry a build-time count assertion (see below and the reseat migration) so a
// mistake fails loudly instead of drifting. Keep PREMIUM_PINK_END in lock-step
// with the same constant in the reseat migration.

export type Zone = 'premium' | 'general' | 'limited_view';
export type SeatStatus = 'available' | 'blocked' | 'broken';

export type Seat = {
  id: string;            // canonical identifier, e.g. 'A-01', 'E-35', 'P-WC1'
  row: string;           // 'A'..'P' (no 'I')
  seatNumber: number;    // col_number in seat order (1..N; 1..4 for wheelchair)
  zone: Zone;
  isAccessible: boolean; // true only for the 4 Row-P wheelchair spaces
  status: SeatStatus;    // venue-level default; live state is overlaid in the UI
};

export type SeatRow = {
  rowId: string;   // 'A'..'P'
  seats: Seat[];
};

// ── Zone metadata — the ONE place zone labels + colours are defined, shared by
//    the seat picker AND the legend so they can never drift apart. Premium =
//    yellow, General = blue, Limited View = pink (matching the chart). The fills
//    are chosen light enough that the dark seat-number text stays readable; the
//    selected state (red) stays clearly distinct on every one of them.
export const ZONE_META: Record<Zone, { label: string; color: string; textColor: string }> = {
  premium:      { label: 'Premium',      color: '#F5C518', textColor: '#141414' },
  general:      { label: 'General',      color: '#5B9BF6', textColor: '#141414' },
  limited_view: { label: 'Limited View', color: '#F074B6', textColor: '#141414' },
};

// Front → back ordering for legends / per-zone breakdowns (premium is the
// headline tier, so it leads).
export const ZONE_ORDER: Zone[] = ['premium', 'general', 'limited_view'];

// ⚠ VERIFY-AGAINST-CHART — the ONLY soft numbers in the whole layout. On the
// premium rows C/D/E, this many seats at EACH end are limited_view (pink);
// everything between is premium. Read off the rendered chart: house-LEFT end = 5
// seats (cols 1..5), house-RIGHT end = 6 seats (the last 6 cols). If the official
// chart disagrees, THIS is the one-line edit — and it must stay identical to the
// `consts` block in the reseat migration.
export const PREMIUM_PINK_END = { left: 5, right: 6 } as const;

// Canonical id builder — the ONE place the identifier format is decided. ZERO-PADS
// the number to 2 digits ("A-01"), which also fixes lexical sorting (A-02 < A-10).
// Must produce the same string the DB seed does.
export const seatId = (row: string, num: number): string =>
  `${row}-${String(num).padStart(2, '0')}`;

// ── Row spec ────────────────────────────────────────────────────────────────
type RowKind = 'general' | 'limited' | 'premium';
type RowSpec = { row: string; count: number; kind: RowKind };

const ROW_SPECS: RowSpec[] = [
  { row: 'A', count: 26, kind: 'limited' },
  { row: 'B', count: 29, kind: 'limited' },
  { row: 'C', count: 31, kind: 'premium' },
  { row: 'D', count: 33, kind: 'premium' },
  { row: 'E', count: 35, kind: 'premium' },
  { row: 'F', count: 35, kind: 'general' },
  { row: 'G', count: 35, kind: 'general' },
  { row: 'H', count: 35, kind: 'general' },
  { row: 'J', count: 35, kind: 'general' }, // no row I
  { row: 'K', count: 35, kind: 'general' },
  { row: 'L', count: 35, kind: 'general' },
  { row: 'M', count: 35, kind: 'general' },
  { row: 'N', count: 35, kind: 'general' },
  { row: 'O', count: 35, kind: 'limited' },
  { row: 'P', count: 30, kind: 'limited' },
];

// The widest row (general rows F–N = 35) — the track width every narrower row is
// centered within, so all rows stay column-aligned instead of squishing.
export const WIDEST_ROW = Math.max(...ROW_SPECS.map(r => r.count));

// Resolve a single standard seat's zone from its row kind + column.
function zoneForSeat(kind: RowKind, col: number, count: number): Zone {
  if (kind === 'general') return 'general';
  if (kind === 'limited') return 'limited_view';
  // premium row: limited_view (pink) at both ends, premium (yellow) in the middle
  if (col <= PREMIUM_PINK_END.left || col > count - PREMIUM_PINK_END.right) {
    return 'limited_view';
  }
  return 'premium';
}

// The 4 Row-P wheelchair spaces — two at house-LEFT (before seat 01), two at
// house-RIGHT (after seat 30). Literal "P-WC1".."P-WC4" ids (match the DB seed).
const WC_SEATS: Seat[] = [1, 2, 3, 4].map(n => ({
  id: `P-WC${n}`,
  row: 'P',
  seatNumber: n,
  zone: 'limited_view' as Zone,
  isAccessible: true,
  status: 'available' as SeatStatus,
}));

// ── Generator ────────────────────────────────────────────────────────────────
export function generateMamiyaSeatGrid(): SeatRow[] {
  return ROW_SPECS.map(spec => {
    const standard: Seat[] = Array.from({ length: spec.count }, (_, i) => {
      const num = i + 1;
      return {
        id: seatId(spec.row, num),
        row: spec.row,
        seatNumber: num,
        zone: zoneForSeat(spec.kind, num, spec.count),
        isAccessible: false,
        status: 'available' as SeatStatus,
      };
    });
    if (spec.row === 'P') {
      // WC1,WC2 | P-01..P-30 | WC3,WC4  — wheelchair spaces bookend the row.
      return { rowId: 'P', seats: [WC_SEATS[0], WC_SEATS[1], ...standard, WC_SEATS[2], WC_SEATS[3]] };
    }
    return { rowId: spec.row, seats: standard };
  });
}

// Precomputed once at module load — the grid is static.
export const theaterSeatGrid: SeatRow[] = generateMamiyaSeatGrid();

// Flat list of every seat — handy for counts / lookups.
export const allSeats: Seat[] = theaterSeatGrid.flatMap(r => r.seats);

export const TOTAL_SEATS = allSeats.length;

// id → zone, so a screen that only has seat identifiers (e.g. checkout) can price
// a selection without re-fetching zones — guaranteed to match the DB by the
// build-time assertion below + the migration's own assertion.
export const seatZoneById: Map<string, Zone> = new Map(allSeats.map(s => [s.id, s.zone]));

// ── Build-time assertion ─────────────────────────────────────────────────────
// A mistake in the row spec (wrong count, a stray/duplicated seat, a bad pink-end
// boundary) fails loudly HERE instead of silently mispricing or misrendering.
// Partitions all 503 positions: premium 66 / general 280 / limited_view standard
// 153 / accessible 4. (Grouped by zone alone, limited_view is 157 = 153 + 4 WC,
// which is what the DB GROUP BY returns.)
(() => {
  let premium = 0, general = 0, limitedStandard = 0, accessible = 0;
  for (const s of allSeats) {
    if (s.isAccessible) accessible++;
    else if (s.zone === 'premium') premium++;
    else if (s.zone === 'general') general++;
    else limitedStandard++;
  }
  const total = allSeats.length;
  if (premium !== 66 || general !== 280 || limitedStandard !== 153 || accessible !== 4 || total !== 503) {
    throw new Error(
      `theaterLayout seat-count mismatch: premium=${premium}, general=${general}, ` +
      `limitedView(standard)=${limitedStandard}, accessible=${accessible}, total=${total} ` +
      `(expected 66 / 280 / 153 / 4 / 503)`,
    );
  }
})();
