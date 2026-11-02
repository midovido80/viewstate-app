import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import type { PropertyDetailField } from '@workspace/property-domain';
import { FieldValidationContext, TextInput } from '@/components/FormField';
import { ChoiceGrid, ChoiceTile } from '@/components/ChoiceTile';
import { PropertyFormCard, propertyFormInputStyle } from '@/components/PropertyFormCard';
import type { EnrichmentFieldValues } from '@/components/PropertyEnrichmentFields';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { parseOptionalRequirementNumber } from '@/services/personRequirementWorkflow';

/** Shared by Office and Commercial Floor, offered Rent/Sale create/edit. */
export function CommercialOfferedServices({ values, onChange, recordScopeKey, onInvalidChange }: {
  values: EnrichmentFieldValues; recordScopeKey: string;
  onChange: (field: PropertyDetailField, value: string) => void;
  onInvalidChange?: (field: PropertyDetailField, scope: string, invalid: boolean) => void;
}) {
  const { language, fonts, isRTL } = useI18n(); const colors = useColors(); const ar = language === 'ar';
  const count = values.automaticNumberCount ?? '';
  const valid = parseOptionalRequirementNumber(count, { integer: true }).ok;
  const validityCallback = useRef(onInvalidChange); validityCallback.current = onInvalidChange;
  useEffect(() => { validityCallback.current?.('automaticNumberCount', recordScopeKey, !valid); return () => validityCallback.current?.('automaticNumberCount', recordScopeKey, false); }, [valid, recordScopeKey]);
  const labelStyle = { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' as const : 'left' as const };
  return <PropertyFormCard title={ar ? 'خدمات العقار' : 'Property services'} icon="briefcase" testID="commercial-offered-services">
    <View style={{ gap: 10 }}>
      <Text style={labelStyle}>{ar ? 'عدد الأرقام الآلية' : 'Number of PACI numbers'}</Text>
      <FieldValidationContext.Provider value={!valid}><TextInput testID="offered-automatic-number-count" accessibilityLabel={ar ? 'عدد الأرقام الآلية' : 'Number of PACI numbers'} value={count} keyboardType="number-pad" placeholder={ar ? 'أدخل العدد يدويًا' : 'Enter the count manually'} style={propertyFormInputStyle} onChangeText={text => onChange('automaticNumberCount', text.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))} /></FieldValidationContext.Provider>
      {!valid && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{ar ? 'أدخل عددًا صحيحًا لا يقل عن صفر.' : 'Enter a non-negative whole number.'}</Text>}
      <ChoiceGrid>
        <ChoiceTile label={ar ? 'نظافة مرافق' : 'Facility cleaning'} icon="refresh-cw" selected={values.hasFacilityCleaning === 'true'} onPress={() => onChange('hasFacilityCleaning', values.hasFacilityCleaning === 'true' ? '' : 'true')} testID="offered-facility-cleaning" />
        <ChoiceTile label={ar ? 'مطبخ' : 'Kitchen'} icon="coffee" selected={values.hasKitchen === 'true'} onPress={() => { if (values.hasKitchen === 'true') { onChange('kitchenAccess', ''); onChange('hasKitchen', ''); } else onChange('hasKitchen', 'true'); }} testID="offered-has-kitchen" />
      </ChoiceGrid>
      {values.hasKitchen === 'true' && <View testID="offered-kitchen-options" style={{ gap: 8 }}><Text style={labelStyle}>{ar ? 'المطبخ: خاص أو مشترك' : 'Kitchen: private or shared'}</Text><ChoiceGrid>{(['private', 'shared'] as const).map(kind => <ChoiceTile key={kind} icon={kind === 'private' ? 'lock' : 'users'} label={kind === 'private' ? (ar ? 'خاص' : 'Private') : (ar ? 'مشترك' : 'Shared')} selected={values.kitchenAccess === kind} onPress={() => onChange('kitchenAccess', values.kitchenAccess === kind ? '' : kind)} role="radio" testID={`offered-kitchen-${kind}`} />)}</ChoiceGrid></View>}
    </View>
  </PropertyFormCard>;
}
