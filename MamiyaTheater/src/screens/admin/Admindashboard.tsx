import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar,
  useWindowDimensions, Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useAppModal } from '../../components/ModalProvider';

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
type Screen = 'home' | 'login' | 'signup' | 'about' | 'profile' | 'contact' | 'admin';
type Props  = { onNavigate: (screen: Screen) => void };
type TxStatus = 'Completed' | 'Pending' | 'Refunded';
type Tx = { id: string; customer: string; show: string; seats: number; amount: string; status: TxStatus; date: string };
type ProfileRow = { id: string; full_name: string | null; email: string | null; role: string | null };

// ── MOCK DATA ──────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',   icon: '⊞' },
  { id: 'shows',     label: 'Shows',        icon: '⋯', badge: 2 },
  { id: 'orders',    label: 'Orders',       icon: '≡', badge: 8 },
  { id: 'users',     label: 'User Management', icon: '⊙' },
  { id: 'venues',    label: 'Venues',       icon: '⊓' },
  { id: 'pricing',   label: 'Pricing',      icon: '$' },
  { id: 'seating',   label: 'Seating Map',  icon: '⊡' },
  { id: 'reports',   label: 'Reports',      icon: '⊟' },
  { id: 'settings',  label: 'Settings',     icon: '⊕' },
];

const STATS = [
  { label: 'Tickets Sold Today', value: '247',      change: '+18%', up: true,  icon: '🎟', color: B.red,    bg: B.roseBg   },
  { label: 'Weekly Revenue',     value: '$18,920',  change: '+12%', up: true,  icon: '💰', color: B.amber,  bg: B.amberBg  },
  { label: 'Occupancy Rate',     value: '91.4%',    change: '+3%',  up: true,  icon: '💺', color: B.green,  bg: B.greenBg  },
  { label: 'Active Shows',       value: '6',        change: '+1',   up: true,  icon: '🎭', color: B.blue,   bg: B.blueBg   },
  { label: 'New Signups',        value: '34',       change: '+8%',  up: true,  icon: '👥', color: B.purple, bg: B.purpleBg },
  { label: 'Pending Refunds',    value: '4',        change: '-2',   up: false, icon: '↩', color: B.rose,   bg: B.roseBg   },
];

const TRANSACTIONS: Tx[] = [
  { id: 'ORD-9482', customer: 'Alice Johnson',   show: 'The Great Gatsby',       seats: 2, amount: '$110.60', status: 'Completed', date: 'Today, 2:30 PM'  },
  { id: 'ORD-9481', customer: 'Michael Smith',   show: 'Wicked',                 seats: 4, amount: '$180.00', status: 'Completed', date: 'Today, 1:15 PM'  },
  { id: 'ORD-9480', customer: 'Emma Davis',      show: 'Hamilton',               seats: 3, amount: '$255.00', status: 'Pending',   date: 'Today, 12:00 PM' },
  { id: 'ORD-9479', customer: 'James Wilson',    show: 'The Lion King',          seats: 2, amount: '$140.00', status: 'Completed', date: 'Yesterday'        },
  { id: 'ORD-9478', customer: 'Olivia Martinez', show: 'Chicago',                seats: 1, amount: '$100.00', status: 'Refunded',  date: 'Yesterday'        },
  { id: 'ORD-9477', customer: 'Robert Brown',    show: 'Phantom of the Opera',   seats: 2, amount: '$90.00',  status: 'Completed', date: 'Jun 23'           },
];

const TOP_SHOWS = [
  { title: 'Hamilton',           tickets: 342, revenue: '$41,040', pct: 95, color: B.red    },
  { title: 'The Great Gatsby',   tickets: 289, revenue: '$31,790', pct: 80, color: B.gold   },
  { title: 'Wicked',             tickets: 201, revenue: '$18,090', pct: 56, color: B.blue   },
  { title: 'The Lion King',      tickets: 178, revenue: '$12,460', pct: 49, color: B.green  },
  { title: 'Chicago',            tickets: 134, revenue: '$10,720', pct: 37, color: B.purple },
];

const REVENUE_BARS = [
  { day: 'Mon', val: 3.2, pct: 45 },
  { day: 'Tue', val: 4.8, pct: 67 },
  { day: 'Wed', val: 3.9, pct: 55 },
  { day: 'Thu', val: 6.2, pct: 87 },
  { day: 'Fri', val: 7.1, pct: 100, peak: true },
  { day: 'Sat', val: 5.8, pct: 82 },
  { day: 'Sun', val: 4.2, pct: 59 },
];

const UPCOMING = [
  { show: 'The Great Gatsby', time: 'Tonight · 7:30 PM', seats: '142/180', pct: 79, hot: true  },
  { show: 'Wicked',           time: 'Tomorrow · 8:00 PM', seats: '98/180',  pct: 54, hot: false },
  { show: 'Hamilton',         time: 'Jun 28 · 7:00 PM',  seats: '167/180', pct: 93, hot: false },
];

// ── STATUS BADGE ──────────────────────────────────────
const StatusBadge = ({ status }: { status: TxStatus }) => {
  const cfg = {
    Completed: { bg: B.greenBg, color: B.green  },
    Pending:   { bg: B.amberBg, color: B.amber  },
    Refunded:  { bg: B.roseBg,  color: B.rose   },
  }[status];
  return (
    <View style={[badge.wrap, { backgroundColor: cfg.bg }]}>
      <View style={[badge.dot, { backgroundColor: cfg.color }]} />
      <Text style={[badge.label, { color: cfg.color }]}>{status}</Text>
    </View>
  );
};
const badge = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '700' },
});

// ── REVENUE CHART ─────────────────────────────────────
const RevenueChart = () => (
  <View style={rc.wrap}>
    <View style={rc.head}>
      <View>
        <Text style={rc.title}>Weekly Revenue</Text>
        <Text style={rc.sub}>Jun 19 – 25, 2026</Text>
      </View>
      <View style={rc.chip}>
        <Text style={rc.chipTxt}>↑ 12% vs last week</Text>
      </View>
    </View>
    <View style={rc.bars}>
      {REVENUE_BARS.map(b => (
        <View key={b.day} style={rc.col}>
          <Text style={rc.val}>${b.val}k</Text>
          <View style={rc.track}>
            <View style={[rc.fill, {
              height: `${b.pct}%` as any,
              backgroundColor: b.peak ? B.red : B.navy,
              opacity: b.peak ? 1 : 0.15,
            }]} />
          </View>
          <Text style={[rc.day, b.peak && { color: B.red, fontWeight: '700' }]}>{b.day}</Text>
        </View>
      ))}
    </View>
    <View style={rc.foot}>
      <Text style={rc.footLbl}>Total this week</Text>
      <Text style={rc.footVal}>$35,200</Text>
    </View>
  </View>
);
const rc = StyleSheet.create({
  wrap:    { backgroundColor: B.white, borderRadius: 14, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  head:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title:   { fontSize: 15, fontWeight: '800', color: B.txt, marginBottom: 2 },
  sub:     { fontSize: 11, color: B.txtMu },
  chip:    { backgroundColor: B.greenBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipTxt: { color: B.green, fontSize: 11, fontWeight: '700' },
  bars:    { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 110, marginBottom: 12 },
  col:     { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  val:     { fontSize: 8, color: B.txtMu, marginBottom: 4 },
  track:   { width: '100%', flex: 1, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden', backgroundColor: 'transparent' },
  fill:    { width: '100%', borderRadius: 4 },
  day:     { fontSize: 10, color: B.txtMu, marginTop: 6 },
  foot:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: B.border },
  footLbl: { fontSize: 12, color: B.txt2 },
  footVal: { fontSize: 18, fontWeight: '800', color: B.txt },
});

// ── SIDEBAR ───────────────────────────────────────────
const Sidebar = ({ active, onSelect }: {
  active: string;
  onSelect: (id: string) => void;
}) => (
  <View style={sb.wrap}>
    {/* Brand — matches reference */}
    <View style={sb.brand}>
      <Image source={require('../../assets/SLS-175-Years-Logo-_r4_.png')} style={sb.brandLogo} resizeMode="contain" />
      <Text style={sb.brandName}>StageTix Admin</Text>
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
            {item.badge ? (
              <View style={sb.badge}><Text style={sb.badgeTxt}>{item.badge}</Text></View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>

    <View style={sb.div} />

    {/* User card */}
    <View style={sb.user}>
      <View style={sb.avatar}><Text style={sb.avatarTxt}>SM</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={sb.userName}>System Manager</Text>
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
  badge:       { backgroundColor: B.red, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: 'center' },
  badgeTxt:    { color: '#fff', fontSize: 10, fontWeight: '800' },
  div:         { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 20, marginBottom: 14 },
  user:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 22 },
  avatar:      { width: 36, height: 36, borderRadius: 18, backgroundColor: B.red, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:   { color: '#fff', fontSize: 12, fontWeight: '800' },
  userName:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  userRole:    { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
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
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
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

// ── ADMIN DASHBOARD ────────────────────────────────────
const AdminDashboard = ({ onNavigate }: Props) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [activeNav, setActiveNav]     = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── RBAC GUARD ── force non-admins off this screen.
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
        .select('role')
        .eq('id', user.id)
        .single();

      if (error || profile?.role !== 'admin') {
        showModal({
          title: 'Unauthorized access',
          message: 'You do not have permission to view this page.',
          variant: 'error',
        });
        onNavigate('home');
      }
    };

    checkAccess();
  }, [onNavigate, showModal]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.navyDp} />
      <View style={s.layout}>

        {/* ── SIDEBAR ── */}
        {isDesktop ? (
          <Sidebar active={activeNav} onSelect={setActiveNav} />
        ) : sidebarOpen ? (
          <>
            <TouchableOpacity style={s.overlay} onPress={() => setSidebarOpen(false)} />
            <View style={s.mobileSb}>
              <Sidebar
                active={activeNav}
                onSelect={(id) => { setActiveNav(id); setSidebarOpen(false); }}
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
              <Text style={s.pageTitle}>Management Dashboard</Text>
            </View>
            <View style={s.topRight}>
              <TouchableOpacity style={s.siteBtn} onPress={() => onNavigate('home')}>
                <Text style={s.siteBtnTxt}>View Live Site</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onNavigate('login')}>
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
            ) : (
              <>
            {/* Overview heading */}
            <View style={s.ovHead}>
              <Text style={s.ovTitle}>Overview</Text>
              <Text style={s.ovSub}>Track your ticketing performance and recent activity.</Text>
            </View>

            {/* ── STAT CARDS ── */}
            <View style={[s.statsGrid, !isDesktop && s.statsGridMob]}>
              {STATS.map((stat, i) => (
                <View key={i} style={[s.statCard, !isDesktop && s.statCardMob]}>
                  <View style={s.statTop}>
                    <View style={[s.statIcoBox, { backgroundColor: stat.bg }]}>
                      <Text style={s.statIco}>{stat.icon}</Text>
                    </View>
                    <View style={[s.statChip, { backgroundColor: stat.up ? B.greenBg : B.roseBg }]}>
                      <Text style={[s.statChipTxt, { color: stat.up ? B.green : B.rose }]}>
                        {stat.up ? '↑' : '↓'} {stat.change}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.statLbl}>{stat.label}</Text>
                  <Text style={s.statVal}>{stat.value}</Text>
                  <View style={[s.statBar, { backgroundColor: stat.color }]} />
                </View>
              ))}
            </View>

            {/* ── TRANSACTIONS + TOP SHOWS (TOP) ── */}
            <View style={[s.row, !isDesktop && s.rowMob]}>

              {/* Transactions */}
              <View style={[s.card, { flex: isDesktop ? 1.6 : undefined }]}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>Recent Transactions</Text>
                  <TouchableOpacity style={s.viewAllBtn}>
                    <Text style={s.viewAllTxt}>View All Orders →</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.tHead}>
                  {[
                    { lbl: 'ORDER ID', f: 1.1 }, { lbl: 'CUSTOMER', f: 1.3 },
                    { lbl: 'SHOW', f: 1.4 },     { lbl: 'SEATS', f: 0.6 },
                    { lbl: 'AMOUNT', f: 0.9 },   { lbl: 'STATUS', f: 1.1 },
                  ].map(h => (
                    <Text key={h.lbl} style={[s.th, { flex: h.f }]}>{h.lbl}</Text>
                  ))}
                </View>
                {TRANSACTIONS.map((tx, i) => (
                  <View key={tx.id} style={[s.tRow, i % 2 === 1 && s.tRowAlt]}>
                    <Text style={[s.td, s.tdId,   { flex: 1.1 }]}>{tx.id}</Text>
                    <Text style={[s.td,             { flex: 1.3 }]} numberOfLines={1}>{tx.customer}</Text>
                    <Text style={[s.td, s.tdMuted, { flex: 1.4 }]} numberOfLines={1}>{tx.show}</Text>
                    <Text style={[s.td, s.tdCenter,{ flex: 0.6 }]}>{tx.seats}</Text>
                    <Text style={[s.td, s.tdBold,  { flex: 0.9 }]}>{tx.amount}</Text>
                    <View style={{ flex: 1.1 }}><StatusBadge status={tx.status} /></View>
                  </View>
                ))}
              </View>

              {/* Top Shows — desktop only beside transactions */}
              {isDesktop && (
                <View style={[s.card, { flex: 1, marginLeft: 16 }]}>
                  <View style={s.cardHead}>
                    <Text style={s.cardTitle}>Top Performing Shows</Text>
                    <TouchableOpacity><Text style={s.cardLink}>See All →</Text></TouchableOpacity>
                  </View>
                  {TOP_SHOWS.map((show, i) => (
                    <View key={i} style={s.showRow}>
                      <View style={[s.showRank, {
                        backgroundColor: i === 0 ? B.red : i === 1 ? B.gold : B.border,
                      }]}>
                        <Text style={[s.showRankTxt, { color: i < 2 ? '#fff' : B.txt2 }]}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={s.showMeta}>
                          <Text style={s.showName} numberOfLines={1}>{show.title}</Text>
                          <Text style={s.showRev}>{show.revenue}</Text>
                        </View>
                        <View style={s.progTrack}>
                          <View style={[s.progFill, { width: `${show.pct}%` as any, backgroundColor: show.color }]} />
                        </View>
                        <Text style={s.showTix}>{show.tickets} tickets · {show.pct}% capacity</Text>
                      </View>
                    </View>
                  ))}
                  <View style={s.summBox}>
                    <View style={s.summItem}>
                      <Text style={s.summVal}>1,144</Text>
                      <Text style={s.summLbl}>Total Tickets</Text>
                    </View>
                    <View style={s.summDiv} />
                    <View style={s.summItem}>
                      <Text style={[s.summVal, { color: B.red }]}>$114,100</Text>
                      <Text style={s.summLbl}>Total Revenue</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* ── WEEKLY REVENUE + UPCOMING (BELOW) ── */}
            <View style={[s.row, !isDesktop && s.rowMob]}>
              <View style={{ flex: isDesktop ? 1.6 : undefined, marginBottom: isDesktop ? 0 : 16 }}>
                <RevenueChart />
              </View>
              <View style={[s.card, { flex: isDesktop ? 1 : undefined, marginLeft: isDesktop ? 16 : 0 }]}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>Upcoming Tonight</Text>
                  <TouchableOpacity><Text style={s.cardLink}>Schedule →</Text></TouchableOpacity>
                </View>
                {UPCOMING.map((u, i) => (
                  <View key={i} style={[s.upRow, i < UPCOMING.length - 1 && s.upRowBorder]}>
                    <View style={s.upMeta}>
                      <Text style={s.upShow} numberOfLines={1}>{u.show}</Text>
                      {u.hot && (
                        <View style={s.hotBadge}><Text style={s.hotTxt}>🔥 Selling Fast</Text></View>
                      )}
                    </View>
                    <Text style={s.upTime}>{u.time}</Text>
                    <View style={s.upBarRow}>
                      <View style={s.upTrack}>
                        <View style={[s.upFill, {
                          width: `${u.pct}%` as any,
                          backgroundColor: u.pct > 85 ? B.red : B.navy,
                        }]} />
                      </View>
                      <Text style={s.upSeats}>{u.seats}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Top Shows — mobile only */}
            {!isDesktop && (
              <View style={s.card}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>Top Performing Shows</Text>
                  <TouchableOpacity><Text style={s.cardLink}>See All →</Text></TouchableOpacity>
                </View>
                {TOP_SHOWS.map((show, i) => (
                  <View key={i} style={s.showRow}>
                    <View style={[s.showRank, { backgroundColor: i === 0 ? B.red : i === 1 ? B.gold : B.border }]}>
                      <Text style={[s.showRankTxt, { color: i < 2 ? '#fff' : B.txt2 }]}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={s.showMeta}>
                        <Text style={s.showName} numberOfLines={1}>{show.title}</Text>
                        <Text style={s.showRev}>{show.revenue}</Text>
                      </View>
                      <View style={s.progTrack}>
                        <View style={[s.progFill, { width: `${show.pct}%` as any, backgroundColor: show.color }]} />
                      </View>
                      <Text style={s.showTix}>{show.tickets} tickets · {show.pct}% capacity</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
              </>
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
  content:      { padding: 24, paddingBottom: 40 },
  ovHead:       { marginBottom: 20 },
  ovTitle:      { fontSize: 22, fontWeight: '800', color: B.txt, marginBottom: 4 },
  ovSub:        { fontSize: 13, color: B.txt2 },

  // STATS
  statsGrid:    { flexDirection: 'row', gap: 14, marginBottom: 20, flexWrap: 'wrap' },
  statsGridMob: { gap: 10 },
  statCard:     { flex: 1, minWidth: 140, backgroundColor: B.white, borderRadius: 12, padding: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  statCardMob:  { flex: 0, width: '47%' },
  statTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  statIcoBox:   { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statIco:      { fontSize: 17 },
  statChip:     { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statChipTxt:  { fontSize: 10, fontWeight: '700' },
  statLbl:      { fontSize: 10, fontWeight: '700', color: B.txtMu, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  statVal:      { fontSize: 24, fontWeight: '800', color: B.txt, letterSpacing: -0.5 },
  statBar:      { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },

  // ROW
  row:          { flexDirection: 'row', marginBottom: 0 },
  rowMob:       { flexDirection: 'column' },

  // CARD
  card:         { backgroundColor: B.white, borderRadius: 14, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardHead:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  cardTitle:    { fontSize: 15, fontWeight: '800', color: B.txt },
  cardLink:     { color: B.red, fontSize: 12, fontWeight: '600' },
  viewAllBtn:   { backgroundColor: B.bg, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 6 },
  viewAllTxt:   { color: B.red, fontSize: 12, fontWeight: '700' },

  // UPCOMING
  upRow:        { paddingVertical: 12 },
  upRowBorder:  { borderBottomWidth: 1, borderBottomColor: B.border },
  upMeta:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  upShow:       { fontSize: 13, fontWeight: '700', color: B.txt, flex: 1 },
  hotBadge:     { backgroundColor: B.roseBg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  hotTxt:       { color: B.red, fontSize: 9, fontWeight: '800' },
  upTime:       { fontSize: 11, color: B.txtMu, marginBottom: 8 },
  upBarRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  upTrack:      { flex: 1, height: 5, backgroundColor: B.bg, borderRadius: 3, overflow: 'hidden' },
  upFill:       { height: 5, borderRadius: 3 },
  upSeats:      { fontSize: 10, color: B.txtMu, minWidth: 65, textAlign: 'right' },

  // TABLE
  tHead:        { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: B.border, marginBottom: 2 },
  th:           { fontSize: 10, fontWeight: '700', color: B.txtMu, letterSpacing: 0.5 },
  tRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderRadius: 7, paddingHorizontal: 4 },
  tRowAlt:      { backgroundColor: '#fafafa' },
  td:           { fontSize: 13, color: B.txt, flex: 1 },
  tdId:         { color: B.red, fontWeight: '700' },
  tdMuted:      { color: B.txt2 },
  tdCenter:     { textAlign: 'center' },
  tdBold:       { fontWeight: '700' },

  // TOP SHOWS
  showRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  showRank:     { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  showRankTxt:  { fontSize: 11, fontWeight: '800' },
  showMeta:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  showName:     { fontSize: 13, fontWeight: '700', color: B.txt, flex: 1 },
  showRev:      { fontSize: 13, fontWeight: '700', color: B.red },
  progTrack:    { height: 5, backgroundColor: B.bg, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progFill:     { height: 5, borderRadius: 3 },
  showTix:      { fontSize: 10, color: B.txtMu },
  summBox:      { flexDirection: 'row', backgroundColor: B.bg, borderRadius: 10, padding: 14, marginTop: 8 },
  summItem:     { flex: 1, alignItems: 'center' },
  summVal:      { fontSize: 17, fontWeight: '800', color: B.txt, marginBottom: 2 },
  summLbl:      { fontSize: 10, color: B.txtMu, textTransform: 'uppercase', letterSpacing: 0.5 },
  summDiv:      { width: 1, backgroundColor: B.border, marginVertical: 4 },

  // QUICK ACTIONS
});

export default AdminDashboard;