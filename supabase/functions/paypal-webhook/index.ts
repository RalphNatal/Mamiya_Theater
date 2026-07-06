import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { finalizePaypalBooking } from "../_shared/finalize-paypal-booking.ts";

const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
const PAYPAL_SECRET = Deno.env.get("PAYPAL_SECRET") ?? "";
const PAYPAL_BASE_URL = Deno.env.get("PAYPAL_BASE_URL") ??
  "https://api-m.sandbox.paypal.com";
const PAYPAL_WEBHOOK_ID = Deno.env.get("PAYPAL_WEBHOOK_ID") ?? "";

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

  const missing = [
    "PAYPAL_CLIENT_ID",
    "PAYPAL_SECRET",
    "PAYPAL_WEBHOOK_ID",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((k) => !Deno.env.get(k));
  if (missing.length) {
    console.error("paypal-webhook misconfigured — missing secrets:", missing.join(", "));
    return json({ error: "Webhook not configured" }, 500);
  }

  // Read the raw body once and parse it. We need the parsed event both for the
  // verify call and for processing.
  const rawBody = await req.text();
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const certUrl = req.headers.get("paypal-cert-url");
  const authAlgo = req.headers.get("paypal-auth-algo");
  const transmissionSig = req.headers.get("paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    console.error("paypal-webhook: missing PayPal signature headers — rejecting");
    return json({ error: "Missing signature headers" }, 400);
  }

  let verificationStatus: string | undefined;
  try {
    const accessToken = await getAccessToken();
    const verifyRes = await fetch(
      `${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: certUrl,
          auth_algo: authAlgo,
          transmission_sig: transmissionSig,
          webhook_id: PAYPAL_WEBHOOK_ID,
          webhook_event: event,
        }),
      },
    );
    const body = await verifyRes.json().catch(() => ({}));
    verificationStatus = body?.verification_status;
    if (!verifyRes.ok) {
      console.error("paypal-webhook: verify API error:", verifyRes.status, JSON.stringify(body));
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("paypal-webhook: signature verification threw:", m);
    return json({ error: "Verification failed" }, 400);
  }

  if (verificationStatus !== "SUCCESS") {
    console.error("paypal-webhook: signature NOT verified — rejecting:", verificationStatus);
    return json({ error: "Invalid signature" }, 400);
  }

  // Only PAYMENT.CAPTURE.COMPLETED finalizes a booking. Ack anything else with
  // 200 so PayPal stops retrying an event we simply don't act on.
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return json({ received: true, ignored: event.event_type });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const resource = event.resource ?? {};
    const customId = (resource.custom_id as string | undefined)?.trim() || undefined;
    const orderId = (resource.supplementary_data?.related_ids?.order_id as string | undefined)?.trim() || undefined;

    const { data: payment } = orderId
      ? await admin.from("payments").select("booking_id, provider_ref")
        .eq("provider", "paypal").eq("provider_ref", orderId).limit(1).maybeSingle()
      : customId
      ? await admin.from("payments").select("booking_id, provider_ref")
        .eq("provider", "paypal").eq("booking_id", customId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
      : { data: null };

    const bookingId = (payment?.booking_id as string | undefined) ?? customId;
    const orderRef = (payment?.provider_ref as string | undefined) ?? orderId ?? "";

    if (!bookingId) {
      console.error(
        "paypal-webhook: could not resolve booking from event:",
        JSON.stringify({ customId, orderId, captureId: resource.id }),
      );
      return json({ received: true, unresolved: true });
    }

    const result = await finalizePaypalBooking(admin, bookingId, orderRef);
    return json({ received: true, finalized: result.finalized, reason: result.reason });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("paypal-webhook finalize error:", m);
    return json({ received: true });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
