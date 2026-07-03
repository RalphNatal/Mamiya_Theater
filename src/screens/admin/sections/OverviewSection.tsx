import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../../lib/supabase';
import { createStyles, typography } from '../../../theme';
import { B } from '../shared/brand';
import { s, um } from '../shared/adminStyles';
import { VENUE_SEAT_COUNT } from '../shared/constants';
import { formatMoney, formatInt } from '../shared/format';
import { WebDateInput, WebSelect } from '../components/WebInputs';
import { LoadingState, EmptyState } from '../components/Feedback';
import { MoviesManagerModal } from './ProductionsSection';
// ── DATE FILTER ────────────────────────────────────────
// The preset toggle + custom range produce an inclusive [start, end] window
// (YYYY-MM-DD) held in OverviewPanel state. It is the exact shape the dashboard
// RPCs expect and will feed them next step — supabase.rpc('get_dashboard_kpis',
// { start_date, end_date }) and friends. Presets are rolling windows anchored
// to today, so the trend label reads naturally ("from last week").
export type DatePreset = 'day' | 'week' | 'month' | 'year';
export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'day',   label: 'Day' },
  { id: 'week',  label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year',  label: 'Year' },
];
export const TREND_NOTE: Record<DatePreset | 'custom', string> = {
  day: 'from yesterday', week: 'from last week', month: 'from last month',
  year: 'from last year', custom: 'vs previous period',
};
export const toYmd = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const presetRange = (preset: DatePreset): { start: string; end: string } => {
  const end = new Date();
  const start = new Date();
  const back = preset === 'day' ? 0 : preset === 'week' ? 6 : preset === 'month' ? 29 : 364;
  start.setDate(start.getDate() - back);
  return { start: toYmd(start), end: toYmd(end) };
};

// Inclusive day count of a [start, end] YYYY-MM-DD window (parsed at LOCAL
// midday so no UTC offset shifts a boundary day).
export const rangeLengthDays = (start: string, end: string): number => {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const a = new Date(sy, sm - 1, sd, 12).getTime();
  const b = new Date(ey, em - 1, ed, 12).getTime();
  return Math.round((b - a) / 86400000) + 1;
};

// The equal-length window immediately BEFORE [start, end] — used to compute a
// real period-over-period trend for each KPI.
export const previousRange = (start: string, end: string): { start: string; end: string } => {
  const len = rangeLengthDays(start, end);
  const [sy, sm, sd] = start.split('-').map(Number);
  const prevEnd = new Date(sy, sm - 1, sd, 12);
  prevEnd.setDate(prevEnd.getDate() - 1);           // day before the current start
  const prevStart = new Date(prevEnd.getTime());
  prevStart.setDate(prevStart.getDate() - (len - 1)); // same length back
  return { start: toYmd(prevStart), end: toYmd(prevEnd) };
};

// Real % change vs the previous period. Returns null when there is nothing to
// compare against (previous period is null or zero), so the trend badge HIDES
// instead of showing a fabricated percentage.
export const computeTrend = (
  current: number,
  previous: number | null,
): { pct: number; dir: 'up' | 'down' } | null => {
  if (previous == null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return { pct: Math.round(pct * 10) / 10, dir: pct >= 0 ? 'up' : 'down' };
};

export const DateFilter = ({ preset, range, onPreset, onStart, onEnd }: {
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
// The bar strip is a real sparkline of per-day values from
// supabase.rpc('get_sales_timeseries', …). Metrics with no per-day series
// (projected / occupancy) pass an empty array and render a flat/empty strip —
// never fabricated bars.
export const Sparkline = ({ data, color }: { data: number[]; color: string }) => {
  const max = Math.max(...data, 1);
  return (
    <View style={ov.sparkWrap}>
      {data.length === 0 ? (
        // Flat baseline when there is no per-day series to plot.
        <View style={[ov.sparkBar, { height: '10%' as any, backgroundColor: color, opacity: 0.18 }]} />
      ) : (
        data.map((v, i) => (
          <View
            key={i}
            style={[ov.sparkBar, { height: `${Math.max(10, (v / max) * 100)}%` as any, backgroundColor: color, opacity: 0.3 + 0.6 * (v / max) }]}
          />
        ))
      )}
    </View>
  );
};

// trend is null when a real percentage can't be computed (no previous-period
// data to compare against) — the badge is hidden rather than faked.
export const KpiCard = ({ label, value, icon, color, bg, trend, note, spark, stack }: {
  label: string;
  value: string;
  icon: string;
  color: string;
  bg: string;
  trend: { pct: number; dir: 'up' | 'down' } | null;
  note: string;
  spark: number[];
  stack: boolean;
}) => {
  const up = trend?.dir === 'up';
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
      {trend && (
        <View style={ov.kpiTrendRow}>
          <View style={[ov.trendPill, { backgroundColor: up ? B.greenBg : B.roseBg }]}>
            <Icon name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? B.green : B.rose} />
            <Text style={[ov.trendTxt, { color: up ? B.green : B.rose }]}>{Math.abs(trend.pct)}%</Text>
          </View>
          <Text style={ov.kpiTrendNote} numberOfLines={1}>{note}</Text>
        </View>
      )}
      <Sparkline data={spark} color={color} />
    </View>
  );
};

export type RecentBooking = {
  id: string;
  movie_title: string | null;
  num_tickets: number;
  total_price: number;
  status: string;
  created_at: string;
};

// ── ANALYTICS DATA SHAPES (mirror the dashboard RPC return columns) ─────
export type TimeseriesPoint = { day: string; tickets_sold: number; revenue: number };
export type ChannelRow      = { channel: 'Online' | 'Walk-in'; tickets_sold: number; revenue: number };
// All-time, per-show ticket breakdown read straight from the production_stats
// table (a trigger keeps it current). Distinct from the windowed KPIs: this is
// a running total per production, not scoped to the selected date range.
export type ProductionStat  = { title: string; tickets_sold: number; revenue: number };
export type Analytics = {
  series:   TimeseriesPoint[];
  channels: ChannelRow[];
  inventory: number;           // remaining seats across all UPCOMING showtimes
};

// ── KPI DATA SHAPES ────────────────────────────────────
// get_dashboard_kpis returns a single row (revenue / tickets / projected). It
// does NOT include occupancy, so occupancy is computed client-side from the
// showtimes table (see occupancyForWindow). Both a current and a previous
// window are fetched so each card can show a real period-over-period trend.
export type KpiRow  = { total_revenue: number; tickets_sold: number; projected_revenue: number };
export type KpiData = {
  current:       KpiRow;
  previous:      KpiRow | null;   // null when the previous window returned no row
  occupancy:     number | null;   // null when no showtimes fall in the window → "--"
  occupancyPrev: number | null;
};

// Avg occupancy of the performances (showtimes) whose start_time falls in the
// window: seats sold ÷ total house across those performances. The auditorium is
// a fixed VENUE_SEAT_COUNT house, and available_seats is decremented ONLY by real
// bookings (admin holds live in booking_seats, never touch available_seats), so
// sold = house − available_seats is a reliable per-showtime figure. Returns null
// when there are NO showtimes in the window — the card then shows "--" rather
// than a made-up percentage.
export const occupancyForWindow = async (startYmd: string, endYmd: string): Promise<number | null> => {
  const startISO = new Date(`${startYmd}T00:00:00`).toISOString();
  const endISO   = new Date(`${endYmd}T23:59:59.999`).toISOString();
  const { data, error } = await supabase
    .from('showtimes')
    .select('available_seats')
    .gte('start_time', startISO)
    .lte('start_time', endISO);
  if (error) {
    console.error('Failed to compute occupancy:', error);
    return null;                 // occupancy is secondary — degrade to "--", don't fail the KPIs
  }
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const capacity = rows.length * VENUE_SEAT_COUNT;
  const sold = rows.reduce((sum: number, r: any) => {
    const s = VENUE_SEAT_COUNT - (r.available_seats ?? 0);
    return sum + Math.max(0, Math.min(VENUE_SEAT_COUNT, s));
  }, 0);
  return Math.round((sold / capacity) * 100);
};

// Compact axis/tooltip label from the RPC's 'YYYY-MM-DD' day. Parsed at LOCAL
// midday so the date never slips a day across a UTC offset (same guard the rest
// of this screen uses for wall-clock dates).
export const toDayLabel = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// ── PART 1 — TICKET SALES BAR CHART ────────────────────
// recharts renders SVG via react-dom; it sits inside an RNW <View> the same way
// the WebDateInput/WebSelect DOM nodes do (this app ships web-only). The parent
// View must have an explicit height for ResponsiveContainer to measure against.
export const SalesTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <View style={an.tip}>
      <Text style={an.tipDay}>{label}</Text>
      <Text style={an.tipVal}>{formatInt(payload[0].value)} tickets</Text>
    </View>
  );
};

export const SalesChart = ({ data }: { data: TimeseriesPoint[] }) => {
  const chartData = data.map(p => ({ label: toDayLabel(p.day), tickets: Number(p.tickets_sold) }));
  return (
    <View style={{ height: 280, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef0f4" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: '#eef0f4' }}
            tick={{ fontSize: 11, fill: B.txtMu }}
            minTickGap={18}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={34}
            tick={{ fontSize: 11, fill: B.txtMu }}
          />
          <Tooltip cursor={{ fill: 'rgba(37,99,235,0.06)' }} content={<SalesTooltip />} />
          <Bar dataKey="tickets" fill={B.blue} radius={[4, 4, 0, 0]} maxBarSize={46} />
        </BarChart>
      </ResponsiveContainer>
    </View>
  );
};

// ── PART 2 — TOP PERFORMING SHOWS ──────────────────────
// Per-show ticket breakdown read from the production_stats table. The list
// container stacks vertically (flexDirection: 'column'); each show is its own
// row with the title on the left and a "N Tickets Sold" pill on the right,
// pushed apart with justifyContent: 'space-between'. This reads each show's
// isolated count — distinct from the global "Total Tickets (All Shows)" KPI
// above. `shows` is null while loading.
export const TopShowsPanel = ({ shows }: { shows: ProductionStat[] | null }) => (
  <View style={[s.card, an.sideCard]}>
    <View style={s.cardHead}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.cardTitle}>Top Performing Shows</Text>
        <Text style={an.cardSub}>Tickets sold per show · all-time</Text>
      </View>
    </View>
    {shows === null ? (
      <LoadingState label="Loading shows…" />
    ) : shows.length === 0 ? (
      <EmptyState icon="trophy-outline" title="No shows yet" subtitle="Per-show ticket counts appear once shows are added." />
    ) : (
      <View style={an.statList}>
        {shows.map((show, i) => (
          <View key={`${show.title}-${i}`} style={an.statRow}>
            <View style={an.statLeft}>
              <View style={an.rankBadge}><Text style={an.rankTxt}>{i + 1}</Text></View>
              <Text style={an.showTitle} numberOfLines={1}>{show.title}</Text>
            </View>
            <View style={an.ticketPill}>
              <Text style={an.ticketPillTxt}>{formatInt(show.tickets_sold)} Tickets Sold</Text>
            </View>
          </View>
        ))}
      </View>
    )}
  </View>
);

// ── PART 3 — SALES CHANNEL CARD (Walk-in / Online) ─────
export const ChannelCard = ({ kind, row, inventory }: {
  kind: 'walkin' | 'online';
  row: ChannelRow | undefined;
  inventory: number;
}) => {
  const walkin = kind === 'walkin';
  const accent = walkin ? B.amber : B.blue;
  const accentBg = walkin ? B.amberBg : B.blueBg;
  return (
    <View style={[s.card, an.channelCard]}>
      <View style={an.channelHead}>
        <View style={[an.channelIcon, { backgroundColor: accentBg }]}>
          <Icon name={walkin ? 'storefront-outline' : 'globe-outline'} size={18} color={accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={an.channelTitle}>{walkin ? 'Walk-in Counter' : 'Online Platforms'}</Text>
          <Text style={an.channelSub}>{walkin ? 'Box office · cash & card POS' : 'Website · registered accounts'}</Text>
        </View>
      </View>
      <View style={an.channelStatRow}>
        <View style={an.channelStat}>
          <Text style={an.channelStatLbl}>Tickets Sold</Text>
          <Text style={an.channelStatVal}>{formatInt(row?.tickets_sold ?? 0)}</Text>
        </View>
        <View style={an.channelStat}>
          <Text style={an.channelStatLbl}>Available</Text>
          <Text style={an.channelStatVal}>{formatInt(inventory)}</Text>
        </View>
      </View>
      <View style={an.channelRevenue}>
        <Text style={an.channelStatLbl}>Total Revenue</Text>
        <Text style={[an.channelRevenueVal, { color: accent }]}>{formatMoney(Number(row?.revenue ?? 0))}</Text>
      </View>
    </View>
  );
};

export const an = createStyles({
  // Layout — chart + side panel, then the two channel cards. Stays a row and
  // wraps (never switches to a column), so the flex ratios always size WIDTH;
  // minWidth forces a clean stack on narrow viewports. Same pattern as kpiGrid.
  row:        { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'stretch', marginBottom: 18 },
  chartCard:  { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 320, marginBottom: 0 },
  sideCard:   { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 260, marginBottom: 0 },
  channelCard:{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 300, marginBottom: 0 },
  cardSub:    { fontSize: 12, color: B.txt2, marginTop: 4 },

  // Chart tooltip
  tip:        { backgroundColor: B.navy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  tipDay:     { color: 'rgba(255,255,255,0.6)', fontSize: 10.5, fontWeight: '700', marginBottom: 2 },
  tipVal:     { color: '#fff', fontSize: 13, fontWeight: '800' },

  // Top performing shows
  // Vertical stack — each show is its own row.
  statList:     { flexDirection: 'column', gap: 10 },
  // Per-show row: title (+rank) on the left, ticket-count pill on the right,
  // pushed apart with space-between.
  statRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  rankBadge:    { width: 22, height: 22, borderRadius: 6, backgroundColor: B.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankTxt:      { fontSize: 11, fontWeight: '800', color: B.txt2 },
  showTitle:    { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '700', color: B.txt },
  ticketPill:   { backgroundColor: B.blueBg, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, flexShrink: 0 },
  ticketPillTxt:{ fontSize: 12, fontWeight: '800', color: B.blue },

  // Channel cards (Walk-in / Online)
  channelHead:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  channelIcon:    { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  channelTitle:   { fontSize: 14, fontWeight: '800', color: B.txt },
  channelSub:     { fontSize: 11.5, color: B.txtMu, marginTop: 2 },
  channelStatRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  channelStat:    { flex: 1, backgroundColor: B.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  channelStatLbl: { fontSize: 10.5, fontWeight: '700', color: B.txtMu, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 },
  channelStatVal: { fontSize: 20, fontWeight: '800', color: B.txt, letterSpacing: -0.4 },
  channelRevenue: { borderTopWidth: 1, borderTopColor: B.border, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  channelRevenueVal: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
});

export const OverviewPanel = ({ adminName }: { adminName: string }) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [preset, setPreset] = useState<DatePreset | 'custom'>('week');
  const [range, setRange] = useState(() => presetRange('week'));
  const [recent, setRecent] = useState<RecentBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showsVisible, setShowsVisible] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [separatedShowStats, setSeparatedShowStats] = useState<ProductionStat[] | null>(null);

  const selectPreset = (p: DatePreset) => { setPreset(p); setRange(presetRange(p)); };
  const onStart = (v: string) => { setPreset('custom'); setRange(r => ({ ...r, start: v })); };
  const onEnd   = (v: string) => { setPreset('custom'); setRange(r => ({ ...r, end: v })); };

  // Recent Activity — the five latest bookings, independent of the date filter.
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

  // Per-show ticket breakdown, read straight from the production_stats table (a
  // trigger keeps it current). All-time — not scoped to the date filter — so it
  // loads once on mount rather than on every window change. `productions(title)`
  // embeds the show title via the movie_id FK. revenue is numeric → returned as
  // a string by PostgREST, so it's coerced. On failure we degrade to an empty
  // list (the panel shows its own empty state) instead of blocking the page.
  const loadSeparatedShowStats = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('production_stats')
        .select('tickets_sold, revenue, productions(title)')
        .order('tickets_sold', { ascending: false });
      if (fetchError) throw fetchError;
      setSeparatedShowStats((data ?? []).map((r: any) => ({
        title:        r.productions?.title ?? 'Untitled',
        tickets_sold: Number(r.tickets_sold ?? 0),
        revenue:      Number(r.revenue ?? 0),
      })));
    } catch (err: any) {
      console.error('Failed to load per-show ticket stats:', err);
      setSeparatedShowStats([]);
    }
  };

  // Bar chart, top shows and the channel split all key off the same [start,end]
  // window as the date filter — server-side RPCs do the aggregation, the client
  // only renders. Available inventory is the house's shared remaining seats
  // (upcoming showtimes), so both channel cards draw from one pool.
  const loadAnalytics = async () => {
    setAnalytics(null);
    setAnalyticsError(null);
    try {
      const args = { start_date: range.start, end_date: range.end };
      const [tsRes, chRes, invRes] = await Promise.all([
        supabase.rpc('get_sales_timeseries', args),
        supabase.rpc('get_sales_channels', args),
        supabase.from('showtimes').select('available_seats').gte('start_time', new Date().toISOString()),
      ]);
      if (tsRes.error) throw tsRes.error;
      if (chRes.error) throw chRes.error;
      if (invRes.error) throw invRes.error;
      const inventory = (invRes.data ?? []).reduce((sum: number, r: any) => sum + (r.available_seats ?? 0), 0);
      setAnalytics({
        series:   (tsRes.data as TimeseriesPoint[]) ?? [],
        channels: (chRes.data as ChannelRow[]) ?? [],
        inventory,
      });
    } catch (err: any) {
      console.error('Failed to load dashboard analytics:', err);
      setAnalyticsError(err.message ?? 'Failed to load analytics.');
    }
  };

  // KPI cards. get_dashboard_kpis is called for the SELECTED window and for the
  // equal-length PREVIOUS window (for real trend deltas); occupancy is computed
  // client-side for both windows. All four values fall back to "--" when there
  // is no data — nothing here is fabricated.
  const loadKpis = async () => {
    setKpiData(null);
    try {
      const prev = previousRange(range.start, range.end);
      const [curRes, prevRes, curOcc, prevOcc] = await Promise.all([
        supabase.rpc('get_dashboard_kpis', { start_date: range.start, end_date: range.end }),
        supabase.rpc('get_dashboard_kpis', { start_date: prev.start, end_date: prev.end }),
        occupancyForWindow(range.start, range.end),
        occupancyForWindow(prev.start, prev.end),
      ]);
      if (curRes.error) throw curRes.error;
      if (prevRes.error) throw prevRes.error;
      // get_dashboard_kpis is RETURNS TABLE → PostgREST yields an array of one row.
      const toRow = (d: any): KpiRow => ({
        total_revenue:     Number(d?.total_revenue ?? 0),
        tickets_sold:      Number(d?.tickets_sold ?? 0),
        projected_revenue: Number(d?.projected_revenue ?? 0),
      });
      const curRow  = Array.isArray(curRes.data)  ? curRes.data[0]  : curRes.data;
      const prevRow = Array.isArray(prevRes.data) ? prevRes.data[0] : prevRes.data;
      setKpiData({
        current:       toRow(curRow),
        previous:      prevRow ? toRow(prevRow) : null,
        occupancy:     curOcc,
        occupancyPrev: prevOcc,
      });
    } catch (err: any) {
      // Cards fall back to "--"; the shared analytics banner surfaces the
      // failure for this same window, so no separate KPI error slot is needed.
      console.error('Failed to load dashboard KPIs:', err);
    }
  };

  useEffect(() => {
    loadRecent();
    loadSeparatedShowStats();
  }, []);

  // Re-aggregate whenever the selected window changes.
  useEffect(() => {
    loadAnalytics();
    loadKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  // Build the four cards from REAL data. cur is undefined while KPIs load or if
  // the RPC errored — every value then falls back to "--" with no trend badge.
  const cur     = kpiData?.current;
  const prev    = kpiData?.previous ?? null;
  const occ     = kpiData?.occupancy ?? null;
  const occPrev = kpiData?.occupancyPrev ?? null;

  // Real per-day sparklines from get_sales_timeseries. Projected and occupancy
  // have no per-day series, so they pass [] and render a flat strip.
  const salesSpark   = (analytics?.series ?? []).map(p => Number(p.revenue));
  const ticketsSpark = (analytics?.series ?? []).map(p => Number(p.tickets_sold));

  // With zero tickets sold in the window there is no sales data → show "--"
  // rather than $0.00 (which would read like a real, confirmed zero).
  const hasSales = !!cur && cur.tickets_sold > 0;

  const kpis = [
    {
      key: 'sales', label: 'Total Sales',
      value: hasSales ? formatMoney(cur!.total_revenue) : '--',
      icon: 'cash-outline', color: B.green, bg: B.greenBg,
      trend: cur ? computeTrend(cur.total_revenue, prev?.total_revenue ?? null) : null,
      spark: salesSpark,
    },
    {
      key: 'tickets', label: 'Total Tickets (All Shows)',
      value: hasSales ? formatInt(cur!.tickets_sold) : '--',
      icon: 'ticket-outline', color: B.blue, bg: B.blueBg,
      trend: cur ? computeTrend(cur.tickets_sold, prev?.tickets_sold ?? null) : null,
      spark: ticketsSpark,
    },
    {
      key: 'projected', label: 'Projected Sales',
      value: cur && cur.projected_revenue > 0 ? formatMoney(cur.projected_revenue) : '--',
      icon: 'trending-up-outline', color: B.purple, bg: B.purpleBg,
      // Projected is a forward-looking figure (Σ unsold seats × price over all
      // UPCOMING showtimes) — identical regardless of the selected historical
      // window, so a period-over-period trend is meaningless here. No badge.
      trend: null,
      spark: [] as number[],
    },
    {
      key: 'occupancy', label: 'Avg Occupancy',
      value: occ != null ? `${occ}%` : '--',
      icon: 'people-outline', color: B.amber, bg: B.amberBg,
      trend: occ != null ? computeTrend(occ, occPrev) : null,
      spark: [] as number[],
    },
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

      {/* ── PART 1 + 2 — Ticket Sales chart beside Top Performing Shows ── */}
      {/* ── PART 3 — Walk-in vs Online channel split ── */}
      {analyticsError ? (
        <View style={s.card}><Text style={[um.empty, { color: B.red }]}>{analyticsError}</Text></View>
      ) : analytics === null ? (
        <View style={s.card}><LoadingState label="Loading analytics…" /></View>
      ) : (
        <>
          <View style={an.row}>
            <View style={[s.card, an.chartCard]}>
              <View style={s.cardHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.cardTitle}>Ticket Sales</Text>
                  <Text style={an.cardSub}>Daily tickets sold in the selected period</Text>
                </View>
              </View>
              <SalesChart data={analytics.series} />
            </View>
            <TopShowsPanel shows={separatedShowStats} />
          </View>

          <View style={an.row}>
            <ChannelCard kind="walkin" row={analytics.channels.find(c => c.channel === 'Walk-in')} inventory={analytics.inventory} />
            <ChannelCard kind="online" row={analytics.channels.find(c => c.channel === 'Online')} inventory={analytics.inventory} />
          </View>
        </>
      )}

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

export const ov = createStyles({
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
  kpiLabel:      { ...typography.caption, fontSize: 10.5, lineHeight: 14, fontWeight: '700', color: B.txtMu, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  kpiValue:      { ...typography.heading1, fontSize: 26, lineHeight: 34, color: B.txt },
  kpiIcon:       { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  kpiTrendRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  trendPill:     { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  trendTxt:      { fontSize: 11, fontWeight: '800' },
  kpiTrendNote:  { fontSize: 11, color: B.txtMu, flexShrink: 1 },
  sparkWrap:     { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 36 },
  sparkBar:      { flex: 1, borderRadius: 2, minHeight: 3 },
});
