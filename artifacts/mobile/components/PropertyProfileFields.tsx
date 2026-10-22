import { Text, TextInput, View } from 'react-native';
import { FORM_MULTI_FIELDS, type PropertyDetailField, type PropertyType } from '@workspace/property-domain';
import { getPropertyFormProfile, isPropertyProfileFieldVisible, PROFILE_CHOICES } from '@/services/propertyProfileForm';
import { getPropertyFormField } from '@/services/propertyFormCatalog';
import { COMMERCIAL_COMPLEX_CHOICES, grossAnnualRentalYield } from '@/services/commercialComplexSale';
import { ChoiceGrid, ChoiceTile } from '@/components/ChoiceTile';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { PropertyFormCard, propertyFormInputStyle } from '@/components/PropertyFormCard';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import type { EnrichmentFieldValues } from '@/components/PropertyEnrichmentFields';

export function PropertyProfileFields({ propertyType, transaction, values, onChange, recordScopeKey, salePrice, onInvalidQuickPickChange }: {
  propertyType: PropertyType; transaction?: 'sale' | 'rent'; values: EnrichmentFieldValues;
  onChange: (field: PropertyDetailField, value: string) => void; recordScopeKey: string; salePrice?: number;
  onInvalidQuickPickChange?: (field: PropertyDetailField, scope: string, invalid: boolean) => void;
}) {
  const colors = useColors();
  const { language, fonts, isRTL } = useI18n();
  const ar = language === 'ar';
  const profile = getPropertyFormProfile(propertyType, transaction, values);
  if (!profile) return null;
  const labelStyle = { color: '#173F78', fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' as const : 'left' as const };
  const inputStyle = [propertyFormInputStyle, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, textAlign: isRTL ? 'right' as const : 'left' as const }];
  const fieldLabel = (field: PropertyDetailField) => {
    if (propertyType === 'whole_building') {
      if (field === 'apartmentCount') return ar ? 'إجمالي عدد الشقق' : 'Total apartments';
      if (field === 'roomsPerUnit') return ar ? 'غرف النوم لكل شقة' : 'Bedrooms per apartment';
      if (field === 'bathroomsPerUnit') return ar ? 'الحمامات لكل شقة' : 'Bathrooms per apartment';
    }
    if (field === 'hasPrivateEntrance') return ar ? 'مدخل مستقل' : 'Private entrance';
    return getPropertyFormField(field).label[ar ? 1 : 0];
  };
  function layoutRows(field: 'apartmentLayouts' | 'floorApartmentCounts') {
    let rows: Record<string, number>[] = [];
    try { const parsed = JSON.parse(values[field] || '[]'); if (Array.isArray(parsed)) rows = parsed; } catch { /* Retain invalid draft until user corrects it. */ }
    const keys = field === 'apartmentLayouts' ? ['apartmentCount', 'bedrooms', 'bathrooms'] : ['floorNumber', 'apartmentCount'];
    const labels: Record<string, string> = { apartmentCount: ar ? 'عدد الشقق' : 'Apartments', bedrooms: ar ? 'غرف النوم لكل شقة' : 'Bedrooms per apartment', bathrooms: ar ? 'الحمامات لكل شقة' : 'Bathrooms per apartment', floorNumber: ar ? 'رقم الدور' : 'Floor number' };
    const publish = (next: Record<string, number>[]) => onChange(field, JSON.stringify(next));
    return <View style={{ gap: 10 }}>
      <Text style={labelStyle}>{fieldLabel(field)}</Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{ar ? 'يجب أن يساوي مجموع الشقق العدد الإجمالي المسجل.' : 'Apartment counts must add up to the recorded total.'}</Text>
      {rows.map((row, index) => <View key={index} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, gap: 8 }}>
        <Text style={labelStyle}>{ar ? `مجموعة ${index + 1}` : `Group ${index + 1}`}</Text>
        {keys.map(key => <View key={key}><Text style={labelStyle}>{labels[key]}</Text><TextInput accessibilityLabel={`${labels[key]} ${index + 1}`} value={row[key] === undefined ? '' : String(row[key])} keyboardType="number-pad" style={inputStyle} onChangeText={raw => {
          const text = raw.replace(/[٠-٩]/g, n => String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/[۰-۹]/g, n => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n)));
          if (!/^\d*$/.test(text)) return;
          const next = rows.map(item => ({ ...item }));
          if (text === '') delete next[index][key]; else next[index][key] = Number(text);
          publish(next);
        }} /></View>)}
        <ChoiceTile label={ar ? 'إزالة المجموعة' : 'Remove group'} role="button" selected={false} onPress={() => publish(rows.filter((_, i) => i !== index))} />
      </View>)}
      <ChoiceTile label={ar ? 'إضافة مجموعة' : 'Add group'} role="button" selected={false} onPress={() => publish([...rows, {}])} />
    </View>;
  }
  function renderField(field: PropertyDetailField) {
    if (!isPropertyProfileFieldVisible(field, propertyType, transaction, values) || ['floorUse', 'propertyUse'].includes(field)) return null;
    if (field === 'apartmentLayouts' || field === 'floorApartmentCounts') return <View key={field}>{layoutRows(field)}</View>;
    const definition = getPropertyFormField(field);
    const choices = PROFILE_CHOICES[field] ?? COMMERCIAL_COMPLEX_CHOICES[field];
    const boolean = definition.control === 'boolean';
    const multi = (FORM_MULTI_FIELDS as readonly string[]).includes(field);
    if (choices || boolean) {
      const options = choices ?? [['true', 'Exists', 'يوجد'], ['false', 'Does not exist', 'لا يوجد']];
      const yesNo = field === 'sameApartmentLayout' || field === 'sameApartmentsPerFloor' || field === 'hasBasement' || field === 'hasMortgage';
      return <View key={field} style={{ gap: 8 }}><Text style={labelStyle}>{fieldLabel(field)}</Text><ChoiceGrid>{options.map(([id, en, arabic]) => {
        const selected = multi ? values[field]?.split(',').includes(id) === true : values[field] === id;
        return <ChoiceTile key={id} optionId={`${field}:${id}`} label={yesNo ? id === 'true' ? ar ? 'نعم' : 'Yes' : ar ? 'لا' : 'No' : ar ? arabic : en} selected={selected} role={multi ? 'checkbox' : 'radio'} onPress={() => {
          const current = values[field]?.split(',').filter(Boolean) ?? [];
          onChange(field, multi ? (selected ? current.filter(value => value !== id) : [...current, id]).join(',') : selected ? '' : id);
        }} />;
      })}</ChoiceGrid></View>;
    }
    if (definition.control === 'numeric_quick_pick' || definition.control === 'count') {
      const quickPickValues = field === 'shopCount' ? [1, 2, 3, 4] : field === 'commercialFloorCount' ? [1, 2] : field === 'elevatorCount' ? [0, 1, 2, 3, 4] : undefined;
      // Commercial shop/floor limits are fixed choices, with no arbitrary "other" value.
      if (field === 'shopCount' || field === 'commercialFloorCount') return <View key={field} style={{ gap: 8 }}><Text style={labelStyle}>{fieldLabel(field)}</Text><ChoiceGrid>{quickPickValues!.map(n => <ChoiceTile key={n} label={String(n)} selected={values[field] === String(n)} role="radio" onPress={() => onChange(field, String(n))} />)}</ChoiceGrid></View>;
      return <NumericQuickPick key={field} testID={`profile-${field}`} scopeKey={`${recordScopeKey}:${field}`} label={fieldLabel(field)} value={values[field] ?? (field === 'apartmentCount' ? values.unitCount : '') ?? ''} quickPickValues={quickPickValues} requireExactValue onChangeText={text => onChange(field, text)} onPendingValidityChange={(scope, invalid) => onInvalidQuickPickChange?.(field, scope, invalid)} />;
    }
    return <View key={field} style={{ gap: 6 }}><Text style={labelStyle}>{fieldLabel(field)}</Text><TextInput value={values[field] ?? ''} accessibilityLabel={fieldLabel(field)} keyboardType={definition.control === 'decimal' ? 'decimal-pad' : 'default'} placeholder={field === 'availableFrom' ? 'YYYY-MM-DD' : undefined} style={inputStyle} onChangeText={text => {
      if (definition.control === 'decimal') {
        const normalized = text.replace(/[٠-٩]/g, n => String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/[۰-۹]/g, n => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n))).replace(/[٫,]/g, '.');
        if (/^\d*\.?\d*$/.test(normalized)) onChange(field, normalized);
      } else onChange(field, text);
    }} /></View>;
  }
  const yieldPercent = transaction === 'sale' && propertyType === 'whole_building' ? grossAnnualRentalYield(salePrice, values.monthlyIncome?.trim() ? Number(values.monthlyIncome) : undefined) : undefined;
  return <View style={{ gap: 12 }}>
    <PropertyFormCard title={ar ? 'مواصفات العقار' : 'Property specifications'} icon="home">{profile.fields.map(renderField)}
      {yieldPercent !== undefined && <View><Text style={labelStyle}>{ar ? 'العائد السنوي الإجمالي قبل المصروفات' : 'Gross annual yield before expenses'}</Text><Text style={labelStyle}>{yieldPercent.toFixed(2)}%</Text></View>}
    </PropertyFormCard>
    <PropertyFormCard title={ar ? 'المزايا المتوفرة في العقار' : 'Available property features'} icon="check-square"><ChoiceGrid>{profile.amenities.map(field => <ChoiceTile key={field} optionId={field} label={fieldLabel(field)} role="checkbox" selected={values[field] === 'true'} onPress={() => onChange(field, values[field] === 'true' ? '' : 'true')} />)}</ChoiceGrid></PropertyFormCard>
  </View>;
}
