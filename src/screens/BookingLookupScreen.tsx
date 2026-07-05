import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { isValidEmail } from '../lib/validation';
import { VENUE_TIMEZONE, shortRef } from '../config/venue';
import NavBar from '../components/NavBar';
import { createStyles, typography, colors } from '../theme';
import type { OnNavigate } from '../types/navigation';

type Props = {
  onNavigate: OnNavigate;
};

// Matches the JSON shape returned by the get_booking_by_reference RPC — the same
// fields the confirmation card shows (minus the payment_status/status the poller
// needs, since this RPC only ever returns paid bookings).
type LookupBooking = {
  id: string;
  movie_title: string | null;
  show_start_time: string | null;
  num_tickets: number;
  total_price: number;
  seats: string[];
};

// 'idle' before the first search; 'found'/'notfound' reflect the last result.
type SearchState = 'idle' | 'found' | 'notfound';

const BookingLookupScreen = ({ onNavigate }: Props) => {
  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [searching, setSearching] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [booking, setBooking] = useState<LookupBooking | null>(null);

  const handleSearch = async () => {
    // The reference is accepted with or without the "MT-" prefix and in any
    // case — the RPC normalizes it — so we only require it to be non-empty here.
    const refErr = !reference.trim() ? 'Please enter your booking reference.' : null;
    const emailErr = !email.trim()
      ? 'Please enter your email address.'
      : !isValidEmail(email)
        ? 'Please enter a valid email address.'
        : null;

    setReferenceError(refErr);
    setEmailError(emailErr);
    if (refErr || emailErr) return;

    try {
      setSearching(true);
      const { data, error } = await supabase.rpc('get_booking_by_reference', {
        p_reference: reference.trim(),
        p_email: email.trim(),
      });
      if (error) throw error;

      const row = data as LookupBooking | null;
      if (row) {
        setBooking(row);
        setSearchState('found');
      } else {
        // Null = no paid booking matches BOTH reference and email. We never
        // reveal which field was wrong — a single generic result.
        setBooking(null);
        setSearchState('notfound');
      }
    } catch (err) {
      logger.error('Booking lookup failed:', err);
      // Treat an unexpected error the same as "not found" for the visitor —
      // still no enumeration signal, and the details are logged for us.
      setBooking(null);
      setSearchState('notfound');
    } finally {
      setSearching(false);
    }
  };

  // Always render in the venue's timezone (see src/config/venue.ts), never the
  // viewer's — identical to the confirmation screen so the two read the same.
  const showDate = booking?.show_start_time ? new Date(booking.show_start_time) : null;
  const formattedShow = showDate
    ? `${showDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: VENUE_TIMEZONE })} · ${showDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE, timeZoneName: 'short' })}`
    : '—';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />

      <NavBar onNavigate={onNavigate} scrollY={scrollY} onHeightChange={setNavbarHeight} showBackButton />

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: navbarHeight + 24, paddingBottom: 48, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Icon name="search-outline" size={44} color="#C8102E" style={styles.headerIcon} />
          <Text style={styles.title}>Find my booking</Text>
          <Text style={styles.subtitle}>
            Enter your booking reference and the email you booked with, and we&apos;ll pull up your confirmed booking.
          </Text>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Booking reference</Text>
              <TextInput
                style={[styles.input, !!referenceError && styles.inputError]}
                placeholder="MT-XXXXXXXX"
                placeholderTextColor="#666"
                value={reference}
                onChangeText={(t) => {
                  setReference(t);
                  if (referenceError) setReferenceError(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {!!referenceError && <Text style={styles.errorText}>{referenceError}</Text>}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email address</Text>
              <TextInput
                style={[styles.input, !!emailError && styles.inputError]}
                placeholder="you@example.com"
                placeholderTextColor="#666"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, searching && styles.submitBtnDisabled]}
              activeOpacity={0.85}
              onPress={handleSearch}
              disabled={searching}
            >
              {searching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Find booking</Text>
              )}
            </TouchableOpacity>
          </View>

          {searchState === 'found' && booking && (
            <View style={styles.resultBlock}>
              <View style={styles.foundHeader}>
                <Icon name="checkmark-circle" size={22} color="#16a34a" />
                <Text style={styles.foundTitle}>Booking found</Text>
              </View>

              <View style={styles.detailBox}>
                <Row label="Reference" value={shortRef(booking.id)} />
                <Row label="Production" value={booking.movie_title ?? '—'} />
                <Row label="Date & time" value={formattedShow} />
                <Row label="Seats" value={booking.seats.length ? booking.seats.join(', ') : '—'} />
                <Row label="Tickets" value={String(booking.num_tickets)} />
                <View style={styles.detailDivider} />
                <Row label="Total paid" value={`$${Number(booking.total_price).toFixed(2)}`} emphasize />
              </View>

              <Text style={styles.footnote}>
                Please have your reference ready at the box office. See you at the theater!
              </Text>
            </View>
          )}

          {searchState === 'notfound' && (
            <View style={styles.resultBlock}>
              <View style={styles.notFoundBox}>
                <Icon name="alert-circle-outline" size={22} color="#d97706" />
                <Text style={styles.notFoundText}>
                  We couldn&apos;t find a booking with those details. Double-check your reference and the email you
                  booked with, then try again.
                </Text>
              </View>
              <Text style={styles.footnote}>
                Still stuck? <Text style={styles.link} onPress={() => onNavigate('contact')}>Contact us</Text> and
                we&apos;ll help you track it down.
              </Text>
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

const styles = createStyles({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#0a0a0a' },

  card: {
    width: '100%', maxWidth: 460, marginHorizontal: 20,
    backgroundColor: '#161616', borderRadius: 16, borderWidth: 1, borderColor: '#262626',
    padding: 28, alignItems: 'center',
  },
  headerIcon: { marginBottom: 4 },
  title: { ...typography.heading2, color: '#fff', fontWeight: '800', marginTop: 12, textAlign: 'center' },
  subtitle: { ...typography.caption, fontSize: 13, lineHeight: 19, color: '#9a9a9a', textAlign: 'center', marginTop: 10 },

  // ── FORM ──
  form: { alignSelf: 'stretch', marginTop: 22 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { ...typography.caption, fontSize: 12, fontWeight: '700', color: '#cfcfcf', marginBottom: 8 },
  input: {
    ...typography.body, borderWidth: 1.5, borderColor: '#2c2c2c', borderRadius: 10, backgroundColor: '#0f0f0f',
    paddingHorizontal: 14, paddingVertical: 12, color: '#f2f2f2',
  },
  inputError: { borderColor: '#ef4444' },
  errorText: { fontSize: 11, color: '#f87171', marginTop: 5 },
  submitBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 4, minHeight: 48,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── RESULT ──
  resultBlock: { alignSelf: 'stretch', marginTop: 24 },
  foundHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 },
  foundTitle: { ...typography.body, color: '#fff', fontWeight: '800' },

  detailBox: {
    alignSelf: 'stretch', backgroundColor: '#0f0f0f', borderRadius: 12,
    borderWidth: 1, borderColor: '#242424', padding: 16, marginTop: 12,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  detailLabel: { ...typography.caption, color: colors.textMutedOnDark, flexShrink: 0 },
  detailValue: { ...typography.caption, color: '#e6e6e6', fontWeight: '600', flex: 1, textAlign: 'right' },
  detailValueEmphasize: { color: '#16a34a', fontSize: 16, fontWeight: '800' },
  detailDivider: { height: 1, backgroundColor: '#242424', marginBottom: 12 },

  notFoundBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: 'rgba(217,119,6,0.08)', borderWidth: 1, borderColor: 'rgba(217,119,6,0.3)',
    borderRadius: 12, padding: 14,
  },
  notFoundText: { ...typography.caption, fontSize: 13, lineHeight: 19, color: '#e6e6e6', flex: 1 },

  footnote: { color: colors.textMutedOnDark, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 16 },
  link: { color: '#C8102E', fontWeight: '700' },
});

export default BookingLookupScreen;
