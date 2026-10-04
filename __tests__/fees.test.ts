/**
 * Per-ticket fee math: the client summary, the Deno functions mirror, and the
 * SQL rule (compute_ticket_fees) must agree to the cent. This pins the two TS
 * mirrors to each other — byte-identical FEE BLOCK — and to the documented
 * model. The SQL side was checked against these same helpers on PGlite
 * (see supabase/migrations/20261004120000_*.sql). Fees are charged on PRICED
 * tickets only: a $0 ticket adds none, even inside an otherwise-paid order.
 *
 * @format
 */

import fs from 'fs';
import path from 'path';
import * as client from '../src/config/venue';
// The Deno mirror is plain TS with no Deno-only syntax, so babel-jest can load it.
import * as fn from '../supabase/functions/_shared/venue';

const feeBlock = (file: string): string => {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
  const a = src.indexOf('// >>> FEE BLOCK BEGIN');
  const b = src.indexOf('// <<< FEE BLOCK END');
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

const pct = (key: string, amount: number) =>
  client.FEES.map(f => (f.key === key ? { ...f, type: 'percent' as const, amount } : f));

describe('per-ticket fees', () => {
  test('the FEE BLOCK is byte-identical in both venue.ts mirrors', () => {
    expect(feeBlock('supabase/functions/_shared/venue.ts')).toBe(feeBlock('src/config/venue.ts'));
    expect(fn.FEES).toEqual(client.FEES);
  });

  test('model: restoration $2.75 + beautification (⚠ CONFIRM, $0) + platform (⚠ CONFIRM, $0.75)', () => {
    expect(client.FEES.map(f => f.key)).toEqual(['restoration', 'beautification', 'platform']);
    expect(client.FEES.map(f => f.type)).toEqual(['flat_per_ticket', 'flat_per_ticket', 'flat_per_ticket']);
    expect(client.FEES.find(f => f.key === 'restoration')?.amount).toBe(2.75);
    expect(client.FEES.some(f => ['school', 'ticketing'].includes(f.key))).toBe(false);
    expect(client.perTicketFeesTotal(20)).toBe(3.5);
  });

  test('2 × $25 tickets: lines and total', () => {
    const lines = client.feeTotals([25, 25]);
    expect(lines.map(l => [l.key, l.tickets, l.total])).toEqual([
      ['restoration', 2, 5.5], ['beautification', 2, 0], ['platform', 2, 1.5],
    ]);
    expect(client.withFees([25, 25])).toBe(57);
    expect(fn.withFees([25, 25])).toBe(57);
  });

  test('integer-cent math: no float drift for awkward prices / counts', () => {
    expect(client.withFees([37.25, 37.25, 20])).toBe(105);
    expect(client.withFees([0.1, 0.2])).toBe(7.3);
    for (let n = 1; n <= 40; n++) {
      const total = client.withFees(Array(n).fill(19.99));
      expect(Math.round(total * 100) / 100).toBe(total);
      expect(total).toBe(Math.round(n * (1999 + 350)) / 100);
    }
  });

  test('a $0 ticket adds no fee of any kind: $20 + $0 + $35 → 55 + 2 × 3.50 = 62', () => {
    const prices = [20, 0, 35];
    expect(client.pricedTicketCount(prices)).toBe(2);
    expect(client.withFees(prices)).toBe(62);
    expect(fn.withFees(prices)).toBe(62);
    expect(client.feeTotals(prices).map(l => l.total)).toEqual([5.5, 0, 1.5]);
    // …also for percent fees
    expect(client.withFees(prices, pct('beautification', 10))).toBe(67.5);
  });

  test('an all-$0 (free event / comp / free code) order stays $0 with no fee lines', () => {
    expect(client.withFees([0, 0, 0])).toBe(0);
    expect(fn.withFees([0, 0, 0])).toBe(0);
    expect(client.feeTotals([0, 0]).filter(l => l.total > 0)).toEqual([]);
    expect(client.withFees([0], pct('beautification', 50))).toBe(0);
  });

  test('percent fees round half-up to the cent PER TICKET (= SQL round(p * pct / 100, 2))', () => {
    const fees = pct('beautification', 5);
    // 19.99 × 5% = 0.9995 → 1.00 ; 20 × 5% = 1.00
    expect(client.feeTotals([19.99, 20], fees)[1].total).toBe(2);
    // Per-ticket rounding, not on the sum: 3 × (0.10 × 5% = 0.005 → 0.01) = 0.03
    expect(client.feeTotals([0.1, 0.1, 0.1], fees)[1].total).toBe(0.03);
    expect(client.feeTotals([12.5], pct('beautification', 2.5))[1].total).toBe(0.31);
    expect(fn.feeTotals([19.99, 20], fees)).toEqual(client.feeTotals([19.99, 20], fees));
  });

  test('a fee change is a one-line edit that flows through the helpers', () => {
    const custom = client.FEES.map(f => (f.key === 'platform' ? { ...f, amount: 1 } : f));
    expect(client.perTicketFeesTotal(25, custom)).toBe(3.75);
    expect(client.withFees([25], custom)).toBe(28.75);
    expect(client.feeTotals([25, 25], custom).find(f => f.key === 'platform')?.total).toBe(2);
  });
});
