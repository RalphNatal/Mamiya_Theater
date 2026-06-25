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
import CompleteProfileModal from './src/components/CompleteProfileModal';
import type { Screen } from './src/types/navigation';

export default function App() {
  const [screen, setScreen]   = useState<Screen>('home');
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);

  // Tracked specifically so the 'admin' route below can verify both
  // "is there a session" AND "is that user's profiles.role === 'admin'"
  // before ever rendering AdminDashboard.
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(true); // true = no pending role lookup

  // When a signed-in user has no mobile_number yet (always true for brand-new
  // Google sign-ins, since Google never shares a phone number), we hold them
  // here until they complete their profile, then route to Home.
  const [pendingPhoneUserId, setPendingPhoneUserId] = useState<string | null>(null);

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
        .select('role, mobile_number')
        .eq('id', userId)
        .single();
      if (error) throw error;

      setRole(profile?.role ?? null);
      return profile;
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

    if (!profile?.mobile_number) {
      setPendingPhoneUserId(userId);
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
          setScreen('home');
          return;
        }

        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          // Identity/role hasn't changed — nothing to re-sync or navigate.
          return;
        }

        if (event === 'INITIAL_SESSION') {
          // Page load with an already-persisted session: keep `role` in sync
          // for the NavBar/AdminDashboard guard, but don't force navigation —
          // stay wherever `screen` already is.
          syncProfile(newSession.user.id);
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

  const navigate = (s: Screen, movieId?: string) => {
    if (movieId) setSelectedMovieId(movieId);
    setScreen(s);
  };

  const handleProfileCompleted = () => {
    setPendingPhoneUserId(null);
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
    default:
      activeScreen = <HomeScreen onNavigate={navigate} />;
  }

  return (
    <>
      {activeScreen}
      <CompleteProfileModal
        visible={!!pendingPhoneUserId}
        userId={pendingPhoneUserId}
        onComplete={handleProfileCompleted}
      />
    </>
  );
}

const styles = StyleSheet.create({
  adminLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a18' },
});
