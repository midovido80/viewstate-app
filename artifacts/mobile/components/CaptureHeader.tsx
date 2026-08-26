import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

interface CaptureHeaderProps {
  onBack?: () => void;
  onCancel?: () => void;
  title?: string;
  step?: number;
  totalSteps?: number;
}

export function CaptureHeader({ onBack, onCancel, title, step, totalSteps }: CaptureHeaderProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { isRTL, t, fonts } = useI18n();
  const showBack = Boolean(onBack || title || (step && step > 1));

  const handleCancel = () => {
    if (onCancel) onCancel();
    else router.dismissAll();
  };

  const handleBack = () => {
    if (onBack) onBack();
    else router.back();
  };

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View style={[styles.container, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.side}>
          {showBack && (
            <TouchableOpacity onPress={handleBack} style={[styles.iconButton, isRTL ? styles.iconButtonRTL : styles.iconButtonLTR]}>
              <Feather name={isRTL ? "chevron-right" : "chevron-left"} size={28} color={colors.foreground} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.center}>
          {title ? (
            <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{title}</Text>
          ) : step && totalSteps ? (
            <View style={[styles.progressContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <View 
                  key={i} 
                  style={[
                    styles.progressDot, 
                    { 
                      backgroundColor: i < step ? colors.primary : colors.muted,
                      width: i < step ? 24 : 8 
                    }
                  ]} 
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.side, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>{t('capture.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  side: {
    flex: 1,
    justifyContent: 'center',
  },
  center: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonLTR: {
    marginLeft: -12,
  },
  iconButtonRTL: {
    marginRight: -12,
  },
  title: {
    fontSize: 18,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingLeft: 12,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  progressDot: {
    height: 4,
    borderRadius: 2,
  },
});
