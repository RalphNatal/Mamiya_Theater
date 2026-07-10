import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Modal } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { useAppModal } from '../../../components/ModalProvider';
import ConfirmModal from '../../../components/ConfirmModal';
import { createStyles } from '../../../theme';
import { useResponsive } from '../../../theme/useResponsive';
import { ZONE_ORDER, ZONE_META, type Zone } from '../../../config/theaterLayout';
import { B } from '../shared/brand';
import { s, um, st, fm } from '../shared/adminStyles';
import { VENUE_SEAT_COUNT } from '../shared/constants';
import { toDateValue, toTimeValue } from '../shared/format';
import { WebDateInput, WebTimeInput, WebSelect } from '../components/WebInputs';
import { PageHeader, LoadingState, EmptyState } from '../components/Feedback';
import { validateMovieField, validateStartFields, validatePriceField, validateSeatsField } from '../shared/validators';
export type ProductionOption = { id: string; title: string; poster_url: string | null };
export type ShowtimeRow = {
  id: string;
  production_id: string;
  start_time: string;
  price: number;
  available_seats: number;
  productions: { title: string } | null;
};
// ── SHOWTIME FORM MODAL (create / edit) ───────────────
// A per-zone price the admin typed: null = left blank ⇒ no override (that zone
// falls back to the flat price). Keyed by zone so it maps straight to
// showtime_seat_prices rows.
export type ZonePriceValues = Record<Zone, number | null>;

const zps = createStyles({
  third: { flex: 1, minWidth: 0 },
  hint: { color: B.txtMu, fontSize: 11, marginTop: -6, marginBottom: 8 },
  zoneLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  zoneLabel: { color: B.txt2, fontSize: 11, fontWeight: '700' },
});

// Below md the flex "table" is unreadable, so each showtime reflows into a
// stacked card: one "Label: value" line per column, with the actions on their
// own full-width row (tap targets stay ≥44px).
const stm = createStyles({
  colStack: { flexDirection: 'column' } as any,
  card: { borderWidth: 1, borderColor: B.border, borderRadius: 10, padding: 14, marginBottom: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 5 },
  lineLabel: { fontSize: 11, fontWeight: '700', color: B.txtMu, letterSpacing: 0.4, textTransform: 'uppercase' },
  lineValue: { fontSize: 14, fontWeight: '600', color: B.txt, flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: B.border },
  actionBtn: { flexGrow: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 8 },
  actionBtnEmail: { backgroundColor: B.blueBg },
  actionBtnEmailText: { color: B.blue, fontSize: 13, fontWeight: '700' },
  actionBtnEdit: { backgroundColor: B.bg },
  actionBtnEditText: { color: B.txt, fontSize: 13, fontWeight: '700' },
  actionBtnDelete: { backgroundColor: B.roseBg },
  actionBtnDeleteText: { color: B.red, fontSize: 13, fontWeight: '700' },
});

export const ShowtimeFormModal = ({ visible, movies, editing, submitting, onClose, onSubmit }: {
  visible: boolean;
  movies: ProductionOption[];
  editing: ShowtimeRow | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: { movieId: string; startTimeIso: string; price: number; availableSeats: number; zonePrices: ZonePriceValues }) => void;
}) => {
  const { isMobile } = useResponsive();
  const [movieId, setMovieId] = useState(editing?.production_id ?? '');
  const [startDate, setStartDate] = useState(editing ? toDateValue(editing.start_time) : '');
  const [startTime, setStartTime] = useState(editing ? toTimeValue(editing.start_time) : '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [availableSeats, setAvailableSeats] = useState(editing ? String(editing.available_seats) : String(VENUE_SEAT_COUNT));
  // Optional per-zone prices as raw input strings ('' = no override). Prefilled
  // from showtime_seat_prices when editing (see the effect below).
  const [zonePriceInputs, setZonePriceInputs] = useState<Record<Zone, string>>({ premium: '', general: '', limited_view: '' });
  const [zonePriceError, setZonePriceError] = useState<string | null>(null);

  const [movieError, setMovieError] = useState<string | null>(null);
  const [startTimeError, setStartTimeError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [seatsError, setSeatsError] = useState<string | null>(null);

  // Prefill zone prices for an existing showtime. Keyed on editing?.id, but the
  // modal is also remounted per-edit (key={editingShowtime?.id}) so this is a
  // one-shot load. A showtime with no rows just leaves all three blank (flat).
  useEffect(() => {
    if (!editing?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('showtime_seat_prices')
        .select('zone, price')
        .eq('showtime_id', editing.id);
      if (cancelled) return;
      const next: Record<Zone, string> = { premium: '', general: '', limited_view: '' };
      (data ?? []).forEach((r: any) => { next[r.zone as Zone] = String(r.price); });
      setZonePriceInputs(next);
    })();
    return () => { cancelled = true; };
  }, [editing?.id]);

  const minDate = toDateValue(new Date().toISOString());
  const editingMovie = editing ? movies.find(m => m.id === editing.production_id) ?? null : null;

  // Empty ⇒ null (no override). Otherwise must be a number ≥ 0.
  const parseZonePrices = (): ZonePriceValues | null => {
    const out: ZonePriceValues = { premium: null, general: null, limited_view: null };
    for (const zone of ZONE_ORDER) {
      const raw = zonePriceInputs[zone].trim();
      if (raw === '') { out[zone] = null; continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      out[zone] = n;
    }
    return out;
  };

  const handleSubmit = () => {
    const mErr = validateMovieField(movieId);
    const tErr = validateStartFields(startDate, startTime);
    const pErr = validatePriceField(price);
    const sErr = validateSeatsField(availableSeats);
    const zonePrices = parseZonePrices();
    const zErr = zonePrices === null ? 'Zone prices must be 0 or more, or left blank.' : null;
    setMovieError(mErr);
    setStartTimeError(tErr);
    setPriceError(pErr);
    setSeatsError(sErr);
    setZonePriceError(zErr);
    if (mErr || tErr || pErr || sErr || zErr || !zonePrices) return;

    onSubmit({
      movieId,
      startTimeIso: new Date(`${startDate}T${startTime}`).toISOString(),
      price: Number(price),
      availableSeats: Math.trunc(Number(availableSeats)),
      zonePrices,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fm.backdrop}>
        <View style={[fm.card, isMobile && { padding: 16 }]}>
          <Text style={fm.title}>{editing ? 'Edit showtime' : 'Add showtime'}</Text>

          {editing && (
            <View style={fm.editingHeader}>
              {editingMovie?.poster_url ? (
                <Image source={{ uri: editingMovie.poster_url }} style={fm.posterThumb} resizeMode="cover" />
              ) : (
                <View style={[fm.posterThumb, fm.posterPlaceholder]}>
                  <Icon name="film-outline" size={18} color={B.txtMu} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={fm.editingMovieTitle} numberOfLines={1}>
                  {editingMovie?.title ?? 'Unknown production'}
                </Text>
                <Text style={fm.editingSubtitle}>
                  Editing: {new Date(editing.start_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  {new Date(editing.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          )}

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Production</Text>
            <View style={[fm.inputWrapper, !!movieError && fm.inputError]}>
              <WebSelect
                value={movieId}
                onChange={(v) => { setMovieId(v); if (movieError) setMovieError(null); }}
                options={movies.map(m => ({ value: m.id, label: m.title }))}
                placeholder="Select a production"
              />
            </View>
            {!!movieError && <Text style={fm.errorText}>{movieError}</Text>}
          </View>

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Date &amp; time</Text>
            <View style={[fm.row, isMobile && stm.colStack]}>
              <View style={[fm.inputWrapper, fm.half, !!startTimeError && fm.inputError]}>
                <WebDateInput
                  value={startDate}
                  min={minDate}
                  onChange={(v) => { setStartDate(v); if (startTimeError) setStartTimeError(null); }}
                />
              </View>
              <View style={[fm.inputWrapper, fm.half, !!startTimeError && fm.inputError]}>
                <WebTimeInput
                  value={startTime}
                  onChange={(v) => { setStartTime(v); if (startTimeError) setStartTimeError(null); }}
                />
              </View>
            </View>
            {!!startTimeError && <Text style={fm.errorText}>{startTimeError}</Text>}
          </View>

          <View style={[fm.row, isMobile && stm.colStack]}>
            <View style={[fm.fieldGroup, fm.half]}>
              <Text style={fm.label}>Price ($)</Text>
              <View style={[fm.inputWrapper, !!priceError && fm.inputError]}>
                <TextInput
                  style={fm.input}
                  keyboardType="decimal-pad"
                  placeholder="12.00"
                  placeholderTextColor="#aaa"
                  value={price}
                  onChangeText={(t) => { setPrice(t); if (priceError) setPriceError(null); }}
                  onBlur={() => setPriceError(validatePriceField(price))}
                />
              </View>
              {!!priceError && <Text style={fm.errorText}>{priceError}</Text>}
            </View>

            <View style={[fm.fieldGroup, fm.half]}>
              <Text style={fm.label}>Available seats</Text>
              <View style={[fm.inputWrapper, !!seatsError && fm.inputError]}>
                <TextInput
                  style={fm.input}
                  keyboardType="number-pad"
                  placeholder="100"
                  placeholderTextColor="#aaa"
                  value={availableSeats}
                  onChangeText={(t) => { setAvailableSeats(t); if (seatsError) setSeatsError(null); }}
                  onBlur={() => setSeatsError(validateSeatsField(availableSeats))}
                />
              </View>
              {!!seatsError && <Text style={fm.errorText}>{seatsError}</Text>}
            </View>
          </View>

          {/* Optional per-zone pricing. Any field left blank falls back to the
              flat Price above for that zone, so the existing flow is unchanged
              when they're all empty. */}
          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Zone prices ($) — optional</Text>
            <Text style={zps.hint}>Leave a zone blank to charge the flat price above for it.</Text>
            <View style={[fm.row, isMobile && stm.colStack]}>
              {ZONE_ORDER.map(zone => (
                <View key={zone} style={[fm.fieldGroup, zps.third]}>
                  <View style={zps.zoneLabelRow}>
                    <View style={[zps.swatch, { backgroundColor: ZONE_META[zone].color }]} />
                    <Text style={zps.zoneLabel}>{ZONE_META[zone].label}</Text>
                  </View>
                  <View style={[fm.inputWrapper, !!zonePriceError && fm.inputError]}>
                    <TextInput
                      style={fm.input}
                      keyboardType="decimal-pad"
                      placeholder={price ? Number(price).toFixed(2) : 'Flat'}
                      placeholderTextColor="#aaa"
                      value={zonePriceInputs[zone]}
                      onChangeText={(t) => {
                        setZonePriceInputs(prev => ({ ...prev, [zone]: t }));
                        if (zonePriceError) setZonePriceError(null);
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
            {!!zonePriceError && <Text style={fm.errorText}>{zonePriceError}</Text>}
          </View>

          <View style={fm.actions}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={submitting} activeOpacity={0.85}>
              <Text style={fm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fm.submitBtn, submitting && fm.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={fm.submitText}>{submitting ? 'Saving…' : editing ? 'Save changes' : 'Add showtime'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── BROADCAST MODAL (email a showtime's ticket holders) ─
// Self-contained: on open it asks the send-showtime-broadcast function for a
// recipient-count preview, then sends the admin's subject + message to every
// paid ticket holder of that performance. The function re-checks admin role and
// owns the actual send/dedup — this is only the composer.
const bs = createStyles({
  emailBtn: { backgroundColor: B.blueBg, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  emailBtnText: { color: B.blue, fontSize: 11, fontWeight: '700' },
  recipientLine: { color: B.txt2, fontSize: 13, marginTop: 2, marginBottom: 14 },
  recipientStrong: { color: B.txt, fontWeight: '800' },
});

export const BroadcastModal = ({ visible, showtime, onClose }: {
  visible: boolean;
  showtime: ShowtimeRow | null;
  onClose: () => void;
}) => {
  const { showModal } = useAppModal();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the composer and fetch the recipient count each time it opens.
  useEffect(() => {
    if (!visible || !showtime) return;
    setSubject(''); setMessage(''); setError(null); setRecipientCount(null);
    setLoadingCount(true);
    let cancelled = false;
    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('send-showtime-broadcast', {
          body: { showtime_id: showtime.id, preview: true },
        });
        if (fnErr) throw fnErr;
        if (!cancelled) setRecipientCount(Number((data as any)?.recipient_count ?? 0));
      } catch (err: any) {
        logger.error('Broadcast preview failed:', err);
        if (!cancelled) setError('Could not load the recipient count.');
      } finally {
        if (!cancelled) setLoadingCount(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, showtime]);

  const handleSend = async () => {
    if (!showtime) return;
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (!cleanSubject || !cleanMessage) { setError('Enter a subject and a message.'); return; }
    setSending(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-showtime-broadcast', {
        body: { showtime_id: showtime.id, subject: cleanSubject, body: cleanMessage },
      });
      if (fnErr) throw fnErr;
      const sent = Number((data as any)?.sent ?? 0);
      const failed = Number((data as any)?.failed ?? 0);
      onClose();
      showModal({
        title: sent > 0 ? 'Broadcast sent' : 'Nothing sent',
        message: `Emailed ${sent} ticket holder${sent === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}.`,
        variant: sent > 0 ? 'success' : 'error',
      });
    } catch (err: any) {
      logger.error('Broadcast send failed:', err);
      setError(err.message ?? 'Could not send the broadcast.');
    } finally {
      setSending(false);
    }
  };

  const when = showtime ? new Date(showtime.start_time) : null;
  const noRecipients = recipientCount === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fm.backdrop}>
        <View style={fm.card}>
          <Text style={fm.title}>Email ticket holders</Text>
          {showtime && (
            <Text style={fm.editingSubtitle}>
              {showtime.productions?.title ?? 'This production'}
              {' · '}
              {when?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              {' · '}
              {when?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </Text>
          )}

          {loadingCount ? (
            <Text style={bs.recipientLine}>Counting recipients…</Text>
          ) : recipientCount !== null ? (
            <Text style={bs.recipientLine}>
              This will email <Text style={bs.recipientStrong}>{recipientCount}</Text> paid ticket holder{recipientCount === 1 ? '' : 's'}.
            </Text>
          ) : (
            <View style={fm.fieldGroup} />
          )}

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Subject</Text>
            <View style={fm.inputWrapper}>
              <TextInput
                style={fm.input}
                placeholder="An update about your show"
                placeholderTextColor="#aaa"
                value={subject}
                onChangeText={(t) => { setSubject(t); if (error) setError(null); }}
                maxLength={200}
              />
            </View>
          </View>

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Message</Text>
            <View style={[fm.inputWrapper, fm.textareaWrapper]}>
              <TextInput
                style={[fm.input, fm.textarea]}
                placeholder="Write your message to ticket holders…"
                placeholderTextColor="#aaa"
                value={message}
                onChangeText={(t) => { setMessage(t); if (error) setError(null); }}
                multiline
                maxLength={5000}
              />
            </View>
          </View>

          {!!error && <Text style={fm.errorText}>{error}</Text>}

          <View style={fm.actions}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={sending} activeOpacity={0.85}>
              <Text style={fm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fm.submitBtn, (sending || noRecipients) && fm.submitBtnDisabled]}
              onPress={handleSend}
              disabled={sending || noRecipients}
              activeOpacity={0.85}
            >
              <Text style={fm.submitText}>{sending ? 'Sending…' : 'Send email'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── SHOWTIMES GROUPING (accordion) ─────────────────────
// Auto-generated runs produce one showtime row per day, so a flat table buries
// the schedule. Group the fetched rows by production into one collapsible
// section each, carrying the count and the run's date span for the header.
export type ShowtimeGroup = {
  productionId: string;
  title: string;
  showtimes: ShowtimeRow[];   // ascending by start_time
  count: number;
  firstStart: string;
  lastStart: string;
};

export const groupShowtimesByProduction = (rows: ShowtimeRow[]): ShowtimeGroup[] => {
  const byProduction = new Map<string, ShowtimeRow[]>();
  for (const row of rows) {
    const key = row.production_id ?? 'unknown';
    const bucket = byProduction.get(key);
    if (bucket) bucket.push(row); else byProduction.set(key, [row]);
  }
  const groups = Array.from(byProduction, ([productionId, list]) => {
    const showtimes = [...list].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    return {
      productionId,
      title: showtimes[0].productions?.title ?? 'Unknown production',
      showtimes,
      count: showtimes.length,
      firstStart: showtimes[0].start_time,
      lastStart: showtimes[showtimes.length - 1].start_time,
    };
  });
  // Soonest-opening run first, matching the ascending feel of the old flat list.
  groups.sort((a, b) => new Date(a.firstStart).getTime() - new Date(b.firstStart).getTime());
  return groups;
};

// "Jul 6" for a single day, "Jul 6 – Jul 20" for a span. Year is dropped to keep
// the header compact; the expanded rows still show full dates.
export const formatRunRange = (startIso: string, endIso: string): string => {
  const opts = { month: 'short', day: 'numeric' } as const;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startStr = start.toLocaleDateString(undefined, opts);
  if (start.toDateString() === end.toDateString()) return startStr;
  return `${startStr} – ${end.toLocaleDateString(undefined, opts)}`;
};

// ── SHOWTIMES CRUD ─────────────────────────────────────
export const ShowtimesPanel = () => {
  const { showModal } = useAppModal();
  const { isMobile } = useResponsive();
  const [showtimes, setShowtimes] = useState<ShowtimeRow[]>([]);
  const [movies, setMovies] = useState<ProductionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingShowtime, setEditingShowtime] = useState<ShowtimeRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ShowtimeRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The showtime whose ticket holders we're composing a broadcast email to.
  const [broadcastTarget, setBroadcastTarget] = useState<ShowtimeRow | null>(null);

  // Which production sections are expanded in the accordion.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (productionId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(productionId)) next.delete(productionId); else next.add(productionId);
      return next;
    });
  };

  const groups = useMemo(() => groupShowtimesByProduction(showtimes), [showtimes]);

  const loadShowtimes = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('showtimes')
        .select('id, start_time, price, available_seats, production_id, productions(title)')
        .order('start_time', { ascending: true });
      if (fetchError) throw fetchError;
      setShowtimes((data as any) ?? []);
      setError(null);
    } catch (err: any) {
      logger.error('Failed to load showtimes:', err);
      setError(err.message ?? 'Failed to load showtimes.');
    } finally {
      setLoading(false);
    }
  };

  const loadMovies = async () => {
    const { data } = await supabase.from('productions').select('id, title, poster_url').order('title', { ascending: true });
    setMovies(data ?? []);
  };

  useEffect(() => {
    loadShowtimes();
    loadMovies();
  }, []);

  const openCreate = () => { setEditingShowtime(null); setFormVisible(true); };
  const openEdit = (row: ShowtimeRow) => { setEditingShowtime(row); setFormVisible(true); };
  const closeForm = () => { setFormVisible(false); setEditingShowtime(null); };

  const handleSubmitForm = async (values: { movieId: string; startTimeIso: string; price: number; availableSeats: number; zonePrices: ZonePriceValues }) => {
    setSubmitting(true);
    try {
      const payload = {
        production_id: values.movieId,
        start_time: values.startTimeIso,
        price: values.price,
        available_seats: values.availableSeats,
      };

      // Write the showtime first so we always have an id for the zone-price rows.
      let showtimeId: string;
      if (editingShowtime) {
        const { error: writeError } = await supabase.from('showtimes').update(payload).eq('id', editingShowtime.id);
        if (writeError) throw writeError;
        showtimeId = editingShowtime.id;
      } else {
        const { data: created, error: writeError } = await supabase.from('showtimes').insert(payload).select('id').single();
        if (writeError) throw writeError;
        showtimeId = (created as any).id;
      }

      // Sync per-zone prices: upsert the ones that were filled in, and delete the
      // rows for any zone left blank so it reverts to the flat price. Keyed on the
      // (showtime_id, zone) unique constraint.
      const upserts = ZONE_ORDER
        .filter(z => values.zonePrices[z] != null)
        .map(z => ({ showtime_id: showtimeId, zone: z, price: values.zonePrices[z] as number }));
      const clears = ZONE_ORDER.filter(z => values.zonePrices[z] == null);
      if (upserts.length > 0) {
        const { error: upsertErr } = await supabase
          .from('showtime_seat_prices')
          .upsert(upserts, { onConflict: 'showtime_id,zone' });
        if (upsertErr) throw upsertErr;
      }
      if (clears.length > 0) {
        const { error: clearErr } = await supabase
          .from('showtime_seat_prices')
          .delete()
          .eq('showtime_id', showtimeId)
          .in('zone', clears);
        if (clearErr) throw clearErr;
      }

      const wasEditing = !!editingShowtime;
      closeForm();
      await loadShowtimes();
      showModal({ title: wasEditing ? 'Showtime updated' : 'Showtime added', variant: 'success' });
    } catch (err: any) {
      logger.error('Failed to save showtime:', err);
      showModal({ title: 'Failed to save showtime', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: deleteError } = await supabase.from('showtimes').delete().eq('id', deleteTarget.id);
      if (deleteError) throw deleteError;
      setDeleteTarget(null);
      await loadShowtimes();
      showModal({ title: 'Showtime deleted', variant: 'success' });
    } catch (err: any) {
      logger.error('Failed to delete showtime:', err);
      showModal({ title: 'Failed to delete showtime', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Showtimes"
        subtitle="Schedule and manage when each production plays."
        actionLabel="+ Add showtime"
        onAction={openCreate}
      />
      <View style={[s.card, isMobile && { padding: 14 }]}>
      {loading ? (
        <LoadingState label="Loading showtimes…" />
      ) : error ? (
        <Text style={[um.empty, { color: B.red }]}>{error}</Text>
      ) : showtimes.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="No showtimes yet"
          subtitle="Add a showtime to put a production on the schedule."
          actionLabel="+ Add showtime"
          onAction={openCreate}
        />
      ) : (
        <>
          {groups.map(group => {
            const open = expandedGroups.has(group.productionId);
            return (
              <View key={group.productionId} style={st.accGroup}>
                <TouchableOpacity
                  style={[st.accHeader, open && st.accHeaderOpen]}
                  onPress={() => toggleGroup(group.productionId)}
                  activeOpacity={0.7}
                >
                  <Icon name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={B.txt2} style={st.accChevron} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.accTitle} numberOfLines={1}>{group.title}</Text>
                    <Text style={st.accMeta} numberOfLines={1}>{formatRunRange(group.firstStart, group.lastStart)}</Text>
                  </View>
                  <View style={st.accCountPill}>
                    <Text style={st.accCountPillText}>
                      {group.count} showtime{group.count === 1 ? '' : 's'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {open && (
                  <View style={st.accBody}>
                    {isMobile ? (
                      // Phone: each showtime reflows into a stacked "Label: value" card.
                      group.showtimes.map((row) => {
                        const d = new Date(row.start_time);
                        const isBeingEdited = formVisible && editingShowtime?.id === row.id;
                        return (
                          <View key={row.id} style={[stm.card, isBeingEdited && st.tRowHighlight]}>
                            <View style={stm.line}>
                              <Text style={stm.lineLabel}>Date</Text>
                              <Text style={stm.lineValue}>
                                {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </Text>
                            </View>
                            <View style={stm.line}>
                              <Text style={stm.lineLabel}>Time</Text>
                              <Text style={stm.lineValue}>
                                {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                              </Text>
                            </View>
                            <View style={stm.line}>
                              <Text style={stm.lineLabel}>Price</Text>
                              <Text style={stm.lineValue}>${Number(row.price).toFixed(2)}</Text>
                            </View>
                            <View style={stm.line}>
                              <Text style={stm.lineLabel}>Seats</Text>
                              <Text style={stm.lineValue}>{row.available_seats}</Text>
                            </View>
                            <View style={stm.actions}>
                              <TouchableOpacity style={[stm.actionBtn, stm.actionBtnEmail]} onPress={() => setBroadcastTarget(row)} activeOpacity={0.8}>
                                <Text style={stm.actionBtnEmailText}>Email</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[stm.actionBtn, stm.actionBtnEdit]} onPress={() => openEdit(row)} activeOpacity={0.8}>
                                <Text style={stm.actionBtnEditText}>Edit</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[stm.actionBtn, stm.actionBtnDelete]} onPress={() => setDeleteTarget(row)} activeOpacity={0.8}>
                                <Text style={stm.actionBtnDeleteText}>Delete</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })
                    ) : (
                      <>
                        <View style={s.tHead}>
                          {[
                            { lbl: 'DATE', f: 1 }, { lbl: 'TIME', f: 0.8 },
                            { lbl: 'PRICE', f: 0.7 }, { lbl: 'SEATS', f: 0.7 }, { lbl: 'ACTIONS', f: 1.9 },
                          ].map(h => (<Text key={h.lbl} style={[s.th, { flex: h.f }]}>{h.lbl}</Text>))}
                        </View>
                        {group.showtimes.map((row, i) => {
                          const d = new Date(row.start_time);
                          const isBeingEdited = formVisible && editingShowtime?.id === row.id;
                          return (
                            <View key={row.id} style={[s.tRow, i % 2 === 1 && s.tRowAlt, isBeingEdited && st.tRowHighlight]}>
                              <Text style={[s.td, s.tdMuted, { flex: 1 }]}>
                                {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </Text>
                              <Text style={[s.td, s.tdMuted, { flex: 0.8 }]}>
                                {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                              </Text>
                              <Text style={[s.td, s.tdBold, { flex: 0.7 }]}>${Number(row.price).toFixed(2)}</Text>
                              <Text style={[s.td, { flex: 0.7 }]}>{row.available_seats}</Text>
                              <View style={[st.actionsCell, { flex: 1.9 }]}>
                                <TouchableOpacity style={bs.emailBtn} onPress={() => setBroadcastTarget(row)} activeOpacity={0.8}>
                                  <Text style={bs.emailBtnText}>Email</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={st.editBtn} onPress={() => openEdit(row)} activeOpacity={0.8}>
                                  <Text style={st.editBtnText}>Edit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={st.deleteBtn} onPress={() => setDeleteTarget(row)} activeOpacity={0.8}>
                                  <Text style={st.deleteBtnText}>Delete</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}
      </View>

      <ShowtimeFormModal
        key={editingShowtime?.id ?? 'new'}
        visible={formVisible}
        movies={movies}
        editing={editingShowtime}
        submitting={submitting}
        onClose={closeForm}
        onSubmit={handleSubmitForm}
      />

      <BroadcastModal
        visible={!!broadcastTarget}
        showtime={broadcastTarget}
        onClose={() => setBroadcastTarget(null)}
      />

      <ConfirmModal
        visible={!!deleteTarget}
        title="Delete this showtime?"
        message={
          deleteTarget
            ? `This will permanently remove the ${new Date(deleteTarget.start_time).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })} showtime${deleteTarget.productions?.title ? ` for "${deleteTarget.productions.title}"` : ''}.`
            : undefined
        }
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
};
