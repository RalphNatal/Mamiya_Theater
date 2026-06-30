import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  TextInput,
  Image,
  FlatList,
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
        setError(err instanceof Error ? err.message : 'Failed to load movies.');
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
            <Text style={styles.emptyText}>No movies available.</Text>
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
                  <Image source={{ uri: item.poster_url }} style={styles.poster} />
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
                  <TouchableOpacity key={link} onPress={() => { if (link === 'All Shows') onNavigate('allshows'); }}>
                    <Text style={styles.footerLink}>{link}</Text>
                  </TouchableOpacity>
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
                  <TouchableOpacity key={link} onPress={() => { if (link === 'All Shows') onNavigate('allshows'); }}>
                    <Text style={styles.footerLink}>{link}</Text>
                  </TouchableOpacity>
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

  // ── SECTION ──
  section: { paddingHorizontal: 60, paddingTop: 32, paddingBottom: 32 },
  sectionMobile: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24 },
  sectionTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  sectionTitleMobile: { fontSize: 20 },
  sectionUnderline: { width: 36, height: 3, backgroundColor: '#C8102E', borderRadius: 2, marginBottom: 8 },
  sectionSub: { fontSize: 12, color: '#888', maxWidth: 360, marginBottom: 8 },
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
  title: { fontSize: 13, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  genre: { fontSize: 11, color: '#C8102E', fontWeight: '600' },

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

export default AllShowsScreen;
