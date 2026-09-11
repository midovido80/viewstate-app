import React from 'react';
import { Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useI18n } from '@/contexts/I18nContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ClassicTabLayout() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const nativeTabBarBaseHeight = isIOS ? 52 : 58;
  const nativeBottomInset = Math.max(insets.bottom, 0);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.vapp47.brandPrimary,
        tabBarInactiveTintColor: colors.vapp47.textMuted,
        headerShown: false,
        sceneStyle: {
          overflow: 'hidden',
        },
        tabBarStyle: {
          backgroundColor: colors.vapp47.cardSurface,
          borderTopWidth: 1,
          borderTopColor: colors.vapp47.visualBorder,
          elevation: 0,
          position: 'relative',
          overflow: 'hidden',
          zIndex: 100,
          height: isWeb ? 82 : nativeTabBarBaseHeight + nativeBottomInset,
          paddingBottom: isWeb ? 8 : nativeBottomInset,
        },
        tabBarItemStyle: {
          paddingTop: 7,
          paddingBottom: isWeb ? 5 : 1,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('home.title'),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: t('people.title'),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person.2" tintColor={color} size={24} />
            ) : (
              <Feather name="users" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="matching"
        options={{
          title: t('matching.title'),
          tabBarIcon: ({ color }) => (
            <Feather name="target" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="brain"
        options={{
          title: t('brain.title'),
          tabBarIcon: ({ color }) => (
            <Feather name="message-circle" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return <ClassicTabLayout />;
}