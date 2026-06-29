import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Image,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { useAppModal } from '../components/ModalProvider';
import NavAvatar from '../components/NavAvatar';
import { isValidMobileNumber } from '../lib/validation';
import type { OnNavigate } from '../types/navigation';

type Props = {
  onNavigate: OnNavigate;
};

type Profile = {
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  mobile_number: string | null;
  role: string | null;
};

const SIDEBAR_ITEMS = [
  { key: 'overview', label: 'Overview', icon: 'grid-outline' },
  { key: 'details', label: 'Update details', icon: 'person-outline' },
  { key: 'wallet', label: 'Card wallet', icon: 'card-outline' },
  { key: 'bookings', label: 'Bookings and transactions', icon: 'receipt-outline' },
  { key: 'rewards', label: 'Rewards and offers', icon: 'gift-outline' },
  { key: 'watchlist', label: 'Watchlist', icon: 'bookmark-outline' },
] as const;

const validateFullNameField = (value: string): string | null => {
  if (!value.trim()) return 'Full name is required.';
  return null;
};

const validateMobileNumberField = (value: string): string | null => {
  if (!value.trim()) return 'Mobile number is required.';
  if (!isValidMobileNumber(value)) return 'Please enter a valid mobile number.';
  return null;
};

const ProfileScreen = ({ onNavigate }: Props) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [activeSection, setActiveSection] = useState<string>('overview');

  const [navbarHeight, setNavbarHeight] = useState(60);
  const scrollY = useRef(new Animated.Value(0)).current;
  const navbarShadowOpacity = scrollY.interpolate({
    inputRange: [0, 30],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Update details form ──
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [mobileNumberError, setMobileNumberError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [detailsHydrated, setDetailsHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        onNavigate('login');
        return;
      }
      if (!isMounted) return;

      setUserId(user.id);
      setAuthEmail(user.email ?? null);

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, email, mobile_number, role')
        .eq('id', user.id)
        .single();

      if (!isMounted) return;

      if (error) {
        console.error('Failed to load profile:', error);
        setLoadError(error.message);
      } else {
        setProfile(data);
      }
      setLoadingProfile(false);
    };

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [onNavigate]);

  const displayName = profile?.full_name?.trim()
    || (profile?.email ?? authEmail)?.split('@')[0]
    || 'Member';
  const memberId = userId ? userId.slice(0, 8).toUpperCase() : '—';
  const isAdmin = profile?.role === 'admin';

  const activeLabel = SIDEBAR_ITEMS.find(item => item.key === activeSection)?.label ?? 'Overview';
  const avatarDisplayUri = avatarPreviewUri || avatarUrl.trim() || profile?.avatar_url || null;

  useEffect(() => {
    if (activeSection !== 'details' || detailsHydrated || !profile) return;
    setFullName(profile.full_name ?? '');
    setMobileNumber(profile.mobile_number ?? '');
    setAvatarUrl(profile.avatar_url ?? '');
    setDetailsHydrated(true);
  }, [activeSection, detailsHydrated, profile]);

  const handleFullNameChange = (text: string) => {
    setFullName(text);
    if (fullNameError && !validateFullNameField(text)) setFullNameError(null);
  };
  const handleMobileNumberChange = (text: string) => {
    setMobileNumber(text);
    if (mobileNumberError && !validateMobileNumberField(text)) setMobileNumberError(null);
  };

  useEffect(() => {
    return () => {
      if (avatarPreviewUri) (globalThis as any).URL?.revokeObjectURL?.(avatarPreviewUri);
    };
  }, [avatarPreviewUri]);

  const handleAvatarFileSelected = async (file: any) => {
    if (!userId) return;

    if (!file.type || !file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Image must be 5 MB or smaller.');
      return;
    }
    setAvatarError(null);
    setAvatarPreviewUri((globalThis as any).URL.createObjectURL(file));

    setUploadingAvatar(true);
    try {
      const fileExt = (file.name?.split('.').pop() || file.type.split('/').pop() || 'jpg').toLowerCase();
      const path = `${userId}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust so the browser/Image component picks up the new file
      // immediately instead of showing a stale cached copy at the same URL.
      setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`);
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      showModal({ title: 'Upload Failed', message: err.message ?? 'Something went wrong while uploading your photo.', variant: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePickAvatarFile = () => {
    const doc = (globalThis as any).document;
    if (!doc) return;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event: any) => {
      const file = event.target.files && event.target.files[0];
      if (file) handleAvatarFileSelected(file);
    };
    input.click();
  };

  const handleSaveDetails = async () => {
    if (!userId) return;

    const nameErr = validateFullNameField(fullName);
    const mobileErr = validateMobileNumberField(mobileNumber);
    setFullNameError(nameErr);
    setMobileNumberError(mobileErr);
    if (nameErr || mobileErr) return;

    setSavingDetails(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          mobile_number: mobileNumber.trim(),
          avatar_url: avatarUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      setProfile(prev => prev ? {
        ...prev,
        full_name: fullName.trim(),
        mobile_number: mobileNumber.trim(),
        avatar_url: avatarUrl.trim() || null,
      } : prev);

      showModal({ title: 'Success', message: 'Details updated', variant: 'success' });
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      showModal({ title: 'Update Failed', message: err.message ?? 'Something went wrong while saving your details.', variant: 'error' });
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onNavigate('home');
  };

  const sidebarContent = (
    <>
      {SIDEBAR_ITEMS.map(item => (
        <TouchableOpacity
          key={item.key}
          style={[styles.sidebarItem, activeSection === item.key && styles.sidebarItemActive]}
          onPress={() => setActiveSection(item.key)}
          activeOpacity={0.7}
        >
          <Icon
            name={item.icon}
            size={18}
            color={activeSection === item.key ? '#C8102E' : '#666'}
            style={styles.sidebarIcon}
          />
          <Text style={[styles.sidebarLabel, activeSection === item.key && styles.sidebarLabelActive]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
      <View style={styles.sidebarDivider} />
      <TouchableOpacity style={styles.sidebarItem} onPress={handleSignOut} activeOpacity={0.7}>
        <Icon name="log-out-outline" size={18} color="#C8102E" style={styles.sidebarIcon} />
        <Text style={styles.signOutLabel}>Sign out</Text>
      </TouchableOpacity>
    </>
  );

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
              <TouchableOpacity style={styles.navProfileBtn} onPress={() => onNavigate('profile')}>
                <NavAvatar avatarUrl={profile?.avatar_url} size={26} color="#C8102E" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.mobileNav}>
            <View style={styles.navLeft}>
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.navLogoImage}
                resizeMode="contain"
              />
              <Text style={styles.navLogoText}>Mamiya Theater</Text>
            </View>
            <TouchableOpacity onPress={() => onNavigate('profile')}>
              <NavAvatar avatarUrl={profile?.avatar_url} size={24} color="#C8102E" />
            </TouchableOpacity>
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

        {/* ── MOBILE SIDEBAR (stacked vertical list) ── */}
        {!isDesktop && <View style={styles.mobileSidebar}>{sidebarContent}</View>}

        <View style={[styles.body, isDesktop && styles.bodyDesktop, !isDesktop && styles.bodyMobile]}>
          {isDesktop && <View style={styles.sidebar}>{sidebarContent}</View>}

          <View style={[styles.main, isDesktop && styles.mainDesktop]}>

            {/* ── PROFILE IDENTITY CARD ── */}
            <View style={styles.identityCard}>
              {loadingProfile ? (
                <ActivityIndicator color="#C8102E" style={styles.identityLoading} />
              ) : loadError && !profile ? (
                <Text style={styles.identityError}>Couldn&apos;t load your profile: {loadError}</Text>
              ) : (
                <>
                  <TouchableOpacity style={styles.viewCardLink}>
                    <Text style={styles.viewCardText}>View card</Text>
                  </TouchableOpacity>
                  <View style={styles.identityRow}>
                    <View style={styles.avatarWrap}>
                      {profile?.avatar_url ? (
                        <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                      ) : (
                        <Icon name="person-circle" size={72} color="#C8102E" />
                      )}
                    </View>
                    <View style={styles.identityInfo}>
                      <Text style={styles.identityName}>{displayName}</Text>
                      <View style={styles.membershipBadge}>
                        <Text style={styles.membershipBadgeText}>
                          {isAdmin ? 'Admin' : 'Basic Member, Mamiya Club'}
                        </Text>
                      </View>
                      <Text style={styles.identityId}>Member ID: {memberId}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* ── SECTION CONTENT ── */}
            {activeSection === 'overview' ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Icon name="receipt-outline" size={40} color="#C8102E" />
                </View>
                <Text style={styles.emptyHeadline}>You don&apos;t have any upcoming bookings.</Text>
                <Text style={styles.emptySubtitle}>
                  Bookings for today&apos;s showtimes will be shown here.
                </Text>
                <TouchableOpacity
                  style={styles.browseBtn}
                  activeOpacity={0.85}
                  onPress={() => onNavigate('home')}
                >
                  <Text style={styles.browseBtnText}>Browse Shows</Text>
                </TouchableOpacity>
              </View>
            ) : activeSection === 'details' ? (
              <View style={styles.detailsCard}>
                <Text style={styles.detailsHeading}>Update details</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Full name</Text>
                  <View style={[styles.inputWrapper, !!fullNameError && styles.inputError]}>
                    <Icon name="person-outline" size={16} color="#aaa" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Your full name"
                      placeholderTextColor="#bbb"
                      value={fullName}
                      onChangeText={handleFullNameChange}
                      onBlur={() => setFullNameError(validateFullNameField(fullName))}
                    />
                  </View>
                  {!!fullNameError && <Text style={styles.errorText}>{fullNameError}</Text>}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Mobile number</Text>
                  <View style={[styles.inputWrapper, !!mobileNumberError && styles.inputError]}>
                    <Icon name="call-outline" size={16} color="#aaa" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="(808) 555-0123"
                      placeholderTextColor="#bbb"
                      keyboardType="phone-pad"
                      value={mobileNumber}
                      onChangeText={handleMobileNumberChange}
                      onBlur={() => setMobileNumberError(validateMobileNumberField(mobileNumber))}
                    />
                  </View>
                  {!!mobileNumberError && <Text style={styles.errorText}>{mobileNumberError}</Text>}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Profile photo</Text>
                  <View style={styles.avatarUploadRow}>
                    <View style={styles.avatarPreviewWrap}>
                      {avatarDisplayUri ? (
                        <Image source={{ uri: avatarDisplayUri }} style={styles.avatarPreviewImage} />
                      ) : (
                        <Icon name="person-circle" size={44} color="#C8102E" />
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.uploadBtn, uploadingAvatar && styles.uploadBtnDisabled]}
                      activeOpacity={0.85}
                      onPress={handlePickAvatarFile}
                      disabled={uploadingAvatar}
                    >
                      <Icon name="cloud-upload-outline" size={15} color="#C8102E" style={styles.uploadBtnIcon} />
                      <Text style={styles.uploadBtnText}>{uploadingAvatar ? 'Uploading...' : 'Upload photo'}</Text>
                    </TouchableOpacity>
                  </View>
                  {!!avatarError && <Text style={styles.errorText}>{avatarError}</Text>}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Avatar URL (optional)</Text>
                  <View style={styles.inputWrapper}>
                    <Icon name="image-outline" size={16} color="#aaa" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="https://example.com/avatar.jpg"
                      placeholderTextColor="#bbb"
                      autoCapitalize="none"
                      value={avatarUrl}
                      onChangeText={setAvatarUrl}
                    />
                  </View>
                  <Text style={styles.helperText}>Uploading a photo above will replace this URL.</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <View style={[styles.inputWrapper, styles.inputReadOnly]}>
                    <Icon name="mail-outline" size={16} color="#bbb" style={styles.inputIcon} />
                    <Text style={styles.readOnlyValue}>{profile?.email ?? authEmail ?? '—'}</Text>
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Role</Text>
                  <View style={[styles.inputWrapper, styles.inputReadOnly]}>
                    <Icon name="shield-outline" size={16} color="#bbb" style={styles.inputIcon} />
                    <Text style={styles.readOnlyValue}>{profile?.role ?? '—'}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, (savingDetails || uploadingAvatar) && styles.saveBtnDisabled]}
                  activeOpacity={0.85}
                  onPress={handleSaveDetails}
                  disabled={savingDetails || uploadingAvatar}
                >
                  <Text style={styles.saveBtnText}>{savingDetails ? 'Saving...' : 'Save changes'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.placeholderState}>
                <Text style={styles.placeholderText}>{activeLabel} — coming soon.</Text>
              </View>
            )}
          </View>
        </View>

      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const FONT = 'Urbanist';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12122a' },
  scroll: { flex: 1, backgroundColor: '#F8F9FA' },

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
  navLogoText: { color: '#fff', fontWeight: '800', fontSize: 15, fontFamily: FONT },
  navCenter: { flexDirection: 'row', gap: 28 },
  navLink: { color: '#ccc', fontSize: 13, fontWeight: '500', fontFamily: FONT },
  navRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 },
  navProfileBtn: {},

  // ── DASHBOARD BODY ──
  body: { paddingHorizontal: 20, paddingVertical: 24 },
  bodyDesktop: { flexDirection: 'row', paddingHorizontal: 60, paddingVertical: 40, gap: 32 },
  bodyMobile: { paddingTop: 16 },

  // ── SIDEBAR ──
  sidebar: {
    width: 260, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#eee', padding: 12, alignSelf: 'flex-start',
  },
  mobileSidebar: {
    backgroundColor: '#fff', marginHorizontal: 20, marginTop: 16,
    borderRadius: 12, borderWidth: 1, borderColor: '#eee', padding: 10,
  },
  sidebarItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8, marginBottom: 2,
  },
  sidebarItemActive: { backgroundColor: 'rgba(200,16,46,0.08)' },
  sidebarIcon: { width: 18 },
  sidebarLabel: { fontSize: 13, color: '#444', fontWeight: '500', fontFamily: FONT },
  sidebarLabelActive: { color: '#C8102E', fontWeight: '700' },
  sidebarDivider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  signOutLabel: { fontSize: 13, color: '#C8102E', fontWeight: '700', fontFamily: FONT },

  // ── MAIN CONTENT ──
  main: { flex: 1, gap: 24 },
  mainDesktop: {},

  // ── IDENTITY CARD ──
  identityCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    padding: 24, position: 'relative',
  },
  viewCardLink: { position: 'absolute', top: 20, right: 20 },
  viewCardText: { color: '#C8102E', fontSize: 12, fontWeight: '700', fontFamily: FONT },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  avatarWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: 80, height: 80 },
  identityLoading: { paddingVertical: 28 },
  identityError: { fontSize: 13, color: '#C8102E', paddingVertical: 12, fontFamily: FONT },
  identityInfo: { flex: 1 },
  identityName: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 6, fontFamily: FONT },
  membershipBadge: {
    backgroundColor: 'rgba(200,16,46,0.08)', alignSelf: 'flex-start',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8,
  },
  membershipBadgeText: { color: '#C8102E', fontSize: 12, fontWeight: '700', fontFamily: FONT },
  identityId: { fontSize: 12, color: '#888', fontFamily: FONT },

  // ── EMPTY STATE (OVERVIEW) ──
  emptyState: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    paddingVertical: 56, paddingHorizontal: 24, alignItems: 'center',
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyHeadline: {
    fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 8,
    textAlign: 'center', fontFamily: FONT,
  },
  emptySubtitle: {
    fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 24, fontFamily: FONT,
  },
  browseBtn: { backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 28, paddingVertical: 13 },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, fontFamily: FONT },

  // ── GENERIC PLACEHOLDER (other sidebar sections) ──
  placeholderState: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    paddingVertical: 48, alignItems: 'center',
  },
  placeholderText: { fontSize: 13, color: '#999', fontFamily: FONT },

  // ── UPDATE DETAILS FORM ──
  // Same background/border/radius/padding as `identityCard` above, with no
  // width or maxWidth override, so the two cards line up flush at every
  // breakpoint instead of the form looking like a narrower, separate block.
  detailsCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    padding: 24,
  },
  detailsHeading: { fontSize: 17, fontWeight: '800', color: '#1a1a1a', marginBottom: 20, fontFamily: FONT },
  fieldGroup: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8, letterSpacing: 0.2, fontFamily: FONT },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fafafa',
  },
  inputError: { borderColor: '#ef4444' },
  inputReadOnly: { backgroundColor: '#f0f0f0' },
  inputIcon: { marginRight: 0 },
  input: { flex: 1, fontSize: 14, color: '#1a1a1a', outlineStyle: 'none', fontFamily: FONT } as any,
  readOnlyValue: { flex: 1, fontSize: 14, color: '#999', fontFamily: FONT },
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 5, fontFamily: FONT },
  helperText: { fontSize: 11, color: '#999', marginTop: 6, fontFamily: FONT },

  avatarUploadRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarPreviewWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarPreviewImage: { width: 56, height: 56 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 11, backgroundColor: '#fafafa',
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnIcon: {},
  uploadBtnText: { color: '#C8102E', fontWeight: '700', fontSize: 13, fontFamily: FONT },

  saveBtn: {
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnDisabled: { backgroundColor: '#9a0020' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, fontFamily: FONT },
});

export default ProfileScreen;