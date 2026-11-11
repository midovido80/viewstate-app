import { IncomingImportBanner } from '@/components/IncomingImportBanner';
import { NextExperienceProvider } from '@/contexts/NextExperienceContext';
import { AppChrome } from '@/components/AppChrome';
import { MatchNotificationsProvider } from '@/contexts/MatchNotificationsContext';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
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
import { useUserData } from '@/contexts/UserDataContext';
import { listenForCirclePush } from '@/services/circlePush';
import { RealAccountGate, useRealAccount } from '@/contexts/RealAccountContext';
import { Stack, useRootNavigationState, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

import {
  type LocalStoreIntegrityStatus,
} from '@/services/persistence';
import { I18nProvider, useI18n } from '@/contexts/I18nContext';
import { AccountFoundationProvider } from '@/contexts/AccountFoundationContext';
import { CaptureProvider } from '@/contexts/CaptureContext';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import colors from '@/constants/colors';
import { StartupRecoveryScreen } from '@/components/StartupRecoveryScreen';


function RootLayoutNav({
  integrityStatus,
}: {
  integrityStatus: LocalStoreIntegrityStatus;
}) {
  const { isRTL, t, fonts } = useI18n();
  const account = useRealAccount();
  const owner = account?.profile.user_id;
  const router = useRouter();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  useEffect(() => {
    if (!owner || !navigationReady) return;
    let cancelled = false;
    let remove: (() => void) | undefined;
    void listenForCirclePush(owner, identifier => {
      if (!cancelled) router.push({ pathname: '/matching', params: { circlePush: identifier } });
    }).then(dispose => {
      if (cancelled) dispose?.();
      else remove = dispose;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [navigationReady, owner, router]);
  // Expo Router restores the requested route. Auth/onboarding remain owned by the root gate.
  // Never replace a restored property URL merely because its account is ready.
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
      <IncomingImportBanner />
      <NextExperienceProvider><AppChrome><Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="next-recent" options={{ headerShown: false }} />
        <Stack.Screen name="next-guide" options={{ headerShown: false }} />
        <Stack.Screen name="intake" options={{ headerShown: false }} />
        <Stack.Screen name="intake-review/[importId]" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ headerShown: false }} />
        <Stack.Screen name="capture" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="person/new" options={{ headerShown: false }} />
        <Stack.Screen name="person/[personId]" options={{ headerShown: false }} />
        <Stack.Screen name="requirement/[requirementId]" options={{ headerShown: false }} />
        <Stack.Screen name="requirement/view/[requirementId]" options={{ headerShown: false }} />
        <Stack.Screen name="property/[propertyCoreId]" options={{ headerShown: false }} />
        <Stack.Screen name="property/[propertyCoreId]/edit" options={{ headerShown: false }} />
        <Stack.Screen name="property/[propertyCoreId]/enrich" options={{ headerShown: false }} />
        <Stack.Screen name="property/[propertyCoreId]/share" options={{ headerShown: false }} />
      </Stack></AppChrome></NextExperienceProvider>
    </View>
  );
}

function AppLoadingScreen() {
  return <View testID="app-startup-loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.light.background }} accessibilityLabel="Loading / جارٍ التحميل" accessibilityState={{ busy: true }}><ActivityIndicator size="large" color={colors.light.primary} /></View>;
}

type InitializationState =
  | { status: 'initializing' }
  | { status: 'retrying' }
  | { status: 'error' }
  | { status: 'ready'; integrityStatus: LocalStoreIntegrityStatus };

function ApplicationRoot({ fontsLoaded, fontError }: { fontsLoaded: boolean; fontError: Error | null }) {
  const { store } = useUserData();
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => () => queryClient.clear(), [queryClient]);

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
  }, [store]);

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
  ) return <AppLoadingScreen />;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {initialization.status === 'error' || initialization.status === 'retrying' ? (
          <StartupRecoveryScreen
            status={initialization.status}
            onRetry={() => initialize(true)}
          />
      ) : (
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AccountFoundationProvider>
                <CaptureProvider><MatchNotificationsProvider>
                  <StatusBar style="light" backgroundColor={colors.light.primary} />
                  <RootLayoutNav integrityStatus={initialization.integrityStatus} />
                </MatchNotificationsProvider></CaptureProvider>
                </AccountFoundationProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      )}
    </SafeAreaProvider>
  );
}

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

  // Load the approved fonts before the auth gate, including first launch and Guest setup.
  if (!fontsLoaded && !fontError) return <AppLoadingScreen />;
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><I18nProvider><RealAccountGate><ApplicationRoot fontsLoaded={fontsLoaded} fontError={fontError} /></RealAccountGate></I18nProvider></SafeAreaProvider>;
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
