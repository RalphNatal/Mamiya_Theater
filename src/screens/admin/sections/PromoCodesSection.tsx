import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { downloadTextFile, slugify, toCsv } from '../../../lib/csv';
import { useAppModal } from '../../../components/ModalProvider';
import { createStyles } from '../../../theme';
import { VENUE_TIMEZONE, type PromoDiscountType } from '../../../config/venue';
import { B } from '../shared/brand';
import { s, um, fm } from '../shared/adminStyles';
import { formatInt } from '../shared/format';
import { WebDateInput, WebSelect } from '../components/WebInputs';
import { PageHeader, LoadingState, EmptyState } from '../components/Feedback';

// ── PROMO CODES (admin only) ─────────────────────────────────────────────────
// Per-recipient ticket limits, e.g. a graduation: generate 400 codes, each good
// for 1 free ticket to one show, export them as CSV and hand one to each student.
// Everything goes through assert_admin RPCs (generate_promo_codes,
// get_promo_batches, get_promo_batch_codes, set_promo_batch_active); codes are
// validated and consumed only inside create_pending_booking. See
// supabase/migrations/20261004140000_promo_codes.sql.

export type PromoBatch = {
  batch_id: string;
  batch_label: string;
  created_at: string;
  production_title: string | null;
  showtime_start: string | null;
  discount_type: PromoDiscountType;
  discount_value: number;
  max_tickets: number;
  expires_at: string | null;
  codes: number;
  codes_active: number;
  codes_used: number;
  tickets_used: number;
  tickets_allowed: number;
};

export type BatchCodeRow = { code: string; max_tickets: number; used_tickets: number; active: boolean; expires_at: string | null };

const DISCOUNTS: { id: PromoDiscountType; label: string }[] = [
  { id: 'free', label: 'Free ticket' },
  { id: 'percent', label: '% off' },
  { id: 'fixed', label: '$ off' },
  { id: 'none', label: 'Limit only' },
];

const fmtShow = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE,
  });

export const describeDiscount = (type: PromoDiscountType, value: number): string =>
  type === 'free' ? 'Free ticket'
    : type === 'percent' ? `${value}% off`
    : type === 'fixed' ? `$${value.toFixed(2)} off each ticket`
    : 'No discount (limit only)';

// The CSV handed out: one code per row, ready for a mail merge.
export const batchCsv = (batch: Pick<PromoBatch, 'batch_label' | 'production_title' | 'showtime_start' | 'discount_type' | 'discount_value'>, rows: BatchCodeRow[]): string =>
  toCsv([
    ['code', 'tickets_allowed', 'tickets_used', 'active', 'expires_at', 'batch', 'event', 'show', 'discount'],
    ...rows.map(r => [
      r.code, r.max_tickets, r.used_tickets, r.active ? 'yes' : 'no', r.expires_at ?? '',
      batch.batch_label, batch.production_title ?? 'Any event',
      batch.showtime_start ? fmtShow(batch.showtime_start) : 'Any show',
      describeDiscount(batch.discount_type, Number(batch.discount_value)),
    ]),
  ]);

type ShowOption = { id: string; production_id: string; start_time: string };

export const PromoCodesPanel = () => {
  const { showModal } = useAppModal();
  const [batches, setBatches] = useState<PromoBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [productions, setProductions] = useState<{ id: string; title: string }[]>([]);
  const [shows, setShows] = useState<ShowOption[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Generate form
  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState('400');
  const [prefix, setPrefix] = useState('');
  const [productionId, setProductionId] = useState('');
  const [showtimeId, setShowtimeId] = useState('');
  const [maxTickets, setMaxTickets] = useState('1');
  const [discountType, setDiscountType] = useState<PromoDiscountType>('free');
  const [discountValue, setDiscountValue] = useState('');
  const [expires, setExpires] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const [b, p, st] = await Promise.all([
        supabase.rpc('get_promo_batches'),
        supabase.from('productions').select('id, title').order('title'),
        supabase.from('showtimes').select('id, production_id, start_time')
          .gte('start_time', new Date(Date.now() - 86400000).toISOString()).order('start_time'),
      ]);
      if (b.error) throw b.error;
      setBatches((b.data ?? []).map((r: any) => ({
        ...r,
        discount_value: Number(r.discount_value ?? 0),
        codes: Number(r.codes), codes_active: Number(r.codes_active), codes_used: Number(r.codes_used),
        tickets_used: Number(r.tickets_used), tickets_allowed: Number(r.tickets_allowed),
      })));
      setProductions(p.data ?? []);
      setShows(st.data ?? []);
    } catch (err: any) {
      logger.error('Failed to load promo codes:', err);
      setError(err.message ?? 'Failed to load promo codes.');
    }
  };

  useEffect(() => { load(); }, []);

  const showOptions = useMemo(
    () => shows.filter(x => x.production_id === productionId).map(x => ({ value: x.id, label: fmtShow(x.start_time) })),
    [shows, productionId],
  );

  const exportBatch = async (batch: PromoBatch) => {
    try {
      setBusyId(batch.batch_id);
      const { data, error: rpcError } = await supabase.rpc('get_promo_batch_codes', { p_batch_id: batch.batch_id });
      if (rpcError) throw rpcError;
      const ok = downloadTextFile(`promo-codes-${slugify(batch.batch_label)}.csv`, batchCsv(batch, data ?? []));
      if (!ok) showModal({ title: 'Export needs a browser', message: 'Open the admin dashboard on the web to download CSV files.', variant: 'error' });
    } catch (err: any) {
      logger.error('Promo export failed:', err);
      showModal({ title: 'Export failed', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const setActive = async (batch: PromoBatch, active: boolean) => {
    try {
      setBusyId(batch.batch_id);
      const { error: rpcError } = await supabase.rpc('set_promo_batch_active', { p_batch_id: batch.batch_id, p_active: active });
      if (rpcError) throw rpcError;
      await load();
    } catch (err: any) {
      showModal({ title: 'Update failed', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const generate = async () => {
    const qty = parseInt(quantity, 10);
    const max = parseInt(maxTickets, 10);
    const value = Number(discountValue);
    const problem =
      !label.trim() ? 'Give the batch a label.'
      : !(qty >= 1 && qty <= 5000) ? 'Quantity must be between 1 and 5000.'
      : !(max >= 1) ? 'Tickets per code must be at least 1.'
      : discountType === 'percent' && !(value > 0 && value <= 100) ? 'Enter a percentage between 0 and 100.'
      : discountType === 'fixed' && !(value > 0) ? 'Enter the dollar amount off.'
      : null;
    if (problem) { showModal({ title: 'Check the form', message: problem, variant: 'error' }); return; }

    try {
      setGenerating(true);
      const { data, error: rpcError } = await supabase.rpc('generate_promo_codes', {
        p_quantity: qty,
        p_batch_label: label.trim(),
        p_prefix: prefix.trim() || null,
        p_production_id: productionId || null,
        p_showtime_id: showtimeId || null,
        p_max_tickets: max,
        p_discount_type: discountType,
        p_discount_value: discountType === 'percent' || discountType === 'fixed' ? value : 0,
        // End of the chosen day at the venue (Honolulu is UTC−10, no DST).
        p_expires_at: expires ? `${expires}T23:59:59-10:00` : null,
      });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      await load();
      setLabel('');
      showModal({
        title: 'Codes created',
        message: `${formatInt(Number(row?.created ?? qty))} codes are ready. Use “Export CSV” on the batch to download them.`,
        variant: 'success',
      });
    } catch (err: any) {
      logger.error('Promo generation failed:', err);
      showModal({ title: 'Could not create codes', message: err.message ?? 'Something went wrong.', variant: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const field = (lbl: string, node: React.ReactNode, hint?: string) => (
    <View style={[fm.fieldGroup, pc.field]}>
      <Text style={fm.label}>{lbl}</Text>
      <View style={fm.inputWrapper}>{node}</View>
      {hint ? <Text style={pc.hint}>{hint}</Text> : null}
    </View>
  );

  return (
    <>
      <PageHeader
        title="Promo codes"
        subtitle="Per-person ticket limits — e.g. one free graduation ticket per student."
        actionLabel="Refresh"
        onAction={load}
      />

      {/* ── Generate a batch ── */}
      <View style={s.card}>
        <Text style={[s.cardTitle, pc.mb]}>Generate a batch</Text>
        <View style={pc.grid}>
          {field('Batch label', <TextInput style={fm.input} value={label} onChangeText={setLabel} placeholder="Class of 2027 graduation" />)}
          {field('How many codes', <TextInput style={fm.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />, 'One code per person, up to 5000.')}
          {field('Code prefix (optional)', <TextInput style={fm.input} value={prefix} onChangeText={setPrefix} placeholder="GRAD" autoCapitalize="characters" />, 'Codes look like GRAD-AB2CD-EF3GH.')}
          {field('Tickets per code', <TextInput style={fm.input} value={maxTickets} onChangeText={setMaxTickets} keyboardType="number-pad" />, 'Total across all of that person’s orders.')}
          {field('Event', <WebSelect value={productionId} onChange={v => { setProductionId(v); setShowtimeId(''); }}
            options={[{ value: '', label: 'Any event' }, ...productions.map(p => ({ value: p.id, label: p.title }))]} placeholder="Any event" />)}
          {field('Show', <WebSelect value={showtimeId} onChange={setShowtimeId} disabled={!productionId}
            options={[{ value: '', label: 'Any show of this event' }, ...showOptions]} placeholder="Any show" />)}
          {field('Expires (optional)', <WebDateInput value={expires} onChange={setExpires} />, 'Codes stop working after this day.')}
        </View>

        <Text style={fm.label}>Discount</Text>
        <View style={[um.roleSeg, pc.seg]}>
          {DISCOUNTS.map(d => (
            <TouchableOpacity
              key={d.id}
              testID={`discount-${d.id}`}
              style={[um.roleSegBtn, discountType === d.id && { backgroundColor: B.navy }]}
              onPress={() => setDiscountType(d.id)}
              activeOpacity={0.8}
            >
              <Text style={[um.roleSegTxt, discountType === d.id && um.roleSegTxtActive]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {(discountType === 'percent' || discountType === 'fixed') && field(
          discountType === 'percent' ? 'Percent off' : 'Dollars off each ticket',
          <TextInput style={fm.input} value={discountValue} onChangeText={setDiscountValue} keyboardType="decimal-pad" />,
        )}
        <Text style={pc.hint}>
          {discountType === 'free'
            ? 'Free tickets are $0 and carry no fees. To make the show code-only, turn on “Promo code required” on the showtime.'
            : 'The discount applies per ticket, before fees.'}
        </Text>

        <TouchableOpacity
          testID="generate-codes"
          style={[s.pageHeadBtn, pc.genBtn, generating && { opacity: 0.6 }]}
          onPress={generate}
          disabled={generating}
          activeOpacity={0.85}
        >
          <Text style={s.pageHeadBtnText}>{generating ? 'Generating…' : 'Generate codes'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Batches ── */}
      <View style={s.card}>
        <Text style={[s.cardTitle, pc.mb]}>Batches</Text>
        {error ? (
          <Text style={[um.empty, { color: B.red }]}>{error}</Text>
        ) : batches === null ? (
          <LoadingState label="Loading batches…" />
        ) : batches.length === 0 ? (
          <EmptyState icon="pricetag-outline" title="No promo codes yet" subtitle="Generate a batch above." />
        ) : (
          batches.map(b => (
            <View key={b.batch_id} style={pc.batch} testID={`batch-${b.batch_id}`}>
              <View style={pc.batchInfo}>
                <Text style={um.name}>{b.batch_label}{b.codes_active === 0 ? '  (inactive)' : ''}</Text>
                <Text style={um.email}>
                  {b.production_title ?? 'Any event'} · {b.showtime_start ? fmtShow(b.showtime_start) : 'any show'} · {describeDiscount(b.discount_type, b.discount_value)} · {b.max_tickets} ticket{b.max_tickets === 1 ? '' : 's'} per code
                  {b.expires_at ? ` · expires ${new Date(b.expires_at).toLocaleDateString(undefined, { timeZone: VENUE_TIMEZONE })}` : ''}
                </Text>
                <Text style={pc.usage}>
                  {formatInt(b.codes_used)} of {formatInt(b.codes)} codes used · {formatInt(b.tickets_used)} of {formatInt(b.tickets_allowed)} tickets
                </Text>
              </View>
              <View style={pc.actions}>
                <TouchableOpacity style={pc.btn} onPress={() => exportBatch(b)} disabled={busyId === b.batch_id}>
                  <Text style={pc.btnTxt}>Export CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[pc.btn, b.codes_active > 0 && pc.btnDanger]}
                  onPress={() => setActive(b, b.codes_active === 0)}
                  disabled={busyId === b.batch_id}
                >
                  <Text style={[pc.btnTxt, b.codes_active > 0 && { color: B.red }]}>{b.codes_active > 0 ? 'Deactivate' : 'Activate'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );
};

const pc = createStyles({
  mb: { marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
  field: { flexGrow: 1, flexBasis: 240, minWidth: 0 },
  hint: { color: B.txtMu, fontSize: 11, marginTop: 6, lineHeight: 15 },
  seg: { alignSelf: 'flex-start', marginBottom: 14, flexWrap: 'wrap' },
  genBtn: { alignSelf: 'flex-start', marginTop: 18 },
  batch: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: B.border },
  batchInfo: { flexGrow: 1, flexBasis: 280, minWidth: 0 },
  usage: { fontSize: 12, color: B.txt2, marginTop: 4, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  btn: { backgroundColor: B.bg, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  btnDanger: { backgroundColor: B.roseBg },
  btnTxt: { color: B.txt, fontSize: 12, fontWeight: '700' },
});
