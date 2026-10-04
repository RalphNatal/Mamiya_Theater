import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBookingConfirmationEmail } from "../_shared/send-booking-email.ts";

// ── confirm-free-booking: finalize a $0 order (free event / all-$0 seats /
// 'free' promo codes). Stripe and PayPal refuse a $0 charge, so this is the
// $0 analogue of stripe-verify-checkout: the confirm_free_booking RPC checks
// that the SERVER-priced total_price and fees_total are exactly 0, flips the
// hold to confirmed/paid once (compare-and-swap) and decrements inventory;
// only the call that wins that flip sends the confirmation email.
// verify_jwt = false like the other checkout functions: guests have no JWT, and
// the booking id (an unguessable uuid from create_pending_booking) is the
// capability — the RPC refuses anything that isn't a live $0 hold.

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
    const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !Deno.env.get(k));
    if (missing.length) {
      console.error("confirm-free-booking misconfigured — missing secrets:", missing.join(", "));
      return json({ error: "Booking is temporarily unavailable." }, 500);
    }

    const { booking_id } = await req.json();
    if (!booking_id) {
      return json({ error: "Missing booking_id" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error } = await admin.rpc("confirm_free_booking", { p_booking_id: booking_id });
    if (error) throw error;
    const status = (data as { status?: string } | null)?.status;

    if (status === "already_paid") {
      return json({ status: "paid", booking_id });
    }
    if (status !== "confirmed") {
      // not_found / not_reserved (hold expired or cancelled) / not_free (a
      // priced order must go through Stripe or PayPal).
      console.warn("confirm-free-booking refused", JSON.stringify({ booking_id, status }));
      const message = status === "not_free"
        ? "This order is not free — please pay by card or PayPal."
        : "Your reservation has expired. Please pick your seats again.";
      return json({ error: message, status }, 409);
    }

    console.log("confirm-free-booking: free booking confirmed:", booking_id);
    try {
      await sendBookingConfirmationEmail(admin, booking_id);
    } catch (emailErr) {
      const m = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error("confirm-free-booking: confirmation email failed (non-fatal):", booking_id, m);
    }

    return json({ status: "paid", booking_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("confirm-free-booking error:", message);
    return json({ error: "Could not confirm your free tickets. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
