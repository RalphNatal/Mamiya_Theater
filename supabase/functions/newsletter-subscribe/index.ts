import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────
// NEWSLETTER SUBSCRIBE — stores an email from the footer "Join" form.
//
// Kept server-side (service role) so there's no client insert policy on the
// subscribers table. Validates the address, lower-cases it for consistent
// deduping, and upserts with ON CONFLICT DO NOTHING so a repeat sign-up is a
// graceful success rather than a unique-violation error.
// ─────────────────────────────────────────────────────────────────────────

// Mirror of the client's EMAIL_REGEX (src/lib/validation.ts) — re-validate
// server-side so a crafted request bypassing the UI still can't store garbage.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Fail fast if deployed without the secrets needed to write the row.
    const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
      .filter((k) => !Deno.env.get(k));
    if (missing.length) {
      console.error("newsletter-subscribe misconfigured — missing secrets:", missing.join(", "));
      return json({ error: "Subscriptions are temporarily unavailable." }, 500);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request." }, 400);
    }

    const email = String((body as Record<string, unknown>).email ?? "")
      .trim()
      .toLowerCase();

    if (!email || !EMAIL_REGEX.test(email)) {
      return json({ error: "Please provide a valid email address." }, 400);
    }

    // Service-role client: bypasses RLS so we can insert without a client policy.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Upsert with ON CONFLICT DO NOTHING: an already-subscribed email is a
    // no-op, so re-subscribing succeeds instead of erroring on the UNIQUE(email).
    const { error: upsertErr } = await admin
      .from("subscribers")
      .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });

    if (upsertErr) {
      console.error("newsletter-subscribe: upsert failed:", upsertErr.message);
      return json({ error: "Could not subscribe you. Please try again." }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    // Log the real cause; return a generic message so we never leak internals.
    const message = err instanceof Error ? err.message : String(err);
    console.error("newsletter-subscribe error:", message);
    return json({ error: "Could not subscribe you. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
