import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { finalizePaypalBooking } from "../_shared/finalize-paypal-booking.ts";
import { sendPaymentFailedEmail } from "../_shared/send-booking-email.ts";

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

      // Explicit failure: tell the buyer their payment didn't go through. We do
      // NOT delete the booking here — leaving the reserved/pending hold in place
      // preserves the paypal-webhook recovery path (if this capture actually
      // COMPLETED on PayPal's side but our response was lost, a later
      // PAYMENT.CAPTURE.COMPLETED can still finalize it). Otherwise the hold is
      // reclaimed on its own by cleanup_expired_reservations (the pg_cron sweep).
      // Email is non-fatal — a send failure must not change the 400 we return.
      try {
        await sendPaymentFailedEmail(admin, booking.id);
      } catch (emailErr) {
        const m = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error(`paypal-capture-order: payment-failed email failed (non-fatal): ${booking.id} ${m}`);
      }

      return json(
        { error: "Payment could not be completed", status: capturedStatus ?? "FAILED" },
        400,
      );
    }

    // ── FINALIZE ── idempotent, and SHARED with the paypal-webhook backstop
    // (../_shared/finalize-paypal-booking.ts) so a captured-but-interrupted
    // purchase reconciles to the exact same outcome. The amount was verified
    // above; this marks the payment succeeded, COMPARE-AND-SWAPs the booking to
    // paid/confirmed, and — only if THIS call won that flip — decrements
    // inventory and sends the email. Mirrors the Stripe webhook (invariant #3).
    // We still return COMPLETED to the client either way: the booking is paid
    // whether this call or a racing webhook delivery flipped it.
    await finalizePaypalBooking(admin, booking.id, order_id);

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
