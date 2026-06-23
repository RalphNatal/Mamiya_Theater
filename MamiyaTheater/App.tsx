import React, { useState } from 'react';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';

type Screen = 'home' | 'login' | 'signup';

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');

  const navigate = (screen: Screen) => setCurrentScreen(screen);

  if (currentScreen === 'login') return <LoginScreen onNavigate={navigate} />;
  if (currentScreen === 'signup') return <SignupScreen onNavigate={navigate} />;
  return <HomeScreen onNavigate={navigate} />;
};

export default App;