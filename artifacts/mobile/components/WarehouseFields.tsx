import { PropertyFormCard, propertyFormInputStyle } from '@/components/PropertyFormCard';
import { Text, TextInput, View } from 'react-native';
import type { PropertyDetailField } from '@workspace/property-domain';
import { ChoiceTile as ChoiceChip, ChoiceGrid } from '@/components/ChoiceTile';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { getPropertyFormField } from '@/services/propertyFormCatalog';
import { COMMERCIAL_COMPLEX_CHOICES } from '@/services/commercialComplexSale';
import { WAREHOUSE_CHOICES, WAREHOUSE_SPEC_FIELDS, WAREHOUSE_EXTRA_FIELDS, warehouseFieldVisible, toggleWarehouseLevel } from '@/services/warehouseForm';
import type { EnrichmentFieldValues } from '@/components/PropertyEnrichmentFields';

export function WarehouseFields({ recordScopeKey, values, onChange, onInvalidQuickPickChange }: {
  recordScopeKey: string;
  values: EnrichmentFieldValues;
  onChange: (field: PropertyDetailField, value: string) => void;
  onInvalidQuickPickChange?: (field: PropertyDetailField, scopeKey: string, invalid: boolean) => void;
}) {
  const colors = useColors();
  const { language, isRTL, fonts } = useI18n();
  const labelStyle = { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' as const : 'left' as const };
  const change = (field: PropertyDetailField, value: string) => {
    onChange(field, value);
    if (field === 'warehouseKind' && value !== 'food') onChange('hasColdStorage', '');
    if (field === 'hasVehicleRamp' && value !== 'true') onChange('rampVehicleSize', '');
    if (field === 'hasServiceElevator' && value !== 'true') onChange('serviceElevatorCapacityTons', '');
    if (field === 'electricityCapacity' && value && !values.electricityCapacityUnit) onChange('electricityCapacityUnit', 'A');
  };
  const renderField = (field: PropertyDetailField) => {
    if (!warehouseFieldVisible(field, values)) return null;
    const definition = getPropertyFormField(field);
    const label = field === 'hasColdStorage' ? (language === 'ar' ? 'مجهز بثلاجات' : 'Equipped with refrigeration') : definition.label[language === 'ar' ? 1 : 0];
    const raw = values[field] ?? '';
    if ((definition.control === 'count' || definition.control === 'numeric_quick_pick')) return <NumericQuickPick key={field} scopeKey={recordScopeKey} label={label} value={raw} requireExactValue onChangeText={value => change(field, value)} onPendingValidityChange={(_scope, invalid) => onInvalidQuickPickChange?.(field, recordScopeKey, invalid)} testID={`warehouse-${field}`} />;
    const options = definition.control === 'boolean' ? [['true', 'Yes', 'نعم'], ['false', 'No', 'لا']] : WAREHOUSE_CHOICES[field] ?? COMMERCIAL_COMPLEX_CHOICES[field];
    return <View key={field} style={{ gap: 8 }} testID={`warehouse-field-${field}`}>
      <Text style={labelStyle}>{label}</Text>
      {options ? <ChoiceGrid style={{ flexDirection: 'row', flexWrap: 'wrap', direction: isRTL ? 'rtl' : 'ltr', gap: 8 }}>{options.map(([value, en, ar]) => <ChoiceChip key={value} optionId={`${field}:${value}`} label={language === 'ar' ? ar : en} selected={field === 'warehouseLevels' ? raw.split(',').includes(value) : raw === value}
        role={field === 'warehouseLevels' ? 'checkbox' : 'radio'} testID={`warehouse-${field}-${value}`} onPress={() => change(field, field === 'warehouseLevels' ? toggleWarehouseLevel(raw, value) : raw === value ? '' : value)} />)}</ChoiceGrid>
      : <TextInput value={raw} onChangeText={input => {
          const value = input.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٫,]/g, '.');
          if (value === '' || /^\d+(\.\d*)?$/.test(value)) change(field, value);
        }} accessibilityLabel={label} testID={`warehouse-${field}`} keyboardType="decimal-pad" style={{ ...propertyFormInputStyle, minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }} />}
    </View>;
  };
  return <View style={{ gap: 16 }} testID="warehouse-specifications">
    <PropertyFormCard title={language === 'ar' ? 'مواصفات المخزن وتجهيزاته' : 'Warehouse specifications and equipment'} icon="box">{WAREHOUSE_SPEC_FIELDS.map(renderField)}</PropertyFormCard>
    <PropertyFormCard title={language === 'ar' ? 'بيانات إضافية (اختياري)' : 'Additional details (optional)'}>{WAREHOUSE_EXTRA_FIELDS.map(renderField)}</PropertyFormCard>
  </View>;
}
