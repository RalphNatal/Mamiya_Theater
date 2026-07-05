import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { useAppModal } from '../../../components/ModalProvider';
import { createStyles } from '../../../theme';
import { B } from '../shared/brand';
import { s, um } from '../shared/adminStyles';
import { WebSelect } from '../components/WebInputs';
import { PageHeader, LoadingState, EmptyState } from '../components/Feedback';
import { SeatGrid, SeatLegend, SEAT_TONE_STYLE, type AdminShowtime, type VenueSeat, type SeatTone, type SeatCell } from '../components/SeatGrid';
// SeatManagementPanel borrows two form styles (fieldLabel, selectWrap) from the
// Box Office panel — a coupling that existed in the original single-file version.
import { bo } from './BoxOfficeSection';
// ── SEAT MAP MANAGER (per-showtime holds) ──────────────
// The auditorium LAYOUT and its physical facts (wheelchair access, a seat
// that's permanently broken) are venue-wide and live in venue_seats. BLOCKING
// a seat, though, is per PERFORMANCE — held for one night only — so holds live
// in booking_seats keyed by the selected showtime. The admin must pick a
// showtime before the grid appears; edits then touch only that performance.
export const SeatManagementPanel = () => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 760;
  const [showtimes, setShowtimes] = useState<AdminShowtime[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cascading selection: production first, then a date & time within it.
  const [selectedProductionId, setSelectedProductionId] = useState('');
  const [selectedShowtimeId, setSelectedShowtimeId] = useState('');
  const [venueSeats, setVenueSeats] = useState<VenueSeat[]>([]);
  // seat_identifier → its status for THIS showtime: 'booked' = a real sale,
  // 'blocked' = an admin hold. Absent = available for this performance.
  const [seatStatus, setSeatStatus] = useState<Map<string, 'booked' | 'blocked'>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // The grid is the venue master OVERLAID with this showtime's holds/sales.
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
      setSelected(new Set());
    } catch (err: any) {
      logger.error('Failed to load seats:', err);
      showModal({ title: 'Failed to load seats', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setLoadingSeats(false);
    }
  };

  const clearSeatData = () => {
    setVenueSeats([]);
    setSeatStatus(new Map());
    setSelected(new Set());
  };

  // Dropdown 1 → unique productions that have an upcoming showtime.
  const productionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    (showtimes ?? []).forEach(sh => {
      if (!seen.has(sh.production_id)) seen.set(sh.production_id, sh.productions?.title ?? 'Untitled');
    });
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [showtimes]);

  // Dropdown 2 → only this production's showtimes (already start_time-ascending
  // from the query). Empty until a production is picked, which disables it.
  const showtimeOptions = useMemo(() => {
    if (!selectedProductionId) return [];
    return (showtimes ?? [])
      .filter(sh => sh.production_id === selectedProductionId)
      .map(sh => {
        const d = new Date(sh.start_time);
        return {
          value: sh.id,
          label: `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} @ ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
        };
      });
  }, [showtimes, selectedProductionId]);

  const onSelectProduction = (productionId: string) => {
    setSelectedProductionId(productionId);
    setSelectedShowtimeId('');   // force a fresh date & time pick
    clearSeatData();
  };

  const onSelectShowtime = (id: string) => {
    setSelectedShowtimeId(id);
    clearSeatData();
    if (id) loadSeatsFor(id);
  };

  const onPaint = (id: string, next: boolean) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (next) n.add(id); else n.delete(id);
      return n;
    });
  };

  const cells: SeatCell[] = venueSeats.map(v => {
    const perShow = seatStatus.get(v.seat_identifier);
    let tone: SeatTone;
    let selectable: boolean;
    if (v.status === 'broken') { tone = 'broken'; selectable = false; }          // physically out, every night
    else if (perShow === 'booked') { tone = 'booked'; selectable = false; }       // sold — can't touch
    else if (perShow === 'blocked') { tone = 'blocked'; selectable = true; }       // this night's hold — can lift
    else if (v.status === 'blocked') { tone = 'blocked'; selectable = false; }     // legacy venue-wide block
    else { tone = 'available'; selectable = true; }                                // free — can hold
    return {
      identifier: v.seat_identifier,
      rowLabel: v.row_label,
      colNumber: v.col_number,
      isAccessible: v.is_accessible,
      tone,
      selected: selected.has(v.seat_identifier),
      selectable,
    };
  });

  // Split the selection by what each seat currently is, so Block only adds
  // holds to free seats and Set Available only lifts holds that actually exist.
  const selectedArr = Array.from(selected);
  const toBlock = selectedArr.filter(id => !seatStatus.has(id));                   // free this performance
  const toLift = selectedArr.filter(id => seatStatus.get(id) === 'blocked');       // currently held

  // PART 3 — block = insert per-showtime hold rows into booking_seats. NOT a
  // venue_seats update, so the seat stays for sale on every other performance.
  const blockSeats = async () => {
    if (toBlock.length === 0 || saving) return;
    setSaving(true);
    try {
      const rows = toBlock.map(seat => ({
        showtime_id: selectedShowtimeId,
        seat_number: seat,
        booking_id: null,        // a hold is not a sale
        status: 'blocked',
      }));
      const { error: insertError } = await supabase.from('booking_seats').insert(rows);
      if (insertError) throw insertError;
      await loadSeatsFor(selectedShowtimeId);
      showModal({ title: 'Seats blocked', message: `${rows.length} seat${rows.length > 1 ? 's' : ''} held for this performance only.`, variant: 'success' });
    } catch (err: any) {
      logger.error('Failed to block seats:', err);
      showModal({ title: 'Failed to block seats', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Set Available = delete just this showtime's 'blocked' rows for the picked
  // seats. The status filter guarantees a sold seat can never be freed here.
  const freeSeats = async () => {
    if (toLift.length === 0 || saving) return;
    setSaving(true);
    try {
      const { error: deleteError } = await supabase
        .from('booking_seats')
        .delete()
        .eq('showtime_id', selectedShowtimeId)
        .eq('status', 'blocked')
        .in('seat_number', toLift);
      if (deleteError) throw deleteError;
      await loadSeatsFor(selectedShowtimeId);
      showModal({ title: 'Seats freed', message: `${toLift.length} seat${toLift.length > 1 ? 's' : ''} released for this performance.`, variant: 'success' });
    } catch (err: any) {
      logger.error('Failed to free seats:', err);
      showModal({ title: 'Failed to free seats', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Accessibility + broken are PHYSICAL, venue-wide facts (true every night),
  // so they still write the venue_seats master, not this single performance.
  const applyVenueUpdate = async (
    patch: Partial<{ status: VenueSeat['status']; is_accessible: boolean }>,
    successTitle: string,
  ) => {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    try {
      const ids = Array.from(selected);
      const { error: updateError } = await supabase.from('venue_seats').update(patch).in('seat_identifier', ids);
      if (updateError) throw updateError;
      await loadSeatsFor(selectedShowtimeId);
      showModal({ title: successTitle, message: `${ids.length} seat${ids.length > 1 ? 's' : ''} updated for every performance.`, variant: 'success' });
    } catch (err: any) {
      logger.error('Failed to update venue seats:', err);
      showModal({ title: 'Update failed', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const hasSelection = selected.size > 0;

  return (
    <>
      <PageHeader
        title="Seat Map"
        subtitle="Block seats for a single performance. Pick a production, then a date & time."
      />

      {error ? (
        <Text style={[um.empty, { color: B.red }]}>{error}</Text>
      ) : (
        <>
          <View style={s.card}>
            <View style={[sm.selectorRow, !isDesktop && sm.selectorRowStacked]}>
              <View style={sm.selectorCol}>
                <Text style={bo.fieldLabel}>Select production</Text>
                <View style={bo.selectWrap}>
                  <WebSelect
                    value={selectedProductionId}
                    onChange={onSelectProduction}
                    options={productionOptions}
                    placeholder={showtimes === null ? 'Loading…' : 'Select a production'}
                  />
                </View>
              </View>
              <View style={sm.selectorCol}>
                <Text style={bo.fieldLabel}>Select date &amp; time</Text>
                <View style={[bo.selectWrap, !selectedProductionId && sm.selectDisabled]}>
                  <WebSelect
                    value={selectedShowtimeId}
                    onChange={onSelectShowtime}
                    options={showtimeOptions}
                    placeholder={selectedProductionId ? 'Select a date & time' : 'Choose a production first'}
                    disabled={!selectedProductionId}
                  />
                </View>
              </View>
            </View>
          </View>

          {!selectedShowtimeId ? (
            <EmptyState
              icon="apps-outline"
              title={selectedProductionId ? 'Pick a date & time' : 'No showtime selected'}
              subtitle={selectedProductionId
                ? 'Choose a specific performance above to view and edit its seat map.'
                : 'Select a production, then a date & time, to open its seat map.'}
            />
          ) : loadingSeats ? (
            <LoadingState label="Loading seats…" />
          ) : (
            <View style={s.card}>
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

              <View style={sm.panel}>
                <Text style={sm.panelTitle}>
                  {hasSelection ? `${selected.size} seat${selected.size > 1 ? 's' : ''} selected` : 'Select seats to edit'}
                </Text>
                <Text style={sm.panelHint}>Click a seat, or click and drag to select a block of seats.</Text>

                <Text style={sm.groupLabel}>This performance only</Text>
                <View style={sm.btnRow}>
                  <TouchableOpacity style={[sm.btn, sm.btnBlock, (toBlock.length === 0 || saving) && sm.btnDisabled]} disabled={toBlock.length === 0 || saving} onPress={blockSeats} activeOpacity={0.85}>
                    <Text style={[sm.btnText, { color: B.amber }]}>Block{toBlock.length ? ` (${toBlock.length})` : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[sm.btn, sm.btnFree, (toLift.length === 0 || saving) && sm.btnDisabled]} disabled={toLift.length === 0 || saving} onPress={freeSeats} activeOpacity={0.85}>
                    <Text style={[sm.btnText, { color: B.green }]}>Set available{toLift.length ? ` (${toLift.length})` : ''}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={sm.groupLabel}>Permanent · every performance</Text>
                <View style={sm.btnRow}>
                  <TouchableOpacity style={[sm.btn, sm.btnAccessible, (!hasSelection || saving) && sm.btnDisabled]} disabled={!hasSelection || saving} onPress={() => applyVenueUpdate({ is_accessible: true }, 'Marked accessible')} activeOpacity={0.85}>
                    <Icon name="accessibility" size={13} color={B.blue} style={{ marginRight: 6 }} />
                    <Text style={[sm.btnText, { color: B.blue }]}>Mark accessible</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[sm.btn, (!hasSelection || saving) && sm.btnDisabled]} disabled={!hasSelection || saving} onPress={() => applyVenueUpdate({ is_accessible: false }, 'Accessibility removed')} activeOpacity={0.85}>
                    <Text style={sm.btnText}>Remove accessible</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[sm.btn, sm.btnBroken, (!hasSelection || saving) && sm.btnDisabled]} disabled={!hasSelection || saving} onPress={() => applyVenueUpdate({ status: 'broken' }, 'Seats marked broken')} activeOpacity={0.85}>
                    <Text style={[sm.btnText, { color: B.rose }]}>Mark broken</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[sm.btn, (!hasSelection || saving) && sm.btnDisabled]} disabled={!hasSelection || saving} onPress={() => applyVenueUpdate({ status: 'available' }, 'Seats repaired')} activeOpacity={0.85}>
                    <Text style={[sm.btnText, { color: B.green }]}>Mark repaired</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[sm.btn, !hasSelection && sm.btnDisabled]} disabled={!hasSelection} onPress={() => setSelected(new Set())} activeOpacity={0.85}>
                    <Text style={sm.btnText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </>
  );
};

export const sm = createStyles({
  selectorRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  selectorRowStacked: { flexDirection: 'column' },
  selectorCol: { flex: 1, minWidth: 0, width: '100%' },
  selectDisabled: { opacity: 0.55 },
  panel: { marginTop: 20, borderTopWidth: 1, borderTopColor: B.border, paddingTop: 18 },
  panelTitle: { fontSize: 14, fontWeight: '800', color: B.txt },
  panelHint: { fontSize: 12, color: B.txtMu, marginTop: 4, marginBottom: 14 },
  groupLabel: { fontSize: 10.5, fontWeight: '700', color: B.txtMu, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 6, marginBottom: 8 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  btn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: B.bg, borderWidth: 1, borderColor: B.border,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9,
  },
  btnDisabled: { opacity: 0.45 },
  btnAccessible: { backgroundColor: B.blueBg, borderColor: B.blue },
  btnBlock: { backgroundColor: B.amberBg, borderColor: B.amber },
  btnBroken: { backgroundColor: B.roseBg, borderColor: B.rose },
  btnFree: { backgroundColor: B.greenBg, borderColor: B.green },
  btnText: { fontSize: 12, fontWeight: '700', color: B.txt },
});
