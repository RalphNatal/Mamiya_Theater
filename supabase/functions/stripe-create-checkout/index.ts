import "@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SERVICE_FEE_USD, VENUE_SHORT_NAME } from "../_shared/venue.ts";

// STRIPE_SECRET_KEY lives ONLY in the Edge Function env — never in the client.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

// ── getBaseUrl: where to send the browser back after Stripe's hosted page ──
//
// The bug this fixes: success_url/cancel_url were pinned to a single value
// (localhost:3000), so the OTHER environment was redirected to a dead address —
// "localhost refused to connect" in production. We resolve the base URL per
// request instead, in this priority order:
//
//   1. FRONTEND_URL          — the canonical production domain, if configured.
//                              (This is the analogue of NEXT_PUBLIC_SITE_URL.)
//   2. the request Origin     — the site the buyer is actually on, but ONLY if
//                              it's in the allowlist, so this can never be turned
//                              into an open redirect. Lets local dev and any
//                              trusted deploy self-return with no extra config.
//   3. http://localhost:3000  — final dev fallback.
//
// NOTE on VERCEL_URL / NEXT_PUBLIC_*: this is NOT a Next.js route — the Checkout
// Session is created in a Supabase Edge Function (Deno) running on Supabase's
// infrastructure, where Vercel's build/runtime vars simply don't exist. So the
// canonical domain must come from the FRONTEND_URL secret, not process.env.VERCEL_URL.
const CANONICAL_URL = normalizeOrigin(Deno.env.get("FRONTEND_URL") ?? "");
const DEV_FALLBACK = "http://localhost:3000";

// Origins trusted for step 2. localhost:3000 (dev) works with zero config; add
// deploy domains via ALLOWED_ORIGINS (comma-separated), e.g.
// `supabase secrets set ALLOWED_ORIGINS=https://mamiya-theater.vercel.app`.
const ALLOWED_ORIGINS = new Set(
  [DEV_FALLBACK, CANONICAL_URL, ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",")]
    .map(normalizeOrigin)
    .filter(Boolean),
);

function getBaseUrl(req: Request): string {
  // 1. Canonical production domain wins when configured. (Leave FRONTEND_URL
  //    UNSET in your local functions env-file, or local checkout will redirect
  //    to production — step 2/3 handle dev.)
  if (CANONICAL_URL) return CANONICAL_URL;
  // 2. Otherwise return to the origin the request came from, if we trust it.
  const origin = normalizeOrigin(req.headers.get("origin") ?? "");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  // 3. Final dev fallback.
  return DEV_FALLBACK;
}

// Strip trailing slashes / whitespace so allowlist comparisons are exact.
function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

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
    // Fail fast with a clear, non-leaking error if the function was deployed
    // without its secrets. Otherwise a missing STRIPE_SECRET_KEY only surfaces
    // as an opaque Stripe auth error deep inside sessions.create, and a missing
    // service-role key silently returns no booking ("Booking not found").
    const missing = ["STRIPE_SECRET_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
      .filter((k) => !Deno.env.get(k));
    if (missing.length) {
      console.error("stripe-create-checkout misconfigured — missing secrets:", missing.join(", "));
      return json({ error: "Payment is temporarily unavailable." }, 500);
    }

    const { booking_id } = await req.json();
    if (!booking_id) {
      return json({ error: "Missing booking_id" }, 400);
    }

    // Service-role client: bypasses RLS so we can read any booking and write a
    // payments row. Runs server-side only; the key never reaches the client.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Load the reserved booking. total_price is the AUTHORITATIVE amount the RPC
    // already computed server-side — the SUM of each seat's effective zone price
    // PLUS the flat per-booking service fee (create_pending_booking). We trust
    // that summed total rather than re-deriving a flat price × quantity, which
    // would be wrong the moment a booking spans price zones. The client never
    // dictates the total. stripe-verify-checkout re-checks against this same
    // total_price.
    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select("id, num_tickets, payment_status, movie_title, total_price")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return json({ error: "Booking not found" }, 404);
    }
    if (booking.payment_status === "paid") {
      return json({ error: "Booking already paid" }, 409);
    }

    const numTickets = Number(booking.num_tickets ?? 0);
    const amount = Number(booking.total_price ?? 0);
    if (!(amount > 0)) {
      return json({ error: "Invalid booking amount" }, 400);
    }
    // Split the authoritative total into an itemized "Tickets" line + the flat
    // service-fee line so the buyer still sees the fee on Stripe's receipt. Done
    // in integer cents so the two lines sum to EXACTLY total_price (which is what
    // stripe-verify-checkout compares session.amount_total against). Seats can
    // span zones, so the ticket line is a single lump sum, not a per-seat unit.
    const feeCents = Math.round(SERVICE_FEE_USD * 100);
    const totalCents = Math.round(amount * 100);
    const ticketCents = totalCents - feeCents;

    // Checkout session lifetime. We pin this to Stripe's MINIMUM (30 min)
    // instead of the 24-hour default so an abandoned tab can't hold seats
    // hostage for a full day. This must stay in lock-step with the DB
    // reservation sweep: cleanup_expired_reservations() (run every 5 min by
    // pg_cron) frees a hold after a 35-minute TTL — deliberately LONGER than
    // this 30-minute window plus the seconds between reserving the booking and
    // creating this session — so a customer's seats can NEVER be freed while
    // their checkout page is still payable. If you change this, bump that TTL.
    const SESSION_TTL_SECONDS = 30 * 60; // 30 min — Stripe's minimum expires_at

    // Environment-aware return URL (canonical domain / trusted origin / dev
    // fallback) instead of a pinned localhost — see getBaseUrl above.
    const baseUrl = getBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      client_reference_id: booking.id,
      metadata: { booking_id: booking.id },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ticketCents, // lump ticket subtotal (may span zones)
            product_data: {
              name: booking.movie_title
                ? `${booking.movie_title} (${numTickets} ticket${numTickets === 1 ? "" : "s"})`
                : `${VENUE_SHORT_NAME} tickets`,
            },
          },
        },
        // Flat per-booking service fee as its own line item so the buyer sees it
        // itemized on Stripe's receipt (quantity 1 — it's per order, not per seat).
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: feeCents,
            product_data: { name: "Service fee" },
          },
        },
      ],
      success_url: `${baseUrl}/?checkout=success&booking=${booking.id}`,
      cancel_url: `${baseUrl}/?checkout=cancel&booking=${booking.id}`,
    });

    // Record the attempt. The webhook flips this to 'succeeded' on completion.
    const { error: payErr } = await admin.from("payments").insert({
      booking_id: booking.id,
      provider: "stripe",
      provider_ref: session.id,
      amount,
      currency: "usd",
      status: "pending",
    });
    if (payErr) {
      console.error("Failed to insert payment row:", payErr.message);
      return json({ error: "Could not start checkout" }, 500);
    }

    return json({ url: session.url });
  } catch (err) {
    // Log the real cause server-side; return a generic message so we never leak
    // Stripe/DB internals (keys, SQL, stack traces) to the browser.
    const message = err instanceof Error ? err.message : String(err);
    console.error("stripe-create-checkout error:", message);
    return json({ error: "Could not start checkout. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
