import { HomeQuickAdd } from '@/components/assistant/HomeQuickAdd';
import { homeQuickRoute } from '@/services/assistantHome';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Tabs } from 'expo-router';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { nextDesign as n } from '@/constants/nextDesign';
import { NavigationIcon, type NavigationDestination } from './NavigationIcon';

type Props = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];
const destinations: readonly (NavigationDestination | 'quickAdd')[] = ['properties', 'people', 'quickAdd', 'matching', 'index'];
/** Four equal real press targets. Keep navigation events/params and the hidden More route intact. */
export function RaisedTabBar({ state, descriptors, navigation }: Props) {
  const router = useRouter();
  const { isRTL, fonts, language } = useI18n(), colors = useColors(), insets = useScreenInsets();
  return <View accessibilityRole="tablist" testID="raised-tab-bar" style={[styles.bar, { backgroundColor: colors.card, paddingBottom: insets.bottom, paddingLeft: Math.max(insets.left, 8), paddingRight: Math.max(insets.right, 8) }]}>
    <View {...(Platform.OS === 'web' ? { dir: 'ltr' as const } : {})} style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      {destinations.map(destination => {
        if (destination === 'quickAdd') return <HomeQuickAdd key="quickAdd" compact label={language === 'ar' ? 'إضافة سريعة' : 'Quick add'} closeLabel={language === 'ar' ? 'إغلاق' : 'Close'} labels={language === 'ar' ? { person: 'شخص', property: 'عقار', import: 'استيراد', share: 'مشاركة', matching: 'مطابقة' } : { person: 'Person', property: 'Property', import: 'Import', share: 'Share', matching: 'Matching' }} onAction={action => { const href = homeQuickRoute(action); if (href) router.push(href as never); else router.navigate({ pathname: '/', params: { quickAction: action, quickActionKey: String(Date.now()) } } as never); }} />;

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
          <NavigationIcon destination={destination} selected={selected} size={30} />
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={1.3} style={[styles.label, { fontFamily: selected ? fonts.bold : fonts.medium, color: selected ? n.blue : n.muted, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{title}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  bar: { position: 'relative', zIndex: 100, paddingTop: 8, borderTopWidth: 1, borderTopColor: n.border },
  row: { direction: 'ltr', gap: 6, alignItems: 'stretch' },
  button: { flex: 1, minWidth: 0, minHeight: 68, paddingHorizontal: 3, paddingVertical: 7, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: n.border, backgroundColor: '#FFFFFF' },
  selected: { backgroundColor: n.soft, borderColor: n.blue },
  pressed: { backgroundColor: '#DFEAFA' },
  label: { fontSize: 12, lineHeight: 18, textAlign: 'center', flexShrink: 1 },
});
