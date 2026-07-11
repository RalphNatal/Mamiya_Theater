import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  Image,
  ActivityIndicator,
  TextInput,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { useAppModal } from '../components/ModalProvider';
import NavAvatar from '../components/NavAvatar';
import { isValidMobileNumber } from '../lib/validation';
import { createStyles, typography, layout, FONT_FAMILY } from '../theme';
import { VENUE_SHORT_NAME, VENUE_TIMEZONE } from '../config/venue';
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

type BookingSeatRow = { seat_number: string };
type Booking = {
  id: string;
  movie_title: string | null;
  show_start_time: string | null;
  num_tickets: number;
  total_price: number;
  status: string;
  payment_status: string;
  created_at: string;
  booking_seats: BookingSeatRow[];
};

const SIDEBAR_ITEMS = [
  { key: 'overview', label: 'Overview', icon: 'grid-outline' },
  { key: 'details', label: 'Update details', icon: 'person-outline' },
  { key: 'bookings', label: 'Bookings and transactions', icon: 'receipt-outline' },
  { key: 'security', label: 'Account & security', icon: 'lock-closed-outline' },
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

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [bookingsLoaded, setBookingsLoaded] = useState(false);

  const [hasEmailLogin, setHasEmailLogin] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

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
      setHasEmailLogin(
        (user.identities ?? []).some(i => i.provider === 'email') ||
        (user.app_metadata as any)?.provider === 'email',
      );

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, email, mobile_number, role')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        logger.error('Failed to load profile:', error);
        setLoadError(error.message);
      } else if (data) {
        setProfile(data);
      } else {
        // Self-heal a missing row rather than surfacing the coerce error:
        // recreate a minimal profile from the auth metadata (mobile stays null
        // so the complete-profile prompt still fires).
        const meta = (user.user_metadata ?? {}) as any;
        const healed: Profile = {
          full_name: meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : null),
          avatar_url: meta.avatar_url || meta.picture || null,
          email: user.email ?? null,
          mobile_number: null,
          role: 'user',
        };
        await supabase.from('profiles').upsert({ id: user.id, ...healed }, { onConflict: 'id', ignoreDuplicates: true });
        if (!isMounted) return;
        setProfile(healed);
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

  const avatarDisplayUri = avatarPreviewUri || avatarUrl.trim() || profile?.avatar_url || null;

  // Derived once and shared by both the Overview dashboard and the Bookings
  // tab. Only paid bookings feed the stats and the upcoming/past groups.
  const paid = useMemo(() => bookings.filter(b => b.payment_status === 'paid'), [bookings]);
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up = paid
      .filter(b => b.show_start_time && new Date(b.show_start_time).getTime() >= now)
      .sort((a, b) => new Date(a.show_start_time!).getTime() - new Date(b.show_start_time!).getTime());
    const upSet = new Set(up);
    const pst = paid
      .filter(b => !upSet.has(b))
      .sort((a, b) => {
        const at = a.show_start_time ? new Date(a.show_start_time).getTime() : 0;
        const bt = b.show_start_time ? new Date(b.show_start_time).getTime() : 0;
        return bt - at;
      });
    return { upcoming: up, past: pst };
  }, [paid]);
  const nextShow = upcoming[0] ?? null;
  const totalBookings = bookings.length;
  const totalTickets = useMemo(() => paid.reduce((sum, b) => sum + (b.num_tickets || 0), 0), [paid]);
  const totalSpent = useMemo(() => paid.reduce((sum, b) => sum + Number(b.total_price || 0), 0), [paid]);

  useEffect(() => {
    if (activeSection !== 'details' || detailsHydrated || !profile) return;
    setFullName(profile.full_name ?? '');
    setMobileNumber(profile.mobile_number ?? '');
    setAvatarUrl(profile.avatar_url ?? '');
    setDetailsHydrated(true);
  }, [activeSection, detailsHydrated, profile]);

  // Fetched once as soon as the user is known: both the Overview dashboard and
  // the Bookings tab read from this same `bookings` state. RLS already limits
  // this to the signed-in user's own rows.
  useEffect(() => {
    if (bookingsLoaded || !userId) return;

    const loadBookings = async () => {
      try {
        setBookingsLoading(true);
        const { data, error } = await supabase
          .from('bookings')
          .select('id, movie_title, show_start_time, num_tickets, total_price, status, payment_status, created_at, booking_seats(seat_number)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setBookings((data as any) ?? []);
        setBookingsError(null);
      } catch (err: any) {
        logger.error('Failed to load bookings:', err);
        setBookingsError(err.message ?? 'Failed to load your bookings.');
      } finally {
        setBookingsLoading(false);
        setBookingsLoaded(true);
      }
    };

    loadBookings();
  }, [bookingsLoaded, userId]);

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
      setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`);
    } catch (err: any) {
      logger.error('Avatar upload failed:', err);
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
      logger.error('Failed to update profile:', err);
      showModal({ title: 'Update Failed', message: err.message ?? 'Something went wrong while saving your details.', variant: 'error' });
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onNavigate('home');
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordError(null);
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      showModal({ title: 'Success', message: 'Your password has been updated.', variant: 'success' });
    } catch (err: any) {
      logger.error('Failed to change password:', err);
      showModal({ title: 'Update Failed', message: err.message ?? 'Something went wrong while updating your password.', variant: 'error' });
    } finally {
      setChangingPassword(false);
    }
  };

  const renderBookingCard = (b: Booking) => {
    const seatList = (b.booking_seats ?? []).map(s => s.seat_number).join(', ');
    const showDate = b.show_start_time ? new Date(b.show_start_time) : null;
    const bookedDate = new Date(b.created_at);
    const isConfirmed = b.status === 'confirmed';
    const isPaid = b.payment_status === 'paid';
    return (
      <View key={b.id} style={bk.card}>
        <View style={bk.cardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={bk.movieTitle} numberOfLines={1}>
              {b.movie_title ?? 'Untitled showtime'}
            </Text>
            <Text style={bk.showTime}>
              {showDate
                ? `${showDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: VENUE_TIMEZONE })} · ${showDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE, timeZoneName: 'short' })}`
                : 'Date unavailable'}
            </Text>
          </View>
          <View style={bk.badgeStack}>
            <View style={[bk.statusBadge, isConfirmed ? bk.statusConfirmed : bk.statusOther]}>
              <Text style={[bk.statusText, isConfirmed ? bk.statusTextConfirmed : bk.statusTextOther]}>
                {b.status}
              </Text>
            </View>
            <View style={[bk.statusBadge, isPaid ? bk.statusConfirmed : bk.statusOther]}>
              <Text style={[bk.statusText, isPaid ? bk.statusTextConfirmed : bk.statusTextOther]}>
                {b.payment_status}
              </Text>
            </View>
          </View>
        </View>

        <View style={bk.cardDivider} />

        <View style={bk.cardBottom}>
          <View style={bk.cardStat}>
            <Text style={bk.cardStatLabel}>Seats</Text>
            <Text style={bk.cardStatValue}>{seatList || '—'}</Text>
          </View>
          <View style={bk.cardStat}>
            <Text style={bk.cardStatLabel}>Tickets</Text>
            <Text style={bk.cardStatValue}>{b.num_tickets}</Text>
          </View>
          <View style={bk.cardStat}>
            <Text style={bk.cardStatLabel}>Total</Text>
            <Text style={bk.cardStatValue}>${Number(b.total_price).toFixed(2)}</Text>
          </View>
          <View style={bk.cardStat}>
            <Text style={bk.cardStatLabel}>Booked on</Text>
            <Text style={bk.cardStatValue}>
              {bookedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        </View>

        {isPaid && (
          <TouchableOpacity
            style={bk.ticketBtn}
            activeOpacity={0.85}
            onPress={() => onNavigate('ticket', b.id)}
          >
            <Icon name="ticket-outline" size={15} color="#fff" style={bk.ticketBtnIcon} />
            <Text style={bk.ticketBtnText}>View e-ticket</Text>
          </TouchableOpacity>
        )}
      </View>
    );
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
            <TouchableOpacity
              style={styles.navLeft}
              onPress={() => onNavigate('home')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go to homepage"
            >
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.navLogoImage}
                resizeMode="contain"
                accessible={false}
              />
              <Text style={styles.navLogoText}>{VENUE_SHORT_NAME}</Text>
            </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.navProfileBtn}
                onPress={() => onNavigate('profile')}
                accessibilityRole="button"
                accessibilityLabel="Your profile"
              >
                <NavAvatar avatarUrl={profile?.avatar_url} size={26} color="#C8102E" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.mobileNav}>
            <TouchableOpacity
              style={styles.navLeft}
              onPress={() => onNavigate('home')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go to homepage"
            >
              <Image
                source={require('../assets/SLS-175-Years-Logo-_r4_.png')}
                style={styles.navLogoImage}
                resizeMode="contain"
                accessible={false}
              />
              <Text style={styles.navLogoText}>{VENUE_SHORT_NAME}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onNavigate('profile')}
              accessibilityRole="button"
              accessibilityLabel="Your profile"
            >
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

        {/* ── MOBILE SECTION TABS (horizontal pill strip) ── */}
        {!isDesktop && (
          <View style={styles.mobileTabsWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileTabs}>
              {SIDEBAR_ITEMS.map(item => {
                const active = activeSection === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => setActiveSection(item.key)}
                    style={[styles.mobileTab, active && styles.mobileTabActive]}
                    activeOpacity={0.8}
                  >
                    <Icon name={item.icon} size={15} color={active ? '#C8102E' : '#666'} />
                    <Text style={[styles.mobileTabLabel, active && styles.mobileTabLabelActive]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

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
                <View style={[styles.identityRow, !isDesktop && styles.identityRowMobile]}>
                    <View style={styles.avatarWrap}>
                      {profile?.avatar_url ? (
                        <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                      ) : (
                        <Icon name="person-circle" size={72} color="#C8102E" />
                      )}
                    </View>
                    <View style={styles.identityInfo}>
                      <Text style={[styles.identityName, !isDesktop && styles.identityNameMobile]}>{displayName}</Text>
                      <View style={[styles.membershipBadge, !isDesktop && styles.membershipBadgeMobile]}>
                        <Text style={styles.membershipBadgeText}>
                          {isAdmin ? 'Admin' : 'Basic Member, Mamiya Club'}
                        </Text>
                      </View>
                      <Text style={[styles.identityId, !isDesktop && styles.identityIdMobile]}>Member ID: {memberId}</Text>
                    </View>
                  </View>
              )}
            </View>

            {/* ── SECTION CONTENT ── */}
            {activeSection === 'overview' ? (
              bookingsLoading ? (
                <View style={styles.placeholderState}>
                  <ActivityIndicator color="#C8102E" />
                </View>
              ) : bookingsError ? (
                <View style={styles.placeholderState}>
                  <Text style={[styles.placeholderText, ov.errorText]}>{bookingsError}</Text>
                </View>
              ) : (
                <View style={ov.container}>
                  {isAdmin && (
                    <TouchableOpacity
                      style={ov.adminBtn}
                      activeOpacity={0.85}
                      onPress={() => onNavigate('admin')}
                    >
                      <Icon name="speedometer-outline" size={16} color="#fff" style={ov.adminBtnIcon} />
                      <Text style={ov.adminBtnText}>Open admin dashboard</Text>
                    </TouchableOpacity>
                  )}

                  <View style={ov.statGrid}>
                    <View style={ov.statTile}>
                      <Text style={bk.cardStatValue}>{upcoming.length}</Text>
                      <Text style={bk.cardStatLabel}>Upcoming shows</Text>
                    </View>
                    <View style={ov.statTile}>
                      <Text style={bk.cardStatValue}>{totalBookings}</Text>
                      <Text style={bk.cardStatLabel}>Total bookings</Text>
                    </View>
                    <View style={ov.statTile}>
                      <Text style={bk.cardStatValue}>{totalTickets}</Text>
                      <Text style={bk.cardStatLabel}>Tickets</Text>
                    </View>
                    <View style={ov.statTile}>
                      <Text style={bk.cardStatValue}>${totalSpent.toFixed(2)}</Text>
                      <Text style={bk.cardStatLabel}>Total spent</Text>
                    </View>
                  </View>

                  <Text style={ov.sectionHeading}>Your next show</Text>
                  {nextShow ? (
                    <View style={ov.nextCard}>
                      <Text style={bk.movieTitle} numberOfLines={1}>
                        {nextShow.movie_title ?? 'Untitled showtime'}
                      </Text>
                      <Text style={bk.showTime}>
                        {nextShow.show_start_time
                          ? `${new Date(nextShow.show_start_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: VENUE_TIMEZONE })} · ${new Date(nextShow.show_start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: VENUE_TIMEZONE, timeZoneName: 'short' })}`
                          : 'Date unavailable'}
                      </Text>
                      <View style={ov.nextSeatsRow}>
                        <Text style={bk.cardStatLabel}>Seats</Text>
                        <Text style={bk.cardStatValue}>
                          {(nextShow.booking_seats ?? []).map(s => s.seat_number).join(', ') || '—'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={ov.ticketBtn}
                        activeOpacity={0.85}
                        onPress={() => onNavigate('ticket', nextShow.id)}
                      >
                        <Icon name="ticket-outline" size={16} color="#fff" style={ov.ticketBtnIcon} />
                        <Text style={ov.ticketBtnText}>View e-ticket</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <View style={styles.emptyIconWrap}>
                        <Icon name="receipt-outline" size={40} color="#C8102E" />
                      </View>
                      <Text style={styles.emptyHeadline}>You don&apos;t have any upcoming shows.</Text>
                      <Text style={styles.emptySubtitle}>
                        Showtimes you book will appear here with your seats and e-ticket.
                      </Text>
                      <TouchableOpacity
                        style={styles.browseBtn}
                        activeOpacity={0.85}
                        onPress={() => onNavigate('home')}
                      >
                        <Text style={styles.browseBtnText}>Browse Shows</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )
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
            ) : activeSection === 'bookings' ? (
              bookingsLoading ? (
                <View style={styles.placeholderState}>
                  <ActivityIndicator color="#C8102E" />
                </View>
              ) : bookingsError ? (
                <View style={styles.placeholderState}>
                  <Text style={[styles.placeholderText, { color: '#C8102E' }]}>{bookingsError}</Text>
                </View>
              ) : paid.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <Icon name="receipt-outline" size={40} color="#C8102E" />
                  </View>
                  <Text style={styles.emptyHeadline}>You don&apos;t have any bookings yet.</Text>
                  <Text style={styles.emptySubtitle}>
                    Showtimes you book will show up here with your seats and total.
                  </Text>
                  <TouchableOpacity
                    style={styles.browseBtn}
                    activeOpacity={0.85}
                    onPress={() => onNavigate('home')}
                  >
                    <Text style={styles.browseBtnText}>Browse Shows</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={bk.groups}>
                  {upcoming.length > 0 && (
                    <View style={bk.group}>
                      <Text style={bk.groupHeading}>Upcoming</Text>
                      <View style={bk.list}>{upcoming.map(renderBookingCard)}</View>
                    </View>
                  )}
                  {past.length > 0 && (
                    <View style={bk.group}>
                      <Text style={bk.groupHeading}>Past</Text>
                      <View style={bk.list}>{past.map(renderBookingCard)}</View>
                    </View>
                  )}
                </View>
              )
            ) : activeSection === 'security' ? (
              <View style={styles.detailsCard}>
                <Text style={styles.detailsHeading}>Account &amp; security</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <View style={[styles.inputWrapper, styles.inputReadOnly]}>
                    <Icon name="mail-outline" size={16} color="#bbb" style={styles.inputIcon} />
                    <Text style={styles.readOnlyValue}>{profile?.email ?? authEmail ?? '—'}</Text>
                  </View>
                </View>

                {hasEmailLogin ? (
                  <>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>New password</Text>
                      <View style={[styles.inputWrapper, !!passwordError && styles.inputError]}>
                        <Icon name="lock-closed-outline" size={16} color="#aaa" style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          placeholder="At least 8 characters"
                          placeholderTextColor="#bbb"
                          secureTextEntry
                          autoCapitalize="none"
                          value={newPassword}
                          onChangeText={(t) => { setNewPassword(t); if (passwordError) setPasswordError(null); }}
                        />
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Confirm password</Text>
                      <View style={[styles.inputWrapper, !!passwordError && styles.inputError]}>
                        <Icon name="lock-closed-outline" size={16} color="#aaa" style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          placeholder="Re-enter new password"
                          placeholderTextColor="#bbb"
                          secureTextEntry
                          autoCapitalize="none"
                          value={confirmPassword}
                          onChangeText={(t) => { setConfirmPassword(t); if (passwordError) setPasswordError(null); }}
                        />
                      </View>
                      {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
                    </View>

                    <TouchableOpacity
                      style={[styles.saveBtn, changingPassword && styles.saveBtnDisabled]}
                      activeOpacity={0.85}
                      onPress={handleChangePassword}
                      disabled={changingPassword}
                    >
                      <Text style={styles.saveBtnText}>{changingPassword ? 'Updating...' : 'Change password'}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.fieldGroup}>
                    <View style={sec.note}>
                      <Icon name="logo-google" size={16} color="#888" style={styles.inputIcon} />
                      <Text style={sec.noteText}>
                        You sign in with Google — manage your password in your Google account.
                      </Text>
                    </View>
                  </View>
                )}

                <View style={sec.divider} />

                <TouchableOpacity
                  style={sec.signOutBtn}
                  activeOpacity={0.85}
                  onPress={handleSignOut}
                >
                  <Icon name="log-out-outline" size={16} color="#C8102E" style={styles.inputIcon} />
                  <Text style={sec.signOutBtnText}>Sign out</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>

      </Animated.ScrollView>
    </SafeAreaView>
  );
};

const FONT = FONT_FAMILY;

const styles = createStyles({
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
  body: { ...layout.page, paddingHorizontal: 20, paddingVertical: 24 },
  bodyDesktop: { flexDirection: 'row', paddingHorizontal: 60, paddingVertical: 40, gap: 32 },
  bodyMobile: { paddingTop: 16 },

  // ── SIDEBAR ──
  sidebar: {
    width: 260, backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#eee', padding: 12, alignSelf: 'flex-start',
  },
  mobileTabsWrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  mobileTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  mobileTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F1F1F3' },
  mobileTabActive: { backgroundColor: 'rgba(200,16,46,0.10)' },
  mobileTabLabel: { fontSize: 13, color: '#555', fontWeight: '600', fontFamily: FONT },
  mobileTabLabelActive: { color: '#C8102E', fontWeight: '700' },
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
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  identityRowMobile: { flexDirection: 'column', alignItems: 'center', gap: 12 },
  avatarWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(200,16,46,0.08)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: 80, height: 80 },
  identityLoading: { paddingVertical: 28 },
  identityError: { fontSize: 13, color: '#C8102E', paddingVertical: 12, fontFamily: FONT },
  identityInfo: { flex: 1 },
  identityName: { ...typography.heading2, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  identityNameMobile: { textAlign: 'center' },
  membershipBadge: {
    backgroundColor: 'rgba(200,16,46,0.08)', alignSelf: 'flex-start',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8,
  },
  membershipBadgeMobile: { alignSelf: 'center' },
  membershipBadgeText: { color: '#C8102E', fontSize: 12, fontWeight: '700', fontFamily: FONT },
  identityId: { fontSize: 12, color: '#888', fontFamily: FONT },
  identityIdMobile: { textAlign: 'center' },

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

  placeholderState: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    paddingVertical: 48, alignItems: 'center',
  },
  placeholderText: { fontSize: 13, color: '#999', fontFamily: FONT },

  detailsCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    padding: 24,
  },
  detailsHeading: { ...typography.heading2, fontSize: 17, lineHeight: 23, fontWeight: '800', color: '#1a1a1a', marginBottom: 20 },
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

// ── BOOKINGS AND TRANSACTIONS ──
const bk = createStyles({
  list: { gap: 14 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    padding: 20,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  movieTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 4, fontFamily: FONT },
  showTime: { fontSize: 12, color: '#888', fontFamily: FONT },
  badgeStack: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusConfirmed: { backgroundColor: 'rgba(22,163,74,0.1)' },
  statusOther: { backgroundColor: 'rgba(200,16,46,0.08)' },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize', fontFamily: FONT },
  statusTextConfirmed: { color: '#16a34a' },
  statusTextOther: { color: '#C8102E' },
  cardDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 16 },
  cardBottom: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  cardStat: { minWidth: 90 },
  cardStatLabel: {
    fontSize: 10, fontWeight: '700', color: '#999', letterSpacing: 0.4,
    textTransform: 'uppercase', marginBottom: 5, fontFamily: FONT,
  },
  cardStatValue: { fontSize: 13, fontWeight: '700', color: '#1a1a1a', fontFamily: FONT },

  groups: { gap: 28 },
  group: { gap: 12 },
  groupHeading: {
    fontSize: 12, fontWeight: '800', color: '#666', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 2, fontFamily: FONT,
  },
  ticketBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#C8102E', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10,
    marginTop: 16,
  },
  ticketBtnIcon: {},
  ticketBtnText: { color: '#fff', fontWeight: '700', fontSize: 12, fontFamily: FONT },
});

// ── OVERVIEW DASHBOARD ──
const ov = createStyles({
  container: { gap: 24 },
  errorText: { color: '#C8102E' },
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#12122a', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 20,
  },
  adminBtnIcon: {},
  adminBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, fontFamily: FONT },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  statTile: {
    flex: 1, minWidth: 140, backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#eee', padding: 18, gap: 6,
  },
  sectionHeading: {
    fontSize: 12, fontWeight: '800', color: '#666', letterSpacing: 0.5,
    textTransform: 'uppercase', fontFamily: FONT,
  },
  nextCard: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eee',
    padding: 20,
  },
  nextSeatsRow: { marginTop: 16, marginBottom: 4 },
  ticketBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#C8102E', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 20,
    marginTop: 16, alignSelf: 'flex-start',
  },
  ticketBtnIcon: {},
  ticketBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, fontFamily: FONT },
});

// ── ACCOUNT & SECURITY ──
const sec = createStyles({
  note: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#e5e5e5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fafafa',
  },
  noteText: { flex: 1, fontSize: 13, color: '#666', fontFamily: FONT },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 20 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: 'rgba(200,16,46,0.4)', borderRadius: 10,
    paddingVertical: 13, backgroundColor: 'rgba(200,16,46,0.04)',
  },
  signOutBtnText: { color: '#C8102E', fontWeight: '700', fontSize: 14, fontFamily: FONT },
});

export default ProfileScreen;