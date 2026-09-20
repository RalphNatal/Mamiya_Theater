// ─────────────────────────────────────────────────────────────────────────
// PROCESSOR FEE CAPTURE — what Stripe / PayPal actually kept on a payment.
//
// Writes payments.processing_fee + payments.net (USD) for the payment row that
// finalized a booking, so the admin dashboard's revenue breakdown
// (get_revenue_breakdown → theater net) uses REAL processor fees rather than an
// estimate. Both helpers are strictly NON-FATAL: any failure is logged and
// swallowed — recording a fee must never break payment finalization. Both are
// idempotent (a re-run writes the same values), so it's safe to call them from
// every finalize path (webhook AND client-side verify/capture).
// ─────────────────────────────────────────────────────────────────────────

import type Stripe from "npm:stripe";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

async function writeFee(
  admin: SupabaseClient,
  provider: "stripe" | "paypal",
  providerRef: string,
  feeUsd: number,
  netUsd: number | null,
  label: string,
): Promise<void> {
  const { error } = await admin
    .from("payments")
    .update({ processing_fee: feeUsd, net: netUsd, fee_recorded_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("provider_ref", providerRef);
  if (error) {
    console.error(`[processing-fee] ${label}: failed to write fee for ${providerRef}: ${error.message}`);
    return;
  }
  console.log(`[processing-fee] ${label}: ${providerRef} fee=${feeUsd.toFixed(2)} net=${netUsd?.toFixed(2) ?? "n/a"}`);
}

/**
 * Stripe: Checkout Session → PaymentIntent → latest_charge → balance_transaction.
 * balance_transaction.fee / .net are integer cents. Matches the fee shown on the
 * Stripe Dashboard for that payment. For a card payment the balance transaction
 * exists as soon as checkout.session.completed fires; if it's ever not yet
 * available we simply leave the columns NULL (the dashboard reports the count
 * of such payments as "fees not yet recorded").
 */
export async function recordStripeProcessingFee(
  stripe: Stripe,
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  try {
    const piRef = session.payment_intent;
    const piId = typeof piRef === "string" ? piRef : piRef?.id;
    if (!piId) {
      console.log(`[processing-fee] stripe: session ${session.id} has no payment_intent — skipping`);
      return;
    }
    const pi = await stripe.paymentIntents.retrieve(piId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = pi.latest_charge;
    const bt = charge && typeof charge !== "string" ? charge.balance_transaction : null;
    if (!bt || typeof bt === "string") {
      console.log(`[processing-fee] stripe: balance_transaction not available yet for ${session.id} — skipping`);
      return;
    }
    await writeFee(admin, "stripe", session.id, bt.fee / 100, bt.net / 100, "stripe");
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error(`[processing-fee] stripe: fee fetch failed (non-fatal) for ${session.id}: ${m}`);
  }
}

// The relevant slice of a PayPal capture object (v2 orders capture response and
// the PAYMENT.CAPTURE.COMPLETED webhook resource share this shape).
interface PaypalCaptureLike {
  seller_receivable_breakdown?: {
    paypal_fee?: { value?: string };
    net_amount?: { value?: string };
  };
}

/**
 * PayPal: seller_receivable_breakdown.paypal_fee / net_amount from the capture.
 * Present on a COMPLETED capture in both the capture API response and the
 * webhook resource. Absent (pending / non-USD conversions) → left NULL.
 */
export async function recordPaypalProcessingFee(
  admin: SupabaseClient,
  orderRef: string,
  capture: PaypalCaptureLike | null | undefined,
): Promise<void> {
  try {
    const br = capture?.seller_receivable_breakdown;
    const fee = Number(br?.paypal_fee?.value ?? NaN);
    if (!Number.isFinite(fee)) {
      console.log(`[processing-fee] paypal: no seller_receivable_breakdown for ${orderRef} — skipping`);
      return;
    }
    const net = Number(br?.net_amount?.value ?? NaN);
    await writeFee(admin, "paypal", orderRef, fee, Number.isFinite(net) ? net : null, "paypal");
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error(`[processing-fee] paypal: fee record failed (non-fatal) for ${orderRef}: ${m}`);
  }
}
