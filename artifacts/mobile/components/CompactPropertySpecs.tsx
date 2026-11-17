import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/contexts/I18nContext';
import { PropertySpecIcon } from '@/components/PropertySpecIcon';
import { choiceTileWidth } from '@/services/choicePresentation';
import { compactSpecificationLayout, type CompactPropertySpec } from '@/services/compactPropertyDetails';

export function CompactPropertySpecs({ specs, propertyType }: { specs: readonly CompactPropertySpec[]; propertyType?: string }) {
  const { language, isRTL, fonts } = useI18n();
  const [containerWidth, setContainerWidth] = useState<number>();
  const {columns, area, cells} = compactSpecificationLayout(specs, propertyType);
  const width = containerWidth === undefined ? undefined : choiceTileWidth(containerWidth, columns, 0);
  if (!specs.length) return null;
  return <View style={styles.card} testID="property-compact-specifications">
    <Text style={{ color: '#203568', fontFamily: fonts.bold, fontSize: 16, paddingHorizontal: 12, paddingVertical: 10, textAlign: isRTL ? 'right' : 'left' }}>{language === 'ar' ? 'المواصفات' : 'Specifications'}</Text>
    {area ? <View style={{alignItems: 'center', paddingTop: 8, paddingBottom: 12}} testID="property-centered-area">
      <View testID={`property-spec-${area.fieldId}`} style={[styles.cell, {width: '64%', maxWidth: 320, borderRadius: 10, minHeight: 72}]}>
        <View style={{flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8}}>
          <PropertySpecIcon name={area.icon} size={23} color="#203568" />
          <Text style={{color: '#203568', fontFamily: fonts.bold, fontSize: 19, textAlign: 'center'}}>{area.value}</Text>
        </View>
        <Text style={{color: '#203568', fontFamily: fonts.medium, fontSize: 12, textAlign: 'center'}}>{area.label}</Text>
      </View>
    </View> : null}
    <View onLayout={event => setContainerWidth(event.nativeEvent.layout.width)} style={{ flexDirection: columns === 2 && isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', direction: columns === 2 ? 'ltr' : isRTL ? 'rtl' : 'ltr', alignItems: 'stretch' }}>
      {cells.map(spec => <View key={spec.fieldId} testID={`property-spec-${spec.fieldId}`} style={[styles.cell, { width: width ?? (columns === 2 ? '50%' : '33.333%') }]}>
        <View style={{ direction: 'ltr', flexDirection: isRTL ? 'row' : 'row-reverse', gap: 6, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <PropertySpecIcon name={spec.icon} size={23} color="#203568" />
          <Text style={{ flexShrink: 1, minWidth: 0, color: '#203568', fontFamily: fonts.bold, fontSize: /^\d/.test(spec.value) ? 19 : 14, lineHeight: 23, textAlign: 'center' }}>{spec.value}</Text>
        </View>
        <Text style={{ color: '#203568', fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, textAlign: 'center', width: '100%' }}>{spec.label}</Text>
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  cell: { backgroundColor: '#FFFFFF', minHeight: 80, paddingHorizontal: 5, paddingVertical: 8, gap: 4, justifyContent: 'center', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#DFE8F2', flexGrow: 0, flexShrink: 0 },
});
