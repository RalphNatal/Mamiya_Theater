import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  Image,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import type { OnNavigate } from '../types/navigation';

type NavBarProps = {
  onNavigate: OnNavigate;
  scrollY: Animated.Value;
  onHeightChange: (height: number) => void;
  /** Show a back chevron on mobile instead of treating the logo as the only home link (use on sub-pages like All Shows / Show Details). */
  showBackButton?: boolean;
};

const NAV_LINKS = ['Home', 'About Us', 'Shows', 'Contact'] as const;

const NavBar = ({ onNavigate, scrollY, onHeightChange, showBackButton }: NavBarProps) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // ── Auth state ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Role lookup (drives the Admin Dashboard button) ──
  useEffect(() => {
    if (!userId) {
      setRole(null);
      return;
    }
    supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
      .then(({ data }) => setRole(data?.role ?? null));
  }, [userId]);

  const isSignedIn = !!userId;
  const isAdmin = role === 'admin';

  // ── Hidden admin entry point: 5 quick taps on the logo within 2s. ──
  const logoTapsRef = useRef<number[]>([]);
  const handleLogoPress = () => {
    const now = Date.now();
    logoTapsRef.current = [...logoTapsRef.current, now].filter(t => now - t < 2000);
    if (logoTapsRef.current.length >= 5) {
      logoTapsRef.current = [];
      onNavigate('adminlogin');
      return;
    }
    onNavigate('home');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onNavigate('home');
  };

  const handleLinkPress = (link: typeof NAV_LINKS[number]) => {
    if (link === 'Home') onNavigate('home');
    if (link === 'About Us') onNavigate('about');
    if (link === 'Shows') onNavigate('allshows');
    if (link === 'Contact') onNavigate('contact');
  };

  const shadowOpacity = scrollY.interpolate({
    inputRange: [0, 30],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const AuthControls = isSignedIn ? (
    <>
      {isAdmin && (
        <TouchableOpacity style={styles.adminBtn} onPress={() => onNavigate('admin')} activeOpacity={0.8}>
          <Text style={styles.adminBtnText}>Admin Dashboard</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.navProfileBtn} onPress={() => onNavigate('profile')}>
        <Icon name="person-circle-outline" size={isDesktop ? 26 : 24} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={handleLogout}>
        <Text style={styles.navLogout}>Log Out</Text>
      </TouchableOpacity>
    </>
  ) : (
    <>
      <TouchableOpacity onPress={() => onNavigate('login')}>
        <Text style={styles.navLogin}>Log In</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navSignupBtn} onPress={() => onNavigate('signup')}>
        <Text style={styles.navSignupText}>Sign Up</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Animated.View
      onLayout={e => onHeightChange(e.nativeEvent.layout.height)}
      style={[styles.navbarFixed, { shadowOpacity }]}
    >
      {isDesktop ? (
        <View style={styles.navbar}>
          <TouchableOpacity style={styles.navLeft} onPress={handleLogoPress}>
            <Image
              source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
              style={styles.navLogoImage}
              resizeMode="contain"
            />
            <Text style={styles.navLogoText}>Mamiya Theater</Text>
          </TouchableOpacity>
          <View style={styles.navCenter}>
            {NAV_LINKS.map(link => (
              <TouchableOpacity key={link} onPress={() => handleLinkPress(link)}>
                <Text style={styles.navLink}>{link}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.navRight}>{AuthControls}</View>
        </View>
      ) : (
        <View style={styles.mobileNav}>
          {showBackButton && (
            <TouchableOpacity style={styles.backBtn} onPress={() => onNavigate('home')}>
              <Icon name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.navLeft} onPress={handleLogoPress}>
            <Image
              source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
              style={styles.navLogoImage}
              resizeMode="contain"
            />
            <Text style={styles.navLogoText}>Mamiya Theater</Text>
          </TouchableOpacity>
          <View style={styles.mobileNavRight}>{AuthControls}</View>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  navbarFixed: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
    elevation: 8,
  },
  navbar: {
    backgroundColor: '#12122a', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 60, paddingVertical: 14,
  },
  mobileNav: {
    backgroundColor: '#12122a', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14,
  },
  backBtn: { width: 28 },
  navLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLogoImage: { width: 28, height: 28 },
  navLogoText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  navCenter: { flexDirection: 'row', gap: 28 },
  navLink: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 },
  mobileNavRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogin: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navSignupBtn: { backgroundColor: '#C8102E', borderRadius: 5, paddingHorizontal: 14, paddingVertical: 7 },
  navSignupText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  navProfileBtn: {},
  navLogout: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  adminBtn: {
    borderWidth: 1, borderColor: '#C8102E', borderRadius: 5,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  adminBtnText: { color: '#C8102E', fontWeight: '700', fontSize: 12 },
});

export default NavBar;
