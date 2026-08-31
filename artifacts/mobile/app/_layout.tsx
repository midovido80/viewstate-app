import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts as useInterFonts,
} from '@expo-google-fonts/inter';
import {
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
  useFonts as useTajawalFonts,
} from '@expo-google-fonts/tajawal';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

import {
  store,
  type LocalStoreIntegrityStatus,
} from '@/services/persistence';
import { I18nProvider, useI18n } from '@/contexts/I18nContext';
import { CaptureProvider } from '@/contexts/CaptureContext';
import { StyleSheet, Text, View } from 'react-native';
import colors from '@/constants/colors';
import { StartupRecoveryScreen } from '@/components/StartupRecoveryScreen';

const queryClient = new QueryClient();

function RootLayoutNav({
  integrityStatus,
}: {
  integrityStatus: LocalStoreIntegrityStatus;
}) {
  const { isRTL, t, fonts } = useI18n();
  return (
    <View style={{ flex: 1, direction: isRTL ? 'rtl' : 'ltr' }}>
      {integrityStatus.hasUnreadableRecords ? (
        <View
          testID="local-data-integrity-warning"
          accessibilityRole="alert"
          style={styles.integrityWarning}
        >
          <Text
            style={[
              styles.integrityTitle,
              { color: colors.light.foreground, fontFamily: fonts.bold },
            ]}
          >
            {t('integrity.title')}
          </Text>
          <Text
            style={[
              styles.integrityMessage,
              { color: colors.light.foreground, fontFamily: fonts.regular },
            ]}
          >
            {t('integrity.message')}
          </Text>
          <Text
            testID="local-data-integrity-count"
            style={[
              styles.integrityCount,
              { color: colors.light.foreground, fontFamily: fonts.medium },
            ]}
          >
            {t('integrity.count')} {integrityStatus.unreadableRecords.length}
          </Text>
        </View>
      ) : null}
      <Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="capture" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="person/new" options={{ headerShown: false }} />
        <Stack.Screen name="person/[personId]" options={{ headerShown: false }} />
        <Stack.Screen name="property/[propertyCoreId]" options={{ headerShown: false }} />
        <Stack.Screen name="property/[propertyCoreId]/enrich" options={{ headerShown: false }} />
        <Stack.Screen name="property/[propertyCoreId]/share" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}

type InitializationState =
  | { status: 'initializing' }
  | { status: 'retrying' }
  | { status: 'error' }
  | { status: 'ready'; integrityStatus: LocalStoreIntegrityStatus };

export default function RootLayout() {
  const [interLoaded, interError] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [tajawalLoaded, tajawalError] = useTajawalFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
  });

  const fontsLoaded = interLoaded && tajawalLoaded;
  const fontError = interError || tajawalError;

  const [initialization, setInitialization] = useState<InitializationState>({
    status: 'initializing',
  });
  const initializationAttempt = useRef<Promise<void> | null>(null);

  const initialize = useCallback((retry: boolean) => {
    if (initializationAttempt.current) return;
    setInitialization({ status: retry ? 'retrying' : 'initializing' });

    const attempt = store.init().then(
      () => {
        setInitialization({
          status: 'ready',
          integrityStatus: store.getIntegrityStatus(),
        });
      },
      () => {
        setInitialization({ status: 'error' });
      },
    );
    initializationAttempt.current = attempt;
    attempt.then(() => {
      if (initializationAttempt.current === attempt) {
        initializationAttempt.current = null;
      }
    });
  }, []);

  useEffect(() => {
    initialize(false);
  }, [initialize]);

  useEffect(() => {
    if (
      initialization.status === 'error'
      || (
        initialization.status === 'ready'
        && (fontsLoaded || fontError)
      )
    ) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError, initialization.status]);

  if (
    initialization.status === 'initializing'
    || (
      initialization.status === 'ready'
      && !fontsLoaded
      && !fontError
    )
  ) return null;

  return (
    <SafeAreaProvider>
      {initialization.status === 'error' || initialization.status === 'retrying' ? (
        <I18nProvider>
          <StartupRecoveryScreen
            status={initialization.status}
            onRetry={() => initialize(true)}
          />
        </I18nProvider>
      ) : (
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <I18nProvider>
                <CaptureProvider>
                  <StatusBar style="dark" backgroundColor={colors.light.background} />
                  <RootLayoutNav integrityStatus={initialization.integrityStatus} />
                </CaptureProvider>
                </I18nProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  integrityWarning: {
    backgroundColor: colors.light.card,
    borderBottomColor: colors.light.warning,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 3,
  },
  integrityTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  integrityMessage: {
    fontSize: 13,
    lineHeight: 19,
  },
  integrityCount: {
    fontSize: 12,
    lineHeight: 18,
  },
});
