import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  StatusBar,
  SafeAreaView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { VENUE_TIMEZONE, shortRef } from '../config/venue';
import NavBar from '../components/NavBar';
import { createStyles, typography, colors } from '../theme';
import type { OnNavigate } from '../types/navigation';

type Props = {
  // The unguessable booking UUID from /ticket/:ref (carried in the movieId slot).
  ticketRef: string | null;
  onNavigate: OnNavigate;
};

// Matches the get_ticket RPC shape.
type Ticket = {
  id: string;
  payment_status: string;
  movie_title: string | null;
  show_start_time: string | null;
  num_tickets: number;
  total_price: number;
  checked_in_at: string | null;
  seats: string[];
};

type Phase = 'loading' | 'paid' | 'unpaid' | 'notfound';

const TicketScreen = ({ ticketRef, onNavigate }: Props) => {
  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<Phase>('loading');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);

  // The QR (and the box-office scan) encode this canonical ticket URL. Built
  // from the current origin so it works on the Vercel staging URL without a
  // hard-coded domain.
  const origin = (globalThis as any)?.location?.origin ?? '';
  const ticketUrl = ticketRef ? `${origin}/ticket/${ticketRef}` : '';

  useEffect(() => {
    let active = true;
    if (!ticketRef) {
      setPhase('notfound');
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_ticket', { p_booking_id: ticketRef });
        if (!active) return;
        const row = data as Ticket | null;
        if (error || !row) {
          setPhase('notfound');
          return;
        }
        setTicket(row);
        setPhase(row.payment_status === 'paid' ? 'paid' : 'unpaid');
      } catch (err) {
        if (!active) return;
        logger.error('Ticket load failed:', err);
        setPhase('notfound');
      }
    })();
    return () => { active = false; };
  }, [ticketRef]);

  // Render the QR as crisp SVG, delivered through an <Image> data-URI so it
  // needs no native SVG dependency and stays react-native-web friendly.
  useEffect(() => {
    let active = true;
    if (phase !== 'paid' || !ticketUrl) { setQrUri(null); return; }
    QRCode.toString(ticketUrl, { type: 'svg', margin: 1 })
      .then((svg) => {
        if (active) setQrUri('data:image/svg+xml;base64,' + btoa(svg));
      })
      .catch((err) => {
        logger.error('Ticket QR render failed:', err);
        if (active) setQrUri(null);
      });
    return () => { active = false; };
  }, [phase, ticketUrl]);

  const showDate = ticket?.show_start_time ? new Date(ticket.show_start_time) : null;
  const formattedShow = showDate
    ? `${showDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: VENUE_TIMEZONE })} · ${showDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE, timeZoneName: 'short' })}`
    : '—';

  const reference = ticket ? shortRef(ticket.id) : '';

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
          {phase === 'loading' && (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color="#C8102E" />
              <Text style={styles.subtitle}>Loading your ticket…</Text>
            </View>
          )}

          {phase === 'notfound' && (
            <View style={styles.centerBlock}>
              <Icon name="alert-circle-outline" size={48} color="#d97706" />
              <Text style={styles.title}>Ticket not found</Text>
              <Text style={styles.subtitle}>
                We couldn&apos;t find this ticket. Double-check the link from your confirmation email, or look up your
                booking with your reference and email.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => onNavigate('bookinglookup')} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Find my booking</Text>
              </TouchableOpacity>
            </View>
          )}

          {phase === 'unpaid' && (
            <View style={styles.centerBlock}>
              <Icon name="time-outline" size={48} color="#d97706" />
              <Text style={styles.title}>Not yet paid</Text>
              <Text style={styles.subtitle}>
                This booking isn&apos;t confirmed yet, so there&apos;s no valid ticket to show. If you just paid, give it a
                moment and refresh.
              </Text>
            </View>
          )}

          {phase === 'paid' && ticket && (
            <View style={styles.centerBlock}>
              <Text style={styles.eyebrow}>E-TICKET</Text>
              <Text style={styles.title} numberOfLines={2}>{ticket.movie_title ?? 'Your show'}</Text>

              <View style={styles.qrBox}>
                {qrUri ? (
                  <Image source={{ uri: qrUri }} style={styles.qr} resizeMode="contain" />
                ) : (
                  <ActivityIndicator size="small" color="#12122a" />
                )}
              </View>

              <Text style={styles.refLabel}>Booking reference</Text>
              <Text style={styles.refValue}>{reference}</Text>

              {ticket.checked_in_at && (
                <View style={styles.checkedBadge}>
                  <Icon name="checkmark-circle" size={14} color="#16a34a" />
                  <Text style={styles.checkedText}>Checked in</Text>
                </View>
              )}

              <View style={styles.detailBox}>
                <Row label="Date & time" value={formattedShow} />
                <Row label="Seats" value={ticket.seats.length ? ticket.seats.join(', ') : 'General admission'} />
                <Row label="Tickets" value={String(ticket.num_tickets)} />
              </View>

              <Text style={styles.footnote}>
                Show this QR at the box office. Can&apos;t scan it? Read out your reference {reference} instead.
              </Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
  </View>
);

const styles = createStyles({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#0a0a0a' },

  card: {
    width: '100%', maxWidth: 420, marginHorizontal: 20,
    backgroundColor: '#161616', borderRadius: 16, borderWidth: 1, borderColor: '#262626',
    padding: 28,
  },
  centerBlock: { alignItems: 'center' },
  eyebrow: { ...typography.caption, color: '#C8102E', fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  title: { ...typography.heading2, color: '#fff', fontWeight: '800', marginTop: 8, textAlign: 'center' },
  subtitle: { ...typography.caption, fontSize: 13, lineHeight: 19, color: '#9a9a9a', textAlign: 'center', marginTop: 12 },

  qrBox: {
    width: 244, height: 244, borderRadius: 16, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginTop: 20, padding: 12,
  },
  qr: { width: 220, height: 220 },

  refLabel: { ...typography.caption, color: colors.textMutedOnDark, textTransform: 'uppercase', letterSpacing: 1, marginTop: 18 },
  refValue: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 3, marginTop: 4 },

  checkedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    backgroundColor: 'rgba(22,163,74,0.12)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.4)',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
  },
  checkedText: { color: '#16a34a', fontSize: 12, fontWeight: '700' },

  detailBox: {
    alignSelf: 'stretch', backgroundColor: '#0f0f0f', borderRadius: 12,
    borderWidth: 1, borderColor: '#242424', padding: 16, marginTop: 22,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  detailLabel: { ...typography.caption, color: colors.textMutedOnDark, flexShrink: 0 },
  detailValue: { ...typography.caption, color: '#e6e6e6', fontWeight: '600', flex: 1, textAlign: 'right' },

  footnote: { color: colors.textMutedOnDark, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18 },

  primaryBtn: { backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 28, marginTop: 22 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default TicketScreen;
