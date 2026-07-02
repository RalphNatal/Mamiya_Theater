import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// PayPal REST credentials live ONLY in the Edge Function env — never the client.
// PAYPAL_BASE_URL is the sandbox host in test mode
// (https://api-m.sandbox.paypal.com) and the live host in production.
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
const PAYPAL_SECRET = Deno.env.get("PAYPAL_SECRET") ?? "";
const PAYPAL_BASE_URL = Deno.env.get("PAYPAL_BASE_URL") ??
  "https://api-m.sandbox.paypal.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Exchange the client-id/secret for a short-lived OAuth access token.
async function getAccessToken(): Promise<string> {
  const basic = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal OAuth failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { booking_id } = await req.json();
    if (!booking_id) {
      return json({ error: "Missing booking_id" }, 400);
    }

    // Service-role client: bypasses RLS to read any booking + write a payments
    // row. Runs server-side only; the key never reaches the client.
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
    const total = price * numTickets;
    if (!(total > 0)) {
      return json({ error: "Invalid booking amount" }, 400);
    }

    const accessToken = await getAccessToken();

    // Create a CAPTURE-intent order. custom_id carries our booking id so the
    // capture step (and any future webhook) can tie the payment back to it.
    const orderRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: booking.id,
            description: booking.movie_title ?? "Mamiya Theater ticket",
            amount: { currency_code: "USD", value: total.toFixed(2) },
          },
        ],
      }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok || !order.id) {
      console.error("PayPal create order failed:", JSON.stringify(order));
      return json({ error: "Could not create PayPal order" }, 502);
    }

    // Record the attempt keyed by the PayPal order id. paypal-capture-order
    // flips this to 'succeeded' once the capture confirms COMPLETED.
    const { error: payErr } = await admin.from("payments").insert({
      booking_id: booking.id,
      provider: "paypal",
      provider_ref: order.id,
      amount: total,
      currency: "usd",
      status: "pending",
    });
    if (payErr) {
      console.error("Failed to insert payment row:", payErr.message);
      return json({ error: "Could not start checkout" }, 500);
    }

    return json({ id: order.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("paypal-create-order error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
