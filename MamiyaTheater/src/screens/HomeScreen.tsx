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

const ShowCard = ({ show }: { show: Show }) => (
  <View style={cardStyles.card}>
    <View style={cardStyles.imageWrapper}>
      <Image source={{ uri: show.image }} style={cardStyles.image} />
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
  card: { backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', marginBottom: 20, flex: 1, elevation: 3 },
  imageWrapper: { position: 'relative' },
  image: { width: '100%', height: 150, resizeMode: 'cover' },
  priceBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#fff', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, alignItems: 'center', elevation: 2 },
  priceFrom: { fontSize: 8, color: '#888', textTransform: 'uppercase' },
  priceAmount: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  body: { padding: 10 },
  title: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  infoIcon: { fontSize: 8, color: '#C8102E', marginRight: 5 },
  infoText: { fontSize: 10, color: '#666' },
  btn: { backgroundColor: '#C8102E', borderRadius: 5, paddingVertical: 9, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});

const SearchBar = () => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
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
};

const searchStyles = StyleSheet.create({
  container: { backgroundColor: '#fff', marginHorizontal: 60, marginTop: -28, borderRadius: 10, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8, zIndex: 10 },
  fieldsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  field: { flex: 1 },
  label: { fontSize: 8, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 5 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { fontSize: 12, marginRight: 5 },
  input: { flex: 1, fontSize: 12, color: '#333', paddingVertical: 2 },
  divider: { width: 1, height: 36, backgroundColor: '#eee', marginHorizontal: 6 },
  btn: { backgroundColor: '#C8102E', borderRadius: 6, paddingHorizontal: 20, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

type HomeProps = {
  onNavigate: (screen: "home" | "login" | "signup") => void;
};

const HomeScreen = ({ onNavigate }: HomeProps) => {
  const renderCard = ({ item }: { item: Show }) => <ShowCard show={item} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* NAVBAR */}
        <View style={styles.navbar}>
          <View style={styles.navLeft}>
            <View style={styles.navLogoBox} />
            <Text style={styles.navLogoText}>Mamiya Theater</Text>
          </View>
          <View style={styles.navCenter}>
            {['Home', 'Shows', 'Venues', 'Support'].map(link => (
              <TouchableOpacity key={link}><Text style={styles.navLink}>{link}</Text></TouchableOpacity>
            ))}
          </View>
          <View style={styles.navRight}>
            <TouchableOpacity onPress={() => onNavigate('login')}><Text style={styles.navLogin}>Log In</Text></TouchableOpacity>
            <TouchableOpacity style={styles.navSignupBtn} onPress={() => onNavigate('signup')}>
              <Text style={styles.navSignupText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* HERO */}
        <ImageBackground
          source={{ uri: 'https://www.uri.edu/programs/wp-content/uploads/programs/sites/3/2013/08/Theatre.jpg' }}
          style={styles.hero}
          imageStyle={styles.heroBg}
        >
          <View style={styles.heroOverlay}>
            <View style={styles.heroContent}>
              <Text style={styles.heroLabel}>{featuredShow.label}</Text>
              <Text style={styles.heroTitle}>{featuredShow.title}</Text>
              <Text style={styles.heroDesc}>{featuredShow.description}</Text>
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

        {/* SEARCH */}
        <SearchBar />

        {/* NOW SHOWING */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Now Showing</Text>
              <View style={styles.sectionUnderline} />
              <Text style={styles.sectionSub}>Discover the most spectacular performances in town this season.</Text>
            </View>
            <TouchableOpacity>
              <Text style={styles.viewAll}>View All Shows →</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={nowShowing}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            numColumns={3}
            columnWrapperStyle={styles.cardRow}
            scrollEnabled={false}
          />
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <View style={styles.footerTop}>
            <View style={styles.footerBrand}>
              <View style={styles.footerLogoRow}>
                <View style={styles.footerLogoBox} />
                <Text style={styles.footerLogoText}>StageTix</Text>
              </View>
              <Text style={styles.footerTagline}>Your premier destination for professional theater tickets. Experience the magic of live performance.</Text>
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

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#f4f4f6' },

  // NAVBAR
  navbar: { backgroundColor: '#12122a', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 60, paddingVertical: 14 },
  navLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLogoBox: { width: 22, height: 22, backgroundColor: '#C8102E', borderRadius: 3 },
  navLogoText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  navCenter: { flexDirection: 'row', gap: 28 },
  navLink: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  navLogin: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navSignupBtn: { backgroundColor: '#C8102E', borderRadius: 5, paddingHorizontal: 16, paddingVertical: 7 },
  navSignupText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // HERO
  hero: { height: 460 },
  heroBg: { resizeMode: 'cover' },
  heroOverlay: { flex: 1, backgroundColor: 'rgba(10, 5, 25, 0.60)', justifyContent: 'center', paddingHorizontal: 60, paddingVertical: 40 },
  heroContent: { maxWidth: 520 },
  heroLabel: { color: '#C8102E', fontSize: 10, fontWeight: '700', letterSpacing: 2.5, marginBottom: 12, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 42, fontWeight: '900', lineHeight: 50, marginBottom: 14, letterSpacing: -0.5 },
  heroDesc: { color: '#ccc', fontSize: 13, lineHeight: 21, marginBottom: 28 },
  heroButtons: { flexDirection: 'row', gap: 12 },
  heroBookBtn: { backgroundColor: '#C8102E', borderRadius: 6, paddingHorizontal: 24, paddingVertical: 12 },
  heroBookText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  heroDetailsBtn: { borderWidth: 1.5, borderColor: '#fff', borderRadius: 6, paddingHorizontal: 24, paddingVertical: 12 },
  heroDetailsText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // SECTION
  section: { paddingHorizontal: 60, paddingTop: 48, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  sectionTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  sectionUnderline: { width: 36, height: 3, backgroundColor: '#C8102E', borderRadius: 2, marginBottom: 8 },
  sectionSub: { fontSize: 12, color: '#888', maxWidth: 360 },
  viewAll: { color: '#2929ff', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardRow: { justifyContent: 'space-between', gap: 20 },

  // FOOTER
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
  newsletterRow: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 5, overflow: 'hidden' },
  newsletterInput: { flex: 1, fontSize: 11, color: '#333', paddingHorizontal: 10, paddingVertical: 9 },
  joinBtn: { backgroundColor: '#C8102E', paddingHorizontal: 16, paddingVertical: 9, justifyContent: 'center' },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  footerBottom: { borderTopWidth: 1, borderTopColor: '#22224a', paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerCopy: { color: '#555', fontSize: 11 },
  footerLinks: { flexDirection: 'row', alignItems: 'center' },
  footerBottomLink: { color: '#777', fontSize: 11 },
  footerDot: { color: '#555', fontSize: 11 },
});

export default HomeScreen;