import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────
// CONTACT FORM handler. Persists a public enquiry to contact_messages (with
// the service role, so no client insert policy is needed) and then notifies
// the venue inbox via Resend. The DB save is the source of truth — a Resend
// failure is logged and swallowed, never blocking the save.
//
// ── Required secrets ───────────────────────────────────────────────────────
//   • SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  — auto-injected when deployed.
//   • RESEND_API_KEY / FROM_EMAIL               — shared with the booking email;
//                                                 if missing the send is skipped.
//   • CONTACT_NOTIFY_EMAIL (optional)           — inbox enquiries are sent to;
//                                                 defaults to the address below.
// ─────────────────────────────────────────────────────────────────────────

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_NOTIFY_EMAIL = "mamiya@saintlouishawaii.org";

// Mirror of the client's EMAIL_REGEX (src/lib/validation.ts) — re-validate
// server-side so a crafted request bypassing the UI still can't store garbage.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Fail fast if deployed without the secrets needed to SAVE the message.
    // (Email secrets are checked separately in sendNotification — a missing
    // email config must never stop us persisting the enquiry.)
    const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
      .filter((k) => !Deno.env.get(k));
    if (missing.length) {
      console.error("contact-message misconfigured — missing secrets:", missing.join(", "));
      return json({ error: "The contact form is temporarily unavailable." }, 500);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request." }, 400);
    }

    const b = body as Record<string, unknown>;
    const fullName = String(b.full_name ?? "").trim();
    const email = String(b.email ?? "").trim();
    const subject = String(b.subject ?? "").trim();
    const message = String(b.message ?? "").trim();

    // Honeypot: a hidden field no human ever sees or fills. If a bot populated
    // it, acknowledge with 200 so it thinks it succeeded, but silently drop the
    // submission — nothing is saved and nothing is emailed.
    const honeypot = String(b.website ?? "").trim();
    if (honeypot) {
      console.warn("contact-message: honeypot tripped — dropping submission");
      return json({ ok: true });
    }

    // Server-side validation (defense in depth; the client validates first).
    if (!fullName || !email || !message) {
      return json({ error: "Name, email, and message are required." }, 400);
    }
    if (!EMAIL_REGEX.test(email)) {
      return json({ error: "Please provide a valid email address." }, 400);
    }

    // Service-role client: bypasses RLS so we can insert without a client
    // policy. Runs server-side only; the key never reaches the browser.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 1. Persist the enquiry — the source of truth. Must succeed even if the
    //    notification email later fails.
    const { data: inserted, error: insertErr } = await admin
      .from("contact_messages")
      .insert({
        full_name: fullName,
        email,
        subject: subject || null,
        message,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.error("contact-message: insert failed:", insertErr?.message ?? "no row");
      return json({ error: "Could not send your message. Please try again." }, 500);
    }

    // 2. Notify the venue inbox. Non-fatal: the message is already saved, so
    //    any email failure is logged and swallowed and the caller still wins.
    try {
      await sendNotification({ id: String(inserted.id), fullName, email, subject, message });
    } catch (emailErr) {
      const m = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error("contact-message: notification email failed (non-fatal):", inserted.id, m);
    }

    return json({ ok: true });
  } catch (err) {
    // Log the real cause; return a generic message so we never leak internals.
    const message = err instanceof Error ? err.message : String(err);
    console.error("contact-message error:", message);
    return json({ error: "Could not send your message. Please try again." }, 500);
  }
});

// ── Resend notification ────────────────────────────────────────────────────
// Sends the enquiry to the venue inbox with reply_to set to the submitter, so
// staff can reply straight from their mail client. SKIPS (does not throw) when
// email isn't configured, mirroring send-booking-email — a mis-configured
// environment is logged loudly but never blocks the save.
async function sendNotification(msg: {
  id: string;
  fullName: string;
  email: string;
  subject: string;
  message: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FROM_EMAIL");
  if (!apiKey || !from) {
    console.error(
      `[contact-message] SKIPPING notification for ${msg.id}: ` +
        `RESEND_API_KEY ${apiKey ? "set" : "MISSING"}, ` +
        `FROM_EMAIL ${from ? "set" : "MISSING"}. Configure both to enable email.`,
    );
    return;
  }

  const to = (Deno.env.get("CONTACT_NOTIFY_EMAIL") ?? DEFAULT_NOTIFY_EMAIL).trim();
  const subjectLine = msg.subject
    ? `New contact message: ${msg.subject}`
    : `New contact message from ${msg.fullName}`;

  const text = [
    `New enquiry from the Mamiya Theater contact form`,
    ``,
    `Name:    ${msg.fullName}`,
    `Email:   ${msg.email}`,
    `Subject: ${msg.subject || "(none)"}`,
    ``,
    `Message:`,
    msg.message,
    ``,
    `Reply directly to this email to respond to ${msg.fullName}.`,
  ].join("\n");

  const messageHtml = esc(msg.message).replace(/\r?\n/g, "<br>");
  const row = (label: string, value: string) => `
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td>
          <td style="padding:8px 0 8px 16px;color:#111827;font-size:14px;font-weight:600;">${value}</td>
        </tr>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#12122a;padding:28px 32px;">
                <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px;">MAMIYA THEATER</div>
                <div style="color:#C8102E;font-size:13px;font-weight:700;margin-top:4px;">NEW CONTACT MESSAGE</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${row("From", esc(msg.fullName))}
                  ${row("Email", `<a href="mailto:${esc(msg.email)}" style="color:#C8102E;text-decoration:none;">${esc(msg.email)}</a>`)}
                  ${row("Subject", esc(msg.subject || "(none)"))}
                </table>
                <div style="margin-top:20px;padding:16px 20px;background:#f9fafb;border:1px solid #eef0f2;border-radius:12px;color:#111827;font-size:14px;line-height:22px;">
                  ${messageHtml}
                </div>
                <p style="margin:20px 0 0;color:#6b7280;font-size:13px;line-height:20px;">
                  Reply directly to this email to respond to ${esc(msg.fullName)}.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#0a0a0a;padding:18px 32px;">
                <div style="color:#9a9a9a;font-size:12px;">Mamiya Theater — sent from the website contact form.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: msg.email,
      subject: subjectLine,
      html,
      text,
    }),
  });

  if (!res.ok) {
    // Surface Resend's own error (e.g. an unverified-domain 403) in the log.
    const raw = await res.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.message ?? raw;
    } catch { /* not JSON — keep raw text */ }
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }

  console.log(`[contact-message] notification sent to ${to} for ${msg.id}`);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
