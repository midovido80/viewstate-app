import { Text } from "@/components/AppText";
import { RequirementServiceGroup, RequirementServiceRow } from '@/components/RequirementServiceRows';
import { View } from 'react-native';
import type { CommercialRequirementServices as Services } from '@workspace/property-domain';
import { FieldValidationContext, TextInput } from '@/components/FormField';
import { ChoiceGrid, ChoiceTile } from '@/components/FormChoices';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { COMMERCIAL_SERVICE_LABELS, COMMERCIAL_PARKING_LABELS } from '@/services/commercialRequirementPresentation';
import { parseOptionalRequirementNumber } from '@/services/personRequirementWorkflow';

export function CommercialRequirementServices({ register, value, onChange, office, count, onCountChange, centralAC, onCentralACChange, bathroomsEnabled, kitchenEnabled, onToggleFacility }: {
  register?: (id: string, view: View | null) => void;
  value: Services; onChange: (value: Services) => void; office: boolean;
  count: string; onCountChange: (value: string) => void;
  centralAC?: boolean; onCentralACChange: (value: boolean | undefined) => void;
  bathroomsEnabled: boolean; kitchenEnabled: boolean;
  onToggleFacility: (field: 'bathrooms' | 'kitchen') => void;
}) {
  const { language, fonts, isRTL } = useI18n(); const colors = useColors(); const ar = language === 'ar'; const index = ar ? 1 : 0;
  const textStyle = { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' as const : 'left' as const };
  const validCount = parseOptionalRequirementNumber(count, { integer: true }).ok;
  return <View ref={view => register?.('commercial-services', view)} collapsable={false} testID="commercial-requirement-services" style={{ gap: 12 }}>
    {office && <>
      <Text style={[textStyle, { fontSize: 19, fontFamily: fonts.bold }]}>{ar ? 'شنو الخدمات المطلوبة؟' : 'Which services are required?'}</Text>
      <Text style={textStyle}>{COMMERCIAL_SERVICE_LABELS.automaticNumberCount[index]}</Text>
      <FieldValidationContext.Provider value={!validCount}><TextInput value={count} onChangeText={onCountChange} keyboardType="number-pad" placeholder={ar ? 'أدخل العدد يدويًا' : 'Enter the count manually'} accessibilityLabel={COMMERCIAL_SERVICE_LABELS.automaticNumberCount[index]} testID="requirement-automatic-number-count" /></FieldValidationContext.Provider>
      {!validCount && <Text style={{ color: colors.destructive }} accessibilityRole="alert">{ar ? 'أدخل عددًا صحيحًا لا يقل عن صفر.' : 'Enter a non-negative whole number.'}</Text>}
      <RequirementServiceGroup title={ar ? 'خدمات المبنى' : 'Building services'}>
        <RequirementServiceRow label={ar ? 'تكييف مركزي' : 'Central AC'}
          state={centralAC === undefined ? 'unset' : centralAC ? 'required' : 'excluded'}
          onPress={() => onCentralACChange(centralAC === true ? undefined : true)}
          onExclude={() => onCentralACChange(centralAC === false ? undefined : false)} testID="commercial-service-central-ac" />
        {(['cleaning', 'security', 'cameras', 'elevators'] as const).map(field => {
          const set = (status: boolean | undefined) => {
            const next = { ...value };
            if (status === undefined) delete next[field];
            else next[field] = status;
            onChange(next);
          };
          return <RequirementServiceRow key={field} label={COMMERCIAL_SERVICE_LABELS[field][index]}
            state={value[field] === undefined ? 'unset' : value[field] ? 'required' : 'excluded'}
            onPress={() => set(value[field] === true ? undefined : true)}
            onExclude={() => set(value[field] === false ? undefined : false)} testID={'commercial-service-' + field} />;
        })}
        {(['bathrooms', 'kitchen'] as const).map(field => <RequirementServiceRow key={field} label={COMMERCIAL_SERVICE_LABELS[field][index]}
          state={(field === 'bathrooms' ? bathroomsEnabled : kitchenEnabled) ? 'required' : 'unset'}
          onPress={() => onToggleFacility(field)} testID={'commercial-service-' + field} />)}
      </RequirementServiceGroup>
      {(['bathrooms', 'kitchen'] as const).map(field => (field === 'bathrooms' ? bathroomsEnabled : kitchenEnabled) && <View key={field} ref={view => register?.(`commercial-${field}`, view)} collapsable={false} style={{ gap: 8 }} testID={`commercial-service-${field}-options`}>
        <Text style={textStyle}>{COMMERCIAL_SERVICE_LABELS[field][index]} — {ar ? 'اختر خاص أو مشترك' : 'Choose private or shared'}<Text style={{ color: colors.destructive }}> *</Text></Text>
        <ChoiceGrid>{(['private', 'shared'] as const).map(kind => <ChoiceTile key={kind} icon={kind === 'private' ? 'lock' : 'users'} label={kind === 'private' ? (ar ? 'خاص' : 'Private') : (ar ? 'مشترك' : 'Shared')} selected={value[field] === kind} onPress={() => onChange({ ...value, [field]: kind })} testID={`commercial-${field}-${kind}`} role="radio" />)}</ChoiceGrid>
      </View>)}
    </>}
    <Text style={[textStyle, { fontSize: 18, fontFamily: fonts.semiBold }]}>{ar ? 'المواقف' : 'Parking'}</Text>
    <ChoiceGrid>{(['private', 'public', 'paid'] as const).map(kind => <ChoiceTile key={kind} icon={kind === 'private' ? 'key' : kind === 'paid' ? 'dollar-sign' : 'map-pin'} label={COMMERCIAL_PARKING_LABELS[kind][index]} selected={value.parkingTypes?.includes(kind) === true} onPress={() => onChange({ ...value, parkingTypes: value.parkingTypes?.includes(kind) ? value.parkingTypes.filter(item => item !== kind) : [...value.parkingTypes ?? [], kind] })} testID={`commercial-parking-${kind}`} />)}</ChoiceGrid>
  </View>;
}
