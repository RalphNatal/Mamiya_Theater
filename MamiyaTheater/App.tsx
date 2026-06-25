import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/Loginscreen';
import SignupScreen from './src/screens/Signupscreen';
import AboutUsScreen from './src/screens/AboutUsScreen';
import ContactScreen from './src/screens/ContactScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminDashboard from './src/screens/admin/AdminDashboard';

type Screen = 'home' | 'login' | 'signup' | 'about' | 'profile' | 'contact' | 'admin';

export default function App() {
  const [screen, setScreen]   = useState<Screen>('home');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) {
          setScreen('home');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const navigate = (s: Screen) => setScreen(s);

  switch (screen) {
    case 'login':
      return <LoginScreen   onNavigate={navigate} />;
    case 'signup':
      return <SignupScreen  onNavigate={navigate} />;
    case 'about':
      return <AboutUsScreen onNavigate={navigate} />;
    case 'contact':
      return <ContactScreen onNavigate={navigate} />;
    case 'profile':
      return <ProfileScreen onNavigate={navigate} />;
    case 'admin':
      return <AdminDashboard onNavigate={navigate} />;
    default:
      return <HomeScreen    onNavigate={navigate} session={session} />;
  }
}