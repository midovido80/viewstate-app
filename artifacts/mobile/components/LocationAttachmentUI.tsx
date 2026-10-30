import { PropertyFormCard } from '@/components/PropertyFormCard';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

type ActionIcon = 'crosshair' | 'map' | 'image' | 'video' | 'file-text';

export function LocationAttachmentCard({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return <PropertyFormCard title={title} testID={testID} icon={/attachment|media/.test(testID ?? '') ? 'paperclip' : 'map-pin'}>{children}</PropertyFormCard>;
}

export function LocationAttachmentRow({ children }: { children: ReactNode }) {
  const { isRTL } = useI18n();
  return <View style={[styles.row, { direction: isRTL ? 'rtl' : 'ltr' }]}>{children}</View>;
}

export function LocationAttachmentButton({ label, icon, onPress, testID, disabled = false, busy = false, tile = false }: {
  label: string; icon: ActionIcon; onPress: () => void; testID: string; disabled?: boolean; busy?: boolean; tile?: boolean;
}) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();
  const foreground = tile ? colors.primary : colors.primaryForeground;
  return <TouchableOpacity onPress={onPress} disabled={disabled || busy} testID={testID}
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }}
    activeOpacity={0.8} style={[styles.action, tile ? styles.tile : styles.location, {
      backgroundColor: tile ? '#EFF6FF' : colors.primary, borderColor: colors.primary, opacity: disabled || busy ? 0.55 : 1,
      flexDirection: tile ? 'column' : isRTL ? 'row-reverse' : 'row',
    }]}>
    {busy ? <ActivityIndicator color={foreground} /> : <Feather name={icon} size={tile ? 30 : 22} color={foreground} />}
    <Text style={{ color: foreground, fontFamily: fonts.semiBold, fontSize: tile ? 13 : 14, textAlign: 'center', flexShrink: 1 }}>{label}</Text>
  </TouchableOpacity>;
}

export function AttachmentPrivacyNote() {
  const colors = useColors();
  const { fonts, isRTL, t } = useI18n();
  return <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, alignItems: 'flex-start' }}>
    <Feather name="lock" size={14} color={colors.mutedForeground} />
    <Text style={{ flex: 1, color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: 12, textAlign: isRTL ? 'right' : 'left' }}>{t('enrich.attachment_privacy')}</Text>
  </View>;
}

export const locationLinkInputStyle = { minHeight: 52, borderRadius: 12, paddingHorizontal: 12 };

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 14, marginVertical: 8 },
  row: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'stretch', gap: 10 },
  action: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 12 },
  location: { minHeight: 60 },
  tile: { minHeight: 88 },
});
