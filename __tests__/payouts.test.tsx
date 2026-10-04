/**
 * Payouts panel (Overview, full admin only): Platform fee, Processing fee and
 * Theatre take-home as three separate sections, with the pass-through funds
 * (restoration, beautification…) in their own block, one line per fee key.
 *
 * The input is the exact get_revenue_breakdown row the migration chain returns
 * for this set of known test sales (verified on PGlite, 20261004120000):
 *   online  1 general $20                     → 20 + 3.50 fees = $23.50
 *   online  2 premium $37.25 + 1 general $20  → 94.50 + 3 × 3.50 = $105.00
 *   online  1 general $20 + 1 $0 seat         → 20 + 1 × 3.50 = $23.50 (no fees on the $0 seat)
 *   (+ one unpaid all-$0 reservation, excluded); Stripe fees 0.98 + 3.35 + 0.98
 * so take-home = face 134.50 − platform 3.75 − processing 5.31 = 125.44.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

import {
  PayoutBreakdownPanel, TAKE_HOME_FORMULA, toRevenueBreakdown, type RevenueBreakdown,
} from '../src/screens/admin/sections/OverviewSection';

const KNOWN_SALES: RevenueBreakdown = {
  orders: 3,
  tickets_sold: 6,
  gross_collected: 152,
  face_revenue: 134.5,
  fees_total: 17.5,
  platform_fee_total: 3.75,
  pass_through: [
    { key: 'restoration', label: 'Restoration fee', total: 13.75 },
    { key: 'beautification', label: 'Beautification fee', total: 0 },
  ],
  processing_fees: 5.31,
  fees_unrecorded: 0,
  theater_net: 125.44,
};

const rawText = (n: ReactTestInstance | string): string =>
  typeof n === 'string' ? n : n.children.map(rawText).join(' ');
const textOf = (n: ReactTestInstance) => rawText(n).replace(/\s+/g, ' ').trim();

const render = async (data: RevenueBreakdown | null, error: string | null = null) => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { r = ReactTestRenderer.create(<PayoutBreakdownPanel data={data} error={error} />); });
  return r;
};
// The host View carrying a testID (the composite wrapper carries it too).
const section = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll(n => n.props?.testID === id && typeof n.type === 'string')[0];

test('three separate headline sections with the exact labels and amounts', async () => {
  const r = await render(KNOWN_SALES);
  const platform = textOf(section(r, 'payout-platform'));
  const processing = textOf(section(r, 'payout-processing'));
  const takeHome = textOf(section(r, 'payout-take-home'));

  expect(platform).toMatch(/^Platform fee .*\$3\.75/);
  expect(processing).toMatch(/^Processing fee .*\$5\.31/);
  expect(takeHome).toMatch(/^Theatre take-home .*\$125\.44/);
  expect(takeHome).toContain(TAKE_HOME_FORMULA);

  // Distinct sections: none carries another's figure.
  expect(platform).not.toContain('$125.44');
  expect(processing).not.toContain('$125.44');
  expect(takeHome).not.toContain('$5.31');
});

test('take-home = face − platform − processing', () => {
  const d = KNOWN_SALES;
  expect(Math.round((d.face_revenue - d.platform_fee_total - d.processing_fees) * 100) / 100).toBe(d.theater_net);
  // gross = face + every fee
  expect(Math.round((d.face_revenue + d.fees_total) * 100) / 100).toBe(d.gross_collected);
});

test('pass-through funds sit in their own block, one line per fee, outside the headline sections', async () => {
  const r = await render(KNOWN_SALES);
  const pass = textOf(section(r, 'payout-pass-through'));
  expect(pass).toContain('Restoration fee (pass-through) $13.75');
  expect(pass).toContain('Beautification fee (pass-through) $0.00');
  expect(pass).toContain('Not part of take-home');
  expect(pass).not.toMatch(/Platform fee|Processing fee|Theatre take-home/);

  for (const id of ['payout-platform', 'payout-processing', 'payout-take-home']) {
    expect(textOf(section(r, id))).not.toMatch(/Restoration|Beautification/);
  }
});

test('flags payments whose processing fee has not been captured yet', async () => {
  const r = await render({ ...KNOWN_SALES, fees_unrecorded: 2 });
  // (the plural "s" is its own JSX child, so textOf shows it spaced off)
  expect(textOf(r.root)).toMatch(/Processing fees not yet recorded for 2 payment ?s /);
});

test('empty, loading and error states', async () => {
  expect(textOf((await render({ ...KNOWN_SALES, orders: 0 })).root)).toContain('No paid sales in this period');
  expect(textOf((await render(null)).root)).toContain('Loading payouts');
  expect(textOf((await render(null, 'Admin privileges required')).root)).toContain('Admin privileges required');
});

test('toRevenueBreakdown normalizes the raw RPC row (numerics as strings, legacy school line)', () => {
  const raw = {
    orders: 3, tickets_sold: 6, gross_collected: '152.00', face_revenue: '134.50', fees_total: '17.50',
    platform_fee_total: '3.75', processing_fees: '5.31', fees_unrecorded: 0, theater_net: '125.44',
    pass_through: [
      { key: 'restoration', label: 'Restoration fee', total: 13.75 },
      { key: 'beautification', label: 'Beautification fee', total: 0 },
    ],
  };
  expect(toRevenueBreakdown(raw)).toEqual(KNOWN_SALES);
  expect(toRevenueBreakdown({ pass_through: [{ key: 'school', label: null, total: '1.50' }] }).pass_through)
    .toEqual([{ key: 'school', label: 'school', total: 1.5 }]);
  expect(toRevenueBreakdown(null).orders).toBe(0);
});
