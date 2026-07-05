// ─────────────────────────────────────────────────────────────────────────
// SHARED PAYPAL FINALIZE
//
// The single, idempotent "mark this booking paid" routine used by BOTH PayPal
// finalization paths:
//   • paypal-capture-order  — the client-triggered capture (onApprove)
//   • paypal-webhook        — the server-to-server backstop (PAYMENT.CAPTURE.COMPLETED)
//
// It mirrors the Stripe webhook's finalize EXACTLY (invariant #3):
//   1. payments row → 'succeeded'
//   2. COMPARE-AND-SWAP the booking unpaid → paid/confirmed, reading back
//      whether THIS call won the flip
//   3. only the winner of that flip decrements showtime inventory and sends
//      the confirmation email
//
// So calling it twice for the same booking — a duplicate onApprove, a
// redelivered webhook, or the webhook racing the client capture — flips the
// booking once and decrements/emails exactly once. Whichever caller loses the
// compare-and-swap returns { finalized: false } and touches nothing else.
//
// The CALLER is responsible for having already verified the money actually
// moved: paypal-capture-order checks the captured amount against the
// server-recomputed total; paypal-webhook trusts a signature-verified
// PAYMENT.CAPTURE.COMPLETED. This routine only reconciles our own tables — it
// NEVER calls PayPal.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendBookingConfirmationEmail } from "./send-booking-email.ts";

export interface FinalizeResult {
  finalized: boolean; // true ONLY for the single call that won the compare-and-swap
  reason: "flipped" | "already_paid" | "raced" | "not_found";
}

/**
 * Idempotently finalize a PayPal booking. Safe to call any number of times for
 * the same booking; the inventory decrement and confirmation email happen for
 * at most one call (the one that flips unpaid → paid).
 *
 * @param orderRef the PayPal order id (payments.provider_ref) used to mark the
 *                 exact payment row succeeded, mirroring the Stripe webhook's
 *                 booking_id + provider_ref match.
 */
export async function finalizePaypalBooking(
  admin: SupabaseClient,
  bookingId: string,
  orderRef: string,
): Promise<FinalizeResult> {
  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, showtime_id, num_tickets, payment_status")
    .eq("id", bookingId)
    .single();

  if (loadErr || !booking) {
    console.error(
      `[finalize-paypal] booking not found: ${bookingId} (${loadErr?.message ?? "no row"})`,
    );
    return { finalized: false, reason: "not_found" };
  }

  // Early no-op (matches the Stripe webhook): already finalized by an earlier
  // capture/delivery. The compare-and-swap below is the authoritative guard —
  // this just skips the redundant writes and logs clearly.
  if (booking.payment_status === "paid") {
    console.log(`[finalize-paypal] already paid, skipping: ${bookingId}`);
    return { finalized: false, reason: "already_paid" };
  }

  // 1. Mark the PayPal payment row succeeded (idempotent: succeeded → succeeded).
  await admin
    .from("payments")
    .update({ status: "succeeded" })
    .eq("booking_id", bookingId)
    .eq("provider", "paypal")
    .eq("provider_ref", orderRef);

  // 2. COMPARE-AND-SWAP: flip only a still-unpaid row and read back whether THIS
  //    call flipped it. A duplicate onApprove, a redelivered webhook, or the
  //    webhook racing the client capture all funnel here; exactly one wins.
  const { data: flipped } = await admin
    .from("bookings")
    .update({ payment_status: "paid", status: "confirmed" })
    .eq("id", bookingId)
    .neq("payment_status", "paid")
    .select("id");

  if (!flipped || flipped.length === 0) {
    // Someone else won the flip between our load and here — that path owns the
    // decrement + email. No-op.
    console.log(`[finalize-paypal] already paid (raced), skipping: ${bookingId}`);
    return { finalized: false, reason: "raced" };
  }

  // 3. Decrement showtime inventory now that the sale is real. Reached ONLY by
  //    the single winner of the flip above, so it is never double-decremented.
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

  // 4. Confirmation email — also gated on the flip, so it fires exactly once.
  //    Delivery must NEVER fail finalization: swallow any error.
  try {
    await sendBookingConfirmationEmail(admin, bookingId);
  } catch (emailErr) {
    const m = emailErr instanceof Error ? emailErr.message : String(emailErr);
    console.error(`[finalize-paypal] confirmation email failed (non-fatal): ${bookingId} ${m}`);
  }

  console.log(`[finalize-paypal] booking confirmed & paid: ${bookingId}`);
  return { finalized: true, reason: "flipped" };
}
