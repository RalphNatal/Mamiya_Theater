/**
 * Promo codes (per-recipient ticket limits): the client discount mirror, the
 * CSV export, and the admin panel's calls. The SQL side (generation, row-locked
 * redemption, release on cancel, error messages) was exercised on PGlite against
 * supabase/migrations/20261004140000_promo_codes.sql, including per-ticket parity
 * of apply_promo_discount() with applyPromoDiscount() below.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

const mockRpc = jest.fn();
jest.mock('../src/lib/supabase', () => {
  const chain: any = {
    select: () => chain, order: () => chain, gte: () => chain,
    then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
  };
  return { supabase: { rpc: (...a: any[]) => mockRpc(...a), from: () => chain } };
});
jest.mock('../src/components/ModalProvider', () => ({ useAppModal: () => ({ showModal: jest.fn() }) }));

import { applyPromoDiscount, withFees } from '../src/config/venue';
import * as fn from '../supabase/functions/_shared/venue';
import { csvField, toCsv, slugify } from '../src/lib/csv';
import { PromoCodesPanel, batchCsv, describeDiscount } from '../src/screens/admin/sections/PromoCodesSection';

describe('applyPromoDiscount (mirror of SQL apply_promo_discount)', () => {
  test('free → $0, and a $0 ticket carries no fees', () => {
    expect(applyPromoDiscount(15, 'free', 0)).toBe(0);
    expect(withFees([applyPromoDiscount(15, 'free', 0)])).toBe(0);
  });
  test('percent: price − round(price × pct / 100, 2), half-up per ticket', () => {
    expect(applyPromoDiscount(19.99, 'percent', 15)).toBe(16.99);   // 2.9985 → 3.00 off
    expect(applyPromoDiscount(19.99, 'percent', 33.33)).toBe(13.33); // 6.6627 → 6.66 off
    expect(applyPromoDiscount(0.07, 'percent', 50)).toBe(0.03);     // 0.035 → 0.04 off
    expect(applyPromoDiscount(20, 'percent', 100)).toBe(0);
  });
  test('fixed: never below $0; none: unchanged', () => {
    expect(applyPromoDiscount(19.99, 'fixed', 5)).toBe(14.99);
    expect(applyPromoDiscount(19.99, 'fixed', 25)).toBe(0);
    expect(applyPromoDiscount(19.99, 'none', 0)).toBe(19.99);
  });
  test('both venue.ts mirrors agree', () => {
    for (const [p, t, v] of [[19.99, 'percent', 15], [12.5, 'fixed', 3.25], [7, 'free', 0]] as const) {
      expect(fn.applyPromoDiscount(p, t, v)).toBe(applyPromoDiscount(p, t, v));
    }
  });
});

describe('CSV export', () => {
  test('quotes commas/quotes/newlines and neutralises spreadsheet formulas', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvField('-5')).toBe("'-5");
    expect(csvField(null)).toBe('');
    expect(toCsv([['a', 1], ['b', 2]])).toBe('a,1\r\nb,2\r\n');
    expect(slugify('Class of 2027 — Graduation!')).toBe('class-of-2027-graduation');
  });

  test('a batch exports one row per code with its scope and discount', () => {
    const csv = batchCsv(
      { batch_label: 'Class of 2027', production_title: 'Commencement', showtime_start: null, discount_type: 'free', discount_value: 0 },
      [
        { code: 'GRAD-AB2CD-EF3GH', max_tickets: 1, used_tickets: 0, active: true, expires_at: null },
        { code: 'GRAD-ZZ9ZZ-YY8YY', max_tickets: 1, used_tickets: 1, active: true, expires_at: null },
      ],
    );
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('code,tickets_allowed,tickets_used,active,expires_at,batch,event,show,discount');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('GRAD-AB2CD-EF3GH,1,0,yes,,Class of 2027,Commencement,Any show,Free ticket');
    expect(describeDiscount('percent', 25)).toBe('25% off');
  });
});

const rawText = (n: ReactTestInstance | string): string =>
  typeof n === 'string' ? n : n.children.map(rawText).join(' ');
const textOf = (n: ReactTestInstance) => rawText(n).replace(/\s+/g, ' ').trim();

describe('PromoCodesPanel', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'get_promo_batches') {
        return {
          data: [{
            batch_id: 'b1', batch_label: 'Class of 2027', created_at: '2026-10-01T00:00:00Z',
            production_title: 'Commencement', showtime_start: null, discount_type: 'free', discount_value: '0',
            max_tickets: 1, expires_at: null, codes: '400', codes_active: '400', codes_used: '12',
            tickets_used: '12', tickets_allowed: '400',
          }],
          error: null,
        };
      }
      if (name === 'generate_promo_codes') return { data: [{ batch_id: 'b2', created: 400 }], error: null };
      return { data: [], error: null };
    });
  });

  test('lists batches with usage, and generates a 400-code free batch with the form values', async () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { r = ReactTestRenderer.create(<PromoCodesPanel />); });
    const batch = r.root.findAll(n => n.props?.testID === 'batch-b1' && typeof n.type === 'string')[0];
    expect(textOf(batch)).toContain('Class of 2027');
    expect(textOf(batch)).toContain('12 of 400 codes used');
    expect(textOf(batch)).toContain('Free ticket');

    const label = r.root.findAll(n => n.props?.placeholder === 'Class of 2027 graduation' && typeof n.props?.onChangeText === 'function')[0];
    await act(async () => { label.props.onChangeText('Class of 2027 graduation'); });
    const gen = r.root.findAll(n => n.props?.testID === 'generate-codes' && typeof n.props?.onPress === 'function')[0];
    await act(async () => { await gen.props.onPress(); });

    const call = mockRpc.mock.calls.find(c => c[0] === 'generate_promo_codes');
    expect(call?.[1]).toEqual({
      p_quantity: 400, p_batch_label: 'Class of 2027 graduation', p_prefix: null,
      p_production_id: null, p_showtime_id: null, p_max_tickets: 1,
      p_discount_type: 'free', p_discount_value: 0, p_expires_at: null,
    });
    await act(async () => { r.unmount(); });
  });
});
