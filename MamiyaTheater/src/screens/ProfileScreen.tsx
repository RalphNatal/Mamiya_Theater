import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Image,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';

type Props = {
  onNavigate: (screen: 'home' | 'login' | 'signup' | 'about' | 'profile' | 'contact') => void;
};

const SIDEBAR_ITEMS = [
  { key: 'overview', label: 'Overview', icon: 'grid-outline' },
  { key: 'details', label: 'Update details', icon: 'person-outline' },
  { key: 'wallet', label: 'Card wallet', icon: 'card-outline' },
  { key: 'bookings', label: 'Bookings and transactions', icon: 'receipt-outline' },
  { key: 'rewards', label: 'Rewards and offers', icon: 'gift-outline' },
  { key: 'watchlist', label: 'Watchlist', icon: 'bookmark-outline' },
] as const;

const ProfileScreen = ({ onNavigate }: Props) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [activeSection, setActiveSection] = useState<string>('overview');

  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;
  const navbarShadowOpacity = scrollY.interpolate({
    inputRange: [0, 30],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const activeLabel = SIDEBAR_ITEMS.find(item => item.key === activeSection)?.label ?? 'Overview';

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onNavigate('home');
  };

  const sidebarContent = (
    <>
      {SIDEBAR_ITEMS.map(item => (
        <TouchableOpacity
          key={item.key}
          style={[styles.sidebarItem, activeSection === item.key && styles.sidebarItemActive]}
          onPress={() => setActiveSection(item.key)}
          activeOpacity={0.7}
        >
          <Icon
            name={item.icon}
            size={18}
            color={activeSection === item.key ? '#C8102E' : '#666'}
            style={styles.sidebarIcon}
          />
          <Text style={[styles.sidebarLabel, activeSection === item.key && styles.sidebarLabelActive]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
      <View style={styles.sidebarDivider} />
      <TouchableOpacity style={styles.sidebarItem} onPress={handleSignOut} activeOpacity={0.7}>
        <Icon name="log-out-outline" size={18} color="#C8102E" style={styles.sidebarIcon} />
        <Text style={styles.signOutLabel}>Sign out</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />

      {/* ── NAVBAR (fixed, always on top) ── */}
      <Animated.View
        onLayout={e => setNavbarHeight(e.nativeEvent.layout.height)}
        style={[styles.navbarFixed, { shadowOpacity: navbarShadowOpacity }]}
      >
        {isDesktop ? (
          <View style={styles.navbar}>
            <View style={styles.navLeft}>
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.navLogoImage}
                resizeMode="contain"
              />
              <Text style={styles.navLogoText}>Mamiya Theater</Text>
            </View>
            <View style={styles.navCenter}>
              {['Home', 'About Us', 'Shows', 'Contact'].map(link => (
                <TouchableOpacity
                  key={link}
                  onPress={() => {
                    if (link === 'Home') onNavigate('home');
                    if (link === 'About Us') onNavigate('about');
                    if (link === 'Contact') onNavigate('contact');
                  }}
                >
                  <Text style={styles.navLink}>{link}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.navRight}>
              <TouchableOpacity style={styles.navProfileBtn} onPress={() => onNavigate('profile')}>
                <Icon name="person-circle" size={26} color="#C8102E" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.mobileNav}>
            <View style={styles.navLeft}>
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.navLogoImage}
                resizeMode="contain"
              />
              <Text style={styles.navLogoText}>Mamiya Theater</Text>
            </View>
            <TouchableOpacity onPress={() => onNavigate('profile')}>
              <Icon name="person-circle" size={24} color="#C8102E" />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: navbarHeight }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >

        {/* ── MOBILE SIDEBAR (stacked vertical list) ── */}
        {!isDesktop && <View style={styles.mobileSidebar}>{sidebarContent}</View>}

        <View style={[styles.body, isDesktop && styles.bodyDesktop, !isDesktop && styles.bodyMobile]}>
          {isDesktop && <View style={styles.sidebar}>{sidebarContent}</View>}

          <View style={[styles.main, isDesktop && styles.mainDesktop]}>

            {/* ── PROFILE IDENTITY CARD ── */}
            <View style={styles.identityCard}>
              <TouchableOpacity style={styles.viewCardLink}>
                <Text style={styles.viewCardText}>View card</Text>
              </TouchableOpacity>
              <View style={styles.identityRow}>
                <View style={styles.avatarWrap}>
                  <Icon name="person-circle" size={72} color="#C8102E" />
                </View>
                <View style={styles.identityInfo}>
                  <Text style={styles.identityName}>Ralph Llvewyne Natal</Text>
                  <View style={styles.membershipBadge}>
                    <Text style={styles.membershipBadgeText}>Basic Member, Mamiya Club</Text>
                  </View>
                  <Text style={styles.identityId}>Membership ID: 88884439684425</Text>
                </View>
              </View>
            </View>

            {/* ── SECTION CONTENT ── */}
            {activeSection === 'overview' ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Icon name="receipt-outline" size={40} color="#C8102E" />
                </View>
                <Text style={styles.emptyHeadline}>You don&apos;t have any upcoming bookings.</Text>
                <Text style={styles.emptySubtitle}>
                  Bookings for today&apos;s showtimes will be shown here.
                </Text>
                <TouchableOpacity
                  style={styles.browseBtn}
                  activeOpacity={0.85}
                  onPress={() => onNavigate('home')}
                >
                  <Text style={styles.browseBtnText}>Browse Shows</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.placeholderState}>
                <Text style={styles.placeholderText}>{activeLabel} — coming soon.</Text>
              </View>
            )}
          </View>
        </View>

      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const FONT = 'Urbanist';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#F8F9FA' },

  // ── NAVBAR ──
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
  navLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLogoImage: { width: 28, height: 28 },
  navLogoText: { color: '#fff', fontWeight: '800', fontSize: 15, fontFamily: FONT },
  navCenter: { flexDirection: 'row', gap: 28 },
  navLink: { color: '#ccc', fontSize: 13, fontWeight: '500', fontFamily: FONT },
  navRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 },
  navProfileBtn: {},

  // ── DASHBOARD BODY ──
  body: { paddingHorizontal: 20, paddingVertical: 24 },
  bodyDesktop: { flexDirection: 'row', paddingHorizontal: 60, paddingVertical: 40, gap: 32 },
  bodyMobile: { paddingTop: 16 },

  // ── SIDEBAR ──
  sidebar: {
    width: 260, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#eee', padding: 12, alignSelf: 'flex-start',
  },
  mobileSidebar: {
    backgroundColor: '#fff', marginHorizontal: 20, marginTop: 16,
    borderRadius: 12, borderWidth: 1, borderColor: '#eee', padding: 10,
  },
  sidebarItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8, marginBottom: 2,
  },
  sidebarItemActive: { backgroundColor: 'rgba(200,16,46,0.08)' },
  sidebarIcon: { width: 18 },
  sidebarLabel: { fontSize: 13, color: '#444', fontWeight: '500', fontFamily: FONT },
  sidebarLabelActive: { color: '#C8102E', fontWeight: '700' },
  sidebarDivider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  signOutLabel: { fontSize: 13, color: '#C8102E', fontWeight: '700', fontFamily: FONT },

  // ── MAIN CONTENT ──
  main: { flex: 1, gap: 24 },
  mainDesktop: {},

  // ── IDENTITY CARD ──
  identityCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    padding: 24, position: 'relative',
  },
  viewCardLink: { position: 'absolute', top: 20, right: 20 },
  viewCardText: { color: '#C8102E', fontSize: 12, fontWeight: '700', fontFamily: FONT },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  avatarWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  identityInfo: { flex: 1 },
  identityName: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 6, fontFamily: FONT },
  membershipBadge: {
    backgroundColor: 'rgba(200,16,46,0.08)', alignSelf: 'flex-start',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8,
  },
  membershipBadgeText: { color: '#C8102E', fontSize: 12, fontWeight: '700', fontFamily: FONT },
  identityId: { fontSize: 12, color: '#888', fontFamily: FONT },

  // ── EMPTY STATE (OVERVIEW) ──
  emptyState: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    paddingVertical: 56, paddingHorizontal: 24, alignItems: 'center',
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyHeadline: {
    fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 8,
    textAlign: 'center', fontFamily: FONT,
  },
  emptySubtitle: {
    fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 24, fontFamily: FONT,
  },
  browseBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 28, paddingVertical: 13 },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, fontFamily: FONT },

  // ── GENERIC PLACEHOLDER (other sidebar sections) ──
  placeholderState: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    paddingVertical: 48, alignItems: 'center',
  },
  placeholderText: { fontSize: 13, color: '#999', fontFamily: FONT },
});

export default ProfileScreen;
