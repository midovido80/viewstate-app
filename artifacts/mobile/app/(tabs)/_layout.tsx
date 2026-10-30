import React from 'react';
import { useColors } from '@/hooks/useColors';
import { Tabs } from 'expo-router';
import { RaisedTabBar } from '@/components/navigation/RaisedTabBar';
import { useI18n } from '@/contexts/I18nContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';

function ClassicTabLayout() {
  const colors = useColors();
  const { t } = useI18n();
  const insets = useScreenInsets();

  return (
    <Tabs
      tabBar={props => <RaisedTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        sceneStyle: {
          overflow: 'hidden',
        },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 12,
          position: 'relative',
          overflow: 'hidden',
          zIndex: 100,
          height: 80 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarItemStyle: {
          paddingTop: 6,
          paddingBottom: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('home.title'),
        }}
      />
      <Tabs.Screen
        name="properties"
        options={{
          title: t('properties.title'),
        }}
      />
      <Tabs.Screen
        name="matching"
        options={{
          title: t('matching.title'),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: t('people.title'),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('more.title'),
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return <ClassicTabLayout />;
}
