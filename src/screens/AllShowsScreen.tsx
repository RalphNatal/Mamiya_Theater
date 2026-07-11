import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Image,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabase';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import { createStyles, typography, layout } from '../theme';
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

type AllShowsProps = {
  onNavigate: OnNavigate;
};

const AllShowsScreen = ({ onNavigate }: AllShowsProps) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [navbarHeight, setNavbarHeight] = useState(60);

  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        setIsLoading(true);
        const { data, error: fetchError } = await supabase
          .from('productions')
          .select('*');

        if (fetchError) throw fetchError;
        setMovies(data ?? []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shows.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMovies();
  }, []);

  const scrollY = useRef(new Animated.Value(0)).current;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />

      <NavBar onNavigate={onNavigate} scrollY={scrollY} onHeightChange={setNavbarHeight} showBackButton />

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
        {/* ── ALL SHOWS ── */}
        <View style={[styles.section, !isDesktop && styles.sectionMobile]}>
          <Text style={[styles.sectionTitle, !isDesktop && styles.sectionTitleMobile]}>
            All Shows
          </Text>
          <View style={styles.sectionUnderline} />
          <Text style={styles.sectionSub}>
            Browse our complete catalog of performances and screenings.
          </Text>

          {isLoading ? (
            <ActivityIndicator size="large" color="#C8102E" style={styles.loadingIndicator} />
          ) : error ? (
            <Text style={styles.emptyText}>{error}</Text>
          ) : movies.length === 0 ? (
            <Text style={styles.emptyText}>No shows available.</Text>
          ) : (
            <FlatList
              data={movies}
              keyExtractor={(item) => item.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.columnWrapper}
              contentContainerStyle={styles.gridContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => onNavigate('showdetails', item.id)}
                >
                  <Image source={{ uri: item.poster_url }} style={styles.poster} accessibilityLabel={`${item.title} poster`} />
                  <View style={styles.cardBody}>
                    <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.genre}>{item.genre}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
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

  // ── SECTION ──
  section: { ...layout.page, paddingHorizontal: 60, paddingTop: 32, paddingBottom: 32 },
  sectionMobile: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24 },
  sectionTitle: { ...typography.heading2, fontSize: 24, lineHeight: 32, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  sectionTitleMobile: { fontSize: 20 },
  sectionUnderline: { width: 36, height: 3, backgroundColor: '#C8102E', borderRadius: 2, marginBottom: 8 },
  sectionSub: { ...typography.caption, color: '#888', maxWidth: 360, marginBottom: 8 },
  loadingIndicator: { marginVertical: 40 },
  emptyText: { fontSize: 13, color: '#888', textAlign: 'center', marginVertical: 40 },

  // ── GRID ──
  gridContent: { paddingTop: 16 },
  columnWrapper: { gap: 14 },
  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  poster: { width: '100%', height: 180, resizeMode: 'cover', backgroundColor: '#e5e5e5' },
  cardBody: { padding: 12 },
  title: { ...typography.body, fontSize: 13, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  genre: { ...typography.caption, fontSize: 11, color: '#C8102E', fontWeight: '600' },
});

export default AllShowsScreen;
