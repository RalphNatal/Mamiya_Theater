import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabase';
import NavBar from '../components/NavBar';
import { useAppModal } from '../components/ModalProvider';
import type { OnNavigate } from '../types/navigation';

type ShowtimeWithMovie = {
  id: string;
  movie_id: string;
  start_time: string;
  price: number;
  available_seats: number;
  movies: { title: string; poster_url: string | null } | null;
};

type Props = {
  movieId: string | null;
  showtimeId: string | null;
  onNavigate: OnNavigate;
};

// Fixed theater layout: rows A–J × 10 seats = 100 seats. Edit here to
// change the venue shape — everything below reads from this constant.
const SEAT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SEATS_PER_ROW = 10;
const SEAT_LAYOUT: string[][] = SEAT_ROWS.map(row =>
  Array.from({ length: SEATS_PER_ROW }, (_, i) => `${row}${i + 1}`)
);
const MAX_TICKETS = 10;

const SeatSelectionScreen = ({ movieId, showtimeId, onNavigate }: Props) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showtime, setShowtime] = useState<ShowtimeWithMovie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [takenSeats, setTakenSeats] = useState<Set<string>>(new Set());

  const [quantity, setQuantity] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [limitHint, setLimitHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── AUTH GUARD ── booking requires a session; bounce to login otherwise
  // (the user can navigate back here and book once signed in).
  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (!session) {
        onNavigate('login');
        return;
      }
      setCheckingAuth(false);
    });
    return () => { isMounted = false; };
  }, [onNavigate]);

  const loadTakenSeats = async () => {
    if (!showtimeId) return;
    const { data } = await supabase
      .from('booking_seats')
      .select('seat_number')
      .eq('showtime_id', showtimeId);
    setTakenSeats(new Set((data ?? []).map((r: any) => r.seat_number as string)));
  };

  useEffect(() => {
    if (checkingAuth) return;
    if (!showtimeId) {
      setError('No showtime selected.');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('showtimes')
          .select('id, movie_id, start_time, price, available_seats, movies(title, poster_url)')
          .eq('id', showtimeId)
          .single();
        if (fetchError) throw fetchError;
        setShowtime(data as any);
        setError(null);
        await loadTakenSeats();
      } catch (err: any) {
        setError(err.message ?? 'Failed to load this showtime.');
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth, showtimeId]);

  const maxQuantity = Math.max(1, Math.min(showtime?.available_seats ?? 1, MAX_TICKETS));

  // Keep quantity in range once the real available_seats is known, and trim
  // any selection that no longer fits a lowered quantity.
  useEffect(() => {
    setQuantity(q => Math.min(q, maxQuantity));
  }, [maxQuantity]);

  useEffect(() => {
    setSelectedSeats(seats => seats.slice(0, quantity));
    setLimitHint(false);
  }, [quantity]);

  const toggleSeat = (seatNumber: string) => {
    if (takenSeats.has(seatNumber)) return;
    setSelectedSeats(prev => {
      if (prev.includes(seatNumber)) {
        setLimitHint(false);
        return prev.filter(s => s !== seatNumber);
      }
      if (prev.length >= quantity) {
        setLimitHint(true);
        return prev;
      }
      setLimitHint(false);
      return [...prev, seatNumber];
    });
  };

  const movie = showtime?.movies ?? null;
  const pricePer = showtime ? Number(showtime.price) : 0;
  const total = pricePer * quantity;

  const formattedDate = showtime
    ? new Date(showtime.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const formattedTime = showtime
    ? new Date(showtime.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';

  const canConfirm = selectedSeats.length === quantity && !submitting;

  const handleConfirm = async () => {
    if (!showtimeId || !canConfirm) return;
    setSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc('create_booking', {
        p_showtime_id: showtimeId,
        p_seats: selectedSeats,
      });
      if (rpcError) throw rpcError;

      showModal({
        title: 'Booking confirmed!',
        message: `Seats ${selectedSeats.join(', ')} are booked for ${movie?.title ?? 'this showtime'}. You can find it under Profile → Bookings and transactions.`,
        variant: 'success',
      });
      onNavigate('profile');
    } catch (err: any) {
      console.error('Failed to create booking:', err);
      showModal({
        title: 'Booking failed',
        message: err.message ?? 'Something went wrong while booking your seats.',
        variant: 'error',
      });
      setSelectedSeats([]);
      await loadTakenSeats();
    } finally {
      setSubmitting(false);
    }
  };

  const Navbar = <NavBar onNavigate={onNavigate} scrollY={scrollY} onHeightChange={setNavbarHeight} showBackButton />;

  if (checkingAuth || loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#12122a" />
        {Navbar}
        <ActivityIndicator size="large" color="#C8102E" style={[styles.loadingIndicator, { marginTop: navbarHeight + 60 }]} />
      </SafeAreaView>
    );
  }

  // Sends the user back to the specific movie's showtimes (so they can pick
  // another slot) rather than the generic all-shows list, whenever we know
  // which movie this booking attempt was for.
  const handleBackToShow = () => {
    if (movieId) {
      onNavigate('showdetails', movieId);
    } else {
      onNavigate('allshows');
    }
  };

  if (error || !showtime) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#12122a" />
        {Navbar}
        <View style={[styles.centerState, { marginTop: navbarHeight }]}>
          <Text style={styles.emptyText}>{error ?? 'Showtime not found.'}</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={handleBackToShow} activeOpacity={0.85}>
            <Text style={styles.browseBtnText}>Browse Shows</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const soldOut = (showtime.available_seats ?? 0) <= 0;

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
        {/* ── HEADER ── */}
        <View style={[styles.header, !isDesktop && styles.headerMobile]}>
          {movie?.poster_url ? (
            <Image source={{ uri: movie.poster_url }} style={styles.posterThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.posterThumb, styles.posterPlaceholder]}>
              <Text style={styles.posterPlaceholderTxt}>🎬</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerLabel}>SELECT YOUR SEATS</Text>
            <Text style={styles.headerTitle} numberOfLines={2}>{movie?.title ?? 'Showtime'}</Text>
            <Text style={styles.headerSubtitle}>{formattedDate} · {formattedTime}</Text>
          </View>
        </View>

        {soldOut ? (
          <View style={styles.centerState}>
            <Text style={styles.emptyText}>This showtime is sold out.</Text>
            <TouchableOpacity style={styles.browseBtn} onPress={handleBackToShow} activeOpacity={0.85}>
              <Text style={styles.browseBtnText}>Browse Shows</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.contentRow, !isDesktop && styles.contentRowMobile]}>

            {/* ── LEFT: quantity + seat map ── */}
            <View style={styles.mainCol}>

              {/* STEP 1 */}
              <View style={styles.stepCard}>
                <Text style={styles.stepLabel}>1. How many tickets?</Text>
                <View style={styles.quantityRow}>
                  <TouchableOpacity
                    style={[styles.qtyBtn, quantity <= 1 && styles.qtyBtnDisabled]}
                    onPress={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{quantity}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, quantity >= maxQuantity && styles.qtyBtnDisabled]}
                    onPress={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                    disabled={quantity >= maxQuantity}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyHint}>{showtime.available_seats} seats left</Text>
                </View>
              </View>

              {/* STEP 2 */}
              <View style={styles.stepCard}>
                <Text style={styles.stepLabel}>2. Choose your seats</Text>

                <View style={styles.screenBar}>
                  <Text style={styles.screenBarText}>SCREEN</Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.seatMap}>
                    {SEAT_LAYOUT.map(rowSeats => (
                      <View key={rowSeats[0][0]} style={styles.seatRow}>
                        <Text style={styles.rowLabel}>{rowSeats[0][0]}</Text>
                        <View style={styles.seatRowSeats}>
                          {rowSeats.map(seatNumber => {
                            const isTaken = takenSeats.has(seatNumber);
                            const isSelected = selectedSeats.includes(seatNumber);
                            return (
                              <TouchableOpacity
                                key={seatNumber}
                                style={[
                                  styles.seat,
                                  isSelected && styles.seatSelected,
                                  isTaken && styles.seatTaken,
                                ]}
                                disabled={isTaken}
                                onPress={() => toggleSeat(seatNumber)}
                                activeOpacity={0.7}
                              >
                                <Text style={[
                                  styles.seatText,
                                  isSelected && styles.seatTextSelected,
                                  isTaken && styles.seatTextTaken,
                                ]}>
                                  {seatNumber.slice(1)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.swatchAvailable]} />
                    <Text style={styles.legendText}>Available</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.swatchSelected]} />
                    <Text style={styles.legendText}>Selected</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.swatchTaken]} />
                    <Text style={styles.legendText}>Taken</Text>
                  </View>
                </View>

                {limitHint && (
                  <Text style={styles.limitHintText}>
                    You've already picked {quantity} seat{quantity > 1 ? 's' : ''}. Deselect one to choose a different seat, or increase the ticket count above.
                  </Text>
                )}
              </View>
            </View>

            {/* ── RIGHT: order summary ── */}
            <View style={styles.summaryCol}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Order summary</Text>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Movie</Text>
                  <Text style={styles.summaryValue} numberOfLines={1}>{movie?.title ?? '—'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Date &amp; time</Text>
                  <Text style={styles.summaryValue}>{formattedDate} · {formattedTime}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Seats</Text>
                  <Text style={styles.summaryValue}>{selectedSeats.length ? selectedSeats.join(', ') : '—'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tickets</Text>
                  <Text style={styles.summaryValue}>{quantity} × ${pricePer.toFixed(2)}</Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
                  onPress={handleConfirm}
                  disabled={!canConfirm}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmBtnText}>
                    {submitting ? 'Booking…' : `Confirm booking (${selectedSeats.length}/${quantity})`}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.noPaymentNote}>No payment is collected at this step.</Text>
              </View>
            </View>
          </View>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingIndicator: { marginVertical: 40 },

  centerState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 20 },
  browseBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── HEADER ──
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

  // ── LAYOUT ──
  contentRow: { flexDirection: 'row', gap: 24, paddingHorizontal: 60, paddingBottom: 40, alignItems: 'flex-start' },
  contentRowMobile: { flexDirection: 'column', paddingHorizontal: 20, gap: 16 },
  mainCol: { flex: 1, minWidth: 0, gap: 16 },
  summaryCol: { width: 320 },

  // ── STEP CARDS ──
  stepCard: { backgroundColor: '#161616', borderRadius: 12, borderWidth: 1, borderColor: '#262626', padding: 20 },
  stepLabel: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 16 },

  // ── QUANTITY ──
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#222',
    borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  qtyValue: { color: '#fff', fontSize: 18, fontWeight: '800', minWidth: 24, textAlign: 'center' },
  qtyHint: { color: '#666', fontSize: 12, marginLeft: 8 },

  // ── SEAT MAP ──
  screenBar: {
    alignSelf: 'center', backgroundColor: '#222', borderRadius: 4,
    paddingVertical: 6, paddingHorizontal: 60, marginBottom: 24,
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
  },
  screenBarText: { color: '#999', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  seatMap: { gap: 8, paddingBottom: 8 },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { width: 16, color: '#666', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  seatRowSeats: { flexDirection: 'row', gap: 6 },
  seat: {
    width: 28, height: 28, borderRadius: 6,
    borderWidth: 1, borderColor: '#333', backgroundColor: '#1c1c1c',
    alignItems: 'center', justifyContent: 'center',
  },
  seatSelected: { backgroundColor: '#C8102E', borderColor: '#C8102E' },
  seatTaken: { backgroundColor: '#0a0a0a', borderColor: '#1a1a1a', opacity: 0.5 },
  seatText: { color: '#888', fontSize: 10, fontWeight: '700' },
  seatTextSelected: { color: '#fff' },
  seatTextTaken: { color: '#444' },

  legendRow: { flexDirection: 'row', gap: 20, marginTop: 20, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
  swatchAvailable: { backgroundColor: '#1c1c1c', borderColor: '#333' },
  swatchSelected: { backgroundColor: '#C8102E', borderColor: '#C8102E' },
  swatchTaken: { backgroundColor: '#0a0a0a', borderColor: '#1a1a1a', opacity: 0.6 },
  legendText: { color: '#888', fontSize: 12 },

  limitHintText: { color: '#d97706', fontSize: 12, marginTop: 14, lineHeight: 17 },

  // ── ORDER SUMMARY ──
  summaryCard: {
    backgroundColor: '#161616', borderRadius: 12, borderWidth: 1, borderColor: '#262626',
    padding: 20,
  },
  summaryTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  summaryLabel: { color: '#777', fontSize: 12, flexShrink: 0 },
  summaryValue: { color: '#e6e6e6', fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  summaryDivider: { height: 1, backgroundColor: '#262626', marginVertical: 8 },
  totalLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },
  totalValue: { color: '#C8102E', fontSize: 20, fontWeight: '800' },

  confirmBtn: { backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  confirmBtnDisabled: { backgroundColor: '#5a2230', opacity: 0.7 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  noPaymentNote: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 10 },
});

export default SeatSelectionScreen;
