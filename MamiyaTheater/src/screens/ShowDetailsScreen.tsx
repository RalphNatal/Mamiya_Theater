import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  ScrollView,
  TextInput,
  Image,
  ImageBackground,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import NavBar from '../components/NavBar';
import type { OnNavigate } from '../types/navigation';

type Movie = {
  id: string;
  title: string;
  description: string;
  poster_url: string;
  banner_url: string;
  duration_minutes: number;
  genre: string;
  status: string;
  release_date: string | null;
  rating: string | null;
  cast: string | null;
};

type Showtime = {
  id: string;
  movie_id: string;
  start_time: string;
  price: number;
  available_seats: number;
};

type ShowDetailsProps = {
  movieId: string | null;
  onNavigate: OnNavigate;
};

const formatDate = (iso: string | null) => {
  if (!iso) return 'TBA';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatRuntime = (minutes: number | null) => {
  if (!minutes) return 'N/A';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Local Y-M-D key (not the ISO instant) so showtimes are grouped by the
// theater's wall-clock date rather than shifting to a UTC day boundary.
const dateKeyOf = (iso: string) => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const ShowDetailsScreen = ({ movieId, onNavigate }: ShowDetailsProps) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [navbarHeight, setNavbarHeight] = useState(60);

  const [movie, setMovie] = useState<Movie | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showtimes, setShowtimes] = useState<Showtime[]>([]);
  const [showtimesLoading, setShowtimesLoading] = useState(true);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedShowtimeId, setSelectedShowtimeId] = useState<string | null>(null);

  const scrollRef = useRef<any>(null);
  const showtimesYRef = useRef(0);

  useEffect(() => {
    if (!movieId) {
      setError('No movie selected.');
      setIsLoading(false);
      return;
    }

    const fetchMovie = async () => {
      try {
        setIsLoading(true);
        const { data, error: fetchError } = await supabase
          .from('movies')
          .select('*')
          .eq('id', movieId)
          .single();

        if (fetchError) throw fetchError;
        setMovie(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load movie details.');
      } finally {
        setIsLoading(false);
      }
    };

    const fetchShowtimes = async () => {
      try {
        setShowtimesLoading(true);
        const { data, error: fetchError } = await supabase
          .from('showtimes')
          .select('*')
          .eq('movie_id', movieId)
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true });

        if (fetchError) throw fetchError;
        setShowtimes(data ?? []);
      } catch {
        setShowtimes([]);
      } finally {
        setShowtimesLoading(false);
      }
    };

    fetchMovie();
    fetchShowtimes();
  }, [movieId]);

  const groupedShowtimes = showtimes.reduce<Record<string, Showtime[]>>((groups, st) => {
    const dateKey = dateKeyOf(st.start_time);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(st);
    return groups;
  }, {});
  const sortedDateKeys = Object.keys(groupedShowtimes).sort();

  // Default to the earliest upcoming date once showtimes load, and fall
  // back to it if the previously-selected date no longer has any slots.
  useEffect(() => {
    if (sortedDateKeys.length === 0) {
      setSelectedDateKey(null);
      return;
    }
    if (!selectedDateKey || !groupedShowtimes[selectedDateKey]) {
      setSelectedDateKey(sortedDateKeys[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showtimes]);

  // Switching dates clears any slot selected on the previous day.
  useEffect(() => {
    setSelectedShowtimeId(null);
  }, [selectedDateKey]);

  // Booking requires a session — route to login first if there isn't one,
  // rather than letting the seat selection screen bounce them right back.
  const handleProceedToBooking = async () => {
    if (!selectedShowtimeId || !movieId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      onNavigate('login');
      return;
    }
    onNavigate('seatselection', movieId, selectedShowtimeId);
  };

  const selectedDayShowtimes = selectedDateKey ? groupedShowtimes[selectedDateKey] ?? [] : [];
  const todayKey = dateKeyOf(new Date().toISOString());

  const scrollY = useRef(new Animated.Value(0)).current;

  const Navbar = <NavBar onNavigate={onNavigate} scrollY={scrollY} onHeightChange={setNavbarHeight} showBackButton />;

  // ── FOOTER (shared across screens) ──
  const Footer = isDesktop ? (
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

      <Text style={styles.footerColTitle}>Newsletter</Text>
      <View style={styles.newsletterRow}>
        <TextInput style={styles.newsletterInput} placeholder="Email address" placeholderTextColor="#666" />
        <TouchableOpacity style={styles.joinBtn}><Text style={styles.joinBtnText}>Join</Text></TouchableOpacity>
      </View>

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
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#12122a" />
        {Navbar}
        <ActivityIndicator size="large" color="#C8102E" style={[styles.loadingIndicator, { marginTop: navbarHeight + 60 }]} />
      </SafeAreaView>
    );
  }

  if (error || !movie) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#12122a" />
        {Navbar}
        <Text style={[styles.emptyText, { marginTop: navbarHeight + 40 }]}>{error ?? 'Movie not found.'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />
      {Navbar}

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: navbarHeight }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >
        {/* ── BANNER ── */}
        <ImageBackground
          source={{ uri: movie.banner_url || movie.poster_url }}
          style={[styles.banner, !isDesktop && styles.bannerMobile]}
          imageStyle={styles.bannerImage}
        >
          <View style={styles.bannerOverlay}>
            <View style={styles.playWrapper}>
              <TouchableOpacity style={styles.playCircle} activeOpacity={0.85}>
                <Icon name="play" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.bannerTextWrap}>
              <Text style={styles.nowShowingLabel}>NOW SHOWING</Text>
              <Text style={[styles.bannerTitle, !isDesktop && styles.bannerTitleMobile]} numberOfLines={2}>
                {movie.title}
              </Text>
              {!!movie.rating && (
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingBadgeText}>{movie.rating}</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.viewShowtimesBtn}
                activeOpacity={0.85}
                onPress={() => scrollRef.current?.scrollTo({ y: showtimesYRef.current, animated: true })}
              >
                <Text style={styles.viewShowtimesText}>View showtimes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>

        {/* ── DETAILS ── */}
        <View style={[styles.detailsSection, !isDesktop && styles.detailsSectionMobile]}>
          <View style={[styles.detailsRow, !isDesktop && styles.detailsRowMobile]}>
            <View style={styles.posterCol}>
              <Image source={{ uri: movie.poster_url }} style={styles.posterImage} />
              <TouchableOpacity style={styles.watchlistBtn} activeOpacity={0.7}>
                <Icon name="bookmark-outline" size={16} color="#C8102E" />
                <Text style={styles.watchlistText}>Add to watchlist</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoCol}>
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>Cast</Text>
                <Text style={styles.infoValue}>{movie.cast || 'Cast information not available yet.'}</Text>
              </View>

              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>Synopsis</Text>
                <Text style={styles.infoValue}>{movie.description || 'No synopsis available.'}</Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBlock}>
                  <Text style={styles.infoLabel}>Runtime</Text>
                  <Text style={styles.infoValue}>{formatRuntime(movie.duration_minutes)}</Text>
                </View>
                <View style={styles.statBlock}>
                  <Text style={styles.infoLabel}>Release Date</Text>
                  <Text style={styles.infoValue}>{formatDate(movie.release_date)}</Text>
                </View>
                <View style={styles.statBlock}>
                  <Text style={styles.infoLabel}>Rating</Text>
                  <Text style={styles.infoValue}>{movie.rating || 'Not rated'}</Text>
                </View>
              </View>

              {!!movie.genre && (
                <View style={styles.genreTag}>
                  <Text style={styles.genreTagText}>{movie.genre}</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── SHOWTIMES ── */}
          <View
            style={styles.showtimesSection}
            onLayout={(e) => { showtimesYRef.current = e.nativeEvent.layout.y + (isDesktop ? styles.banner.height : styles.bannerMobile.height); }}
          >
            <Text style={styles.showtimesHeading}>Showtimes</Text>
            <View style={styles.venueRow}>
              <Icon name="location-outline" size={13} color="#888" />
              <Text style={styles.venueText}>Mamiya Theater</Text>
            </View>

            {showtimesLoading ? (
              <ActivityIndicator size="small" color="#C8102E" style={styles.loadingIndicator} />
            ) : sortedDateKeys.length === 0 ? (
              <Text style={styles.emptyText}>No showtimes scheduled yet.</Text>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.dateStrip}
                  contentContainerStyle={styles.dateStripContent}
                >
                  {sortedDateKeys.map((key) => {
                    const sample = new Date(groupedShowtimes[key][0].start_time);
                    const isSelected = key === selectedDateKey;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.datePill, isSelected && styles.datePillSelected]}
                        activeOpacity={0.8}
                        onPress={() => setSelectedDateKey(key)}
                      >
                        <Text style={[styles.datePillTop, isSelected && styles.datePillTextSelected]}>
                          {key === todayKey ? 'TODAY' : sample.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                        </Text>
                        <Text style={[styles.datePillBottom, isSelected && styles.datePillTextSelected]}>
                          {sample.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.timeRow}>
                  {selectedDayShowtimes.map((st) => {
                    const soldOut = st.available_seats === 0;
                    const isSelected = selectedShowtimeId === st.id;
                    return (
                      <TouchableOpacity
                        key={st.id}
                        style={[
                          styles.timeChip,
                          isSelected && styles.timeChipSelected,
                          soldOut && styles.timeChipSoldOut,
                        ]}
                        activeOpacity={0.8}
                        disabled={soldOut}
                        onPress={() => setSelectedShowtimeId(st.id)}
                      >
                        <Text style={[
                          styles.timeChipText,
                          isSelected && styles.timeChipTextSelected,
                          soldOut && styles.timeChipTextSoldOut,
                        ]}>
                          {new Date(st.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                        <Text style={[styles.priceText, soldOut && styles.timeChipTextSoldOut]}>
                          ${Number(st.price).toFixed(2)}
                        </Text>
                        <Text style={[styles.seatsText, soldOut && styles.timeChipTextSoldOut]}>
                          {soldOut ? 'Sold out' : `${st.available_seats} seats left`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {!!selectedShowtimeId && (
                  <TouchableOpacity
                    style={styles.proceedBtn}
                    activeOpacity={0.85}
                    onPress={handleProceedToBooking}
                  >
                    <Text style={styles.proceedBtnText}>Proceed to booking</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {Footer}
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#0a0a0a' },
  loadingIndicator: { marginVertical: 40 },
  emptyText: { fontSize: 13, color: '#888', textAlign: 'center', marginVertical: 40 },

  // ── BANNER ──
  banner: { width: '100%', height: 460, backgroundColor: '#111' },
  bannerMobile: { height: 420 },
  bannerImage: { resizeMode: 'cover' },
  bannerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'space-between',
  },
  playWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  bannerTextWrap: { paddingHorizontal: 24, paddingBottom: 28 },
  nowShowingLabel: { color: '#C8102E', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  bannerTitle: { color: '#fff', fontSize: 34, fontWeight: '900', marginBottom: 10 },
  bannerTitleMobile: { fontSize: 26 },
  ratingBadge: {
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#fff',
    borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 16,
  },
  ratingBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  viewShowtimesBtn: {
    backgroundColor: '#C8102E', borderRadius: 6,
    paddingVertical: 12, paddingHorizontal: 24, alignSelf: 'flex-start',
  },
  viewShowtimesText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── DETAILS ──
  detailsSection: { paddingHorizontal: 60, paddingTop: 36, paddingBottom: 48 },
  detailsSectionMobile: { paddingHorizontal: 20, paddingTop: 28 },
  detailsRow: { flexDirection: 'row', gap: 28 },
  detailsRowMobile: { flexDirection: 'column', gap: 20 },
  posterCol: { width: 180 },
  posterImage: { width: 180, height: 260, borderRadius: 10, backgroundColor: '#1a1a1a', resizeMode: 'cover' },
  watchlistBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  watchlistText: { color: '#C8102E', fontSize: 12, fontWeight: '600' },

  infoCol: { flex: 1, minWidth: 0 },
  infoBlock: { marginBottom: 18 },
  infoLabel: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  infoValue: { color: '#e6e6e6', fontSize: 14, lineHeight: 21 },
  statsRow: { flexDirection: 'row', gap: 32, marginBottom: 18, flexWrap: 'wrap' },
  statBlock: { minWidth: 100 },
  genreTag: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(200,16,46,0.16)',
    borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6,
  },
  genreTagText: { color: '#C8102E', fontSize: 12, fontWeight: '700' },

  // ── SHOWTIMES ──
  showtimesSection: { marginTop: 40 },
  showtimesHeading: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 18 },
  venueText: { color: '#888', fontSize: 12, fontWeight: '500' },

  dateStrip: { marginBottom: 18 },
  dateStripContent: { flexDirection: 'row', gap: 10 },
  datePill: {
    borderWidth: 1, borderColor: '#333', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center',
    backgroundColor: '#161616', minWidth: 68,
  },
  datePillSelected: { backgroundColor: '#C8102E', borderColor: '#C8102E' },
  datePillTop: { color: '#888', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 },
  datePillBottom: { color: '#fff', fontSize: 13, fontWeight: '700' },
  datePillTextSelected: { color: '#fff' },

  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  timeChip: {
    borderWidth: 1, borderColor: '#333', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center',
    backgroundColor: '#161616', minWidth: 96,
  },
  timeChipSelected: { borderColor: '#C8102E', backgroundColor: 'rgba(200,16,46,0.16)' },
  timeChipSoldOut: { backgroundColor: '#111', borderColor: '#222', opacity: 0.5 },
  timeChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  timeChipTextSelected: { color: '#fff' },
  timeChipTextSoldOut: { color: '#666' },
  priceText: { color: '#C8102E', fontWeight: '700', fontSize: 11, marginTop: 3 },
  seatsText: { color: '#888', fontSize: 10, marginTop: 3 },
  proceedBtn: {
    backgroundColor: '#C8102E', borderRadius: 6, alignSelf: 'flex-start',
    paddingVertical: 13, paddingHorizontal: 26, marginTop: 20,
  },
  proceedBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

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

export default ShowDetailsScreen;
