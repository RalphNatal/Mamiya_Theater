/**
 * Navigation regression tests for the "clicking a tab redirects to home" report.
 *
 * Two things are pinned here:
 *   1. The History-API router (src/lib/router.ts) round-trips every screen, and
 *      App's navigate() leaves screen + URL in sync (home → shows → about ends
 *      on screen 'about' at pathname '/about'; back/forward re-derive the screen).
 *   2. The auth listener in App.tsx only navigates on a REAL transition. In
 *      @supabase/auth-js 2.110, SIGNED_IN is re-emitted for an already-persisted
 *      session on every hidden→visible tab switch (and relayed from other tabs),
 *      and INITIAL_SESSION fires with a null session for signed-out visitors.
 *      Neither may move the user off the page they're on.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// ── Fake browser URL surface ─────────────────────────────────────────────────
// The RN jest environment has `window` but no location/history. App.tsx guards
// on globalThis.location/history, so installing these makes it take the web path.
type Listener = (ev?: unknown) => void;
const g = globalThis as any;
const listeners: Record<string, Listener[]> = {};
g.location = { pathname: '/', search: '', hash: '', origin: 'http://localhost:3000' };
g.history = {
  pushState: (_s: unknown, _t: string, url: string) => { g.location.pathname = url; },
  replaceState: (_s: unknown, _t: string, url: string) => { g.location.pathname = url; },
};
g.addEventListener = (type: string, fn: Listener) => { (listeners[type] ??= []).push(fn); };
g.removeEventListener = (type: string, fn: Listener) => {
  listeners[type] = (listeners[type] ?? []).filter(l => l !== fn);
};
const firePopState = () => (listeners.popstate ?? []).forEach(l => l());

// ── Fake supabase client ─────────────────────────────────────────────────────
// Every query-builder chain resolves to { data: null, error: null }; the auth
// listener callback is captured so tests can replay auth-js events.
type AuthCb = (event: string, session: unknown) => void;
const authCallbacks: AuthCb[] = [];
const emitAuth = (event: string, session: unknown) => authCallbacks.forEach(cb => cb(event, session));

// What `from('profiles')…` resolves to — tests set a complete profile so the
// post-auth path routes instead of opening the complete-your-profile modal.
// (`mock` prefix: jest.mock factories may only close over such variables.)
const mockState: { profile: any } = { profile: null };

const chain = (resolveData: () => unknown = () => null): any => {
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
    from: (table: string) => chain(table === 'profiles' ? () => mockState.profile : () => null),
    rpc: () => chain(),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      getUser: () => Promise.resolve({ data: { user: null } }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: (cb: AuthCb) => {
        authCallbacks.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

import App from '../App';
import NavBar from '../src/components/NavBar';
import HomeScreen from '../src/screens/HomeScreen';
import AllShowsScreen from '../src/screens/AllShowsScreen';
import AboutUsScreen from '../src/screens/AboutUsScreen';
import LoginScreen from '../src/screens/Loginscreen';
import { pathToRoute, routeToPath } from '../src/lib/router';
import type { Screen } from '../src/types/navigation';

const SESSION = { user: { id: 'user-1', email: 'u@example.com' }, access_token: 't' };

const renderApp = async () => {
  let root!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { root = ReactTestRenderer.create(<App />); });
  return root;
};

// App hands the SAME navigate() to every screen's NavBar — drive it directly so
// the test exercises App's routing regardless of the mobile/desktop nav layout.
const navFrom = (root: ReactTestRenderer.ReactTestRenderer) => root.root.findAllByType(NavBar)[0].props.onNavigate;

const go = async (root: ReactTestRenderer.ReactTestRenderer, screen: Screen, id?: string) => {
  await act(async () => { navFrom(root)(screen, id); });
};

beforeEach(() => {
  authCallbacks.length = 0;
  mockState.profile = { role: 'user', mobile_number: '+1 808 555 0100', full_name: 'Test User' };
  g.location.pathname = '/';
  g.location.search = '';
  g.location.hash = '';
});

describe('router', () => {
  test('pathToRoute ⇄ routeToPath round-trips every top-nav screen', () => {
    const cases: Array<[Screen, string]> = [
      ['home', '/'], ['allshows', '/shows'], ['about', '/about'], ['contact', '/contact'],
      ['login', '/login'], ['signup', '/signup'], ['terms', '/terms'], ['privacy', '/privacy'],
      ['profile', '/profile'], ['checkout', '/checkout'], ['bookingconfirmation', '/confirmation'],
      ['bookinglookup', '/lookup'], ['admin', '/admin'], ['adminlogin', '/admin/login'],
    ];
    for (const [screen, path] of cases) {
      expect(routeToPath(screen)).toBe(path);
      expect(pathToRoute(path).screen).toBe(screen);
    }
    expect(pathToRoute('/shows/p1')).toEqual({ screen: 'showdetails', movieId: 'p1', showtimeId: null });
    expect(pathToRoute('/shows/p1/seats/s9')).toEqual({ screen: 'seatselection', movieId: 'p1', showtimeId: 's9' });
    expect(pathToRoute('/ticket/abc')).toEqual({ screen: 'ticket', movieId: 'abc', showtimeId: null });
    expect(routeToPath('ticket', 'abc')).toBe('/ticket/abc');
  });
});

describe('App navigation', () => {
  test('home → shows → about leaves screen "about" and pathname "/about"; back restores /shows', async () => {
    const root = await renderApp();
    expect(root.root.findAllByType(HomeScreen)).toHaveLength(1);

    await go(root, 'allshows');
    expect(root.root.findAllByType(AllShowsScreen)).toHaveLength(1);
    expect(g.location.pathname).toBe('/shows');

    await go(root, 'about');
    expect(root.root.findAllByType(AboutUsScreen)).toHaveLength(1);
    expect(root.root.findAllByType(HomeScreen)).toHaveLength(0);
    expect(g.location.pathname).toBe('/about');

    // Browser back: the URL is restored by the browser, App mirrors it into state.
    g.location.pathname = '/shows';
    await act(async () => { firePopState(); });
    expect(root.root.findAllByType(AllShowsScreen)).toHaveLength(1);
    expect(root.root.findAllByType(AboutUsScreen)).toHaveLength(0);

    await act(async () => { root.unmount(); });
  });

  test('a re-emitted SIGNED_IN / INITIAL_SESSION / TOKEN_REFRESHED never leaves the current page', async () => {
    const root = await renderApp();
    await go(root, 'allshows');
    await go(root, 'about');
    expect(g.location.pathname).toBe('/about');

    // Page load with a persisted session (or a signed-out visitor): no move.
    await act(async () => { emitAuth('INITIAL_SESSION', SESSION); });
    expect(root.root.findAllByType(AboutUsScreen)).toHaveLength(1);
    await act(async () => { emitAuth('INITIAL_SESSION', null); });
    expect(root.root.findAllByType(AboutUsScreen)).toHaveLength(1);

    // auth-js re-emits SIGNED_IN for the SAME session when the tab regains
    // visibility / another tab signs in — this was the home-redirect trigger.
    await act(async () => { emitAuth('SIGNED_IN', SESSION); });
    expect(root.root.findAllByType(AboutUsScreen)).toHaveLength(1);
    expect(root.root.findAllByType(HomeScreen)).toHaveLength(0);
    expect(g.location.pathname).toBe('/about');

    await act(async () => { emitAuth('TOKEN_REFRESHED', SESSION); });
    expect(root.root.findAllByType(AboutUsScreen)).toHaveLength(1);
    expect(g.location.pathname).toBe('/about');

    await act(async () => { root.unmount(); });
  });

  test('a real SIGNED_OUT still goes home', async () => {
    const root = await renderApp();
    await go(root, 'about');
    await act(async () => { emitAuth('SIGNED_OUT', null); });
    expect(root.root.findAllByType(HomeScreen)).toHaveLength(1);
    expect(g.location.pathname).toBe('/');
    await act(async () => { root.unmount(); });
  });

  test('a fresh sign-in started on the login screen routes home', async () => {
    const root = await renderApp();
    await go(root, 'login');
    expect(root.root.findAllByType(LoginScreen)).toHaveLength(1);
    expect(g.location.pathname).toBe('/login');

    // Password sign-in resolves while the user is still on /login, so this
    // SIGNED_IN is a genuine fresh login: handlePostAuth routes home and
    // replaceState cleans /login out of the URL.
    await act(async () => { emitAuth('SIGNED_IN', SESSION); });
    expect(root.root.findAllByType(HomeScreen)).toHaveLength(1);
    expect(root.root.findAllByType(LoginScreen)).toHaveLength(0);
    expect(g.location.pathname).toBe('/');
    await act(async () => { root.unmount(); });
  });
});
