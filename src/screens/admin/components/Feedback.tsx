import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { createStyles, typography } from '../../../theme';
import { B } from '../shared/brand';
import { s } from '../shared/adminStyles';
export const PageHeader = ({ title, subtitle, actionLabel, onAction }: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <View style={s.pageHead}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.pageHeadTitle}>{title}</Text>
      <Text style={s.pageHeadSub}>{subtitle}</Text>
    </View>
    {!!actionLabel && !!onAction && (
      <TouchableOpacity style={s.pageHeadBtn} onPress={onAction} activeOpacity={0.85}>
        <Text style={s.pageHeadBtnText}>{actionLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ── SHARED: LOADING / EMPTY STATES ─────────────────────
export const LoadingState = ({ label }: { label?: string }) => (
  <View style={es.loadingWrap}>
    <ActivityIndicator color={B.red} />
    {!!label && <Text style={es.loadingLabel}>{label}</Text>}
  </View>
);

export const EmptyState = ({ icon, title, subtitle, actionLabel, onAction }: {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <View style={es.wrap}>
    <View style={es.iconWrap}><Icon name={icon} size={24} color={B.red} /></View>
    <Text style={es.title}>{title}</Text>
    {!!subtitle && <Text style={es.subtitle}>{subtitle}</Text>}
    {!!actionLabel && !!onAction && (
      <TouchableOpacity style={es.actionBtn} onPress={onAction} activeOpacity={0.85}>
        <Text style={es.actionBtnText}>{actionLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

export const es = createStyles({
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  loadingLabel: { fontSize: 12, color: B.txtMu },
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: B.bg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { ...typography.body, fontWeight: '700', color: B.txt, marginBottom: 6, textAlign: 'center' },
  subtitle: { ...typography.caption, color: B.txtMu, textAlign: 'center', marginBottom: 18, maxWidth: 320 },
  actionBtn: { backgroundColor: B.red, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
