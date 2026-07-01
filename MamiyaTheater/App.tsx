import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/Loginscreen';
import SignupScreen from './src/screens/Signupscreen';
import AboutUsScreen from './src/screens/AboutUsScreen';
import ContactScreen from './src/screens/ContactScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminDashboard from './src/screens/admin/AdminDashboard';
import AdminLoginScreen from './src/screens/AdminLoginScreen';
import AllShowsScreen from './src/screens/AllShowsScreen';
import ShowDetailsScreen from './src/screens/ShowDetailsScreen';
import SeatSelectionScreen from './src/screens/SeatSelectionScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import BookingConfirmationScreen from './src/screens/BookingConfirmationScreen';
import CompleteProfileModal from './src/components/CompleteProfileModal';
import { ModalProvider } from './src/components/ModalProvider';
import type { Screen } from './src/types/navigation';

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

export default function App() {
  const initialCheckout = useRef(parseCheckoutReturn()).current;

  const [screen, setScreen]   = useState<Screen>(initialCheckout ? 'bookingconfirmation' : 'home');
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const [selectedShowtimeId, setSelectedShowtimeId] = useState<string | null>(null);
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
  // "is there a session" AND "is that user's profiles.role === 'admin'"
  // before ever rendering AdminDashboard.
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(true); // true = no pending role lookup

  // When a signed-in user has no mobile_number yet (always true for brand-new
  // Google sign-ins, since Google never shares a phone number), we hold them
  // here until they complete their profile, then route to Home. `nameMissing`
  // tells the modal to also collect a full name (rare — Google usually gives one).
  const [pendingProfile, setPendingProfile] = useState<{ userId: string; nameMissing: boolean } | null>(null);

  // The auth listener below is set up once on mount, so it closes over a stale
  // `screen` value. Keep a ref in sync so it can always read the current screen.
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

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

    // Required field for the app is the mobile number; prompt once to collect
    // it (and the name too, if that's somehow empty). Google users always land
    // here on first sign-in since Google never shares a phone number.
    if (!profile?.mobile_number) {
      setPendingProfile({ userId, nameMissing: !(profile as any)?.full_name?.trim() });
      return;
    }

    setScreen('home');
  }, [syncProfile]);

  useEffect(() => {
    // Listen for auth state changes (login / logout / Google OAuth redirect-back).
    // This is the single place that routes post-auth for BOTH email/password and
    // Google sign-in, since the Google flow redirects away and back and can't
    // react to its own result from within Loginscreen/Signupscreen.
    //
    // IMPORTANT: only the 'SIGNED_IN' event represents an actual new login that
    // should trigger navigation. Supabase also fires this same callback for
    // 'TOKEN_REFRESHED' (happens silently every ~hour while the tab is open) and
    // 'INITIAL_SESSION' (fires once on page load if a session is already
    // persisted) — treating those the same as a fresh sign-in used to yank the
    // user back to Home mid-browsing on every token refresh. They're handled
    // separately below so neither one forces a navigation.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);

        if (event === 'SIGNED_OUT' || !newSession) {
          setRole(null);
          setRoleLoaded(true);
          setPendingProfile(null);
          // Don't yank a returning guest off the checkout confirmation screen:
          // a signed-out guest fires INITIAL_SESSION with no session right as
          // they land back from Stripe. A real sign-out still goes home.
          if (!(event === 'INITIAL_SESSION' && screenRef.current === 'bookingconfirmation')) {
            setScreen('home');
          }
          return;
        }

        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          // Identity/role hasn't changed — nothing to re-sync or navigate.
          return;
        }

        if (event === 'INITIAL_SESSION') {
          // Page load with an already-persisted session: keep `role` in sync
          // for the NavBar/AdminDashboard guard, but don't force navigation —
          // stay wherever `screen` already is. Still re-prompt for a missing
          // mobile number so an unfinished profile is completed on the next
          // visit too — except on the checkout confirmation screen, where a
          // returning buyer shouldn't be interrupted.
          syncProfile(newSession.user.id).then((profile) => {
            if (profile && !profile.mobile_number && screenRef.current !== 'bookingconfirmation') {
              setPendingProfile({ userId: newSession.user.id, nameMissing: !(profile as any)?.full_name?.trim() });
            }
          });
          return;
        }

        // event === 'SIGNED_IN': a real, fresh sign-in (password, or the
        // Google OAuth redirect landing back) — this is the only case that
        // should route the user anywhere.
        setRoleLoaded(false);

        if (screenRef.current === 'adminlogin') {
          // AdminLoginScreen verifies role itself and routes (or signs out
          // and rejects) on its own. We still sync `role` here so the
          // 'admin' guard below doesn't immediately bounce a legitimately
          // verified admin back out — we just skip the Home/phone-modal
          // routing handlePostAuth would otherwise force.
          syncProfile(newSession.user.id);
          return;
        }

        handlePostAuth(newSession.user.id);
      }
    );

    return () => subscription.unsubscribe();
  }, [handlePostAuth, syncProfile]);

  // Keep `screen` truthful: if something ever lands on 'admin' without a
  // verified admin session (there's currently no public path that does this,
  // but this is the actual enforcement, not just a render-time skip), bounce
  // to Home (or Login if signed out) once the role lookup has settled.
  useEffect(() => {
    if (screen !== 'admin' || !roleLoaded) return;
    if (!(session && role === 'admin')) {
      setScreen(session ? 'home' : 'login');
    }
  }, [screen, roleLoaded, session, role]);

  const navigate = (s: Screen, movieId?: string, showtimeId?: string, seats?: string[]) => {
    if (movieId) setSelectedMovieId(movieId);
    if (showtimeId) setSelectedShowtimeId(showtimeId);
    if (seats) setSelectedSeats(seats);
    setScreen(s);
  };

  const handleProfileCompleted = () => {
    setPendingProfile(null);
    setScreen('home');
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
      } else if (session && role === 'admin') {
        activeScreen = <AdminDashboard onNavigate={navigate} />;
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
