import React from 'react';
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
} from 'react-native';
import ShowCard from '../components/ShowCard';
import SearchBar from '../components/SearchBar';
import { featuredShow, nowShowing } from '../data/shows';

type Show = {
  id: string;
  title: string;
  price: number;
  ticketStatus: string;
  admission: string;
  image: string;
};

const HomeScreen = () => {
  const renderShowCard = ({ item }: { item: Show }) => <ShowCard show={item} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.navbar}>
          <Text style={styles.navLogo}>🎭 Mamiya Theater</Text>
          <View style={styles.navActions}>
            <TouchableOpacity>
              <Text style={styles.navLogin}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navSignupBtn}>
              <Text style={styles.navSignupText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ImageBackground
          source={{ uri: 'https://images.unsplash.com/photo-1507924538820-ede94a04019d?w=800&q=80' }}
          style={styles.hero}
          imageStyle={styles.heroBg}
        >
          <View style={styles.heroOverlay}>
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
        </ImageBackground>

        <SearchBar />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Now Showing</Text>
              <Text style={styles.sectionSub}>
                Discover the most spectacular performances in town this season.
              </Text>
            </View>
            <TouchableOpacity>
              <Text style={styles.viewAll}>View All Shows →</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={nowShowing}
            keyExtractor={(item) => item.id}
            renderItem={renderShowCard}
            numColumns={2}
            columnWrapperStyle={styles.cardRow}
            scrollEnabled={false}
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.footerTop}>
            <View style={styles.footerBrand}>
              <Text style={styles.footerLogo}>🎭 StageTix</Text>
              <Text style={styles.footerTagline}>
                Your premier destination for professional theater tickets.
                Experience the magic of live performance.
              </Text>
            </View>
            <View style={styles.footerCol}>
              <Text style={styles.footerColTitle}>Quick Links</Text>
              {['All Shows', 'Venues', 'Gift Cards', 'Special Offers', 'Jobs & Earnings'].map((link) => (
                <TouchableOpacity key={link}>
                  <Text style={styles.footerLink}>{link}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.footerCol}>
              <Text style={styles.footerColTitle}>Support</Text>
              {['Help Center', 'Our Policy', 'Cancel Policy', 'Accessibility'].map((link) => (
                <TouchableOpacity key={link}>
                  <Text style={styles.footerLink}>{link}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.footerNewsletter}>
            <Text style={styles.newsletterTitle}>Newsletter</Text>
            <Text style={styles.newsletterDesc}>
              Subscribe for live updates on shows, events, and exclusive promotions.
            </Text>
            <View style={styles.newsletterRow}>
              <Text style={styles.newsletterInput}>Email address</Text>
              <TouchableOpacity style={styles.joinBtn}>
                <Text style={styles.joinBtnText}>Join</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footerBottom}>
            <Text style={styles.footerCopy}>© 2026 StageTix. All rights reserved.</Text>
            <View style={styles.footerLinks}>
              <TouchableOpacity>
                <Text style={styles.footerBottomLink}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={styles.footerDot}> · </Text>
              <TouchableOpacity>
                <Text style={styles.footerBottomLink}>Terms of Service</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0d0d0d' },
  scroll: { flex: 1, backgroundColor: '#f5f5f7' },
  navbar: { backgroundColor: '#0d0d0d', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  navLogo: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogin: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navSignupBtn: { backgroundColor: '#C8102E', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 7 },
  navSignupText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  hero: { height: 420, justifyContent: 'flex-end' },
  heroBg: { resizeMode: 'cover' },
  heroOverlay: { backgroundColor: 'rgba(10, 0, 0, 0.65)', padding: 24, paddingBottom: 48 },
  heroLabel: { color: '#C8102E', fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 36, fontWeight: '900', lineHeight: 42, marginBottom: 12, letterSpacing: -0.5 },
  heroDesc: { color: '#ccc', fontSize: 13, lineHeight: 20, marginBottom: 20 },
  heroButtons: { flexDirection: 'row', gap: 12 },
  heroBookBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 22, paddingVertical: 12 },
  heroBookText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  heroDetailsBtn: { borderWidth: 1.5, borderColor: '#fff', borderRadius: 8, paddingHorizontal: 22, paddingVertical: 12 },
  heroDetailsText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  section: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#888', maxWidth: 200 },
  viewAll: { color: '#C8102E', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardRow: { justifyContent: 'space-between', gap: 12 },
  footer: { backgroundColor: '#111', paddingHorizontal: 16, paddingTop: 28, paddingBottom: 20 },
  footerTop: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  footerBrand: { flex: 1.4 },
  footerLogo: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 8 },
  footerTagline: { color: '#888', fontSize: 11, lineHeight: 17 },
  footerCol: { flex: 1 },
  footerColTitle: { color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 },
  footerLink: { color: '#888', fontSize: 11, marginBottom: 7 },
  footerNewsletter: { borderTopWidth: 1, borderTopColor: '#222', paddingTop: 20, marginBottom: 20 },
  newsletterTitle: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  newsletterDesc: { color: '#888', fontSize: 11, marginBottom: 12, lineHeight: 17 },
  newsletterRow: { flexDirection: 'row', backgroundColor: '#1e1e1e', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  newsletterInput: { flex: 1, color: '#555', fontSize: 13, paddingHorizontal: 14, paddingVertical: 11 },
  joinBtn: { backgroundColor: '#C8102E', paddingHorizontal: 18, paddingVertical: 11, justifyContent: 'center' },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  footerBottom: { borderTopWidth: 1, borderTopColor: '#222', paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  footerCopy: { color: '#555', fontSize: 11 },
  footerLinks: { flexDirection: 'row', alignItems: 'center' },
  footerBottomLink: { color: '#777', fontSize: 11 },
  footerDot: { color: '#555', fontSize: 11 },
});

export default HomeScreen;