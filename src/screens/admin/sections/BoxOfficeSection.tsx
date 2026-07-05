import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { VENUE_TIMEZONE } from '../../../config/venue';
import { useAppModal } from '../../../components/ModalProvider';
import { createStyles } from '../../../theme';
import { B } from '../shared/brand';
import { s, um } from '../shared/adminStyles';
import { formatMoney } from '../shared/format';
import { WebSelect } from '../components/WebInputs';
import { PageHeader, LoadingState, EmptyState } from '../components/Feedback';
import { SeatGrid, SeatLegend, SEAT_TONE_STYLE, type AdminShowtime, type VenueSeat, type SeatTone, type SeatCell } from '../components/SeatGrid';

type VerifyResult = {
  valid: boolean;
  reason?: 'not_found' | 'not_paid';
  id?: string;
  movie_title?: string | null;
  show_start_time?: string | null;
  num_tickets?: number;
  seats?: string[];
  already_checked_in?: boolean;
  checked_in_at?: string | null;
};

// Showtime in the venue's timezone (see config/venue), never the staffer's.
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

export const BoxOfficePanel = () => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  const [showtimes, setShowtimes] = useState<AdminShowtime[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedShowtimeId, setSelectedShowtimeId] = useState('');
  const [venueSeats, setVenueSeats] = useState<VenueSeat[]>([]);
  // seat_identifier → its status for this showtime: 'booked' = sold,
  // 'blocked' = an admin hold. Both make a seat unsellable at the box office.
  const [seatStatus, setSeatStatus] = useState<Map<string, 'booked' | 'blocked'>>(new Map());
  const [cart, setCart] = useState<Set<string>>(new Set());
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [processing, setProcessing] = useState(false);

  // ── Ticket verify / check-in (QR scan target) ──
  const [verifyInput, setVerifyInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const verifyTicket = async () => {
    const input = verifyInput.trim();
    if (!input || verifying) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      // p_input accepts a scanned ticket URL, a bare booking id, or a typed
      // MT- reference. verify_ticket stamps checked_in_at once (admin-only RPC).
      const { data, error: rpcError } = await supabase.rpc('verify_ticket', { p_input: input });
      if (rpcError) throw rpcError;
      setVerifyResult(data as VerifyResult);
    } catch (err: any) {
      logger.error('Ticket verify failed:', err);
      showModal({ title: 'Verify failed', message: err.message ?? 'Could not verify this ticket.', variant: 'error' });
    } finally {
      setVerifying(false);
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
  useEffect(() => { loadShowtimes(); }, []);

  const selectedShowtime = (showtimes ?? []).find(sh => sh.id === selectedShowtimeId) ?? null;

  const loadSeatsFor = async (showtimeId: string) => {
    setLoadingSeats(true);
    try {
      const [venueRes, seatRes] = await Promise.all([
        supabase.from('venue_seats').select('seat_identifier, row_label, col_number, is_accessible, status').order('row_label', { ascending: true }).order('col_number', { ascending: true }),
        supabase.from('booking_seats').select('seat_number, status').eq('showtime_id', showtimeId),
      ]);
      if (venueRes.error) throw venueRes.error;
      if (seatRes.error) throw seatRes.error;
      setVenueSeats((venueRes.data as any) ?? []);
      const map = new Map<string, 'booked' | 'blocked'>();
      (seatRes.data ?? []).forEach((r: any) => map.set(r.seat_number as string, (r.status as 'booked' | 'blocked') ?? 'booked'));
      setSeatStatus(map);
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

  const cells: SeatCell[] = venueSeats.map(v => {
    const perShow = seatStatus.get(v.seat_identifier);            
    const tone: SeatTone = perShow ?? v.status;                    
    return {
      identifier: v.seat_identifier,
      rowLabel: v.row_label,
      colNumber: v.col_number,
      isAccessible: v.is_accessible,
      tone,
      selected: cart.has(v.seat_identifier),
      selectable: !perShow && v.status === 'available',            
    };
  });

  const price = selectedShowtime ? Number(selectedShowtime.price) : 0;
  const cartArr = Array.from(cart).sort();
  const total = price * cart.size;

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
        subtitle="Sell walk-up tickets at the flat door price — no customer account required."
      />

      {/* ── VERIFY TICKET (QR scan / reference entry) ── */}
      <View style={s.card}>
        <Text style={bo.fieldLabel}>Verify ticket</Text>
        <Text style={bo.verifyHint}>
          Scan the guest&apos;s QR (paste the link) or type their MT- reference, then verify to check them in.
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
            onSubmitEditing={verifyTicket}
          />
          <TouchableOpacity
            style={[bo.verifyBtn, (verifying || !verifyInput.trim()) && bo.payBtnDisabled]}
            disabled={verifying || !verifyInput.trim()}
            onPress={verifyTicket}
            activeOpacity={0.85}
          >
            <Icon name="qr-code-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={bo.payBtnText}>{verifying ? 'Checking…' : 'Verify & check in'}</Text>
          </TouchableOpacity>
        </View>

        {verifyResult && (verifyResult.valid ? (
          <View style={[bo.result, bo.resultOk]}>
            <Text style={bo.resultTitleOk}>✓ Valid ticket</Text>
            <Text style={bo.resultLine}>
              {verifyResult.movie_title ?? 'Show'}
              {verifyResult.seats?.length ? ` · Seats ${verifyResult.seats.join(', ')}` : ''}
            </Text>
            <Text style={bo.resultLine}>{fmtShowtime(verifyResult.show_start_time)}</Text>
            {verifyResult.already_checked_in ? (
              <Text style={bo.resultWarn}>
                ⚠ Already checked in{fmtCheckedInAt(verifyResult.checked_in_at) ? ` at ${fmtCheckedInAt(verifyResult.checked_in_at)}` : ''}
              </Text>
            ) : (
              <Text style={bo.resultOkNote}>Checked in just now — admit the guest.</Text>
            )}
          </View>
        ) : (
          <View style={[bo.result, bo.resultBad]}>
            <Text style={bo.resultTitleBad}>
              ✗ {verifyResult.reason === 'not_paid' ? 'Not paid — do not admit' : 'No ticket found'}
            </Text>
            <Text style={bo.resultLine}>
              {verifyResult.reason === 'not_paid'
                ? 'This booking exists but is not paid.'
                : 'Check the reference or QR link and try again.'}
            </Text>
          </View>
        ))}
      </View>

      {error ? (
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
                <SeatGrid seats={cells} onPaint={onPaint} />
                <SeatLegend
                  items={[
                    { color: SEAT_TONE_STYLE.available.bg, border: SEAT_TONE_STYLE.available.border, label: 'Available' },
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
                <View style={bo.summaryRow}>
                  <Text style={bo.summaryLabel}>Price each</Text>
                  <Text style={bo.summaryValue}>{formatMoney(price)}</Text>
                </View>
                <View style={bo.summaryRow}>
                  <Text style={bo.summaryLabel}>Tickets</Text>
                  <Text style={bo.summaryValue}>{cart.size}</Text>
                </View>
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
  result: { marginTop: 14, borderRadius: 10, borderWidth: 1, padding: 14 },
  resultOk: { backgroundColor: 'rgba(22,163,74,0.08)', borderColor: 'rgba(22,163,74,0.4)' },
  resultBad: { backgroundColor: 'rgba(200,16,46,0.08)', borderColor: 'rgba(200,16,46,0.4)' },
  resultTitleOk: { color: B.green, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  resultTitleBad: { color: B.red, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  resultLine: { color: B.txt, fontSize: 13, marginBottom: 3 },
  resultWarn: { color: '#d97706', fontSize: 13, fontWeight: '700', marginTop: 6 },
  resultOkNote: { color: B.green, fontSize: 13, fontWeight: '700', marginTop: 6 },
});
