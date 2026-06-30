import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, Modal,
  useWindowDimensions, Image, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useAppModal } from '../../components/ModalProvider';
import ConfirmModal from '../../components/ConfirmModal';
import type { OnNavigate } from '../../types/navigation';

// ── BRAND TOKENS ───────────────────────────────────────
const B = {
  navy:    '#12122a',
  navyDp:  '#0d0d1a',
  red:     '#C8102E',
  gold:    '#c9a84c',
  white:   '#fff',
  bg:      '#f0f2f5',
  border:  '#eaeaea',
  txt:     '#0f0e2a',
  txt2:    '#6b7280',
  txtMu:   '#9ca3af',
  green:   '#16a34a',
  greenBg: '#dcfce7',
  amber:   '#d97706',
  amberBg: '#fef3c7',
  rose:    '#dc2626',
  roseBg:  '#fee2e2',
  blue:    '#2563eb',
  blueBg:  '#dbeafe',
  purple:  '#7c3aed',
  purpleBg:'#ede9fe',
};

// ── TYPES ──────────────────────────────────────────────
type Props = { onNavigate: OnNavigate };
type ProfileRow = { id: string; full_name: string | null; email: string | null; role: string | null };
type ProductionOption = { id: string; title: string; poster_url: string | null };
type ShowtimeRow = {
  id: string;
  production_id: string;
  start_time: string;
  price: number;
  available_seats: number;
  productions: { title: string } | null;
};
type ProductionRow = {
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
  created_at: string;
};

const MOVIE_STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'now_showing', label: 'Now Showing' },
  { value: 'archived', label: 'Archived' },
];

// ── SIDEBAR NAV ────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview',   label: 'Overview',   icon: 'grid-outline' },
  { id: 'showtimes',  label: 'Showtimes',  icon: 'time-outline' },
  { id: 'boxoffice',  label: 'Box Office', icon: 'cart-outline' },
  { id: 'seatmap',    label: 'Seat Map',   icon: 'apps-outline' },
  { id: 'users',      label: 'Users',      icon: 'people-outline' },
  { id: 'settings',   label: 'Settings',   icon: 'settings-outline' },
];

// ── RAW WEB INPUTS (datetime-local / select have no RN equivalent; this
// app ships web-only, so render real DOM elements via createElement
// instead of pulling in a native-only picker library). ──
const webInputStyle = {
  border: 'none', outline: 'none', background: 'transparent',
  fontSize: 14, width: '100%', fontFamily: 'inherit', color: '#0f0e2a', padding: 0,
} as any;

const WebDateInput = ({ value, onChange, min }: {
  value: string; onChange: (v: string) => void; min?: string;
}) => React.createElement('input', {
  type: 'date',
  value,
  min,
  onChange: (e: any) => onChange(e.target.value),
  style: webInputStyle,
});

const WebTimeInput = ({ value, onChange }: {
  value: string; onChange: (v: string) => void;
}) => React.createElement('input', {
  type: 'time',
  value,
  onChange: (e: any) => onChange(e.target.value),
  style: webInputStyle,
});

const WebSelect = ({ value, onChange, options, placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) => React.createElement(
  'select',
  { value, onChange: (e: any) => onChange(e.target.value), style: webInputStyle, disabled },
  [
    React.createElement('option', { value: '', key: '__placeholder', disabled: true }, placeholder ?? 'Select…'),
    ...options.map(o => React.createElement('option', { value: o.value, key: o.value }, o.label)),
  ]
);

// Local Y-M-D / H-m strings (the formats <input type="date"> and
// <input type="time"> read and write) built from the Date object's LOCAL
// getters, so they round-trip the theater's wall-clock time rather than
// shifting on conversion.
const toDateValue = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const toTimeValue = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Auto-generated showtimes default to the full house. The auditorium is a fixed
// 100-seat grid (see venue_seats), matching the ShowtimeFormModal default.
const VENUE_SEAT_COUNT = 100;

// Every calendar day in [startYmd, endYmd] inclusive, returned as 'YYYY-MM-DD'
// strings. We parse each bound as a LOCAL date pinned to midday and step with
// setDate, so the day count never drifts across a UTC offset or DST boundary —
// July 11→14 yields exactly ['…-11','…-12','…-13','…-14'], never a phantom
// July 10 from a midnight-UTC rollback. Inputs are the wall-clock date strings
// produced by WebDateInput, so no timezone conversion is involved here.
const eachDateInRange = (startYmd: string, endYmd: string): string[] => {
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

// ── SHOWTIME RECONCILIATION (editing a run's date range) ───
// Brings the showtimes table in line with a production's new [start, end] run
// WITHOUT destroy-and-recreate. A showtime whose date is still in range is left
// exactly as it is — so its sold tickets / bookings survive untouched. Only
// genuinely NEW dates are inserted, and only dates that fell OUT of range are
// deleted. Dates are compared strictly as local YYYY-MM-DD (time stripped via
// toDateValue), so an 8 PM curtain never reads as a different day and no UTC
// offset can shift a date across midnight.
type ReconcileResult = { added: number; deleted: number };

const reconcileShowtimes = async (
  movieId: string,
  newStartDate: string,   // 'YYYY-MM-DD'
  newEndDate: string,     // 'YYYY-MM-DD'
  defaultTime: string,    // 'HH:mm'
  defaultPrice: number,
): Promise<ReconcileResult> => {
  // Step 1 — every existing showtime for this production.
  const { data: existing, error: fetchError } = await supabase
    .from('showtimes')
    .select('id, start_time')
    .eq('production_id', movieId);
  if (fetchError) throw fetchError;
  const rows = existing ?? [];

  // Step 2 — every calendar date the new range should cover.
  const validDates = new Set(eachDateInRange(newStartDate, newEndDate));

  // Step 3 — the set of dates that already have a showtime.
  const existingDates = new Set(rows.map(r => toDateValue(r.start_time)));

  // Step 4 — in-range dates with no showtime yet → these get inserted.
  const datesToAdd = Array.from(validDates).filter(d => !existingDates.has(d));

  // Step 5 — existing showtimes now outside the range → these get deleted.
  const showtimesToDelete = rows.filter(r => !validDates.has(toDateValue(r.start_time)));

  // PART 3 SAFETY — never delete a performance that has tickets sold. Exactly
  // one bookings row exists per sale (online 'confirmed' + box office 'paid');
  // admin seat HOLDS live only in booking_seats and are safe to drop, so we
  // gate on bookings, not booking_seats.
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

  // Bulk-insert the new dates at the default curtain time + price.
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

  // Delete the dropped dates by id.
  if (showtimesToDelete.length > 0) {
    const deleteIds = showtimesToDelete.map(r => r.id);
    const { error: deleteError } = await supabase.from('showtimes').delete().in('id', deleteIds);
    if (deleteError) throw deleteError;
  }

  return { added: datesToAdd.length, deleted: showtimesToDelete.length };
};

// ── SHOWTIME FORM VALIDATION ───────────────────────────
const validateMovieField = (movieId: string): string | null => {
  if (!movieId) return 'Please select a movie.';
  return null;
};
const validateStartFields = (dateStr: string, timeStr: string): string | null => {
  if (!dateStr || !timeStr) return 'Date and time are both required.';
  const ms = new Date(`${dateStr}T${timeStr}`).getTime();
  if (Number.isNaN(ms)) return 'Please enter a valid date & time.';
  if (ms <= Date.now()) return 'Start time must be in the future.';
  return null;
};
const validatePriceField = (value: string): string | null => {
  if (!value.trim()) return 'Price is required.';
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return 'Price must be a number 0 or greater.';
  return null;
};
const validateSeatsField = (value: string): string | null => {
  if (!value.trim()) return 'Available seats is required.';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return 'Seats must be a whole number 0 or greater.';
  return null;
};
const validateDefaultShowtimeField = (value: string): string | null => {
  if (!value.trim()) return 'A daily showtime is required to schedule the run.';
  return null;
};

// ── MOVIE FORM VALIDATION ──────────────────────────────
const validateMovieTitleField = (value: string): string | null => {
  if (!value.trim()) return 'Title is required.';
  return null;
};
const validateMovieDurationField = (value: string): string | null => {
  if (!value.trim()) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return 'Duration must be a whole number of minutes greater than 0.';
  return null;
};
const validateRunDateField = (value: string, label: string): string | null => {
  if (!value.trim()) return null;
  if (Number.isNaN(new Date(value).getTime())) return `Please enter a valid ${label}.`;
  return null;
};
const validateRunDates = (opening: string, closing: string): string | null => {
  if (!opening.trim() || !closing.trim()) return null;
  if (new Date(closing).getTime() < new Date(opening).getTime()) {
    return 'Closing night cannot be before opening night.';
  }
  return null;
};
const validateIntermissionField = (value: string): string | null => {
  if (!value.trim()) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return 'Intermission must be a whole number of minutes 0 or greater.';
  return null;
};
const MAX_MOVIE_IMAGE_BYTES = 5 * 1024 * 1024;
const validateMovieImageFile = (file: any): string | null => {
  if (!file.type || !file.type.startsWith('image/')) return 'Please choose an image file.';
  if (file.size > MAX_MOVIE_IMAGE_BYTES) return 'Image must be 5 MB or smaller.';
  return null;
};

const Sidebar = ({ active, onSelect, adminName }: {
  active: string;
  onSelect: (id: string) => void;
  adminName: string;
}) => (
  <View style={sb.wrap}>
    <View style={sb.brand}>
      <Image source={require('../../assets/SLS-175-Years-Logo-_r4_.png')} style={sb.brandLogo} resizeMode="contain" />
      <Text style={sb.brandName}>Mamiya Theater</Text>
    </View>

    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      {NAV_ITEMS.map(item => {
        const isActive = active === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            style={[sb.item, isActive && sb.itemActive]}
            onPress={() => onSelect(item.id)}
            activeOpacity={0.75}
          >
            <Icon name={item.icon} size={18} color={isActive ? '#fff' : 'rgba(255,255,255,0.55)'} style={sb.icon} />
            <Text style={[sb.lbl, isActive && sb.lblActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>

    <View style={sb.div} />

    <View style={sb.user}>
      <View style={sb.avatar}><Text style={sb.avatarTxt}>{adminName.charAt(0).toUpperCase()}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={sb.userName} numberOfLines={1}>{adminName}</Text>
        <Text style={sb.userRole}>Admin Role</Text>
      </View>
    </View>
  </View>
);

const sb = StyleSheet.create({
  wrap:        { width: 210, backgroundColor: '#0d1b2a', flexDirection: 'column', height: '100%' },
  brand:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  brandLogo:   { width: 32, height: 32 },
  brandName:   { color: '#fff', fontWeight: '800', fontSize: 14 },
  item:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 20, marginBottom: 2 },
  itemActive:  { backgroundColor: B.red, borderRadius: 8, marginHorizontal: 10, paddingHorizontal: 10 },
  icon:        { width: 24, textAlign: 'center' },
  lbl:         { flex: 1, color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '500' },
  lblActive:   { color: '#fff', fontWeight: '700' },
  div:         { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 20, marginBottom: 14 },
  user:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 22 },
  avatar:      { width: 36, height: 36, borderRadius: 18, backgroundColor: B.red, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:   { color: '#fff', fontSize: 12, fontWeight: '800' },
  userName:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  userRole:    { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
});

const PageHeader = ({ title, subtitle, actionLabel, onAction }: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <View style={s.pageHead}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.pageHeadTitle}>{title}</Text>
      <Text style={s.pageHeadSub}>{subtitle}</Text>
    </View>
    {!!actionLabel && !!onAction && (
      <TouchableOpacity style={s.pageHeadBtn} onPress={onAction} activeOpacity={0.85}>
        <Text style={s.pageHeadBtnText}>{actionLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ── SHARED: LOADING / EMPTY STATES ─────────────────────
const LoadingState = ({ label }: { label?: string }) => (
  <View style={es.loadingWrap}>
    <ActivityIndicator color={B.red} />
    {!!label && <Text style={es.loadingLabel}>{label}</Text>}
  </View>
);

const EmptyState = ({ icon, title, subtitle, actionLabel, onAction }: {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <View style={es.wrap}>
    <View style={es.iconWrap}><Icon name={icon} size={24} color={B.red} /></View>
    <Text style={es.title}>{title}</Text>
    {!!subtitle && <Text style={es.subtitle}>{subtitle}</Text>}
    {!!actionLabel && !!onAction && (
      <TouchableOpacity style={es.actionBtn} onPress={onAction} activeOpacity={0.85}>
        <Text style={es.actionBtnText}>{actionLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

const es = StyleSheet.create({
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  loadingLabel: { fontSize: 12, color: B.txtMu },
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: B.bg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontSize: 14, fontWeight: '700', color: B.txt, marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 12, color: B.txtMu, textAlign: 'center', marginBottom: 18, maxWidth: 320 },
  actionBtn: { backgroundColor: B.red, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});

// ── OVERVIEW / DASHBOARD ───────────────────────────────
const formatMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatInt = (n: number) => n.toLocaleString();

// ── DATE FILTER ────────────────────────────────────────
// The preset toggle + custom range produce an inclusive [start, end] window
// (YYYY-MM-DD) held in OverviewPanel state. It is the exact shape the dashboard
// RPCs expect and will feed them next step — supabase.rpc('get_dashboard_kpis',
// { start_date, end_date }) and friends. Presets are rolling windows anchored
// to today, so the trend label reads naturally ("from last week").
type DatePreset = 'day' | 'week' | 'month' | 'year';
const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'day',   label: 'Day' },
  { id: 'week',  label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year',  label: 'Year' },
];
const TREND_NOTE: Record<DatePreset | 'custom', string> = {
  day: 'from yesterday', week: 'from last week', month: 'from last month',
  year: 'from last year', custom: 'vs previous period',
};
const toYmd = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const presetRange = (preset: DatePreset): { start: string; end: string } => {
  const end = new Date();
  const start = new Date();
  const back = preset === 'day' ? 0 : preset === 'week' ? 6 : preset === 'month' ? 29 : 364;
  start.setDate(start.getDate() - back);
  return { start: toYmd(start), end: toYmd(end) };
};

const DateFilter = ({ preset, range, onPreset, onStart, onEnd }: {
  preset: DatePreset | 'custom';
  range: { start: string; end: string };
  onPreset: (p: DatePreset) => void;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) => (
  <View style={ov.filterBar}>
    <View style={ov.toggleGroup}>
      {DATE_PRESETS.map(p => {
        const active = preset === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            style={[ov.toggleBtn, active && ov.toggleBtnActive]}
            onPress={() => onPreset(p.id)}
            activeOpacity={0.8}
          >
            <Text style={[ov.toggleTxt, active && ov.toggleTxtActive]}>{p.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
    <View style={[ov.rangeWrap, preset === 'custom' && ov.rangeWrapActive]}>
      <Icon name="calendar-outline" size={14} color={B.txt2} style={ov.rangeIcon} />
      <View style={ov.rangeInput}><WebDateInput value={range.start} onChange={onStart} /></View>
      <Text style={ov.rangeDash}>–</Text>
      <View style={ov.rangeInput}><WebDateInput value={range.end} onChange={onEnd} /></View>
    </View>
  </View>
);

// ── KPI CARD ───────────────────────────────────────────
// The bar strip is a PLACEHOLDER sparkline driven by mock numbers — it only
// establishes the visual slot. Real per-day points come from
// supabase.rpc('get_sales_timeseries', …) when the cards are wired up.
const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
  const max = Math.max(...data, 1);
  return (
    <View style={ov.sparkWrap}>
      {data.map((v, i) => (
        <View
          key={i}
          style={[ov.sparkBar, { height: `${Math.max(10, (v / max) * 100)}%` as any, backgroundColor: color, opacity: 0.3 + 0.6 * (v / max) }]}
        />
      ))}
    </View>
  );
};

const KpiCard = ({ label, value, icon, color, bg, trend, note, spark, stack }: {
  label: string;
  value: string;
  icon: string;
  color: string;
  bg: string;
  trend: { pct: number; dir: 'up' | 'down' };
  note: string;
  spark: number[];
  stack: boolean;
}) => {
  const up = trend.dir === 'up';
  return (
    <View style={[ov.kpiCard, stack && ov.kpiCardStack]}>
      <View style={ov.kpiTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={ov.kpiLabel}>{label}</Text>
          <Text style={ov.kpiValue} numberOfLines={1}>{value}</Text>
        </View>
        <View style={[ov.kpiIcon, { backgroundColor: bg }]}>
          <Icon name={icon} size={18} color={color} />
        </View>
      </View>
      <View style={ov.kpiTrendRow}>
        <View style={[ov.trendPill, { backgroundColor: up ? B.greenBg : B.roseBg }]}>
          <Icon name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? B.green : B.rose} />
          <Text style={[ov.trendTxt, { color: up ? B.green : B.rose }]}>{Math.abs(trend.pct)}%</Text>
        </View>
        <Text style={ov.kpiTrendNote} numberOfLines={1}>{note}</Text>
      </View>
      <Sparkline data={spark} color={color} />
    </View>
  );
};

// MOCK dashboard metrics — swapped for RPC results next step. get_dashboard_kpis
// returns revenue/tickets/projected only, so occupancy comes from its own source.
const MOCK_KPIS = { sales: 12480.5, tickets: 842, projected: 38650, occupancyPct: 78 };
const MOCK_SPARK = {
  sales:     [4, 6, 5, 8, 7, 9, 12],
  tickets:   [20, 28, 24, 33, 30, 38, 42],
  projected: [30, 28, 32, 31, 35, 34, 38],
  occupancy: [60, 64, 62, 70, 68, 74, 78],
};

type RecentBooking = {
  id: string;
  movie_title: string | null;
  num_tickets: number;
  total_price: number;
  status: string;
  created_at: string;
};

const OverviewPanel = ({ adminName }: { adminName: string }) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [preset, setPreset] = useState<DatePreset | 'custom'>('week');
  const [range, setRange] = useState(() => presetRange('week'));
  const [recent, setRecent] = useState<RecentBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showsVisible, setShowsVisible] = useState(false);

  const selectPreset = (p: DatePreset) => { setPreset(p); setRange(presetRange(p)); };
  const onStart = (v: string) => { setPreset('custom'); setRange(r => ({ ...r, start: v })); };
  const onEnd   = (v: string) => { setPreset('custom'); setRange(r => ({ ...r, end: v })); };

  // Only Recent Activity is wired to real data for now; the KPI cards use mock
  // metrics until supabase.rpc('get_dashboard_kpis', { start_date, end_date }) —
  // and the occupancy source — are hooked up to the date range above.
  const loadRecent = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('bookings')
        .select('id, movie_title, num_tickets, total_price, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      if (fetchError) throw fetchError;
      setRecent((data as any) ?? []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load recent bookings:', err);
      setError(err.message ?? 'Failed to load recent bookings.');
    }
  };

  useEffect(() => {
    loadRecent();
  }, []);

  const kpis = [
    { key: 'sales',     label: 'Total Sales',     value: formatMoney(MOCK_KPIS.sales),     icon: 'cash-outline',        color: B.green,  bg: B.greenBg,  trend: { pct: 12.5, dir: 'up' as const },   spark: MOCK_SPARK.sales },
    { key: 'tickets',   label: 'Tickets Sold',    value: formatInt(MOCK_KPIS.tickets),     icon: 'ticket-outline',      color: B.blue,   bg: B.blueBg,   trend: { pct: 8.2,  dir: 'up' as const },   spark: MOCK_SPARK.tickets },
    { key: 'projected', label: 'Projected Sales', value: formatMoney(MOCK_KPIS.projected), icon: 'trending-up-outline', color: B.purple, bg: B.purpleBg, trend: { pct: 3.1,  dir: 'down' as const }, spark: MOCK_SPARK.projected },
    { key: 'occupancy', label: 'Avg Occupancy',   value: `${MOCK_KPIS.occupancyPct}%`,     icon: 'people-outline',      color: B.amber,  bg: B.amberBg,  trend: { pct: 5.0,  dir: 'up' as const },   spark: MOCK_SPARK.occupancy },
  ];

  return (
    <>
      <View style={ov.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.pageHeadTitle}>Welcome, {adminName}</Text>
          <Text style={s.pageHeadSub}>Here's how Mamiya Theater is performing.</Text>
        </View>
        <TouchableOpacity style={s.pageHeadBtn} onPress={() => setShowsVisible(true)} activeOpacity={0.85}>
          <Text style={s.pageHeadBtnText}>Manage Shows</Text>
        </TouchableOpacity>
      </View>

      <DateFilter preset={preset} range={range} onPreset={selectPreset} onStart={onStart} onEnd={onEnd} />

      <View style={ov.kpiGrid}>
        {kpis.map(k => (
          <KpiCard
            key={k.key}
            label={k.label}
            value={k.value}
            icon={k.icon}
            color={k.color}
            bg={k.bg}
            trend={k.trend}
            note={TREND_NOTE[preset]}
            spark={k.spark}
            stack={!isDesktop}
          />
        ))}
      </View>

      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>Recent Activity</Text>
        </View>
        {error ? (
          <Text style={[um.empty, { color: B.red }]}>{error}</Text>
        ) : recent === null ? (
          <LoadingState label="Loading recent bookings…" />
        ) : recent.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No bookings yet"
            subtitle="Ticket sales will show up here as they come in."
          />
        ) : (
          <>
            <View style={s.tHead}>
              {[
                { lbl: 'PRODUCTION', f: 1.6 }, { lbl: 'TICKETS', f: 0.7 }, { lbl: 'AMOUNT', f: 0.8 },
                { lbl: 'STATUS', f: 0.8 }, { lbl: 'WHEN', f: 1.1 },
              ].map(h => (<Text key={h.lbl} style={[s.th, { flex: h.f }]}>{h.lbl}</Text>))}
            </View>
            {recent.map((b, i) => {
              const d = new Date(b.created_at);
              return (
                <View key={b.id} style={[s.tRow, i % 2 === 1 && s.tRowAlt]}>
                  <Text style={[s.td, { flex: 1.6 }]} numberOfLines={1}>{b.movie_title ?? 'Untitled production'}</Text>
                  <Text style={[s.td, { flex: 0.7 }]}>{b.num_tickets}</Text>
                  <Text style={[s.td, s.tdBold, { flex: 0.8 }]}>{formatMoney(Number(b.total_price))}</Text>
                  <Text style={[s.td, s.tdMuted, { flex: 0.8 }]} numberOfLines={1}>{b.status}</Text>
                  <Text style={[s.td, s.tdMuted, { flex: 1.1 }]} numberOfLines={1}>
                    {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' · '}
                    {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </View>

      <MoviesManagerModal
        visible={showsVisible}
        onClose={() => setShowsVisible(false)}
        onMoviesChanged={loadRecent}
      />
    </>
  );
};

const ov = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 },

  // DATE FILTER TOOLBAR
  filterBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 26 },
  toggleGroup:   { flexDirection: 'row', backgroundColor: B.white, borderRadius: 10, borderWidth: 1, borderColor: B.border, padding: 4, gap: 2 },
  toggleBtn:     { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 7 },
  toggleBtnActive: { backgroundColor: B.navy },
  toggleTxt:     { fontSize: 12.5, fontWeight: '700', color: B.txt2 },
  toggleTxtActive: { color: '#fff' },
  rangeWrap:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: B.white, borderRadius: 10, borderWidth: 1, borderColor: B.border, paddingHorizontal: 12, paddingVertical: 9 },
  rangeWrapActive: { borderColor: B.red },
  rangeIcon:     { marginRight: 2 },
  rangeInput:    { minWidth: 118 },
  rangeDash:     { color: B.txtMu, fontSize: 13, fontWeight: '700' },

  // KPI CARDS
  kpiGrid:       { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginBottom: 28 },
  kpiCard:       { flexGrow: 1, flexBasis: 0, minWidth: 220, backgroundColor: B.white, borderRadius: 14, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  kpiCardStack:  { minWidth: '100%', flexBasis: '100%' },
  kpiTop:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  kpiLabel:      { fontSize: 10.5, fontWeight: '700', color: B.txtMu, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  kpiValue:      { fontSize: 26, fontWeight: '800', color: B.txt, letterSpacing: -0.5 },
  kpiIcon:       { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  kpiTrendRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  trendPill:     { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  trendTxt:      { fontSize: 11, fontWeight: '800' },
  kpiTrendNote:  { fontSize: 11, color: B.txtMu, flexShrink: 1 },
  sparkWrap:     { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 36 },
  sparkBar:      { flex: 1, borderRadius: 2, minHeight: 3 },
});

// ── USER MANAGEMENT ───────────────────────────────────
const UserManagementPanel = () => {
  const { showModal } = useAppModal();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .order('email', { ascending: true });
      if (fetchError) throw fetchError;
      setUsers(data ?? []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setError(err.message ?? 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSetRole = async (targetUserId: string, newRole: 'user' | 'admin') => {
    try {
      setActionId(targetUserId);
      const { error: rpcError } = await supabase.rpc('set_user_role', {
        target_user_id: targetUserId,
        new_role: newRole,
      });
      if (rpcError) throw rpcError;
      await loadUsers();
      showModal({
        title: 'Role updated',
        message: `User is now ${newRole === 'admin' ? 'an admin' : 'a standard user'}.`,
        variant: 'success',
      });
    } catch (err: any) {
      console.error('Failed to update role:', err);
      showModal({ title: 'Failed to update role', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setActionId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Manage roles and permissions for registered accounts."
        actionLabel="Refresh"
        onAction={loadUsers}
      />
      <View style={s.card}>
      {loading ? (
        <LoadingState label="Loading users…" />
      ) : error ? (
        <Text style={[um.empty, { color: B.red }]}>{error}</Text>
      ) : users.length === 0 ? (
        <EmptyState icon="people-outline" title="No users found" />
      ) : (
        users.map((u, i) => {
          const isUserAdmin = u.role === 'admin';
          const busy = actionId === u.id;
          return (
            <View key={u.id} style={[um.row, i % 2 === 1 && s.tRowAlt]}>
              <View style={um.info}>
                <Text style={um.name} numberOfLines={1}>{u.full_name?.trim() || u.email || u.id}</Text>
                <Text style={um.email} numberOfLines={1}>{u.email}</Text>
              </View>
              <View style={[um.roleBadge, isUserAdmin ? um.roleBadgeAdmin : um.roleBadgeUser]}>
                <Text style={[um.roleBadgeTxt, isUserAdmin ? um.roleBadgeTxtAdmin : um.roleBadgeTxtUser]}>
                  {u.role ?? 'user'}
                </Text>
              </View>
              <TouchableOpacity
                style={[um.actionBtn, busy && um.actionBtnDisabled]}
                disabled={busy}
                onPress={() => handleSetRole(u.id, isUserAdmin ? 'user' : 'admin')}
                activeOpacity={0.8}
              >
                <Text style={um.actionBtnTxt}>
                  {busy ? '...' : isUserAdmin ? 'Demote to User' : 'Promote to Admin'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
      </View>
    </>
  );
};

const um = StyleSheet.create({
  empty: { fontSize: 13, color: B.txtMu, paddingVertical: 20, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: 7,
  },
  info: { flex: 1.4, minWidth: 0 },
  name: { fontSize: 13, fontWeight: '700', color: B.txt },
  email: { fontSize: 11, color: B.txtMu, marginTop: 2 },
  roleBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  roleBadgeAdmin: { backgroundColor: B.roseBg },
  roleBadgeUser: { backgroundColor: B.bg },
  roleBadgeTxt: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  roleBadgeTxtAdmin: { color: B.red },
  roleBadgeTxtUser: { color: B.txt2 },
  actionBtn: { backgroundColor: B.navy, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8 },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

// ── CHANGE PASSWORD ────────────────────────────────────
const validateNewPassword = (value: string): string | null => {
  if (value.length < 8) return 'Password must be at least 8 characters.';
  return null;
};

const ChangePasswordPanel = () => {
  const { showModal } = useAppModal();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  const validateConfirm = (value: string, against: string): string | null => {
    if (value !== against) return 'Passwords do not match.';
    return null;
  };

  const handleNewPasswordChange = (text: string) => {
    setNewPassword(text);
    if (newPasswordError && !validateNewPassword(text)) setNewPasswordError(null);
    if (confirmPasswordError && !validateConfirm(confirmPassword, text)) setConfirmPasswordError(null);
  };
  const handleNewPasswordBlur = () => setNewPasswordError(validateNewPassword(newPassword));

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    if (confirmPasswordError && !validateConfirm(text, newPassword)) setConfirmPasswordError(null);
  };
  const handleConfirmPasswordBlur = () => setConfirmPasswordError(validateConfirm(confirmPassword, newPassword));

  const handleSubmit = async () => {
    const newPasswordErr = validateNewPassword(newPassword);
    const confirmPasswordErr = validateConfirm(confirmPassword, newPassword);
    setNewPasswordError(newPasswordErr);
    setConfirmPasswordError(confirmPasswordErr);
    if (newPasswordErr || confirmPasswordErr) return;

    try {
      setSubmitting(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      showModal({ title: 'Password updated', message: 'Your password has been changed.', variant: 'success' });
    } catch (err: any) {
      console.error('Failed to update password:', err);
      showModal({ title: 'Failed to update password', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage your account and security preferences."
      />
      <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>Change Password</Text>
      </View>

      <View style={cp.fieldGroup}>
        <Text style={cp.label}>New password</Text>
        <View style={[cp.inputWrapper, !!newPasswordError && cp.inputError]}>
          <TextInput
            style={cp.input}
            placeholder="Enter a new password"
            placeholderTextColor="#aaa"
            value={newPassword}
            onChangeText={handleNewPasswordChange}
            onBlur={handleNewPasswordBlur}
            secureTextEntry={!showNew}
            editable={!submitting}
          />
          <TouchableOpacity onPress={() => setShowNew(!showNew)}>
            <Icon name={showNew ? 'eye-off-outline' : 'eye-outline'} size={16} color="#888" />
          </TouchableOpacity>
        </View>
        {!!newPasswordError && <Text style={cp.errorText}>{newPasswordError}</Text>}
      </View>

      <View style={cp.fieldGroup}>
        <Text style={cp.label}>Confirm new password</Text>
        <View style={[cp.inputWrapper, !!confirmPasswordError && cp.inputError]}>
          <TextInput
            style={cp.input}
            placeholder="Re-enter the new password"
            placeholderTextColor="#aaa"
            value={confirmPassword}
            onChangeText={handleConfirmPasswordChange}
            onBlur={handleConfirmPasswordBlur}
            secureTextEntry={!showConfirm}
            editable={!submitting}
          />
          <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
            <Icon name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={16} color="#888" />
          </TouchableOpacity>
        </View>
        {!!confirmPasswordError && <Text style={cp.errorText}>{confirmPasswordError}</Text>}
      </View>

      <TouchableOpacity
        style={[cp.submitBtn, submitting && cp.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        <Text style={cp.submitBtnTxt}>{submitting ? 'Updating…' : 'Update Password'}</Text>
      </TouchableOpacity>
      </View>
    </>
  );
};

const cp = StyleSheet.create({
  fieldGroup: { marginBottom: 16, maxWidth: 360 },
  label: {
    color: B.txt2, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: B.bg, borderWidth: 1, borderColor: B.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputError: { borderColor: '#ef4444' },
  input: { flex: 1, color: B.txt, fontSize: 14, outlineStyle: 'none' } as any,
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 5 },
  submitBtn: {
    backgroundColor: B.red, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 24,
    alignItems: 'center', alignSelf: 'flex-start', marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

// ── SHOWTIME FORM MODAL (create / edit) ───────────────
const ShowtimeFormModal = ({ visible, movies, editing, submitting, onClose, onSubmit }: {
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
  const [availableSeats, setAvailableSeats] = useState(editing ? String(editing.available_seats) : '100');

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
            <Text style={fm.label}>Movie</Text>
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

const fm = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,5,25,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 28,
    width: '100%', maxWidth: 520,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 10,
  },
  scrollCard: { width: '100%', maxWidth: 520, maxHeight: '88%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  title: { fontSize: 18, fontWeight: '800', color: B.txt },
  closeBtn: { padding: 4 },
  editingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: B.bg, borderRadius: 10, padding: 12, marginBottom: 18,
  },
  posterThumb: { width: 44, height: 60, borderRadius: 6, backgroundColor: B.border },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  editingMovieTitle: { fontSize: 14, fontWeight: '800', color: B.txt },
  editingSubtitle: { fontSize: 12, color: B.txt2, marginTop: 3 },
  row: { flexDirection: 'row', gap: 14 },
  half: { flex: 1 },
  fieldGroup: { marginBottom: 16 },
  label: { color: B.txt2, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: B.bg, borderWidth: 1, borderColor: B.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputError: { borderColor: '#ef4444' },
  input: { flex: 1, color: B.txt, fontSize: 14, outlineStyle: 'none' } as any,
  textareaWrapper: { alignItems: 'flex-start' },
  textarea: { minHeight: 64, textAlignVertical: 'top' } as any,
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 5 },
  helperText: { fontSize: 11, color: B.txtMu, marginTop: 6 },
  uploadRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  posterPreviewWrap: {
    width: 52, height: 72, borderRadius: 8, backgroundColor: B.bg,
    borderWidth: 1, borderColor: B.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
  },
  bannerPreviewWrap: { width: 96, height: 54 },
  posterPreviewImg: { width: '100%', height: '100%' },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: B.border, borderRadius: 9,
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: B.bg, alignSelf: 'flex-start',
  },
  uploadBtnText: { color: B.red, fontWeight: '700', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: B.bg },
  cancelText: { color: B.txt, fontWeight: '700', fontSize: 14 },
  submitBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: B.red },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ── SHOWTIMES GROUPING (accordion) ─────────────────────
// Auto-generated runs produce one showtime row per day, so a flat table buries
// the schedule. Group the fetched rows by production into one collapsible
// section each, carrying the count and the run's date span for the header.
type ShowtimeGroup = {
  productionId: string;
  title: string;
  showtimes: ShowtimeRow[];   // ascending by start_time
  count: number;
  firstStart: string;
  lastStart: string;
};

const groupShowtimesByProduction = (rows: ShowtimeRow[]): ShowtimeGroup[] => {
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
const formatRunRange = (startIso: string, endIso: string): string => {
  const opts = { month: 'short', day: 'numeric' } as const;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startStr = start.toLocaleDateString(undefined, opts);
  if (start.toDateString() === end.toDateString()) return startStr;
  return `${startStr} – ${end.toLocaleDateString(undefined, opts)}`;
};

// ── SHOWTIMES CRUD ─────────────────────────────────────
const ShowtimesPanel = () => {
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
      console.error('Failed to load showtimes:', err);
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
      console.error('Failed to save showtime:', err);
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
      console.error('Failed to delete showtime:', err);
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

const st = StyleSheet.create({
  tRowHighlight: { backgroundColor: B.amberBg },
  actionsCell: { flexDirection: 'row', gap: 8 },
  editBtn: { backgroundColor: B.bg, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText: { color: B.txt, fontSize: 11, fontWeight: '700' },
  deleteBtn: { backgroundColor: B.roseBg, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnText: { color: B.red, fontSize: 11, fontWeight: '700' },

  // ACCORDION (grouped showtimes)
  accGroup: { borderWidth: 1, borderColor: B.border, borderRadius: 10, marginBottom: 10, overflow: 'hidden' },
  accHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: B.white },
  accHeaderOpen: { backgroundColor: B.bg, borderBottomWidth: 1, borderBottomColor: B.border },
  accChevron: { width: 18, textAlign: 'center' },
  accTitle: { fontSize: 14, fontWeight: '800', color: B.txt },
  accMeta: { fontSize: 12, color: B.txt2, marginTop: 2 },
  accCountPill: { backgroundColor: B.navy, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  accCountPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  accBody: { paddingHorizontal: 14, paddingBottom: 10 },
});

const pickImageFile = (onSelected: (file: any) => void) => {
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

type MovieFormValues = {
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
  // Curtain time + price applied to any showtimes generated for the run — every
  // day on CREATE, and only newly added days when an EDIT extends the range.
  // defaultTicketPrice is null when no run is scheduled.
  defaultShowtime: string;
  defaultTicketPrice: number | null;
  posterFile: any | null;
  bannerFile: any | null;
};

const MovieFormModal = ({ visible, editing, submitting, onClose, onSubmit }: {
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
    const runErr = validateRunDateField(openingNight, 'opening night')
      ?? validateRunDateField(closingNight, 'closing night')
      ?? validateRunDates(openingNight, closingNight);
    const stErr = willGenerateShowtimes ? validateDefaultShowtimeField(defaultShowtime) : null;
    const dpErr = willGenerateShowtimes ? validatePriceField(defaultTicketPrice) : null;
    setTitleError(tErr);
    setDurationError(dErr);
    setIntermissionError(iErr);
    setRunDatesError(runErr);
    setDefaultShowtimeError(stErr);
    setDefaultPriceError(dpErr);
    if (tErr || dErr || iErr || runErr || stErr || dpErr) return;

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
                placeholder="Movie title"
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
const STATUS_BADGE_STYLE: Record<string, { bg: string; color: string }> = {
  upcoming: { bg: B.blueBg, color: B.blue },
  now_showing: { bg: B.greenBg, color: B.green },
  archived: { bg: B.bg, color: B.txtMu },
};

const uploadMovieImage = async (movieId: string, kind: 'poster' | 'banner', file: any): Promise<string> => {
  const fileExt = (file.name?.split('.').pop() || file.type.split('/').pop() || 'jpg').toLowerCase();
  const path = `${movieId}/${kind}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from('movie-images')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('movie-images').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
};

const MoviesManagerModal = ({ visible, onClose, onMoviesChanged }: {
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
        .select('id, title, description, poster_url, banner_url, duration_minutes, intermission_duration, genre, status, playwright, director, opening_night, closing_night, age_advisory, cast, created_at')
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setMovies((data as any) ?? []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load movies:', err);
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
      console.error('Failed to save show:', err);
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
      console.error('Failed to delete show:', err);
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

const mc = StyleSheet.create({
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

// ── VENUE SEAT MAP (shared by Seat Manager + Box Office) ───────────────────
// The auditorium is a single flat-rate room; seat metadata lives in the
// venue_seats master table seeded with the same A–J × 10 grid the public
// picker renders. "booked" is never stored on a seat — it's overlaid per
// showtime from booking_seats.
const SEAT_ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// Upcoming showtimes for the admin's seat-context selectors (Seat Map + Box
// Office). The embedded productions title powers the "Title · date @ time"
// label so the admin sees exactly which performance they are managing.
type AdminShowtime = {
  id: string;
  production_id: string;
  start_time: string;
  price: number;
  available_seats: number;
  productions: { title: string } | null;
};

type VenueSeat = {
  seat_identifier: string;
  row_label: string;
  col_number: number;
  is_accessible: boolean;
  status: 'available' | 'blocked' | 'broken';
};

type SeatTone = 'available' | 'selected' | 'booked' | 'blocked' | 'broken';

type SeatCell = {
  identifier: string;
  rowLabel: string;
  colNumber: number;
  isAccessible: boolean;
  tone: SeatTone;     // base colour; ignored while selected
  selected: boolean;
  selectable: boolean;
};

const SEAT_TONE_STYLE: Record<SeatTone, { bg: string; border: string; fg: string }> = {
  available: { bg: B.white,   border: B.border, fg: B.txt2  },
  selected:  { bg: B.red,     border: B.red,    fg: B.white },
  booked:    { bg: B.txtMu,   border: B.txt2,   fg: B.white },
  blocked:   { bg: B.amberBg, border: B.amber,  fg: B.amber },
  broken:    { bg: B.roseBg,  border: B.rose,   fg: B.rose  },
};

// Visual grid with click-to-toggle and click-drag-to-paint selection. Drag is
// driven by web mouse events (this app ships web-only); a window mouseup ends
// the drag even if released off a seat. Non-selectable seats ignore input.
const SeatGrid = ({ seats, onPaint }: {
  seats: SeatCell[];
  onPaint: (identifier: string, nextSelected: boolean) => void;
}) => {
  const draggingRef = useRef(false);
  const paintModeRef = useRef(true); // true = selecting, false = deselecting

  useEffect(() => {
    const stop = () => { draggingRef.current = false; };
    const w = (globalThis as any).window;
    w?.addEventListener?.('mouseup', stop);
    return () => w?.removeEventListener?.('mouseup', stop);
  }, []);

  const rows = SEAT_ROW_LABELS
    .map(rl => ({ rowLabel: rl, cells: seats.filter(c => c.rowLabel === rl).sort((a, b) => a.colNumber - b.colNumber) }))
    .filter(r => r.cells.length > 0);

  const handleDown = (cell: SeatCell) => {
    if (!cell.selectable) return;
    draggingRef.current = true;
    paintModeRef.current = !cell.selected;
    onPaint(cell.identifier, paintModeRef.current);
  };
  const handleEnter = (cell: SeatCell) => {
    if (!draggingRef.current || !cell.selectable) return;
    onPaint(cell.identifier, paintModeRef.current);
  };

  return (
    <View>
      <View style={sg.screenBar}><Text style={sg.screenBarText}>STAGE</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={sg.grid as any}>
          {rows.map(row => (
            <View key={row.rowLabel} style={sg.row}>
              <Text style={sg.rowLabel}>{row.rowLabel}</Text>
              <View style={sg.rowSeats}>
                {row.cells.map(cell => {
                  const tone = cell.selected ? 'selected' : cell.tone;
                  const c = SEAT_TONE_STYLE[tone];
                  return (
                    <View
                      key={cell.identifier}
                      style={[sg.seat, { backgroundColor: c.bg, borderColor: c.border }, { cursor: cell.selectable ? 'pointer' : 'default' } as any]}
                      {...({ onMouseDown: () => handleDown(cell), onMouseEnter: () => handleEnter(cell) } as any)}
                    >
                      {cell.isAccessible ? (
                        <Icon name="accessibility" size={12} color={c.fg} />
                      ) : (
                        <Text style={[sg.seatText, { color: c.fg }]}>{cell.colNumber}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const SeatLegend = ({ items }: { items: { color: string; border: string; label: string; icon?: boolean }[] }) => (
  <View style={sg.legendRow}>
    {items.map(it => (
      <View key={it.label} style={sg.legendItem}>
        <View style={[sg.legendSwatch, { backgroundColor: it.color, borderColor: it.border }]}>
          {it.icon && <Icon name="accessibility" size={9} color={it.border} />}
        </View>
        <Text style={sg.legendText}>{it.label}</Text>
      </View>
    ))}
  </View>
);

const sg = StyleSheet.create({
  screenBar: {
    alignSelf: 'center', backgroundColor: B.bg, borderRadius: 4,
    paddingVertical: 5, paddingHorizontal: 56, marginBottom: 18, borderWidth: 1, borderColor: B.border,
  },
  screenBarText: { color: B.txtMu, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  grid: { gap: 7, paddingBottom: 6, userSelect: 'none' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { width: 14, color: B.txtMu, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  rowSeats: { flexDirection: 'row', gap: 6 },
  seat: {
    width: 28, height: 28, borderRadius: 6, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  seatText: { fontSize: 10, fontWeight: '700' },
  legendRow: { flexDirection: 'row', gap: 18, marginTop: 18, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  legendText: { fontSize: 12, color: B.txt2 },
});

// ── SEAT MAP MANAGER (per-showtime holds) ──────────────
// The auditorium LAYOUT and its physical facts (wheelchair access, a seat
// that's permanently broken) are venue-wide and live in venue_seats. BLOCKING
// a seat, though, is per PERFORMANCE — held for one night only — so holds live
// in booking_seats keyed by the selected showtime. The admin must pick a
// showtime before the grid appears; edits then touch only that performance.
const SeatManagementPanel = () => {
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
      console.error('Failed to load showtimes:', err);
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
      console.error('Failed to load seats:', err);
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
      console.error('Failed to block seats:', err);
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
      console.error('Failed to free seats:', err);
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
      console.error('Failed to update venue seats:', err);
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

const sm = StyleSheet.create({
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

// ── BOX OFFICE POS ─────────────────────────────────────
// Walk-up sales: pick an upcoming showtime, select available seats, charge the
// flat showtimes.price × seats, and record a paid, account-less booking via
// the admin-gated create_box_office_booking RPC.
const BoxOfficePanel = () => {
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
      console.error('Failed to load showtimes:', err);
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
      console.error('Failed to load seats:', err);
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
    const perShow = seatStatus.get(v.seat_identifier);            // 'booked' | 'blocked' | undefined
    const tone: SeatTone = perShow ?? v.status;                    // overlay this showtime's status onto the venue base
    return {
      identifier: v.seat_identifier,
      rowLabel: v.row_label,
      colNumber: v.col_number,
      isAccessible: v.is_accessible,
      tone,
      selected: cart.has(v.seat_identifier),
      selectable: !perShow && v.status === 'available',            // only seats free this performance are sellable
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
      console.error('Box office sale failed:', err);
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

const bo = StyleSheet.create({
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
});

// ── ADMIN DASHBOARD ────────────────────────────────────
const AdminDashboard = ({ onNavigate }: Props) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [activeNav, setActiveNav]     = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName]     = useState('Admin');

  // ── RBAC GUARD ── force non-admins off this screen. Also grabs the
  // admin's own name/email for the sidebar user card while it's already
  // fetching the role, instead of a separate query just for display.
  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showModal({ title: 'Unauthorized access', message: 'Please log in to continue.', variant: 'error' });
        onNavigate('home');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name, email')
        .eq('id', user.id)
        .single();

      if (error || profile?.role !== 'admin') {
        showModal({
          title: 'Unauthorized access',
          message: 'You do not have permission to view this page.',
          variant: 'error',
        });
        onNavigate('home');
        return;
      }

      setAdminName(profile.full_name?.trim() || profile.email?.split('@')[0] || 'Admin');
    };

    checkAccess();
  }, [onNavigate, showModal]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onNavigate('home');
  };

  const pageTitle = NAV_ITEMS.find(n => n.id === activeNav)?.label ?? 'Overview';

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.navyDp} />
      <View style={s.layout}>

        {/* ── SIDEBAR ── */}
        {isDesktop ? (
          <Sidebar active={activeNav} onSelect={setActiveNav} adminName={adminName} />
        ) : sidebarOpen ? (
          <>
            <TouchableOpacity style={s.overlay} onPress={() => setSidebarOpen(false)} />
            <View style={s.mobileSb}>
              <Sidebar
                active={activeNav}
                onSelect={(id) => { setActiveNav(id); setSidebarOpen(false); }}
                adminName={adminName}
              />
            </View>
          </>
        ) : null}

        {/* ── MAIN CONTENT ── */}
        <View style={s.main}>

          {/* TOP BAR */}
          <View style={s.topbar}>
            <View style={s.topLeft}>
              {!isDesktop && (
                <TouchableOpacity style={s.burger} onPress={() => setSidebarOpen(true)}>
                  <Icon name="menu-outline" size={18} color={B.txt} />
                </TouchableOpacity>
              )}
              <Text style={s.pageTitle}>{pageTitle}</Text>
            </View>
            <View style={s.topRight}>
              <TouchableOpacity style={s.siteBtn} onPress={() => onNavigate('home')}>
                <Text style={s.siteBtnTxt}>View Live Site</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogout}>
                <Text style={s.logoutTxt}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SCROLL CONTENT */}
          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
            {activeNav === 'users' ? (
              <UserManagementPanel />
            ) : activeNav === 'settings' ? (
              <ChangePasswordPanel />
            ) : activeNav === 'showtimes' ? (
              <ShowtimesPanel />
            ) : activeNav === 'boxoffice' ? (
              <BoxOfficePanel />
            ) : activeNav === 'seatmap' ? (
              <SeatManagementPanel />
            ) : (
              <OverviewPanel adminName={adminName} />
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
};

// ── MAIN STYLES ───────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: B.navyDp },
  layout:       { flex: 1, flexDirection: 'row' },
  overlay:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  mobileSb:     { position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 20 },
  main:         { flex: 1, backgroundColor: B.bg },

  // TOP BAR
  topbar:       { backgroundColor: B.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: B.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2 },
  topLeft:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  burger:       { padding: 6, borderRadius: 8, backgroundColor: B.bg },
  pageTitle:    { fontSize: 16, fontWeight: '800', color: B.txt },
  topRight:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  siteBtn:      { backgroundColor: B.navy, borderRadius: 7, paddingHorizontal: 14, paddingVertical: 7 },
  siteBtnTxt:   { color: '#fff', fontSize: 12, fontWeight: '600' },
  logoutTxt:    { color: B.red, fontSize: 12, fontWeight: '600' },

  // CONTENT
  scroll:       { flex: 1 },
  content:      { padding: 32, paddingBottom: 48, maxWidth: 1120, width: '100%' },

  // PAGE HEADER (shared across every tab)
  pageHead:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 },
  pageHeadTitle:{ fontSize: 24, fontWeight: '800', color: B.txt, letterSpacing: -0.3, marginBottom: 5 },
  pageHeadSub:  { fontSize: 13, color: B.txt2 },
  pageHeadBtn:  { backgroundColor: B.red, borderRadius: 9, paddingHorizontal: 18, paddingVertical: 11, flexShrink: 0 },
  pageHeadBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // STATS
  statsGrid:    { flexDirection: 'row', gap: 16, marginBottom: 28, flexWrap: 'wrap' },
  statsGridMob: { gap: 12 },
  statCard:     { width: 232, flexGrow: 0, flexShrink: 0, backgroundColor: B.white, borderRadius: 14, padding: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  statCardMob:  { width: '47%' },
  statIcoBox:   { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  statLbl:      { fontSize: 10.5, fontWeight: '700', color: B.txtMu, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  statVal:      { fontSize: 28, fontWeight: '800', color: B.txt, letterSpacing: -0.6 },
  statBar:      { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },

  // CARD
  card:         { backgroundColor: B.white, borderRadius: 14, padding: 22, marginBottom: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardHead:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  cardTitle:    { fontSize: 16, fontWeight: '800', color: B.txt, letterSpacing: -0.2 },
  viewAllBtn:   { backgroundColor: B.bg, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 6 },
  viewAllTxt:   { color: B.red, fontSize: 12, fontWeight: '700' },

  // TABLE
  tHead:        { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: B.border, marginBottom: 2 },
  th:           { fontSize: 10.5, fontWeight: '700', color: B.txtMu, letterSpacing: 0.4 },
  tRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderRadius: 7, paddingHorizontal: 4 },
  tRowAlt:      { backgroundColor: '#fafafa' },
  td:           { fontSize: 13, color: B.txt, flex: 1 },
  tdMuted:      { color: B.txt2 },
  tdBold:       { fontWeight: '700' },
});

export default AdminDashboard;
