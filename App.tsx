import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/Loginscreen';
import SignupScreen from './src/screens/Signupscreen';
import AboutUsScreen from './src/screens/AboutUsScreen';
import ContactScreen from './src/screens/ContactScreen';
import TermsScreen from './src/screens/TermsScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminDashboard from './src/screens/admin/AdminDashboard';
import AdminLoginScreen from './src/screens/AdminLoginScreen';
import AllShowsScreen from './src/screens/AllShowsScreen';
import ShowDetailsScreen from './src/screens/ShowDetailsScreen';
import SeatSelectionScreen from './src/screens/SeatSelectionScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import BookingConfirmationScreen from './src/screens/BookingConfirmationScreen';
import BookingLookupScreen from './src/screens/BookingLookupScreen';
import TicketScreen from './src/screens/TicketScreen';
import CompleteProfileModal from './src/components/CompleteProfileModal';
import { ModalProvider } from './src/components/ModalProvider';
import type { Screen } from './src/types/navigation';
import { pathToRoute, routeToPath, type RouteState } from './src/lib/router';
import { isAdminRole } from './src/config/permissions';

// When Stripe redirects the browser back it lands on
// `/?checkout=success&booking=<id>` (or `checkout=cancel`). Parse that once so
// we can open the confirmation screen straight away. Web-only (window exists).
function parseCheckoutReturn(): { bookingId: string | null; mode: 'success' | 'cancel' } | null {
  // react-native's tsconfig omits the DOM lib, so reach `window` via globalThis.
  const g = globalThis as any;
  if (!g.location) return null;
  const params = new URLSearchParams(g.location.search);
  const checkout = params.get('checkout');
  if (checkout !== 'success' && checkout !== 'cancel') return null;
  return { bookingId: params.get('booking'), mode: checkout };
}

// True when THIS page load is the Google OAuth redirect landing. auth-js parses
// the callback out of the URL (implicit flow: #access_token=…; PKCE: ?code=…)
// and then emits SIGNED_IN for it — that SIGNED_IN really is a fresh login even
// though the screen is 'home' (redirectTo is the origin). Mirrors auth-js's own
// _isImplicitGrantCallback / _isPKCECallback URL checks. Web-only.
function isOAuthCallbackLanding(): boolean {
  const g = globalThis as any;
  if (!g.location) return false;
  const hash = new URLSearchParams(String(g.location.hash ?? '').replace(/^#/, ''));
  const search = new URLSearchParams(String(g.location.search ?? ''));
  return hash.has('access_token') || hash.has('error') || search.has('code');
}

// Read the initial screen + path params from the current browser URL so a deep
// link / refresh on e.g. /shows/:id renders that show instead of always home.
// Native (no window) has no path, so we stay on the in-memory default of home.
function parseInitialRoute(): RouteState {
  const g = globalThis as any;
  if (!g.location) return { screen: 'home', movieId: null, showtimeId: null };
  return pathToRoute(g.location.pathname);
}

export default function App() {
  const initialCheckout = useRef(parseCheckoutReturn()).current;

  // A Stripe return (?checkout=…) always opens the confirmation screen and wins
  // over the path; otherwise the initial screen + params come from the URL so
  // deep links and refreshes render the right page.
  const initialRoute = useRef<RouteState>(
    initialCheckout
      ? { screen: 'bookingconfirmation', movieId: null, showtimeId: null }
      : parseInitialRoute(),
  ).current;

  const [screen, setScreen]   = useState<Screen>(initialRoute.screen);
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(initialRoute.movieId);
  const [selectedShowtimeId, setSelectedShowtimeId] = useState<string | null>(initialRoute.showtimeId);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  // Carries the booking id + outcome from a Stripe redirect to the
  // confirmation screen.
  const [checkoutBookingId] = useState<string | null>(initialCheckout?.bookingId ?? null);
  const [checkoutMode] = useState<'success' | 'cancel'>(initialCheckout?.mode ?? 'success');

  // Strip the ?checkout=… query string so a refresh doesn't re-open the
  // confirmation screen, and the URL stays clean.
  useEffect(() => {
    const g = globalThis as any;
    if (initialCheckout && g.history) {
      g.history.replaceState({}, '', g.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracked specifically so the 'admin' route below can verify both
  // "is there a session" AND "is that user's profiles.role an admin-area role"
  // ('admin' or 'staff' — see src/config/permissions.ts) before ever rendering
  // AdminDashboard, which then shows only that role's sections.
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  // true = no pending role lookup. When the app is DEEP-LOADED straight onto
  // /admin we start false so the admin guard below shows a spinner and waits for
  // Supabase's INITIAL_SESSION (+ role sync) to settle, instead of bouncing a
  // legitimate admin to login during the one render before auth resolves.
  const [roleLoaded, setRoleLoaded] = useState(initialRoute.screen !== 'admin');

  // When a signed-in user has no mobile_number yet (always true for brand-new
  // Google sign-ins, since Google never shares a phone number), we hold them
  // here until they complete their profile, then route to Home. `nameMissing`
  // tells the modal to also collect a full name (rare — Google usually gives one).
  const [pendingProfile, setPendingProfile] = useState<{ userId: string; nameMissing: boolean } | null>(null);

  // Consumed (once) by the auth listener: the first SIGNED_IN after an OAuth
  // redirect landing is a genuine fresh login and may route.
  const oauthLandingRef = useRef(isOAuthCallbackLanding());

  // The auth listener below is set up once on mount, so it closes over a stale
  // `screen` value. Keep a ref in sync so it can always read the current screen.
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // Auth-driven transitions (post-login, sign-out, the admin guard bounce) use
  // this: it moves screens AND rewrites the URL with replaceState, so a login
  // screen at /login doesn't linger in the URL after we've routed to home, and
  // so a refresh reflects where the user actually is. replaceState (not push)
  // keeps these automatic redirects out of the back/forward history. Stable
  // identity (setters + module fn only) so it never re-subscribes the auth
  // listener effect below. Web-guarded, so it's a no-op on native.
  const replaceRoute = useCallback((s: Screen) => {
    setScreen(s);
    const g = globalThis as any;
    if (g.history && g.location) {
      g.history.replaceState({}, '', routeToPath(s));
    }
  }, []);

  // Fetches profiles.role + mobile_number for the given user, stores the role
  // in state (this is the exact role-fetching logic guarding the 'admin'
  // route below), and returns the row so callers can branch on mobile_number
  // without a second query.
  const syncProfile = useCallback(async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, mobile_number, full_name')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;

      if (profile) {
        setRole(profile.role ?? null);
        return profile;
      }

      // Self-heal: the DB trigger should have created this row at signup, but
      // if it's ever missing (older broken Google account, race) recreate a
      // minimal row from the auth metadata instead of letting a .single()
      // "coerce to a single object" error break auth. Relies on the
      // "insert own profile" RLS policy added in the reliable-profiles migration.
      const { data: { user } } = await supabase.auth.getUser();
      const meta = (user?.user_metadata ?? {}) as any;
      const fullName: string =
        meta.full_name || meta.name || (user?.email ? user.email.split('@')[0] : '');
      await supabase.from('profiles').upsert(
        {
          id: userId,
          full_name: fullName,
          avatar_url: meta.avatar_url || meta.picture || null,
          email: user?.email ?? null,
          role: 'user',
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      setRole('user');
      return { role: 'user', mobile_number: null, full_name: fullName };
    } catch (err) {
      console.error('Failed to resolve user profile:', err);
      setRole(null);
      return null;
    } finally {
      setRoleLoaded(true);
    }
  }, []);

  const handlePostAuth = useCallback(async (userId: string) => {
    const profile = await syncProfile(userId);

    // Fire-and-forget the welcome email. It's exactly-once on the server (a
    // compare-and-swap on profiles.welcomed_at), so invoking it on every
    // confirmed sign-in still sends at most one — the first. Gating on the flag
    // (not the signup event) makes it robust whether or not email confirmation
    // is enabled, and never collides with Supabase's verification mail.
    // Non-blocking and non-fatal: a failure here must never disrupt sign-in.
    supabase.functions.invoke('send-welcome-email').catch(() => {});

    // Required field for the app is the mobile number; prompt once to collect
    // it (and the name too, if that's somehow empty). Google users always land
    // here on first sign-in since Google never shares a phone number.
    if (!profile?.mobile_number) {
      setPendingProfile({ userId, nameMissing: !(profile as any)?.full_name?.trim() });
      return;
    }

    replaceRoute('home');
  }, [syncProfile, replaceRoute]);

  // Page load / re-emitted sign-in with an already-persisted session: keep
  // `role` in sync for the NavBar/AdminDashboard guard, but never navigate —
  // stay wherever `screen` already is. Still re-prompt for a missing mobile
  // number so an unfinished profile is completed on the next visit too — except
  // on the checkout confirmation screen, where a returning buyer shouldn't be
  // interrupted.
  const syncExistingSession = useCallback((userId: string) => {
    syncProfile(userId).then((profile) => {
      if (profile && !profile.mobile_number && screenRef.current !== 'bookingconfirmation') {
        setPendingProfile({ userId, nameMissing: !(profile as any)?.full_name?.trim() });
      }
    });
  }, [syncProfile]);

  useEffect(() => {
    // Listen for auth state changes (login / logout / Google OAuth redirect-back).
    // This is the single place that routes post-auth for BOTH email/password and
    // Google sign-in, since the Google flow redirects away and back and can't
    // react to its own result from within Loginscreen/Signupscreen.
    //
    // IMPORTANT: the ONLY events that may navigate are a real sign-out
    // ('SIGNED_OUT') and a fresh sign-in this tab actually started. Everything
    // else must leave `screen` alone:
    //   • 'TOKEN_REFRESHED' fires silently every ~hour while the tab is open.
    //   • 'INITIAL_SESSION' fires once on page load — with the persisted session
    //     if there is one, or with NULL for a signed-out visitor. Treating that
    //     null as a sign-out used to bounce every guest deep link (/about,
    //     /shows, the /ticket/… link from the receipt email) straight to Home.
    //   • 'SIGNED_IN' is NOT only a fresh login. @supabase/auth-js (2.110) re-emits
    //     it for the already-persisted session every time the tab goes
    //     hidden → visible (_onVisibilityChanged → _recoverAndRefresh) and relays
    //     other tabs' SIGNED_IN over BroadcastChannel. Routing home on each of
    //     those was the "clicking a tab sends me back to Home" bug: browse to
    //     /about, switch tabs and back → Home. See __tests__/navigation.test.tsx.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);

        if (event === 'SIGNED_OUT' || !newSession) {
          setRole(null);
          setRoleLoaded(true);
          setPendingProfile(null);
          // Only a REAL sign-out goes home. A signed-out visitor's INITIAL_SESSION
          // (session null) is not a transition — they stay on the page they
          // opened (deep links, refreshes, the Stripe/PayPal return, /ticket/…).
          if (event === 'SIGNED_OUT') {
            replaceRoute('home');
          }
          return;
        }

        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          // Identity/role hasn't changed — nothing to re-sync or navigate.
          return;
        }

        if (event === 'INITIAL_SESSION') {
          syncExistingSession(newSession.user.id);
          return;
        }

        // event === 'SIGNED_IN'
        if (screenRef.current === 'adminlogin') {
          // AdminLoginScreen verifies role itself and routes (or signs out
          // and rejects) on its own. We still sync `role` here so the
          // 'admin' guard below doesn't immediately bounce a legitimately
          // verified admin back out — we just skip the Home/phone-modal
          // routing handlePostAuth would otherwise force.
          setRoleLoaded(false);
          syncProfile(newSession.user.id);
          return;
        }

        // A fresh login is one THIS tab started: the user is sitting on an auth
        // screen (password sign-in / sign-up resolve while still on it), or this
        // page load is the OAuth redirect landing. Anything else is auth-js
        // re-emitting SIGNED_IN for a session we already have — handle it exactly
        // like INITIAL_SESSION: sync, don't move.
        const freshLogin =
          screenRef.current === 'login' || screenRef.current === 'signup' || oauthLandingRef.current;
        oauthLandingRef.current = false;
        if (!freshLogin) {
          syncExistingSession(newSession.user.id);
          return;
        }

        setRoleLoaded(false);
        handlePostAuth(newSession.user.id);
      }
    );

    return () => subscription.unsubscribe();
  }, [handlePostAuth, syncProfile, syncExistingSession, replaceRoute]);

  // Keep `screen` truthful: if something ever lands on 'admin' without a
  // verified admin/staff session (there's currently no public path that does
  // this, but this is the actual enforcement, not just a render-time skip),
  // bounce to Home (or Login if signed out) once the role lookup has settled.
  useEffect(() => {
    if (screen !== 'admin' || !roleLoaded) return;
    if (!(session && isAdminRole(role))) {
      replaceRoute(session ? 'home' : 'login');
    }
  }, [screen, roleLoaded, session, role, replaceRoute]);

  const navigate = (s: Screen, movieId?: string, showtimeId?: string, seats?: string[]) => {
    if (movieId) setSelectedMovieId(movieId);
    if (showtimeId) setSelectedShowtimeId(showtimeId);
    if (seats) setSelectedSeats(seats);
    setScreen(s);

    // Push the matching URL so the address bar, back/forward, and shareable
    // links stay in sync. The seat list stays in memory (not the URL) by design.
    // Guarded so native (no history) just keeps the in-memory state above.
    const g = globalThis as any;
    if (g.history && g.location) {
      const path = routeToPath(s, movieId ?? selectedMovieId, showtimeId ?? selectedShowtimeId);
      if (path !== g.location.pathname) {
        g.history.pushState({}, '', path);
      }
    }
  };

  // Back/forward buttons: re-derive the screen + params from the URL the browser
  // restored. This must NOT push (the entry already exists) — it only mirrors the
  // popped location back into React state.
  useEffect(() => {
    const g = globalThis as any;
    if (!g.addEventListener || !g.location) return;
    const onPopState = () => {
      const route = pathToRoute(g.location.pathname);
      setSelectedMovieId(route.movieId);
      setSelectedShowtimeId(route.showtimeId);
      setScreen(route.screen);
    };
    g.addEventListener('popstate', onPopState);
    return () => g.removeEventListener('popstate', onPopState);
  }, []);

  // After the mobile-number prompt: leave an auth screen for Home (that's the
  // fresh-login case); anywhere else the prompt came from a page load / re-emit,
  // so the user stays on the page they were already reading.
  const handleProfileCompleted = () => {
    setPendingProfile(null);
    if (screen === 'login' || screen === 'signup') replaceRoute('home');
  };

  let activeScreen;
  switch (screen) {
    case 'login':
      activeScreen = <LoginScreen onNavigate={navigate} />;
      break;
    case 'signup':
      activeScreen = <SignupScreen onNavigate={navigate} />;
      break;
    case 'about':
      activeScreen = <AboutUsScreen onNavigate={navigate} />;
      break;
    case 'contact':
      activeScreen = <ContactScreen onNavigate={navigate} />;
      break;
    case 'terms':
      activeScreen = <TermsScreen onNavigate={navigate} />;
      break;
    case 'privacy':
      activeScreen = <PrivacyScreen onNavigate={navigate} />;
      break;
    case 'profile':
      activeScreen = <ProfileScreen onNavigate={navigate} />;
      break;
    case 'admin':
      // Render-time guard (the actual security boundary — synchronous with
      // render, no flash of AdminDashboard regardless of what the
      // corrective effect above does a tick later).
      if (!roleLoaded) {
        activeScreen = (
          <View style={styles.adminLoading}>
            <ActivityIndicator color="#C8102E" size="large" />
          </View>
        );
      } else if (session && isAdminRole(role)) {
        activeScreen = <AdminDashboard onNavigate={navigate} role={role} />;
      } else {
        activeScreen = <HomeScreen onNavigate={navigate} />;
      }
      break;
    case 'adminlogin':
      activeScreen = <AdminLoginScreen onNavigate={navigate} />;
      break;
    case 'allshows':
      activeScreen = <AllShowsScreen onNavigate={navigate} />;
      break;
    case 'showdetails':
      activeScreen = <ShowDetailsScreen movieId={selectedMovieId} onNavigate={navigate} />;
      break;
    case 'seatselection':
      activeScreen = (
        <SeatSelectionScreen
          movieId={selectedMovieId}
          showtimeId={selectedShowtimeId}
          onNavigate={navigate}
        />
      );
      break;
    case 'checkout':
      activeScreen = (
        <CheckoutScreen
          movieId={selectedMovieId}
          showtimeId={selectedShowtimeId}
          seats={selectedSeats}
          onNavigate={navigate}
        />
      );
      break;
    case 'bookingconfirmation':
      activeScreen = (
        <BookingConfirmationScreen
          bookingId={checkoutBookingId}
          mode={checkoutMode}
          onNavigate={navigate}
        />
      );
      break;
    case 'bookinglookup':
      activeScreen = <BookingLookupScreen onNavigate={navigate} />;
      break;
    case 'ticket':
      activeScreen = <TicketScreen ticketRef={selectedMovieId} onNavigate={navigate} />;
      break;
    default:
      activeScreen = <HomeScreen onNavigate={navigate} />;
  }

  return (
    <ModalProvider>
      {activeScreen}
      <CompleteProfileModal
        visible={!!pendingProfile}
        userId={pendingProfile?.userId ?? null}
        nameMissing={pendingProfile?.nameMissing ?? false}
        onComplete={handleProfileCompleted}
      />
    </ModalProvider>
  );
}

const styles = StyleSheet.create({
  adminLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a18' },
});
