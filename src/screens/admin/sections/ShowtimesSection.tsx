import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Modal } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { useAppModal } from '../../../components/ModalProvider';
import ConfirmModal from '../../../components/ConfirmModal';
import { createStyles } from '../../../theme';
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
export const ShowtimeFormModal = ({ visible, movies, editing, submitting, onClose, onSubmit }: {
  visible: boolean;
  movies: ProductionOption[];
  editing: ShowtimeRow | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: { movieId: string; startTimeIso: string; price: number; availableSeats: number }) => void;
}) => {
  const [movieId, setMovieId] = useState(editing?.production_id ?? '');
  const [startDate, setStartDate] = useState(editing ? toDateValue(editing.start_time) : '');
  const [startTime, setStartTime] = useState(editing ? toTimeValue(editing.start_time) : '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [availableSeats, setAvailableSeats] = useState(editing ? String(editing.available_seats) : String(VENUE_SEAT_COUNT));

  const [movieError, setMovieError] = useState<string | null>(null);
  const [startTimeError, setStartTimeError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [seatsError, setSeatsError] = useState<string | null>(null);

  const minDate = toDateValue(new Date().toISOString());
  const editingMovie = editing ? movies.find(m => m.id === editing.production_id) ?? null : null;

  const handleSubmit = () => {
    const mErr = validateMovieField(movieId);
    const tErr = validateStartFields(startDate, startTime);
    const pErr = validatePriceField(price);
    const sErr = validateSeatsField(availableSeats);
    setMovieError(mErr);
    setStartTimeError(tErr);
    setPriceError(pErr);
    setSeatsError(sErr);
    if (mErr || tErr || pErr || sErr) return;

    onSubmit({
      movieId,
      startTimeIso: new Date(`${startDate}T${startTime}`).toISOString(),
      price: Number(price),
      availableSeats: Math.trunc(Number(availableSeats)),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fm.backdrop}>
        <View style={fm.card}>
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
            <View style={fm.row}>
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

          <View style={fm.row}>
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
  const [showtimes, setShowtimes] = useState<ShowtimeRow[]>([]);
  const [movies, setMovies] = useState<ProductionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingShowtime, setEditingShowtime] = useState<ShowtimeRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ShowtimeRow | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleSubmitForm = async (values: { movieId: string; startTimeIso: string; price: number; availableSeats: number }) => {
    setSubmitting(true);
    try {
      const payload = {
        production_id: values.movieId,
        start_time: values.startTimeIso,
        price: values.price,
        available_seats: values.availableSeats,
      };
      const { error: writeError } = editingShowtime
        ? await supabase.from('showtimes').update(payload).eq('id', editingShowtime.id)
        : await supabase.from('showtimes').insert(payload);
      if (writeError) throw writeError;

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
      <View style={s.card}>
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
                    <View style={s.tHead}>
                      {[
                        { lbl: 'DATE', f: 1 }, { lbl: 'TIME', f: 0.8 },
                        { lbl: 'PRICE', f: 0.7 }, { lbl: 'SEATS', f: 0.7 }, { lbl: 'ACTIONS', f: 1.2 },
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
                          <View style={[st.actionsCell, { flex: 1.2 }]}>
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
