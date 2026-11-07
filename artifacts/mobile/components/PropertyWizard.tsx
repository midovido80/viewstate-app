import { NextFieldPair } from '@/components/next/NextSurfaces';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { createContext, useContext } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
export type PropertyPage = 0 | 1 | 2;
export const PropertyPageContext = createContext<PropertyPage | null>(null);
export const KitchenCountContext = createContext<React.ReactNode>(null);
export function BathroomKitchenRow({ children }: { children: React.ReactNode }) {
  const count = useContext(KitchenCountContext);
  return count ? <NextFieldPair first={children} second={count} /> : <>{children}</>;
}
export const KitchenSlotContext = createContext<React.ReactNode>(null);
/** Keep controls mounted: page navigation must not reset pending numeric input or media state. */
export function PropertyPageSection({
  page,
  children,
}: {
  page: PropertyPage;
  children: React.ReactNode;
}) {
  const current = useContext(PropertyPageContext);
  return (
    <View
      style={
        current !== null && current !== page ? { display: 'none' } : { gap: 10 }
      }
      accessibilityElementsHidden={current !== null && current !== page}
      importantForAccessibility={
        current !== null && current !== page ? 'no-hide-descendants' : 'auto'
      }
    >
      {children}
    </View>
  );
}
export function KitchenSlot() {
  return <>{useContext(KitchenSlotContext)}</>;
}
export function PropertyWizardFooter({
  page,
  previous,
  next,
  busy = false,
}: {
  page: PropertyPage;
  previous: () => void;
  next: () => void;
  busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { language, fonts } = useI18n(),
    colors = useColors(),
    ar = language === 'ar';
  return (
    <View
      testID="property-wizard-footer"
      style={{
        backgroundColor: colors.card,
        padding: 12,
        paddingBottom: Math.max(insets.bottom, 12),
        flexDirection: ar ? 'row-reverse' : 'row',
        gap: 10,
      }}
    >
      {[
        {
          id: 'previous',
          label: ar ? 'السابق' : 'Previous',
          action: previous,
          color: colors.accent,
        },
        {
          id: 'next',
          label:
            page === 2
              ? ar
                ? 'حفظ العقار'
                : 'Save property'
              : ar
                ? 'التالي'
                : 'Next',
          action: next,
          color: colors.primary,
        },
      ].map((item) => (
        <Pressable
          key={item.id}
          testID={`property-wizard-${item.id}`}
          accessibilityRole="button"
          disabled={busy}
          accessibilityState={{ disabled: busy, busy }}
          onPress={() => { Keyboard.dismiss(); item.action(); }}
          style={{
            flex: 1,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            backgroundColor: item.color,
            opacity: busy ? 0.55 : 1,
          }}
        >
          <Text
            style={{ fontFamily: fonts.bold, color: 'white', fontSize: 16 }}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function PropertyWizardProgress({ page }: { page: PropertyPage }) {
  const { language, fonts } = useI18n(),
    ar = language === 'ar';
  return (
    <View
      style={{
        paddingHorizontal: 18,
        paddingVertical: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
      }}
    >
      <Text style={{ fontFamily: fonts.semiBold, color: '#203568' }}>
        {page + 1} / 3
      </Text>
      <Text style={{ fontFamily: fonts.semiBold, color: '#203568' }}>
        {
          (ar
            ? ['تفاصيل العقار', 'الخدمات', 'الموقع والمرفقات']
            : ['Property details', 'Services', 'Location & attachments'])[page]
        }
      </Text>
    </View>
  );
}
