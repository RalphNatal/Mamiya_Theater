import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { VENUE_SHORT_NAME } from "../_shared/venue.ts";
import { emailConfigured, esc, renderEmailShell, sendViaResend } from "../_shared/resend.ts";

// ─────────────────────────────────────────────────────────────────────────
// WELCOME EMAIL — app-controlled, exactly-once, fired from the client right
// after a confirmed sign-in (App.tsx handlePostAuth).
//
// This is SEPARATE from Supabase's built-in verification email, which we leave
// untouched. Exactly-once is enforced by a COMPARE-AND-SWAP on
// profiles.welcomed_at (NULL → now()): only the invocation that wins the flip
// sends, so re-invoking on every sign-in still emails once (invariant #3).
//
// The caller is identified from their JWT (never a client-supplied id), so a
// visitor can only ever trigger their OWN welcome.
// ─────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Identify the caller from their access token — NOT from the request body,
    // so nobody can trigger a welcome for someone else.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return json({ error: "Not authenticated" }, 401);
    }

    // Check config BEFORE the compare-and-swap so a disabled mailer never burns
    // welcomed_at — the user can still be welcomed once the secrets are set.
    if (!emailConfigured()) {
      console.error("[welcome-email] SKIP: RESEND_API_KEY / FROM_EMAIL not configured");
      return json({ status: "skipped", reason: "email-not-configured" });
    }

    // COMPARE-AND-SWAP: flip welcomed_at NULL → now() and read back whether THIS
    // call won. Any later sign-in finds welcomed_at already set and no-ops.
    const { data: swapped, error: swapErr } = await admin
      .from("profiles")
      .update({ welcomed_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("welcomed_at", null)
      .select("id, email, full_name");

    if (swapErr) {
      console.error(`[welcome-email] welcomed_at CAS failed for ${user.id}: ${swapErr.message}`);
      return json({ error: "Could not record welcome" }, 500);
    }
    if (!swapped || swapped.length === 0) {
      // Already welcomed (or profile row missing) — nothing to send.
      return json({ status: "already-welcomed" });
    }

    const profile = swapped[0] as { email: string | null; full_name: string | null };
    const email = profile.email?.trim() || user.email?.trim() || null;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name = (profile.full_name?.trim()) ||
      String(meta.full_name ?? meta.name ?? "").trim() ||
      "there";

    if (!email) {
      console.error(`[welcome-email] no email on file for ${user.id} — skipping send`);
      return json({ status: "no-email" });
    }

    const base = (Deno.env.get("FRONTEND_URL") ?? "").trim().replace(/\/+$/, "");
    const showsUrl = base ? `${base}/shows` : null;

    const subject = `Welcome to ${VENUE_SHORT_NAME}`;

    const text = [
      `${VENUE_SHORT_NAME} — Welcome`,
      ``,
      `Hi ${name},`,
      ``,
      `Welcome to ${VENUE_SHORT_NAME}! Your account is ready.`,
      `Browse what's on and book your seats whenever you like${showsUrl ? ` at ${showsUrl}` : ""}.`,
      ``,
      `See you at the theater!`,
      ``,
      `— ${VENUE_SHORT_NAME}`,
    ].join("\n");

    const bodyHtml = `                <p style="margin:0 0 6px;color:#111827;font-size:16px;">Hi ${esc(name)},</p>
                <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:21px;">
                  Welcome to <strong style="color:#111827;">${esc(VENUE_SHORT_NAME)}</strong>! Your account is ready.
                </p>
                <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:21px;">
                  Browse what's on and book your seats whenever you like. We can't wait to see you at the theater.
                </p>${
      showsUrl
        ? `
                <a href="${esc(showsUrl)}" style="display:inline-block;background:#C8102E;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">Browse shows</a>`
        : ""
    }`;

    const html = renderEmailShell({
      eyebrow: "WELCOME",
      bodyHtml,
      footerNote: `${VENUE_SHORT_NAME} — this is an automated message, please do not reply.`,
    });

    try {
      await sendViaResend({ to: email, subject, html, text });
      console.log(`[welcome-email] sent to ${email} for user ${user.id}`);
    } catch (sendErr) {
      // Non-fatal: welcomed_at is already flipped, so we won't retry. Log only.
      const m = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error(`[welcome-email] send failed (non-fatal) for ${user.id}: ${m}`);
      return json({ status: "send-failed" });
    }

    return json({ status: "sent" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-welcome-email error:", message);
    return json({ error: message }, 500);
  }
});
