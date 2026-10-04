// Group showtimes by the VENUE's calendar day (Honolulu), each day's
// performances in curtain-time order. Two shows on one date — a matinee and an
// evening — are two entries under the same day, never merged: each keeps its own
// id, and seat inventory is keyed by showtime id, so they sell independently.

import { VENUE_TIMEZONE } from '../config/venue';

// "2026-11-06" — the venue-local date of an instant.
export const venueDayKey = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: VENUE_TIMEZONE });

export const groupByVenueDay = <T extends { id: string; start_time: string }>(
  showtimes: ReadonlyArray<T>,
): { days: string[]; byDay: Record<string, T[]> } => {
  const byDay: Record<string, T[]> = {};
  for (const st of showtimes) (byDay[venueDayKey(st.start_time)] ??= []).push(st);
  for (const k of Object.keys(byDay)) {
    byDay[k].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }
  return { days: Object.keys(byDay).sort(), byDay };
};
