import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/contexts/I18nContext';
import colors from '@/constants/colors';

export type StartupRecoveryStatus = 'error' | 'retrying';

export function StartupRecoveryScreen({
  status,
  onRetry,
}: {
  status: StartupRecoveryStatus;
  onRetry: () => void;
}) {
  const { t, isRTL, fonts } = useI18n();
  const insets = useSafeAreaInsets();
  const retrying = status === 'retrying';

  return (
    <View
      testID="startup-recovery-screen"
      style={[
        styles.container,
        {
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          direction: isRTL ? 'rtl' : 'ltr',
        },
      ]}
    >
      <View style={styles.content}>
        <Text
          style={[
            styles.title,
            { color: colors.light.foreground, fontFamily: fonts.bold },
          ]}
        >
          {t('startup.title')}
        </Text>
        <Text
          style={[
            styles.message,
            { color: colors.light.mutedForeground, fontFamily: fonts.regular },
          ]}
        >
          {t(retrying ? 'startup.retrying_message' : 'startup.message')}
        </Text>
        <Text
          testID="startup-safe-diagnostic"
          style={[
            styles.diagnostic,
            { color: colors.light.mutedForeground, fontFamily: fonts.regular },
          ]}
        >
          {t('startup.diagnostic')}
        </Text>
        <Pressable
          testID="startup-retry"
          accessibilityRole="button"
          accessibilityLabel={t('startup.retry')}
          accessibilityState={{ disabled: retrying }}
          disabled={retrying}
          onPress={onRetry}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.light.primary,
              opacity: retrying ? 0.6 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {retrying ? <ActivityIndicator color={colors.light.primaryForeground} /> : null}
          <Text
            style={[
              styles.buttonText,
              { color: colors.light.primaryForeground, fontFamily: fonts.medium },
            ]}
          >
            {t(retrying ? 'startup.retrying' : 'startup.retry')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  title: {
    fontSize: 26,
    lineHeight: 36,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    lineHeight: 25,
    textAlign: 'center',
  },
  diagnostic: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    minWidth: 180,
    minHeight: 50,
    paddingHorizontal: 24,
    borderRadius: colors.inputRadius,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  buttonText: {
    fontSize: 16,
  },
});