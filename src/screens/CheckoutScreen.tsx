import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TextInput,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { PAYPAL_CLIENT_ID, PAYPAL_CURRENCY } from '../lib/paypal';
import { VENUE_TIMEZONE } from '../config/venue';
import NavBar from '../components/NavBar';
import GuestCheckoutForm, { GuestInfo } from '../components/GuestCheckoutForm';
import { useAppModal } from '../components/ModalProvider';
import { createStyles, typography, layout, colors } from '../theme';
import type { OnNavigate } from '../types/navigation';

type PaymentMethod = 'card' | 'paypal';

// How long we tell the buyer their seats are held. This mirrors the real
// payable window — the Stripe Checkout session, SESSION_TTL_SECONDS (30 min) in
// supabase/functions/stripe-create-checkout/index.ts (the source of truth).
// The DB sweep (cleanup_expired_reservations) frees an unpaid hold ~5 min LATER
// as a 35-min backstop, so when this countdown reaches zero the reservation is
// still live for us to release ourselves (see the effect below) — never already
// gone. Keep this in step with SESSION_TTL_SECONDS; do NOT resurrect the retired
// migration's 20-minute value, which made the timer expire ~10 min early.
const HOLD_SECONDS = 30 * 60;

// Seconds → "MM:SS" for the "Seats held for …" countdown.
const formatCountdown = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// True only once a real client-id has been pasted into src/lib/paypal.ts.
// While it's still the placeholder the PayPal SDK can't load, so we show a hint
// instead of a silent blank where the buttons would be.
const PAYPAL_CONFIGURED = !!PAYPAL_CLIENT_ID && !PAYPAL_CLIENT_ID.startsWith('REPLACE_');

// Buttons + the SDK's load state. Must live INSIDE <PayPalScriptProvider> so it
// can read usePayPalScriptReducer — that's how we tell "still loading" from
// "failed to load" (bad/placeholder client-id) and avoid an empty box.
type PaypalButtonsAreaProps = {
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel: () => void;
  onError: (err: unknown) => void;
};

const PaypalButtonsArea = ({ createOrder, onApprove, onCancel, onError }: PaypalButtonsAreaProps) => {
  const [{ isPending, isRejected }] = usePayPalScriptReducer();

  if (isRejected) {
    return (
      <Text style={styles.paypalMsg}>
        PayPal couldn&apos;t load. Check the client-id in src/lib/paypal.ts, then reload.
      </Text>
    );
  }

  return (
    <>
      {isPending && <ActivityIndicator color="#C8102E" style={{ marginVertical: 12 }} />}
      <PayPalButtons
        style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' }}
        createOrder={createOrder}
        onApprove={onApprove}
        onCancel={onCancel}
        onError={onError}
      />
    </>
  );
};

// Resolves the guest fields the RPC needs from the current billing state. Both
// the card path (handlePay) and the PayPal path (which reads the latest values
// via a ref) share this. Returns { guestName, guestEmail } for the RPC, or
// throws a user-facing message.
//   • Logged-in users pass null guest fields (the RPC keys off auth.uid()); we
//     still sanity-check the editable email.
//   • Guests must have already completed GuestCheckoutForm, which validates and
//     stores { guestName, guestEmail }. If it's missing, the pay controls
//     shouldn't have been reachable — treat it as a guard.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BillingForm = {
  isLoggedIn: boolean;
  email: string;              // logged-in editable email
  guestInfo: GuestInfo | null; // set once GuestCheckoutForm is submitted
};

const validateForm = (f: BillingForm): { guestName: string | null; guestEmail: string | null } => {
  if (f.isLoggedIn) {
    if (!EMAIL_RE.test(f.email.trim())) throw new Error('Please enter a valid email address.');
    return { guestName: null, guestEmail: null };
  }
  if (!f.guestInfo) throw new Error('Please enter your details to continue to payment.');
  return { guestName: f.guestInfo.guestName, guestEmail: f.guestInfo.guestEmail };
};

// A seat/reservation conflict is raised by create_pending_booking (NOT the
// payment provider), so it must never surface as a "Stripe/PayPal error".
// Returns a customer-facing message for those cases, or null for anything else
// (real provider failures, network errors, etc.).
const describeSeatConflict = (err: any): string | null => {
  const m = (err?.message ?? '').toLowerCase();
  if (m.includes('no longer available') || m.includes('not available for sale')) {
    return 'Sorry, one or more of those seats were just taken. Please choose different seats.';
  }
  if (m.includes('not enough seats')) {
    return 'Sorry, there aren’t enough seats left for that showtime. Please choose different seats.';
  }
  // Raised by the booking RPCs when the production's ticket capacity is reached.
  if (m.includes('sold out')) {
    return 'Sorry, this performance just sold out. Please choose another showtime.';
  }
  return null;
};

type ShowtimeWithMovie = {
  id: string;
  production_id: string;
  start_time: string;
  price: number;
  available_seats: number;
  productions: { title: string; poster_url: string | null } | null;
};

type Props = {
  movieId: string | null;
  showtimeId: string | null;
  seats: string[];
  onNavigate: OnNavigate;
};

const CheckoutScreen = ({ movieId, showtimeId, seats, onNavigate }: Props) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showtime, setShowtime] = useState<ShowtimeWithMovie | null>(null);

  // Identity: logged-in users get a single prefilled name + email (editable);
  // guests complete GuestCheckoutForm, which validates and hands back
  // { guestName, guestEmail } — stored here once and reused for the RPC. While
  // guestInfo is null the payment controls stay hidden (guests must enter
  // details first); logged-in users skip straight to payment.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [name, setName] = useState('');            // logged-in
  const [email, setEmail] = useState('');
  const [guestInfo, setGuestInfo] = useState<GuestInfo | null>(null); // guest
  const readyToPay = isLoggedIn || !!guestInfo;

  const [submitting, setSubmitting] = useState(false);

  // Chosen payment method — only one path is active at a time.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');

  // The PayPal path reserves ONE pending booking (create_pending_booking) and
  // reuses it across button re-clicks so we never double-reserve seats. Held in
  // a ref (not state) so it's read synchronously inside the PayPal callbacks and
  // doesn't re-render the PayPal buttons.
  const paypalBookingIdRef = useRef<string | null>(null);

  // ── RESERVATION COUNTDOWN ─────────────────────────────────────────────────
  // Once create_pending_booking succeeds (either pay path) the seats are held
  // for HOLD_SECONDS. We surface that as a live "Seats held for MM:SS" timer;
  // at zero the hold is (about to be) swept, so we disable the pay buttons, free
  // the reservation ourselves, and push the buyer back to reselect. holdDeadline
  // is the epoch-ms expiry; activeHoldRef is the booking currently on the clock.
  const [holdDeadline, setHoldDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(HOLD_SECONDS);
  const [holdExpired, setHoldExpired] = useState(false);
  const activeHoldRef = useRef<string | null>(null);

  const startHold = useCallback((bookingId: string) => {
    activeHoldRef.current = bookingId;
    setHoldExpired(false);
    setRemaining(HOLD_SECONDS);
    setHoldDeadline(Date.now() + HOLD_SECONDS * 1000);
  }, []);

  // Stop the countdown without expiring it — used when the underlying hold is
  // deliberately cancelled (switching to the card path, editing guest details).
  const clearHold = useCallback(() => {
    activeHoldRef.current = null;
    setHoldExpired(false);
    setRemaining(HOLD_SECONDS);
    setHoldDeadline(null);
  }, []);

  useEffect(() => {
    if (holdDeadline == null) return;
    const tick = () => {
      const secs = Math.max(0, Math.round((holdDeadline - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        setHoldExpired(true);
        setHoldDeadline(null);
        // Free the seats now rather than waiting for the ~5-min sweep, and clear
        // the PayPal hold ref so a fresh attempt would reserve anew.
        const id = activeHoldRef.current;
        activeHoldRef.current = null;
        paypalBookingIdRef.current = null;
        if (id) supabase.rpc('cancel_reservation', { p_booking_id: id });
        showModal({
          title: 'Seat hold expired',
          message: 'Your seats were only held for a few minutes and that time is up, so we released them. Please reselect your seats to try again.',
          variant: 'error',
        });
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [holdDeadline, showModal]);

  // When createOrder/onApprove already showed a specific message (a seat
  // conflict, a validation error) and then threw to abort the PayPal flow, the
  // SDK follows up by firing onError. This flag tells that onError handler to
  // stay silent so the user sees ONE accurate modal, not a bogus "PayPal error".
  const suppressPaypalErrorRef = useRef(false);

  // Latest billing values for the PayPal callbacks, so those callbacks can stay
  // referentially stable (empty deps) — otherwise every keystroke in the form
  // would re-initialise the PayPal buttons.
  const liveRef = useRef({ isLoggedIn, email, guestInfo, showtimeId, seats });
  liveRef.current = { isLoggedIn, email, guestInfo, showtimeId, seats };

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!showtimeId) {
        setError('No showtime selected.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const { data, error: fetchErr } = await supabase
          .from('showtimes')
          .select('id, production_id, start_time, price, available_seats, productions(title, poster_url)')
          .eq('id', showtimeId)
          .single();
        if (fetchErr) throw fetchErr;
        if (!active) return;
        setShowtime(data as any);

        // Prefill from the signed-in profile when there is one.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setIsLoggedIn(true);
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .maybeSingle();
          if (!active) return;
          setName(profile?.full_name ?? '');
          setEmail(profile?.email ?? user.email ?? '');
        }
        setError(null);
      } catch (err: any) {
        if (active) setError(err.message ?? 'Failed to load checkout.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [showtimeId]);

  const movie = showtime?.productions ?? null;
  const pricePer = showtime ? Number(showtime.price) : 0;
  const qty = seats.length;
  const total = pricePer * qty;

  // Always render in the venue's timezone (see src/config/venue.ts), never the
  // viewer's. timeZone rolls the date correctly for late shows near midnight;
  // timeZoneName lives on the time only, so "HST" prints once (not twice).
  const formattedDate = showtime
    ? new Date(showtime.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: VENUE_TIMEZONE })
    : '';
  const formattedTime = showtime
    ? new Date(showtime.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE, timeZoneName: 'short' })
    : '';

  // A seat/reservation conflict isn't fixable on this screen — the seats are
  // gone. Send the buyer back to the seat map (which re-fetches taken seats on
  // mount and starts with a clean selection) with a clear explanation.
  const returnToSeatsWithConflict = useCallback((message: string) => {
    showModal({ title: 'Seats no longer available', message, variant: 'error' });
    if (showtimeId) onNavigate('seatselection', movieId ?? undefined, showtimeId);
    else onNavigate('allshows');
  }, [showModal, onNavigate, showtimeId, movieId]);

  const handlePay = async () => {
    if (!showtimeId || qty === 0 || submitting) return;

    // Validation errors are fixable in place (bad email, etc.) — show and stay.
    let guestName: string | null;
    let guestEmail: string | null;
    try {
      ({ guestName, guestEmail } = validateForm({ isLoggedIn, email, guestInfo }));
    } catch (err: any) {
      showModal({ title: 'Check your details', message: err.message, variant: 'error' });
      return;
    }

    setSubmitting(true);

    // Phase 1 — RESERVE. A failure here is a seat/availability problem, never a
    // payment-provider problem, so it gets its own message + a trip back to the
    // seat map rather than a misleading "payment error".
    let bookingId: string;
    try {
      const { data: pending, error: rpcErr } = await supabase.rpc('create_pending_booking', {
        p_showtime_id: showtimeId,
        p_seats: seats,
        p_guest_name: guestName,
        p_guest_email: guestEmail,
      });
      if (rpcErr) throw rpcErr;
      bookingId = (pending as any)?.booking_id;
      if (!bookingId) throw new Error('Could not start your reservation.');
      // Seats are now held — start the visible countdown. It matters most if the
      // Stripe redirect below fails and we stay on this screen with a live hold.
      startHold(bookingId);
    } catch (err: any) {
      logger.error('Reservation failed:', err);
      const seatMsg = describeSeatConflict(err);
      if (seatMsg) { returnToSeatsWithConflict(seatMsg); return; }
      showModal({
        title: 'Checkout failed',
        message: err.message ?? 'Something went wrong starting your reservation.',
        variant: 'error',
      });
      setSubmitting(false);
      return;
    }

    // Phase 2 — PAY. Only now can a Stripe failure legitimately be blamed on the
    // card payment path. (RN tsconfig omits the DOM lib, so reach `window`
    // through globalThis.)
    try {
      const { data: checkout, error: fnErr } = await supabase.functions.invoke('stripe-create-checkout', {
        body: { booking_id: bookingId },
      });
      if (fnErr) throw fnErr;
      if (!checkout?.url) throw new Error('Could not reach the payment page.');
      (globalThis as any).location.href = checkout.url;
      // On success we navigate away, so we intentionally leave `submitting` true
      // to keep the button disabled during the redirect.
    } catch (err: any) {
      logger.error('Stripe checkout failed:', err);
      showModal({
        title: 'Payment error',
        message: 'We couldn’t start the card payment. Please try again, or pay with PayPal.',
        variant: 'error',
      });
      setSubmitting(false);
    }
  };

  // ── PAYPAL PATH ──────────────────────────────────────────────────────────
  // Reserve exactly one pending booking for the PayPal flow (validating the
  // billing form first), reusing it on re-clicks. Same provider-agnostic RPC as
  // the card path — only the money movement differs.
  const ensurePaypalBooking = useCallback(async (): Promise<string> => {
    if (paypalBookingIdRef.current) return paypalBookingIdRef.current;
    const { isLoggedIn, email, guestInfo, showtimeId, seats } = liveRef.current;
    const { guestName, guestEmail } = validateForm({ isLoggedIn, email, guestInfo });
    if (!showtimeId || seats.length === 0) throw new Error('Your seat selection has expired. Please pick your seats again.');
    const { data: pending, error: rpcErr } = await supabase.rpc('create_pending_booking', {
      p_showtime_id: showtimeId,
      p_seats: seats,
      p_guest_name: guestName,
      p_guest_email: guestEmail,
    });
    if (rpcErr) throw rpcErr;
    const bookingId = (pending as any)?.booking_id;
    if (!bookingId) throw new Error('Could not start your reservation.');
    paypalBookingIdRef.current = bookingId;
    startHold(bookingId);
    return bookingId;
  }, [startHold]);

  // PayPal SDK -> createOrder: ensure a booking, then create the server-side
  // order (amount recomputed there) and return its id for the popup.
  const handleCreateOrder = useCallback(async (): Promise<string> => {
    try {
      // ensurePaypalBooking runs create_pending_booking — a seat conflict throws
      // here, BEFORE any PayPal order exists, so it's never PayPal's fault.
      const bookingId = await ensurePaypalBooking();
      const { data, error } = await supabase.functions.invoke('paypal-create-order', {
        body: { booking_id: bookingId },
      });
      if (error) throw error;
      if (!(data as any)?.id) throw new Error('Could not start PayPal checkout.');
      return (data as any).id as string;
    } catch (err: any) {
      logger.error('PayPal createOrder failed:', err);
      // We're about to re-throw to abort PayPal, which will trigger the SDK's
      // onError — silence that follow-up so only this specific message shows.
      suppressPaypalErrorRef.current = true;
      const seatMsg = describeSeatConflict(err);
      if (seatMsg) {
        returnToSeatsWithConflict(seatMsg);
      } else {
        showModal({
          title: 'Checkout failed',
          message: err.message ?? 'Could not start PayPal checkout.',
          variant: 'error',
        });
      }
      throw err; // abort the PayPal flow
    }
  }, [ensurePaypalBooking, showModal, returnToSeatsWithConflict]);

  // PayPal SDK -> onApprove: capture server-side. On COMPLETED, hand off to the
  // SAME confirmation flow Stripe uses — App parses ?checkout=success&booking on
  // load and polls the booking until payment_status flips to 'paid'.
  const handleApprove = useCallback(async (data: { orderID: string }) => {
    try {
      const { data: cap, error } = await supabase.functions.invoke('paypal-capture-order', {
        body: { order_id: data.orderID },
      });
      if (error) throw error;
      if ((cap as any)?.status !== 'COMPLETED') throw new Error('Your PayPal payment could not be completed.');
      const bookingId = (cap as any).booking_id ?? paypalBookingIdRef.current;
      (globalThis as any).location.href = `/?checkout=success&booking=${bookingId}`;
    } catch (err: any) {
      logger.error('PayPal capture failed:', err);
      showModal({
        title: 'Payment problem',
        message: err.message ?? 'We could not confirm your PayPal payment. If you were charged it will appear under Profile → Bookings shortly.',
        variant: 'error',
      });
    }
  }, [showModal]);

  const handlePaypalCancel = useCallback(() => {
    // Leave the reservation for the cleanup sweep (or a retry, which reuses it).
    showModal({
      title: 'Payment cancelled',
      message: 'You cancelled the PayPal payment. Your seats are held for a few minutes if you want to try again.',
      variant: 'info',
    });
  }, [showModal]);

  const handlePaypalError = useCallback((err: unknown) => {
    logger.error('PayPal error:', err);
    // A seat/validation failure in createOrder already surfaced its own precise
    // message before aborting — don't stack a misleading "PayPal error" on top.
    if (suppressPaypalErrorRef.current) {
      suppressPaypalErrorRef.current = false;
      return;
    }
    showModal({
      title: 'PayPal error',
      message: 'Something went wrong with PayPal. Please try again, or pay with a card.',
      variant: 'error',
    });
  }, [showModal]);

  // Switching payment method. Leaving PayPal after it already reserved seats:
  // free that hold so the card path (which reserves its own) can grab the same
  // seats instead of colliding on them.
  const selectMethod = (m: PaymentMethod) => {
    if (m === paymentMethod) return;
    if (m === 'card' && paypalBookingIdRef.current) {
      supabase.rpc('cancel_reservation', { p_booking_id: paypalBookingIdRef.current });
      paypalBookingIdRef.current = null;
      clearHold();
    }
    setPaymentMethod(m);
  };

  // Guest wants to change the name/email they entered. Clearing guestInfo hides
  // the payment controls and brings GuestCheckoutForm back (prefilled). If they'd
  // already reserved via PayPal, free that hold so the new details aren't stuck
  // to a stale reservation.
  const editGuestDetails = () => {
    if (paypalBookingIdRef.current) {
      supabase.rpc('cancel_reservation', { p_booking_id: paypalBookingIdRef.current });
      paypalBookingIdRef.current = null;
      clearHold();
    }
    setGuestInfo(null);
  };

  // Memoised so PayPalScriptProvider doesn't reload the SDK on unrelated renders.
  const paypalOptions = useMemo(
    () => ({ clientId: PAYPAL_CLIENT_ID, currency: PAYPAL_CURRENCY, intent: 'capture' as const }),
    [],
  );

  const Navbar = <NavBar onNavigate={onNavigate} scrollY={scrollY} onHeightChange={setNavbarHeight} showBackButton />;

  const handleBack = () => {
    if (showtimeId) onNavigate('seatselection', movieId ?? undefined, showtimeId);
    else if (movieId) onNavigate('showdetails', movieId);
    else onNavigate('allshows');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#12122a" />
        {Navbar}
        <ActivityIndicator size="large" color="#C8102E" style={{ marginTop: navbarHeight + 60 }} />
      </SafeAreaView>
    );
  }

  if (error || !showtime || qty === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#12122a" />
        {Navbar}
        <View style={[styles.centerState, { marginTop: navbarHeight }]}>
          <Text style={styles.emptyText}>{error ?? 'Your seat selection has expired. Please pick your seats again.'}</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={handleBack} activeOpacity={0.85}>
            <Text style={styles.browseBtnText}>Back to seats</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />
      {Navbar}

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: navbarHeight, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >
        <View style={[styles.header, !isDesktop && styles.headerMobile]}>
          {movie?.poster_url ? (
            <Image source={{ uri: movie.poster_url }} style={styles.posterThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.posterThumb, styles.posterPlaceholder]}>
              <Text style={styles.posterPlaceholderTxt}>🎬</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerLabel}>CHECKOUT</Text>
            <Text style={styles.headerTitle} numberOfLines={2}>{movie?.title ?? 'Showtime'}</Text>
            <Text style={styles.headerSubtitle}>{formattedDate} · {formattedTime}</Text>
          </View>
        </View>

        <View style={[styles.contentRow, !isDesktop && styles.contentRowMobile]}>

          {/* ── LEFT: billing ── */}
          <View style={styles.mainCol}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Billing details</Text>

              {isLoggedIn ? (
                <>
                  <Text style={styles.fieldLabel}>Full name</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={colors.textMutedOnDark}
                  />
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textMutedOnDark}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </>
              ) : guestInfo ? (
                // Guest details already entered — show a compact read-only
                // recap with an Edit link back to the form.
                <>
                  <Text style={styles.fieldLabel}>Full name</Text>
                  <Text style={styles.guestValue}>{guestInfo.guestName}</Text>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <Text style={styles.guestValue}>{guestInfo.guestEmail}</Text>
                  <TouchableOpacity onPress={editGuestDetails} activeOpacity={0.7}>
                    <Text style={styles.loginHint}>Edit details</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <GuestCheckoutForm
                  onSubmit={setGuestInfo}
                  onLoginPress={() => onNavigate('login')}
                />
              )}
            </View>
          </View>

          {/* ── RIGHT: order summary + pay ── */}
          <View style={styles.summaryCol}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Order summary</Text>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Production</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>{movie?.title ?? '—'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Date &amp; time</Text>
                <Text style={styles.summaryValue}>{formattedDate} · {formattedTime}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Seats</Text>
                <Text style={styles.summaryValue}>{seats.join(', ')}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tickets</Text>
                <Text style={styles.summaryValue}>{qty} × ${pricePer.toFixed(2)}</Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
              </View>

              {/* Payment options only appear once we have an identity: a
                  logged-in user, or a guest who has submitted their details. */}
              {!readyToPay ? (
                <Text style={styles.awaitDetails}>Enter your details to continue to payment.</Text>
              ) : holdExpired ? (
                // The hold ran out — seats were released. No paying against a
                // dead reservation; send them back to pick seats again.
                <View style={styles.expiredBox}>
                  <Text style={styles.expiredText}>
                    Your seat hold expired and the seats were released. Please reselect your seats to continue.
                  </Text>
                  <TouchableOpacity style={styles.reselectBtn} onPress={handleBack} activeOpacity={0.85}>
                    <Text style={styles.reselectBtnText}>Reselect seats</Text>
                  </TouchableOpacity>
                </View>
              ) : (
              <>
              {/* Live countdown once a reservation is holding these seats. */}
              {holdDeadline != null && (
                <View style={styles.holdBanner}>
                  <Text style={styles.holdBannerText}>Seats held for {formatCountdown(remaining)}</Text>
                </View>
              )}
              {/* ── Payment method selector ── */}
              <Text style={styles.methodHeading}>Payment method</Text>
              <View style={styles.methodRow}>
                <TouchableOpacity
                  style={[styles.methodOption, paymentMethod === 'card' && styles.methodOptionActive]}
                  onPress={() => selectMethod('card')}
                  activeOpacity={0.85}
                >
                  <View style={[styles.radioOuter, paymentMethod === 'card' && styles.radioOuterActive]}>
                    {paymentMethod === 'card' && <View style={styles.radioInner} />}
                  </View>
                  <Text style={[styles.methodText, paymentMethod === 'card' && styles.methodTextActive]}>
                    Credit / Debit card
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodOption, paymentMethod === 'paypal' && styles.methodOptionActive]}
                  onPress={() => selectMethod('paypal')}
                  activeOpacity={0.85}
                >
                  <View style={[styles.radioOuter, paymentMethod === 'paypal' && styles.radioOuterActive]}>
                    {paymentMethod === 'paypal' && <View style={styles.radioInner} />}
                  </View>
                  <Text style={[styles.methodText, paymentMethod === 'paypal' && styles.methodTextActive]}>
                    PayPal
                  </Text>
                </TouchableOpacity>
              </View>

              {paymentMethod === 'card' ? (
                <>
                  <TouchableOpacity
                    style={[styles.payBtn, submitting && styles.payBtnDisabled]}
                    onPress={handlePay}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.payBtnText}>{submitting ? 'Redirecting…' : 'Pay with card'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.secureNote}>Payments are processed securely by Stripe. Your card details never touch our servers.</Text>
                </>
              ) : (
                <View style={styles.paypalWrap}>
                  {PAYPAL_CONFIGURED ? (
                    <PayPalScriptProvider options={paypalOptions}>
                      <PaypalButtonsArea
                        createOrder={handleCreateOrder}
                        onApprove={handleApprove}
                        onCancel={handlePaypalCancel}
                        onError={handlePaypalError}
                      />
                    </PayPalScriptProvider>
                  ) : (
                    <Text style={styles.paypalMsg}>
                      PayPal isn&apos;t set up yet. Add your sandbox client-id to src/lib/paypal.ts.
                    </Text>
                  )}
                  <Text style={styles.secureNote}>Payments are processed securely by PayPal. Complete your purchase in the PayPal window.</Text>
                </View>
              )}
              </>
              )}
            </View>
          </View>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = createStyles({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#0a0a0a' },

  centerState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyText: { ...typography.body, color: '#888', textAlign: 'center', marginBottom: 20 },
  browseBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  header: {
    ...layout.flow,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 60, paddingTop: 28, paddingBottom: 20,
  },
  headerMobile: { paddingHorizontal: 20, paddingTop: 20 },
  posterThumb: { width: 56, height: 80, borderRadius: 8, backgroundColor: '#1a1a1a' },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  posterPlaceholderTxt: { fontSize: 22 },
  headerLabel: { ...typography.caption, fontSize: 11, color: '#C8102E', fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  headerTitle: { ...typography.heading2, color: '#fff', fontWeight: '800', marginBottom: 4 },
  headerSubtitle: { ...typography.caption, fontSize: 13, color: '#888', fontWeight: '500' },

  contentRow: { ...layout.flow, flexDirection: 'row', gap: 24, paddingHorizontal: 60, paddingBottom: 40, alignItems: 'flex-start' },
  contentRowMobile: { flexDirection: 'column', paddingHorizontal: 20, gap: 16 },
  mainCol: { flex: 1, minWidth: 0 },
  summaryCol: { width: 320 },

  card: { backgroundColor: '#161616', borderRadius: 12, borderWidth: 1, borderColor: '#262626', padding: 20 },
  cardTitle: { ...typography.body, fontSize: 15, color: '#fff', fontWeight: '800', marginBottom: 16 },
  fieldLabel: { ...typography.caption, color: colors.textMutedOnDark, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    ...typography.body, backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, color: '#fff',
  },
  guestValue: { ...typography.body, color: '#e6e6e6', fontWeight: '600', marginTop: 2 },
  loginHint: { color: '#C8102E', fontSize: 12, marginTop: 16, fontWeight: '600' },

  summaryCard: {
    backgroundColor: '#161616', borderRadius: 12, borderWidth: 1, borderColor: '#262626', padding: 20,
  },
  summaryTitle: { ...typography.body, fontSize: 15, color: '#fff', fontWeight: '800', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  summaryLabel: { ...typography.caption, color: colors.textMutedOnDark, flexShrink: 0 },
  summaryValue: { ...typography.caption, color: '#e6e6e6', fontWeight: '600', flex: 1, textAlign: 'right' },
  summaryDivider: { height: 1, backgroundColor: '#262626', marginVertical: 8 },
  totalLabel: { ...typography.body, fontSize: 15, color: '#fff', fontWeight: '800' },
  totalValue: { color: '#C8102E', fontSize: 20, fontWeight: '800' },

  awaitDetails: { ...typography.caption, color: '#888', marginTop: 18, lineHeight: 18 },

  holdBanner: {
    marginTop: 18, borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a',
    backgroundColor: '#0f0f0f', paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center',
  },
  holdBannerText: { color: '#e6e6e6', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  expiredBox: {
    marginTop: 18, borderRadius: 10, borderWidth: 1, borderColor: '#5a2230',
    backgroundColor: '#1a0f12', padding: 16,
  },
  expiredText: { color: '#f87171', fontSize: 13, fontWeight: '600', lineHeight: 18, marginBottom: 14 },
  reselectBtn: { backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  reselectBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  methodHeading: { color: colors.textMutedOnDark, fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  methodRow: { gap: 8 },
  methodOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#0f0f0f',
  },
  methodOptionActive: { borderColor: '#C8102E', backgroundColor: '#1a0f12' },
  radioOuter: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#555',
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: '#C8102E' },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C8102E' },
  methodText: { color: '#bbb', fontSize: 13, fontWeight: '600' },
  methodTextActive: { color: '#fff' },

  paypalWrap: { marginTop: 18, minHeight: 52 },
  paypalMsg: { color: '#d97706', fontSize: 12, textAlign: 'center', lineHeight: 17, paddingVertical: 8 },

  payBtn: { backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  payBtnDisabled: { backgroundColor: '#5a2230', opacity: 0.7 },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secureNote: { color: colors.textMutedOnDark, fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 15 },
});

export default CheckoutScreen;
