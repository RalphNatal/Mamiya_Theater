import React from 'react';
import { View, Text, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import NewsletterSignup from './NewsletterSignup';
import { createStyles, layout, colors } from '../theme';
import {
  VENUE_SHORT_NAME,
  VENUE_TAGLINE,
  VENUE_TAGLINE_SHORT,
  copyrightLine,
  BUILT_BY_LINE,
} from '../config/venue';
import type { OnNavigate, Screen } from '../types/navigation';

// ─────────────────────────────────────────────────────────────────────────
// Shared site footer — the single source of truth for the desktop + mobile
// footer used across Home, About, All Shows, and Show Details. Every link
// navigates to a real screen; links without a dedicated page point at the
// nearest real destination (Contact) rather than doing nothing. The newsletter
// form is the shared <NewsletterSignup/>, so it actually subscribes everywhere.
// ─────────────────────────────────────────────────────────────────────────

type Props = {
  onNavigate: OnNavigate;
};

const QUICK_LINKS: { label: string; screen: Screen }[] = [
  { label: 'All Shows', screen: 'allshows' },
  { label: 'Group Bookings', screen: 'contact' },
];
const SUPPORT_LINKS: { label: string; screen: Screen }[] = [
  { label: 'Find My Booking', screen: 'bookinglookup' },
  { label: 'Help Center', screen: 'contact' },
  { label: 'Contact Us', screen: 'contact' },
  { label: 'Refund Policy', screen: 'terms' },
  { label: 'Accessibility', screen: 'privacy' },
];

const Footer = ({ onNavigate }: Props) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  if (isDesktop) {
    return (
      <View style={styles.footer}>
        <View style={styles.footerTop}>
          <View style={styles.footerBrand}>
            <View style={styles.footerLogoRow}>
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.footerLogoImage}
                resizeMode="contain"
                accessible={false}
              />
              <Text style={styles.footerLogoText}>{VENUE_SHORT_NAME}</Text>
            </View>
            <Text style={styles.footerTagline}>{VENUE_TAGLINE}</Text>
          </View>
          <View style={styles.footerCol}>
            <Text style={styles.footerColTitle}>Quick Links</Text>
            {QUICK_LINKS.map(link => (
              <TouchableOpacity key={link.label} onPress={() => onNavigate(link.screen)}>
                <Text style={styles.footerLink}>{link.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.footerCol}>
            <Text style={styles.footerColTitle}>Support</Text>
            {SUPPORT_LINKS.map(link => (
              <TouchableOpacity key={link.label} onPress={() => onNavigate(link.screen)}>
                <Text style={styles.footerLink}>{link.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.footerCol}>
            <Text style={styles.footerColTitle}>Newsletter</Text>
            <NewsletterSignup showDescription />
          </View>
        </View>
        <View style={styles.footerBottom}>
          <View>
            <Text style={styles.footerCopy}>{copyrightLine()}</Text>
            <Text style={styles.footerBuiltBy}>{BUILT_BY_LINE}</Text>
          </View>
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={() => onNavigate('privacy')}><Text style={styles.footerBottomLink}>Privacy Policy</Text></TouchableOpacity>
            <Text style={styles.footerDot}> · </Text>
            <TouchableOpacity onPress={() => onNavigate('terms')}><Text style={styles.footerBottomLink}>Terms of Service</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // MOBILE FOOTER — stacked
  return (
    <View style={styles.mobileFooter}>
      <View style={styles.mobileFooterLogo}>
        <Image
          source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
          style={styles.footerLogoImage}
          resizeMode="contain"
          accessible={false}
        />
        <Text style={styles.footerLogoText}>{VENUE_SHORT_NAME}</Text>
      </View>
      <Text style={styles.mobileFooterTagline}>{VENUE_TAGLINE_SHORT}</Text>

      {/* Newsletter */}
      <Text style={styles.footerColTitle}>Newsletter</Text>
      <NewsletterSignup />

      {/* Links grid */}
      <View style={styles.mobileFooterGrid}>
        <View style={styles.mobileFooterCol}>
          <Text style={styles.footerColTitle}>Quick Links</Text>
          {QUICK_LINKS.map(link => (
            <TouchableOpacity key={link.label} onPress={() => onNavigate(link.screen)}>
              <Text style={styles.footerLink}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.mobileFooterCol}>
          <Text style={styles.footerColTitle}>Support</Text>
          {SUPPORT_LINKS.map(link => (
            <TouchableOpacity key={link.label} onPress={() => onNavigate(link.screen)}>
              <Text style={styles.footerLink}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.footerBottom}>
        <View>
          <Text style={styles.footerCopy}>{copyrightLine()}</Text>
          <Text style={styles.footerBuiltBy}>{BUILT_BY_LINE}</Text>
        </View>
        <View style={styles.footerLinks}>
          <TouchableOpacity onPress={() => onNavigate('privacy')}><Text style={styles.footerBottomLink}>Privacy</Text></TouchableOpacity>
          <Text style={styles.footerDot}> · </Text>
          <TouchableOpacity onPress={() => onNavigate('terms')}><Text style={styles.footerBottomLink}>Terms</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = createStyles({
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
  footerBottom: {
    ...layout.page,
    borderTopWidth: 1, borderTopColor: '#22224a', paddingTop: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
  },
  footerCopy: { color: colors.textMutedOnDark, fontSize: 11 },
  footerBuiltBy: { color: colors.textMutedOnDark, fontSize: 10, marginTop: 4, letterSpacing: 0.3 },
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

export default Footer;
