import "@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBookingConfirmationEmail } from "../_shared/send-booking-email.ts";

// STRIPE_SECRET_KEY lives ONLY in the Edge Function env — never in the client.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─────────────────────────────────────────────────────────────────────────
// SYNCHRONOUS FALLBACK FINALIZER for Stripe Checkout.
//
// The stripe-webhook is the primary finalizer, but it is asynchronous and can
// be delayed, misconfigured, or unreachable (e.g. local dev without a tunnel).
// When that happens the buyer is charged but the booking never flips to paid,
// so the confirmation screen polls forever. This function lets the client
// ACTIVELY confirm: it asks Stripe whether the Checkout Session was paid and,
// if so, applies the EXACT same finalization the webhook does — idempotently.
//
// It never moves money and it never trusts the client for anything but the
// booking id: the payment status and the amount both come from Stripe.
// ─────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { booking_id } = await req.json();
    if (!booking_id) {
      return json({ error: "Missing booking_id" }, 400);
    }

    // Service-role client: bypasses RLS to read any booking and write the
    // finalization. Runs server-side only; the key never reaches the client.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select("id, showtime_id, num_tickets, payment_status, showtimes(price)")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return json({ error: "Booking not found" }, 404);
    }

    // ── IDEMPOTENCY ── already finalized (by the webhook, or an earlier verify
    // poll): report paid without touching anything again.
    if (booking.payment_status === "paid") {
      return json({ status: "paid", booking_id: booking.id });
    }

    // Find the Stripe Checkout Session for this booking via the payments row
    // written by stripe-create-checkout (provider_ref = session id). Newest
    // first, so a retried checkout uses the latest attempt.
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id, provider_ref")
      .eq("booking_id", booking.id)
      .eq("provider", "stripe")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // No Stripe attempt on this booking (e.g. it's a PayPal booking, or the
    // buyer never reached Stripe). Nothing to verify — leave it as-is.
    if (payErr || !payment?.provider_ref) {
      return json({ status: booking.payment_status, booking_id: booking.id });
    }

    // Ask Stripe for the authoritative payment status of the session.
    const session = await stripe.checkout.sessions.retrieve(payment.provider_ref);

    // Not paid yet (still processing, or the buyer abandoned the page). Report
    // back so the client keeps polling; the webhook may still land too.
    if (session.payment_status !== "paid") {
      return json({ status: booking.payment_status, booking_id: booking.id });
    }

    // ── ANTI-TAMPERING ── the session must have collected the amount we
    // recompute server-side (num_tickets × price), in cents.
    const price = Number((booking as any).showtimes?.price ?? 0);
    const expectedCents = Math.round(price * 100) * Number(booking.num_tickets ?? 0);
    if (Number(session.amount_total ?? -1) !== expectedCents) {
      console.error(
        "Verify: amount mismatch",
        JSON.stringify({ amount_total: session.amount_total, expectedCents, booking_id: booking.id }),
      );
      return json({ error: "Payment amount mismatch" }, 400);
    }

    // ── FINALIZE ── identical outcome to the stripe-webhook:
    // 1. payments row → succeeded (matched on the session id).
    await admin
      .from("payments")
      .update({ status: "succeeded" })
      .eq("booking_id", booking.id)
      .eq("provider_ref", session.id);

    // 2. booking → paid + confirmed. Guarded to only flip a still-unpaid row,
    //    and we read back whether THIS call actually flipped it. The webhook
    //    and this verify path can run concurrently; gating the inventory
    //    decrement on the flipped row means exactly one of them decrements.
    const { data: flipped } = await admin
      .from("bookings")
      .update({ payment_status: "paid", status: "confirmed" })
      .eq("id", booking.id)
      .neq("payment_status", "paid")
      .select("id");

    // Someone else (the webhook, or a concurrent verify) already finalized —
    // they own the decrement, so we stop here.
    if (!flipped || flipped.length === 0) {
      return json({ status: "paid", booking_id: booking.id });
    }

    // 3. Decrement showtime inventory now that the sale is real. Reached only
    //    by the single call that won the flip above, so the counter is never
    //    double-decremented.
    if (booking.showtime_id) {
      const { data: st } = await admin
        .from("showtimes")
        .select("available_seats")
        .eq("id", booking.showtime_id)
        .single();
      const remaining = Math.max(
        0,
        Number(st?.available_seats ?? 0) - Number(booking.num_tickets ?? 0),
      );
      await admin
        .from("showtimes")
        .update({ available_seats: remaining })
        .eq("id", booking.showtime_id);
    }

    console.log("Verify: booking confirmed & paid:", booking.id);

    // 4. Send the confirmation email. This synchronous verify path can win the
    //    flip against the async webhook (webhook delayed/unreachable), in which
    //    case the webhook no-ops and never emails — so the same send lives here.
    //    Reached only by the single call that won the flip above, so it fires
    //    exactly once. Email delivery must NEVER fail finalization: swallow any
    //    error and still report paid to the client.
    try {
      await sendBookingConfirmationEmail(admin, booking.id);
    } catch (emailErr) {
      const m = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error("Verify: confirmation email failed (non-fatal):", booking.id, m);
    }

    return json({ status: "paid", booking_id: booking.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("stripe-verify-checkout error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
