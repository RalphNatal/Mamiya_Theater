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

// ── Pricing ───────────────────────────────────────────────────────────────
// Flat platform/service fee added ONCE PER BOOKING (not per ticket) to every
// paid online order. Server-authoritative and applied consistently in five
// places: the Stripe/PayPal create functions (charge), the verify/capture
// anti-tamper guards (expected amount), the booking's total_price, and the
// "Service fee" line shown here at checkout. NOT applied to $0 comps / free
// orders — a subtotal of 0 stays 0. Keep identical to the functions mirror.
export const SERVICE_FEE_USD = 0.75;

// subtotal (price × tickets) → the total actually charged. The fee applies only
// to paid orders, so a $0 subtotal stays $0.
export const withServiceFee = (subtotal: number): number =>
  subtotal > 0 ? subtotal + SERVICE_FEE_USD : subtotal;

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
