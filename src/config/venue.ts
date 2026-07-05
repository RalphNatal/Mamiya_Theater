// ─────────────────────────────────────────────────────────────────────────
// VENUE CONFIG (client / browser bundle).
//
// Single source of truth for the venue's name, the timezone its showtimes are
// DISPLAYED in, currency, support inbox, and the customer-facing booking
// reference format.
//
// ⚠️  KEEP IN SYNC with supabase/functions/_shared/venue.ts. The Edge Functions
//     run on Deno and cannot import from this src/ tree (and the browser bundle
//     can't import from supabase/functions), so the same values are mirrored in
//     both files by hand. Change one → change the other.
// ─────────────────────────────────────────────────────────────────────────

export const VENUE_NAME = 'Dr. Richard T. Mamiya Theatre';

// Showtimes are stored as `timestamptz` and DISPLAYED in this zone for every
// viewer, regardless of their own browser/OS timezone. Honolulu does not
// observe DST, so this is a stable UTC−10 (HST) year-round.
export const VENUE_TIMEZONE = 'Pacific/Honolulu';

export const VENUE_CURRENCY = 'USD';
export const VENUE_CURRENCY_SYMBOL = '$';
export const SUPPORT_EMAIL = 'mamiya@saintlouishawaii.org';

// Customer-facing booking reference, e.g. "MT-1A2B3C4D".
// MUST stay byte-for-byte identical to shortRef() in the functions mirror
// (supabase/functions/_shared/venue.ts) so the reference printed on the
// confirmation screen matches the one in the confirmation email.
export const shortRef = (id: string): string =>
  'MT-' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
