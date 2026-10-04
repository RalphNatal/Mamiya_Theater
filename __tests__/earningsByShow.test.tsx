/**
 * Dashboard: earnings for one EVENT and one SHOW (full admin only). Input rows
 * are the shapes get_revenue_by_show / get_revenue_breakdown return on PGlite
 * for a production with TWO SHOWS ON THE SAME DAY (2:00 PM matinee + 7:30 PM
 * evening) — they must stay two rows with their own numbers, never merged.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

const mockRpc = jest.fn();
jest.mock('../src/lib/supabase', () => {
  const chain: any = {
    select: () => chain, order: () => chain,
    then: (res: any) => Promise.resolve({ data: [{ id: 'p1', title: 'Hamlet' }], error: null }).then(res),
  };
  return { supabase: { rpc: (...a: any[]) => mockRpc(...a), from: () => chain } };
});

import { EarningsByShowPanel, showLabel } from '../src/screens/admin/sections/EarningsByShowPanel';
import { WebSelect } from '../src/screens/admin/components/WebInputs';

const MATINEE = '2026-11-07T00:00:00Z';   // Fri Nov 6, 2:00 PM HST
const EVENING = '2026-11-07T05:30:00Z';   // Fri Nov 6, 7:30 PM HST
const BY_SHOW = [
  { showtime_id: 's-mat', production_id: 'p1', production_title: 'Hamlet', show_start_time: MATINEE, orders: '1', tickets_sold: '2', gross_collected: '47.00', face_revenue: '40.00', fees_total: '7.00', platform_fee_total: '1.50', processing_fees: '1.00', theater_net: '37.50' },
  { showtime_id: 's-eve', production_id: 'p1', production_title: 'Hamlet', show_start_time: EVENING, orders: '2', tickets_sold: '3', gross_collected: '100.50', face_revenue: '90.00', fees_total: '10.50', platform_fee_total: '2.25', processing_fees: '2.00', theater_net: '85.75' },
];
const breakdown = (o: any) => ({
  orders: 1, tickets_sold: 2, gross_collected: '47.00', face_revenue: '40.00', fees_total: '7.00',
  platform_fee_total: '1.50', pass_through: [{ key: 'restoration', label: 'Restoration fee', total: 5.5 }],
  processing_fees: '1.00', fees_unrecorded: 0, theater_net: '37.50', ...o,
});

const rawText = (n: ReactTestInstance | string): string =>
  typeof n === 'string' ? n : n.children.map(rawText).join(' ');
const textOf = (n: ReactTestInstance) => rawText(n).replace(/\s+/g, ' ').trim();
const byTestId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll(n => n.props?.testID === id && typeof n.type === 'string')[0];

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockImplementation(async (name: string, args: any) => {
    if (name === 'get_revenue_by_show') return { data: BY_SHOW, error: null };
    if (name === 'get_revenue_breakdown') {
      return { data: [args.p_showtime_id === 's-eve'
        ? breakdown({ orders: 2, tickets_sold: 3, gross_collected: '100.50', theater_net: '85.75' })
        : breakdown({ orders: 3, tickets_sold: 5, gross_collected: '147.50', theater_net: '123.25' })], error: null };
    }
    return { data: null, error: null };
  });
});

test('two shows on the same day are separate rows, each with its own earnings', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { r = ReactTestRenderer.create(<EarningsByShowPanel range={{ start: '2026-10-01', end: '2026-10-31' }} />); });
  expect(textOf(r.root)).toContain('Pick an event');
  expect(mockRpc).not.toHaveBeenCalled();

  const [eventPicker] = r.root.findAllByType(WebSelect);
  await act(async () => { eventPicker.props.onChange('p1'); });
  // whole run by default (all time), scoped to the event
  expect(mockRpc).toHaveBeenCalledWith('get_revenue_by_show', { start_date: '2000-01-01', end_date: '2100-12-31', p_production_id: 'p1' });
  expect(mockRpc).toHaveBeenCalledWith('get_revenue_breakdown', expect.objectContaining({ p_production_id: 'p1', p_showtime_id: null }));

  const mat = textOf(byTestId(r, 'show-row-s-mat'));
  const eve = textOf(byTestId(r, 'show-row-s-eve'));
  expect(showLabel(MATINEE)).not.toBe(showLabel(EVENING));   // same date, distinct labels (time shown)
  expect(mat).toContain(showLabel(MATINEE));
  expect(mat).toMatch(/2 \$47\.00 \$7\.00 \$37\.50/);
  expect(eve).toMatch(/3 \$100\.50 \$10\.50 \$85\.75/);
  expect(textOf(r.root)).toContain('Payouts · Hamlet');
  expect(textOf(r.root)).toContain('$123.25');

  // Drill into the evening show → its own payouts
  const row = r.root.findAll(n => n.props?.testID === 'show-row-s-eve' && typeof n.props?.onPress === 'function')[0];
  const before = mockRpc.mock.calls.length;
  await act(async () => { row.props.onPress(); });
  // only the payout summary reloads — the per-show table stays put
  expect(mockRpc.mock.calls.slice(before).map(c => c[0])).toEqual(['get_revenue_breakdown']);
  expect(mockRpc).toHaveBeenLastCalledWith('get_revenue_breakdown', expect.objectContaining({ p_showtime_id: 's-eve' }));
  expect(textOf(r.root)).toContain(`Payouts · Hamlet — ${showLabel(EVENING)}`);
  expect(textOf(r.root)).toContain('$85.75');
  await act(async () => { r.unmount(); });
});
