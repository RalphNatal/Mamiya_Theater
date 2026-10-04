import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { createStyles } from '../../../theme';
import { VENUE_TIMEZONE } from '../../../config/venue';
import { B } from '../shared/brand';
import { s, um } from '../shared/adminStyles';
import { formatInt, formatMoney } from '../shared/format';
import { WebSelect } from '../components/WebInputs';
import { LoadingState, EmptyState } from '../components/Feedback';
import { PayoutBreakdownPanel, toRevenueBreakdown, type RevenueBreakdown } from './OverviewSection';

// ── EARNINGS BY EVENT & SHOW (full admin only) ───────────────────────────────
// The overall Payouts cards above stay as they are; this panel narrows the same
// numbers to one EVENT (production) and/or one SHOW (showtime), and lists every
// show of the selection with tickets sold, gross, fees and theatre take-home.
// Sources: get_revenue_breakdown(…, p_production_id, p_showtime_id) and
// get_revenue_by_show — both assert_admin, paid rows + fee snapshots only, the
// same NET FORMULA (supabase/migrations/20261004170000_*.sql). Staff never
// mount Overview, and the RPCs refuse them anyway.

export type ShowEarnings = {
  showtime_id: string;
  production_id: string;
  production_title: string | null;
  show_start_time: string;
  orders: number;
  tickets_sold: number;
  gross_collected: number;
  face_revenue: number;
  fees_total: number;
  platform_fee_total: number;
  processing_fees: number;
  theater_net: number;
};

export const toShowEarnings = (r: any): ShowEarnings => ({
  showtime_id: r.showtime_id,
  production_id: r.production_id,
  production_title: r.production_title ?? null,
  show_start_time: r.show_start_time,
  orders: Number(r.orders ?? 0),
  tickets_sold: Number(r.tickets_sold ?? 0),
  gross_collected: Number(r.gross_collected ?? 0),
  face_revenue: Number(r.face_revenue ?? 0),
  fees_total: Number(r.fees_total ?? 0),
  platform_fee_total: Number(r.platform_fee_total ?? 0),
  processing_fees: Number(r.processing_fees ?? 0),
  theater_net: Number(r.theater_net ?? 0),
});

// Two shows on one calendar day stay two rows: label each by date AND time.
export const showLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE,
  });

const ALL_TIME = { start: '2000-01-01', end: '2100-12-31' };

export const EarningsByShowPanel = ({ range }: { range: { start: string; end: string } }) => {
  const [productions, setProductions] = useState<{ id: string; title: string }[]>([]);
  const [productionId, setProductionId] = useState('');
  const [showtimeId, setShowtimeId] = useState('');
  const [allTime, setAllTime] = useState(true);   // a show's whole run is the usual question
  const [rows, setRows] = useState<ShowEarnings[] | null>(null);
  const [summary, setSummary] = useState<RevenueBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('productions').select('id, title').order('title');
      setProductions(data ?? []);
    })();
  }, []);

  const span = allTime ? ALL_TIME : range;

  // Per-show table: depends on the event + window (not on the selected show).
  useEffect(() => {
    setRows(null);
    setError(null);
    if (!productionId) return;
    let active = true;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('get_revenue_by_show', {
        start_date: span.start, end_date: span.end, p_production_id: productionId,
      });
      if (!active) return;
      if (rpcError) {
        logger.error('Failed to load earnings by show:', rpcError);
        setError(rpcError.message ?? 'Failed to load earnings by show.');
        return;
      }
      setRows(((data as any[]) ?? []).map(toShowEarnings));
    })();
    return () => { active = false; };
  }, [productionId, span.start, span.end]);

  // Payout cards for the selection: the whole event, or one show.
  useEffect(() => {
    setSummary(null);
    if (!productionId) return;
    let active = true;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('get_revenue_breakdown', {
        start_date: span.start, end_date: span.end,
        p_production_id: productionId, p_showtime_id: showtimeId || null,
      });
      if (!active) return;
      if (rpcError) {
        logger.error('Failed to load event payouts:', rpcError);
        setError(rpcError.message ?? 'Failed to load earnings.');
        return;
      }
      setSummary(toRevenueBreakdown(Array.isArray(data) ? data[0] : data));
    })();
    return () => { active = false; };
  }, [productionId, showtimeId, span.start, span.end]);

  const showOptions = useMemo(
    () => (rows ?? []).map(r => ({ value: r.showtime_id, label: showLabel(r.show_start_time) })),
    [rows],
  );
  const scopeLabel = allTime ? 'all sales to date' : 'selected period';
  const selectedShow = rows?.find(r => r.showtime_id === showtimeId) ?? null;
  const title = selectedShow
    ? `${selectedShow.production_title ?? 'Show'} — ${showLabel(selectedShow.show_start_time)}`
    : productions.find(p => p.id === productionId)?.title ?? 'Event';

  return (
    <View testID="earnings-by-show" style={eb.section}>
      <View style={s.card}>
        <View style={eb.head}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={s.cardTitle}>Earnings by event &amp; show</Text>
            <Text style={eb.sub}>Tickets sold, gross, fees and theatre take-home for one event or one performance.</Text>
          </View>
          <View style={eb.scope}>
            {[{ v: true, l: 'All time' }, { v: false, l: 'Selected period' }].map(o => (
              <TouchableOpacity key={o.l} style={[um.roleSegBtn, allTime === o.v && { backgroundColor: B.navy }]} onPress={() => setAllTime(o.v)} activeOpacity={0.8}>
                <Text style={[um.roleSegTxt, allTime === o.v && um.roleSegTxtActive]}>{o.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={eb.pickers}>
          <View style={eb.picker}>
            <WebSelect
              value={productionId}
              onChange={(v) => { setProductionId(v); setShowtimeId(''); }}
              options={productions.map(p => ({ value: p.id, label: p.title }))}
              placeholder="Choose an event…"
            />
          </View>
          <View style={eb.picker}>
            <WebSelect
              value={showtimeId}
              onChange={setShowtimeId}
              disabled={!productionId}
              options={[{ value: '', label: 'All shows of this event' }, ...showOptions]}
              placeholder="All shows of this event"
            />
          </View>
        </View>

        {!productionId ? (
          <Text style={um.empty}>Pick an event to see its earnings.</Text>
        ) : error ? (
          <Text style={[um.empty, { color: B.red }]}>{error}</Text>
        ) : rows === null ? (
          <LoadingState label="Loading earnings…" />
        ) : rows.length === 0 ? (
          <EmptyState icon="pie-chart-outline" title="No paid sales" subtitle={`Nothing sold for this event (${scopeLabel}).`} />
        ) : (
          <View>
            <View style={s.tHead}>
              <Text style={[s.th, eb.cShow]}>SHOW</Text>
              <Text style={[s.th, eb.cNum]}>TICKETS</Text>
              <Text style={[s.th, eb.cNum]}>GROSS</Text>
              <Text style={[s.th, eb.cNum]}>FEES</Text>
              <Text style={[s.th, eb.cNum]}>TAKE-HOME</Text>
            </View>
            {rows.map((r, i) => (
              <TouchableOpacity
                key={r.showtime_id}
                testID={`show-row-${r.showtime_id}`}
                style={[s.tRow, i % 2 === 1 && s.tRowAlt, r.showtime_id === showtimeId && eb.rowActive]}
                onPress={() => setShowtimeId(r.showtime_id === showtimeId ? '' : r.showtime_id)}
                activeOpacity={0.8}
              >
                <Text style={[s.td, eb.cShow]}>{showLabel(r.show_start_time)}</Text>
                <Text style={[s.td, eb.cNum]}>{formatInt(r.tickets_sold)}</Text>
                <Text style={[s.td, eb.cNum]}>{formatMoney(r.gross_collected)}</Text>
                <Text style={[s.td, eb.cNum]}>{formatMoney(r.fees_total)}</Text>
                <Text style={[s.td, s.tdBold, eb.cNum]}>{formatMoney(r.theater_net)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {productionId && !error && (
        <PayoutBreakdownPanel data={summary} error={null} title={`Payouts · ${title}`} scopeLabel={scopeLabel} />
      )}
    </View>
  );
};

const eb = createStyles({
  section: { marginBottom: 10 },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  sub: { fontSize: 12, color: B.txt2, marginTop: 4 },
  scope: { flexDirection: 'row', backgroundColor: B.bg, borderRadius: 8, padding: 3, gap: 2 },
  pickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  picker: { flexGrow: 1, flexBasis: 240, minWidth: 0, backgroundColor: B.bg, borderWidth: 1, borderColor: B.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 },
  cShow: { flex: 2.2, minWidth: 0 },
  cNum: { flex: 1, textAlign: 'right' },
  rowActive: { backgroundColor: B.amberBg },
});
