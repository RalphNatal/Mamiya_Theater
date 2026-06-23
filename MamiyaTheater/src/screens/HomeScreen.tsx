import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ImageBackground,
  SafeAreaView,
  FlatList,
  TextInput,
  Image,
  useWindowDimensions,
} from 'react-native';
import { featuredShow, nowShowing } from '../data/shows';

type Show = {
  id: string;
  title: string;
  price: number;
  ticketStatus: string;
  admission: string;
  image: string;
};

type HomeProps = {
  onNavigate: (screen: 'home' | 'login' | 'signup') => void;
};

// ── SHOW CARD ──────────────────────────────────────────
const ShowCard = ({ show, isDesktop }: { show: Show; isDesktop: boolean }) => (
  <View style={[cardStyles.card, !isDesktop && cardStyles.cardMobile]}>
    <View style={cardStyles.imageWrapper}>
      <Image source={{ uri: show.image }} style={[cardStyles.image, !isDesktop && cardStyles.imageMobile]} />
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

// ── SEARCH BAR ─────────────────────────────────────────
const SearchBar = ({ isDesktop }: { isDesktop: boolean }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');

  if (isDesktop) {
    return (
      <View style={searchStyles.container}>
        <View style={searchStyles.fieldsRow}>
          <View style={searchStyles.field}>
            <Text style={searchStyles.label}>SEARCH BY TITLE</Text>
            <View style={searchStyles.inputRow}>
              <Text style={searchStyles.icon}>🔍</Text>
              <TextInput style={searchStyles.input} placeholder="E.g. The Lion King..." placeholderTextColor="#bbb" value={title} onChangeText={setTitle} />
            </View>
          </View>
          <View style={searchStyles.divider} />
          <View style={searchStyles.field}>
            <Text style={searchStyles.label}>DATE</Text>
            <View style={searchStyles.inputRow}>
              <Text style={searchStyles.icon}>📅</Text>
              <TextInput style={searchStyles.input} placeholder="Select date" placeholderTextColor="#bbb" value={date} onChangeText={setDate} />
            </View>
          </View>
          <View style={searchStyles.divider} />
          <View style={searchStyles.field}>
            <Text style={searchStyles.label}>VENUE</Text>
            <View style={searchStyles.inputRow}>
              <Text style={searchStyles.icon}>📍</Text>
              <TextInput style={searchStyles.input} placeholder="Select venue" placeholderTextColor="#bbb" value={venue} onChangeText={setVenue} />
            </View>
          </View>
          <TouchableOpacity style={searchStyles.btn} activeOpacity={0.8}>
            <Text style={searchStyles.btnText}>Find Tickets</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Mobile search — stacked layout
  return (
    <View style={searchStyles.mobileContainer}>
      <Text style={searchStyles.mobileTitle}>Find your next show</Text>
      <View style={searchStyles.mobileField}>
        <Text style={searchStyles.label}>SEARCH BY TITLE</Text>
        <View style={searchStyles.mobileInputRow}>
          <Text style={searchStyles.icon}>🔍</Text>
          <TextInput style={searchStyles.mobileInput} placeholder="E.g. The Lion King..." placeholderTextColor="#bbb" value={title} onChangeText={setTitle} />
        </View>
      </View>
      <View style={searchStyles.mobileRow}>
        <View style={[searchStyles.mobileField, { flex: 1 }]}>
          <Text style={searchStyles.label}>DATE</Text>
          <View style={searchStyles.mobileInputRow}>
            <Text style={searchStyles.icon}>📅</Text>
            <TextInput style={searchStyles.mobileInput} placeholder="Select" placeholderTextColor="#bbb" value={date} onChangeText={setDate} />
          </View>
        </View>
        <View style={[searchStyles.mobileField, { flex: 1 }]}>
          <Text style={searchStyles.label}>VENUE</Text>
          <View style={searchStyles.mobileInputRow}>
            <Text style={searchStyles.icon}>📍</Text>
            <TextInput style={searchStyles.mobileInput} placeholder="Select" placeholderTextColor="#bbb" value={venue} onChangeText={setVenue} />
          </View>
        </View>
      </View>
      <TouchableOpacity style={searchStyles.mobileBtn} activeOpacity={0.8}>
        <Text style={searchStyles.btnText}>Find Tickets</Text>
      </TouchableOpacity>
    </View>
  );
};

const searchStyles = StyleSheet.create({
  // Desktop
  container: {
    backgroundColor: '#fff', marginHorizontal: 60, marginTop: -28,
    borderRadius: 12, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1, shadowRadius: 16, elevation: 8, zIndex: 10,
  },
  fieldsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  field: { flex: 1 },
  label: { fontSize: 8, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { fontSize: 12, marginRight: 5 },
  input: { flex: 1, fontSize: 12, color: '#333', paddingVertical: 2 },
  divider: { width: 1, height: 36, backgroundColor: '#eee', marginHorizontal: 6 },
  btn: { backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Mobile
  mobileContainer: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: -20,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8, zIndex: 10,
  },
  mobileTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 14 },
  mobileField: { marginBottom: 12 },
  mobileRow: { flexDirection: 'row', gap: 12 },
  mobileInputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#eee', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fafafa',
  },
  mobileInput: { flex: 1, fontSize: 13, color: '#333' },
  mobileBtn: {
    backgroundColor: '#C8102E', borderRadius: 8,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
});

// ── HOME SCREEN ────────────────────────────────────────
const HomeScreen = ({ onNavigate }: HomeProps) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const isTablet = width >= 600 && width < 768;

  const numCols = isDesktop ? 3 : isTablet ? 2 : 1;

  const renderCard = ({ item }: { item: Show }) => (
    <ShowCard show={item} isDesktop={isDesktop || isTablet} />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── NAVBAR ── */}
        {isDesktop ? (
          <View style={styles.navbar}>
            <View style={styles.navLeft}>
              <View style={styles.navLogoBox} />
              <Text style={styles.navLogoText}>Mamiya Theater</Text>
            </View>
            <View style={styles.navCenter}>
              {['Home', 'Shows', 'Venues', 'Support'].map(link => (
                <TouchableOpacity key={link}>
                  <Text style={styles.navLink}>{link}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.navRight}>
              <TouchableOpacity onPress={() => onNavigate('login')}>
                <Text style={styles.navLogin}>Log In</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navSignupBtn} onPress={() => onNavigate('signup')}>
                <Text style={styles.navSignupText}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.mobileNav}>
            <View style={styles.navLeft}>
              <View style={styles.navLogoBox} />
              <Text style={styles.navLogoText}>Mamiya Theater</Text>
            </View>
            <View style={styles.mobileNavRight}>
              <TouchableOpacity onPress={() => onNavigate('login')}>
                <Text style={styles.navLogin}>Log In</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navSignupBtn} onPress={() => onNavigate('signup')}>
                <Text style={styles.navSignupText}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── HERO ── */}
        <ImageBackground
          source={{ uri: 'https://www.uri.edu/programs/wp-content/uploads/programs/sites/3/2013/08/Theatre.jpg' }}
          style={[styles.hero, !isDesktop && styles.heroMobile]}
          imageStyle={styles.heroBg}
        >
          <View style={[styles.heroOverlay, !isDesktop && styles.heroOverlayMobile]}>
            <View style={[styles.heroContent, !isDesktop && styles.heroContentMobile]}>
              <Text style={[styles.heroLabel, !isDesktop && styles.heroLabelMobile]}>
                {featuredShow.label}
              </Text>
              <Text style={[styles.heroTitle, !isDesktop && styles.heroTitleMobile]}>
                {featuredShow.title}
              </Text>
              <Text style={[styles.heroDesc, !isDesktop && styles.heroDescMobile]}>
                {featuredShow.description}
              </Text>
              <View style={styles.heroButtons}>
                <TouchableOpacity style={styles.heroBookBtn} activeOpacity={0.8}>
                  <Text style={styles.heroBookText}>Book Now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.heroDetailsBtn} activeOpacity={0.8}>
                  <Text style={styles.heroDetailsText}>View Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ImageBackground>

        {/* ── SEARCH ── */}
        <SearchBar isDesktop={isDesktop} />

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

          <FlatList
            data={nowShowing}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            numColumns={numCols}
            key={numCols} // force re-render on col change
            columnWrapperStyle={numCols > 1 ? styles.cardRow : undefined}
            scrollEnabled={false}
          />
        </View>

        {/* ── FOOTER ── */}
        {isDesktop ? (
          <View style={styles.footer}>
            <View style={styles.footerTop}>
              <View style={styles.footerBrand}>
                <View style={styles.footerLogoRow}>
                  <View style={styles.footerLogoBox} />
                  <Text style={styles.footerLogoText}>StageTix</Text>
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
              <Text style={styles.footerCopy}>© 2026 StageTix. All rights reserved.</Text>
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
              <View style={styles.footerLogoBox} />
              <Text style={styles.footerLogoText}>StageTix</Text>
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
              <Text style={styles.footerCopy}>© 2026 StageTix. All rights reserved.</Text>
              <View style={styles.footerLinks}>
                <TouchableOpacity><Text style={styles.footerBottomLink}>Privacy</Text></TouchableOpacity>
                <Text style={styles.footerDot}> · </Text>
                <TouchableOpacity><Text style={styles.footerBottomLink}>Terms</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#f4f4f6' },

  // ── NAVBAR ──
  navbar: {
    backgroundColor: '#12122a', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 60, paddingVertical: 14,
  },
  mobileNav: {
    backgroundColor: '#12122a', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14,
  },
  navLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLogoBox: { width: 22, height: 22, backgroundColor: '#C8102E', borderRadius: 3 },
  navLogoText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  navCenter: { flexDirection: 'row', gap: 28 },
  navLink: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mobileNavRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogin: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navSignupBtn: { backgroundColor: '#C8102E', borderRadius: 5, paddingHorizontal: 14, paddingVertical: 7 },
  navSignupText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  // ── HERO ──
  hero: { height: 460 },
  heroMobile: { height: 520 },
  heroBg: { resizeMode: 'cover' },
  heroOverlay: {
    flex: 1, backgroundColor: 'rgba(10,5,25,0.62)',
    justifyContent: 'center', paddingHorizontal: 60, paddingVertical: 40,
  },
  heroOverlayMobile: { paddingHorizontal: 24, paddingVertical: 40, justifyContent: 'flex-end' },
  heroContent: { maxWidth: 520 },
  heroContentMobile: { maxWidth: '100%' },
  heroLabel: { color: '#C8102E', fontSize: 10, fontWeight: '700', letterSpacing: 2.5, marginBottom: 12, textTransform: 'uppercase' },
  heroLabelMobile: { fontSize: 9, letterSpacing: 2 },
  heroTitle: { color: '#fff', fontSize: 42, fontWeight: '900', lineHeight: 50, marginBottom: 14, letterSpacing: -0.5 },
  heroTitleMobile: { fontSize: 28, lineHeight: 36, marginBottom: 10 },
  heroDesc: { color: '#ccc', fontSize: 13, lineHeight: 21, marginBottom: 28 },
  heroDescMobile: { fontSize: 12, lineHeight: 19, marginBottom: 22 },
  heroButtons: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  heroBookBtn: { backgroundColor: '#C8102E', borderRadius: 6, paddingHorizontal: 22, paddingVertical: 12 },
  heroBookText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  heroDetailsBtn: { borderWidth: 1.5, borderColor: '#fff', borderRadius: 6, paddingHorizontal: 22, paddingVertical: 12 },
  heroDetailsText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // ── SECTION ──
  section: { paddingHorizontal: 60, paddingTop: 48, paddingBottom: 32 },
  sectionMobile: { paddingHorizontal: 16, paddingTop: 36, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  sectionTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  sectionTitleMobile: { fontSize: 20 },
  sectionUnderline: { width: 36, height: 3, backgroundColor: '#C8102E', borderRadius: 2, marginBottom: 8 },
  sectionSub: { fontSize: 12, color: '#888', maxWidth: 360 },
  viewAll: { color: '#2929ff', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardRow: { justifyContent: 'space-between', gap: 16, marginBottom: 0 },

  // ── FOOTER DESKTOP ──
  footer: { backgroundColor: '#12122a', paddingHorizontal: 60, paddingTop: 40, paddingBottom: 20 },
  footerTop: { flexDirection: 'row', gap: 32, marginBottom: 32 },
  footerBrand: { flex: 1.6 },
  footerLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  footerLogoBox: { width: 18, height: 18, backgroundColor: '#C8102E', borderRadius: 2 },
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