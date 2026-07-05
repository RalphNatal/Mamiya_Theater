import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { finalizePaypalBooking } from "../_shared/finalize-paypal-booking.ts";

// ─────────────────────────────────────────────────────────────────────────
// PAYPAL WEBHOOK — server-to-server finalization backstop.
//
// The client-triggered paypal-capture-order finalizes on a good day, but if the
// buyer's browser drops between PayPal capturing the funds and our capture
// response returning, nothing reconciles the booking. This webhook is that
// reconciler: on a signature-verified PAYMENT.CAPTURE.COMPLETED it resolves the
// booking and runs the SAME idempotent finalize the capture uses, so an
// interrupted purchase still ends up paid/confirmed with inventory decremented
// once and one email sent — the PayPal analogue of Stripe's webhook.
//
// It does NOT capture (PAYMENT.CAPTURE.COMPLETED means PayPal already did) — it
// only reconciles our own tables via the service role.
//
// Required secrets (see supabase/functions/.env.example):
//   PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_BASE_URL, PAYPAL_WEBHOOK_ID,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────

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

  // Fail fast if misconfigured: without these we can neither verify the
  // signature nor write the finalization. A clear 500 beats silently trusting
  // (or silently dropping) inbound events.
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

  // ── SIGNATURE VERIFICATION ── the PayPal analogue of Stripe's signature
  // check; NEVER skipped. PayPal signs each webhook; we hand the transmission
  // headers + our webhook id + the event to PayPal's verify API, which
  // recomputes the signature against PayPal's cert and tells us if it's real.
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
    // paypal-create-order stamps custom_id = booking id on the purchase unit,
    // which PayPal propagates onto the capture. The order id (our payments
    // provider_ref) rides along under supplementary_data.related_ids.
    const customId = (resource.custom_id as string | undefined)?.trim() || undefined;
    const orderId = (resource.supplementary_data?.related_ids?.order_id as string | undefined)?.trim() || undefined;

    // Resolve the booking + the exact order ref via the payments row, mirroring
    // the capture path's linkage. Prefer the order id; fall back to custom_id
    // (= booking id) if the event didn't carry the order id.
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
      // 200 so PayPal doesn't retry-storm an event we can't map — there is
      // nothing for us to finalize.
      return json({ received: true, unresolved: true });
    }

    // Idempotent finalize: a no-op if the client capture already finalized it,
    // the reconciler otherwise. Return 200 regardless.
    const result = await finalizePaypalBooking(admin, bookingId, orderRef);
    return json({ received: true, finalized: result.finalized, reason: result.reason });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("paypal-webhook finalize error:", m);
    // Return 200 so PayPal doesn't retry-storm on a transient hiccup we've
    // logged; a later delivery (or the client capture) will reconcile.
    return json({ received: true });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
