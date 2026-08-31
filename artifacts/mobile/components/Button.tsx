import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'whatsapp';
  size?: 'default' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
}

export function Button({ 
  onPress, 
  title, 
  variant = 'primary', 
  size = 'default',
  disabled = false, 
  loading = false,
  style,
  textStyle,
  testID
}: ButtonProps) {
  const colors = useColors();
  const { fonts } = useI18n();

  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';
  const isWhatsApp = variant === 'whatsapp';
  
  const baseStyle: ViewStyle = {
    borderRadius: colors.inputRadius,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56, // Enforced 56px minimum for primary action
    paddingHorizontal: 24,
    flexDirection: 'row',
    opacity: disabled ? 0.6 : 1,
    ...(isOutline ? { borderWidth: 1, borderColor: colors.border } : {}),
    ...(variant === 'secondary' ? { backgroundColor: colors.secondary } : {}),
    ...(isWhatsApp ? { backgroundColor: colors.whatsapp } : {}),
  };

  const textColors = {
    primary: colors.primaryForeground,
    secondary: colors.secondaryForeground,
    outline: colors.foreground,
    whatsapp: colors.whatsappForeground,
  };

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={textColors[variant]} style={{ marginRight: 8 }} />
      ) : null}
      <Text style={[
        {
          color: textColors[variant],
          fontFamily: fonts.semiBold,
          fontSize: size === 'large' ? 18 : 16,
        },
        textStyle
      ]}>
        {title}
      </Text>
    </>
  );

  if (isPrimary && !disabled) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={loading}
        style={style}
        activeOpacity={0.8}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: loading, busy: loading }}
      >
        <LinearGradient
          colors={[colors.primary, colors.turquoise]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={baseStyle}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity 
      onPress={onPress} 
      disabled={disabled || loading} 
      style={[
        baseStyle, 
        isPrimary && { backgroundColor: colors.primary }, // fallback if disabled
        style
      ]} 
      activeOpacity={0.8}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {content}
    </TouchableOpacity>
  );
}
