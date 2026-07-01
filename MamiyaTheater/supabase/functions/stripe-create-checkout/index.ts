import "@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe";
import { createClient } from "npm:@supabase/supabase-js@2";

// STRIPE_SECRET_KEY lives ONLY in the Edge Function env — never in the client.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

// Where to send the browser back after Stripe's hosted page. Defaults to the
// local dev server; set FRONTEND_URL via `supabase secrets set` in prod.
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ?? "http://localhost:3000";

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

    // Service-role client: bypasses RLS so we can read any booking and write a
    // payments row. Runs server-side only; the key never reaches the client.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Load the reserved booking + its showtime price, and RECOMPUTE the amount
    // server-side (num_tickets × price). The client never dictates the total.
    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select("id, num_tickets, payment_status, movie_title, showtimes(price)")
      .eq("id", booking_id)
      .single();

    if (bookingErr || !booking) {
      return json({ error: "Booking not found" }, 404);
    }
    if (booking.payment_status === "paid") {
      return json({ error: "Booking already paid" }, 409);
    }

    const price = Number((booking as any).showtimes?.price ?? 0);
    const numTickets = Number(booking.num_tickets ?? 0);
    const amount = price * numTickets;
    if (!(amount > 0)) {
      return json({ error: "Invalid booking amount" }, 400);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: booking.id,
      metadata: { booking_id: booking.id },
      line_items: [
        {
          quantity: numTickets,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(price * 100), // cents
            product_data: {
              name: booking.movie_title ?? "Mamiya Theater ticket",
            },
          },
        },
      ],
      success_url: `${FRONTEND_URL}/?checkout=success&booking=${booking.id}`,
      cancel_url: `${FRONTEND_URL}/?checkout=cancel&booking=${booking.id}`,
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
    const message = err instanceof Error ? err.message : String(err);
    console.error("stripe-create-checkout error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
