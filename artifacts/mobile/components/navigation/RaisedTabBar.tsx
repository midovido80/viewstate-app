import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Tabs } from 'expo-router';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { NavigationIcon, type NavigationDestination } from './NavigationIcon';

type Props = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];
const destinations: readonly NavigationDestination[] = ['index', 'matching', 'people', 'properties'];
/** Four equal real press targets. Keep navigation events/params and the hidden More route intact. */
export function RaisedTabBar({ state, descriptors, navigation }: Props) {
  const { isRTL, fonts } = useI18n(), colors = useColors(), insets = useScreenInsets();
  return <View accessibilityRole="tablist" testID="raised-tab-bar" style={[styles.bar, { backgroundColor: colors.card, paddingBottom: insets.bottom, paddingLeft: Math.max(insets.left, 8), paddingRight: Math.max(insets.right, 8) }]}>
    <View {...(Platform.OS === 'web' ? { dir: 'ltr' as const } : {})} style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      {destinations.map(destination => {
        const route = state.routes.find(item => item.name === destination);
        if (!route) return null;
        const { options } = descriptors[route.key];
        const selected = state.routes[state.index].key === route.key;
        const title = options.title ?? destination;
        return <Pressable key={route.key} testID={`nav-${destination}`} accessibilityRole="tab" aria-selected={selected} accessibilityState={{ selected }} accessibilityLabel={options.tabBarAccessibilityLabel ?? title}
          onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }}
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          style={({ pressed }) => [styles.button, selected && styles.selected, pressed && styles.pressed]}>
          <NavigationIcon destination={destination} selected={selected} />
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={1.3} style={[styles.label, { fontFamily: selected ? fonts.bold : fonts.medium, color: selected ? colors.primary : colors.accent, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{title}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  bar: { position: 'relative', zIndex: 100, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E1E7F0' },
  row: { direction: 'ltr', gap: 6, alignItems: 'stretch' },
  button: { flex: 1, minWidth: 0, minHeight: 72, paddingHorizontal: 4, paddingVertical: 7, gap: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderBottomWidth: 3, borderColor: '#D8E1EF', shadowColor: '#173F78', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 3 },
  selected: { backgroundColor: '#EAF2FF', borderColor: '#9AB6FF' },
  pressed: { transform: [{ translateY: 1 }], shadowOpacity: 0, elevation: 0, backgroundColor: '#DFEAFA' },
  label: { fontSize: 12, lineHeight: 18, textAlign: 'center', flexShrink: 1 },
});
