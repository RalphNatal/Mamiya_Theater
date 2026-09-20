// ─────────────────────────────────────────────────────────────────────────
// BOOKING TRANSACTIONAL EMAILS — everything keyed off a specific booking:
//   • sendBookingConfirmationEmail — payment succeeded (Stripe webhook / PayPal
//                                    finalize).
//   • sendPaymentFailedEmail       — payment failed & seats released (PayPal
//                                    capture rejected / Stripe async failure).
//   • sendReminderEmail            — ~24h showtime reminder (scheduled batch).
//
// All three share ONE branded shell + ONE Resend sender (../_shared/resend.ts)
// and the same recipient resolution + timezone/currency formatting below, so
// they look and behave identically. Venue facts come from ./venue.ts.
//
// Delivery is ALWAYS non-fatal: every public sender either skips cleanly when
// Resend isn't configured, or throws so the caller can log and swallow. It must
// never break payment finalization, auth, or the cron run that triggered it.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import QRCode from "npm:qrcode";
import { shortRef, VENUE_TIMEZONE, VENUE_SHORT_NAME } from "./venue.ts";
import {
  emailConfigured,
  esc,
  renderEmailShell,
  type ResendAttachment,
  sendViaResend,
} from "./resend.ts";

interface BookingEmailRow {
  id: string;
  user_id: string | null;
  movie_title: string | null;
  show_start_time: string | null;
  num_tickets: number | null;
  total_price: number | null;
  guest_name: string | null;
  guest_email: string | null;
}

// The columns every booking-email sender needs to resolve a recipient + render.
const BOOKING_EMAIL_COLUMNS =
  "id, user_id, movie_title, show_start_time, num_tickets, total_price, guest_name, guest_email";

function formatShowtime(iso: string | null): string {
  if (!iso) return "To be announced";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "To be announced";
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: VENUE_TIMEZONE,
    timeZoneName: "short",
  });
}

function formatMoney(amount: number | null): string {
  const n = Number(amount ?? 0);
  return "$" + (Number.isFinite(n) ? n : 0).toFixed(2);
}

// One row of the grey detail table shared by the confirmation + reminder emails.
function detailRow(label: string, value: string, emphasize = false): string {
  return `
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:13px;">${label}</td>
          <td style="padding:10px 0;color:${emphasize ? "#16a34a" : "#111827"};font-size:${
    emphasize ? "16px" : "14px"
  };font-weight:${emphasize ? "800" : "600"};text-align:right;">${value}</td>
        </tr>`;
}

// Canonical frontend origin (FRONTEND_URL), trailing slash stripped, or "" when
// unset — so a missing env degrades to link-free copy instead of a broken URL.
function frontendBase(): string {
  return (Deno.env.get("FRONTEND_URL") ?? "").trim().replace(/\/+$/, "");
}

// Best-effort e-ticket QR for the receipt. Encodes a ticket URL and returns a
// Resend INLINE (CID) attachment, referenced from the HTML as
// <img src="cid:<contentId>">. CID is the ONLY embed that renders across Gmail /
// Apple Mail / Outlook without a "show images" click — base64 data-URIs get
// stripped and remote <img> URLs are blocked by default. Returns null on ANY
// failure so the receipt still sends (with the visible reference + ticket link).
async function buildTicketQrAttachment(
  ticketUrl: string,
  contentId: string,
  filename: string,
): Promise<ResendAttachment | null> {
  try {
    // toDataURL yields "data:image/png;base64,<b64>"; we keep only the base64 for
    // the attachment's `content`. This is NOT a data-URI in the <img> (which
    // clients strip) — the bytes ride as a real CID attachment.
    const dataUrl = await QRCode.toDataURL(ticketUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 480,
    });
    const b64 = dataUrl.split(",", 2)[1] ?? "";
    if (!b64) return null;
    return { filename, content: b64, content_type: "image/png", content_id: contentId };
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error(`[booking-email] QR generation failed (non-fatal): ${m}`);
    return null;
  }
}

// Every seat is its own ticket (booking_seats.ticket_token → …/ticket/<token>).
// The email embeds one QR per seat so a party can be admitted one guest at a
// time straight from the inbox. Capped so a large group order can't balloon the
// message; beyond the cap the "View your tickets" link (all seats) still works.
const MAX_INLINE_SEAT_QRS = 10;

interface SeatTicketRow {
  seat_number: string;
  ticket_token: string;
  zone: string | null;
}

const ZONE_LABEL: Record<string, string> = {
  premium: "Premium",
  general: "General",
  limited_view: "Limited View",
};

async function loadSeatTickets(admin: SupabaseClient, bookingId: string): Promise<SeatTicketRow[]> {
  const { data } = await admin
    .from("booking_seats")
    .select("seat_number, ticket_token")
    .eq("booking_id", bookingId)
    .eq("status", "booked")
    .order("seat_number", { ascending: true });
  // booking_seats.seat_number has no FK to venue_seats (so no PostgREST embed);
  // resolve each seat's zone with one keyed lookup instead.
  const rows = (data ?? []) as Array<{ seat_number: string; ticket_token: string }>;
  const ids = rows.map((r) => String(r.seat_number));
  const { data: zones } = ids.length
    ? await admin.from("venue_seats").select("seat_identifier, zone").in("seat_identifier", ids)
    : { data: [] };
  const zoneBySeat = new Map((zones ?? []).map((z) => [String(z.seat_identifier), String(z.zone)]));
  return rows.map((r) => ({
    seat_number: String(r.seat_number),
    ticket_token: String(r.ticket_token),
    zone: zoneBySeat.get(String(r.seat_number)) ?? null,
  }));
}

async function resolveRecipient(
  admin: SupabaseClient,
  booking: BookingEmailRow,
): Promise<{ email: string | null; name: string }> {
  if (!booking.user_id) {
    return {
      email: booking.guest_email?.trim() || null,
      name: booking.guest_name?.trim() || "Guest",
    };
  }

  let email: string | null = null;
  let name = "";

  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", booking.user_id)
    .maybeSingle();

  if (profile) {
    email = (profile.email as string | null)?.trim() || null;
    name = ((profile.full_name as string | null) ?? "").trim();
  }

  if (!email || !name) {
    // profiles.email missing or the name is blank — consult the auth record.
    const { data: userRes } = await admin.auth.admin.getUserById(booking.user_id);
    const user = userRes?.user;
    if (!email) email = user?.email?.trim() || null;
    if (!name) {
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
      name = String(meta.full_name ?? meta.name ?? "").trim();
    }
  }

  return { email, name: name || "there" };
}

async function loadSeats(admin: SupabaseClient, bookingId: string): Promise<string[]> {
  const { data: seatRows } = await admin
    .from("booking_seats")
    .select("seat_number")
    .eq("booking_id", bookingId)
    .order("seat_number", { ascending: true });
  return (seatRows ?? []).map((s) => String(s.seat_number));
}

// ─────────────────────────────────────────────────────────────────────────
// 1. BOOKING CONFIRMATION — payment succeeded.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Load a paid booking, resolve the recipient, and send the confirmation email.
 * Call this ONLY after the booking has transitioned to payment_status='paid'
 * (gated by the finalize compare-and-swap so it fires exactly once).
 *
 * Skips cleanly if Resend isn't configured; throws on a Resend rejection so the
 * caller can log it. Either way the caller must still report success upstream —
 * email delivery must never fail payment finalization.
 */
export async function sendBookingConfirmationEmail(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  console.log(`[booking-email] preparing confirmation for booking ${bookingId}`);

  if (!emailConfigured()) {
    console.error(
      `[booking-email] SKIPPING confirmation for ${bookingId}: RESEND_API_KEY / ` +
        `FROM_EMAIL not configured. Set both to enable email.`,
    );
    return;
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(BOOKING_EMAIL_COLUMNS)
    .eq("id", bookingId)
    .single();

  if (bookingErr || !booking) {
    console.error(
      `[booking-email] booking not found for ${bookingId}: ${bookingErr?.message ?? "no row"}`,
    );
    return;
  }
  const row = booking as BookingEmailRow;

  const seats = await loadSeats(admin, bookingId);

  const isGuest = !row.user_id;
  const { email, name } = await resolveRecipient(admin, row);
  if (!email) {
    console.error(
      `[booking-email] no recipient email for booking ${bookingId} ` +
        `(${isGuest ? "guest — guest_email is null/blank" : "authenticated — no profiles.email or auth email"}) — skipping send`,
    );
    return;
  }
  console.log(
    `[booking-email] recipient resolved for ${bookingId}: ${email} (${isGuest ? "guest" : "authenticated"})`,
  );

  const reference = shortRef(row.id);
  const title = row.movie_title?.trim() || "Your show";
  const when = formatShowtime(row.show_start_time);
  const seatList = seats.length ? seats.join(", ") : "General admission";
  const ticketCount = Number(row.num_tickets ?? seats.length ?? 0);
  const total = formatMoney(row.total_price);

  const base = frontendBase();
  const lookupUrl = base ? `${base}/lookup` : null;
  // /ticket/<booking id> renders EVERY seat's QR — the "all your tickets" page.
  const ticketUrl = base ? `${base}/ticket/${row.id}` : null;

  // One inline QR per seat (…/ticket/<seat token>), each its own CID. Best-effort:
  // a failed render just drops that image; the page link still covers every seat.
  const seatTickets = base ? await loadSeatTickets(admin, bookingId) : [];
  const seatQrs: Array<{ seat: SeatTicketRow; att: ResendAttachment }> = [];
  for (const [i, st] of seatTickets.slice(0, MAX_INLINE_SEAT_QRS).entries()) {
    const att = await buildTicketQrAttachment(
      `${base}/ticket/${st.ticket_token}`,
      `seat-qr-${i + 1}`,
      `ticket-${st.seat_number.replace(/[^A-Za-z0-9-]/g, "")}.png`,
    );
    if (att) seatQrs.push({ seat: st, att });
  }
  const qrAttachments = seatQrs.map((q) => q.att);

  const subject = `Your ${VENUE_SHORT_NAME} tickets — ${title} (${reference})`;

  const text = [
    `${VENUE_SHORT_NAME} — Booking confirmed`,
    ``,
    `Hi ${name},`,
    ``,
    `Thank you for your purchase. Your payment was received and your seats are confirmed.`,
    ``,
    `Booking reference: ${reference}`,
    `Production:        ${title}`,
    `Showtime:          ${when}`,
    `Seats:             ${seatList}`,
    `Tickets:           ${ticketCount}`,
    `Total paid:        ${total}`,
    ``,
    ...(ticketUrl ? [`Your tickets:      ${ticketUrl}`, `(one QR code per seat — each guest is scanned in individually)`, ``] : []),
    `Please have this reference ready at the box office.`,
    `See you at the theater!`,
    ``,
    `Lost this email? Look up your booking any time with your reference and email${
      lookupUrl ? ` at ${lookupUrl}` : " on our website"
    }.`,
    ``,
    `— ${VENUE_SHORT_NAME}`,
  ].join("\n");

  const bodyHtml = `                <p style="margin:0 0 6px;color:#111827;font-size:16px;">Hi ${esc(name)},</p>
                <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:21px;">
                  Thank you for your purchase. Your payment was received and your seats are confirmed.
                </p>
                <div style="background:#f9fafb;border:1px solid #eef0f2;border-radius:12px;padding:8px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${detailRow("Booking reference", esc(reference))}
                    ${detailRow("Production", esc(title))}
                    ${detailRow("Showtime", esc(when))}
                    ${detailRow("Seats", esc(seatList))}
                    ${detailRow("Tickets", String(ticketCount))}
                    ${detailRow("Total paid", esc(total), true)}
                  </table>
                </div>
                <div style="margin:24px 0 0;padding:20px;border:1px solid #eef0f2;border-radius:12px;text-align:center;">
                  <div style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Your ticket${ticketCount === 1 ? "" : "s"}</div>
                  <div style="color:#111827;font-size:20px;font-weight:800;letter-spacing:2px;margin-top:4px;">${esc(reference)}</div>${
    seatQrs.length
      ? `
                  <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:16px auto 0;"><tr>${
        seatQrs.map(({ seat, att }, i) => `${i > 0 && i % 2 === 0 ? "</tr><tr>" : ""}
                    <td style="padding:8px 10px;text-align:center;vertical-align:top;">
                      <img src="cid:${att.content_id}" alt="Ticket QR — seat ${esc(seat.seat_number)}" width="150" height="150" style="display:block;width:150px;height:150px;margin:0 auto 6px;" />
                      <div style="color:#111827;font-size:13px;font-weight:700;">Seat ${esc(seat.seat_number)}${
          seat.zone && ZONE_LABEL[seat.zone] ? ` · ${esc(ZONE_LABEL[seat.zone])}` : ""
        }</div>
                    </td>`).join("")
      }
                  </tr></table>`
      : ""
  }${
    ticketUrl
      ? `
                  <div style="margin-top:14px;"><a href="${esc(ticketUrl)}" style="color:#C8102E;text-decoration:none;font-weight:700;font-size:13px;">View ${ticketCount === 1 ? "your ticket" : `all ${ticketCount} tickets`}</a></div>`
      : ""
  }${
    seatTickets.length > seatQrs.length && ticketUrl
      ? `
                  <div style="margin-top:6px;color:#6b7280;font-size:12px;">Showing ${seatQrs.length} of ${seatTickets.length} seats here — the link above has every seat's QR.</div>`
      : ""
  }
                </div>
                <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:20px;">
                  Each seat has its own QR code and is scanned in individually at the door${
    seatQrs.length ? "" : " — open the link above to show them"
  }. Can't scan? Give the box office your booking reference <strong style="color:#111827;">${esc(reference)}</strong>
                  and the seat number. See you at the theater!
                </p>
                <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:20px;">
                  Lost this email? Look up your booking any time with your reference and email${
    lookupUrl
      ? ` at <a href="${esc(lookupUrl)}" style="color:#C8102E;text-decoration:none;font-weight:600;">${esc(lookupUrl)}</a>`
      : " on our website"
  }.
                </p>`;

  const html = renderEmailShell({
    eyebrow: "BOOKING CONFIRMED",
    bodyHtml,
    footerNote: `${VENUE_SHORT_NAME} — this is an automated confirmation, please do not reply.`,
  });

  await sendViaResend({
    to: email,
    subject,
    html,
    text,
    attachments: qrAttachments.length ? qrAttachments : undefined,
  });
  console.log(
    `[booking-email] confirmation sent to ${email} for booking ${bookingId}` +
      (qrAttachments.length ? ` (with ${qrAttachments.length} inline seat QR${qrAttachments.length === 1 ? "" : "s"})` : " (no QR)"),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2. PAYMENT FAILED / SEATS RELEASED — an explicit payment failure.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tell the buyer their payment didn't complete so the booking couldn't be
 * confirmed. Call this from the explicit-failure branches (PayPal capture
 * rejected, Stripe async payment failed). Seat release is NOT done here — the
 * still-reserved hold is reclaimed by cleanup_expired_reservations (the sweep),
 * which also avoids racing a late recovery. Non-fatal: skips if Resend isn't
 * configured, throws on a Resend rejection for the caller to log.
 */
export async function sendPaymentFailedEmail(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  console.log(`[payment-failed-email] preparing notice for booking ${bookingId}`);

  if (!emailConfigured()) {
    console.error(
      `[payment-failed-email] SKIPPING for ${bookingId}: RESEND_API_KEY / FROM_EMAIL not configured.`,
    );
    return;
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(BOOKING_EMAIL_COLUMNS)
    .eq("id", bookingId)
    .single();

  if (bookingErr || !booking) {
    console.error(
      `[payment-failed-email] booking not found for ${bookingId}: ${bookingErr?.message ?? "no row"}`,
    );
    return;
  }
  const row = booking as BookingEmailRow;

  const { email, name } = await resolveRecipient(admin, row);
  if (!email) {
    console.error(`[payment-failed-email] no recipient email for booking ${bookingId} — skipping`);
    return;
  }

  const title = row.movie_title?.trim() || "your show";
  const base = frontendBase();
  const retryUrl = base ? `${base}/shows` : null;

  const subject = `Your ${VENUE_SHORT_NAME} payment didn't go through — ${title}`;

  const text = [
    `${VENUE_SHORT_NAME} — Payment not completed`,
    ``,
    `Hi ${name},`,
    ``,
    `Unfortunately your payment for ${title} didn't go through, so we couldn't`,
    `confirm your booking. Any seats we were holding will be released.`,
    ``,
    `No charge was made. You're welcome to try booking again whenever you're ready${
      retryUrl ? ` at ${retryUrl}` : ""
    }.`,
    ``,
    `— ${VENUE_SHORT_NAME}`,
  ].join("\n");

  const bodyHtml = `                <p style="margin:0 0 6px;color:#111827;font-size:16px;">Hi ${esc(name)},</p>
                <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:21px;">
                  Unfortunately your payment for <strong style="color:#111827;">${esc(title)}</strong> didn't go
                  through, so we couldn't confirm your booking. Any seats we were holding will be released.
                </p>
                <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:21px;">
                  No charge was made. You're welcome to try booking again whenever you're ready.
                </p>${
    retryUrl
      ? `
                <a href="${esc(retryUrl)}" style="display:inline-block;background:#C8102E;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">Browse shows</a>`
      : ""
  }`;

  const html = renderEmailShell({
    eyebrow: "PAYMENT NOT COMPLETED",
    bodyHtml,
    footerNote: `${VENUE_SHORT_NAME} — this is an automated message, please do not reply.`,
  });

  await sendViaResend({ to: email, subject, html, text });
  console.log(`[payment-failed-email] notice sent to ${email} for booking ${bookingId}`);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. SHOWTIME REMINDER — ~24h before the show (scheduled batch).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Send one "your show is coming up" reminder for an already-claimed booking.
 * The scheduler (send-showtime-reminders) owns the exactly-once compare-and-swap
 * on bookings.reminded_at and the Resend-configured check; this just resolves
 * the recipient and sends. Throws on a Resend rejection for the caller to log.
 */
export async function sendReminderEmail(
  admin: SupabaseClient,
  booking: BookingEmailRow,
): Promise<void> {
  const { email, name } = await resolveRecipient(admin, booking);
  if (!email) {
    console.error(`[reminder-email] no recipient email for booking ${booking.id} — skipping`);
    return;
  }

  const seats = await loadSeats(admin, booking.id);
  const reference = shortRef(booking.id);
  const title = booking.movie_title?.trim() || "Your show";
  const when = formatShowtime(booking.show_start_time);
  const seatList = seats.length ? seats.join(", ") : "General admission";
  const ticketCount = Number(booking.num_tickets ?? seats.length ?? 0);

  const subject = `Reminder: ${title} is coming up (${reference})`;

  const text = [
    `${VENUE_SHORT_NAME} — Showtime reminder`,
    ``,
    `Hi ${name},`,
    ``,
    `Just a friendly reminder that your show is coming up soon.`,
    ``,
    `Booking reference: ${reference}`,
    `Production:        ${title}`,
    `Showtime:          ${when}`,
    `Seats:             ${seatList}`,
    `Tickets:           ${ticketCount}`,
    ``,
    `Please have this reference ready at the box office. See you soon!`,
    ``,
    `— ${VENUE_SHORT_NAME}`,
  ].join("\n");

  const bodyHtml = `                <p style="margin:0 0 6px;color:#111827;font-size:16px;">Hi ${esc(name)},</p>
                <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:21px;">
                  Just a friendly reminder that your show is coming up soon — here are your details:
                </p>
                <div style="background:#f9fafb;border:1px solid #eef0f2;border-radius:12px;padding:8px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${detailRow("Booking reference", esc(reference))}
                    ${detailRow("Production", esc(title))}
                    ${detailRow("Showtime", esc(when))}
                    ${detailRow("Seats", esc(seatList))}
                    ${detailRow("Tickets", String(ticketCount))}
                  </table>
                </div>
                <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:20px;">
                  Please have your booking reference <strong style="color:#111827;">${esc(reference)}</strong>
                  ready at the box office. See you soon!
                </p>`;

  const html = renderEmailShell({
    eyebrow: "SHOWTIME REMINDER",
    bodyHtml,
    footerNote: `${VENUE_SHORT_NAME} — this is an automated reminder, please do not reply.`,
  });

  await sendViaResend({ to: email, subject, html, text });
  console.log(`[reminder-email] reminder sent to ${email} for booking ${booking.id}`);
}

// ─────────────────────────────────────────────────────────────────────────
// 4. SHOWTIME BROADCAST — an admin message to a performance's ticket holders.
// ─────────────────────────────────────────────────────────────────────────

interface BroadcastRecipient {
  email: string;
  name: string;
}

/**
 * Resolve the DEDUPED set of recipients for a showtime's PAID bookings, reusing
 * the same recipient resolution as every other booking email (guest_email, else
 * profile/auth email). Dedupes by lowercased email so a customer who bought two
 * bookings for the same performance is mailed once. Also returns the show title
 * + start time (snapshotted on the bookings) for the broadcast's context line.
 *
 * Throws if the bookings query fails; a recipient with no resolvable email is
 * skipped (not an error). The caller owns batching/caps and the emailConfigured
 * check.
 */
export async function collectShowtimeRecipients(
  admin: SupabaseClient,
  showtimeId: string,
): Promise<{ recipients: BroadcastRecipient[]; showTitle: string | null; when: string | null }> {
  const { data, error } = await admin
    .from("bookings")
    .select(BOOKING_EMAIL_COLUMNS)
    .eq("showtime_id", showtimeId)
    .eq("payment_status", "paid");

  if (error) throw error;
  const rows = (data ?? []) as BookingEmailRow[];

  const byEmail = new Map<string, BroadcastRecipient>();
  let showTitle: string | null = null;
  let when: string | null = null;

  for (const row of rows) {
    if (showTitle === null && row.movie_title) showTitle = row.movie_title.trim() || null;
    if (when === null && row.show_start_time) when = row.show_start_time;

    const { email, name } = await resolveRecipient(admin, row);
    if (!email) continue;
    const key = email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { email, name });
  }

  return { recipients: [...byEmail.values()], showTitle, when };
}

/**
 * Send ONE branded broadcast email carrying an admin-authored subject + message
 * to a single already-resolved recipient. Reuses the shared email shell so it
 * matches the confirmation/reminder look. The admin's plain-text message is
 * HTML-escaped and its line breaks preserved — it is NEVER interpreted as HTML.
 *
 * The caller checks emailConfigured() once before the batch and wraps each call
 * in its own try/catch so one bad recipient can't abort the run (invariant:
 * delivery is non-fatal). Throws on a Resend rejection for that caller to log.
 */
export async function sendBroadcastEmail(
  recipient: BroadcastRecipient,
  subject: string,
  message: string,
  context: { showTitle: string | null; when: string | null },
): Promise<void> {
  const title = context.showTitle?.trim() || "your upcoming show";
  const when = context.when ? formatShowtime(context.when) : null;
  const messageHtml = esc(message).replace(/\r?\n/g, "<br>");

  const text = [
    `${VENUE_SHORT_NAME}`,
    ``,
    `Hi ${recipient.name},`,
    ``,
    `This is a message about your booking for ${title}${when ? ` on ${when}` : ""}:`,
    ``,
    message,
    ``,
    `— ${VENUE_SHORT_NAME}`,
  ].join("\n");

  const bodyHtml = `                <p style="margin:0 0 6px;color:#111827;font-size:16px;">Hi ${esc(recipient.name)},</p>
                <p style="margin:0 0 20px;color:#6b7280;font-size:13px;line-height:20px;">
                  This is a message about your booking for <strong style="color:#111827;">${esc(title)}</strong>${
    when ? ` on ${esc(when)}` : ""
  }.
                </p>
                <div style="background:#f9fafb;border:1px solid #eef0f2;border-radius:12px;padding:20px;color:#111827;font-size:14px;line-height:22px;">
                  ${messageHtml}
                </div>`;

  const html = renderEmailShell({
    eyebrow: `A MESSAGE FROM ${VENUE_SHORT_NAME.toUpperCase()}`,
    bodyHtml,
    footerNote: `${VENUE_SHORT_NAME} — you received this because you have a ticket for this performance.`,
  });

  await sendViaResend({ to: recipient.email, subject, html, text });
}

export type { BookingEmailRow, BroadcastRecipient };
export { BOOKING_EMAIL_COLUMNS };
