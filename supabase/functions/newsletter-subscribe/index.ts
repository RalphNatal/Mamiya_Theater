import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { captchaOk, cleanText, clientIp, isRateLimited, type Limit } from "../_shared/abuse.ts";

// ─────────────────────────────────────────────────────────────────────────
// NEWSLETTER SUBSCRIBE — stores an email from the footer "Join" form.
//
// Kept server-side (service role) so there's no client insert policy on the
// subscribers table. Validates the address, lower-cases it for consistent
// deduping, and upserts with ON CONFLICT DO NOTHING so a repeat sign-up is a
// graceful success rather than a unique-violation error.
//
// Abuse controls (_shared/abuse.ts): a per-IP rate limit, and a Turnstile
// CAPTCHA once the TURNSTILE_SECRET_KEY secret is set.
// ─────────────────────────────────────────────────────────────────────────

// Mirror of the client's EMAIL_REGEX (src/lib/validation.ts) — re-validate
// server-side so a crafted request bypassing the UI still can't store garbage.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per IP. A real visitor subscribes once.
const RATE_LIMITS: Limit[] = [{ bucket: "newsletter_10m", windowSeconds: 600, max: 5 }];

Deno.serve(withCors(async (req) => {
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

    const b = body as Record<string, unknown>;
    const email = (cleanText(b.email, 254) ?? "").toLowerCase();

    if (!email || !EMAIL_REGEX.test(email)) {
      return json({ error: "Please provide a valid email address." }, 400);
    }

    // Service-role client: bypasses RLS so we can insert without a client policy.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const ip = clientIp(req);
    if (await isRateLimited(admin, ip, RATE_LIMITS)) {
      return json({ error: "Too many sign-ups from your connection. Please wait a few minutes and try again." }, 429);
    }
    if (!(await captchaOk(b.captcha_token, ip))) {
      return json({ error: "Please complete the verification and try again.", code: "captcha" }, 400);
    }

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
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
