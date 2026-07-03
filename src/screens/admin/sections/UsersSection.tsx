import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useAppModal } from '../../../components/ModalProvider';
import { B } from '../shared/brand';
import { s, um } from '../shared/adminStyles';
import { PageHeader, LoadingState } from '../components/Feedback';
export type ProfileRow = { id: string; full_name: string | null; email: string | null; role: string | null };
// A non-registered buyer, aggregated from bookings that have no user_id. There
// is no account row for these people — they exist only as guest_name/guest_email
// on their bookings — so they're keyed by email and can't be promoted/demoted.
export type GuestRow = { email: string; name: string | null; bookings: number };

// Collapse guest bookings into one row per email (case-insensitive): keep the
// most recent name and count how many bookings that guest made.
export const aggregateGuests = (rows: { guest_name: string | null; guest_email: string | null }[]): GuestRow[] => {
  const byEmail = new Map<string, GuestRow>();
  for (const r of rows) {
    const email = r.guest_email?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      existing.bookings += 1;
      if (!existing.name && r.guest_name?.trim()) existing.name = r.guest_name.trim();
    } else {
      byEmail.set(key, { email, name: r.guest_name?.trim() || null, bookings: 1 });
    }
  }
  return Array.from(byEmail.values()).sort((a, b) => a.email.localeCompare(b.email));
};

export const UserManagementPanel = () => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;                 // ≥960px → two columns; below → stacked
  // Registered accounts (from `profiles`) and guest buyers (aggregated from
  // account-less bookings) are already two independent sources — the fetch
  // below keeps them in separate state, and the UI renders each in its own card.
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      // Registered accounts and guest buyers are two independent sources: the
      // profiles table (one row per account) and bookings with user_id = NULL
      // (identified only by guest_name/guest_email). Load both in parallel.
      const [accountsRes, guestsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .order('email', { ascending: true }),
        supabase
          .from('bookings')
          .select('guest_name, guest_email, created_at')
          .is('user_id', null)
          .not('guest_email', 'is', null)
          .order('created_at', { ascending: false }),
      ]);
      if (accountsRes.error) throw accountsRes.error;
      if (guestsRes.error) throw guestsRes.error;
      setUsers(accountsRes.data ?? []);
      setGuests(aggregateGuests(guestsRes.data ?? []));
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
        subtitle="Manage registered accounts and view guest buyers."
        actionLabel="Refresh"
        onAction={loadUsers}
      />

      {loading ? (
        <View style={s.card}><LoadingState label="Loading users…" /></View>
      ) : error ? (
        <View style={s.card}><Text style={[um.empty, { color: B.red }]}>{error}</Text></View>
      ) : (
        // Two columns on desktop, stacked on narrow screens. Registered accounts
        // (left, role-managed) and guest buyers (right, view-only) each get their
        // own card so the two audiences read as clearly distinct.
        <View style={[um.columns, !isDesktop && um.columnsStacked]}>

          {/* ── LEFT: Registered Accounts — manage roles ── */}
          <View style={[s.card, isDesktop ? um.column : um.columnStacked]}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Registered Accounts</Text>
              <Text style={um.count}>{users.length}</Text>
            </View>
            {users.length === 0 ? (
              <Text style={um.empty}>No registered accounts.</Text>
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

          {/* ── RIGHT: Guest Buyers — view only, no account/roles ── */}
          <View style={[s.card, isDesktop ? um.column : um.columnStacked]}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Guest Buyers</Text>
              <Text style={um.count}>{guests.length}</Text>
            </View>
            {guests.length === 0 ? (
              <Text style={um.empty}>No guest buyers yet.</Text>
            ) : (
              guests.map((g, i) => (
                <View key={`guest-${g.email}`} style={[um.row, i % 2 === 1 && s.tRowAlt]}>
                  <View style={um.info}>
                    <Text style={um.name} numberOfLines={1}>{g.name || g.email}</Text>
                    <Text style={um.email} numberOfLines={1}>{g.email}</Text>
                  </View>
                  <View style={[um.roleBadge, um.roleBadgeGuest]}>
                    <Text style={[um.roleBadgeTxt, um.roleBadgeTxtGuest]}>Guest</Text>
                  </View>
                  <Text style={um.guestMeta}>
                    {g.bookings} booking{g.bookings === 1 ? '' : 's'}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      )}
    </>
  );
};

