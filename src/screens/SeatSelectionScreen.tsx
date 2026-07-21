import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { track, AnalyticsEvent } from '../lib/analytics';
import NavBar from '../components/NavBar';
import LoadError from '../components/LoadError';
import { useAppModal } from '../components/ModalProvider';
import { createStyles, typography, layout } from '../theme';
import { theaterSeatGrid, seatZoneById, ZONE_META, ZONE_ORDER, type Seat, type Zone } from '../config/theaterLayout';
import { VENUE_TIMEZONE } from '../config/venue';
import type { OnNavigate } from '../types/navigation';

type ShowtimeWithMovie = {
  id: string;
  production_id: string;
  start_time: string;
  price: number;
  available_seats: number;
  productions: { title: string; poster_url: string | null; total_tickets_capacity: number } | null;
};

type Props = {
  movieId: string | null;
  showtimeId: string | null;
  onNavigate: OnNavigate;
};

const MAX_TICKETS = 10;

// ── Seat-map track width ─────────────────────────────────────────────────────
// The map column is given this as an EXPLICIT width, which is the whole reason
// it both centers and scrolls. A fixed-width block is independent of the
// viewport: in portrait it stays 1168px wide so the scroller has real overflow
// to pan, and on a wide screen justifyContent centers the block. Sizing the
// column with flexGrow / stretch instead makes react-native-web resolve its
// width against the viewport, which clamps the map and leaves nothing to
// scroll. Widest row (35) sets the track; alignItems:'center' on the column
// centers the shorter rows within it, which is what draws the trapezoid.
// These constants MUST stay in lock-step with the styles at the bottom.
const SEAT_W = 28;           // styles.seat.width
const SEAT_MARGIN = 2;       // styles.seat.margin (each side)
const ROW_LABEL_W = 16;      // styles.rowLabel.width (one at each end)
const ROW_LABEL_MARGIN = 4;  // styles.rowLabel.marginHorizontal (each side)
// From the rendered grid, not ROW_SPECS: row P is 30 seats PLUS 4 wheelchair
// spaces, so seats.length is the only count that matches what's on screen.
const WIDEST_ROW_SEATS = Math.max(...theaterSeatGrid.map(r => r.seats.length));
const MAP_W =
  (ROW_LABEL_W + ROW_LABEL_MARGIN * 2) * 2 + WIDEST_ROW_SEATS * (SEAT_W + SEAT_MARGIN * 2);
type SeatButtonProps = {
  seat: Seat;
  isSelected: boolean;
  isTaken: boolean;
  isBlocked: boolean;
  isAccessible: boolean;
  zoneColor: string;      // base fill for an AVAILABLE seat (its price zone)
  zoneTextColor: string;  // readable numeral/icon colour on that fill
  accessibilityLabel: string;
  onPress: (id: string) => void;
};

const SeatButton = React.memo(function SeatButton({
  seat,
  isSelected,
  isTaken,
  isBlocked,
  isAccessible,
  zoneColor,
  zoneTextColor,
  accessibilityLabel,
  onPress,
}: SeatButtonProps) {
  // The seat's default look is its ZONE colour; the selected / taken / blocked
  // state styles come later in the array and override it, so those states stay
  // visually distinct on top of any zone.
  const contentColor = isSelected ? '#fff' : isTaken ? '#444' : zoneTextColor;
  return (
    <TouchableOpacity
      style={[
        styles.seat,
        { backgroundColor: zoneColor, borderColor: zoneColor },
        isAccessible && styles.seatAda,
        isSelected && styles.seatSelected,
        isTaken && styles.seatTaken,
        isBlocked && styles.seatBlocked,
      ]}
      disabled={isTaken}
      onPress={() => onPress(seat.id)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected, disabled: isTaken }}
    >
      {isAccessible ? (
        <Icon name="accessibility" size={13} color={contentColor} />
      ) : (
        <Text style={[styles.seatText, { color: contentColor }]}>
          {seat.seatNumber}
        </Text>
      )}
    </TouchableOpacity>
  );
});

const SeatSelectionScreen = ({ movieId, showtimeId, onNavigate }: Props) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [showtime, setShowtime] = useState<ShowtimeWithMovie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [takenSeats, setTakenSeats] = useState<Set<string>>(new Set());
  const [heldSeats, setHeldSeats] = useState<Set<string>>(new Set());
  const [blockedSeats, setBlockedSeats] = useState<Set<string>>(new Set());
  const [accessibleSeats, setAccessibleSeats] = useState<Set<string>>(new Set());
  // seat_identifier → zone, loaded from venue_seats (the master). Falls back to
  // the frontend layout's zone if a seat is missing, but the two are kept in
  // lock-step by the build-time count assertions on both sides.
  const [venueZoneById, setVenueZoneById] = useState<Map<string, Zone>>(new Map());
  // zone → this showtime's price for that zone (from showtime_seat_prices). Any
  // zone without a row falls back to the showtime's flat price.
  const [zonePrices, setZonePrices] = useState<Map<Zone, number>>(new Map());

  const [quantity, setQuantity] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [limitHint, setLimitHint] = useState(false);
  const [conflictHint, setConflictHint] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Health of the realtime subscription, surfaced as a small badge on the seat
  // map so buyers know whether the map is updating live or momentarily offline.
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  // Seat-map fit check, for the "swipe to see more" hint. The map's width is
  // the fixed MAP_W track, so only the scroller's viewport needs measuring.
  const [scrollW, setScrollW] = useState(0);
  const mapOverflows = scrollW > 0 && MAP_W > scrollW;

  const fetchTakenSeatSets = async (): Promise<{ taken: Set<string>; held: Set<string> }> => {
    if (!showtimeId) return { taken: new Set(), held: new Set() };
    const { data } = await supabase
      .from('booking_seats')
      .select('seat_number, status')
      .eq('showtime_id', showtimeId);
    const taken = new Set<string>();
    const held = new Set<string>();
    (data ?? []).forEach((r: any) => {
      if (r.status === 'blocked') held.add(r.seat_number as string);
      else taken.add(r.seat_number as string);
    });
    return { taken, held };
  };

  const loadTakenSeats = async () => {
    const { taken, held } = await fetchTakenSeatSets();
    setTakenSeats(taken);
    setHeldSeats(held);
  };

  const loadVenueSeats = async () => {
    const { data } = await supabase
      .from('venue_seats')
      .select('seat_identifier, status, is_accessible, zone');
    const blocked = new Set<string>();
    const accessible = new Set<string>();
    const zoneMap = new Map<string, Zone>();
    (data ?? []).forEach((r: any) => {
      if (r.status !== 'available') blocked.add(r.seat_identifier as string);
      if (r.is_accessible) accessible.add(r.seat_identifier as string);
      if (r.zone) zoneMap.set(r.seat_identifier as string, r.zone as Zone);
    });
    setBlockedSeats(blocked);
    setAccessibleSeats(accessible);
    setVenueZoneById(zoneMap);
  };

  // This showtime's per-zone prices (if any). A showtime with no rows sells every
  // seat at its flat price, so the map stays empty and every zone falls back.
  const loadZonePrices = async () => {
    if (!showtimeId) return;
    const { data } = await supabase
      .from('showtime_seat_prices')
      .select('zone, price')
      .eq('showtime_id', showtimeId);
    const map = new Map<Zone, number>();
    (data ?? []).forEach((r: any) => map.set(r.zone as Zone, Number(r.price)));
    setZonePrices(map);
  };

  const loadSeats = useCallback(async () => {
    if (!showtimeId) {
      setError('No showtime selected.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('showtimes')
        .select('id, production_id, start_time, price, available_seats, productions(title, poster_url, total_tickets_capacity)')
        .eq('id', showtimeId)
        .single();
      if (fetchError) throw fetchError;
      setShowtime(data as any);
      setError(null);
      await Promise.all([loadTakenSeats(), loadVenueSeats(), loadZonePrices()]);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load this showtime.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showtimeId]);

  useEffect(() => {
    loadSeats();
  }, [loadSeats]);
  const selectedRef = useRef<string[]>([]);
  useEffect(() => { selectedRef.current = selectedSeats; }, [selectedSeats]);
  useEffect(() => {
    if (!showtimeId) return;
    let active = true;
    setLiveStatus('connecting');

    const applyTaken = (seatNumber: string, status: string) => {
      // Paint the seat as unavailable immediately.
      if (status === 'blocked') {
        setHeldSeats(prev => (prev.has(seatNumber) ? prev : new Set(prev).add(seatNumber)));
      } else {
        setTakenSeats(prev => (prev.has(seatNumber) ? prev : new Set(prev).add(seatNumber)));
      }
      // If the user had it selected, drop it and tell them why.
      if (selectedRef.current.includes(seatNumber)) {
        setSelectedSeats(prev => prev.filter(s => s !== seatNumber));
        setLimitHint(false);
        showModal({
          title: 'Seat just taken',
          message: `Seat ${seatNumber} was booked by someone else, so we removed it from your selection. Please pick another seat.`,
          variant: 'info',
        });
      }
    };

    const applyFreed = (seatNumber: string) => {
      // A hold was lifted or a reservation swept — the seat is available again.
      setTakenSeats(prev => {
        if (!prev.has(seatNumber)) return prev;
        const next = new Set(prev);
        next.delete(seatNumber);
        return next;
      });
      setHeldSeats(prev => {
        if (!prev.has(seatNumber)) return prev;
        const next = new Set(prev);
        next.delete(seatNumber);
        return next;
      });
    };

    // On every (re)connect, re-fetch occupancy to catch any INSERT/DELETE we
    // missed while the socket was down, and drop from the selection anything
    // that got taken in the meantime — so a dropped connection never lets a
    // buyer keep a seat that's since gone.
    const reconcile = async () => {
      const { taken, held } = await fetchTakenSeatSets();
      if (!active) return;
      setTakenSeats(taken);
      setHeldSeats(held);
      const lost = selectedRef.current.filter(s => taken.has(s) || held.has(s));
      if (lost.length > 0) {
        setSelectedSeats(prev => prev.filter(s => !taken.has(s) && !held.has(s)));
        setLimitHint(false);
        showModal({
          title: lost.length > 1 ? 'Seats no longer available' : 'Seat no longer available',
          message: `Seat${lost.length > 1 ? 's' : ''} ${lost.join(', ')} ${lost.length > 1 ? 'were' : 'was'} taken while your connection dropped, so we removed ${lost.length > 1 ? 'them' : 'it'} from your selection.`,
          variant: 'info',
        });
      }
    };

    const channel = supabase
      .channel(`seatmap:${showtimeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'booking_seats', filter: `showtime_id=eq.${showtimeId}` },
        payload => {
          const row = payload.new as { seat_number?: string; status?: string };
          if (row?.seat_number) applyTaken(row.seat_number, row.status ?? 'booked');
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'booking_seats', filter: `showtime_id=eq.${showtimeId}` },
        payload => {
          // old carries the pre-delete row thanks to REPLICA IDENTITY FULL.
          const row = payload.old as { seat_number?: string };
          if (row?.seat_number) applyFreed(row.seat_number);
        },
      )
      .subscribe(status => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          setLiveStatus('live');
          // Reconcile after the mount fetch AND after any auto-reconnect.
          reconcile();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // supabase-js retries on its own; we just reflect the gap in the badge.
          setLiveStatus('offline');
        }
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showtimeId]);

  // Tickets still sellable under the production's capacity cap. takenSeats holds
  // every 'booked' slot (sales + still-pending reservations) for this showtime,
  // so its size IS the live booked-ticket count the cap is measured against.
  const capacity = showtime?.productions?.total_tickets_capacity ?? Number.POSITIVE_INFINITY;
  const remainingUnderCap = Math.max(0, capacity - takenSeats.size);
  const maxQuantity = Math.max(1, Math.min(showtime?.available_seats ?? 1, remainingUnderCap, MAX_TICKETS));

  // Keep quantity in range once the real available_seats is known, and trim
  // any selection that no longer fits a lowered quantity.
  useEffect(() => {
    setQuantity(q => Math.min(q, maxQuantity));
  }, [maxQuantity]);

  useEffect(() => {
    setSelectedSeats(seats => seats.slice(0, quantity));
    setLimitHint(false);
  }, [quantity]);

  // Stable across seat selection (only re-created when the unselectable sets or
  // the quantity cap change) so memoized SeatButtons don't all re-render when a
  // single seat is toggled. Reads the current selection via functional setState
  // rather than closing over it, which is what keeps the identity stable.
  const handleToggle = useCallback((seatNumber: string) => {
    if (takenSeats.has(seatNumber) || heldSeats.has(seatNumber) || blockedSeats.has(seatNumber)) return;
    setConflictHint(null);
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
  }, [takenSeats, heldSeats, blockedSeats, quantity]);

  const movie = showtime?.productions ?? null;
  const pricePer = showtime ? Number(showtime.price) : 0;

  // Resolve a seat's zone (venue master first, layout mirror as fallback) and its
  // effective price for THIS showtime (zone override, else the flat price).
  const resolveZone = (id: string): Zone => venueZoneById.get(id) ?? seatZoneById.get(id) ?? 'general';
  const priceForZone = (z: Zone): number => zonePrices.get(z) ?? pricePer;

  // Running total = SUM of each SELECTED seat's zone price — seats can span zones,
  // so this is never quantity × a single price. Display-only; create_pending_booking
  // re-sums it server-side as the authoritative amount.
  const selectedZones = selectedSeats.map(resolveZone);
  const total = selectedZones.reduce((sum, z) => sum + priceForZone(z), 0);
  // Per-zone breakdown for the order summary ("2 × Premium $X, 1 × Limited View $Y").
  const zoneBreakdown = ZONE_ORDER
    .map(zone => {
      const count = selectedZones.filter(z => z === zone).length;
      const price = priceForZone(zone);
      return { zone, count, price, lineTotal: count * price };
    })
    .filter(b => b.count > 0);

  // Always render in the venue's timezone (see src/config/venue.ts), never the
  // viewer's. timeZone rolls the date correctly for late shows near midnight;
  // timeZoneName lives on the time only, so "HST" prints once (not twice).
  const formattedDate = showtime
    ? new Date(showtime.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: VENUE_TIMEZONE })
    : '';
  const formattedTime = showtime
    ? new Date(showtime.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE, timeZoneName: 'short' })
    : '';

  const canConfirm = selectedSeats.length === quantity;

  // No booking is created here — the checkout screen collects billing details,
  // creates the pending reservation, and starts payment. But we DO re-check
  // availability right before leaving, so a seat someone grabbed while this map
  // was open is caught here (with a clear message) instead of failing mid-payment.
  const handleConfirm = async () => {
    if (!showtimeId || !canConfirm || verifying) return;
    setVerifying(true);
    try {
      const { taken, held } = await fetchTakenSeatSets();
      setTakenSeats(taken);
      setHeldSeats(held);
      const clash = selectedSeats.filter(s => taken.has(s) || held.has(s));
      if (clash.length > 0) {
        setSelectedSeats(prev => prev.filter(s => !taken.has(s) && !held.has(s)));
        setConflictHint(
          `Seat${clash.length > 1 ? 's' : ''} ${clash.join(', ')} ${clash.length > 1 ? 'were' : 'was'} just taken. Please choose different seats.`,
        );
        return;
      }
      // Re-verify the production's ticket cap: even if the exact seats are free,
      // tickets sold elsewhere while this map was open may have hit capacity. The
      // checkout RPC enforces this too, but catching it here avoids a dead-end
      // mid-payment. taken.size is the live booked-ticket count for this showtime.
      if (capacity - taken.size < selectedSeats.length) {
        setConflictHint('This performance just sold out. Please pick another showtime.');
        return;
      }
      // Funnel: seats picked & verified, proceeding to checkout.
      track(AnalyticsEvent.SeatsConfirmed, {
        productionId: movieId,
        showtimeId,
        metadata: { seats: selectedSeats.length },
      });
      onNavigate('checkout', movieId ?? undefined, showtimeId, selectedSeats);
    } finally {
      setVerifying(false);
    }
  };

  const Navbar = <NavBar onNavigate={onNavigate} scrollY={scrollY} onHeightChange={setNavbarHeight} showBackButton />;

  if (loading) {
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
          <LoadError message={error ?? 'Showtime not found.'} onRetry={loadSeats} />
          <TouchableOpacity style={styles.browseBtn} onPress={handleBackToShow} activeOpacity={0.85}>
            <Text style={styles.browseBtnText}>Browse Shows</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const soldOut = (showtime.available_seats ?? 0) <= 0 || remainingUnderCap <= 0;

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
            <Image
              source={{ uri: movie.poster_url }}
              style={styles.posterThumb}
              resizeMode="cover"
              accessibilityLabel={`${movie?.title ?? 'Show'} poster`}
            />
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
                    accessibilityRole="button"
                    accessibilityLabel="Remove one ticket"
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{quantity}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, quantity >= maxQuantity && styles.qtyBtnDisabled]}
                    onPress={() => setQuantity(q => Math.min(maxQuantity, q + 1))}
                    disabled={quantity >= maxQuantity}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Add one ticket"
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyHint}>{Number.isFinite(remainingUnderCap) ? remainingUnderCap : showtime.available_seats} seats left</Text>
                </View>
              </View>

              {/* STEP 2 */}
              <View style={styles.stepCard}>
                <View style={styles.stepHeaderRow}>
                  <Text style={[styles.stepLabel, styles.stepLabelNoMargin]}>2. Choose your seats</Text>
                  <View style={styles.liveBadge}>
                    <View style={[
                      styles.liveDot,
                      liveStatus === 'live' && styles.liveDotOn,
                      liveStatus === 'offline' && styles.liveDotOff,
                    ]} />
                    <Text style={styles.liveBadgeText}>
                      {liveStatus === 'live' ? 'Live' : liveStatus === 'offline' ? 'Reconnecting…' : 'Connecting…'}
                    </Text>
                  </View>
                </View>

                {/* One horizontal scroller wraps BOTH the stage and the grid,
                    so 25-wide rows can pan on small screens instead of
                    squishing. Every row is the same width, so the whole thing
                    renders as a clean rectangle. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  onLayout={e => setScrollW(e.nativeEvent.layout.width)}
                  contentContainerStyle={styles.seatMapScrollBase}
                >
                  <View style={[styles.seatMap, { width: MAP_W }]}>
                    <View style={styles.stage}>
                      <Text style={styles.stageText}>MAIN STAGE</Text>
                      <Text style={styles.stageSub}>35' × 40' Proscenium</Text>
                    </View>

                    {theaterSeatGrid.map(rowData => (
                      <View key={rowData.rowId} style={styles.seatRow}>
                        <Text style={styles.rowLabel}>{rowData.rowId}</Text>
                        {rowData.seats.map(seat => {
                          const isBlocked = blockedSeats.has(seat.id) || heldSeats.has(seat.id);
                          const isTaken = takenSeats.has(seat.id) || isBlocked;
                          const isAccessible = seat.isAccessible || accessibleSeats.has(seat.id);
                          const isSelected = selectedSeats.includes(seat.id);
                          const zone = resolveZone(seat.id);
                          // Spell the seat's identity + live state out for screen
                          // readers (taken/held/unavailable are all disabled).
                          const stateWord = isSelected
                            ? 'selected'
                            : takenSeats.has(seat.id)
                            ? 'taken'
                            : heldSeats.has(seat.id)
                            ? 'on hold by another guest'
                            : blockedSeats.has(seat.id)
                            ? 'unavailable'
                            : 'available';
                          const zoneLabel = ZONE_META[zone].label;
                          const a11yLabel = seat.id.includes('WC')
                            ? `Wheelchair space, ${zoneLabel}, ${stateWord}`
                            : `Seat ${seat.seatNumber}, ${zoneLabel}${isAccessible ? ', wheelchair accessible' : ''}, ${stateWord}`;
                          return (
                            <SeatButton
                              key={seat.id}
                              seat={seat}
                              isSelected={isSelected}
                              isTaken={isTaken}
                              isBlocked={isBlocked}
                              isAccessible={isAccessible}
                              zoneColor={ZONE_META[zone].color}
                              zoneTextColor={ZONE_META[zone].textColor}
                              accessibilityLabel={a11yLabel}
                              onPress={handleToggle}
                            />
                          );
                        })}
                        <Text style={styles.rowLabel}>{rowData.rowId}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {mapOverflows && (
                  <Text style={styles.swipeHint}>Swipe to see more seats →</Text>
                )}

                <View style={styles.legendRow}>
                  {ZONE_ORDER.map(zone => (
                    <View key={zone} style={styles.legendItem}>
                      <View style={[styles.legendSwatch, { backgroundColor: ZONE_META[zone].color, borderColor: ZONE_META[zone].color }]} />
                      <Text style={styles.legendText}>{ZONE_META[zone].label}</Text>
                    </View>
                  ))}
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.swatchSelected]} />
                    <Text style={styles.legendText}>Selected</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.swatchTaken]} />
                    <Text style={styles.legendText}>Taken</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.swatchAda]}>
                      <Icon name="accessibility" size={9} color="#3b82f6" />
                    </View>
                    <Text style={styles.legendText}>Accessible</Text>
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
                  <Text style={styles.summaryLabel}>Show</Text>
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
                {/* Per-zone ticket breakdown (seats can span zones). Collapses to
                    a single line when the whole selection shares one zone. */}
                {zoneBreakdown.length === 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tickets</Text>
                    <Text style={styles.summaryValue}>—</Text>
                  </View>
                ) : (
                  zoneBreakdown.map(b => (
                    <View key={b.zone} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{b.count} × {ZONE_META[b.zone].label}</Text>
                      <Text style={styles.summaryValue}>${b.lineTotal.toFixed(2)}</Text>
                    </View>
                  ))
                )}

                <View style={styles.summaryDivider} />

                <View style={styles.summaryRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
                </View>

                {!!conflictHint && <Text style={styles.conflictHintText}>{conflictHint}</Text>}

                <TouchableOpacity
                  style={[styles.confirmBtn, (!canConfirm || verifying) && styles.confirmBtnDisabled]}
                  onPress={handleConfirm}
                  disabled={!canConfirm || verifying}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmBtnText}>
                    {verifying
                      ? 'Checking availability…'
                      : `Continue to checkout (${selectedSeats.length}/${quantity})`}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.noPaymentNote}>You'll enter payment details on the next step.</Text>
              </View>
            </View>
          </View>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = createStyles({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingIndicator: { marginVertical: 40 },

  centerState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyText: { ...typography.body, color: '#888', textAlign: 'center', marginBottom: 20 },
  browseBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── HEADER ──
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

  // ── LAYOUT ──
  contentRow: { ...layout.flow, flexDirection: 'row', gap: 24, paddingHorizontal: 60, paddingBottom: 40, alignItems: 'flex-start' },
  contentRowMobile: { flexDirection: 'column', paddingHorizontal: 20, gap: 16 },
  mainCol: { flex: 1, minWidth: 0, gap: 16 },
  summaryCol: { width: 320 },

  // ── STEP CARDS ──
  stepCard: { backgroundColor: '#161616', borderRadius: 12, borderWidth: 1, borderColor: '#262626', padding: 20 },
  stepLabel: { ...typography.body, color: '#fff', fontWeight: '800', marginBottom: 16 },
  stepLabelNoMargin: { marginBottom: 0 },

  // Live-status badge on the seat map — reassures buyers the map is updating in
  // real time, and flags a dropped socket while supabase-js reconnects.
  stepHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#666' },
  liveDotOn: { backgroundColor: '#22c55e' },
  liveDotOff: { backgroundColor: '#d97706' },
  liveBadgeText: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

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
  // Stage sits at the FRONT (top) of the house, above row A.
  stage: {
    alignSelf: 'center', backgroundColor: '#1a1a1a', borderRadius: 6,
    borderWidth: 1, borderColor: '#2e2e2e',
    paddingVertical: 10, paddingHorizontal: 90, marginBottom: 28, alignItems: 'center',
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
  },
  stageText: { color: '#ccc', fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  stageSub: { color: '#666', fontSize: 10, fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  // Safe ONLY because seatMap carries an explicit width (MAP_W): with a
  // fixed-width child, justifyContent centers the map when the scroller is
  // wider than the map and simply has no free space to distribute when it
  // isn't (so the map stays left-anchored and pans). Against an auto-width
  // child the same pair would size the map to the viewport and kill the
  // overflow. The horizontal padding lives HERE rather than on seatMap so it
  // can't eat into MAP_W — react-native-web Views are border-box.
  seatMapScrollBase: { paddingHorizontal: 8, paddingBottom: 8, flexGrow: 1, justifyContent: 'center' },
  // alignItems centers each shorter row within the fixed MAP_W track — that's
  // what draws the trapezoid and keeps Row P's wheelchair spaces at the ends.
  seatMap: { alignItems: 'center' },
  swipeHint: { color: '#666', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 2, marginBottom: 6 },
  // Strict single-line rows — NO flexWrap, so 25 seats stay on one line and
  // pan horizontally instead of wrapping. Row letters bookend each side.
  seatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  rowLabel: { width: 16, color: '#666', fontSize: 11, fontWeight: '700', textAlign: 'center', marginHorizontal: 4 },
  seat: {
    // Fixed size + flexShrink:0 is what keeps 500 seats from collapsing/
    // overlapping under flex pressure. margin spaces them without `gap`.
    width: 28, height: 28, borderRadius: 6, margin: 2, flexShrink: 0,
    borderWidth: 1, borderColor: '#333', backgroundColor: '#1c1c1c',
    alignItems: 'center', justifyContent: 'center',
  },
  // ADA / wheelchair-accessible seats get a distinct blue border.
  seatAda: { borderColor: '#3b82f6', borderWidth: 2 },
  seatSelected: { backgroundColor: '#C8102E', borderColor: '#C8102E' },
  seatTaken: { backgroundColor: '#0a0a0a', borderColor: '#1a1a1a', opacity: 0.5 },
  seatBlocked: { backgroundColor: '#1c1206', borderColor: '#3a2a10', opacity: 0.6 },
  seatText: { color: '#888', fontSize: 10, fontWeight: '700' },
  seatTextSelected: { color: '#fff' },
  seatTextTaken: { color: '#444' },

  legendRow: { flexDirection: 'row', gap: 20, marginTop: 20, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
  swatchAvailable: { backgroundColor: '#1c1c1c', borderColor: '#333' },
  swatchSelected: { backgroundColor: '#C8102E', borderColor: '#C8102E' },
  swatchTaken: { backgroundColor: '#0a0a0a', borderColor: '#1a1a1a', opacity: 0.6 },
  swatchAda: { backgroundColor: '#1c1c1c', borderColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' },
  legendText: { color: '#888', fontSize: 12 },

  limitHintText: { color: '#d97706', fontSize: 12, marginTop: 14, lineHeight: 17 },
  conflictHintText: { color: '#f87171', fontSize: 12, marginTop: 14, lineHeight: 17, fontWeight: '600' },

  // ── ORDER SUMMARY ──
  summaryCard: {
    backgroundColor: '#161616', borderRadius: 12, borderWidth: 1, borderColor: '#262626',
    padding: 20,
  },
  summaryTitle: { ...typography.body, fontSize: 15, color: '#fff', fontWeight: '800', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  summaryLabel: { ...typography.caption, color: '#777', flexShrink: 0 },
  summaryValue: { ...typography.caption, color: '#e6e6e6', fontWeight: '600', flex: 1, textAlign: 'right' },
  summaryDivider: { height: 1, backgroundColor: '#262626', marginVertical: 8 },
  totalLabel: { ...typography.body, fontSize: 15, color: '#fff', fontWeight: '800' },
  totalValue: { color: '#C8102E', fontSize: 20, fontWeight: '800' },

  confirmBtn: { backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  confirmBtnDisabled: { backgroundColor: '#5a2230', opacity: 0.7 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  noPaymentNote: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 10 },
});

export default SeatSelectionScreen;
