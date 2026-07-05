// ─────────────────────────────────────────────────────────────────────────
// BOOKING CONFIRMATION EMAIL — shared by the Stripe webhook and the PayPal
// capture function. Sends a single transactional email through Resend's REST
// API with a plain `fetch` (no SDK, no heavy dependency).
//
// ── Required environment (set as Supabase Function secrets) ────────────────
//
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
//   supabase secrets set FROM_EMAIL="Mamiya Theater <tickets@your-domain.com>"
//
//   • RESEND_API_KEY — create at https://resend.com  →  API Keys.
//   • FROM_EMAIL     — a verified Resend sender or domain. May be a bare
//                      address ("tickets@your-domain.com") or a display form
//                      ("Mamiya Theater <tickets@your-domain.com>").
//
// If either secret is missing the send is skipped (and logged) rather than
// throwing, so a mis-configured environment can never block a payment.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { shortRef, VENUE_TIMEZONE } from "./venue.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
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

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function buildEmail(
  booking: BookingEmailRow,
  seats: string[],
  buyerName: string,
): EmailContent {
  const reference = shortRef(booking.id);
  const title = booking.movie_title?.trim() || "Your show";
  const when = formatShowtime(booking.show_start_time);
  const seatList = seats.length ? seats.join(", ") : "General admission";
  const ticketCount = Number(booking.num_tickets ?? seats.length ?? 0);
  const total = formatMoney(booking.total_price);

  const subject = `Your Mamiya Theater tickets — ${title} (${reference})`;

  // Plain-text fallback for clients that don't render HTML.
  const text = [
    `Mamiya Theater — Booking confirmed`,
    ``,
    `Hi ${buyerName},`,
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
    `Please have this reference ready at the box office.`,
    `See you at the theater!`,
    ``,
    `— Mamiya Theater`,
  ].join("\n");

  const row = (label: string, value: string, emphasize = false) => `
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:13px;">${label}</td>
          <td style="padding:10px 0;color:${emphasize ? "#16a34a" : "#111827"};font-size:${
    emphasize ? "16px" : "14px"
  };font-weight:${emphasize ? "800" : "600"};text-align:right;">${value}</td>
        </tr>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#12122a;padding:28px 32px;">
                <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px;">MAMIYA THEATER</div>
                <div style="color:#C8102E;font-size:13px;font-weight:700;margin-top:4px;">BOOKING CONFIRMED</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 6px;color:#111827;font-size:16px;">Hi ${esc(buyerName)},</p>
                <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:21px;">
                  Thank you for your purchase. Your payment was received and your seats are confirmed.
                </p>
                <div style="background:#f9fafb;border:1px solid #eef0f2;border-radius:12px;padding:8px 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${row("Booking reference", esc(reference))}
                    ${row("Production", esc(title))}
                    ${row("Showtime", esc(when))}
                    ${row("Seats", esc(seatList))}
                    ${row("Tickets", String(ticketCount))}
                    ${row("Total paid", esc(total), true)}
                  </table>
                </div>
                <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:20px;">
                  Please have your booking reference <strong style="color:#111827;">${esc(reference)}</strong>
                  ready at the box office. See you at the theater!
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#0a0a0a;padding:18px 32px;">
                <div style="color:#9a9a9a;font-size:12px;">Mamiya Theater — this is an automated confirmation, please do not reply.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

/**
 * Load a paid booking, resolve the recipient, and send the confirmation email
 * via Resend. Call this ONLY after the booking has actually transitioned to
 * payment_status='paid' (see the idempotency guards in the webhook / capture).
 *
 * The caller is expected to wrap this in try/catch: on any failure this throws
 * so the caller can log it, but must still return success to Stripe/PayPal —
 * email delivery must never fail payment finalization.
 */
export async function sendBookingConfirmationEmail(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  console.log(`[booking-email] preparing confirmation for booking ${bookingId}`);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FROM_EMAIL");
  // NOTE: this is a SKIP, not a thrown error — it returns before the send, so
  // it never reaches the caller's try/catch. Logged at error level (loudly) so
  // a mis-configured environment is obvious in the edge logs instead of silent.
  // Locally, set these in the env file you pass to `supabase functions serve
  // --env-file ...`; when deployed, `supabase secrets set RESEND_API_KEY=...
  // FROM_EMAIL=...`.
  if (!apiKey || !from) {
    console.error(
      `[booking-email] SKIPPING send for ${bookingId}: ` +
        `RESEND_API_KEY ${apiKey ? "set" : "MISSING"}, ` +
        `FROM_EMAIL ${from ? "set" : "MISSING"}. Configure both to enable email.`,
    );
    return;
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select(
      "id, user_id, movie_title, show_start_time, num_tickets, total_price, guest_name, guest_email",
    )
    .eq("id", bookingId)
    .single();

  if (bookingErr || !booking) {
    console.error(
      `[booking-email] booking not found for ${bookingId}: ${bookingErr?.message ?? "no row"}`,
    );
    return;
  }

  const { data: seatRows } = await admin
    .from("booking_seats")
    .select("seat_number")
    .eq("booking_id", bookingId)
    .order("seat_number", { ascending: true });
  const seats = (seatRows ?? []).map((s) => String(s.seat_number));

  const isGuest = !(booking as BookingEmailRow).user_id;
  const { email, name } = await resolveRecipient(admin, booking as BookingEmailRow);
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

  const { subject, html, text } = buildEmail(booking as BookingEmailRow, seats, name);

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [email], subject, html, text }),
  });

  if (!res.ok) {
    // Surface Resend's own error message (it returns JSON like
    // {"statusCode":403,"message":"You can only send testing emails to your own
    // email address (...)"} while your account/domain is unverified). Logged
    // here AND thrown so the caller's catch also records it.
    const raw = await res.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.message ?? raw;
    } catch { /* not JSON — keep raw text */ }
    console.error(`[booking-email] Resend rejected send for ${bookingId} (${res.status}): ${detail}`);
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }

  console.log(`[booking-email] confirmation sent to ${email} for booking ${bookingId}`);
}
