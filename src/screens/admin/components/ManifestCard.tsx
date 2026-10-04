import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { downloadTextFile, slugify } from '../../../lib/csv';
import { manifestCsv, manifestHtml, manifestTotals, printManifest, toManifestRows, type ManifestRow } from '../../../lib/manifest';
import { useAppModal } from '../../../components/ModalProvider';
import { createStyles } from '../../../theme';
import { VENUE_TIMEZONE } from '../../../config/venue';
import { B } from '../shared/brand';
import { s } from '../shared/adminStyles';
import { WebSelect } from './WebInputs';

// Printable door manifest for one show — staff + admin (get_show_manifest is
// assert_staff and returns no money). Names, seats, ticket counts, check-in
// state and order references, sorted by the buyer's last name.

type ShowOption = { id: string; start_time: string; productions: { title: string } | null };

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE, timeZoneName: 'short',
  });

export const ManifestCard = () => {
  const { showModal } = useAppModal();
  const [shows, setShows] = useState<ShowOption[]>([]);
  const [showtimeId, setShowtimeId] = useState('');
  const [rows, setRows] = useState<ManifestRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // Today's and upcoming shows (no prices selected).
      const { data, error } = await supabase
        .from('showtimes')
        .select('id, start_time, productions(title)')
        .gte('start_time', new Date(Date.now() - 12 * 3600e3).toISOString())
        .order('start_time', { ascending: true })
        .limit(200);
      if (error) logger.error('Manifest showtimes failed:', error);
      setShows((data as any) ?? []);
    })();
  }, []);

  const show = shows.find(x => x.id === showtimeId) ?? null;
  const showMeta = show ? { title: show.productions?.title ?? 'Show', when: fmtWhen(show.start_time) } : null;

  const load = async (): Promise<ManifestRow[] | null> => {
    if (!showtimeId) return null;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('get_show_manifest', { p_showtime_id: showtimeId });
      if (error) throw error;
      const r = toManifestRows((data as any) ?? []);
      setRows(r);
      return r;
    } catch (err: any) {
      logger.error('Manifest load failed:', err);
      showModal({ title: 'Could not load manifest', message: err.message ?? 'Something went wrong.', variant: 'error' });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onPrint = async () => {
    const r = await load();
    if (!r || !showMeta) return;
    const printedAt = new Date().toLocaleString(undefined, { timeZone: VENUE_TIMEZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    if (!printManifest(manifestHtml(showMeta, r, printedAt))) {
      showModal({ title: 'Allow pop-ups to print', message: 'Your browser blocked the print window. Allow pop-ups for this site, or use “Download CSV”.', variant: 'error' });
    }
  };

  const onCsv = async () => {
    const r = await load();
    if (!r || !showMeta) return;
    downloadTextFile(`manifest-${slugify(showMeta.title)}-${show!.start_time.slice(0, 10)}.csv`, manifestCsv(r));
  };

  const totals = rows ? manifestTotals(rows) : null;

  return (
    <View style={s.card}>
      <Text style={mc.label}>Door manifest</Text>
      <Text style={mc.hint}>Printable list for the door: attendee, seat, tickets, a check-in box and the order reference — sorted by last name.</Text>
      <View style={mc.row}>
        <View style={mc.select}>
          <WebSelect
            value={showtimeId}
            onChange={(v) => { setShowtimeId(v); setRows(null); }}
            options={shows.map(x => ({ value: x.id, label: `${x.productions?.title ?? 'Show'} — ${fmtWhen(x.start_time)}` }))}
            placeholder="Choose a show…"
          />
        </View>
        <TouchableOpacity testID="manifest-print" style={[mc.btn, (!showtimeId || busy) && mc.disabled]} disabled={!showtimeId || busy} onPress={onPrint} activeOpacity={0.85}>
          <Icon name="print-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
          <Text style={mc.btnTxt}>Print / PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[mc.btn, mc.btnAlt, (!showtimeId || busy) && mc.disabled]} disabled={!showtimeId || busy} onPress={onCsv} activeOpacity={0.85}>
          <Icon name="download-outline" size={15} color={B.txt} style={{ marginRight: 6 }} />
          <Text style={[mc.btnTxt, { color: B.txt }]}>Download CSV</Text>
        </TouchableOpacity>
      </View>
      {totals && (
        <Text style={mc.totals}>
          {totals.orders} order{totals.orders === 1 ? '' : 's'} · {totals.tickets} ticket{totals.tickets === 1 ? '' : 's'} · {totals.checkedIn} checked in
        </Text>
      )}
    </View>
  );
};

const mc = createStyles({
  label: { fontSize: 11, fontWeight: '700', color: B.txt2, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 },
  hint: { fontSize: 12, color: B.txtMu, marginBottom: 12, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  select: { flexGrow: 1, flexBasis: 260, minWidth: 0, backgroundColor: B.bg, borderWidth: 1, borderColor: B.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 },
  btn: { flexDirection: 'row', alignItems: 'center', backgroundColor: B.navy, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11, minHeight: 44 },
  btnAlt: { backgroundColor: B.bg },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.5 },
  totals: { marginTop: 10, fontSize: 12, color: B.txt2, fontWeight: '600' },
});
