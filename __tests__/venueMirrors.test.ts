/**
 * The two venue.ts mirrors (browser bundle / Edge Functions) must carry the same
 * public values. The fee block is byte-compared in fees.test.ts; this pins the
 * rest, including the support inbox the contact form routes to.
 *
 * @format
 */

import * as client from '../src/config/venue';
import * as fn from '../supabase/functions/_shared/venue';

test('support + general inboxes agree, and support routes to the testing inbox', () => {
  expect(fn.SUPPORT_EMAIL).toBe(client.SUPPORT_EMAIL);
  expect(fn.GENERAL_EMAIL).toBe(client.GENERAL_EMAIL);
  // ⚠ TEMPORARY until the venue picks its real support inbox.
  expect(client.SUPPORT_EMAIL).toBe('calledpresentations@gmail.com');
  // The public "General Inquiries" address stays the venue's own.
  expect(client.GENERAL_EMAIL).toBe('mamiya@saintlouishawaii.org');
});

test('names, timezone, currency and booking reference format agree', () => {
  expect(fn.VENUE_LEGAL_NAME).toBe(client.VENUE_LEGAL_NAME);
  expect(fn.VENUE_SHORT_NAME).toBe(client.VENUE_SHORT_NAME);
  expect(fn.VENUE_TIMEZONE).toBe(client.VENUE_TIMEZONE);
  expect(fn.VENUE_CURRENCY).toBe(client.VENUE_CURRENCY);
  expect(fn.shortRef('1a2b3c4d-0000-0000-0000-000000000000')).toBe(client.shortRef('1a2b3c4d-0000-0000-0000-000000000000'));
});
