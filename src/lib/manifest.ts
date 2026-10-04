// Door manifest for one show (get_show_manifest RPC, assert_staff). Turns the
// RPC rows into the printed / exported list:
//   Attendee name · Seat (or "Standing") · Tickets · Checked in ☐ · Order reference
// sorted by the buyer's LAST NAME (the RPC already orders by buyer_last_name;
// walk-up sales, which carry no name, come last). Pure functions so the table,
// the CSV and the print HTML are unit-tested together.

import { shortRef, VENUE_SHORT_NAME } from '../config/venue';
import { toCsv } from './csv';

export type ManifestRpcRow = {
  booking_id: string;
  buyer_name: string | null;
  buyer_last_name: string | null;
  channel: string | null;
  seats: string[] | null;
  ticket_count: number;
  checked_in: number;
};

export type ManifestRow = {
  name: string;
  seat: string;
  tickets: number;
  checkedIn: number;
  allIn: boolean;
  reference: string;
};

export const toManifestRows = (rows: ManifestRpcRow[]): ManifestRow[] =>
  rows.map(r => {
    const seats = r.seats ?? [];
    const tickets = Number(r.ticket_count ?? seats.length);
    // Capacity-based (standing) tickets have no seat number.
    const standing = Math.max(tickets - seats.length, 0);
    const seat = [seats.join(', '), standing ? (seats.length ? `Standing ×${standing}` : 'Standing') : '']
      .filter(Boolean).join(' + ') || '—';
    const checkedIn = Number(r.checked_in ?? 0);
    return {
      name: r.buyer_name?.trim() || (r.channel === 'box_office' ? 'Walk-up (box office)' : 'Guest'),
      seat,
      tickets,
      checkedIn,
      allIn: tickets > 0 && checkedIn >= tickets,
      reference: shortRef(r.booking_id),
    };
  });

export const manifestTotals = (rows: ManifestRow[]) => ({
  orders: rows.length,
  tickets: rows.reduce((s, r) => s + r.tickets, 0),
  checkedIn: rows.reduce((s, r) => s + r.checkedIn, 0),
});

export const manifestCsv = (rows: ManifestRow[]): string =>
  toCsv([
    ['attendee_name', 'seat', 'tickets', 'checked_in', 'order_reference'],
    ...rows.map(r => [r.name, r.seat, r.tickets, `${r.checkedIn}/${r.tickets}`, r.reference]),
  ]);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A self-contained printable page (Letter/A4, black on white, repeating header
// row). The checkbox column is an empty box for staff to tick by hand; parties
// already scanned in print as ☑ (partially: "1 of 2").
export const manifestHtml = (show: { title: string; when: string }, rows: ManifestRow[], printedAt: string): string => {
  const t = manifestTotals(rows);
  const body = rows.map(r => `
      <tr>
        <td>${esc(r.name)}</td>
        <td>${esc(r.seat)}</td>
        <td class="num">${r.tickets}</td>
        <td class="chk">${r.allIn ? '☑' : r.checkedIn > 0 ? `☐ <small>${r.checkedIn} of ${r.tickets} in</small>` : '☐'}</td>
        <td class="ref">${esc(r.reference)}</td>
      </tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Manifest — ${esc(show.title)} — ${esc(show.when)}</title>
<style>
  @page { size: auto; margin: 14mm; }
  body { font: 12px/1.35 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #000; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { color: #333; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th, td { border-bottom: 1px solid #999; padding: 6px 6px; text-align: left; vertical-align: top; }
  th { border-bottom: 2px solid #000; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; width: 56px; }
  .chk { width: 110px; font-size: 16px; }
  .chk small { font-size: 10px; }
  .ref { width: 110px; font-family: ui-monospace, Consolas, monospace; }
  .empty { padding: 24px 0; color: #555; }
</style></head>
<body>
  <h1>${esc(show.title)}</h1>
  <div class="meta">${esc(show.when)} · ${t.orders} order${t.orders === 1 ? '' : 's'} · ${t.tickets} ticket${t.tickets === 1 ? '' : 's'} · ${t.checkedIn} checked in at print · ${esc(VENUE_SHORT_NAME)} · printed ${esc(printedAt)}</div>
  ${rows.length === 0 ? '<p class="empty">No paid bookings for this show yet.</p>' : `<table>
    <thead><tr><th>Attendee name</th><th>Seat</th><th class="num">Tickets</th><th class="chk">Checked in</th><th class="ref">Order ref</th></tr></thead>
    <tbody>${body}
    </tbody>
  </table>`}
</body></html>`;
};

// Opens the manifest in a new tab and starts printing (Save as PDF works from
// the same dialog). Web only — returns false elsewhere / if popups are blocked.
export const printManifest = (html: string): boolean => {
  const w = (globalThis as any).open?.('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
};
