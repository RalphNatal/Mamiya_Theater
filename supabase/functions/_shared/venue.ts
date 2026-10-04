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
// >>> FEE BLOCK BEGIN — byte-identical in src/config/venue.ts and
//     supabase/functions/_shared/venue.ts (__tests__/fees.test.ts enforces it).
//
// Every PRICED ticket (face price > $0) carries these fees ON TOP of its face
// price, PER TICKET. A $0 seat (comp / free zone / 'free' promo code) carries
// NO fee of any kind, even inside an otherwise-paid order, so an all-$0 order
// stays $0. Walk-up box-office sales pay no online fees.
//
//   • restoration    — pass-through to the theatre restoration fund
//   • beautification — pass-through to the beautification fund (replaced the
//                      old school fee and the old theatre/ticketing fee)
//   • platform       — CALLED Presentations' platform fee
//
// Two calc types:
//   • 'flat_per_ticket' — `amount` dollars per priced ticket
//   • 'percent'         — `amount` % of each priced ticket's face price,
//                         rounded to the cent PER TICKET
//
// ⚠ CONFIRM (stakeholder) — placeholders until answered:
//   (a) beautification: amount AND type (flat or %). $0 until confirmed, so it
//       charges nothing and shows no line.
//   (b) platform: the fee exists (confirmed); its amount is unconfirmed — the
//       old $0.75 ticketing rate is kept.
//
// Server-authoritative: create_pending_booking prices from public.ticket_fees
// (same values) via compute_ticket_fees() and snapshots the resolved lines on
// the booking (fee_breakdown / fees_total). stripe-create-checkout itemizes
// from that snapshot; the verify/capture guards compare against total_price.
//
// ⚠️  TO CHANGE A FEE, edit ALL THREE, one line each:
//     1. FEES below in src/config/venue.ts
//     2. FEES below in supabase/functions/_shared/venue.ts (byte-identical)
//     3. the DB: update public.ticket_fees set fee_type = 'percent', amount = 5 where key = 'beautification';
export type FeeType = 'flat_per_ticket' | 'percent';
export type TicketFee = { key: string; label: string; type: FeeType; amount: number };
export const FEES: ReadonlyArray<TicketFee> = [
  { key: 'restoration',    label: 'Restoration fee',    type: 'flat_per_ticket', amount: 2.75 },
  { key: 'beautification', label: 'Beautification fee', type: 'flat_per_ticket', amount: 0 },    // ⚠ CONFIRM amount + type
  { key: 'platform',       label: 'Platform fee',       type: 'flat_per_ticket', amount: 0.75 }, // ⚠ CONFIRM amount
];

// Money math in integer cents so 2.75 × 3 never drifts to 8.2499999.
function toCents(usd: number): number {
  return Math.round(usd * 100);
}

// One fee on ONE ticket of face price `price`, in cents. 0 for a $0 ticket.
// Percent: half-up rounding of price × pct / 100 to the cent, done on integers
// (price cents × pct hundredths) so it equals SQL round(price * pct / 100, 2).
function feeCentsForTicket(fee: TicketFee, price: number): number {
  if (!(price > 0)) return 0;
  if (fee.type === 'percent') {
    const scaled = toCents(price) * Math.round(fee.amount * 100); // cents × 10000
    return Math.floor((scaled + 5000) / 10000);
  }
  return toCents(fee.amount);
}

// How many tickets in an order carry fees: the ones priced above $0.
export function pricedTicketCount(ticketPrices: ReadonlyArray<number>): number {
  return ticketPrices.filter(p => p > 0).length;
}

// Each fee's line for an order, from every ticket's face price (the checkout
// summary lines, and exactly what compute_ticket_fees() snapshots).
export function feeTotals(
  ticketPrices: ReadonlyArray<number>,
  fees: ReadonlyArray<TicketFee> = FEES,
): Array<TicketFee & { tickets: number; total: number }> {
  return fees.map(f => ({
    ...f,
    tickets: pricedTicketCount(ticketPrices),
    total: ticketPrices.reduce((sum, p) => sum + feeCentsForTicket(f, p), 0) / 100,
  }));
}

// Σ face prices + Σ fees → the total actually charged (= bookings.total_price).
export function withFees(
  ticketPrices: ReadonlyArray<number>,
  fees: ReadonlyArray<TicketFee> = FEES,
): number {
  const faceCents = ticketPrices.reduce((sum, p) => sum + toCents(p), 0);
  const feeCents = fees.reduce(
    (sum, f) => sum + ticketPrices.reduce((s, p) => s + feeCentsForTicket(f, p), 0),
    0,
  );
  return (faceCents + feeCents) / 100;
}

// Fees on ONE priced ticket of face price `price` (e.g. 3.50 for $2.75 + $0.75).
export function perTicketFeesTotal(price: number, fees: ReadonlyArray<TicketFee> = FEES): number {
  return fees.reduce((sum, f) => sum + feeCentsForTicket(f, price), 0) / 100;
}
// <<< FEE BLOCK END

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
