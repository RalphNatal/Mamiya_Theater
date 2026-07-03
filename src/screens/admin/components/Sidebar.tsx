import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { createStyles } from '../../../theme';
import { B } from '../shared/brand';
// ── SIDEBAR NAV ────────────────────────────────────────
export const NAV_ITEMS = [
  { id: 'overview',   label: 'Overview',   icon: 'grid-outline' },
  { id: 'showtimes',  label: 'Showtimes',  icon: 'time-outline' },
  { id: 'boxoffice',  label: 'Box Office', icon: 'cart-outline' },
  { id: 'seatmap',    label: 'Seat Map',   icon: 'apps-outline' },
  { id: 'users',      label: 'Users',      icon: 'people-outline' },
  { id: 'settings',   label: 'Settings',   icon: 'settings-outline' },
];
export const Sidebar = ({ active, onSelect, adminName }: {
  active: string;
  onSelect: (id: string) => void;
  adminName: string;
}) => (
  <View style={sb.wrap}>
    <View style={sb.brand}>
      <Image source={require('../../../assets/SLS-175-Years-Logo-_r4_.png')} style={sb.brandLogo} resizeMode="contain" />
      <Text style={sb.brandName}>Mamiya Theater</Text>
    </View>

    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      {NAV_ITEMS.map(item => {
        const isActive = active === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            style={[sb.item, isActive && sb.itemActive]}
            onPress={() => onSelect(item.id)}
            activeOpacity={0.75}
          >
            <Icon name={item.icon} size={18} color={isActive ? '#fff' : 'rgba(255,255,255,0.55)'} style={sb.icon} />
            <Text style={[sb.lbl, isActive && sb.lblActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>

    <View style={sb.div} />

    <View style={sb.user}>
      <View style={sb.avatar}><Text style={sb.avatarTxt}>{adminName.charAt(0).toUpperCase()}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={sb.userName} numberOfLines={1}>{adminName}</Text>
        <Text style={sb.userRole}>Admin Role</Text>
      </View>
    </View>
  </View>
);

export const sb = createStyles({
  wrap:        { width: 210, backgroundColor: '#0d1b2a', flexDirection: 'column', height: '100%' },
  brand:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  brandLogo:   { width: 32, height: 32 },
  brandName:   { color: '#fff', fontWeight: '800', fontSize: 14 },
  item:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 20, marginBottom: 2 },
  itemActive:  { backgroundColor: B.red, borderRadius: 8, marginHorizontal: 10, paddingHorizontal: 10 },
  icon:        { width: 24, textAlign: 'center' },
  lbl:         { flex: 1, color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '500' },
  lblActive:   { color: '#fff', fontWeight: '700' },
  div:         { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 20, marginBottom: 14 },
  user:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 22 },
  avatar:      { width: 36, height: 36, borderRadius: 18, backgroundColor: B.red, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:   { color: '#fff', fontSize: 12, fontWeight: '800' },
  userName:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  userRole:    { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
});
