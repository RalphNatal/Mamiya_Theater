/**
 * Per-ticket fee math (item 3): the client summary, the Deno functions mirror,
 * and the SQL RPC must agree to the cent. This pins the two TS mirrors to each
 * other and to the documented model; the RPC side is exercised by the
 * migration's own scenario (see supabase/migrations/20260920130000_*.sql).
 *
 * @format
 */

import * as client from '../src/config/venue';
// The Deno mirror is plain TS with no Deno-only syntax, so babel-jest can load it.
import * as fn from '../supabase/functions/_shared/venue';

describe('per-ticket fees', () => {
  test('both venue.ts mirrors carry the same rate card', () => {
    expect(fn.FEES).toEqual(client.FEES);
    expect(fn.perTicketFeesTotal()).toBe(client.perTicketFeesTotal());
  });

  test('default model: beautification + school + ticketing = $2.25 per ticket', () => {
    expect(client.FEES.map(f => f.key)).toEqual(['beautification', 'school', 'ticketing']);
    expect(client.perTicketFeesTotal()).toBe(2.25);
  });

  test('2 tickets add exactly $4.50; buckets are $1.50 each (acceptance)', () => {
    const lines = client.feeTotals(2);
    expect(lines.map(l => l.total)).toEqual([1.5, 1.5, 1.5]);
    expect(lines.reduce((s, l) => s + l.total, 0)).toBe(4.5);
    expect(client.withFees(50, 2)).toBe(54.5);
    expect(fn.withFees(50, 2)).toBe(54.5);
  });

  test('integer-cent math: no float drift for awkward subtotals / counts', () => {
    // 3 × 2.25 = 6.75 exactly (naive float 0.75*3 = 2.25 but 0.1-style drift is
    // the classic failure); zone-priced $37.25 × 2 + $25 face.
    expect(client.withFees(99.5, 3)).toBe(106.25);
    expect(client.withFees(0.1 + 0.2, 7)).toBe(16.05); // 0.30 + 7 × 2.25
    for (let n = 1; n <= 40; n++) {
      const total = client.withFees(19.99 * n, n);
      // Must be representable in whole cents.
      expect(Math.round(total * 100) / 100).toBe(total);
    }
  });

  test('a $0 comp stays $0 with no fee lines', () => {
    expect(client.withFees(0, 3)).toBe(0);
    expect(fn.withFees(0, 3)).toBe(0);
  });

  test('a rate change is a one-line edit that flows through the helpers', () => {
    const custom = client.FEES.map(f => (f.key === 'school' ? { ...f, usd: 1 } : f));
    expect(client.perTicketFeesTotal(custom)).toBe(2.5);
    expect(client.withFees(25, 1, custom)).toBe(27.5);
    expect(client.feeTotals(2, custom).find(f => f.key === 'school')?.total).toBe(2);
  });
});
