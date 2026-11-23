import { PropertyPageSection, type PropertyPage } from '@/components/PropertyWizard';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/contexts/I18nContext';

export const propertyFormInputStyle = {
  minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14,
  paddingVertical: 8, backgroundColor: '#FFFFFF', borderColor: '#DFE5EF',
  color: '#18355C', fontSize: 16,
} as const;

/** Presentation only: callers retain field applicability, validation and persistence. */
export function PropertyFormCard({ title, children, testID, icon = 'file-text', page = 0 }: {
  title: string; children: ReactNode; testID?: string; icon?: keyof typeof Feather.glyphMap; page?: PropertyPage;
}) {
  const { isRTL, fonts } = useI18n();
  return <PropertyPageSection page={page}><View testID={testID} style={styles.card}>
    <View style={{ direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>

      <Text accessibilityRole="header" style={{ flex: 1, color: '#18355C', fontFamily: fonts.bold, fontSize: 18, lineHeight: 26, textAlign: isRTL ? 'right' : 'left' }}>{title}</Text>
    </View>
    {children}
  </View></PropertyPageSection>;
}

/** Area comes first in reading order. Keep both columns usable with enlarged system fonts. */
export function PropertyAreaBlockRow({ area, block }: { area: ReactNode; block?: ReactNode }) {
  const { isRTL } = useI18n();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.4;
  return <View testID="property-area-block-row" style={{ direction: 'ltr', flexDirection: stacked ? 'column' : isRTL ? 'row-reverse' : 'row', alignItems: 'stretch', gap: 10 }}>
    <View style={{ flex: stacked ? undefined : 1, minWidth: 0, gap: 6 }}>{area}</View>
    {block ? <View style={{ flex: stacked ? undefined : 1, minWidth: 0, gap: 6 }}>{block}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CFDAEE', borderRadius: 16, padding: 16, gap: 16, minWidth: 0 },
});
