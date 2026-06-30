import React, { useEffect, useRef, useState } from 'react';
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
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabase';
import NavBar from '../components/NavBar';
import type { OnNavigate } from '../types/navigation';

type Movie = {
  id: string;
  title: string;
  description: string;
  poster_url: string;
  duration_minutes: number;
  genre: string;
  status: string;
};

type HomeProps = {
  onNavigate: OnNavigate;
};

// ── SHOW CARD ──────────────────────────────────────────
const ShowCard = ({ movie, isDesktop, cardWidth, onPress }: { movie: Movie; isDesktop: boolean; cardWidth?: number; onPress: () => void }) => {
  const imgHeight = cardWidth ? Math.round(cardWidth * 0.58) : 160;
  return (
  <TouchableOpacity
    style={[cardStyles.card, cardWidth ? { width: cardWidth } : (!isDesktop ? cardStyles.cardMobile : {})]}
    activeOpacity={0.85}
    onPress={onPress}
  >
    <View style={cardStyles.imageWrapper}>
      <Image source={{ uri: movie.poster_url }} style={[cardStyles.image, { height: imgHeight }]} />
    </View>
    <View style={cardStyles.body}>
      <Text style={cardStyles.title} numberOfLines={2}>{movie.title}</Text>
      <View style={cardStyles.infoRow}>
        <Text style={cardStyles.infoIcon}>▪</Text>
        <Text style={cardStyles.infoText}>{movie.genre}</Text>
      </View>
      <View style={cardStyles.infoRow}>
        <Text style={cardStyles.infoIcon}>▪</Text>
        <Text style={cardStyles.infoText}>{movie.duration_minutes} min</Text>
      </View>
      <TouchableOpacity style={cardStyles.btn} activeOpacity={0.8} onPress={onPress}>
        <Text style={cardStyles.btnText}>Book Now</Text>
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
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
const HomeScreen = ({ onNavigate }: HomeProps) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const isTablet = width >= 600 && width < 768;

  const [navbarHeight, setNavbarHeight] = useState(60);
  const [containerWidth, setContainerWidth] = useState(0);

  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        setIsLoading(true);
        const { data, error: fetchError } = await supabase
          .from('productions')
          .select('*')
          .eq('status', 'now_showing');

        if (fetchError) throw fetchError;
        setMovies(data ?? []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load movies.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMovies();
  }, []);

  const numCols = isDesktop ? 3 : isTablet ? 2 : 1;
  const gap = 16;
  const cardWidth = containerWidth > 0
    ? (containerWidth - gap * (numCols - 1)) / numCols
    : 0;
  const rows: Movie[][] = [];
  for (let i = 0; i < movies.length; i += numCols) {
    rows.push(movies.slice(i, i + numCols));
  }
  const scrollY = useRef(new Animated.Value(0)).current;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />

      <NavBar onNavigate={onNavigate} scrollY={scrollY} onHeightChange={setNavbarHeight} />

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
            <TouchableOpacity onPress={() => onNavigate('allshows')}>
              <Text style={styles.viewAll}>View All →</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color="#C8102E" style={styles.loadingIndicator} />
          ) : error ? (
            <Text style={styles.emptyText}>{error}</Text>
          ) : movies.length === 0 ? (
            <Text style={styles.emptyText}>No movies currently showing.</Text>
          ) : (
            <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
              {cardWidth > 0 && rows.map((row, rowIdx) => (
                <View key={rowIdx} style={[styles.cardRow, { gap, marginBottom: gap }]}>
                  {row.map((movie) => (
                    <ShowCard
                      key={movie.id}
                      movie={movie}
                      isDesktop={isDesktop || isTablet}
                      cardWidth={cardWidth}
                      onPress={() => onNavigate('showdetails', movie.id)}
                    />
                  ))}
                  {row.length < numCols && Array.from({ length: numCols - row.length }).map((_, i) => (
                    <View key={`ph-${i}`} style={{ width: cardWidth }} />
                  ))}
                </View>
              ))}
            </View>
          )}
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
  viewAll: { color: '#C8102E', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardRow: { flexDirection: 'row' },
  loadingIndicator: { marginVertical: 40 },
  emptyText: { fontSize: 13, color: '#888', textAlign: 'center', marginVertical: 40 },

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