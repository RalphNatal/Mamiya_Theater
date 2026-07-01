import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import NavBar from '../components/NavBar';
import type { OnNavigate } from '../types/navigation';

type Props = {
  bookingId: string | null;
  mode: 'success' | 'cancel';
  onNavigate: OnNavigate;
};

type Confirmation = {
  id: string;
  payment_status: string;
  status: string;
  movie_title: string | null;
  show_start_time: string | null;
  num_tickets: number;
  total_price: number;
  seats: string[];
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

const BookingConfirmationScreen = ({ bookingId, mode, onNavigate }: Props) => {
  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;

  // success flow states: 'confirming' (polling) → 'paid' | 'timeout'
  const [phase, setPhase] = useState<'confirming' | 'paid' | 'timeout' | 'cancelled'>(
    mode === 'cancel' ? 'cancelled' : 'confirming'
  );
  const [booking, setBooking] = useState<Confirmation | null>(null);

  // ── CANCEL: free the still-unpaid reservation so the seats reopen. ──
  useEffect(() => {
    if (mode !== 'cancel' || !bookingId) return;
    supabase.rpc('cancel_reservation', { p_booking_id: bookingId });
  }, [mode, bookingId]);

  // ── SUCCESS: poll until the webhook flips payment_status to 'paid'. ──
  useEffect(() => {
    if (mode !== 'success' || !bookingId) {
      if (mode === 'success' && !bookingId) setPhase('timeout');
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const poll = async () => {
      const { data, error } = await supabase.rpc('get_booking_confirmation', {
        p_booking_id: bookingId,
      });
      if (!active) return;

      const row = data as Confirmation | null;
      if (!error && row) {
        setBooking(row);
        if (row.payment_status === 'paid') {
          setPhase('paid');
          return;
        }
      }

      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setPhase('timeout');
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [mode, bookingId]);

  const showDate = booking?.show_start_time ? new Date(booking.show_start_time) : null;
  const formattedShow = showDate
    ? `${showDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${showDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : '—';

  const Navbar = <NavBar onNavigate={onNavigate} scrollY={scrollY} onHeightChange={setNavbarHeight} showBackButton />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />
      {Navbar}

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: navbarHeight + 24, paddingBottom: 48, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>

          {phase === 'confirming' && (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color="#C8102E" />
              <Text style={styles.title}>Confirming your payment…</Text>
              <Text style={styles.subtitle}>
                Hang tight — we&apos;re waiting for Stripe to confirm your payment. This usually takes just a few seconds.
              </Text>
            </View>
          )}

          {phase === 'timeout' && (
            <View style={styles.centerBlock}>
              <Icon name="time-outline" size={48} color="#d97706" />
              <Text style={styles.title}>Still confirming…</Text>
              <Text style={styles.subtitle}>
                Your payment is taking a little longer than usual to confirm. If it went through, your booking will
                appear under Profile → Bookings shortly.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => onNavigate('profile')} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Go to my bookings</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'cancelled' && (
            <View style={styles.centerBlock}>
              <Icon name="close-circle-outline" size={48} color="#C8102E" />
              <Text style={styles.title}>Checkout cancelled</Text>
              <Text style={styles.subtitle}>
                No payment was taken and your seats have been released. You can pick your seats again whenever
                you&apos;re ready.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => onNavigate('allshows')} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Browse shows</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'paid' && booking && (
            <View style={styles.centerBlock}>
              <Icon name="checkmark-circle" size={52} color="#16a34a" />
              <Text style={styles.title}>Payment confirmed!</Text>
              <Text style={styles.subtitle}>Your seats are booked. Here are your details:</Text>

              <View style={styles.detailBox}>
                <Row label="Reference" value={booking.id.slice(0, 8).toUpperCase()} />
                <Row label="Production" value={booking.movie_title ?? '—'} />
                <Row label="Date & time" value={formattedShow} />
                <Row label="Seats" value={booking.seats.length ? booking.seats.join(', ') : '—'} />
                <Row label="Tickets" value={String(booking.num_tickets)} />
                <View style={styles.detailDivider} />
                <Row label="Total paid" value={`$${Number(booking.total_price).toFixed(2)}`} emphasize />
              </View>

              <Text style={styles.footnote}>
                A copy of this confirmation is available under Profile → Bookings if you booked while signed in.
              </Text>

              <TouchableOpacity style={styles.primaryBtn} onPress={() => onNavigate('home')} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Back to home</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const Row = ({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, emphasize && styles.detailValueEmphasize]} numberOfLines={2}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#0a0a0a' },

  card: {
    width: '100%', maxWidth: 460, marginHorizontal: 20,
    backgroundColor: '#161616', borderRadius: 16, borderWidth: 1, borderColor: '#262626',
    padding: 28,
  },
  centerBlock: { alignItems: 'center' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  subtitle: { color: '#9a9a9a', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10 },

  detailBox: {
    alignSelf: 'stretch', backgroundColor: '#0f0f0f', borderRadius: 12,
    borderWidth: 1, borderColor: '#242424', padding: 16, marginTop: 22,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  detailLabel: { color: '#777', fontSize: 12, flexShrink: 0 },
  detailValue: { color: '#e6e6e6', fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  detailValueEmphasize: { color: '#16a34a', fontSize: 16, fontWeight: '800' },
  detailDivider: { height: 1, backgroundColor: '#242424', marginBottom: 12 },

  footnote: { color: '#666', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18 },

  primaryBtn: { backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 28, marginTop: 22 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default BookingConfirmationScreen;
