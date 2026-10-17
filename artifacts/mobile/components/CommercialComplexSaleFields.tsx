import { Text, TextInput, View } from 'react-native';
import type { PropertyDetailField } from '@workspace/property-domain';
import { ChoiceChip } from '@/components/ChoiceChip';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import type { EnrichmentFieldValues } from '@/components/PropertyEnrichmentFields';
import { propertyDetailLabels } from '@/services/propertyDetailPresentation';
import { COMMERCIAL_COMPLEX_CHOICES, COMMERCIAL_COMPLEX_SALE_FIELDS, grossAnnualRentalYield, toggleComplexParking } from '@/services/commercialComplexSale';
import { COMMERCIAL_FLOOR_SALE_FIELDS, COMMERCIAL_FLOOR_SALE_AMENITIES, COMMERCIAL_FLOOR_SALE_OCCUPANCY, commercialFloorSaleLabel } from '@/services/commercialFloorSale';
import { FLOOR_NUMBER_QUICK_PICK_VALUES } from '@/services/numericQuickPick';

export function CommercialComplexSaleFields({ profile = 'complex', recordScopeKey, values, onChange, salePrice, onInvalidQuickPickChange }: {
  profile?: 'complex' | 'floor';
  recordScopeKey: string;
  values: EnrichmentFieldValues;
  onChange: (field: PropertyDetailField, value: string) => void;
  salePrice?: number;
  onInvalidQuickPickChange?: (field: PropertyDetailField, scopeKey: string, invalid: boolean) => void;
}) {
  const colors = useColors();
  const { language, isRTL, fonts } = useI18n();
  const labelStyle = { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' as const : 'left' as const };
  const income = values.monthlyIncome?.trim() ? Number(values.monthlyIncome) : undefined;
  const yieldPercent = grossAnnualRentalYield(salePrice, income);
  const isFloor = profile === 'floor';
  const fields = isFloor ? COMMERCIAL_FLOOR_SALE_FIELDS : COMMERCIAL_COMPLEX_SALE_FIELDS;
  const labelFor = (field: PropertyDetailField) => isFloor ? commercialFloorSaleLabel(field, language, propertyDetailLabels[field][language === 'ar' ? 1 : 0]) : propertyDetailLabels[field][language === 'ar' ? 1 : 0];
  return <View style={{ gap: 12 }} testID={isFloor ? 'commercial-floor-sale-fields' : 'commercial-complex-sale-fields'}>
    {fields.filter(field => field !== 'privateParkingCount' || values.parkingTypes?.split(',').includes('private')).map(field => {
      const label = labelFor(field);
      if (field === 'floorCount' || field === 'floorNumber' || field === 'bathroomCount') return <NumericQuickPick key={field} scopeKey={recordScopeKey} label={label} value={values[field] ?? ''} requireExactValue quickPickValues={field === 'floorNumber' ? FLOOR_NUMBER_QUICK_PICK_VALUES : undefined}
        onChangeText={value => onChange(field, value)} onPendingValidityChange={(scope, invalid) => onInvalidQuickPickChange?.(field, scope, invalid)} testID={isFloor ? `commercial-floor-${field}` : 'complex-floorCount'} />;
      const options = isFloor && field === 'rentalOccupancy' ? COMMERCIAL_FLOOR_SALE_OCCUPANCY : COMMERCIAL_COMPLEX_CHOICES[field];
      return <View key={field} style={{ gap: 6 }}>
        {isFloor && field === 'rentalOccupancy' && <View style={{ gap: 8 }}>
          <Text style={labelStyle}>{language === 'ar' ? 'المزايا المتوفرة في العقار' : 'Available property features'}</Text>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
            {COMMERCIAL_FLOOR_SALE_AMENITIES.map(amenity => <ChoiceChip key={amenity} label={labelFor(amenity)} selected={values[amenity] === 'true'} testID={`commercial-floor-${amenity}`} onPress={() => onChange(amenity, values[amenity] === 'true' ? '' : 'true')} />)}
          </View>
        </View>}
        <Text style={labelStyle}>{label}</Text>
        {options ? <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map(([value, en, ar]) => <ChoiceChip key={value} label={language === 'ar' ? ar : en}
            role={field === 'parkingTypes' ? 'checkbox' : 'radio'} selected={field === 'parkingTypes' ? (values[field] ?? '').split(',').includes(value) : values[field] === value}
            testID={`complex-${field}-${value}`} onPress={() => {
              const next = field === 'parkingTypes' ? toggleComplexParking(values[field] ?? '', value) : values[field] === value ? '' : value;
              onChange(field, next);
            }} />)}
        </View> : <TextInput value={values[field] ?? ''} keyboardType={field === 'intendedUse' ? 'default' : field === 'monthlyIncome' ? 'decimal-pad' : 'number-pad'}
          accessibilityLabel={label} testID={`complex-${field}`} onChangeText={raw => {
            if (field === 'intendedUse') { onChange(field, raw); return; }
            const next = raw.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٫,]/g, '.');
            if (next === '' || (field === 'monthlyIncome' ? /^\d+(\.\d*)?$/ : /^\d+$/).test(next)) onChange(field, next);
          }} style={{ minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }} />}
      </View>;
    })}
    <Text style={labelStyle}>{language === 'ar' ? 'العائد الإيجاري السنوي الإجمالي (%)' : 'Gross annual rental yield (%)'}</Text>
    <Text testID="complex-gross-yield" accessibilityLiveRegion="polite" style={{ ...labelStyle, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>{yieldPercent === undefined ? '—' : `${yieldPercent.toFixed(2)}%`}</Text>
    <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{language === 'ar' ? 'قبل المصروفات والصيانة والتمويل' : 'Before expenses, maintenance and financing'}</Text>
  </View>;
}
