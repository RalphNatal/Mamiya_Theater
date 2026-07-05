import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Image, Modal } from 'react-native';
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
import { LoadingState, EmptyState } from '../components/Feedback';
import {
  validatePriceField, validateDefaultShowtimeField, validateMovieTitleField,
  validateMovieDurationField, validateRunDateField, validateRunDates,
  validateIntermissionField, validateCapacityField, validateMovieImageFile,
} from '../shared/validators';
export type ProductionRow = {
  id: string;
  title: string;
  description: string | null;
  poster_url: string | null;
  banner_url: string | null;
  duration_minutes: number | null;
  genre: string | null;
  status: string | null;
  playwright: string | null;
  director: string | null;
  intermission_duration: number | null;
  opening_night: string | null;
  closing_night: string | null;
  age_advisory: string | null;
  cast: string | null;
  total_tickets_capacity: number;
  created_at: string;
};

export const MOVIE_STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'now_showing', label: 'Now Showing' },
  { value: 'archived', label: 'Archived' },
];
export const eachDateInRange = (startYmd: string, endYmd: string): string[] => {
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  const cursor = new Date(sy, sm - 1, sd, 12, 0, 0, 0);
  const end = new Date(ey, em - 1, ed, 12, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const out: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    out.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

export type ReconcileResult = { added: number; deleted: number };

export const reconcileShowtimes = async (
  movieId: string,
  newStartDate: string,   
  newEndDate: string,     
  defaultTime: string,    
  defaultPrice: number,
): Promise<ReconcileResult> => {
  const { data: existing, error: fetchError } = await supabase
    .from('showtimes')
    .select('id, start_time')
    .eq('production_id', movieId);
  if (fetchError) throw fetchError;
  const rows = existing ?? [];

  const validDates = new Set(eachDateInRange(newStartDate, newEndDate));

  const existingDates = new Set(rows.map(r => toDateValue(r.start_time)));

  const datesToAdd = Array.from(validDates).filter(d => !existingDates.has(d));

  const showtimesToDelete = rows.filter(r => !validDates.has(toDateValue(r.start_time)));

  if (showtimesToDelete.length > 0) {
    const deleteIds = showtimesToDelete.map(r => r.id);
    const { data: sold, error: soldError } = await supabase
      .from('bookings')
      .select('id')
      .in('showtime_id', deleteIds)
      .limit(1);
    if (soldError) throw soldError;
    if (sold && sold.length > 0) {
      throw new Error('Cannot remove dates that have active bookings.');
    }
  }

  if (datesToAdd.length > 0) {
    const newShowtimesArray = datesToAdd.map(date => ({
      production_id: movieId,
      start_time: new Date(`${date}T${defaultTime}`).toISOString(),
      price: defaultPrice,
      available_seats: VENUE_SEAT_COUNT,
    }));
    const { error: insertError } = await supabase.from('showtimes').insert(newShowtimesArray);
    if (insertError) throw insertError;
  }

  if (showtimesToDelete.length > 0) {
    const deleteIds = showtimesToDelete.map(r => r.id);
    const { error: deleteError } = await supabase.from('showtimes').delete().in('id', deleteIds);
    if (deleteError) throw deleteError;
  }

  return { added: datesToAdd.length, deleted: showtimesToDelete.length };
};

export const pickImageFile = (onSelected: (file: any) => void) => {
  const doc = (globalThis as any).document;
  if (!doc) return;
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (event: any) => {
    const file = event.target.files && event.target.files[0];
    if (file) onSelected(file);
  };
  input.click();
};

export type MovieFormValues = {
  title: string;
  description: string;
  posterUrl: string;
  bannerUrl: string;
  durationMinutes: number | null;
  intermissionDuration: number | null;
  genre: string;
  status: string;
  playwright: string;
  director: string;
  openingNight: string;
  closingNight: string;
  ageAdvisory: string;
  cast: string;
  totalTicketsCapacity: number;
  // Curtain time + price applied to any showtimes generated for the run — every
  // day on CREATE, and only newly added days when an EDIT extends the range.
  // defaultTicketPrice is null when no run is scheduled.
  defaultShowtime: string;
  defaultTicketPrice: number | null;
  posterFile: any | null;
  bannerFile: any | null;
};

export const MovieFormModal = ({ visible, editing, submitting, onClose, onSubmit }: {
  visible: boolean;
  editing: ProductionRow | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: MovieFormValues) => void;
}) => {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [posterUrl, setPosterUrl] = useState(editing?.poster_url ?? '');
  const [bannerUrl, setBannerUrl] = useState(editing?.banner_url ?? '');
  const [duration, setDuration] = useState(editing?.duration_minutes ? String(editing.duration_minutes) : '');
  const [intermission, setIntermission] = useState(editing?.intermission_duration != null ? String(editing.intermission_duration) : '');
  const [genre, setGenre] = useState(editing?.genre ?? '');
  const [status, setStatus] = useState(editing?.status ?? 'upcoming');
  const [playwright, setPlaywright] = useState(editing?.playwright ?? '');
  const [director, setDirector] = useState(editing?.director ?? '');
  const [openingNight, setOpeningNight] = useState(editing?.opening_night ? toDateValue(editing.opening_night) : '');
  const [closingNight, setClosingNight] = useState(editing?.closing_night ? toDateValue(editing.closing_night) : '');
  const [ageAdvisory, setAgeAdvisory] = useState(editing?.age_advisory ?? '');
  const [cast, setCast] = useState(editing?.cast ?? '');
  const [capacity, setCapacity] = useState(editing?.total_tickets_capacity != null ? String(editing.total_tickets_capacity) : String(VENUE_SEAT_COUNT));
  // 8:00 PM is the house's standard curtain — pre-filled so a run schedules in
  // one click. These only drive showtime generation when creating a new show.
  const [defaultShowtime, setDefaultShowtime] = useState('20:00');
  const [defaultTicketPrice, setDefaultTicketPrice] = useState('');

  const [posterFile, setPosterFile] = useState<any | null>(null);
  const [bannerFile, setBannerFile] = useState<any | null>(null);
  const [posterPreviewUri, setPosterPreviewUri] = useState<string | null>(null);
  const [bannerPreviewUri, setBannerPreviewUri] = useState<string | null>(null);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [intermissionError, setIntermissionError] = useState<string | null>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [runDatesError, setRunDatesError] = useState<string | null>(null);
  const [defaultShowtimeError, setDefaultShowtimeError] = useState<string | null>(null);
  const [defaultPriceError, setDefaultPriceError] = useState<string | null>(null);
  const [posterFileError, setPosterFileError] = useState<string | null>(null);
  const [bannerFileError, setBannerFileError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (posterPreviewUri) (globalThis as any).URL?.revokeObjectURL?.(posterPreviewUri);
      if (bannerPreviewUri) (globalThis as any).URL?.revokeObjectURL?.(bannerPreviewUri);
    };
  }, [posterPreviewUri, bannerPreviewUri]);

  const posterDisplayUri = posterPreviewUri || posterUrl.trim() || null;
  const bannerDisplayUri = bannerPreviewUri || bannerUrl.trim() || null;

  const handlePosterFile = (file: any) => {
    const err = validateMovieImageFile(file);
    if (err) { setPosterFileError(err); return; }
    setPosterFileError(null);
    setPosterFile(file);
    setPosterPreviewUri((globalThis as any).URL.createObjectURL(file));
  };
  const handleBannerFile = (file: any) => {
    const err = validateMovieImageFile(file);
    if (err) { setBannerFileError(err); return; }
    setBannerFileError(null);
    setBannerFile(file);
    setBannerPreviewUri((globalThis as any).URL.createObjectURL(file));
  };

  // When EDITING, pre-fill the default time/price from the run's earliest
  // existing showtime, so any dates added by extending the run match the rest
  // of the run instead of defaulting to 8 PM / a blank price.
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('showtimes')
        .select('start_time, price')
        .eq('production_id', editing.id)
        .order('start_time', { ascending: true })
        .limit(1);
      if (cancelled || !data || data.length === 0) return;
      setDefaultShowtime(toTimeValue(data[0].start_time));
      setDefaultTicketPrice(String(data[0].price));
    })();
    return () => { cancelled = true; };
  }, [editing]);

  // Run dates drive showtime generation/reconciliation. On CREATE that's any run
  // with both dates; on EDIT only when the admin actually changed the range
  // (re-saving an unchanged run shouldn't force the default fields). When this
  // is true the daily time + ticket price become required, because new dates
  // need them.
  const origOpening = editing?.opening_night ? toDateValue(editing.opening_night) : '';
  const origClosing = editing?.closing_night ? toDateValue(editing.closing_night) : '';
  const datesChanged = openingNight !== origOpening || closingNight !== origClosing;
  const hasRun = !!openingNight.trim() && !!closingNight.trim();
  const willGenerateShowtimes = hasRun && (!editing || datesChanged);
  // The time/price inputs show on create, and on edit whenever the show has a
  // run (so the admin can see/adjust what newly added dates will use).
  const showDefaultFields = !editing || hasRun;

  const handleSubmit = () => {
    const tErr = validateMovieTitleField(title);
    const dErr = validateMovieDurationField(duration);
    const iErr = validateIntermissionField(intermission);
    const cErr = validateCapacityField(capacity);
    const runErr = validateRunDateField(openingNight, 'opening night')
      ?? validateRunDateField(closingNight, 'closing night')
      ?? validateRunDates(openingNight, closingNight);
    const stErr = willGenerateShowtimes ? validateDefaultShowtimeField(defaultShowtime) : null;
    const dpErr = willGenerateShowtimes ? validatePriceField(defaultTicketPrice) : null;
    setTitleError(tErr);
    setDurationError(dErr);
    setIntermissionError(iErr);
    setCapacityError(cErr);
    setRunDatesError(runErr);
    setDefaultShowtimeError(stErr);
    setDefaultPriceError(dpErr);
    if (tErr || dErr || iErr || cErr || runErr || stErr || dpErr) return;

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      posterUrl: posterUrl.trim(),
      bannerUrl: bannerUrl.trim(),
      durationMinutes: duration.trim() ? Math.trunc(Number(duration)) : null,
      intermissionDuration: intermission.trim() ? Math.trunc(Number(intermission)) : null,
      genre: genre.trim(),
      status,
      playwright: playwright.trim(),
      director: director.trim(),
      openingNight: openingNight.trim(),
      closingNight: closingNight.trim(),
      ageAdvisory: ageAdvisory.trim(),
      cast: cast.trim(),
      totalTicketsCapacity: Math.trunc(Number(capacity)),
      defaultShowtime,
      defaultTicketPrice: defaultTicketPrice.trim() ? Number(defaultTicketPrice) : null,
      posterFile,
      bannerFile,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fm.backdrop}>
        <ScrollView style={fm.scrollCard} contentContainerStyle={fm.card} keyboardShouldPersistTaps="handled">
          <View style={fm.titleRow}>
            <Text style={fm.title}>{editing ? 'Edit show' : 'Add show'}</Text>
            <TouchableOpacity style={fm.closeBtn} onPress={onClose} activeOpacity={0.8} disabled={submitting}>
              <Icon name="close" size={18} color={B.txt2} />
            </TouchableOpacity>
          </View>

          {editing && (
            <View style={fm.editingHeader}>
              {editing.poster_url ? (
                <Image source={{ uri: editing.poster_url }} style={fm.posterThumb} resizeMode="cover" />
              ) : (
                <View style={[fm.posterThumb, fm.posterPlaceholder]}>
                  <Icon name="film-outline" size={18} color={B.txtMu} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={fm.editingMovieTitle} numberOfLines={1}>{editing.title}</Text>
                <Text style={fm.editingSubtitle}>Editing this show</Text>
              </View>
            </View>
          )}

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Title</Text>
            <View style={[fm.inputWrapper, !!titleError && fm.inputError]}>
              <TextInput
                style={fm.input}
                placeholder="Production title"
                placeholderTextColor="#aaa"
                value={title}
                onChangeText={(t) => { setTitle(t); if (titleError) setTitleError(null); }}
                onBlur={() => setTitleError(validateMovieTitleField(title))}
              />
            </View>
            {!!titleError && <Text style={fm.errorText}>{titleError}</Text>}
          </View>

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Description</Text>
            <View style={[fm.inputWrapper, fm.textareaWrapper]}>
              <TextInput
                style={[fm.input, fm.textarea]}
                placeholder="Short synopsis…"
                placeholderTextColor="#aaa"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Poster</Text>
            <View style={fm.uploadRow}>
              <View style={fm.posterPreviewWrap}>
                {posterDisplayUri ? (
                  <Image source={{ uri: posterDisplayUri }} style={fm.posterPreviewImg} resizeMode="cover" />
                ) : (
                  <Icon name="film-outline" size={18} color={B.txtMu} />
                )}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity style={fm.uploadBtn} activeOpacity={0.85} onPress={() => pickImageFile(handlePosterFile)}>
                  <Icon name="cloud-upload-outline" size={14} color={B.red} style={{ marginRight: 6 }} />
                  <Text style={fm.uploadBtnText}>Upload poster</Text>
                </TouchableOpacity>
                <View style={fm.inputWrapper}>
                  <TextInput
                    style={fm.input}
                    placeholder="Or paste a poster URL"
                    placeholderTextColor="#aaa"
                    autoCapitalize="none"
                    value={posterUrl}
                    onChangeText={setPosterUrl}
                  />
                </View>
              </View>
            </View>
            {!!posterFileError && <Text style={fm.errorText}>{posterFileError}</Text>}
            <Text style={fm.helperText}>Uploading a file replaces the pasted URL when saved.</Text>
          </View>

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Banner</Text>
            <View style={fm.uploadRow}>
              <View style={[fm.posterPreviewWrap, fm.bannerPreviewWrap]}>
                {bannerDisplayUri ? (
                  <Image source={{ uri: bannerDisplayUri }} style={fm.posterPreviewImg} resizeMode="cover" />
                ) : (
                  <Icon name="image-outline" size={18} color={B.txtMu} />
                )}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity style={fm.uploadBtn} activeOpacity={0.85} onPress={() => pickImageFile(handleBannerFile)}>
                  <Icon name="cloud-upload-outline" size={14} color={B.red} style={{ marginRight: 6 }} />
                  <Text style={fm.uploadBtnText}>Upload banner</Text>
                </TouchableOpacity>
                <View style={fm.inputWrapper}>
                  <TextInput
                    style={fm.input}
                    placeholder="Or paste a banner URL"
                    placeholderTextColor="#aaa"
                    autoCapitalize="none"
                    value={bannerUrl}
                    onChangeText={setBannerUrl}
                  />
                </View>
              </View>
            </View>
            {!!bannerFileError && <Text style={fm.errorText}>{bannerFileError}</Text>}
          </View>

          <View style={fm.row}>
            <View style={[fm.fieldGroup, fm.half]}>
              <Text style={fm.label}>Runtime (min)</Text>
              <View style={[fm.inputWrapper, !!durationError && fm.inputError]}>
                <TextInput
                  style={fm.input}
                  keyboardType="number-pad"
                  placeholder="120"
                  placeholderTextColor="#aaa"
                  value={duration}
                  onChangeText={(t) => { setDuration(t); if (durationError) setDurationError(null); }}
                  onBlur={() => setDurationError(validateMovieDurationField(duration))}
                />
              </View>
              {!!durationError && <Text style={fm.errorText}>{durationError}</Text>}
            </View>

            <View style={[fm.fieldGroup, fm.half]}>
              <Text style={fm.label}>Intermission (min)</Text>
              <View style={[fm.inputWrapper, !!intermissionError && fm.inputError]}>
                <TextInput
                  style={fm.input}
                  keyboardType="number-pad"
                  placeholder="15"
                  placeholderTextColor="#aaa"
                  value={intermission}
                  onChangeText={(t) => { setIntermission(t); if (intermissionError) setIntermissionError(null); }}
                  onBlur={() => setIntermissionError(validateIntermissionField(intermission))}
                />
              </View>
              {!!intermissionError && <Text style={fm.errorText}>{intermissionError}</Text>}
            </View>
          </View>

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Auditorium Seating Capacity</Text>
            <View style={[fm.inputWrapper, !!capacityError && fm.inputError]}>
              <TextInput
                style={fm.input}
                keyboardType="number-pad"
                placeholder="100"
                placeholderTextColor="#aaa"
                value={capacity}
                onChangeText={(t) => { setCapacity(t); if (capacityError) setCapacityError(null); }}
                onBlur={() => setCapacityError(validateCapacityField(capacity))}
              />
            </View>
            {!!capacityError && <Text style={fm.errorText}>{capacityError}</Text>}
            <Text style={fm.helperText}>Maximum tickets sold across every showtime of this show.</Text>
          </View>

          <View style={fm.row}>
            <View style={[fm.fieldGroup, fm.half]}>
              <Text style={fm.label}>Status</Text>
              <View style={fm.inputWrapper}>
                <WebSelect value={status} onChange={setStatus} options={MOVIE_STATUS_OPTIONS} placeholder="Select status" />
              </View>
            </View>

            <View style={[fm.fieldGroup, fm.half]}>
              <Text style={fm.label}>Genre</Text>
              <View style={fm.inputWrapper}>
                <TextInput
                  style={fm.input}
                  placeholder="Drama, Comedy, Musical…"
                  placeholderTextColor="#aaa"
                  value={genre}
                  onChangeText={setGenre}
                />
              </View>
            </View>
          </View>

          <View style={fm.fieldGroup}>
            <View style={fm.row}>
              <View style={fm.half}>
                <Text style={fm.label}>Opening night</Text>
                <View style={[fm.inputWrapper, !!runDatesError && fm.inputError]}>
                  <WebDateInput
                    value={openingNight}
                    onChange={(v) => { setOpeningNight(v); if (runDatesError) setRunDatesError(null); }}
                  />
                </View>
              </View>
              <View style={fm.half}>
                <Text style={fm.label}>Closing night</Text>
                <View style={[fm.inputWrapper, !!runDatesError && fm.inputError]}>
                  <WebDateInput
                    value={closingNight}
                    min={openingNight || undefined}
                    onChange={(v) => { setClosingNight(v); if (runDatesError) setRunDatesError(null); }}
                  />
                </View>
              </View>
            </View>
            {!!runDatesError && <Text style={fm.errorText}>{runDatesError}</Text>}
          </View>

          {showDefaultFields && (
            <View style={fm.fieldGroup}>
              <View style={fm.row}>
                <View style={fm.half}>
                  <Text style={fm.label}>Default daily showtime</Text>
                  <View style={[fm.inputWrapper, !!defaultShowtimeError && fm.inputError]}>
                    <WebTimeInput
                      value={defaultShowtime}
                      onChange={(v) => { setDefaultShowtime(v); if (defaultShowtimeError) setDefaultShowtimeError(null); }}
                    />
                  </View>
                </View>
                <View style={fm.half}>
                  <Text style={fm.label}>Default ticket price ($)</Text>
                  <View style={[fm.inputWrapper, !!defaultPriceError && fm.inputError]}>
                    <TextInput
                      style={fm.input}
                      keyboardType="decimal-pad"
                      placeholder="15.00"
                      placeholderTextColor="#aaa"
                      value={defaultTicketPrice}
                      onChangeText={(t) => { setDefaultTicketPrice(t); if (defaultPriceError) setDefaultPriceError(null); }}
                      onBlur={() => willGenerateShowtimes && setDefaultPriceError(validatePriceField(defaultTicketPrice))}
                    />
                  </View>
                </View>
              </View>
              {(!!defaultShowtimeError || !!defaultPriceError) && (
                <Text style={fm.errorText}>{defaultShowtimeError || defaultPriceError}</Text>
              )}
              <Text style={fm.helperText}>
                {editing
                  ? 'Changing the run dates adds a showtime per new day at this time and price, and removes dropped dates (unless they have bookings).'
                  : 'Setting both run dates auto-creates one showtime per day at this time and price.'}
              </Text>
            </View>
          )}

          <View style={fm.row}>
            <View style={[fm.fieldGroup, fm.half]}>
              <Text style={fm.label}>Playwright</Text>
              <View style={fm.inputWrapper}>
                <TextInput
                  style={fm.input}
                  placeholder="e.g. Anton Chekhov"
                  placeholderTextColor="#aaa"
                  value={playwright}
                  onChangeText={setPlaywright}
                />
              </View>
            </View>

            <View style={[fm.fieldGroup, fm.half]}>
              <Text style={fm.label}>Director</Text>
              <View style={fm.inputWrapper}>
                <TextInput
                  style={fm.input}
                  placeholder="e.g. Jane Doe"
                  placeholderTextColor="#aaa"
                  value={director}
                  onChangeText={setDirector}
                />
              </View>
            </View>
          </View>

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Cast</Text>
            <View style={fm.inputWrapper}>
              <TextInput
                style={fm.input}
                placeholder="Comma-separated names"
                placeholderTextColor="#aaa"
                value={cast}
                onChangeText={setCast}
              />
            </View>
          </View>

          <View style={fm.fieldGroup}>
            <Text style={fm.label}>Age advisory / content warning</Text>
            <View style={fm.inputWrapper}>
              <TextInput
                style={fm.input}
                placeholder="e.g. Ages 12+ · contains haze, strobe & gunshot effects"
                placeholderTextColor="#aaa"
                value={ageAdvisory}
                onChangeText={setAgeAdvisory}
              />
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
              <Text style={fm.submitText}>{submitting ? 'Saving…' : editing ? 'Save changes' : 'Add show'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

// ── MOVIES MANAGER MODAL (list + CRUD, launched from Overview) ───
export const STATUS_BADGE_STYLE: Record<string, { bg: string; color: string }> = {
  upcoming: { bg: B.blueBg, color: B.blue },
  now_showing: { bg: B.greenBg, color: B.green },
  archived: { bg: B.bg, color: B.txtMu },
};

export const uploadMovieImage = async (movieId: string, kind: 'poster' | 'banner', file: any): Promise<string> => {
  const fileExt = (file.name?.split('.').pop() || file.type.split('/').pop() || 'jpg').toLowerCase();
  const path = `${movieId}/${kind}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from('movie-images')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('movie-images').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
};

export const MoviesManagerModal = ({ visible, onClose, onMoviesChanged }: {
  visible: boolean;
  onClose: () => void;
  onMoviesChanged: () => void;
}) => {
  const { showModal } = useAppModal();
  const [movies, setMovies] = useState<ProductionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingMovie, setEditingMovie] = useState<ProductionRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProductionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadMovies = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('productions')
        .select('id, title, description, poster_url, banner_url, duration_minutes, intermission_duration, genre, status, playwright, director, opening_night, closing_night, age_advisory, cast, total_tickets_capacity, created_at')
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setMovies((data as any) ?? []);
      setError(null);
    } catch (err: any) {
      logger.error('Failed to load movies:', err);
      setError(err.message ?? 'Failed to load shows.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) loadMovies();
  }, [visible]);

  const openCreate = () => { setEditingMovie(null); setFormVisible(true); };
  const openEdit = (row: ProductionRow) => { setEditingMovie(row); setFormVisible(true); };
  const closeForm = () => { setFormVisible(false); setEditingMovie(null); };

  const handleSubmitForm = async (values: MovieFormValues) => {
    setSubmitting(true);
    try {
      const basePayload = {
        title: values.title,
        description: values.description || null,
        poster_url: values.posterUrl || null,
        banner_url: values.bannerUrl || null,
        duration_minutes: values.durationMinutes,
        intermission_duration: values.intermissionDuration,
        genre: values.genre || null,
        status: values.status || 'upcoming',
        playwright: values.playwright || null,
        director: values.director || null,
        opening_night: values.openingNight || null,
        closing_night: values.closingNight || null,
        age_advisory: values.ageAdvisory || null,
        cast: values.cast || null,
        total_tickets_capacity: values.totalTicketsCapacity,
      };

      const wasEditing = !!editingMovie;
      let movieId: string = editingMovie?.id ?? '';

      // CREATE needs the parent row inserted up front so we have an id for the
      // image paths and showtime rows. EDIT defers its column update to the end
      // (after a successful, safety-checked reconcile) so that a blocked
      // deletion leaves the show — dates included — completely untouched.
      if (!wasEditing) {
        const { data, error: insertError } = await supabase.from('productions').insert(basePayload).select('id').single();
        if (insertError) throw insertError;
        movieId = data.id;
      }

      const imageUpdates: Record<string, string> = {};
      if (values.posterFile) imageUpdates.poster_url = await uploadMovieImage(movieId, 'poster', values.posterFile);
      if (values.bannerFile) imageUpdates.banner_url = await uploadMovieImage(movieId, 'banner', values.bannerFile);

      // Keep showtimes in step with the run's date range. CREATE generates the
      // whole run; EDIT reconciles — adding only new dates and deleting only
      // dropped ones (and refusing to delete dates that have active bookings).
      // Skipped on an edit that didn't move the dates, or a show with no run.
      const origOpening = editingMovie?.opening_night ? toDateValue(editingMovie.opening_night) : '';
      const origClosing = editingMovie?.closing_night ? toDateValue(editingMovie.closing_night) : '';
      const datesChanged = values.openingNight !== origOpening || values.closingNight !== origClosing;

      let reconcile: ReconcileResult | null = null;
      if (values.openingNight && values.closingNight && values.defaultTicketPrice != null && (!wasEditing || datesChanged)) {
        reconcile = await reconcileShowtimes(
          movieId,
          values.openingNight,
          values.closingNight,
          values.defaultShowtime,
          values.defaultTicketPrice,
        );
      }

      // Persist parent columns. EDIT writes base + image fields together now
      // (the reconcile above already succeeded); CREATE only patches image URLs.
      if (wasEditing) {
        const { error: updateError } = await supabase.from('productions').update({ ...basePayload, ...imageUpdates }).eq('id', movieId);
        if (updateError) throw updateError;
      } else if (Object.keys(imageUpdates).length > 0) {
        const { error: imgError } = await supabase.from('productions').update(imageUpdates).eq('id', movieId);
        if (imgError) throw imgError;
      }

      const reconcileSummary = reconcile
        ? [
            reconcile.added ? `${reconcile.added} added` : null,
            reconcile.deleted ? `${reconcile.deleted} removed` : null,
          ].filter(Boolean).join(' · ')
        : '';

      closeForm();
      await loadMovies();
      onMoviesChanged();
      showModal({
        title: wasEditing ? 'Show updated' : 'Show added',
        message: reconcileSummary ? `Showtimes: ${reconcileSummary}.` : undefined,
        variant: 'success',
      });
    } catch (err: any) {
      logger.error('Failed to save show:', err);
      showModal({ title: 'Failed to save show', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: deleteError } = await supabase.from('productions').delete().eq('id', deleteTarget.id);
      if (deleteError) throw deleteError;
      setDeleteTarget(null);
      await loadMovies();
      onMoviesChanged();
      showModal({ title: 'Show deleted', variant: 'success' });
    } catch (err: any) {
      logger.error('Failed to delete show:', err);
      showModal({ title: 'Failed to delete show', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={mc.backdrop}>
        <View style={mc.card}>
          <View style={mc.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={mc.headTitle}>Shows</Text>
              <Text style={mc.headSub}>Create, edit, and remove productions shown on the public site.</Text>
            </View>
            <TouchableOpacity style={mc.addBtn} onPress={openCreate} activeOpacity={0.85}>
              <Text style={mc.addBtnText}>+ Add show</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mc.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Icon name="close" size={18} color={B.txt2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={mc.list} showsVerticalScrollIndicator={false}>
            {loading ? (
              <LoadingState label="Loading shows…" />
            ) : error ? (
              <Text style={[um.empty, { color: B.red }]}>{error}</Text>
            ) : movies.length === 0 ? (
              <EmptyState
                icon="film-outline"
                title="No shows yet"
                subtitle="Add a show so it appears on the homepage."
                actionLabel="+ Add show"
                onAction={openCreate}
              />
            ) : (
              movies.map((m, i) => {
                const badge = STATUS_BADGE_STYLE[m.status ?? 'upcoming'] ?? STATUS_BADGE_STYLE.upcoming;
                return (
                  <View key={m.id} style={[mc.row, i % 2 === 1 && s.tRowAlt]}>
                    <View style={mc.posterThumbWrap}>
                      {m.poster_url ? (
                        <Image source={{ uri: m.poster_url }} style={mc.posterThumb} resizeMode="cover" />
                      ) : (
                        <View style={[mc.posterThumb, mc.posterPlaceholder]}>
                          <Icon name="film-outline" size={14} color={B.txtMu} />
                        </View>
                      )}
                    </View>
                    <View style={mc.rowInfo}>
                      <Text style={mc.rowTitle} numberOfLines={1}>{m.title}</Text>
                      <Text style={mc.rowMeta} numberOfLines={1}>
                        {m.genre || 'No genre'}
                        {m.playwright ? ` · by ${m.playwright}` : ''}
                        {m.opening_night ? ` · opens ${new Date(m.opening_night).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                      </Text>
                    </View>
                    <View style={[mc.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[mc.statusBadgeText, { color: badge.color }]}>
                        {(m.status ?? 'upcoming').replace('_', ' ')}
                      </Text>
                    </View>
                    <View style={mc.actionsCell}>
                      <TouchableOpacity style={st.editBtn} onPress={() => openEdit(m)} activeOpacity={0.8}>
                        <Text style={st.editBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={st.deleteBtn} onPress={() => setDeleteTarget(m)} activeOpacity={0.8}>
                        <Text style={st.deleteBtnText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>

      <MovieFormModal
        key={editingMovie?.id ?? 'new'}
        visible={formVisible}
        editing={editingMovie}
        submitting={submitting}
        onClose={closeForm}
        onSubmit={handleSubmitForm}
      />

      <ConfirmModal
        visible={!!deleteTarget}
        title="Delete this show?"
        message={
          deleteTarget
            ? `This will permanently remove "${deleteTarget.title}" and ALL of its showtimes. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </Modal>
  );
};

export const mc = createStyles({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,5,25,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 720,
    maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 10, overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 22, borderBottomWidth: 1, borderBottomColor: B.border,
  },
  headTitle: { fontSize: 18, fontWeight: '800', color: B.txt },
  headSub: { fontSize: 12, color: B.txt2, marginTop: 3 },
  addBtn: { backgroundColor: B.red, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  closeBtn: { padding: 6 },
  list: { padding: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8,
  },
  posterThumbWrap: {},
  posterThumb: { width: 38, height: 52, borderRadius: 6, backgroundColor: B.border },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1.6, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: '700', color: B.txt },
  rowMeta: { fontSize: 11, color: B.txtMu, marginTop: 3 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  actionsCell: { flexDirection: 'row', gap: 8 },
});
