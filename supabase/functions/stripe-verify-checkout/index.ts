import "@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBookingConfirmationEmail } from "../_shared/send-booking-email.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

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
    const { booking_id } = await req.json();
    if (!booking_id) {
      return json({ error: "Missing booking_id" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select("id, showtime_id, num_tickets, payment_status, total_price")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return json({ error: "Booking not found" }, 404);
    }

    if (booking.payment_status === "paid") {
      return json({ status: "paid", booking_id: booking.id });
    }

    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id, provider_ref")
      .eq("booking_id", booking.id)
      .eq("provider", "stripe")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payErr || !payment?.provider_ref) {
      return json({ status: booking.payment_status, booking_id: booking.id });
    }

    const session = await stripe.checkout.sessions.retrieve(payment.provider_ref);

    if (session.payment_status !== "paid") {
      return json({ status: booking.payment_status, booking_id: booking.id });
    }

    // The authoritative amount is the booking's total_price, which the RPC
    // already computed as the SUM of each seat's effective zone price + the flat
    // service fee. stripe-create-checkout split that exact total into its two
    // line items, so session.amount_total must equal it to the cent. Comparing
    // against total_price (not a re-derived flat price × quantity) is what keeps
    // this correct for zone-priced bookings.
    const expectedCents = Math.round(Number(booking.total_price ?? 0) * 100);
    if (Number(session.amount_total ?? -1) !== expectedCents) {
      console.error(
        "Verify: amount mismatch",
        JSON.stringify({ amount_total: session.amount_total, expectedCents, booking_id: booking.id }),
      );
      return json({ error: "Payment amount mismatch" }, 400);
    }

    await admin
      .from("payments")
      .update({ status: "succeeded" })
      .eq("booking_id", booking.id)
      .eq("provider_ref", session.id);

    const { data: flipped } = await admin
      .from("bookings")
      .update({ payment_status: "paid", status: "confirmed" })
      .eq("id", booking.id)
      .neq("payment_status", "paid")
      .select("id");

    if (!flipped || flipped.length === 0) {
      return json({ status: "paid", booking_id: booking.id });
    }

    // Atomic decrement (decrement_showtime_seats) — gated behind the flip above
    // so it's once-per-booking, and done in a single UPDATE so it can't lose a
    // concurrent different booking's decrement for the same showtime.
    if (booking.showtime_id) {
      await admin.rpc("decrement_showtime_seats", {
        p_showtime_id: booking.showtime_id,
        p_n: Number(booking.num_tickets ?? 0),
      });
    }

    console.log("Verify: booking confirmed & paid:", booking.id);

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
