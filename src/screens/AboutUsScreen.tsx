import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Image,
  Linking,
  useWindowDimensions,
} from 'react-native';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import { createStyles, typography, layout } from '../theme';
import {
  VENUE_LEGAL_NAME,
  VENUE_CAPACITY,
  GENERAL_PHONE,
  formatVenueAddress,
} from '../config/venue';
import type { OnNavigate } from '../types/navigation';

type Props = {
  onNavigate: OnNavigate;
};

const AboutUsScreen = ({ onNavigate }: Props) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [navbarHeight, setNavbarHeight] = useState(60);
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

        {/* ── TWO-COLUMN SPLIT ── */}
        <View style={[styles.splitContainer, isDesktop ? styles.splitContainerDesktop : styles.splitContainerMobile]}>
          <View style={[styles.splitText, isDesktop && styles.splitTextDesktop]}>
            <Text style={styles.headline}>THE SAINT LOUIS CENTER FOR THE ARTS</Text>
            <Text style={styles.bodyText}>
              The {VENUE_LEGAL_NAME} is a premier performance venue located in
              Kaimuki on the Saint Louis School / Chaminade University campus. Available for
              rent 7 days a week, the facility hosts school functions, ambitious theatrical
              productions, concerts, and community events. Site management and in-house
              technical support are provided by KaiHonua Entertainment.
            </Text>
            <TouchableOpacity
              style={styles.contactBtn}
              activeOpacity={0.85}
              onPress={() => Linking.openURL(`tel:${GENERAL_PHONE.replace(/[^\d+]/g, '')}`)}
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
        <View style={styles.statsBanner}>
          <View style={isDesktop ? styles.statsBannerDesktop : styles.statsBannerMobile}>
            <View style={styles.statColumn}>
              <Text style={styles.statNumber}>{VENUE_CAPACITY}</Text>
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
        </View>

        {/* ── LOCATION & HOURS FOOTER ── */}
        <View style={styles.locationFooter}>
          <Text style={styles.locationText}>{formatVenueAddress()}</Text>
          <Text style={styles.locationText}>Office Hours: Monday – Friday, 9:00 am – 4:00 pm</Text>
        </View>

        {/* ── FOOTER ── */}
        <Footer onNavigate={onNavigate} />

      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = createStyles({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#FFFFFF' },

  // ── TWO-COLUMN SPLIT ──
  splitContainer: { ...layout.page, backgroundColor: '#FFFFFF' },
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
    ...typography.heading1, fontSize: 30, fontWeight: '900', color: '#000', textTransform: 'uppercase',
    letterSpacing: 0.5, lineHeight: 38, marginBottom: 18,
  },
  bodyText: { ...typography.body, fontSize: 15, lineHeight: 24, color: '#444', marginBottom: 26 },
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
    ...layout.page, flexDirection: 'row', paddingHorizontal: 60, paddingVertical: 48,
  },
  statsBannerMobile: {
    flexDirection: 'column', paddingHorizontal: 24, paddingVertical: 36, gap: 28,
  },
  statColumn: { flex: 1, alignItems: 'center' },
  statNumber: { ...typography.heading1, color: '#fff', fontSize: 40, lineHeight: 48, fontWeight: '900', marginBottom: 8 },
  statLabel: {
    ...typography.caption, fontSize: 13, color: '#fff', fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 1, opacity: 0.9,
  },

  // ── LOCATION & HOURS FOOTER ──
  locationFooter: {
    backgroundColor: '#f8f9fa', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 32, gap: 6,
  },
  locationText: { ...typography.body, color: '#444', lineHeight: 22, textAlign: 'center' },
});

export default AboutUsScreen;