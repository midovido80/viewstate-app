import { navigationButtonStyle, navigationButtonTextStyle } from '@/constants/navigation';
import { TouchableOpacity, Text, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'whatsapp' | 'navigation';
  size?: 'default' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
}

/** A stable native press target across enabled, disabled and busy states. */
export function Button({ onPress, title, variant = 'primary', size = 'default', disabled = false, loading = false, style, textStyle, testID }: ButtonProps) {
  const colors = useColors();
  const { fonts, t } = useI18n();
  const isNavigation = variant === 'navigation' || [t('capture.back'), t('studio.back'), t('detail.edit'), t('home.title')].includes(title);
  const foreground = isNavigation ? navigationButtonTextStyle.color
    : variant === 'primary' || variant === 'whatsapp' ? '#FFFFFF' : variant === 'outline' ? colors.primary : colors.foreground;
  const backgroundColor = isNavigation ? navigationButtonStyle.backgroundColor
    : variant === 'whatsapp' ? colors.whatsapp : variant === 'primary' ? colors.primary
      : variant === 'secondary' ? colors.secondary : colors.card;
  return <TouchableOpacity
    onPress={onPress}
    disabled={disabled || loading}
    testID={testID}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityState={{ disabled: disabled || loading, busy: loading }}
    style={[{ minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: variant === 'outline' ? colors.primary : backgroundColor, backgroundColor, opacity: disabled || loading ? 0.55 : 1 }, isNavigation && navigationButtonStyle, style]}
  >
    {loading ? <ActivityIndicator color={foreground} /> : null}
    <Text style={[{ color: foreground, fontFamily: fonts.semiBold, fontSize: size === 'large' ? 18 : 16, lineHeight: 23, textAlign: 'center', flexShrink: 1 }, textStyle]}>{title}</Text>
  </TouchableOpacity>;
}
