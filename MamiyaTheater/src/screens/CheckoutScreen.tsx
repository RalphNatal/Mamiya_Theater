import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import { supabase } from '../lib/supabase';
import { PAYPAL_CLIENT_ID, PAYPAL_CURRENCY } from '../lib/paypal';
import NavBar from '../components/NavBar';
import { useAppModal } from '../components/ModalProvider';
import type { OnNavigate } from '../types/navigation';

type PaymentMethod = 'card' | 'paypal';

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

// Fields the billing form validates. Extracted so both the card path (handlePay)
// and the PayPal path (which reads the latest values via a ref) share one
// validator. Returns { guestName, guestEmail } for the RPC, or throws a
// user-facing message. Logged-in users pass null guest fields (the RPC keys off
// auth.uid()).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BillingForm = {
  isLoggedIn: boolean;
  email: string;
  firstName: string;
  lastName: string;
  confirmEmail: string;
};

const validateForm = (f: BillingForm): { guestName: string | null; guestEmail: string | null } => {
  if (f.isLoggedIn) {
    if (!EMAIL_RE.test(f.email.trim())) throw new Error('Please enter a valid email address.');
    return { guestName: null, guestEmail: null };
  }
  const first = f.firstName.trim();
  const last = f.lastName.trim();
  if (!first || !last) throw new Error('Please enter your first and last name.');
  if (!EMAIL_RE.test(f.email.trim())) throw new Error('Please enter a valid email address.');
  if (f.email.trim().toLowerCase() !== f.confirmEmail.trim().toLowerCase()) {
    throw new Error('The two email addresses do not match.');
  }
  return { guestName: `${first} ${last}`, guestEmail: f.email.trim() };
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
  // guests fill first/last name, email and a confirm-email field.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [name, setName] = useState('');            // logged-in
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');  // guest
  const [lastName, setLastName] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Chosen payment method — only one path is active at a time.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');

  // The PayPal path reserves ONE pending booking (create_pending_booking) and
  // reuses it across button re-clicks so we never double-reserve seats. Held in
  // a ref (not state) so it's read synchronously inside the PayPal callbacks and
  // doesn't re-render the PayPal buttons.
  const paypalBookingIdRef = useRef<string | null>(null);

  // When createOrder/onApprove already showed a specific message (a seat
  // conflict, a validation error) and then threw to abort the PayPal flow, the
  // SDK follows up by firing onError. This flag tells that onError handler to
  // stay silent so the user sees ONE accurate modal, not a bogus "PayPal error".
  const suppressPaypalErrorRef = useRef(false);

  // Latest billing values for the PayPal callbacks, so those callbacks can stay
  // referentially stable (empty deps) — otherwise every keystroke in the form
  // would re-initialise the PayPal buttons.
  const liveRef = useRef({ isLoggedIn, email, firstName, lastName, confirmEmail, showtimeId, seats });
  liveRef.current = { isLoggedIn, email, firstName, lastName, confirmEmail, showtimeId, seats };

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

  const formattedDate = showtime
    ? new Date(showtime.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const formattedTime = showtime
    ? new Date(showtime.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
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
      ({ guestName, guestEmail } = validateForm({ isLoggedIn, email, firstName, lastName, confirmEmail }));
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
    } catch (err: any) {
      console.error('Reservation failed:', err);
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
      console.error('Stripe checkout failed:', err);
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
    const { isLoggedIn, email, firstName, lastName, confirmEmail, showtimeId, seats } = liveRef.current;
    const { guestName, guestEmail } = validateForm({ isLoggedIn, email, firstName, lastName, confirmEmail });
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
    return bookingId;
  }, []);

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
      console.error('PayPal createOrder failed:', err);
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
      console.error('PayPal capture failed:', err);
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
    console.error('PayPal error:', err);
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
    }
    setPaymentMethod(m);
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
                    placeholderTextColor="#555"
                  />
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="#555"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </>
              ) : (
                <>
                  <View style={styles.nameRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>First name</Text>
                      <TextInput
                        style={styles.input}
                        value={firstName}
                        onChangeText={setFirstName}
                        placeholder="First name"
                        placeholderTextColor="#555"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Last name</Text>
                      <TextInput
                        style={styles.input}
                        value={lastName}
                        onChangeText={setLastName}
                        placeholder="Last name"
                        placeholderTextColor="#555"
                      />
                    </View>
                  </View>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="#555"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <Text style={styles.fieldLabel}>Confirm email</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmEmail}
                    onChangeText={setConfirmEmail}
                    placeholder="Re-enter your email"
                    placeholderTextColor="#555"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <TouchableOpacity onPress={() => onNavigate('login')} activeOpacity={0.7}>
                    <Text style={styles.loginHint}>Have an account? Log in to check out faster.</Text>
                  </TouchableOpacity>
                </>
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
            </View>
          </View>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#0a0a0a' },

  centerState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 20 },
  browseBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 60, paddingTop: 28, paddingBottom: 20,
  },
  headerMobile: { paddingHorizontal: 20, paddingTop: 20 },
  posterThumb: { width: 56, height: 80, borderRadius: 8, backgroundColor: '#1a1a1a' },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  posterPlaceholderTxt: { fontSize: 22 },
  headerLabel: { color: '#C8102E', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  headerSubtitle: { color: '#888', fontSize: 13, fontWeight: '500' },

  contentRow: { flexDirection: 'row', gap: 24, paddingHorizontal: 60, paddingBottom: 40, alignItems: 'flex-start' },
  contentRowMobile: { flexDirection: 'column', paddingHorizontal: 20, gap: 16 },
  mainCol: { flex: 1, minWidth: 0 },
  summaryCol: { width: 320 },

  card: { backgroundColor: '#161616', borderRadius: 12, borderWidth: 1, borderColor: '#262626', padding: 20 },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 16 },
  fieldLabel: { color: '#777', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14,
  },
  nameRow: { flexDirection: 'row', gap: 12 },
  loginHint: { color: '#C8102E', fontSize: 12, marginTop: 16, fontWeight: '600' },

  summaryCard: {
    backgroundColor: '#161616', borderRadius: 12, borderWidth: 1, borderColor: '#262626', padding: 20,
  },
  summaryTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  summaryLabel: { color: '#777', fontSize: 12, flexShrink: 0 },
  summaryValue: { color: '#e6e6e6', fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  summaryDivider: { height: 1, backgroundColor: '#262626', marginVertical: 8 },
  totalLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },
  totalValue: { color: '#C8102E', fontSize: 20, fontWeight: '800' },

  methodHeading: { color: '#777', fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
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
  secureNote: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 15 },
});

export default CheckoutScreen;
