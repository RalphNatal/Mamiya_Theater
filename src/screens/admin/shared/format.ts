// Money / integer / date-input formatting helpers shared across sections.
import { VENUE_TIMEZONE } from '../../../config/venue';

// ── Showtime wall-clock time is the VENUE's (Honolulu), never the browser's ──
// An admin editing from another timezone must still put a 7:30 PM show at
// 7:30 PM in Honolulu, on the right calendar day. All three helpers go through
// Intl with timeZone: VENUE_TIMEZONE, so they're independent of the machine.

const venueParts = (ms: number) => {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: VENUE_TIMEZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
};
const pad = (n: number) => String(n).padStart(2, '0');

// Venue calendar day of an instant: "2026-11-06".
export const toDateValue = (iso: string) => {
  const v = venueParts(new Date(iso).getTime());
  return `${v.y}-${pad(v.mo)}-${pad(v.d)}`;
};
// Venue wall-clock time of an instant: "19:30".
export const toTimeValue = (iso: string) => {
  const v = venueParts(new Date(iso).getTime());
  return `${pad(v.h)}:${pad(v.mi)}`;
};

// Venue wall-clock "2026-11-06" + "19:30" → the UTC instant (ISO string).
// Two-pass offset lookup so it would also be right across a DST change
// (Honolulu has none, but VENUE_TIMEZONE is configurable).
export const venueWallTimeToIso = (date: string, time: string): string => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    const v = venueParts(ms);
    return Date.UTC(v.y, v.mo - 1, v.d, v.h, v.mi, v.s) - Math.floor(ms / 1000) * 1000;
  };
  let ts = wall - offsetAt(wall);
  ts = wall - offsetAt(ts);
  return new Date(ts).toISOString();
};

// Date-ONLY values (productions.opening_night / closing_night) are saved as
// "YYYY-MM-DD", which a timestamptz column stores as UTC midnight. Read them
// back as that UTC date — never through a timezone, which would show the day
// before in Honolulu.
export const runDateValue = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export const formatMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatInt = (n: number) => n.toLocaleString();
