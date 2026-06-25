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
  Linking,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { Session } from '@supabase/supabase-js';

type Props = {
  onNavigate: (screen: 'home' | 'login' | 'signup' | 'about' | 'profile' | 'contact' | 'admin') => void;
  session?: Session | null;
};

const PHONE_NUMBER = '(808) 739-4886';

const AboutUsScreen = ({ onNavigate, session }: Props) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const isSignedIn = !!session;

  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;
  const navbarShadowOpacity = scrollY.interpolate({
    inputRange: [0, 30],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

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
              {isSignedIn ? (
                <TouchableOpacity style={styles.navProfileBtn} onPress={() => onNavigate('profile')}>
                  <Icon name="person-circle-outline" size={26} color="#fff" />
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity onPress={() => onNavigate('login')}>
                    <Text style={styles.navLogin}>Log In</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.navSignupBtn} onPress={() => onNavigate('signup')}>
                    <Text style={styles.navSignupText}>Sign Up</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.mobileNav}>
            <TouchableOpacity style={styles.navLeft} onPress={() => onNavigate('home')}>
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.navLogoImage}
                resizeMode="contain"
              />
              <Text style={styles.navLogoText}>Mamiya Theater</Text>
            </TouchableOpacity>
            <View style={styles.mobileNavRight}>
              {isSignedIn ? (
                <TouchableOpacity style={styles.navProfileBtn} onPress={() => onNavigate('profile')}>
                  <Icon name="person-circle-outline" size={24} color="#fff" />
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity onPress={() => onNavigate('login')}>
                    <Text style={styles.navLogin}>Log In</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.navSignupBtn} onPress={() => onNavigate('signup')}>
                    <Text style={styles.navSignupText}>Sign Up</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
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

        {/* ── TWO-COLUMN SPLIT ── */}
        <View style={[styles.splitContainer, isDesktop ? styles.splitContainerDesktop : styles.splitContainerMobile]}>
          <View style={[styles.splitText, isDesktop && styles.splitTextDesktop]}>
            <Text style={styles.headline}>THE SAINT LOUIS CENTER FOR THE ARTS</Text>
            <Text style={styles.bodyText}>
              The Dr. Richard T. Mamiya Theatre is a premier performance venue located in
              Kaimuki on the Saint Louis School / Chaminade University campus. Available for
              rent 7 days a week, the facility hosts school functions, ambitious theatrical
              productions, concerts, and community events. Site management and in-house
              technical support are provided by KaiHonua Entertainment.
            </Text>
            <TouchableOpacity
              style={styles.contactBtn}
              activeOpacity={0.85}
              onPress={() => Linking.openURL(`tel:${PHONE_NUMBER.replace(/[^\d+]/g, '')}`)}
            >
              <Text style={styles.contactBtnText}>Contact Us</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.splitImageWrap, isDesktop && styles.splitImageWrapDesktop]}>
            <Image
              source={{ uri: 'https://www.uri.edu/programs/wp-content/uploads/programs/sites/3/2013/08/Theatre.jpg' }}
              style={styles.splitImage}
              resizeMode="cover"
            />
          </View>
        </View>

        {/* ── STATISTICS BANNER ── */}
        <View style={[styles.statsBanner, isDesktop ? styles.statsBannerDesktop : styles.statsBannerMobile]}>
          <View style={styles.statColumn}>
            <Text style={styles.statNumber}>500</Text>
            <Text style={styles.statLabel}>Auditorium Seats</Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={styles.statNumber}>35&apos; x 40&apos;</Text>
            <Text style={styles.statLabel}>Proscenium Stage</Text>
          </View>
          <View style={styles.statColumn}>
            <Text style={styles.statNumber}>4K</Text>
            <Text style={styles.statLabel}>High-Def Streaming</Text>
          </View>
        </View>

        {/* ── LOCATION & HOURS FOOTER ── */}
        <View style={styles.locationFooter}>
          <Text style={styles.locationText}>3142 Waialae Avenue, Honolulu, HI 96816-1579</Text>
          <Text style={styles.locationText}>Office Hours: Monday – Friday, 9:00 am – 4:00 pm</Text>
        </View>

        {/* ── FOOTER ── */}
        {isDesktop ? (
          <View style={styles.footer}>
            <View style={styles.footerTop}>
              <View style={styles.footerBrand}>
                <View style={styles.footerLogoRow}>
                  <Image
                    source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                    style={styles.footerLogoImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.footerLogoText}>Mamiya Theater</Text>
                </View>
                <Text style={styles.footerTagline}>
                  Your premier destination for professional theater tickets. Experience the magic of live performance.
                </Text>
              </View>
              <View style={styles.footerCol}>
                <Text style={styles.footerColTitle}>Quick Links</Text>
                {['All Shows', 'Gift Cards', 'Special Offers', 'Group Bookings'].map(link => (
                  <TouchableOpacity key={link}><Text style={styles.footerLink}>{link}</Text></TouchableOpacity>
                ))}
              </View>
              <View style={styles.footerCol}>
                <Text style={styles.footerColTitle}>Support</Text>
                {['Help Center', 'Contact Us', 'Refund Policy', 'Accessibility'].map(link => (
                  <TouchableOpacity key={link}><Text style={styles.footerLink}>{link}</Text></TouchableOpacity>
                ))}
              </View>
              <View style={styles.footerCol}>
                <Text style={styles.footerColTitle}>Newsletter</Text>
                <Text style={styles.newsletterDesc}>Subscribe for the latest updates, alerts, and exclusive previews.</Text>
                <View style={styles.newsletterRow}>
                  <TextInput style={styles.newsletterInput} placeholder="Email address" placeholderTextColor="#666" />
                  <TouchableOpacity style={styles.joinBtn}><Text style={styles.joinBtnText}>Join</Text></TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.footerBottom}>
              <Text style={styles.footerCopy}>© 2026 Mamiya Theater. All rights reserved.</Text>
              <View style={styles.footerLinks}>
                <TouchableOpacity><Text style={styles.footerBottomLink}>Privacy Policy</Text></TouchableOpacity>
                <Text style={styles.footerDot}> · </Text>
                <TouchableOpacity><Text style={styles.footerBottomLink}>Terms of Service</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          /* MOBILE FOOTER — stacked */
          <View style={styles.mobileFooter}>
            <View style={styles.mobileFooterLogo}>
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.footerLogoImage}
                resizeMode="contain"
              />
              <Text style={styles.footerLogoText}>Mamiya Theater</Text>
            </View>
            <Text style={styles.mobileFooterTagline}>
              Your premier destination for professional theater tickets.
            </Text>

            {/* Newsletter */}
            <Text style={styles.footerColTitle}>Newsletter</Text>
            <View style={styles.newsletterRow}>
              <TextInput style={styles.newsletterInput} placeholder="Email address" placeholderTextColor="#666" />
              <TouchableOpacity style={styles.joinBtn}><Text style={styles.joinBtnText}>Join</Text></TouchableOpacity>
            </View>

            {/* Links grid */}
            <View style={styles.mobileFooterGrid}>
              <View style={styles.mobileFooterCol}>
                <Text style={styles.footerColTitle}>Quick Links</Text>
                {['All Shows', 'Gift Cards', 'Special Offers', 'Group Bookings'].map(link => (
                  <TouchableOpacity key={link}><Text style={styles.footerLink}>{link}</Text></TouchableOpacity>
                ))}
              </View>
              <View style={styles.mobileFooterCol}>
                <Text style={styles.footerColTitle}>Support</Text>
                {['Help Center', 'Contact Us', 'Refund Policy', 'Accessibility'].map(link => (
                  <TouchableOpacity key={link}><Text style={styles.footerLink}>{link}</Text></TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.footerBottom}>
              <Text style={styles.footerCopy}>© 2026 Mamiya Theater. All rights reserved.</Text>
              <View style={styles.footerLinks}>
                <TouchableOpacity><Text style={styles.footerBottomLink}>Privacy</Text></TouchableOpacity>
                <Text style={styles.footerDot}> · </Text>
                <TouchableOpacity><Text style={styles.footerBottomLink}>Terms</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        )}

      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#FFFFFF' },

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
  navLogoText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  navCenter: { flexDirection: 'row', gap: 28 },
  navLink: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 },
  mobileNavRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogin: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navSignupBtn: { backgroundColor: '#C8102E', borderRadius: 5, paddingHorizontal: 14, paddingVertical: 7 },
  navSignupText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  navProfileBtn: {},

  // ── TWO-COLUMN SPLIT ──
  splitContainer: { backgroundColor: '#FFFFFF' },
  splitContainerDesktop: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 60, paddingVertical: 64, gap: 56,
  },
  splitContainerMobile: {
    flexDirection: 'column', paddingHorizontal: 22, paddingVertical: 40, gap: 28,
  },
  splitText: {},
  splitTextDesktop: { flex: 1 },
  headline: {
    fontSize: 30, fontWeight: '900', color: '#000', textTransform: 'uppercase',
    letterSpacing: 0.5, lineHeight: 38, marginBottom: 18,
  },
  bodyText: { fontSize: 15, lineHeight: 24, color: '#444', marginBottom: 26 },
  contactBtn: {
    backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 26,
    paddingVertical: 14, alignSelf: 'flex-start',
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
  },
  contactBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  splitImageWrap: { width: '100%' },
  splitImageWrapDesktop: { flex: 1 },
  splitImage: {
    width: '100%', height: 320, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 8,
  },

  // ── STATISTICS BANNER ──
  statsBanner: { backgroundColor: '#C8102E' },
  statsBannerDesktop: {
    flexDirection: 'row', paddingHorizontal: 60, paddingVertical: 48,
  },
  statsBannerMobile: {
    flexDirection: 'column', paddingHorizontal: 24, paddingVertical: 36, gap: 28,
  },
  statColumn: { flex: 1, alignItems: 'center' },
  statNumber: { color: '#fff', fontSize: 40, fontWeight: '900', marginBottom: 8 },
  statLabel: {
    color: '#fff', fontSize: 13, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 1, opacity: 0.9,
  },

  // ── LOCATION & HOURS FOOTER ──
  locationFooter: {
    backgroundColor: '#f8f9fa', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 32, gap: 6,
  },
  locationText: { color: '#444', fontSize: 14, lineHeight: 22, textAlign: 'center' },

  // ── FOOTER DESKTOP ──
  footer: { backgroundColor: '#12122a', paddingHorizontal: 60, paddingTop: 40, paddingBottom: 20 },
  footerTop: { flexDirection: 'row', gap: 32, marginBottom: 32 },
  footerBrand: { flex: 1.6 },
  footerLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  footerLogoImage: { width: 22, height: 22 },
  footerLogoText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  footerTagline: { color: '#777', fontSize: 11, lineHeight: 18 },
  footerCol: { flex: 1 },
  footerColTitle: { color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 12, letterSpacing: 0.5 },
  footerLink: { color: '#777', fontSize: 11, marginBottom: 8 },
  newsletterDesc: { color: '#777', fontSize: 11, lineHeight: 17, marginBottom: 12 },
  newsletterRow: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 6, overflow: 'hidden' },
  newsletterInput: { flex: 1, fontSize: 12, color: '#333', paddingHorizontal: 12, paddingVertical: 10 },
  joinBtn: { backgroundColor: '#C8102E', paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  footerBottom: {
    borderTopWidth: 1, borderTopColor: '#22224a', paddingTop: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
  },
  footerCopy: { color: '#555', fontSize: 11 },
  footerLinks: { flexDirection: 'row', alignItems: 'center' },
  footerBottomLink: { color: '#777', fontSize: 11 },
  footerDot: { color: '#555', fontSize: 11 },

  // ── FOOTER MOBILE ──
  mobileFooter: { backgroundColor: '#12122a', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 20 },
  mobileFooterLogo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  mobileFooterTagline: { color: '#666', fontSize: 12, lineHeight: 18, marginBottom: 24 },
  mobileFooterGrid: { flexDirection: 'row', gap: 20, marginTop: 24, marginBottom: 24 },
  mobileFooterCol: { flex: 1 },
});

export default AboutUsScreen;