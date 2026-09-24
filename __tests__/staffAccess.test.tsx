/**
 * Staff tier (door check-in, NO money) — the client half of the guarantee.
 *
 * The data layer refuses staff on every sales / payout RPC and RLS path on its
 * own (proved by supabase/checks/staff_access_checklist.sql). These tests pin
 * what the UI does on top of that:
 *   1. src/config/permissions.ts: staff see Box Office + Settings only, land on
 *      Box Office, and a forbidden section resolves to that landing.
 *   2. AdminDashboard rendered as staff never calls a finance RPC or reads a
 *      sales table — on landing, on every section staff can open, and when a
 *      forbidden section is forced — and has no walk-up selling UI. The door
 *      scan itself goes through check_in_ticket.
 *   3. App.tsx admits staff to /admin (landing on Box Office) and still bounces
 *      a plain user.
 *   4. Admins can assign user / staff / admin.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

// ── Fake browser URL surface (App.tsx takes the web path when these exist) ───
const g = globalThis as any;
g.location = { pathname: '/', search: '', hash: '', origin: 'http://localhost:3000' };
g.history = {
  pushState: (_s: unknown, _t: string, url: string) => { g.location.pathname = url; },
  replaceState: (_s: unknown, _t: string, url: string) => { g.location.pathname = url; },
};
g.addEventListener = () => {};
g.removeEventListener = () => {};

// ── Recording supabase fake ──────────────────────────────────────────────────
// Every table read and RPC name is recorded; query chains resolve to
// { data, error: null } with per-table / per-RPC data from mockState.
type AuthCb = (event: string, session: unknown) => void;
const mockAuthCallbacks: AuthCb[] = [];
const mockCalls = { from: [] as string[], rpc: [] as Array<{ name: string; args: any }> };
const mockState: { profile: any; rpc: Record<string, unknown> } = { profile: null, rpc: {} };

const mockChain = (resolveData: () => unknown): any => {
  const p: any = new Proxy(function () {} as any, {
    get(_t, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: resolveData(), error: null });
      return () => p;
    },
    apply() { return p; },
  });
  return p;
};

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockCalls.from.push(table);
      return mockChain(() => (table === 'profiles' ? mockState.profile : null));
    },
    rpc: (name: string, args?: unknown) => {
      mockCalls.rpc.push({ name, args });
      return mockChain(() => mockState.rpc[name] ?? null);
    },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u-1', email: 'door@example.com' } } }),
      updateUser: () => Promise.resolve({ error: null }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: (cb: AuthCb) => {
        mockAuthCallbacks.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

import App from '../App';
import AdminDashboard from '../src/screens/admin/AdminDashboard';
import HomeScreen from '../src/screens/HomeScreen';
import { Sidebar } from '../src/screens/admin/components/Sidebar';
import { BoxOfficePanel } from '../src/screens/admin/sections/BoxOfficeSection';
import { OverviewPanel } from '../src/screens/admin/sections/OverviewSection';
import { UserManagementPanel } from '../src/screens/admin/sections/UsersSection';
import { ModalProvider } from '../src/components/ModalProvider';
import {
  PERMISSIONS, isAdminRole, landingSection, resolveSection, type SectionId,
} from '../src/config/permissions';

// Everything that exposes sales, tickets sold, revenue or payouts.
const FINANCE_RPCS = [
  'get_dashboard_kpis', 'get_sales_timeseries', 'get_sales_channels', 'get_top_shows',
  'get_revenue_breakdown', 'funnel_counts', 'create_box_office_booking',
];
const SALES_TABLES = ['bookings', 'payments', 'production_stats', 'show_ticket_stats', 'showtimes', 'showtime_seat_prices'];
const ALL_SECTIONS: SectionId[] = ['overview', 'showtimes', 'boxoffice', 'seatmap', 'users', 'settings'];

const rawText = (n: ReactTestInstance | string): string =>
  typeof n === 'string' ? n : n.children.map(rawText).join(' ');
const textOf = (n: ReactTestInstance) => rawText(n).replace(/\s+/g, ' ').trim();

// TouchableOpacity is a forwardRef wrapper around the real component, so both
// match an onPress query — keep only the outermost of each nested pair.
const outermost = (nodes: ReactTestInstance[]) =>
  nodes.filter(n => {
    for (let p = n.parent; p; p = p.parent) if (nodes.includes(p)) return false;
    return true;
  });

// The outermost pressable whose rendered text includes `label`.
const pressable = (root: ReactTestInstance, label: string) => {
  const hit = root.findAll(n => typeof n.props?.onPress === 'function' && textOf(n).includes(label))[0];
  if (!hit) throw new Error(`no pressable labelled "${label}"`);
  return hit;
};

const financeCalls = () => mockCalls.rpc.map(c => c.name).filter(n => FINANCE_RPCS.includes(n));
const salesReads = () => mockCalls.from.filter(t => SALES_TABLES.includes(t));

const renderDashboard = async (role: 'staff' | 'admin') => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <ModalProvider><AdminDashboard role={role} onNavigate={jest.fn()} /></ModalProvider>,
    );
  });
  return r;
};

// The jest window is 750px wide (mobile layout): the sidebar opens from the burger.
const openSidebar = async (r: ReactTestRenderer.ReactTestRenderer) => {
  const burger = r.root.findAll(n => n.props?.name === 'menu-outline')[0];
  let node: ReactTestInstance | null = burger;
  while (node && typeof node.props?.onPress !== 'function') node = node.parent;
  await act(async () => { node!.props.onPress(); });
  return r.root.findByType(Sidebar);
};

beforeEach(() => {
  mockCalls.from.length = 0;
  mockCalls.rpc.length = 0;
  mockAuthCallbacks.length = 0;
  mockState.profile = { role: 'staff', full_name: 'Door Person', email: 'door@example.com', mobile_number: '+1 808 555 0100' };
  mockState.rpc = {};
  g.location.pathname = '/';
});

describe('permissions map', () => {
  test('staff see Box Office + Settings only and land on Box Office; admin sees everything', () => {
    expect(PERMISSIONS.staff.sections).toEqual(['boxoffice', 'settings']);
    expect(PERMISSIONS.admin.sections).toEqual(ALL_SECTIONS);
    expect(landingSection('staff')).toBe('boxoffice');
    expect(landingSection('admin')).toBe('overview');
    expect(PERMISSIONS.staff.walkUpSales).toBe(false);
    expect(PERMISSIONS.admin.walkUpSales).toBe(true);
  });

  test('a forbidden section resolves to the landing section', () => {
    for (const s of ['overview', 'showtimes', 'seatmap', 'users', 'nonsense']) {
      expect(resolveSection('staff', s)).toBe('boxoffice');
    }
    expect(resolveSection('staff', 'settings')).toBe('settings');
    for (const s of ALL_SECTIONS) expect(resolveSection('admin', s)).toBe(s);
  });

  test('only staff and admin may enter the admin area', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('staff')).toBe(true);
    for (const r of ['user', null, undefined, '', 'Admin', 'toString', '__proto__']) {
      expect(isAdminRole(r as any)).toBe(false);
    }
  });
});

describe('AdminDashboard as staff', () => {
  test('lands on check-in only: no finance RPC, no sales table, no selling UI', async () => {
    const r = await renderDashboard('staff');
    expect(r.root.findAllByType(BoxOfficePanel)).toHaveLength(1);
    expect(r.root.findAllByType(OverviewPanel)).toHaveLength(0);
    const text = textOf(r.root);
    expect(text).toContain('Verify & check in');
    expect(text).not.toMatch(/Process Cash|Process External Card|Cart|Showtime|\$/);
    expect(financeCalls()).toEqual([]);
    expect(salesReads()).toEqual([]);
    await act(async () => { r.unmount(); });
  });

  test('sidebar lists only Box Office + Settings', async () => {
    const r = await renderDashboard('staff');
    const nav = textOf(await openSidebar(r));
    expect(nav).toContain('Box Office');
    expect(nav).toContain('Settings');
    expect(nav).toContain('Staff Role');
    for (const hidden of ['Overview', 'Showtimes', 'Seat Map', 'Users']) expect(nav).not.toContain(hidden);
    await act(async () => { r.unmount(); });
  });

  test('forcing a forbidden section (e.g. overview) keeps Box Office and calls nothing financial', async () => {
    const r = await renderDashboard('staff');
    for (const forbidden of ['overview', 'showtimes', 'seatmap', 'users'] as SectionId[]) {
      // Selecting closes the mobile sidebar, so reopen it for each attempt.
      const sidebar = await openSidebar(r);
      await act(async () => { sidebar.props.onSelect(forbidden); });
      expect(r.root.findAllByType(BoxOfficePanel)).toHaveLength(1);
      expect(r.root.findAllByType(OverviewPanel)).toHaveLength(0);
      expect(r.root.findAllByType(UserManagementPanel)).toHaveLength(0);
    }
    // Settings (own password) is the one other place staff can go.
    const sidebar = await openSidebar(r);
    await act(async () => { sidebar.props.onSelect('settings'); });
    expect(textOf(r.root)).toContain('Change Password');
    expect(financeCalls()).toEqual([]);
    expect(salesReads()).toEqual([]);
    await act(async () => { r.unmount(); });
  });

  test('scanning a valid ticket checks it in through check_in_ticket', async () => {
    mockState.rpc.check_in_ticket = {
      result: 'ok',
      ticket: { token: 't-1', seat: 'F12', zone: null, checked_in_at: '2026-09-24T19:00:00Z' },
      booking: {
        id: '1a2b3c4d-0000-0000-0000-000000000000', movie_title: 'Test Show', show_start_time: null,
        num_tickets: 1, payment_status: 'paid', checked_in_count: 1,
        tickets: [{ token: 't-1', seat: 'F12', zone: null, checked_in_at: '2026-09-24T19:00:00Z' }],
      },
    };
    const r = await renderDashboard('staff');
    const input = r.root.findAll(n => n.props?.placeholder === 'MT-XXXXXXXX or ticket link')[0];
    await act(async () => { input.props.onChangeText('https://example.com/ticket/t-1'); });
    await act(async () => { pressable(r.root, 'Verify & check in').props.onPress(); });

    expect(mockCalls.rpc).toEqual([{ name: 'check_in_ticket', args: { p_input: 'https://example.com/ticket/t-1' } }]);
    expect(textOf(r.root)).toContain('Checked in — Seat');
    expect(textOf(r.root)).toContain('F12');
    await act(async () => { r.unmount(); });
  });
});

describe('AdminDashboard as admin (unchanged)', () => {
  test('lands on Overview, loads the finance RPCs, and has walk-up selling', async () => {
    mockState.profile = { role: 'admin', full_name: 'Boss', email: 'boss@example.com' };
    const r = await renderDashboard('admin');
    expect(r.root.findAllByType(OverviewPanel)).toHaveLength(1);
    // Proves the recorder sees finance calls — so the staff assertions above are not vacuous.
    expect(financeCalls()).toEqual(expect.arrayContaining(['get_dashboard_kpis', 'get_revenue_breakdown']));

    const nav = textOf(await openSidebar(r));
    for (const label of ['Overview', 'Showtimes', 'Box Office', 'Seat Map', 'Users', 'Settings']) expect(nav).toContain(label);

    await act(async () => { r.root.findByType(Sidebar).props.onSelect('boxoffice'); });
    expect(r.root.findByType(BoxOfficePanel).props.canSell).toBe(true);
    expect(mockCalls.from).toContain('showtimes');
    await act(async () => { r.unmount(); });
  });
});

describe('App admin-area guard', () => {
  const SESSION = { user: { id: 'u-1', email: 'door@example.com' }, access_token: 't' };
  const deepLoadAdmin = async () => {
    g.location.pathname = '/admin';
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { r = ReactTestRenderer.create(<App />); });
    await act(async () => { mockAuthCallbacks.forEach(cb => cb('INITIAL_SESSION', SESSION)); });
    return r;
  };

  test('staff deep-loading /admin get the dashboard, on Box Office, with no finance calls', async () => {
    const r = await deepLoadAdmin();
    const dash = r.root.findAllByType(AdminDashboard);
    expect(dash).toHaveLength(1);
    expect(dash[0].props.role).toBe('staff');
    expect(r.root.findAllByType(BoxOfficePanel)).toHaveLength(1);
    expect(r.root.findAllByType(OverviewPanel)).toHaveLength(0);
    expect(g.location.pathname).toBe('/admin');
    expect(financeCalls()).toEqual([]);
    await act(async () => { r.unmount(); });
  });

  test('a plain user is still bounced from /admin to Home', async () => {
    mockState.profile = { role: 'user', full_name: 'Guest', mobile_number: '+1 808 555 0100' };
    const r = await deepLoadAdmin();
    expect(r.root.findAllByType(AdminDashboard)).toHaveLength(0);
    expect(r.root.findAllByType(HomeScreen)).toHaveLength(1);
    expect(g.location.pathname).toBe('/');
    await act(async () => { r.unmount(); });
  });
});

describe('Users section (admin only)', () => {
  test('offers User / Staff / Admin and assigns staff via set_user_role', async () => {
    mockState.profile = [{ id: 'p-9', full_name: 'Pat', email: 'pat@example.com', role: 'user' }];
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<ModalProvider><UserManagementPanel /></ModalProvider>);
    });
    const group = r.root.findAll(n => n.props?.accessibilityRole === 'radiogroup')[0];
    const options = outermost(group.findAll(n => n.props?.accessibilityRole === 'radio' && typeof n.props?.onPress === 'function'));
    expect(options.map(textOf)).toEqual(['User', 'Staff', 'Admin']);
    expect(options.map(n => n.props.accessibilityState.checked)).toEqual([true, false, false]);

    await act(async () => { pressable(group, 'Staff').props.onPress(); });
    expect(mockCalls.rpc).toContainEqual({ name: 'set_user_role', args: { target_user_id: 'p-9', new_role: 'staff' } });
    await act(async () => { r.unmount(); });
  });
});
