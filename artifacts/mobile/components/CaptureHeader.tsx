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

const CAPTURE_STEPS = [
  'capture.progress.transaction',
  'capture.progress.type',
  'capture.progress.price',
  'capture.progress.area',
  'capture.progress.review',
] as const;

export function CaptureHeader({ onBack, onCancel, title, step, totalSteps }: CaptureHeaderProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { isRTL, t, fonts } = useI18n();
  const { resetDraft } = useCapture();
  const [cancelVisible, setCancelVisible] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const currentStep = step;
  const showProgress = currentStep !== undefined;
  const progressTotal = totalSteps === CAPTURE_STEPS.length ? totalSteps : CAPTURE_STEPS.length;
  const showBack = Boolean(onBack || title || (currentStep && currentStep > 1));

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
      <View style={[styles.container, { borderBottomColor: colors.border }]}>
        <View style={[styles.controls, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
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
            {!showProgress && title ? (
              <Text
                numberOfLines={1}
                style={[styles.title, { color: colors.foreground, fontFamily: fonts.semiBold }]}
              >
                {title}
              </Text>
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

        {showProgress && currentStep ? (
          <View
            style={[styles.progressContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            accessible
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: progressTotal, now: currentStep }}
          >
            {CAPTURE_STEPS.map((translationKey, index) => {
              const chipStep = index + 1;
              const isCompleted = chipStep < currentStep;
              const isCurrent = chipStep === currentStep;
              const isFuture = chipStep > currentStep;

              return (
                <View
                  key={translationKey}
                  style={[
                    styles.progressChip,
                    {
                      backgroundColor: isCompleted
                        ? colors.primary
                        : isCurrent
                          ? colors.secondary
                          : colors.muted,
                      borderColor: isCurrent ? colors.turquoise : isCompleted ? colors.primary : colors.border,
                      opacity: isFuture ? 0.58 : 1,
                    },
                  ]}
                  accessible
                  accessibilityLabel={t(translationKey)}
                  accessibilityState={{ disabled: isFuture, selected: isCurrent }}
                >
                  {isCompleted ? (
                    <Feather name="check" size={10} color={colors.primaryForeground} />
                  ) : null}
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={[
                      styles.progressLabel,
                      {
                        color: isCompleted
                          ? colors.primaryForeground
                          : isCurrent
                            ? colors.primary
                            : colors.mutedForeground,
                        fontFamily: isCurrent || isCompleted ? fonts.semiBold : fonts.medium,
                      },
                    ]}
                  >
                    {t(translationKey)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
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
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  controls: {
    minHeight: 56,
    alignItems: 'center',
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
    gap: 5,
    alignItems: 'center',
    width: '100%',
  },
  progressChip: {
    flex: 1,
    minWidth: 0,
    height: 26,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderRadius: 7,
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLabel: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
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
