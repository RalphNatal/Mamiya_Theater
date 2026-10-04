/**
 * Two shows on the same day (e.g. 2:00 PM matinee + 7:30 PM evening) hold
 * SEPARATE inventory — seats are keyed by showtime_id (verified on PGlite: the
 * same seat sold to both shows; per-show earnings stay separate). These tests pin
 * the UI side: day pickers, the admin editor's venue-time handling and the run
 * reconcile never merge or drop one of two same-day performances.
 *
 * All helpers go through Intl with timeZone: VENUE_TIMEZONE, so the results are
 * the same on any machine (the admin may be outside Hawaii).
 *
 * @format
 */

import { groupByVenueDay, venueDayKey } from '../src/lib/showtimeDays';
import { toDateValue, toTimeValue, venueWallTimeToIso, runDateValue } from '../src/screens/admin/shared/format';
import { validateStartFields } from '../src/screens/admin/shared/validators';
import { planReconcile } from '../src/screens/admin/sections/ProductionsSection';
import { sameDayCount, type ShowtimeRow } from '../src/screens/admin/sections/ShowtimesSection';

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

const MATINEE = '2026-11-07T00:00:00.000Z';   // Fri Nov 6, 2:00 PM HST
const EVENING = '2026-11-07T05:30:00.000Z';   // Fri Nov 6, 7:30 PM HST (already Nov 7 in UTC)
const NEXT = '2026-11-08T05:30:00.000Z';      // Sat Nov 7, 7:30 PM HST

test('venue wall-clock time ↔ UTC instant, independent of the browser timezone', () => {
  expect(venueWallTimeToIso('2026-11-06', '14:00')).toBe(MATINEE);
  expect(venueWallTimeToIso('2026-11-06', '19:30')).toBe(EVENING);
  expect(toDateValue(EVENING)).toBe('2026-11-06');   // not Nov 7 (UTC) or Nov 7 (Manila)
  expect(toTimeValue(EVENING)).toBe('19:30');
  expect(toTimeValue(MATINEE)).toBe('14:00');
  expect(toTimeValue(venueWallTimeToIso('2026-11-06', '00:05'))).toBe('00:05');
  for (const t of ['09:00', '13:15', '19:30', '23:59']) {
    expect(toTimeValue(venueWallTimeToIso('2027-03-14', t))).toBe(t);
    expect(toDateValue(venueWallTimeToIso('2027-03-14', t))).toBe('2027-03-14');
  }
});

test('run dates (date-only, stored at UTC midnight) read back as the same date', () => {
  expect(runDateValue('2026-11-06T00:00:00+00:00')).toBe('2026-11-06');
});

test('public picker: one date chip for the day, two separate time slots in curtain order', () => {
  const { days, byDay } = groupByVenueDay([
    { id: 'eve', start_time: EVENING },
    { id: 'next', start_time: NEXT },
    { id: 'mat', start_time: MATINEE },
  ]);
  expect(days).toEqual(['2026-11-06', '2026-11-07']);
  expect(byDay['2026-11-06'].map(s => s.id)).toEqual(['mat', 'eve']);
  expect(byDay['2026-11-07'].map(s => s.id)).toEqual(['next']);
  expect(venueDayKey(EVENING)).toBe('2026-11-06');
});

test('admin list labels same-day performances instead of merging them', () => {
  const rows = [
    { id: 'mat', start_time: MATINEE }, { id: 'eve', start_time: EVENING }, { id: 'next', start_time: NEXT },
  ] as ShowtimeRow[];
  expect(rows.map(r => sameDayCount(rows, r))).toEqual([2, 2, 1]);
});

test('run reconcile keeps BOTH shows on a day, adds only new days, removes whole days outside the run', () => {
  const existing = [{ id: 'mat', start_time: MATINEE }, { id: 'eve', start_time: EVENING }, { id: 'next', start_time: NEXT }];
  // Extend the run by one day: only Nov 8 is added (at 7:30 PM venue time), nothing deleted.
  expect(planReconcile(existing, '2026-11-06', '2026-11-08', '19:30')).toEqual({
    addStartTimes: [venueWallTimeToIso('2026-11-08', '19:30')],
    deleteIds: [],
  });
  // Unchanged run: no churn even though the evening show is "Nov 7" in UTC.
  expect(planReconcile(existing, '2026-11-06', '2026-11-07', '19:30')).toEqual({ addStartTimes: [], deleteIds: [] });
  // Drop Nov 6 from the run: both of that day's performances go, Nov 7 stays.
  expect(planReconcile(existing, '2026-11-07', '2026-11-07', '19:30').deleteIds).toEqual(['mat', 'eve']);
});

test('the editor\'s "must be in the future" check uses venue time', () => {
  expect(validateStartFields('2000-01-01', '19:30')).toBe('Start time must be in the future.');
  expect(validateStartFields('2999-01-01', '19:30')).toBeNull();
  expect(validateStartFields('2999-01-01', '')).toBe('Date and time are both required.');
  expect(validateStartFields('nope', '19:30')).toBe('Please enter a valid date & time.');
});
