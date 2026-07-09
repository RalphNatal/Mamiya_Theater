import "@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBookingConfirmationEmail, sendPaymentFailedEmail } from "../_shared/send-booking-email.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", {
      status: 400,
      headers: corsHeaders,
    });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Webhook signature verification failed:", message);
    return new Response(`Webhook Error: ${message}`, {
      status: 400,
      headers: corsHeaders,
    });
  }

  console.log("Received event:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log("checkout.session.completed id:", session.id);
    console.log("metadata:", session.metadata);

    // ── FINALIZE (phase 2) ── flip the reserved booking to paid/confirmed,
    // mark its payment succeeded, and decrement the showtime inventory.
    // Idempotent: Stripe may deliver this event more than once, so if the
    // booking is already paid we no-op.
    const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
    if (!bookingId) {
      console.error("checkout.session.completed had no booking_id");
    } else {
      try {
        // NEW service-role client — bypasses RLS to write the finalization.
        const admin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { data: booking, error: loadErr } = await admin
          .from("bookings")
          .select("id, showtime_id, num_tickets, payment_status")
          .eq("id", bookingId)
          .single();

        if (loadErr || !booking) {
          console.error("Finalize: booking not found:", bookingId, loadErr?.message);
        } else if (booking.payment_status === "paid") {
          // Already finalized by an earlier delivery — no-op.
          console.log("Finalize: booking already paid, skipping:", bookingId);
        } else {
          // 1. Mark the payment row succeeded (matched on the session id).
          await admin
            .from("payments")
            .update({ status: "succeeded" })
            .eq("booking_id", bookingId)
            .eq("provider_ref", session.id);

          // 2. Flip the booking to paid + confirmed. Guarded to only flip a
          //    still-unpaid row, reading back whether THIS delivery flipped it.
          //    A duplicate delivery, or a concurrent client-side verify
          //    (stripe-verify-checkout), can race here; gating the decrement on
          //    the flipped row means exactly one of them decrements.
          const { data: flipped } = await admin
            .from("bookings")
            .update({ payment_status: "paid", status: "confirmed" })
            .eq("id", bookingId)
            .neq("payment_status", "paid")
            .select("id");

          // Already finalized elsewhere — that path owns the decrement.
          if (!flipped || flipped.length === 0) {
            console.log("Finalize: booking already paid (raced), skipping:", bookingId);
            return new Response(JSON.stringify({ received: true }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // 3. Decrement showtime inventory now that the sale is real. Reached
          //    only by the single path that won the flip above, so the counter
          //    is never double-decremented on a duplicate delivery. The
          //    subtraction runs inside one atomic UPDATE (decrement_showtime_seats)
          //    so two different bookings finalizing for the same showtime
          //    concurrently can't lose each other's decrement.
          if (booking.showtime_id) {
            await admin.rpc("decrement_showtime_seats", {
              p_showtime_id: booking.showtime_id,
              p_n: Number(booking.num_tickets ?? 0),
            });
          }

          console.log("Finalize: booking confirmed & paid:", bookingId);

          // 4. Send the confirmation email. Reached ONLY on the single delivery
          //    that won the unpaid→paid flip above, so it fires exactly once —
          //    never on a duplicate delivery (which no-ops before here). Email
          //    delivery must NEVER fail finalization: swallow any error and
          //    still return 200 to Stripe.
          try {
            await sendBookingConfirmationEmail(admin, bookingId);
          } catch (emailErr) {
            const m = emailErr instanceof Error ? emailErr.message : String(emailErr);
            console.error("Finalize: confirmation email failed (non-fatal):", bookingId, m);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Finalize error:", message);
        // Fall through and still return 200 — see note below.
      }
    }
  } else if (event.type === "checkout.session.async_payment_failed") {
    // A previously-pending async payment (e.g. a delayed bank debit) has
    // DEFINITIVELY failed — the seats can't be sold to this buyer. This is a
    // real "your payment didn't go through", distinct from an abandoned/expired
    // session (see the TODO below). Notify the buyer; the sweep reclaims the hold.
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
    if (!bookingId) {
      console.error("async_payment_failed had no booking_id");
    } else {
      try {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        // Mark the payment attempt failed (matched on the session id).
        await admin
          .from("payments")
          .update({ status: "failed" })
          .eq("booking_id", bookingId)
          .eq("provider_ref", session.id);

        // Notify the buyer (non-fatal). We don't delete the booking here — the
        // reserved/pending hold is reclaimed on its own by the pg_cron sweep
        // (cleanup_expired_reservations), and leaving the row avoids racing any
        // late finalization. Email delivery must never break the 200 to Stripe.
        try {
          await sendPaymentFailedEmail(admin, bookingId);
        } catch (emailErr) {
          const m = emailErr instanceof Error ? emailErr.message : String(emailErr);
          console.error("async_payment_failed: email failed (non-fatal):", bookingId, m);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("async_payment_failed handling error:", message);
      }
    }
  }

  // TODO(decision): abandoned holds. checkout.session.expired fires when a
  // Checkout session times out unpaid (the customer walked away). Those seats
  // are already reclaimed by cleanup_expired_reservations (the pg_cron sweep),
  // so we deliberately do NOT email on expiry — mailing someone who abandoned
  // checkout risks unwanted "payment failed" noise. Revisit only if a gentle,
  // opt-in "your held seats were released" nudge is ever wanted.

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
