import { CANCEL_ACTION_COLOR, isCancelActionLabel } from '@/constants/cancelAction';
import type { ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

export const approvedNavigationStyle = {
  width: 84, height: 48, minHeight: 48, minWidth: 84, flexShrink: 0,
  paddingHorizontal: 8, paddingVertical: 0, borderRadius: 12,
  backgroundColor: '#173F78', borderWidth: 1, borderColor: '#173F78',
  alignItems: 'center', justifyContent: 'center',
} as const;
export const approvedActionStyle = {
  flex: 1, minWidth: 0, height: 56, borderRadius: 12, borderWidth: 1,
  paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', gap: 8,
} as const;
export const approvedActionRowStyle = { flexDirection: 'row', gap: 12, alignItems: 'stretch' } as const;

export function ApprovedAction({ title, onPress, variant = 'primary', disabled = false, loading = false, testID, icon, style }: {
  title: string; onPress: () => void; variant?: 'primary' | 'outline' | 'green' | 'danger';
  disabled?: boolean; loading?: boolean; testID?: string; style?: ViewStyle;
  icon?: 'share-2' | 'edit-2' | 'phone' | 'message-circle' | 'plus' | 'link' | 'repeat' | 'search' | 'file-text' | 'trash-2';
}) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();
  const isCancel = isCancelActionLabel(title);
  const foreground = isCancel ? CANCEL_ACTION_COLOR : variant === 'outline' ? colors.primary : variant === 'danger' ? colors.destructive : '#FFFFFF';
  return <TouchableOpacity onPress={onPress} disabled={disabled || loading} testID={testID} activeOpacity={0.8}
    accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    style={[approvedActionStyle, { backgroundColor: isCancel ? colors.card : variant === 'green' ? colors.whatsapp : variant === 'primary' ? colors.primary : colors.card, borderColor: variant === 'danger' ? colors.destructive : variant === 'green' ? colors.whatsapp : colors.primary, opacity: disabled || loading ? 0.55 : 1, flexDirection: isRTL ? 'row-reverse' : 'row' }, style]}>
    {loading ? <ActivityIndicator color={foreground} /> : icon ? <Feather name={icon} size={20} color={foreground} /> : null}
    <Text numberOfLines={2} style={{ flexShrink: 1, color: foreground, fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 20, textAlign: 'center' }}>{title}</Text>
  </TouchableOpacity>;
}

export function ApprovedActionRow({ children }: { children: ReactNode }) {
  const { isRTL } = useI18n();
  return <View style={[approvedActionRowStyle, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>{children}</View>;
}
