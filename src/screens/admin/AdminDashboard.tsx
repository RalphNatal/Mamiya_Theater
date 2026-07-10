import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useAppModal } from '../../components/ModalProvider';
import type { OnNavigate } from '../../types/navigation';
import { breakpoints } from '../../theme';
import { B } from './shared/brand';
import { s } from './shared/adminStyles';
import { Sidebar, NAV_ITEMS } from './components/Sidebar';
import { OverviewPanel } from './sections/OverviewSection';
import { ShowtimesPanel } from './sections/ShowtimesSection';
import { BoxOfficePanel } from './sections/BoxOfficeSection';
import { SeatManagementPanel } from './sections/SeatMapSection';
import { UserManagementPanel } from './sections/UsersSection';
import { ChangePasswordPanel } from './sections/SettingsSection';

type Props = { onNavigate: OnNavigate };

const AdminDashboard = ({ onNavigate }: Props) => {
  const { showModal } = useAppModal();
  const { width } = useWindowDimensions();
  const isDesktop = width >= breakpoints.lg;
  const isMobile = width < breakpoints.md;
  const [activeNav, setActiveNav]     = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName]     = useState('Admin');

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showModal({ title: 'Unauthorized access', message: 'Please log in to continue.', variant: 'error' });
        onNavigate('home');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name, email')
        .eq('id', user.id)
        .maybeSingle();

      if (error || profile?.role !== 'admin') {
        showModal({
          title: 'Unauthorized access',
          message: 'You do not have permission to view this page.',
          variant: 'error',
        });
        onNavigate('home');
        return;
      }

      setAdminName(profile.full_name?.trim() || profile.email?.split('@')[0] || 'Admin');
    };

    checkAccess();
  }, [onNavigate, showModal]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onNavigate('home');
  };

  const pageTitle = NAV_ITEMS.find(n => n.id === activeNav)?.label ?? 'Overview';

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.navyDp} />
      <View style={s.layout}>

        {/* ── SIDEBAR ── */}
        {isDesktop ? (
          <Sidebar active={activeNav} onSelect={setActiveNav} adminName={adminName} />
        ) : sidebarOpen ? (
          <>
            <TouchableOpacity style={s.overlay} onPress={() => setSidebarOpen(false)} />
            <View style={s.mobileSb}>
              <Sidebar
                active={activeNav}
                onSelect={(id) => { setActiveNav(id); setSidebarOpen(false); }}
                adminName={adminName}
              />
            </View>
          </>
        ) : null}

        {/* ── MAIN CONTENT ── */}
        <View style={s.main}>

          {/* TOP BAR */}
          <View style={s.topbar}>
            <View style={s.topLeft}>
              {!isDesktop && (
                <TouchableOpacity style={s.burger} onPress={() => setSidebarOpen(true)}>
                  <Icon name="menu-outline" size={18} color={B.txt} />
                </TouchableOpacity>
              )}
              <Text style={s.pageTitle}>{pageTitle}</Text>
            </View>
            <View style={s.topRight}>
              <TouchableOpacity style={s.siteBtn} onPress={() => onNavigate('home')}>
                <Text style={s.siteBtnTxt}>View Live Site</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogout}>
                <Text style={s.logoutTxt}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* SCROLL CONTENT */}
          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={[s.content, isMobile && s.contentMobile]}>
            {activeNav === 'users' ? (
              <UserManagementPanel />
            ) : activeNav === 'settings' ? (
              <ChangePasswordPanel />
            ) : activeNav === 'showtimes' ? (
              <ShowtimesPanel />
            ) : activeNav === 'boxoffice' ? (
              <BoxOfficePanel />
            ) : activeNav === 'seatmap' ? (
              <SeatManagementPanel />
            ) : (
              <OverviewPanel adminName={adminName} />
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default AdminDashboard;
