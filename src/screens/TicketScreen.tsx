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
import { ZONE_META, type Zone } from '../config/theaterLayout';
import NavBar from '../components/NavBar';
import { createStyles, typography, colors } from '../theme';
import type { OnNavigate } from '../types/navigation';

type Props = {
  // The unguessable uuid from /ticket/:ref (carried in the movieId slot). It is
  // EITHER a per-seat ticket_token (the QR on each ticket) OR a booking id (the
  // "View your tickets" link in the confirmation email / screen) — we try the
  // seat first, then fall back to the booking.
  ticketRef: string | null;
  onNavigate: OnNavigate;
};

// One seat's ticket — the shape of get_ticket(...).tickets[] and the core of
// get_ticket_by_token(...).
type SeatTicket = {
  token: string;
  seat: string;
  zone: Zone | null;
  checked_in_at: string | null;
};

// Booking-level view (get_ticket RPC).
type BookingTicket = {
  id: string;
  payment_status: string;
  movie_title: string | null;
  show_start_time: string | null;
  num_tickets: number;
  total_price: number;
  checked_in_at: string | null;
  seats: string[];
  tickets: SeatTicket[];
};

// Single-seat view (get_ticket_by_token RPC).
type TokenTicket = SeatTicket & {
  booking_id: string;
  payment_status: string;
  movie_title: string | null;
  show_start_time: string | null;
  num_tickets: number;
};

type Phase = 'loading' | 'paid' | 'unpaid' | 'notfound';

// What the page renders, normalised from either RPC.
type PageData = {
  bookingId: string;
  paymentStatus: string;
  title: string | null;
  showStart: string | null;
  numTickets: number;
  tickets: SeatTicket[];
  // true when the URL was a per-seat token: show just that seat, plus a link to
  // the rest of the booking.
  singleSeat: boolean;
};

const zoneLabel = (z: Zone | null | undefined): string | null => (z && ZONE_META[z] ? ZONE_META[z].label : null);

// Renders the QR as crisp SVG, delivered through an <Image> data-URI so it
// needs no native SVG dependency and stays react-native-web friendly.
const useQrDataUri = (value: string | null): string | null => {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!value) { setUri(null); return; }
    QRCode.toString(value, { type: 'svg', margin: 1 })
      .then((svg) => { if (active) setUri('data:image/svg+xml;base64,' + btoa(svg)); })
      .catch((err) => {
        logger.error('Ticket QR render failed:', err);
        if (active) setUri(null);
      });
    return () => { active = false; };
  }, [value]);
  return uri;
};

// One scannable ticket card: QR (encoding /ticket/<token>), seat label + zone,
// and its own checked-in state. The box office scans THIS QR to admit THIS seat.
const SeatTicketCard = ({ ticket, origin }: { ticket: SeatTicket; origin: string }) => {
  const url = `${origin}/ticket/${ticket.token}`;
  const qrUri = useQrDataUri(url);
  const zone = zoneLabel(ticket.zone);
  return (
    <View style={styles.ticketCard}>
      <View style={styles.qrBox}>
        {qrUri ? (
          <Image source={{ uri: qrUri }} style={styles.qr} resizeMode="contain" accessibilityLabel={`Ticket QR for seat ${ticket.seat}`} />
        ) : (
          <ActivityIndicator size="small" color="#12122a" />
        )}
      </View>
      <Text style={styles.seatLabel}>
        Seat {ticket.seat}{zone ? ` · ${zone}` : ''}
      </Text>
      {ticket.checked_in_at ? (
        <View style={styles.checkedBadge}>
          <Icon name="checkmark-circle" size={14} color="#16a34a" />
          <Text style={styles.checkedText}>Checked in</Text>
        </View>
      ) : (
        <View style={[styles.checkedBadge, styles.pendingBadge]}>
          <Icon name="qr-code-outline" size={13} color="#9a9a9a" />
          <Text style={styles.pendingText}>Scan at the door</Text>
        </View>
      )}
    </View>
  );
};

const TicketScreen = ({ ticketRef, onNavigate }: Props) => {
  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<PageData | null>(null);

  // QR URLs are built from the current origin so they work on the Vercel
  // staging URL without a hard-coded domain (same as the email links, which use
  // FRONTEND_URL server-side).
  const origin = (globalThis as any)?.location?.origin ?? '';

  useEffect(() => {
    let active = true;
    if (!ticketRef) {
      setPhase('notfound');
      return;
    }
    (async () => {
      try {
        // 1) Per-seat token (the QR on a ticket): exactly one seat.
        const byToken = await supabase.rpc('get_ticket_by_token', { p_token: ticketRef });
        if (!active) return;
        const seatRow = byToken.error ? null : (byToken.data as TokenTicket | null);
        if (seatRow) {
          setData({
            bookingId: seatRow.booking_id,
            paymentStatus: seatRow.payment_status,
            title: seatRow.movie_title,
            showStart: seatRow.show_start_time,
            numTickets: seatRow.num_tickets,
            tickets: [{ token: seatRow.token, seat: seatRow.seat, zone: seatRow.zone, checked_in_at: seatRow.checked_in_at }],
            singleSeat: true,
          });
          setPhase(seatRow.payment_status === 'paid' ? 'paid' : 'unpaid');
          return;
        }

        // 2) Booking id (confirmation-email / screen link): every seat's ticket.
        const byBooking = await supabase.rpc('get_ticket', { p_booking_id: ticketRef });
        if (!active) return;
        const row = byBooking.error ? null : (byBooking.data as BookingTicket | null);
        if (!row) {
          setPhase('notfound');
          return;
        }
        setData({
          bookingId: row.id,
          paymentStatus: row.payment_status,
          title: row.movie_title,
          showStart: row.show_start_time,
          numTickets: row.num_tickets,
          tickets: row.tickets ?? [],
          singleSeat: false,
        });
        setPhase(row.payment_status === 'paid' ? 'paid' : 'unpaid');
      } catch (err) {
        if (!active) return;
        logger.error('Ticket load failed:', err);
        setPhase('notfound');
      }
    })();
    return () => { active = false; };
  }, [ticketRef]);

  const showDate = data?.showStart ? new Date(data.showStart) : null;
  const formattedShow = showDate
    ? `${showDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: VENUE_TIMEZONE })} · ${showDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE, timeZoneName: 'short' })}`
    : '—';

  const reference = data ? shortRef(data.bookingId) : '';
  const checkedIn = data ? data.tickets.filter(t => !!t.checked_in_at).length : 0;

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

          {phase === 'paid' && data && (
            <View style={styles.centerBlock}>
              <Text style={styles.eyebrow}>{data.singleSeat ? 'E-TICKET' : `E-TICKETS · ${data.tickets.length} SEAT${data.tickets.length === 1 ? '' : 'S'}`}</Text>
              <Text style={styles.title} numberOfLines={2}>{data.title ?? 'Your show'}</Text>
              <Text style={styles.showLine}>{formattedShow}</Text>

              <Text style={styles.refLabel}>Booking reference</Text>
              <Text style={styles.refValue}>{reference}</Text>

              {/* One QR PER SEAT. Each encodes /ticket/<that seat's token>, so the
                  box office admits seats one at a time — a party can arrive
                  separately and a used ticket can't be re-scanned. */}
              <View style={styles.ticketGrid}>
                {data.tickets.map(t => (
                  <SeatTicketCard key={t.token} ticket={t} origin={origin} />
                ))}
                {data.tickets.length === 0 && (
                  <Text style={styles.subtitle}>No seat tickets found for this booking.</Text>
                )}
              </View>

              {!data.singleSeat && data.tickets.length > 1 && (
                <Text style={styles.progress}>
                  {checkedIn} of {data.tickets.length} checked in
                </Text>
              )}

              {data.singleSeat && data.numTickets > 1 && (
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => onNavigate('ticket', data.bookingId)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <Text style={styles.linkBtnText}>
                    This is 1 of {data.numTickets} tickets — view all seats in this booking
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={styles.footnote}>
                Show each seat&apos;s QR at the box office — every guest is scanned in individually. Can&apos;t scan?
                Read out your reference {reference} and the seat number instead.
              </Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = createStyles({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#0a0a0a' },

  card: {
    width: '100%', maxWidth: 560, marginHorizontal: 20,
    backgroundColor: '#161616', borderRadius: 16, borderWidth: 1, borderColor: '#262626',
    padding: 28,
  },
  centerBlock: { alignItems: 'center' },
  eyebrow: { ...typography.caption, color: '#C8102E', fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  title: { ...typography.heading2, color: '#fff', fontWeight: '800', marginTop: 8, textAlign: 'center' },
  subtitle: { ...typography.caption, fontSize: 13, lineHeight: 19, color: '#9a9a9a', textAlign: 'center', marginTop: 12 },
  showLine: { ...typography.caption, color: '#e6e6e6', fontWeight: '600', marginTop: 8, textAlign: 'center' },

  refLabel: { ...typography.caption, color: colors.textMutedOnDark, textTransform: 'uppercase', letterSpacing: 1, marginTop: 18 },
  refValue: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 3, marginTop: 4 },

  // One card per seat; wraps to two columns where the card is wide enough.
  ticketGrid: {
    alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 14, marginTop: 22,
  },
  ticketCard: {
    width: 236, alignItems: 'center', backgroundColor: '#0f0f0f', borderRadius: 14,
    borderWidth: 1, borderColor: '#242424', paddingVertical: 16, paddingHorizontal: 12,
  },
  qrBox: {
    width: 204, height: 204, borderRadius: 12, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', padding: 10,
  },
  qr: { width: 184, height: 184 },
  seatLabel: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 12, textAlign: 'center' },

  checkedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    backgroundColor: 'rgba(22,163,74,0.12)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.4)',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
  },
  checkedText: { color: '#16a34a', fontSize: 12, fontWeight: '700' },
  pendingBadge: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: '#2e2e2e' },
  pendingText: { color: '#9a9a9a', fontSize: 12, fontWeight: '600' },

  progress: { color: colors.textMutedOnDark, fontSize: 12, fontWeight: '600', marginTop: 16 },

  linkBtn: { marginTop: 16, paddingVertical: 6, paddingHorizontal: 10 },
  linkBtnText: { color: '#C8102E', fontSize: 13, fontWeight: '700', textAlign: 'center' },

  footnote: { color: colors.textMutedOnDark, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18 },

  primaryBtn: { backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 28, marginTop: 22 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

export default TicketScreen;
