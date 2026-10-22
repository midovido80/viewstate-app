import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/contexts/I18nContext';
import { PropertySpecIcon } from '@/components/PropertySpecIcon';
import { choiceTileWidth } from '@/services/choicePresentation';
import type { CompactPropertySpec } from '@/services/compactPropertyDetails';

export function CompactPropertySpecs({ specs }: { specs: readonly CompactPropertySpec[] }) {
  const { language, isRTL, fonts } = useI18n();
  const [width, setWidth] = useState<number>();
  if (!specs.length) return null;
  return <View style={styles.card} testID="property-compact-specifications">
    <Text style={{ color: '#AE313B', fontFamily: fonts.bold, fontSize: 16, paddingHorizontal: 12, paddingVertical: 10, textAlign: isRTL ? 'right' : 'left' }}>{language === 'ar' ? 'المواصفات' : 'Specifications'}</Text>
    <View onLayout={event => setWidth(choiceTileWidth(event.nativeEvent.layout.width, 3, 0))} style={{ flexDirection: 'row', flexWrap: 'wrap', direction: isRTL ? 'rtl' : 'ltr', alignItems: 'stretch' }}>
      {specs.map(spec => <View key={spec.fieldId} testID={`property-spec-${spec.fieldId}`} style={[styles.cell, { width: width ?? '33.333%' }]}>
        <View style={{ direction: 'ltr', flexDirection: isRTL ? 'row' : 'row-reverse', gap: 6, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <PropertySpecIcon name={spec.icon} size={23} color="#173F78" />
          <Text style={{ flexShrink: 1, minWidth: 0, color: '#173F78', fontFamily: fonts.bold, fontSize: /^\d/.test(spec.value) ? 19 : 14, lineHeight: 23, textAlign: 'center' }}>{spec.value}</Text>
        </View>
        <Text style={{ color: '#173F78', fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, textAlign: 'center', width: '100%' }}>{spec.label}</Text>
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  cell: { backgroundColor: '#F1F7FD', minHeight: 66, paddingHorizontal: 5, paddingVertical: 8, gap: 4, justifyContent: 'center', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#DFE8F2', flexGrow: 0, flexShrink: 0 },
});
