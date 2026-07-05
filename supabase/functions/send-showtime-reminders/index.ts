import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailConfigured } from "../_shared/resend.ts";
import {
  BOOKING_EMAIL_COLUMNS,
  type BookingEmailRow,
  sendReminderEmail,
} from "../_shared/send-booking-email.ts";

// ─────────────────────────────────────────────────────────────────────────
// SHOWTIME REMINDERS — scheduled batch, exactly-once.
//
// Triggered hourly by pg_cron via pg_net (see the schedule migration). Each run
// CLAIMS up to BATCH_LIMIT paid bookings whose show is within the next ~25h and
// still unreminded, by flipping reminded_at NULL → now() with the flip itself as
// the guard (invariant #3) — so overlapping runs, or the same booking across
// runs, remind exactly once. Reminder delivery is non-fatal (per-booking
// try/catch); a Resend failure just logs and never retries that row.
//
// Auth: the cron calls this with the service-role key as the bearer, so we
// require exactly that — this endpoint is not meant to be publicly triggerable.
// ─────────────────────────────────────────────────────────────────────────

const WINDOW_HOURS = 25;       // remind for shows within the next ~24–25 hours
const BATCH_LIMIT = 100;       // cap per run; a backlog drains over hourly runs

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

  // Gate: only the scheduler (which passes the service-role key) may run this.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!serviceKey || token !== serviceKey) {
    return json({ error: "Forbidden" }, 403);
  }

  // Skip BEFORE claiming so a disabled mailer never burns reminded_at flags.
  if (!emailConfigured()) {
    console.error("[reminders] SKIP: RESEND_API_KEY / FROM_EMAIL not configured");
    return json({ status: "skipped", reason: "email-not-configured" });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
    );

    const nowISO = new Date().toISOString();
    const cutoffISO = new Date(Date.now() + WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    // 1. Find due bookings (capped). Soonest first so the nearest shows win the
    //    batch if a backlog ever exceeds BATCH_LIMIT.
    const { data: due, error: dueErr } = await admin
      .from("bookings")
      .select("id")
      .eq("payment_status", "paid")
      .is("reminded_at", null)
      .gt("show_start_time", nowISO)
      .lte("show_start_time", cutoffISO)
      .order("show_start_time", { ascending: true })
      .limit(BATCH_LIMIT);

    if (dueErr) {
      console.error(`[reminders] query failed: ${dueErr.message}`);
      return json({ error: dueErr.message }, 500);
    }
    const ids = (due ?? []).map((r) => (r as { id: string }).id);
    if (ids.length === 0) {
      return json({ claimed: 0, sent: 0, failed: 0 });
    }

    // 2. CLAIM: flip reminded_at only for rows still unreminded, and read back
    //    which ones THIS run won (the `.is("reminded_at", null)` guard makes the
    //    claim atomic vs. a concurrent run). Only claimed rows are emailed.
    const { data: claimed, error: claimErr } = await admin
      .from("bookings")
      .update({ reminded_at: nowISO })
      .in("id", ids)
      .is("reminded_at", null)
      .select(BOOKING_EMAIL_COLUMNS);

    if (claimErr) {
      console.error(`[reminders] claim failed: ${claimErr.message}`);
      return json({ error: claimErr.message }, 500);
    }

    const rows = (claimed ?? []) as BookingEmailRow[];
    console.log(`[reminders] claimed ${rows.length} booking(s) to remind`);

    // 3. Send. Per-booking try/catch keeps one bad recipient from aborting the
    //    batch; the row is already claimed, so a failure just won't retry.
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await sendReminderEmail(admin, row);
        sent++;
      } catch (err) {
        failed++;
        const m = err instanceof Error ? err.message : String(err);
        console.error(`[reminders] send failed (non-fatal) for ${row.id}: ${m}`);
      }
    }

    return json({ claimed: rows.length, sent, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-showtime-reminders error:", message);
    return json({ error: message }, 500);
  }
});
