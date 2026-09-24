import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { VENUE_TIMEZONE, shortRef } from '../../../config/venue';
import { useAppModal } from '../../../components/ModalProvider';
import { createStyles } from '../../../theme';
import { seatZoneById, ZONE_ORDER, ZONE_META, type Zone } from '../../../config/theaterLayout';
import { B } from '../shared/brand';
import { s, um } from '../shared/adminStyles';
import { formatMoney } from '../shared/format';
import { WebSelect } from '../components/WebInputs';
import { PageHeader, LoadingState, EmptyState } from '../components/Feedback';
import { SeatGrid, SeatLegend, SEAT_TONE_STYLE, type AdminShowtime, type VenueSeat, type SeatTone, type SeatOverlay } from '../components/SeatGrid';
import { TicketScanner } from '../components/TicketScanner';

// ── check_in_ticket RPC result ──
// Per-seat scans return 'ok' / 'already_checked_in' / 'not_paid' with the ONE
// seat in `ticket`; a booking-level input (legacy booking-id QR or a typed MT-
// reference) returns 'booking' with every seat's state and stamps nothing, so
// staff admit seats one at a time from the list.
type SeatTicket = { token: string; seat: string; zone: Zone | null; checked_in_at: string | null };
type VerifyResult = {
  result: 'ok' | 'already_checked_in' | 'not_paid' | 'booking' | 'not_found';
  ticket?: SeatTicket;
  booking?: {
    id: string;
    movie_title: string | null;
    show_start_time: string | null;
    num_tickets: number;
    payment_status: string;
    checked_in_count: number;
    tickets: SeatTicket[];
  };
};

const seatLabel = (t: SeatTicket) => `${t.seat}${t.zone && ZONE_META[t.zone] ? ` · ${ZONE_META[t.zone].label}` : ''}`;

const fmtShowtime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE, timeZoneName: 'short',
  });
};

const fmtCheckedInAt = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE,
  });
};

// `canSell` (PERMISSIONS[role].walkUpSales) adds walk-up selling below the
// check-in card. Without it the panel is check-in only: no showtimes, prices,
// seat map or cart are loaded or shown.
export const BoxOfficePanel = ({ canSell }: { canSell: boolean }) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  const [showtimes, setShowtimes] = useState<AdminShowtime[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedShowtimeId, setSelectedShowtimeId] = useState('');
  const [venueSeats, setVenueSeats] = useState<VenueSeat[]>([]);
  const [seatStatus, setSeatStatus] = useState<Map<string, 'booked' | 'blocked'>>(new Map());
  const [cart, setCart] = useState<Set<string>>(new Set());
  const [zonePrices, setZonePrices] = useState<Map<Zone, number>>(new Map());
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [verifyInput, setVerifyInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [scanning, setScanning] = useState(false);

  // Scan / verify / check in. The input is whatever was scanned or typed: a
  // per-seat ticket URL (…/ticket/<token>), a bare token, a legacy booking-id
  // URL, or an MT- reference. The RPC resolves it and — for a seat token —
  // stamps that ONE seat idempotently (a re-scan reads back as already used).
  const verifyTicket = async (raw?: string) => {
    const input = (raw ?? verifyInput).trim();
    if (!input || verifying) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('check_in_ticket', { p_input: input });
      if (rpcError) throw rpcError;
      setVerifyResult(data as VerifyResult);
    } catch (err: any) {
      logger.error('Ticket verify failed:', err);
      showModal({ title: 'Verify failed', message: err.message ?? 'Could not verify this ticket.', variant: 'error' });
    } finally {
      setVerifying(false);
    }
  };

  // From a booking-level result: admit one specific seat (or each remaining seat
  // in turn). Each call is its own idempotent check_in_ticket; the list then
  // re-renders from the RPC's refreshed booking summary.
  const checkInSeat = async (token: string) => {
    if (verifying) return;
    setVerifying(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('check_in_ticket', { p_input: token });
      if (rpcError) throw rpcError;
      const res = data as VerifyResult;
      // Stay in the booking view (with the updated per-seat states) rather than
      // collapsing to a single-seat card, so staff can keep admitting the party.
      setVerifyResult(res.booking ? { result: 'booking', booking: res.booking } : res);
    } catch (err: any) {
      logger.error('Seat check-in failed:', err);
      showModal({ title: 'Check-in failed', message: err.message ?? 'Could not check in this seat.', variant: 'error' });
    } finally {
      setVerifying(false);
    }
  };

  const checkInAllRemaining = async (tickets: SeatTicket[]) => {
    for (const t of tickets.filter(x => !x.checked_in_at)) {
      // Sequential on purpose: each stamp is its own RPC + state refresh.
      await checkInSeat(t.token);
    }
  };

  const loadShowtimes = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('showtimes')
        .select('id, production_id, start_time, price, available_seats, productions(title)')
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });
      if (fetchError) throw fetchError;
      setShowtimes((data as any) ?? []);
      setError(null);
    } catch (err: any) {
      logger.error('Failed to load showtimes:', err);
      setError(err.message ?? 'Failed to load showtimes.');
    }
  };
  useEffect(() => { if (canSell) loadShowtimes(); }, [canSell]);

  const selectedShowtime = (showtimes ?? []).find(sh => sh.id === selectedShowtimeId) ?? null;

  const loadSeatsFor = async (showtimeId: string) => {
    setLoadingSeats(true);
    try {
      const [venueRes, seatRes, priceRes] = await Promise.all([
        supabase.from('venue_seats').select('seat_identifier, row_label, col_number, is_accessible, status, zone').order('row_label', { ascending: true }).order('col_number', { ascending: true }),
        supabase.from('booking_seats').select('seat_number, status').eq('showtime_id', showtimeId),
        supabase.from('showtime_seat_prices').select('zone, price').eq('showtime_id', showtimeId),
      ]);
      if (venueRes.error) throw venueRes.error;
      if (seatRes.error) throw seatRes.error;
      if (priceRes.error) throw priceRes.error;
      setVenueSeats((venueRes.data as any) ?? []);
      const map = new Map<string, 'booked' | 'blocked'>();
      (seatRes.data ?? []).forEach((r: any) => map.set(r.seat_number as string, (r.status as 'booked' | 'blocked') ?? 'booked'));
      setSeatStatus(map);
      const zm = new Map<Zone, number>();
      (priceRes.data ?? []).forEach((r: any) => zm.set(r.zone as Zone, Number(r.price)));
      setZonePrices(zm);
      setCart(new Set());
    } catch (err: any) {
      logger.error('Failed to load seats:', err);
      showModal({ title: 'Failed to load seats', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setLoadingSeats(false);
    }
  };

  const onSelectShowtime = (id: string) => {
    setSelectedShowtimeId(id);
    setVenueSeats([]);
    setSeatStatus(new Map());
    setCart(new Set());
    if (id) loadSeatsFor(id);
  };

  const onPaint = (id: string, next: boolean) => {
    setCart(prev => {
      const n = new Set(prev);
      if (next) n.add(id); else n.delete(id);
      return n;
    });
  };

  const overlay = new Map<string, SeatOverlay>();
  for (const v of venueSeats) {
    const perShow = seatStatus.get(v.seat_identifier);
    overlay.set(v.seat_identifier, {
      tone: (perShow ?? v.status) as SeatTone,
      selectable: !perShow && v.status === 'available',
      isAccessible: v.is_accessible,
    });
  }

  const price = selectedShowtime ? Number(selectedShowtime.price) : 0;
  const cartArr = Array.from(cart).sort();
  const priceForZone = (z: Zone): number => zonePrices.get(z) ?? price;
  const cartZones = cartArr.map(id => seatZoneById.get(id) ?? 'general');
  const total = cartZones.reduce((sum, z) => sum + priceForZone(z), 0);
  const zoneBreakdown = ZONE_ORDER
    .map(zone => {
      const count = cartZones.filter(z => z === zone).length;
      const p = priceForZone(zone);
      return { zone, count, price: p, lineTotal: count * p };
    })
    .filter(b => b.count > 0);

  const checkout = async (method: 'cash' | 'card') => {
    if (!selectedShowtimeId || cart.size === 0 || processing) return;
    setProcessing(true);
    try {
      const { error: rpcError } = await supabase.rpc('create_box_office_booking', {
        p_showtime_id: selectedShowtimeId,
        p_seats: cartArr,
        p_payment_method: method,
      });
      if (rpcError) throw rpcError;
      showModal({
        title: 'Sale complete',
        message: `${cart.size} seat${cart.size > 1 ? 's' : ''} (${cartArr.join(', ')}) sold for ${formatMoney(total)} — paid by ${method}.`,
        variant: 'success',
      });
      await Promise.all([loadSeatsFor(selectedShowtimeId), loadShowtimes()]);
    } catch (err: any) {
      logger.error('Box office sale failed:', err);
      showModal({ title: 'Sale failed', message: err.message ?? 'Something went wrong.', variant: 'error' });
      await loadSeatsFor(selectedShowtimeId);
    } finally {
      setProcessing(false);
    }
  };

  const showtimeOptions = (showtimes ?? []).map(sh => {
    const d = new Date(sh.start_time);
    const label = `${sh.productions?.title ?? 'Untitled'} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${formatMoney(Number(sh.price))}`;
    return { value: sh.id, label };
  });

  return (
    <>
      <PageHeader
        title="Box Office"
        subtitle={canSell
          ? 'Sell walk-up tickets at the flat door price — no customer account required.'
          : 'Scan or look up a guest’s ticket to check them in at the door.'}
      />

      {/* ── VERIFY TICKET (QR scan / reference entry) ── */}
      <View style={s.card}>
        <Text style={bo.fieldLabel}>Verify ticket</Text>
        <Text style={bo.verifyHint}>
          Scan a seat&apos;s QR to check that seat in (each seat has its own ticket). A booking reference or the
          &quot;all tickets&quot; link shows every seat so you can admit the party one by one.
        </Text>
        <View style={[bo.verifyRow, !isDesktop && bo.verifyRowMob]}>
          <TextInput
            style={bo.verifyInput}
            value={verifyInput}
            onChangeText={(t) => { setVerifyInput(t); if (verifyResult) setVerifyResult(null); }}
            placeholder="MT-XXXXXXXX or ticket link"
            placeholderTextColor={B.txtMu}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={() => verifyTicket()}
          />
          <TouchableOpacity
            style={[bo.verifyBtn, (verifying || !verifyInput.trim()) && bo.payBtnDisabled]}
            disabled={verifying || !verifyInput.trim()}
            onPress={() => verifyTicket()}
            activeOpacity={0.85}
          >
            <Icon name="checkmark-circle-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={bo.payBtnText}>{verifying ? 'Checking…' : 'Verify & check in'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[bo.scanBtn, scanning && bo.payBtnDisabled]}
            disabled={scanning}
            onPress={() => { setVerifyResult(null); setScanning(true); }}
            activeOpacity={0.85}
          >
            <Icon name="qr-code-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={bo.payBtnText}>Scan QR</Text>
          </TouchableOpacity>
        </View>

        {scanning && (
          <TicketScanner
            onDetected={(text) => { setScanning(false); setVerifyInput(text); verifyTicket(text); }}
            onClose={() => setScanning(false)}
          />
        )}

        {verifyResult && (() => {
          const r = verifyResult;
          const bk = r.booking;
          const progress = bk && bk.tickets.length > 1
            ? `${bk.checked_in_count} of ${bk.tickets.length} seats checked in`
            : null;

          if (r.result === 'ok' && r.ticket) {
            return (
              <View style={[bo.result, bo.resultOk]}>
                <Text style={bo.resultTitleOk}>✓ Checked in — Seat {seatLabel(r.ticket)}</Text>
                <Text style={bo.resultLine}>
                  {bk?.movie_title ?? 'Show'}{bk ? ` · ${shortRef(bk.id)}` : ''}
                </Text>
                <Text style={bo.resultLine}>{fmtShowtime(bk?.show_start_time)}</Text>
                <Text style={bo.resultOkNote}>Admit this guest.{progress ? ` ${progress}.` : ''}</Text>
              </View>
            );
          }

          if (r.result === 'already_checked_in' && r.ticket) {
            return (
              <View style={[bo.result, bo.resultWarnBox]}>
                <Text style={bo.resultTitleWarn}>⚠ Already checked in — Seat {seatLabel(r.ticket)}</Text>
                <Text style={bo.resultLine}>
                  {bk?.movie_title ?? 'Show'}{bk ? ` · ${shortRef(bk.id)}` : ''}
                </Text>
                <Text style={bo.resultWarn}>
                  This seat was scanned in{fmtCheckedInAt(r.ticket.checked_in_at) ? ` at ${fmtCheckedInAt(r.ticket.checked_in_at)}` : ' already'}. Do not admit a second guest on it.
                </Text>
                {progress && <Text style={bo.resultLine}>{progress}</Text>}
              </View>
            );
          }

          if (r.result === 'booking' && bk) {
            const remaining = bk.tickets.filter(t => !t.checked_in_at);
            return (
              <View style={[bo.result, bo.resultNeutral]}>
                <Text style={bo.resultTitleNeutral}>Booking {shortRef(bk.id)} · {bk.movie_title ?? 'Show'}</Text>
                <Text style={bo.resultLine}>{fmtShowtime(bk.show_start_time)}</Text>
                <Text style={bo.resultLine}>{progress ?? (bk.checked_in_count ? 'Checked in' : 'Not checked in yet')}</Text>
                <View style={bo.seatList}>
                  {bk.tickets.map(t => (
                    <View key={t.token} style={bo.seatRow}>
                      <Text style={bo.seatRowLabel}>{seatLabel(t)}</Text>
                      {t.checked_in_at ? (
                        <Text style={bo.seatRowDone}>✓ {fmtCheckedInAt(t.checked_in_at) || 'Checked in'}</Text>
                      ) : (
                        <TouchableOpacity
                          style={[bo.seatCheckBtn, verifying && bo.payBtnDisabled]}
                          disabled={verifying}
                          onPress={() => checkInSeat(t.token)}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={`Check in seat ${t.seat}`}
                        >
                          <Text style={bo.seatCheckBtnText}>Check in</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
                {remaining.length > 1 && (
                  <TouchableOpacity
                    style={[bo.verifyBtn, bo.checkAllBtn, verifying && bo.payBtnDisabled]}
                    disabled={verifying}
                    onPress={() => checkInAllRemaining(bk.tickets)}
                    activeOpacity={0.85}
                  >
                    <Text style={bo.payBtnText}>Check in all {remaining.length} remaining</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }

          return (
            <View style={[bo.result, bo.resultBad]}>
              <Text style={bo.resultTitleBad}>
                ✗ {r.result === 'not_paid' ? 'Not paid — do not admit' : 'No ticket found'}
              </Text>
              <Text style={bo.resultLine}>
                {r.result === 'not_paid'
                  ? `This booking exists but is not paid.${bk ? ` (${shortRef(bk.id)})` : ''}`
                  : 'Check the reference or QR link and try again.'}
              </Text>
            </View>
          );
        })()}
      </View>

      {!canSell ? null : error ? (
        <Text style={[um.empty, { color: B.red }]}>{error}</Text>
      ) : (
        <>
          <View style={s.card}>
            <Text style={bo.fieldLabel}>Showtime</Text>
            <View style={bo.selectWrap}>
              <WebSelect
                value={selectedShowtimeId}
                onChange={onSelectShowtime}
                options={showtimeOptions}
                placeholder={showtimes === null ? 'Loading showtimes…' : 'Select an upcoming showtime'}
              />
            </View>
          </View>

          {!selectedShowtimeId ? (
            <EmptyState icon="cart-outline" title="No showtime selected" subtitle="Pick an upcoming showtime above to open its seat map." />
          ) : loadingSeats ? (
            <LoadingState label="Loading seats…" />
          ) : (
            <View style={[bo.row, !isDesktop && bo.rowMob]}>
              <View style={[s.card, bo.mapCol]}>
                <SeatGrid overlay={overlay} selected={cart} onPaint={onPaint} />
                <SeatLegend
                  items={[
                    ...ZONE_ORDER.map(z => ({ color: ZONE_META[z].color, border: ZONE_META[z].color, label: ZONE_META[z].label })),
                    { color: SEAT_TONE_STYLE.selected.bg,  border: SEAT_TONE_STYLE.selected.border,  label: 'Selected' },
                    { color: SEAT_TONE_STYLE.booked.bg,    border: SEAT_TONE_STYLE.booked.border,    label: 'Booked' },
                    { color: SEAT_TONE_STYLE.blocked.bg,   border: SEAT_TONE_STYLE.blocked.border,   label: 'Blocked' },
                    { color: SEAT_TONE_STYLE.broken.bg,    border: SEAT_TONE_STYLE.broken.border,    label: 'Broken' },
                    { color: B.white, border: B.txt2, label: 'Accessible', icon: true },
                  ]}
                />
              </View>

              <View style={[s.card, bo.cartCol, !isDesktop && bo.cartColMob]}>
                <Text style={bo.cartTitle}>Cart</Text>
                <View style={bo.summaryRow}>
                  <Text style={bo.summaryLabel}>Seats</Text>
                  <Text style={bo.summaryValue}>{cart.size ? cartArr.join(', ') : '—'}</Text>
                </View>
                {/* Per-zone breakdown (collapses to one line when a single zone). */}
                {zoneBreakdown.length === 0 ? (
                  <View style={bo.summaryRow}>
                    <Text style={bo.summaryLabel}>Tickets</Text>
                    <Text style={bo.summaryValue}>0</Text>
                  </View>
                ) : (
                  zoneBreakdown.map(b => (
                    <View key={b.zone} style={bo.summaryRow}>
                      <Text style={bo.summaryLabel}>{b.count} × {ZONE_META[b.zone].label}</Text>
                      <Text style={bo.summaryValue}>{formatMoney(b.lineTotal)}</Text>
                    </View>
                  ))
                )}
                <View style={bo.divider} />
                <View style={bo.summaryRow}>
                  <Text style={bo.totalLabel}>Total</Text>
                  <Text style={bo.totalValue}>{formatMoney(total)}</Text>
                </View>

                <TouchableOpacity
                  style={[bo.payBtn, bo.payCash, (cart.size === 0 || processing) && bo.payBtnDisabled]}
                  disabled={cart.size === 0 || processing}
                  onPress={() => checkout('cash')}
                  activeOpacity={0.85}
                >
                  <Icon name="cash-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={bo.payBtnText}>{processing ? 'Processing…' : 'Process Cash'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[bo.payBtn, bo.payCard, (cart.size === 0 || processing) && bo.payBtnDisabled]}
                  disabled={cart.size === 0 || processing}
                  onPress={() => checkout('card')}
                  activeOpacity={0.85}
                >
                  <Icon name="card-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={bo.payBtnText}>{processing ? 'Processing…' : 'Process External Card'}</Text>
                </TouchableOpacity>
                <Text style={bo.posNote}>Card is charged on your external terminal — no online gateway is used.</Text>
              </View>
            </View>
          )}
        </>
      )}
    </>
  );
};

export const bo = createStyles({
  fieldLabel: { color: B.txt2, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  selectWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: B.bg,
    borderWidth: 1, borderColor: B.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, maxWidth: 460,
  },
  row: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  rowMob: { flexDirection: 'column' },
  mapCol: { flex: 1, minWidth: 0 },
  cartCol: { width: 320 },
  cartColMob: { width: '100%' },
  cartTitle: { fontSize: 15, fontWeight: '800', color: B.txt, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  summaryLabel: { color: B.txt2, fontSize: 12, flexShrink: 0 },
  summaryValue: { color: B.txt, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: B.border, marginVertical: 8 },
  totalLabel: { color: B.txt, fontSize: 15, fontWeight: '800' },
  totalValue: { color: B.red, fontSize: 20, fontWeight: '800' },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 13, marginTop: 12 },
  payCash: { backgroundColor: B.green },
  payCard: { backgroundColor: B.navy },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  posNote: { color: B.txtMu, fontSize: 11, textAlign: 'center', marginTop: 12 },

  // ── Verify ticket ──
  verifyHint: { color: B.txtMu, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  verifyRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  verifyRowMob: { flexDirection: 'column' },
  verifyInput: {
    flex: 1, backgroundColor: B.bg, borderWidth: 1, borderColor: B.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, color: B.txt, fontSize: 14,
  },
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: B.navy, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 18,
  },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: B.red, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 18,
  },
  result: { marginTop: 14, borderRadius: 10, borderWidth: 1, padding: 14 },
  resultOk: { backgroundColor: 'rgba(22,163,74,0.08)', borderColor: 'rgba(22,163,74,0.4)' },
  resultBad: { backgroundColor: 'rgba(200,16,46,0.08)', borderColor: 'rgba(200,16,46,0.4)' },
  resultTitleOk: { color: B.green, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  resultTitleBad: { color: B.red, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  resultLine: { color: B.txt, fontSize: 13, marginBottom: 3 },
  resultWarn: { color: '#d97706', fontSize: 13, fontWeight: '700', marginTop: 6 },
  resultOkNote: { color: B.green, fontSize: 13, fontWeight: '700', marginTop: 6 },
  resultWarnBox: { backgroundColor: 'rgba(217,119,6,0.08)', borderColor: 'rgba(217,119,6,0.45)' },
  resultTitleWarn: { color: '#d97706', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  resultNeutral: { backgroundColor: B.bg, borderColor: B.border },
  resultTitleNeutral: { color: B.txt, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  // Per-seat rows inside a booking-level result.
  seatList: { marginTop: 10, gap: 6 },
  seatRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    backgroundColor: B.white, borderRadius: 8, borderWidth: 1, borderColor: B.border,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  seatRowLabel: { color: B.txt, fontSize: 13, fontWeight: '700' },
  seatRowDone: { color: B.green, fontSize: 12, fontWeight: '700' },
  seatCheckBtn: { backgroundColor: B.navy, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  seatCheckBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkAllBtn: { marginTop: 12, alignSelf: 'flex-start' },
});
