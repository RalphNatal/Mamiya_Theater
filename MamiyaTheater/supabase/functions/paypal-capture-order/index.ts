import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// PayPal REST credentials live ONLY in the Edge Function env — never the client.
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
    const { order_id } = await req.json();
    if (!order_id) {
      return json({ error: "Missing order_id" }, 400);
    }

    // Service-role client: bypasses RLS to write the finalization. Server-only.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Tie the PayPal order back to our booking via the payments row written by
    // paypal-create-order (provider_ref = PayPal order id).
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id, booking_id, amount, status")
      .eq("provider_ref", order_id)
      .eq("provider", "paypal")
      .single();

    if (payErr || !payment) {
      return json({ error: "Payment not found for order" }, 404);
    }

    // Load the booking + its authoritative server-side price. The expected
    // amount is RECOMPUTED (num_tickets × showtimes.price) — never trusted from
    // the client or from the PayPal response alone.
    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select(
        "id, showtime_id, num_tickets, total_price, payment_status, showtimes(price)",
      )
      .eq("id", payment.booking_id)
      .single();

    if (bookingErr || !booking) {
      return json({ error: "Booking not found" }, 404);
    }

    // ── IDEMPOTENCY ── already finalized (double onApprove, retry, refresh):
    // no-op success without re-capturing (PayPal rejects a second capture).
    if (booking.payment_status === "paid") {
      return json({ status: "COMPLETED", booking_id: booking.id });
    }

    // Capture the funds.
    const accessToken = await getAccessToken();
    const capRes = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${order_id}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    const capture = await capRes.json();

    const captureUnit =
      capture?.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
    const capturedStatus = capture?.status;
    const capturedAmount = Number(captureUnit?.amount?.value ?? NaN);

    const price = Number((booking as any).showtimes?.price ?? 0);
    const expected = price * Number(booking.num_tickets ?? 0);

    // ── ANTI-TAMPERING ── require an actual COMPLETED capture whose amount
    // matches the server-recomputed total (within a cent for float safety).
    const amountOk = Number.isFinite(capturedAmount) &&
      Math.abs(capturedAmount - expected) < 0.01;

    if (!capRes.ok || capturedStatus !== "COMPLETED" || !amountOk) {
      console.error(
        "PayPal capture rejected:",
        JSON.stringify({ capRes: capRes.status, capturedStatus, capturedAmount, expected }),
      );
      await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
      return json(
        { error: "Payment could not be completed", status: capturedStatus ?? "FAILED" },
        400,
      );
    }

    // ── FINALIZE ── the SAME outcome the Stripe webhook produces:
    // 1. payments row → succeeded.
    await admin
      .from("payments")
      .update({ status: "succeeded" })
      .eq("id", payment.id);

    // 2. booking → paid + confirmed.
    await admin
      .from("bookings")
      .update({ payment_status: "paid", status: "confirmed" })
      .eq("id", booking.id);

    // 3. Decrement showtime inventory now that the sale is real. Only reached
    //    on the first unpaid→paid transition (the idempotency guard above
    //    returns before here on repeats), so the counter is never
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

    return json({ status: "COMPLETED", booking_id: booking.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("paypal-capture-order error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
