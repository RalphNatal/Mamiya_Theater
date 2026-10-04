/**
 * Door manifest (get_show_manifest → printable list): columns, last-name order
 * as returned by the RPC (verified on PGlite), standing tickets, check-in box,
 * order reference, HTML escaping and CSV export.
 *
 * @format
 */

import { manifestCsv, manifestHtml, manifestTotals, toManifestRows, type ManifestRpcRow } from '../src/lib/manifest';

const RPC: ManifestRpcRow[] = [
  { booking_id: '1a2b3c4d-0000-0000-0000-000000000000', buyer_name: 'Kai Nakamura', buyer_last_name: 'nakamura', channel: 'online', seats: ['F11', 'F12'], ticket_count: 2, checked_in: 2 },
  { booking_id: '2b3c4d5e-0000-0000-0000-000000000000', buyer_name: 'Leilani <Smith>', buyer_last_name: 'smith', channel: 'online', seats: ['G1'], ticket_count: 2, checked_in: 1 },
  { booking_id: '3c4d5e6f-0000-0000-0000-000000000000', buyer_name: 'Ana Lopez', buyer_last_name: 'lopez', channel: 'online', seats: [], ticket_count: 1, checked_in: 0 },
  { booking_id: '4d5e6f70-0000-0000-0000-000000000000', buyer_name: null, buyer_last_name: null, channel: 'box_office', seats: ['A3'], ticket_count: 1, checked_in: 0 },
];

test('one row per order: name · seat (or Standing) · tickets · checked-in · reference', () => {
  const rows = toManifestRows(RPC);
  expect(rows.map(r => [r.name, r.seat, r.tickets, r.allIn, r.reference])).toEqual([
    ['Kai Nakamura', 'F11, F12', 2, true, 'MT-1A2B3C4D'],
    ['Leilani <Smith>', 'G1 + Standing ×1', 2, false, 'MT-2B3C4D5E'],
    ['Ana Lopez', 'Standing', 1, false, 'MT-3C4D5E6F'],
    ['Walk-up (box office)', 'A3', 1, false, 'MT-4D5E6F70'],
  ]);
  expect(manifestTotals(rows)).toEqual({ orders: 4, tickets: 6, checkedIn: 3 });
});

test('printable HTML has the five columns, escapes names, and prints check boxes', () => {
  const html = manifestHtml({ title: 'Hamlet', when: 'Fri, Oct 9 · 7:30 PM HST' }, toManifestRows(RPC), 'Oct 9, 6:00 PM');
  expect(html).toContain('<th>Attendee name</th><th>Seat</th><th class="num">Tickets</th><th class="chk">Checked in</th><th class="ref">Order ref</th>');
  expect(html).toContain('Leilani &lt;Smith&gt;');
  expect(html).not.toContain('<Smith>');
  expect(html).toContain('☑');                    // fully checked in
  expect(html).toContain('☐ <small>1 of 2 in</small>');
  expect(html).toContain('4 orders · 6 tickets · 3 checked in');
  // last-name order preserved from the RPC
  expect(html.indexOf('Kai Nakamura')).toBeLessThan(html.indexOf('Leilani'));
  expect(html).toContain('thead { display: table-header-group; }'); // header repeats on each printed page
});

test('empty show prints a clear message', () => {
  expect(manifestHtml({ title: 'Hamlet', when: 'x' }, [], 'y')).toContain('No paid bookings for this show yet.');
});

test('CSV export', () => {
  const csv = manifestCsv(toManifestRows(RPC)).trim().split('\r\n');
  expect(csv[0]).toBe('attendee_name,seat,tickets,checked_in,order_reference');
  expect(csv[1]).toBe('Kai Nakamura,"F11, F12",2,2/2,MT-1A2B3C4D');
  expect(csv).toHaveLength(5);
});
