import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import PhoneNumberModal from './src/components/PhoneNumberModal';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import AboutUsScreen from './src/screens/AboutUsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ContactScreen from './src/screens/ContactScreen';

type Screen = 'home' | 'login' | 'signup' | 'about' | 'profile' | 'contact';

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [missingPhoneNumber, setMissingPhoneNumber] = useState(false);
  const [savingPhoneNumber, setSavingPhoneNumber] = useState(false);

  const navigate = (screen: Screen) => setCurrentScreen(screen);

  const checkMobileNumber = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('mobile_number')
      .eq('id', userId)
      .single();

    setMissingPhoneNumber(!profile?.mobile_number);
  };

  useEffect(() => {
    // Picks up the session as soon as it's available — including right after
    // Supabase finishes exchanging the auth code when Google redirects back here.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) checkMobileNumber(data.session.user.id);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        navigate('home');
        checkMobileNumber(newSession.user.id);
      } else {
        setMissingPhoneNumber(false);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const handleSavePhoneNumber = async (mobileNumber: string) => {
    if (!session) return;
    try {
      setSavingPhoneNumber(true);
      const { error } = await supabase
        .from('profiles')
        .update({ mobile_number: mobileNumber })
        .eq('id', session.user.id);

      if (error) throw error;

      setMissingPhoneNumber(false);
    } catch (err: any) {
      console.error('Failed to save mobile number:', err);
    } finally {
      setSavingPhoneNumber(false);
    }
  };

  let screen;
  if (currentScreen === 'login') screen = <LoginScreen onNavigate={navigate} />;
  else if (currentScreen === 'signup') screen = <SignupScreen onNavigate={navigate} />;
  else if (currentScreen === 'about') screen = <AboutUsScreen onNavigate={navigate} session={session} />;
  else if (currentScreen === 'profile') screen = <ProfileScreen onNavigate={navigate} />;
  else if (currentScreen === 'contact') screen = <ContactScreen onNavigate={navigate} session={session} />;
  else screen = <HomeScreen onNavigate={navigate} session={session} />;

  return (
    <>
      {screen}
      <PhoneNumberModal
        visible={missingPhoneNumber}
        saving={savingPhoneNumber}
        onSubmit={handleSavePhoneNumber}
      />
    </>
  );
};

export default App;
