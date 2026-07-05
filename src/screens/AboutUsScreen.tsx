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
  TextInput,
  useWindowDimensions,
} from 'react-native';
import NavBar from '../components/NavBar';
import { createStyles, typography, layout, colors } from '../theme';
import {
  VENUE_LEGAL_NAME,
  VENUE_SHORT_NAME,
  VENUE_CAPACITY,
  VENUE_TAGLINE,
  VENUE_TAGLINE_SHORT,
  GENERAL_PHONE,
  formatVenueAddress,
  copyrightLine,
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
                  <Text style={styles.footerLogoText}>{VENUE_SHORT_NAME}</Text>
                </View>
                <Text style={styles.footerTagline}>{VENUE_TAGLINE}</Text>
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
              <Text style={styles.footerCopy}>{copyrightLine()}</Text>
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
              <Text style={styles.footerLogoText}>{VENUE_SHORT_NAME}</Text>
            </View>
            <Text style={styles.mobileFooterTagline}>{VENUE_TAGLINE_SHORT}</Text>

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
              <Text style={styles.footerCopy}>{copyrightLine()}</Text>
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

  // ── FOOTER DESKTOP ──
  footer: { backgroundColor: '#12122a', paddingHorizontal: 60, paddingTop: 40, paddingBottom: 20 },
  footerTop: { ...layout.page, flexDirection: 'row', gap: 32, marginBottom: 32 },
  footerBrand: { flex: 1.6 },
  footerLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  footerLogoImage: { width: 22, height: 22 },
  footerLogoText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  footerTagline: { color: colors.textMutedOnDark, fontSize: 11, lineHeight: 18 },
  footerCol: { flex: 1 },
  footerColTitle: { color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 12, letterSpacing: 0.5 },
  footerLink: { color: colors.textMutedOnDark, fontSize: 11, marginBottom: 8 },
  newsletterDesc: { color: colors.textMutedOnDark, fontSize: 11, lineHeight: 17, marginBottom: 12 },
  newsletterRow: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 6, overflow: 'hidden' },
  newsletterInput: { flex: 1, fontSize: 12, color: '#333', paddingHorizontal: 12, paddingVertical: 10 },
  joinBtn: { backgroundColor: '#C8102E', paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  footerBottom: {
    ...layout.page,
    borderTopWidth: 1, borderTopColor: '#22224a', paddingTop: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
  },
  footerCopy: { color: colors.textMutedOnDark, fontSize: 11 },
  footerLinks: { flexDirection: 'row', alignItems: 'center' },
  footerBottomLink: { color: colors.textMutedOnDark, fontSize: 11 },
  footerDot: { color: colors.textMutedOnDark, fontSize: 11 },

  // ── FOOTER MOBILE ──
  mobileFooter: { backgroundColor: '#12122a', paddingHorizontal: 20, paddingTop: 32, paddingBottom: 20 },
  mobileFooterLogo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  mobileFooterTagline: { color: colors.textMutedOnDark, fontSize: 12, lineHeight: 18, marginBottom: 24 },
  mobileFooterGrid: { flexDirection: 'row', gap: 20, marginTop: 24, marginBottom: 24 },
  mobileFooterCol: { flex: 1 },
});

export default AboutUsScreen;