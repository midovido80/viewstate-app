import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { PropertyDetailField } from '@workspace/property-domain';
import { ChoiceChip } from '@/components/ChoiceChip';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { DEMO_NEARBY_SERVICES } from '@/services/propertyDemoCatalog';
import { grossAnnualRentalYield, toggleComplexParking, COMMERCIAL_COMPLEX_CHOICES } from '@/services/commercialComplexSale';
import type { EnrichmentFieldValues } from '@/components/PropertyEnrichmentFields';
import { propertyDetailLabels } from '@/services/propertyDetailPresentation';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

type ClearAction = 'hasCommercialShops' | 'hasCommercialFloors' | 'privateParking';

export function WholeBuildingSaleFields({ recordScopeKey, values, nearby, onChange, onNearbyChange, salePrice, onInvalidQuickPickChange }: {
  recordScopeKey: string;
  values: EnrichmentFieldValues;
  nearby: readonly string[];
  onChange: (field: PropertyDetailField, value: string) => void;
  onNearbyChange?: (nearby: readonly string[]) => void;
  salePrice?: number;
  onInvalidQuickPickChange?: (field: PropertyDetailField, scopeKey: string, invalid: boolean) => void;
}) {
  const colors = useColors();
  const { language, isRTL, fonts } = useI18n();
  const [confirmClear, setConfirmClear] = useState<ClearAction | null>(null);
  const labelStyle = { color: colors.destructive, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' as const : 'left' as const };
  const inputStyle = { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' as const : 'left' as const };
  const income = values.monthlyIncome?.trim() ? Number(values.monthlyIncome) : undefined;
  const yieldPercent = grossAnnualRentalYield(salePrice, income);
  const label = (field: PropertyDetailField) => propertyDetailLabels[field][language === 'ar' ? 1 : 0];
  const options = (field: PropertyDetailField, choices: readonly (readonly [string, string, string])[], multi = false) => (
    <View style={{ gap: 6 }}>
      <Text style={labelStyle}>{label(field)}</Text>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
        {choices.map(([value, en, ar]) => <ChoiceChip key={value} label={language === 'ar' ? ar : en}
          role={multi ? 'checkbox' : 'radio'}
          selected={multi ? (valuesFor(field).includes(value)) : valuesFor(field)[0] === value}
          testID={`whole-building-${field}-${value}`}
          onPress={() => {
            if (field === 'parkingTypes' && value === 'private' && valuesFor(field).includes(value) && values.privateParkingCount?.trim()) {
              setConfirmClear('privateParking');
              return;
            }
            onChange(field, multi
              ? toggleComplexParking(valuesFor(field).join(','), value)
              : valuesFor(field)[0] === value ? '' : value);
          }} />)}
      </View>
    </View>
  );
  const valuesFor = (field: PropertyDetailField) => field === 'parkingTypes'
    ? (values.parkingTypes ?? '').split(',').filter(Boolean)
    : [values[field] ?? ''];
  const booleanOptions = (field: PropertyDetailField, yes: string, no: string, yesLabel?: string, noLabel?: string) => (
    <View style={{ gap: 6 }}>
      <Text style={labelStyle}>{label(field)}</Text>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
        {[['true', yesLabel ?? yes, 'نعم'], ['false', noLabel ?? no, 'لا']].map(([value, en, ar]) =>
          <ChoiceChip key={value} role="radio" label={language === 'ar' ? ar : en} selected={values[field] === value}
            testID={`whole-building-${field}-${value}`}
            onPress={() => {
              const next = value === 'false' ? field : null;
              const dependentField = field === 'hasCommercialShops' ? 'shopCount' : 'commercialFloorCount';
              if (next && values[dependentField]?.trim()) setConfirmClear(field as ClearAction);
              else onChange(field, value);
            }} />)}
      </View>
    </View>
  );
  const count = (field: PropertyDetailField, labelOverride?: string, quickPickValues?: readonly number[]) => (
    <NumericQuickPick scopeKey={`${recordScopeKey}:${field}`} label={labelOverride ?? label(field)} value={values[field] ?? ''}
      quickPickValues={quickPickValues} requireExactValue
      onChangeText={value => onChange(field, value)}
      onPendingValidityChange={(scope, invalid) => onInvalidQuickPickChange?.(field, scope, invalid)}
      testID={`whole-building-${field}`} />
  );
  const floorCount = Number(values.floorCount);
  const commercialFloorCount = Number(values.commercialFloorCount);
  const invalidCommercialFloors = values.hasCommercialFloors === 'true'
    && Number.isFinite(floorCount) && Number.isFinite(commercialFloorCount)
    && commercialFloorCount > floorCount;

  return <View style={{ gap: 14 }} testID="whole-building-sale-fields">
    <View style={{ gap: 6 }}>
      <Text style={labelStyle}>{label('occupancy')}</Text>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
        {([['family', 'Family', 'عائلات'], ['bachelor', 'Bachelor', 'عزاب'], ['any', 'Any', 'الكل']] as const).map(([value, en, ar]) =>
          <ChoiceChip key={value} role="radio" label={language === 'ar' ? ar : en} selected={values.occupancy === value}
            testID={`whole-building-occupancy-${value}`} onPress={() => onChange('occupancy', value)} />)}
      </View>
    </View>
    {count('floorCount')}
    {count('apartmentsPerFloor')}
    {count('unitCount', language === 'ar' ? 'إجمالي الوحدات (يدخل يدوياً)' : 'Total units (enter independently)')}
    {count('roomsPerUnit', language === 'ar' ? 'غرف النوم في شقة واحدة' : 'Bedrooms in ONE apartment')}
    {count('bathroomsPerUnit', language === 'ar' ? 'الحمامات في شقة واحدة' : 'Bathrooms in ONE apartment')}
    {booleanOptions('hasCommercialShops', 'Yes', 'No')}
    {values.hasCommercialShops === 'true' && options('shopCount', [['1', '1 shop', 'محل واحد'], ['2', '2 shops', 'محلان'], ['3', '3 shops', '3 محلات']])}
    {booleanOptions('hasCommercialFloors', 'Yes', 'No')}
    {values.hasCommercialFloors === 'true' && <View style={{ gap: 4 }}>
      {count('commercialFloorCount')}
      {invalidCommercialFloors ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{language === 'ar' ? 'عدد الأدوار التجارية لا يمكن أن يتجاوز إجمالي الأدوار.' : 'Commercial floors cannot exceed total floors.'}</Text> : null}
    </View>}
    <View style={{ gap: 6 }}>
      <Text style={labelStyle}>{label('elevatorCount')}</Text>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
        {[1, 2, 3, 4].map(number => <ChoiceChip key={number} role="radio" label={String(number)}
          selected={values.elevatorCount === String(number)} testID={`whole-building-elevator-${number}`}
          onPress={() => onChange('elevatorCount', values.elevatorCount === String(number) ? '' : String(number))} />)}
      </View>
    </View>
    {booleanOptions('hasCentralAC', 'Yes', 'No')}
    {booleanOptions('hasGuardRoom', 'Yes', 'No')}
    {options('streetPosition', COMMERCIAL_COMPLEX_CHOICES.streetPosition ?? [])}
    {options('parkingTypes', COMMERCIAL_COMPLEX_CHOICES.parkingTypes ?? [], true)}
    {valuesFor('parkingTypes').includes('private') && count('privateParkingCount')}
    {options('rentalOccupancy', COMMERCIAL_COMPLEX_CHOICES.rentalOccupancy ?? [])}
    <View style={{ gap: 6 }}>
      <Text style={labelStyle}>{label('monthlyIncome')}</Text>
      <TextInput value={values.monthlyIncome ?? ''} keyboardType="decimal-pad" accessibilityLabel={label('monthlyIncome')}
        testID="whole-building-monthly-income" onChangeText={raw => {
          const next = raw.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٫,]/g, '.');
          if (next === '' || /^\d+(\.\d*)?$/.test(next)) onChange('monthlyIncome', next);
        }} style={inputStyle} />
    </View>
    <Text style={labelStyle}>{language === 'ar' ? 'العائد الإيجاري السنوي الإجمالي (%)' : 'Gross annual rental yield (%)'}</Text>
    <Text testID="whole-building-gross-yield" accessibilityLiveRegion="polite" style={{ ...labelStyle, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>
      {yieldPercent === undefined ? '—' : `${yieldPercent.toFixed(2)}%`}
    </Text>
    <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>
      {language === 'ar' ? 'إجمالي قبل المصروفات والصيانة والتمويل' : 'Gross before expenses, maintenance and financing'}
    </Text>
    <Text style={labelStyle}>{language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'}</Text>
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8 }}>
      {DEMO_NEARBY_SERVICES.map(item => <ChoiceChip key={item.id} role="checkbox" label={item.label[language === 'ar' ? 1 : 0]}
        selected={nearby.includes(item.id)} testID={`whole-building-nearby-${item.id}`}
        onPress={() => onNearbyChange?.(nearby.includes(item.id) ? nearby.filter(id => id !== item.id) : [...nearby, item.id])} />)}
    </View>
    {confirmClear ? <View style={{ padding: 12, borderWidth: 1, borderColor: colors.destructive, borderRadius: 10, gap: 8 }}>
      <Text style={labelStyle}>{language === 'ar' ? 'سيؤدي هذا إلى إزالة القيمة التابعة من المسودة.' : 'This will remove the dependent value from the draft.'}</Text>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
        <ChoiceChip label={language === 'ar' ? 'تأكيد الإزالة' : 'Confirm removal'} selected={false} role="button" testID="whole-building-confirm-clear"
          onPress={() => {
            if (confirmClear === 'privateParking') {
              onChange('privateParkingCount', '');
              onChange('parkingTypes', toggleComplexParking(values.parkingTypes ?? '', 'private'));
            } else {
              const field = confirmClear === 'hasCommercialShops' ? 'shopCount' : 'commercialFloorCount';
              onChange(field, '');
              onChange(confirmClear, 'false');
            }
            setConfirmClear(null);
          }} />
        <ChoiceChip label={language === 'ar' ? 'إلغاء' : 'Cancel'} selected={false} role="button" testID="whole-building-cancel-clear" onPress={() => setConfirmClear(null)} />
      </View>
    </View> : null}
  </View>;
}
