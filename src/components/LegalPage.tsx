import React, { useRef, useState } from 'react';
import { View, Text, Animated, StatusBar, SafeAreaView } from 'react-native';
import NavBar from './NavBar';
import { createStyles, typography } from '../theme';
import { VENUE_NAME, SUPPORT_EMAIL } from '../config/venue';
import type { OnNavigate } from '../types/navigation';

// ─────────────────────────────────────────────────────────────────────────
// Shared scaffolding for the static legal pages (Terms, Privacy). Each screen
// supplies only its title + content sections; this handles the NavBar, scroll,
// the "last updated" line, and the placeholder disclaimer. See TermsScreen /
// PrivacyScreen for the copy — which is intentionally editable placeholder text.
// ─────────────────────────────────────────────────────────────────────────

export type LegalSection = { heading: string; paragraphs: string[] };

type Props = {
  onNavigate: OnNavigate;
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
};

const LegalPage = ({ onNavigate, title, lastUpdated, intro, sections }: Props) => {
  const [navbarHeight, setNavbarHeight] = useState(60);
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
        <View style={styles.container}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.updated}>Last updated {lastUpdated}</Text>

          {/* Guardrail: this is NOT authoritative legal text — flag it plainly. */}
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              This is placeholder copy provided as a starting point. {VENUE_NAME} should have its
              own legal counsel review and finalize this document before relying on it.
            </Text>
          </View>

          <Text style={styles.intro}>{intro}</Text>

          {sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              {section.paragraphs.map((p, i) => (
                <Text key={i} style={styles.paragraph}>{p}</Text>
              ))}
            </View>
          ))}

          <Text style={styles.contactLine}>
            Questions about this {title.toLowerCase()}? Email us at {SUPPORT_EMAIL}.
          </Text>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = createStyles({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#F8F9FA' },
  container: {
    width: '100%', maxWidth: 820, alignSelf: 'center',
    paddingHorizontal: 24, paddingVertical: 44,
  },
  title: { ...typography.heading1, fontWeight: '900', color: '#1a1a1a', marginBottom: 6 },
  updated: { ...typography.caption, color: '#888', marginBottom: 20 },
  disclaimer: {
    backgroundColor: 'rgba(200,16,46,0.06)', borderLeftWidth: 3, borderLeftColor: '#C8102E',
    borderRadius: 8, padding: 14, marginBottom: 26,
  },
  disclaimerText: { ...typography.caption, color: '#8a1020', lineHeight: 18 },
  intro: { ...typography.body, color: '#333', lineHeight: 23, marginBottom: 26 },
  section: { marginBottom: 24 },
  sectionHeading: { ...typography.heading2, fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 10 },
  paragraph: { ...typography.body, color: '#444', lineHeight: 23, marginBottom: 10 },
  contactLine: { ...typography.body, color: '#333', marginTop: 10, marginBottom: 48 },
});

export default LegalPage;
