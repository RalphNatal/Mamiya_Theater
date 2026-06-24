import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Image,
  Linking,
  TextInput,
  Alert,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { Session } from '@supabase/supabase-js';

type Props = {
  onNavigate: (screen: 'home' | 'login' | 'signup' | 'about' | 'profile' | 'contact') => void;
  session?: Session | null;
};

const GENERAL_PHONE = '(808) 739-4886';
const GENERAL_FAX = '(808) 739-4821';
const GENERAL_EMAIL = 'mamiya@saintlouishawaii.org';
const RENTALS_CONTACT_NAME = 'Kainoa Jarrett';
const RENTALS_PHONE = '(808) 330-8039';

const dialNumber = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
const composeEmail = (email: string) => Linking.openURL(`mailto:${email}`);

// ── CONTACT ROW ─────────────────────────────────────────
const ContactRow = ({
  icon,
  children,
  onPress,
}: {
  icon: string;
  children: React.ReactNode;
  onPress?: () => void;
}) => {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.contactRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.contactIconWrap}>
        <Icon name={icon} size={16} color="#C8102E" />
      </View>
      <Text style={[styles.contactRowText, onPress && styles.contactRowTextLink]}>{children}</Text>
    </Wrapper>
  );
};

const ContactScreen = ({ onNavigate, session }: Props) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const isSignedIn = !!session;

  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;
  const navbarShadowOpacity = scrollY.interpolate({
    inputRange: [0, 30],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = () => {
    if (!fullName || !email || !message) return;
    setSending(true);
    setTimeout(() => {
      setSending(false);
      Alert.alert('Message Sent', "Thanks for reaching out — we'll get back to you shortly.");
      setFullName('');
      setEmail('');
      setSubject('');
      setMessage('');
    }, 1200);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12122a" />

      {/* ── NAVBAR (fixed, always on top) ── */}
      <Animated.View
        onLayout={e => setNavbarHeight(e.nativeEvent.layout.height)}
        style={[styles.navbarFixed, { shadowOpacity: navbarShadowOpacity }]}
      >
        {isDesktop ? (
          <View style={styles.navbar}>
            <View style={styles.navLeft}>
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.navLogoImage}
                resizeMode="contain"
              />
              <Text style={styles.navLogoText}>Mamiya Theater</Text>
            </View>
            <View style={styles.navCenter}>
              {['Home', 'About Us', 'Shows', 'Contact'].map(link => (
                <TouchableOpacity
                  key={link}
                  onPress={() => {
                    if (link === 'Home') onNavigate('home');
                    if (link === 'About Us') onNavigate('about');
                    if (link === 'Contact') onNavigate('contact');
                  }}
                >
                  <Text style={styles.navLink}>{link}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.navRight}>
              {isSignedIn ? (
                <TouchableOpacity style={styles.navProfileBtn} onPress={() => onNavigate('profile')}>
                  <Icon name="person-circle-outline" size={26} color="#fff" />
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity onPress={() => onNavigate('login')}>
                    <Text style={styles.navLogin}>Log In</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.navSignupBtn} onPress={() => onNavigate('signup')}>
                    <Text style={styles.navSignupText}>Sign Up</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.mobileNav}>
            <TouchableOpacity style={styles.navLeft} onPress={() => onNavigate('home')}>
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.navLogoImage}
                resizeMode="contain"
              />
              <Text style={styles.navLogoText}>Mamiya Theater</Text>
            </TouchableOpacity>
            <View style={styles.mobileNavRight}>
              {isSignedIn ? (
                <TouchableOpacity style={styles.navProfileBtn} onPress={() => onNavigate('profile')}>
                  <Icon name="person-circle-outline" size={24} color="#fff" />
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity onPress={() => onNavigate('login')}>
                    <Text style={styles.navLogin}>Log In</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.navSignupBtn} onPress={() => onNavigate('signup')}>
                    <Text style={styles.navSignupText}>Sign Up</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
      </Animated.View>

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

        <View style={[styles.splitContainer, isDesktop ? styles.splitContainerDesktop : styles.splitContainerMobile]}>

          {/* ── LEFT COLUMN: CONTACT INFO ── */}
          <View style={[styles.infoColumn, isDesktop && styles.infoColumnDesktop]}>
            <Text style={styles.pageHeadline}>Get in Touch</Text>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Location</Text>
              <ContactRow icon="location-outline">
                Dr. Richard T. Mamiya Theatre{'\n'}
                Saint Louis Center for the Arts{'\n'}
                3142 Waialae Avenue, Honolulu, HI 96816-1579
              </ContactRow>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>General Inquiries</Text>
              <ContactRow icon="call-outline" onPress={() => dialNumber(GENERAL_PHONE)}>
                {GENERAL_PHONE}
              </ContactRow>
              <ContactRow icon="print-outline">{GENERAL_FAX}</ContactRow>
              <ContactRow icon="mail-outline" onPress={() => composeEmail(GENERAL_EMAIL)}>
                {GENERAL_EMAIL}
              </ContactRow>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Technical &amp; Rentals (KaiHonua Entertainment)</Text>
              <ContactRow icon="person-outline">{RENTALS_CONTACT_NAME}</ContactRow>
              <ContactRow icon="call-outline" onPress={() => dialNumber(RENTALS_PHONE)}>
                {RENTALS_PHONE}
              </ContactRow>
            </View>
          </View>

          {/* ── RIGHT COLUMN: CONTACT FORM ── */}
          <View style={[styles.formColumn, isDesktop && styles.formColumnDesktop]}>
            <View style={styles.formCard}>
              <Text style={styles.formHeadline}>Send us a Message</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor="#bbb"
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#bbb"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Subject</Text>
                <TextInput
                  style={styles.input}
                  placeholder="General Question, Rental Inquiry, Box Office..."
                  placeholderTextColor="#bbb"
                  value={subject}
                  onChangeText={setSubject}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Message</Text>
                <TextInput
                  style={[styles.input, styles.messageInput]}
                  placeholder="How can we help?"
                  placeholderTextColor="#bbb"
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, sending && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                onPress={handleSend}
                disabled={sending}
              >
                <Text style={styles.submitBtnText}>{sending ? 'Sending...' : 'Send Message'}</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>

      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#FFFFFF' },

  // ── NAVBAR ──
  navbarFixed: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
    elevation: 8,
  },
  navbar: {
    backgroundColor: '#12122a', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 60, paddingVertical: 14,
  },
  mobileNav: {
    backgroundColor: '#12122a', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14,
  },
  navLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLogoImage: { width: 28, height: 28 },
  navLogoText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  navCenter: { flexDirection: 'row', gap: 28 },
  navLink: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 },
  mobileNavRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogin: { color: '#ccc', fontSize: 13, fontWeight: '500' },
  navSignupBtn: { backgroundColor: '#C8102E', borderRadius: 5, paddingHorizontal: 14, paddingVertical: 7 },
  navSignupText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  navProfileBtn: {},

  // ── SPLIT LAYOUT ──
  splitContainer: { backgroundColor: '#F8F9FA' },
  splitContainerDesktop: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 60, paddingVertical: 56, gap: 56,
  },
  splitContainerMobile: {
    flexDirection: 'column', paddingHorizontal: 20, paddingVertical: 36, gap: 36,
  },

  // ── LEFT COLUMN: CONTACT INFO ──
  infoColumn: {},
  infoColumnDesktop: { flex: 1 },
  pageHeadline: { fontSize: 28, fontWeight: '900', color: '#1a1a1a', marginBottom: 28 },
  infoSection: { marginBottom: 28 },
  infoSectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#C8102E', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 12,
  },
  contactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  contactIconWrap: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  contactRowText: { fontSize: 14, lineHeight: 21, color: '#333', flex: 1 },
  contactRowTextLink: { color: '#C8102E', fontWeight: '600' },

  // ── RIGHT COLUMN: CONTACT FORM ──
  formColumn: { width: '100%' },
  formColumnDesktop: { flex: 1 },
  formCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 6,
  },
  formHeadline: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 22 },
  fieldGroup: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10, backgroundColor: '#fafafa',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1a1a1a',
  },
  messageInput: { height: 110, paddingTop: 12 },
  submitBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 15,
    alignItems: 'center', marginTop: 6,
    shadowColor: '#C8102E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default ContactScreen;
