import "@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe";
import { createClient } from "npm:@supabase/supabase-js@2";

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

          // 2. Flip the booking to paid + confirmed.
          await admin
            .from("bookings")
            .update({ payment_status: "paid", status: "confirmed" })
            .eq("id", bookingId);

          // 3. Decrement showtime inventory now that the sale is real. Only
          //    applied on this first (unpaid→paid) transition, so the counter
          //    is never double-decremented on a duplicate delivery.
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

          console.log("Finalize: booking confirmed & paid:", bookingId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Finalize error:", message);
        // Fall through and still return 200 — see note below.
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
