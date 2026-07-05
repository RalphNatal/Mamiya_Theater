// ─────────────────────────────────────────────────────────────────────────
// RESEND LAYER — the low-level send + shared branded shell used by EVERY
// transactional email (booking confirmation, welcome, payment-failed, showtime
// reminder). Keeping this one module means all senders look identical and go
// out the same verified Resend sender.
//
// ── Required environment (Supabase Function secrets) ───────────────────────
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
//   supabase secrets set FROM_EMAIL="Your Venue <tickets@your-domain.com>"
//
//   • RESEND_API_KEY — create at https://resend.com  →  API Keys.
//   • FROM_EMAIL     — a verified Resend sender or domain (bare address or a
//                      "Display Name <addr>" form). This is the SENDING identity
//                      (a deploy secret), independent of VENUE_SHORT_NAME used
//                      inside the message body.
// ─────────────────────────────────────────────────────────────────────────

import { VENUE_SHORT_NAME } from "./venue.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * True only when BOTH Resend secrets are present. Check this BEFORE any
 * exactly-once compare-and-swap (welcomed_at / reminded_at) so a disabled or
 * mis-configured mailer never burns a "sent" flag without actually sending —
 * the email can then still go out once the secrets are configured.
 */
export function emailConfigured(): boolean {
  return !!(Deno.env.get("RESEND_API_KEY") && Deno.env.get("FROM_EMAIL"));
}

/** Minimal HTML escaping for any value interpolated into an email body. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A Resend attachment. For an INLINE (CID) image — the deliverability-safe way
 * to embed a QR that renders without a "show images" click — set `content_id`
 * and reference it in the HTML as <img src="cid:the-content-id">. `content` is
 * the file's bytes base64-encoded.
 *
 * ⚠️  Verify against Resend's current docs before relying on it: the inline-CID
 *     field has been `content_id` on the attachments object; if Resend renames
 *     or moves it, update this shape + the <img src="cid:…"> reference together.
 */
export interface ResendAttachment {
  filename: string;
  content: string;        // base64-encoded bytes
  content_type?: string;
  content_id?: string;    // set → referenceable inline via cid:<content_id>
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: ResendAttachment[];
}

/**
 * POST a single email through Resend's REST API (plain fetch, no SDK).
 *
 * THROWS on missing config or a Resend rejection — every caller is expected to
 * wrap this in try/catch and log, because transactional email must never be
 * fatal to the flow that triggered it (payment finalization, auth, cron). Use
 * emailConfigured() first when a CAS flag is at stake.
 */
export async function sendViaResend(msg: EmailMessage): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FROM_EMAIL");
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY / FROM_EMAIL not configured");
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.attachments?.length ? { attachments: msg.attachments } : {}),
    }),
  });

  if (!res.ok) {
    // Surface Resend's own error message (e.g. the 403 it returns while your
    // account/domain is still unverified: "You can only send testing emails to
    // your own email address").
    const raw = await res.text();
    let detail = raw;
    try {
      detail = JSON.parse(raw)?.message ?? raw;
    } catch { /* not JSON — keep the raw text */ }
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }
}

/**
 * The shared branded shell every transactional email renders inside: a dark
 * brand header (venue name + a colored eyebrow), a white body cell holding the
 * caller-supplied `bodyHtml`, and a dark footer note. `eyebrow` and
 * `footerNote` are trusted, app-controlled strings (not user input).
 */
export function renderEmailShell(opts: {
  eyebrow: string;
  bodyHtml: string;
  footerNote: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#12122a;padding:28px 32px;">
                <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px;">${VENUE_SHORT_NAME.toUpperCase()}</div>
                <div style="color:#C8102E;font-size:13px;font-weight:700;margin-top:4px;">${opts.eyebrow}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
${opts.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background:#0a0a0a;padding:18px 32px;">
                <div style="color:#9a9a9a;font-size:12px;">${opts.footerNote}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
