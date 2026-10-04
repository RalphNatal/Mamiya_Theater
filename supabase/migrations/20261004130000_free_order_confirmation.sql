-- ─────────────────────────────────────────────────────────────────────────
-- FREE ORDERS — a $0 order completes without a payment provider.
--
-- A $0 ticket carries no fees (compute_ticket_fees, 20261004120000), so a free
-- event — or an order made entirely of $0 seats / 'free' promo-code seats —
-- reserves with total_price = 0. Stripe and PayPal both refuse a $0 charge
-- (stripe-create-checkout / paypal-create-order return "Invalid booking
-- amount"), so until now such an order could never be finalized online.
--
-- confirm_free_booking(booking_id) is the $0 analogue of the Stripe/PayPal
-- finalize: in ONE statement-locked transaction it
--   • requires the booking to still be a live online hold (status 'reserved',
--     payment_status 'pending') whose SERVER-computed total_price AND fees_total
--     are exactly 0 — the client can't make a priced order free;
--   • flips it to confirmed / paid (compare-and-swap, so a double call
--     finalizes once and reports already_paid the second time);
--   • decrements showtime inventory once, like decrement_showtime_seats.
-- Service-role only: called by the confirm-free-booking Edge Function, which
-- then sends the confirmation email exactly like the paid paths.
--
-- ⚠️  HOSTED PROJECT — apply with `supabase db push`, and deploy the
--     confirm-free-booking function.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_free_booking(p_booking_id uuid)
RETURNS json AS $$
DECLARE
  v_b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;
  IF v_b.payment_status = 'paid' THEN
    RETURN json_build_object('status', 'already_paid', 'booking_id', v_b.id);
  END IF;
  IF v_b.status <> 'reserved' OR v_b.payment_status <> 'pending' OR v_b.channel <> 'online' THEN
    RETURN json_build_object('status', 'not_reserved');
  END IF;
  IF v_b.total_price <> 0 OR v_b.fees_total <> 0 THEN
    RETURN json_build_object('status', 'not_free');
  END IF;

  UPDATE public.bookings
     SET status = 'confirmed', payment_status = 'paid'
   WHERE id = v_b.id;

  IF v_b.showtime_id IS NOT NULL THEN
    PERFORM public.decrement_showtime_seats(v_b.showtime_id, v_b.num_tickets);
  END IF;

  RETURN json_build_object('status', 'confirmed', 'booking_id', v_b.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.confirm_free_booking(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_free_booking(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
