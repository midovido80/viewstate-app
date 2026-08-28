import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { useCapture } from '@/contexts/CaptureContext';

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
  const { resetDraft } = useCapture();
  const [cancelVisible, setCancelVisible] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const showBack = Boolean(onBack || title || (step && step > 1));

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }

    setCancelVisible(true);
  };

  const handleBack = () => {
    if (onBack) onBack();
    else router.back();
  };

  const handleKeepDraftAndExit = () => {
    setCancelVisible(false);
    router.dismissAll();
  };

  const handleDiscard = async () => {
    if (discarding) return;

    setDiscarding(true);
    try {
      await resetDraft();
      setCancelVisible(false);
      router.dismissAll();
    } catch (error) {
      console.error('Failed to discard draft:', error);
      Alert.alert(t('errors.draft_read_title'), t('errors.draft_reset'));
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View style={[styles.container, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.side}>
          {showBack && (
            <TouchableOpacity
              onPress={handleBack}
              style={[styles.iconButton, isRTL ? styles.iconButtonRTL : styles.iconButtonLTR]}
              testID="capture-back"
              accessibilityRole="button"
              accessibilityLabel={t('capture.back')}
            >
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
          <TouchableOpacity
            onPress={handleCancel}
            style={styles.cancelBtn}
            testID="capture-cancel"
            accessibilityRole="button"
            accessibilityLabel={t('capture.cancel')}
          >
            <Text style={[styles.cancelText, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>{t('capture.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={cancelVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.cardRadius,
              },
            ]}
            testID="capture-cancel-dialog"
            accessibilityRole="alert"
          >
            <Text
              style={[
                styles.modalTitle,
                {
                  color: colors.foreground,
                  fontFamily: fonts.bold,
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
            >
              {t('capture.discard_title')}
            </Text>
            <Text
              style={[
                styles.modalMessage,
                {
                  color: colors.mutedForeground,
                  fontFamily: fonts.regular,
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
            >
              {t('capture.discard_message')}
            </Text>

            <TouchableOpacity
              onPress={() => setCancelVisible(false)}
              style={[styles.modalAction, { borderColor: colors.border }]}
              testID="capture-keep-editing"
              accessibilityRole="button"
              accessibilityLabel={t('capture.keep_editing')}
            >
              <Text style={[styles.modalActionText, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
                {t('capture.keep_editing')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleKeepDraftAndExit}
              style={[styles.modalAction, { borderColor: colors.border }]}
              testID="capture-keep-draft-exit"
              accessibilityRole="button"
              accessibilityLabel={t('capture.keep_draft_exit')}
            >
              <Text style={[styles.modalActionText, { color: colors.primary, fontFamily: fonts.semiBold }]}>
                {t('capture.keep_draft_exit')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDiscard}
              disabled={discarding}
              style={[styles.modalAction, { borderColor: colors.border, opacity: discarding ? 0.6 : 1 }]}
              testID="capture-discard-draft"
              accessibilityRole="button"
              accessibilityLabel={t('capture.discard')}
              accessibilityState={{ disabled: discarding, busy: discarding }}
            >
              <Text style={[styles.modalActionText, { color: colors.destructive, fontFamily: fonts.semiBold }]}>
                {t('capture.discard')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 29, 31, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  modalAction: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingHorizontal: 12,
  },
  modalActionText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
