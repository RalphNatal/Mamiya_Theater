/**
 * Payouts panel (Overview, full admin only): Platform fee, Processing fee and
 * Theatre take-home as three separate sections, with Beautification and School
 * in their own pass-through block.
 *
 * The input is the exact get_revenue_breakdown row the migration chain returns
 * for this set of known test sales (verified on PGlite):
 *   online  2 × $20 face + 3 × $1.50 fees = $44.50, Stripe fee $1.59
 *   online  1 × $30 face + 3 × $0.75 fees = $32.25, Stripe fee $1.24
 *   walk-up 3 × $20 face, no fees          = $60.00
 *   (+ one unpaid reservation, excluded)
 * so take-home = face 130.00 − platform 2.25 − processing 2.83 = 124.92.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

import {
  PayoutBreakdownPanel, TAKE_HOME_FORMULA, type RevenueBreakdown,
} from '../src/screens/admin/sections/OverviewSection';

const KNOWN_SALES: RevenueBreakdown = {
  orders: 3,
  tickets_sold: 6,
  gross_collected: 136.75,
  face_revenue: 130,
  beautification_total: 2.25,
  school_total: 2.25,
  ticketing_fee_total: 2.25,
  processing_fees: 2.83,
  fees_unrecorded: 0,
  theater_net: 124.92,
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

  expect(platform).toMatch(/^Platform fee .*\$2\.25/);
  expect(processing).toMatch(/^Processing fee .*\$2\.83/);
  expect(takeHome).toMatch(/^Theatre take-home .*\$124\.92/);
  expect(takeHome).toContain(TAKE_HOME_FORMULA);

  // Distinct sections: none carries another's figure.
  expect(platform).not.toContain('$124.92');
  expect(processing).not.toContain('$124.92');
  expect(takeHome).not.toContain('$2.83');
});

test('take-home = face − platform − processing', () => {
  const d = KNOWN_SALES;
  expect(Math.round((d.face_revenue - d.ticketing_fee_total - d.processing_fees) * 100) / 100).toBe(d.theater_net);
});

test('Beautification and School sit in their own pass-through block, outside the headline sections', async () => {
  const r = await render(KNOWN_SALES);
  const pass = textOf(section(r, 'payout-pass-through'));
  expect(pass).toContain('Beautification (pass-through) $2.25');
  expect(pass).toContain('School (pass-through) $2.25');
  expect(pass).toContain('Not part of take-home');
  expect(pass).not.toMatch(/Platform fee|Processing fee|Theatre take-home/);

  for (const id of ['payout-platform', 'payout-processing', 'payout-take-home']) {
    expect(textOf(section(r, id))).not.toMatch(/Beautification|School/);
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
