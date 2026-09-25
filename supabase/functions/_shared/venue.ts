// ─────────────────────────────────────────────────────────────────────────
// VENUE CONFIG (Edge Functions / Deno).
//
// Single source of truth for the venue's identity: its names, street address,
// seating capacity, public contact details, the timezone its showtimes are
// DISPLAYED in, currency, support inbox, marketing taglines, the footer
// copyright line, and the customer-facing booking reference format — on the
// SERVER side.
//
// ⚠️  KEEP IN SYNC with src/config/venue.ts. The browser bundle cannot import
//     from this supabase/functions tree (and Deno here can't import from src/),
//     so the same keys/values are mirrored in both files by hand. Change one →
//     change the other.
// ─────────────────────────────────────────────────────────────────────────

// ── Names ──────────────────────────────────────────────────────────────────
// Two forms, used in different places and NOT interchangeable:
//   • VENUE_LEGAL_NAME — the full/legal name ("...Theatre").
//   • VENUE_SHORT_NAME — the brand short form ("...Theater"): email subject,
//     header, and footer.
export const VENUE_LEGAL_NAME = "Dr. Richard T. Mamiya Theatre";
export const VENUE_SHORT_NAME = "Mamiya Theater";

// ── Capacity ────────────────────────────────────────────────────────────────
export const VENUE_CAPACITY = 500;

// ── Address ─────────────────────────────────────────────────────────────────
export const VENUE_ADDRESS = {
  street: "3142 Waialae Avenue",
  city: "Honolulu",
  state: "HI",
  zip: "96816-1579",
} as const;

// Single-line postal form, e.g. "3142 Waialae Avenue, Honolulu, HI 96816-1579".
export function formatVenueAddress(): string {
  return `${VENUE_ADDRESS.street}, ${VENUE_ADDRESS.city}, ${VENUE_ADDRESS.state} ${VENUE_ADDRESS.zip}`;
}

// ── Contact ─────────────────────────────────────────────────────────────────
export const GENERAL_PHONE = "(808) 739-4886";
export const GENERAL_FAX = "(808) 739-4821";
export const RENTALS_CONTACT_NAME = "Kainoa Jarrett";
export const RENTALS_PHONE = "(808) 330-8039";

// Showtimes are stored as `timestamptz` and DISPLAYED in this zone for every
// recipient, regardless of the sender's/server's own timezone. Honolulu does
// not observe DST, so this is a stable UTC−10 (HST) year-round.
export const VENUE_TIMEZONE = "Pacific/Honolulu";

export const VENUE_CURRENCY = "USD";
export const VENUE_CURRENCY_SYMBOL = "$";

// ── Pricing: per-TICKET additional fees ───────────────────────────────────
// Every PRICED online ticket (face price > $0) carries these fees ON TOP of
// its face price. They are PER TICKET, not per booking, and a $0 seat (comp /
// free zone) never carries them — even in an otherwise-paid order — so an
// all-$0 order stays $0. Walk-up box-office sales pay no online fees
// (create_box_office_booking is unchanged).
//
//   • beautification — pass-through to the theater beautification fund
//   • school         — pass-through to the school
//   • ticketing      — the platform/ticketing fee (the old $0.75 "service fee")
//
// Server-authoritative: the pending-booking RPC prices the order from the
// public.ticket_fees table (seeded with these same values) and snapshots each
// bucket onto the booking (beautification_total / school_total /
// ticketing_fee_total); stripe-create-checkout itemizes from that snapshot (so
// its line items sum to total_price to the cent), and the verify/capture guards
// compare against total_price. This array is the documented rate card and the
// label source for Stripe's receipt lines.
//
// ⚠️  TO CHANGE A RATE OR ADD A RECIPIENT, edit ALL THREE, one line each:
//     1. this array          2. the client mirror (src/config/venue.ts)
//     3. the DB:  update public.ticket_fees set usd = 0.75 where key = 'school';
export type FeeKey = "beautification" | "school" | "ticketing";
export type TicketFee = { key: FeeKey; label: string; usd: number };
export const FEES: ReadonlyArray<TicketFee> = [
  { key: "beautification", label: "Beautification fee", usd: 0.75 },
  { key: "school", label: "School fee", usd: 0.75 },
  { key: "ticketing", label: "Ticketing fee", usd: 0.75 },
];

// Money math in integer cents so 0.75 × 3 never drifts to 2.2499999.
function cents(usd: number): number {
  return Math.round(usd * 100);
}
function fromCents(c: number): number {
  return c / 100;
}

// Sum of all per-ticket fees for ONE ticket (e.g. 2.25).
export function perTicketFeesTotal(fees: ReadonlyArray<TicketFee> = FEES): number {
  return fromCents(fees.reduce((sum, f) => sum + cents(f.usd), 0));
}

// How many tickets in an order carry the fees: the seats whose face price is
// above $0. Mirrors count_priced_seats() in create_pending_booking.
export function pricedTicketCount(seatPrices: ReadonlyArray<number>): number {
  return seatPrices.filter((p) => p > 0).length;
}

// Each fee bucket's total for `pricedTickets` fee-bearing tickets.
export function feeTotals(
  pricedTickets: number,
  fees: ReadonlyArray<TicketFee> = FEES,
): Array<TicketFee & { total: number }> {
  return fees.map((f) => ({ ...f, total: fromCents(cents(f.usd) * pricedTickets) }));
}

// subtotal (Σ seat face prices) + per-ticket fees × PRICED tickets → the total
// actually charged. Pass pricedTicketCount(seat prices), never the seat count:
// a $0 seat adds no fees, so an all-$0 order stays $0.
export function withFees(
  subtotal: number,
  pricedTickets: number,
  fees: ReadonlyArray<TicketFee> = FEES,
): number {
  return fromCents(cents(subtotal) + cents(perTicketFeesTotal(fees)) * pricedTickets);
}

// The venue's public inbox — used for booking/support and as the contact-form
// notify address (they're the same mailbox today, so GENERAL_EMAIL is an alias
// rather than a second literal).
export const SUPPORT_EMAIL = "mamiya@saintlouishawaii.org";
export const GENERAL_EMAIL = SUPPORT_EMAIL;

// ── Marketing ───────────────────────────────────────────────────────────────
export const VENUE_TAGLINE =
  "Your premier destination for professional theater tickets. Experience the magic of live performance.";
export const VENUE_TAGLINE_SHORT =
  "Your premier destination for professional theater tickets.";

// ── Copyright ───────────────────────────────────────────────────────────────
export const COPYRIGHT_YEAR = 2026;

// Footer line, e.g. "© 2026 Mamiya Theater. All rights reserved."
export function copyrightLine(): string {
  return `© ${COPYRIGHT_YEAR} ${VENUE_SHORT_NAME}. All rights reserved.`;
}

// Customer-facing booking reference, e.g. "MT-1A2B3C4D".
// MUST stay byte-for-byte identical to shortRef() in the client mirror
// (src/config/venue.ts) so the reference in the confirmation email matches the
// one printed on the confirmation screen.
export function shortRef(id: string): string {
  return "MT-" + id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
