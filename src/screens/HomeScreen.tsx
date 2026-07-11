import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StatusBar,
  ImageBackground,
  SafeAreaView,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabase';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import LoadError from '../components/LoadError';
import { createStyles, typography, layout } from '../theme';
import {
  VENUE_LEGAL_NAME,
  VENUE_CAPACITY,
} from '../config/venue';
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
      <Image
        source={{ uri: movie.poster_url }}
        style={[cardStyles.image, { height: imgHeight }]}
        accessibilityLabel={`${movie.title} poster`}
      />
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

const cardStyles = createStyles({
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
  title: { ...typography.body, fontWeight: '700', color: '#1a1a1a', marginBottom: 7 },
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

  const loadShows = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('productions')
        .select('*')
        .eq('status', 'now_showing');

      if (fetchError) throw fetchError;
      setMovies(data ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shows.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShows();
  }, [loadShows]);

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
        {/* TODO(owner): replace this committed placeholder with real Mamiya
            Theatre photography. Drop a photo into src/assets/ and require() it
            here (like the logo), or upload one to our own Supabase Storage
            image bucket and reference that public URL. Do NOT hotlink an
            external domain. The hero container has a brand-dark backgroundColor
            (styles.hero) so the overlay text stays readable if the image is ever
            missing. */}
        <ImageBackground
          source={require('../assets/hero-placeholder.svg')}
          style={[styles.hero, !isDesktop && styles.heroMobile]}
          imageStyle={styles.heroBg}
        >
          <View style={[styles.heroOverlay, !isDesktop && styles.heroOverlayMobile]}>
            <Text style={[styles.heroTitle, !isDesktop && styles.heroTitleMobile]}>
              Welcome to {VENUE_LEGAL_NAME}
            </Text>
            <Text style={[styles.heroDesc, !isDesktop && styles.heroDescMobile]}>
              Reserve our premier {VENUE_CAPACITY}-seat facility for your next theatrical production, concert,
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
            <LoadError message={error} onRetry={loadShows} />
          ) : movies.length === 0 ? (
            <Text style={styles.emptyText}>No shows currently scheduled.</Text>
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
        <Footer onNavigate={onNavigate} />

      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = createStyles({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#f4f4f6' },

  // ── HERO ──
  // Brand-dark fallback behind the hero image: if the asset ever fails to load,
  // the overlay + headline still sit on a solid brand color, never a broken box.
  hero: { height: 520, backgroundColor: '#12122a' },
  heroMobile: { height: 560 },
  heroBg: { resizeMode: 'cover' },
  heroOverlay: {
    flex: 1, backgroundColor: 'rgba(10,5,25,0.65)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 60, paddingVertical: 40,
  },
  heroOverlayMobile: { paddingHorizontal: 24 },
  heroTitle: {
    ...typography.heading1, color: '#fff', fontSize: 44, fontWeight: '900', lineHeight: 52,
    marginBottom: 16, textAlign: 'center', maxWidth: 700,
  },
  heroTitleMobile: { fontSize: 30, lineHeight: 38, marginBottom: 12 },
  heroDesc: {
    ...typography.body, color: '#ddd', lineHeight: 22,
    textAlign: 'center', maxWidth: 560,
  },
  heroDescMobile: { fontSize: 13, lineHeight: 20 },

  // ── SECTION ──
  section: { ...layout.page, paddingHorizontal: 60, paddingTop: 48, paddingBottom: 32 },
  sectionMobile: { paddingHorizontal: 16, paddingTop: 36, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  sectionTitle: { ...typography.heading2, fontSize: 24, lineHeight: 32, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  sectionTitleMobile: { fontSize: 20 },
  sectionUnderline: { width: 36, height: 3, backgroundColor: '#C8102E', borderRadius: 2, marginBottom: 8 },
  sectionSub: { ...typography.caption, color: '#888', maxWidth: 360 },
  viewAll: { color: '#C8102E', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardRow: { flexDirection: 'row' },
  loadingIndicator: { marginVertical: 40 },
  emptyText: { fontSize: 13, color: '#888', textAlign: 'center', marginVertical: 40 },

});

export default HomeScreen;