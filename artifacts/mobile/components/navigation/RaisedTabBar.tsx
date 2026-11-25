import { Text } from "@/components/AppText";
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { Tabs } from 'expo-router';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { nextDesign as n } from '@/constants/nextDesign';
import { NavigationIcon, type NavigationDestination } from './NavigationIcon';

type Props = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];
const destinations: readonly NavigationDestination[] = [
  'index',
  'properties',
  'circle',
  'matching',
  'people',
];
export function RaisedTabBar({ state, descriptors, navigation }: Props) {
  const { isRTL, fonts } = useI18n(),
    colors = useColors(),
    insets = useScreenInsets();
  return (
    <View
      accessibilityRole="tablist"
      testID="raised-tab-bar"
      style={[
        styles.bar,
        {
          backgroundColor: colors.card,
          paddingBottom: insets.bottom,
          paddingLeft: Math.max(insets.left, 8),
          paddingRight: Math.max(insets.right, 8),
        },
      ]}
    >
      <View
        {...(Platform.OS === 'web' ? { dir: 'ltr' as const } : {})}
        style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
      >
        {destinations.map((destination) => {
          const route = state.routes.find((item) => item.name === destination);
          if (!route) return null;
          const { options } = descriptors[route.key];
          const selected = state.routes[state.index].key === route.key;
          const title = options.title ?? destination;
          return (
            <Pressable
              key={route.key}
              testID={`nav-${destination}`}
              accessibilityRole="tab"
              aria-selected={selected}
              accessibilityState={{ selected }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? title}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!selected && !event.defaultPrevented)
                  navigation.navigate(route.name, route.params);
              }}
              onLongPress={() =>
                navigation.emit({ type: 'tabLongPress', target: route.key })
              }
              style={({ pressed }) => [
                styles.button,
                selected && styles.selected,
                pressed && styles.pressed,
              ]}
            >
              <NavigationIcon
                destination={destination}
                selected={selected}
                size={30}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                maxFontSizeMultiplier={1.3}
                style={[
                  styles.label,
                  {
                    fontFamily: selected ? fonts.bold : fonts.medium,
                    color: selected ? n.blue : n.muted,
                    writingDirection: isRTL ? 'rtl' : 'ltr',
                  },
                ]}
              >
                {title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    position: 'relative',
    zIndex: 100,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: n.border,
  },
  row: { direction: 'ltr', gap: 6, alignItems: 'stretch' },
  button: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    paddingHorizontal: 3,
    paddingVertical: 7,
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.border,
    backgroundColor: '#FFFFFF',
  },
  selected: { backgroundColor: n.soft, borderColor: n.blue },
  pressed: { backgroundColor: '#DFEAFA' },
  label: { fontSize: 12, lineHeight: 18, textAlign: 'center', flexShrink: 1 },
});
