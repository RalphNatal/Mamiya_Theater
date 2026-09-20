// ─────────────────────────────────────────────────────────────────────────
// VENUE CONFIG (client / browser bundle).
//
// Single source of truth for the venue's identity: its names, street address,
// seating capacity, public contact details, the timezone its showtimes are
// DISPLAYED in, currency, support inbox, marketing taglines, the footer
// copyright line, and the customer-facing booking reference format. No screen
// or component should hard-code any of these — import from here instead.
//
// ⚠️  KEEP IN SYNC with supabase/functions/_shared/venue.ts. The Edge Functions
//     run on Deno and cannot import from this src/ tree (and the browser bundle
//     can't import from supabase/functions), so the same keys/values are
//     mirrored in both files by hand. Change one → change the other.
// ─────────────────────────────────────────────────────────────────────────

// ── Names ──────────────────────────────────────────────────────────────────
// Two forms, used in different places and NOT interchangeable:
//   • VENUE_LEGAL_NAME — the full/legal name ("...Theatre"): hero, contact
//     location block, about-us copy, legal disclaimer.
//   • VENUE_SHORT_NAME — the brand short form ("...Theater"): footers, nav bar,
//     login/signup logos, email subject/header.
export const VENUE_LEGAL_NAME = 'Dr. Richard T. Mamiya Theatre';
export const VENUE_SHORT_NAME = 'Mamiya Theater';

// ── Capacity ────────────────────────────────────────────────────────────────
export const VENUE_CAPACITY = 500;

// ── Address ─────────────────────────────────────────────────────────────────
export const VENUE_ADDRESS = {
  street: '3142 Waialae Avenue',
  city: 'Honolulu',
  state: 'HI',
  zip: '96816-1579',
} as const;

// Single-line postal form, e.g. "3142 Waialae Avenue, Honolulu, HI 96816-1579".
export const formatVenueAddress = (): string =>
  `${VENUE_ADDRESS.street}, ${VENUE_ADDRESS.city}, ${VENUE_ADDRESS.state} ${VENUE_ADDRESS.zip}`;

// ── Contact ─────────────────────────────────────────────────────────────────
export const GENERAL_PHONE = '(808) 739-4886';
export const GENERAL_FAX = '(808) 739-4821';
export const RENTALS_CONTACT_NAME = 'Kainoa Jarrett';
export const RENTALS_PHONE = '(808) 330-8039';

// Showtimes are stored as `timestamptz` and DISPLAYED in this zone for every
// viewer, regardless of their own browser/OS timezone. Honolulu does not
// observe DST, so this is a stable UTC−10 (HST) year-round.
export const VENUE_TIMEZONE = 'Pacific/Honolulu';

export const VENUE_CURRENCY = 'USD';
export const VENUE_CURRENCY_SYMBOL = '$';

// ── Pricing: per-TICKET additional fees ───────────────────────────────────
// Every paid online ticket carries these fees ON TOP of its face price. They
// are PER TICKET (× number of seats), not per booking, and are NOT applied to
// $0 comps / free orders — a $0 subtotal stays $0. Walk-up box-office sales
// pay no online fees (create_box_office_booking is unchanged).
//
//   • beautification — pass-through to the theater beautification fund
//   • school         — pass-through to the school
//   • ticketing      — the platform/ticketing fee (the old $0.75 "service fee")
//
// Server-authoritative: the pending-booking RPC prices the order from the
// public.ticket_fees table (seeded with these same values) and snapshots each
// bucket onto the booking (beautification_total / school_total /
// ticketing_fee_total); Stripe itemizes from that snapshot, and the
// verify/capture guards compare against the resulting total_price. The
// checkout summary reads ticket_fees too and uses this array only as its
// offline fallback / documentation of the agreed rates.
//
// ⚠️  TO CHANGE A RATE OR ADD A RECIPIENT, edit ALL THREE, one line each:
//     1. this array          2. the functions mirror (…/_shared/venue.ts)
//     3. the DB:  update public.ticket_fees set usd = 0.75 where key = 'school';
export type FeeKey = 'beautification' | 'school' | 'ticketing';
export type TicketFee = { key: FeeKey; label: string; usd: number };
export const FEES: ReadonlyArray<TicketFee> = [
  { key: 'beautification', label: 'Beautification fee', usd: 0.75 },
  { key: 'school',         label: 'School fee',         usd: 0.75 },
  { key: 'ticketing',      label: 'Ticketing fee',      usd: 0.75 },
];

// Money math in integer cents so 0.75 × 3 never drifts to 2.2499999.
const cents = (usd: number): number => Math.round(usd * 100);
const fromCents = (c: number): number => c / 100;

// Sum of all per-ticket fees for ONE ticket (e.g. 2.25).
export const perTicketFeesTotal = (fees: ReadonlyArray<TicketFee> = FEES): number =>
  fromCents(fees.reduce((sum, f) => sum + cents(f.usd), 0));

// Each fee bucket's total for a booking of `numTickets` (the checkout summary
// lines, and exactly what the RPC snapshots onto the booking).
export const feeTotals = (
  numTickets: number,
  fees: ReadonlyArray<TicketFee> = FEES,
): Array<TicketFee & { total: number }> =>
  fees.map(f => ({ ...f, total: fromCents(cents(f.usd) * numTickets) }));

// subtotal (Σ seat face prices) + per-ticket fees × tickets → the total actually
// charged. Fees apply only to paid orders, so a $0 subtotal stays $0.
export const withFees = (
  subtotal: number,
  numTickets: number,
  fees: ReadonlyArray<TicketFee> = FEES,
): number =>
  subtotal > 0
    ? fromCents(cents(subtotal) + cents(perTicketFeesTotal(fees)) * numTickets)
    : subtotal;

// The venue's public inbox — used for booking/support and, on the contact page,
// as the "General Inquiries" address (they're the same mailbox today, so
// GENERAL_EMAIL is an alias rather than a second literal).
export const SUPPORT_EMAIL = 'mamiya@saintlouishawaii.org';
export const GENERAL_EMAIL = SUPPORT_EMAIL;

// ── Marketing ───────────────────────────────────────────────────────────────
export const VENUE_TAGLINE =
  'Your premier destination for professional theater tickets. Experience the magic of live performance.';
export const VENUE_TAGLINE_SHORT =
  'Your premier destination for professional theater tickets.';

// ── Copyright ───────────────────────────────────────────────────────────────
export const COPYRIGHT_YEAR = 2026;

// Footer line, e.g. "© 2026 Mamiya Theater. All rights reserved."
export const copyrightLine = (): string =>
  `© ${COPYRIGHT_YEAR} ${VENUE_SHORT_NAME}. All rights reserved.`;

// Build credit shown in the footer bottom bar, beneath the copyright line.
export const BUILT_BY_LINE = 'Built by CALLED PRESENTATIONS';

// Customer-facing booking reference, e.g. "MT-1A2B3C4D".
// MUST stay byte-for-byte identical to shortRef() in the functions mirror
// (supabase/functions/_shared/venue.ts) so the reference printed on the
// confirmation screen matches the one in the confirmation email.
export const shortRef = (id: string): string =>
  'MT-' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
