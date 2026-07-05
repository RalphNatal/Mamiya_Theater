// ─────────────────────────────────────────────────────────────────────────
// VENUE CONFIG (Edge Functions / Deno).
//
// Single source of truth for the venue's name, the timezone its showtimes are
// DISPLAYED in, currency, support inbox, and the customer-facing booking
// reference format — on the SERVER side.
//
// ⚠️  KEEP IN SYNC with src/config/venue.ts. The browser bundle cannot import
//     from this supabase/functions tree (and Deno here can't import from src/),
//     so the same values are mirrored in both files by hand. Change one →
//     change the other.
// ─────────────────────────────────────────────────────────────────────────

export const VENUE_NAME = "Dr. Richard T. Mamiya Theatre";

// Showtimes are stored as `timestamptz` and DISPLAYED in this zone for every
// recipient, regardless of the sender's/server's own timezone. Honolulu does
// not observe DST, so this is a stable UTC−10 (HST) year-round.
export const VENUE_TIMEZONE = "Pacific/Honolulu";

export const VENUE_CURRENCY = "USD";
export const VENUE_CURRENCY_SYMBOL = "$";
export const SUPPORT_EMAIL = "mamiya@saintlouishawaii.org";

// Customer-facing booking reference, e.g. "MT-1A2B3C4D".
// MUST stay byte-for-byte identical to shortRef() in the client mirror
// (src/config/venue.ts) so the reference in the confirmation email matches the
// one printed on the confirmation screen.
export function shortRef(id: string): string {
  return "MT-" + id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
