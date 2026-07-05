import { createStyles, typography, layout } from '../../../theme';
import { B } from './brand';
export const s = createStyles({
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

  scroll:       { flex: 1 },
  content:      { ...layout.page, padding: 32, paddingBottom: 48 },

  pageHead:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 },
  pageHeadTitle:{ ...typography.heading1, fontSize: 24, lineHeight: 32, color: B.txt, marginBottom: 5 },
  pageHeadSub:  { ...typography.caption, fontSize: 13, color: B.txt2 },
  pageHeadBtn:  { backgroundColor: B.red, borderRadius: 9, paddingHorizontal: 18, paddingVertical: 11, flexShrink: 0 },
  pageHeadBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  statsGrid:    { flexDirection: 'row', gap: 16, marginBottom: 28, flexWrap: 'wrap' },
  statsGridMob: { gap: 12 },
  statCard:     { flexGrow: 1, flexShrink: 1, flexBasis: 210, minWidth: 210, backgroundColor: B.white, borderRadius: 14, padding: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  statCardMob:  { minWidth: '47%', flexBasis: '47%' },
  statIcoBox:   { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  statLbl:      { ...typography.caption, fontSize: 10.5, lineHeight: 14, fontWeight: '700', color: B.txtMu, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  statVal:      { ...typography.heading1, color: B.txt, letterSpacing: -0.6 },
  statBar:      { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },

  // CARD
  card:         { backgroundColor: B.white, borderRadius: 14, padding: 22, marginBottom: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardHead:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  cardTitle:    { ...typography.heading2, fontSize: 16, lineHeight: 22, fontWeight: '800', color: B.txt },
  viewAllBtn:   { backgroundColor: B.bg, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 6 },
  viewAllTxt:   { color: B.red, fontSize: 12, fontWeight: '700' },

  // TABLE
  tHead:        { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: B.border, marginBottom: 2 },
  th:           { fontSize: 10.5, fontWeight: '700', color: B.txtMu, letterSpacing: 0.4 },
  tRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderRadius: 7, paddingHorizontal: 4 },
  tRowAlt:      { backgroundColor: '#fafafa' },
  td:           { ...typography.body, fontSize: 13, lineHeight: 19, color: B.txt, flex: 1 },
  tdMuted:      { color: B.txt2 },
  tdBold:       { fontWeight: '700' },
});
export const um = createStyles({
  empty: { fontSize: 13, color: B.txtMu, paddingVertical: 20, textAlign: 'center' },
  // Two-column shell: side-by-side on desktop, stacked when space is tight.
  columns:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 },
  columnsStacked: { flexDirection: 'column' },
  column:         { flex: 1, minWidth: 0, marginBottom: 0 },   // desktop: share the row
  columnStacked:  { width: '100%', marginBottom: 0 },          // mobile: full-width, gap handles spacing
  count:          { fontSize: 12, fontWeight: '800', color: B.txt2, backgroundColor: B.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
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
  roleBadgeGuest: { backgroundColor: B.navy },
  roleBadgeTxt: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  roleBadgeTxtAdmin: { color: B.red },
  roleBadgeTxtUser: { color: B.txt2 },
  roleBadgeTxtGuest: { color: '#fff' },
  guestMeta: { fontSize: 11, color: B.txtMu, fontWeight: '600', textAlign: 'right' },
  actionBtn: { backgroundColor: B.navy, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8 },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
export const st = createStyles({
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
export const fm = createStyles({
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
