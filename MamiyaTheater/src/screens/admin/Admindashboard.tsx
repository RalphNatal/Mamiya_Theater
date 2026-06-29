import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, Modal,
  useWindowDimensions, Image,
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
type MovieOption = { id: string; title: string; poster_url: string | null };
type ShowtimeRow = {
  id: string;
  movie_id: string;
  start_time: string;
  price: number;
  available_seats: number;
  movies: { title: string } | null;
};

// ── SIDEBAR NAV ────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview',  label: 'Overview',  icon: '⊞' },
  { id: 'showtimes', label: 'Showtimes', icon: '▤' },
  { id: 'users',     label: 'Users',     icon: '⊙' },
  { id: 'settings',  label: 'Settings',  icon: '⊕' },
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

const WebSelect = ({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) => React.createElement(
  'select',
  { value, onChange: (e: any) => onChange(e.target.value), style: webInputStyle },
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

// ── SIDEBAR ───────────────────────────────────────────
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
            <Text style={[sb.icon, isActive && sb.iconActive]}>{item.icon}</Text>
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
  icon:        { fontSize: 15, color: 'rgba(255,255,255,0.45)', width: 20, textAlign: 'center' },
  iconActive:  { color: '#fff' },
  lbl:         { flex: 1, color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '500' },
  lblActive:   { color: '#fff', fontWeight: '700' },
  div:         { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 20, marginBottom: 14 },
  user:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 22 },
  avatar:      { width: 36, height: 36, borderRadius: 18, backgroundColor: B.red, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:   { color: '#fff', fontSize: 12, fontWeight: '800' },
  userName:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  userRole:    { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
});

// ── OVERVIEW ───────────────────────────────────────────
type OverviewStats = { movies: number; upcomingShowtimes: number; users: number };

const OverviewPanel = () => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [moviesRes, showtimesRes, usersRes] = await Promise.all([
          supabase.from('movies').select('*', { count: 'exact', head: true }),
          supabase.from('showtimes').select('*', { count: 'exact', head: true }).gte('start_time', new Date().toISOString()),
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
        ]);
        if (moviesRes.error) throw moviesRes.error;
        if (showtimesRes.error) throw showtimesRes.error;
        if (usersRes.error) throw usersRes.error;
        setStats({
          movies: moviesRes.count ?? 0,
          upcomingShowtimes: showtimesRes.count ?? 0,
          users: usersRes.count ?? 0,
        });
        setError(null);
      } catch (err: any) {
        console.error('Failed to load overview stats:', err);
        setError(err.message ?? 'Failed to load overview stats.');
      }
    };
    load();
  }, []);

  const cards = [
    { label: 'Total Movies',         value: stats?.movies,            icon: '🎬', color: B.red,    bg: B.roseBg   },
    { label: 'Upcoming Showtimes',   value: stats?.upcomingShowtimes, icon: '🕐', color: B.blue,   bg: B.blueBg   },
    { label: 'Registered Users',     value: stats?.users,             icon: '👥', color: B.purple, bg: B.purpleBg },
  ];

  return (
    <>
      <View style={s.ovHead}>
        <Text style={s.ovTitle}>Overview</Text>
        <Text style={s.ovSub}>A quick snapshot of what&apos;s in the system right now.</Text>
      </View>

      {error ? (
        <Text style={[um.empty, { color: B.red }]}>{error}</Text>
      ) : (
        <View style={[s.statsGrid, !isDesktop && s.statsGridMob]}>
          {cards.map((c) => (
            <View key={c.label} style={[s.statCard, !isDesktop && s.statCardMob]}>
              <View style={[s.statIcoBox, { backgroundColor: c.bg }]}>
                <Text style={s.statIco}>{c.icon}</Text>
              </View>
              <Text style={s.statLbl}>{c.label}</Text>
              <Text style={s.statVal}>{c.value === undefined ? '—' : c.value}</Text>
              <View style={[s.statBar, { backgroundColor: c.color }]} />
            </View>
          ))}
        </View>
      )}
    </>
  );
};

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
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>User Management</Text>
        <TouchableOpacity style={s.viewAllBtn} onPress={loadUsers}>
          <Text style={s.viewAllTxt}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={um.empty}>Loading users…</Text>
      ) : error ? (
        <Text style={[um.empty, { color: B.red }]}>{error}</Text>
      ) : users.length === 0 ? (
        <Text style={um.empty}>No users found.</Text>
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
  movies: MovieOption[];
  editing: ShowtimeRow | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: { movieId: string; startTimeIso: string; price: number; availableSeats: number }) => void;
}) => {
  const [movieId, setMovieId] = useState(editing?.movie_id ?? '');
  const [startDate, setStartDate] = useState(editing ? toDateValue(editing.start_time) : '');
  const [startTime, setStartTime] = useState(editing ? toTimeValue(editing.start_time) : '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [availableSeats, setAvailableSeats] = useState(editing ? String(editing.available_seats) : '100');

  const [movieError, setMovieError] = useState<string | null>(null);
  const [startTimeError, setStartTimeError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [seatsError, setSeatsError] = useState<string | null>(null);

  const minDate = toDateValue(new Date().toISOString());
  const editingMovie = editing ? movies.find(m => m.id === editing.movie_id) ?? null : null;

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
                  <Text style={fm.posterPlaceholderTxt}>🎬</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={fm.editingMovieTitle} numberOfLines={1}>
                  {editingMovie?.title ?? 'Unknown movie'}
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
                placeholder="Select a movie"
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
    width: '100%', maxWidth: 460,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: B.txt, marginBottom: 18 },
  editingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: B.bg, borderRadius: 10, padding: 12, marginBottom: 18,
  },
  posterThumb: { width: 44, height: 60, borderRadius: 6, backgroundColor: B.border },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  posterPlaceholderTxt: { fontSize: 18 },
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
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: B.bg },
  cancelText: { color: B.txt, fontWeight: '700', fontSize: 14 },
  submitBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: B.red },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ── SHOWTIMES CRUD ─────────────────────────────────────
const ShowtimesPanel = () => {
  const { showModal } = useAppModal();
  const [showtimes, setShowtimes] = useState<ShowtimeRow[]>([]);
  const [movies, setMovies] = useState<MovieOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingShowtime, setEditingShowtime] = useState<ShowtimeRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ShowtimeRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadShowtimes = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('showtimes')
        .select('id, start_time, price, available_seats, movie_id, movies(title)')
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
    const { data } = await supabase.from('movies').select('id, title, poster_url').order('title', { ascending: true });
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
        movie_id: values.movieId,
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
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>Showtimes</Text>
        <TouchableOpacity style={st.addBtn} onPress={openCreate} activeOpacity={0.85}>
          <Text style={st.addBtnText}>+ Add showtime</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={um.empty}>Loading showtimes…</Text>
      ) : error ? (
        <Text style={[um.empty, { color: B.red }]}>{error}</Text>
      ) : showtimes.length === 0 ? (
        <Text style={um.empty}>No showtimes yet. Add one to get started.</Text>
      ) : (
        <>
          <View style={s.tHead}>
            {[
              { lbl: 'MOVIE', f: 1.5 }, { lbl: 'DATE', f: 1 }, { lbl: 'TIME', f: 0.8 },
              { lbl: 'PRICE', f: 0.7 }, { lbl: 'SEATS', f: 0.7 }, { lbl: 'ACTIONS', f: 1.2 },
            ].map(h => (<Text key={h.lbl} style={[s.th, { flex: h.f }]}>{h.lbl}</Text>))}
          </View>
          {showtimes.map((row, i) => {
            const d = new Date(row.start_time);
            const isBeingEdited = formVisible && editingShowtime?.id === row.id;
            return (
              <View key={row.id} style={[s.tRow, i % 2 === 1 && s.tRowAlt, isBeingEdited && st.tRowHighlight]}>
                <Text style={[s.td, { flex: 1.5 }]} numberOfLines={1}>{row.movies?.title ?? 'Unknown movie'}</Text>
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
        </>
      )}

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
              })} showtime${deleteTarget.movies?.title ? ` for "${deleteTarget.movies.title}"` : ''}.`
            : undefined
        }
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </View>
  );
};

const st = StyleSheet.create({
  addBtn: { backgroundColor: B.red, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  tRowHighlight: { backgroundColor: B.amberBg },
  actionsCell: { flexDirection: 'row', gap: 8 },
  editBtn: { backgroundColor: B.bg, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText: { color: B.txt, fontSize: 11, fontWeight: '700' },
  deleteBtn: { backgroundColor: B.roseBg, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnText: { color: B.red, fontSize: 11, fontWeight: '700' },
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
                  <Text style={s.burgerIcon}>☰</Text>
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
            ) : (
              <OverviewPanel />
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
  burgerIcon:   { fontSize: 18, color: B.txt },
  pageTitle:    { fontSize: 16, fontWeight: '800', color: B.txt },
  topRight:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  siteBtn:      { backgroundColor: B.navy, borderRadius: 7, paddingHorizontal: 14, paddingVertical: 7 },
  siteBtnTxt:   { color: '#fff', fontSize: 12, fontWeight: '600' },
  logoutTxt:    { color: B.red, fontSize: 12, fontWeight: '600' },

  // CONTENT
  scroll:       { flex: 1 },
  content:      { padding: 32, paddingBottom: 48, maxWidth: 1120, width: '100%' },
  ovHead:       { marginBottom: 28 },
  ovTitle:      { fontSize: 24, fontWeight: '800', color: B.txt, letterSpacing: -0.3, marginBottom: 5 },
  ovSub:        { fontSize: 13, color: B.txt2 },

  // STATS
  statsGrid:    { flexDirection: 'row', gap: 16, marginBottom: 28, flexWrap: 'wrap' },
  statsGridMob: { gap: 12 },
  statCard:     { width: 232, flexGrow: 0, flexShrink: 0, backgroundColor: B.white, borderRadius: 14, padding: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  statCardMob:  { width: '47%' },
  statIcoBox:   { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  statIco:      { fontSize: 18 },
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
