import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailConfigured } from "../_shared/resend.ts";
import { collectShowtimeRecipients, sendBroadcastEmail } from "../_shared/send-booking-email.ts";

// ─────────────────────────────────────────────────────────────────────────
// SHOWTIME BROADCAST — admin message to a performance's paid ticket holders.
//
// Triggered from the ADMIN UI (ShowtimesSection) by a logged-in admin, so —
// unlike the cron-driven send-showtime-reminders — it is authenticated with the
// admin's own USER JWT, NEVER the service-role key (which must stay server-side;
// the browser never holds it). config.toml therefore sets verify_jwt = true so
// an unauthenticated call is rejected at the edge, and we ADDITIONALLY confirm
// the caller's profile role is 'admin' before doing anything.
//
// Two modes:
//   • preview  → returns { recipient_count } so the UI can show "message N
//                ticket holders" before the admin confirms. Sends nothing.
//   • send     → resolves the deduped recipients and emails each one, with a
//                per-recipient try/catch (one bad address never aborts the run).
//
// Recipient resolution + dedup + the branded email live in the shared email
// layer (_shared/send-booking-email.ts), so this matches every other email.
// ─────────────────────────────────────────────────────────────────────────

const MAX_RECIPIENTS = 1000;   // headroom over the 500-seat house; guards runaways
const MAX_SUBJECT_LEN = 200;
const MAX_BODY_LEN = 5000;

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    if (!serviceKey || !supabaseUrl) {
      console.error("send-showtime-broadcast misconfigured — missing Supabase env");
      return json({ error: "Broadcast is temporarily unavailable." }, 500);
    }

    // Service-role client: bypasses RLS to read every paid booking's recipient
    // and to look up the caller's role. Server-only; the key never leaves here.
    const admin = createClient(supabaseUrl, serviceKey);

    // ── AUTH ── verify_jwt already guaranteed a valid project JWT, but that
    // includes any logged-in customer — so confirm the caller is an ADMIN.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    const caller = userRes?.user;
    if (userErr || !caller) {
      return json({ error: "Unauthorized" }, 401);
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return json({ error: "Forbidden" }, 403);
    }

    const { showtime_id, subject, body, preview } = await req.json().catch(() => ({}));
    if (!showtime_id) {
      return json({ error: "Missing showtime_id" }, 400);
    }

    // For a real send the subject + body must be valid — check BEFORE the (more
    // expensive) recipient resolution so a malformed request fails fast. Preview
    // needs neither: it only reports the count.
    const cleanSubject = String(subject ?? "").trim();
    const cleanBody = String(body ?? "").trim();
    if (!preview) {
      if (!cleanSubject || !cleanBody) {
        return json({ error: "Subject and message are required" }, 400);
      }
      if (cleanSubject.length > MAX_SUBJECT_LEN || cleanBody.length > MAX_BODY_LEN) {
        return json({ error: "Subject or message is too long" }, 400);
      }
    }

    // Resolve the deduped recipients (also used for the preview count).
    const { recipients, showTitle, when } = await collectShowtimeRecipients(admin, showtime_id);

    if (preview) {
      return json({ recipient_count: recipients.length });
    }

    // Skip cleanly (not an error) if the mailer isn't configured — mirrors the
    // other senders so a missing RESEND key never looks like a broadcast bug.
    if (!emailConfigured()) {
      console.error("[broadcast] SKIP: RESEND_API_KEY / FROM_EMAIL not configured");
      return json({ status: "skipped", reason: "email-not-configured", recipients: recipients.length });
    }

    if (recipients.length === 0) {
      return json({ recipients: 0, sent: 0, failed: 0 });
    }

    const targets = recipients.slice(0, MAX_RECIPIENTS);
    if (recipients.length > MAX_RECIPIENTS) {
      console.warn(
        `[broadcast] ${recipients.length} recipients exceeds cap ${MAX_RECIPIENTS}; sending to the first ${MAX_RECIPIENTS}`,
      );
    }

    console.log(
      `[broadcast] admin ${caller.id} → showtime ${showtime_id}: ${targets.length} recipient(s), subject "${cleanSubject}"`,
    );

    // Per-recipient try/catch: one bad address logs and is counted, never aborts.
    let sent = 0;
    let failed = 0;
    for (const recipient of targets) {
      try {
        await sendBroadcastEmail(recipient, cleanSubject, cleanBody, { showTitle, when });
        sent++;
      } catch (err) {
        failed++;
        const m = err instanceof Error ? err.message : String(err);
        console.error(`[broadcast] send failed (non-fatal) for ${recipient.email}: ${m}`);
      }
    }

    return json({ recipients: targets.length, sent, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-showtime-broadcast error:", message);
    return json({ error: message }, 500);
  }
});
