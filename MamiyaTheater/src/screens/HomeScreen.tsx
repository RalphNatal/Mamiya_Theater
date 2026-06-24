import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ImageBackground,
  SafeAreaView,
  TextInput,
  Image,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { Session } from '@supabase/supabase-js';
import { nowShowing } from '../data/shows';

type Show = {
  id: string;
  title: string;
  price: number;
  ticketStatus: string;
  admission: string;
  image: string;
};

type HomeProps = {
  onNavigate: (screen: 'home' | 'login' | 'signup' | 'about' | 'profile' | 'contact') => void;
  session?: Session | null;
};

// ── SHOW CARD ──────────────────────────────────────────
const ShowCard = ({ show, isDesktop, cardWidth }: { show: Show; isDesktop: boolean; cardWidth?: number }) => {
  const imgHeight = cardWidth ? Math.round(cardWidth * 0.58) : 160;
  return (
  <View style={[cardStyles.card, cardWidth ? { width: cardWidth } : (!isDesktop ? cardStyles.cardMobile : {})]}>
    <View style={cardStyles.imageWrapper}>
      <Image source={{ uri: show.image }} style={[cardStyles.image, { height: imgHeight }]} />
      <View style={cardStyles.priceBadge}>
        <Text style={cardStyles.priceFrom}>From</Text>
        <Text style={cardStyles.priceAmount}>${show.price}</Text>
      </View>
    </View>
    <View style={cardStyles.body}>
      <Text style={cardStyles.title} numberOfLines={2}>{show.title}</Text>
      <View style={cardStyles.infoRow}>
        <Text style={cardStyles.infoIcon}>▪</Text>
        <Text style={cardStyles.infoText}>{show.ticketStatus}</Text>
      </View>
      <View style={cardStyles.infoRow}>
        <Text style={cardStyles.infoIcon}>▪</Text>
        <Text style={cardStyles.infoText}>{show.admission}</Text>
      </View>
      <TouchableOpacity style={cardStyles.btn} activeOpacity={0.8}>
        <Text style={cardStyles.btnText}>Book Now</Text>
      </TouchableOpacity>
    </View>
  </View>
  );
};

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden',
    marginBottom: 20, flex: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  cardMobile: { flex: 0, width: '100%', marginBottom: 16 },
  imageWrapper: { position: 'relative' },
  image: { width: '100%', height: 160, resizeMode: 'cover' },
  imageMobile: { height: 180 },
  priceBadge: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: '#fff', borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12, shadowRadius: 3, elevation: 3,
  },
  priceFrom: { fontSize: 8, color: '#888', textTransform: 'uppercase' },
  priceAmount: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  body: { padding: 12 },
  title: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 7 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  infoIcon: { fontSize: 8, color: '#C8102E', marginRight: 6 },
  infoText: { fontSize: 11, color: '#666' },
  btn: {
    backgroundColor: '#C8102E', borderRadius: 6,
    paddingVertical: 10, alignItems: 'center', marginTop: 10,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});

// ── HOME SCREEN ────────────────────────────────────────
const HomeScreen = ({ onNavigate, session }: HomeProps) => {
  const isSignedIn = !!session;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const isTablet = width >= 600 && width < 768;

  const [navbarHeight, setNavbarHeight] = useState(60);
  const [containerWidth, setContainerWidth] = useState(0);

  const numCols = isDesktop ? 3 : isTablet ? 2 : 1;
  const gap = 16;
  const cardWidth = containerWidth > 0
    ? (containerWidth - gap * (numCols - 1)) / numCols
    : 0;
  const rows: Show[][] = [];
  for (let i = 0; i < nowShowing.length; i += numCols) {
    rows.push(nowShowing.slice(i, i + numCols));
  }
  const scrollY = useRef(new Animated.Value(0)).current;
  const navbarShadowOpacity = scrollY.interpolate({
    inputRange: [0, 30],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const renderCard = ({ item }: { item: Show }) => (
    <ShowCard show={item} isDesktop={isDesktop || isTablet} />
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
            <View style={styles.navLeft}>
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.navLogoImage}
                resizeMode="contain"
              />
              <Text style={styles.navLogoText}>Mamiya Theater</Text>
            </View>
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

        {/* ── HERO ── */}
        <ImageBackground
          source={{ uri: 'https://www.uri.edu/programs/wp-content/uploads/programs/sites/3/2013/08/Theatre.jpg' }}
          style={[styles.hero, !isDesktop && styles.heroMobile]}
          imageStyle={styles.heroBg}
        >
          <View style={[styles.heroOverlay, !isDesktop && styles.heroOverlayMobile]}>
            <Text style={[styles.heroTitle, !isDesktop && styles.heroTitleMobile]}>
              Welcome to Dr. Richard T. Mamiya Theatre
            </Text>
            <Text style={[styles.heroDesc, !isDesktop && styles.heroDescMobile]}>
              Reserve our premier 500-seat facility for your next theatrical production, concert,
              or community event.
            </Text>
          </View>
        </ImageBackground>

        {/* ── NOW SHOWING ── */}
        <View style={[styles.section, !isDesktop && styles.sectionMobile]}>
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, !isDesktop && styles.sectionTitleMobile]}>
                Now Showing
              </Text>
              <View style={styles.sectionUnderline} />
              <Text style={styles.sectionSub}>
                Discover the most spectacular performances in town this season.
              </Text>
            </View>
            <TouchableOpacity>
              <Text style={styles.viewAll}>View All →</Text>
            </TouchableOpacity>
          </View>

          <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
            {cardWidth > 0 && rows.map((row, rowIdx) => (
              <View key={rowIdx} style={[styles.cardRow, { gap, marginBottom: gap }]}>
                {row.map((show) => (
                  <ShowCard
                    key={show.id}
                    show={show}
                    isDesktop={isDesktop || isTablet}
                    cardWidth={cardWidth}
                  />
                ))}
                {row.length < numCols && Array.from({ length: numCols - row.length }).map((_, i) => (
                  <View key={`ph-${i}`} style={{ width: cardWidth }} />
                ))}
              </View>
            ))}
          </View>
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
  scroll: { flex: 1, backgroundColor: '#f4f4f6' },

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
  navProfileBtn: { marginLeft: 2 },

  // ── HERO ──
  hero: { height: 520 },
  heroMobile: { height: 560 },
  heroBg: { resizeMode: 'cover' },
  heroOverlay: {
    flex: 1, backgroundColor: 'rgba(10,5,25,0.65)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 60, paddingVertical: 40,
  },
  heroOverlayMobile: { paddingHorizontal: 24 },
  heroTitle: {
    color: '#fff', fontSize: 44, fontWeight: '900', lineHeight: 52,
    marginBottom: 16, letterSpacing: -0.5, textAlign: 'center', maxWidth: 700,
  },
  heroTitleMobile: { fontSize: 30, lineHeight: 38, marginBottom: 12 },
  heroDesc: {
    color: '#ddd', fontSize: 14, lineHeight: 22,
    textAlign: 'center', maxWidth: 560,
  },
  heroDescMobile: { fontSize: 13, lineHeight: 20 },

  // ── SECTION ──
  section: { paddingHorizontal: 60, paddingTop: 48, paddingBottom: 32 },
  sectionMobile: { paddingHorizontal: 16, paddingTop: 36, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  sectionTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  sectionTitleMobile: { fontSize: 20 },
  sectionUnderline: { width: 36, height: 3, backgroundColor: '#C8102E', borderRadius: 2, marginBottom: 8 },
  sectionSub: { fontSize: 12, color: '#888', maxWidth: 360 },
  viewAll: { color: '#2929ff', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardRow: { flexDirection: 'row' },

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

export default HomeScreen;