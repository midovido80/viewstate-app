import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { PROPERTY_TYPES, type PropertyType, type RequirementOccupancy, type RequirementPurpose, type SeekerRequirement, type ResidentialAmenity, RESIDENTIAL_AMENITIES } from '@workspace/property-domain';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { ChoiceChip } from '@/components/ChoiceChip';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { KUWAIT_AREAS, getAreaById, searchAreas } from '@/constants/kuwait-areas';
import { MARKET_CONFIG } from '@/constants/market';
import { generateDomainId } from '@/services/identity';
import { store } from '@/services/persistence';
import { buildPersonRequirement, formValuesFromRequirement, parseOptionalRequirementNumber } from '@/services/personRequirementWorkflow';
import { createQuickPickValidationScope, hasPendingInvalidQuickPickForScope, isRequirementNumericQuickPickSurface, updateScopedInvalidQuickPickFields } from '@/services/numericQuickPick';
import {
  applyRequirementTransition,
  createRequirementTransitionProposal,
  supportsRequirementAmenities,
  type RequirementTransitionProposal,
} from '@/services/amenityTypeTransitions';


const AMENITY_LABELS: Record<string, { en: string; ar: string }> = {
  heating: { en: 'Heating', ar: 'تدفئة' },
  balcony: { en: 'Balcony', ar: 'بلكونة' },
  maid_room: { en: 'Maid room', ar: 'غرفة خادمة' },
  laundry_room: { en: 'Laundry room', ar: 'غرفة غسيل' },
  solar_heater: { en: 'Solar heater', ar: 'سخان شمسي' },
  elevator: { en: 'Elevator', ar: 'مصعد' },
  garden: { en: 'Garden', ar: 'حديقة' },
  security_guard: { en: 'Security / Guard', ar: 'أمن / حارس' },
  bbq_area: { en: 'BBQ area', ar: 'منطقة شواء' }
};
const STEPS = ['purpose', 'type', 'areas', 'budget', 'details', 'notes'] as const;
export default function RequirementEditor() {
  const { requirementId, seekerId } = useLocalSearchParams<{ requirementId: string; seekerId?: string }>();
  const editing = requirementId !== 'new'; const router = useRouter(); const colors = useColors(); const insets = useSafeAreaInsets(); const { t, isRTL, language, fonts } = useI18n();
  const recordScopeKey = editing ? `requirement:${requirementId}` : `requirement:new:owner:${seekerId ?? 'missing'}`;
  const [baseline, setBaseline] = useState<SeekerRequirement | null>(null); const [step, setStep] = useState(0); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [purpose, setPurpose] = useState<RequirementPurpose>('rent'); const [propertyType, setPropertyType] = useState<PropertyType>('apartment'); const [areas, setAreas] = useState<string[]>([]); const [search, setSearch] = useState('');
  const [minimum, setMinimum] = useState(''); const [maximum, setMaximum] = useState(''); const [currencyCode, setCurrencyCode] = useState<string>(MARKET_CONFIG.currencyCode); const [bedrooms, setBedrooms] = useState(''); const [bathrooms, setBathrooms] = useState(''); const [occupancy, setOccupancy] = useState<RequirementOccupancy | undefined>(); const [services, setServices] = useState<string[]>([]); const [preferredAmenities, setPreferredAmenities] = useState<readonly ResidentialAmenity[] | undefined>(); const [notes, setNotes] = useState('');
  const [quickPickValueScopeKey, setQuickPickValueScopeKey] = useState(recordScopeKey);
  const [quickPickValidation, setQuickPickValidation] = useState(() => createQuickPickValidationScope<'bedrooms' | 'bathrooms'>(recordScopeKey));
  const propertyTypeRef = useRef(propertyType); const preferredAmenitiesRef = useRef(preferredAmenities); const pendingTypeTransition = useRef<RequirementTransitionProposal | null>(null); const mounted = useRef(true);
  propertyTypeRef.current = propertyType; preferredAmenitiesRef.current = preferredAmenities;
  useEffect(() => () => { mounted.current = false; pendingTypeTransition.current = null; }, []);
  useEffect(() => { pendingTypeTransition.current = null; setQuickPickValueScopeKey(recordScopeKey); setQuickPickValidation(createQuickPickValidationScope(recordScopeKey)); setBedrooms(''); setBathrooms(''); setPreferredAmenities(undefined); setBaseline(null); }, [recordScopeKey]);
  useEffect(() => { if (!editing) return; let cancelled = false; setBaseline(null); void store.getRequirement(requirementId).then(value => { if (cancelled) return; if (!value) { setError(t('requirements.not_found')); return; } setBaseline(value); const form = formValuesFromRequirement(value); setPurpose(form.purpose); setPropertyType(form.propertyType); setAreas([...form.preferredAreaIds]); setMinimum(String(form.minimumBudget)); setMaximum(String(form.maximumBudget)); setCurrencyCode(form.currencyCode); setBedrooms(form.bedroomsMinimum === undefined ? '' : String(form.bedroomsMinimum)); setBathrooms(form.bathroomsMinimum === undefined ? '' : String(form.bathroomsMinimum)); setOccupancy(form.occupancy); setPreferredAmenities(value.preferredAmenities); setServices(['swimmingPool', 'gym', 'seaView', 'centralAC'].filter(key => form[key as keyof typeof form] === true)); setNotes(form.notes); }); return () => { cancelled = true; }; }, [editing, requirementId, t]);
  const visibleAreas = useMemo(() => search.trim() ? searchAreas(search).filter(area => !areas.includes(area.id)).slice(0, 8) : KUWAIT_AREAS.filter(area => !areas.includes(area.id)).slice(0, 8), [search, areas]);
  const move = (index: number, delta: number) => { const target = index + delta; if (target < 0 || target >= areas.length) return; const next = [...areas]; [next[index], next[target]] = [next[target], next[index]]; setAreas(next); };
  const changePropertyType = (nextType: PropertyType) => {
    pendingTypeTransition.current = null;
    if (supportsRequirementAmenities(nextType)) { setPropertyType(nextType); return; }
    const proposal = createRequirementTransitionProposal(recordScopeKey, propertyType, preferredAmenities, nextType);
    if (!proposal) {
      setPropertyType(nextType);
      if (preferredAmenities !== undefined) setPreferredAmenities(undefined);
      return;
    }
    pendingTypeTransition.current = proposal;
    const details = proposal.affected.map(amenity => AMENITY_LABELS[amenity][language === 'ar' ? 'ar' : 'en']).join('\n');
    const invalidate = () => { if (pendingTypeTransition.current === proposal) pendingTypeTransition.current = null; };
    Alert.alert(
      t('transition.requirement.title'),
      `${t('transition.requirement.message')}\n\n${details}\n\n${t('transition.draft_only')}`,
      [
        { text: t('capture.cancel'), style: 'cancel', onPress: invalidate },
        { text: t('transition.remove_confirm'), style: 'destructive', onPress: () => {
          if (!mounted.current || pendingTypeTransition.current !== proposal) return;
          pendingTypeTransition.current = null;
          const next = applyRequirementTransition(recordScopeKey, propertyTypeRef.current, preferredAmenitiesRef.current, proposal);
          if (!next) return;
          propertyTypeRef.current = next.propertyType; preferredAmenitiesRef.current = undefined;
          setPropertyType(next.propertyType); setPreferredAmenities(undefined);
          setQuickPickValidation(createQuickPickValidationScope(recordScopeKey));
        } },
      ],
      { cancelable: true, onDismiss: invalidate },
    );
  };
  const cancel = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const ownerId = baseline?.seekerId ?? seekerId;
    router.replace((ownerId ? `/person/${encodeURIComponent(ownerId)}` : '/people') as never);
  };
  const save = async () => { if (editing && baseline?.id !== requirementId) { setError(t('requirements.not_found')); return; } const ownerId = baseline?.seekerId ?? seekerId; if (!ownerId) { setError(t('requirements.invalid_owner')); return; } if (isRequirementNumericQuickPickSurface(purpose, propertyType) && hasPendingInvalidQuickPickForScope(quickPickValidation, recordScopeKey)) { setError(t('requirements.invalid_number')); return; } const parsedMinimum = parseOptionalRequirementNumber(minimum); const parsedMaximum = parseOptionalRequirementNumber(maximum); const parsedBedrooms = parseOptionalRequirementNumber(bedrooms, { integer: true }); const parsedBathrooms = parseOptionalRequirementNumber(bathrooms, { integer: true }); if (!parsedMinimum.ok || !parsedMaximum.ok || !parsedBedrooms.ok || !parsedBathrooms.ok) { setError(t('requirements.invalid_number')); return; } const result = buildPersonRequirement(baseline?.id ?? generateDomainId(), ownerId, { purpose, propertyType, preferredAreaIds: areas, minimumBudget: parsedMinimum.value, maximumBudget: parsedMaximum.value, currencyCode, notes, ...(purpose === 'rent' ? { ...(parsedBedrooms.value !== undefined ? { bedroomsMinimum: parsedBedrooms.value } : {}), ...(parsedBathrooms.value !== undefined ? { bathroomsMinimum: parsedBathrooms.value } : {}), ...(occupancy ? { occupancy } : {}), swimmingPool: services.includes('swimmingPool'), gym: services.includes('gym'), seaView: services.includes('seaView'), centralAC: services.includes('centralAC') } : {}), ...(preferredAmenities !== undefined ? { preferredAmenities } : {}) }); if (!result.ok) { setError(t(`requirements.error.${result.issues[0].code}`)); return; } setSaving(true); try { if (baseline) { if (!await store.updateRequirement(baseline, result.value)) throw new Error('REQUIREMENT_CHANGED'); } else await store.saveRequirement(result.value); router.replace(`/person/${encodeURIComponent(ownerId)}` as never); } catch { setError(t('requirements.save_failed')); } finally { setSaving(false); } };
  const choice = (selected: boolean) => [styles.choice, { backgroundColor: selected ? colors.accent : colors.card, borderColor: selected ? colors.turquoise : colors.border }];
  return <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}><View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><TouchableOpacity onPress={cancel}><Text style={{ color: colors.primary }}>{t('capture.cancel')}</Text></TouchableOpacity><Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{editing ? t('requirements.edit') : t('requirements.add')}</Text><Text style={{ color: colors.mutedForeground }}>{step + 1}/{STEPS.length}</Text></View><KeyboardAvoidingView behavior="padding" style={styles.body}><KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} bottomOffset={80} keyboardShouldPersistTaps="handled">
    {error ? <Text style={{ color: colors.destructive }} testID="requirement-error">{error}</Text> : null}
    {step === 0 && <><Text style={[styles.heading, { color: colors.foreground }]}>{t('requirements.purpose')}</Text><View style={styles.choicesWrap}>{(['rent', 'buy'] as const).map(value => <ChoiceChip key={value} label={t(`requirements.purpose.${value}`)} selected={purpose === value} onPress={() => setPurpose(value)} testID={`requirement-purpose-${value}`} role="radio" />)}</View></>}
    {step === 1 && <><Text style={[styles.heading, { color: colors.foreground }]}>{t('requirements.property_type')}</Text><View style={styles.choicesWrap}>{PROPERTY_TYPES.map(value => <ChoiceChip key={value} label={t(`propertyType.${value}`)} selected={propertyType === value} onPress={() => changePropertyType(value)} testID={`requirement-type-${value}`} role="radio" />)}</View></>}
    {step === 2 && <><Text style={[styles.heading, { color: colors.foreground }]}>{t('requirements.areas')}</Text>{areas.map((id, index) => { const area = getAreaById(id); return <View key={id} style={[styles.area, { borderColor: colors.border }]}><Text style={{ flex: 1, color: colors.foreground }}>{index + 1}. {area ? (language === 'ar' ? area.ar : area.en) : id}</Text><TouchableOpacity onPress={() => move(index, -1)} disabled={index === 0}><Text style={{ color: colors.primary }}>↑</Text></TouchableOpacity><TouchableOpacity onPress={() => move(index, 1)} disabled={index === areas.length - 1}><Text style={{ color: colors.primary }}>↓</Text></TouchableOpacity><TouchableOpacity onPress={() => setAreas(current => current.filter(value => value !== id))}><Text style={{ color: colors.destructive }}>×</Text></TouchableOpacity></View>; })}<TextInput value={search} onChangeText={setSearch} placeholder={t('matching.areas.search')} style={[styles.input, { color: colors.foreground, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]} /><View style={styles.choicesWrap}>{visibleAreas.map(area => <ChoiceChip key={area.id} label={'+ ' + (language === 'ar' ? area.ar : area.en)} selected={false} onPress={() => { setAreas(current => current.includes(area.id) ? current : [...current, area.id]); setSearch(''); }} role="button" />)}</View></>}
    {step === 3 && <><Text style={[styles.heading, { color: colors.foreground }]}>{t('requirements.budget')}</Text><TextInput value={minimum} onChangeText={setMinimum} keyboardType="numeric" placeholder={t('requirements.budget_from')} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} testID="requirement-budget-min"/><TextInput value={maximum} onChangeText={setMaximum} keyboardType="numeric" placeholder={t('requirements.budget_to')} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} testID="requirement-budget-max"/><Text style={{ color: colors.mutedForeground }}>{currencyCode}</Text></>}
    {step === 4 && <>{['apartment', 'house', 'villa', 'chalet'].includes(propertyType) && <><Text style={[styles.heading, { color: colors.foreground }]}>{language === 'ar' ? 'المزايا المفضلة' : 'Preferred amenities'}</Text><View style={[styles.choicesWrap, { marginBottom: 20 }]}>{RESIDENTIAL_AMENITIES.map(amenity => { const isSelected = preferredAmenities?.includes(amenity) ?? false; const label = AMENITY_LABELS[amenity][language === 'ar' ? 'ar' : 'en']; return <TouchableOpacity key={amenity} onPress={() => { const current = preferredAmenities ?? []; setPreferredAmenities(isSelected ? current.filter(a => a !== amenity) : [...current, amenity]); }} accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }} style={[styles.choice, { backgroundColor: isSelected ? colors.primary + '11' : colors.card, borderColor: isSelected ? colors.primary : colors.border, paddingLeft: isSelected ? 12 : 14, paddingRight: isSelected ? 12 : 14 }]}><View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>{isSelected && <Feather name="check" size={14} color={colors.primary} />}<Text style={{ color: isSelected ? colors.primary : colors.foreground, fontFamily: isSelected ? fonts.semiBold : fonts.medium, fontSize: 15 }}>{label}</Text></View></TouchableOpacity>; })}</View></>}{purpose === 'rent' ? <><Text style={[styles.heading, { color: colors.foreground }]}>{t('matching.rentDetails')}</Text>{isRequirementNumericQuickPickSurface(purpose, propertyType) ? <><NumericQuickPick scopeKey={recordScopeKey} label={language === 'ar' ? 'الحد الأدنى لغرف النوم' : 'Minimum bedrooms'} value={quickPickValueScopeKey === recordScopeKey ? bedrooms : ''} onChangeText={setBedrooms} onPendingValidityChange={(sourceScopeKey, invalid) => setQuickPickValidation(current => updateScopedInvalidQuickPickFields(current, recordScopeKey, sourceScopeKey, 'bedrooms', invalid))} testID="requirement-bedrooms-quick-pick"/><NumericQuickPick scopeKey={recordScopeKey} label={language === 'ar' ? 'الحد الأدنى للحمامات' : 'Minimum bathrooms'} value={quickPickValueScopeKey === recordScopeKey ? bathrooms : ''} onChangeText={setBathrooms} onPendingValidityChange={(sourceScopeKey, invalid) => setQuickPickValidation(current => updateScopedInvalidQuickPickFields(current, recordScopeKey, sourceScopeKey, 'bathrooms', invalid))} testID="requirement-bathrooms-quick-pick"/></> : <><TextInput value={bedrooms} onChangeText={setBedrooms} keyboardType="numeric" placeholder={t('matching.bedrooms')} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}/><TextInput value={bathrooms} onChangeText={setBathrooms} keyboardType="numeric" placeholder={t('matching.bathrooms')} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}/></>}<Text style={{ color: colors.foreground }}>{t('matching.occupancy')}</Text><View style={styles.choicesWrap}>{(['family', 'bachelor', 'any'] as const).map(value => <ChoiceChip key={value} label={t(`matching.occupancy.${value}`)} selected={occupancy === value} onPress={() => setOccupancy(current => current === value ? undefined : value)} role="radio" />)}</View><View style={styles.choicesWrap}>{(['swimmingPool', 'gym', 'seaView', 'centralAC'] as const).map(value => <ChoiceChip key={value} label={t(`requirements.service.${value}`)} selected={services.includes(value)} onPress={() => setServices(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])} role="checkbox" />)}</View></> : <Text style={{ color: colors.mutedForeground }}>{t('requirements.buy_no_rent_details')}</Text>}</>}
    {step === 5 && <><Text style={[styles.heading, { color: colors.foreground }]}>{t('requirements.notes')}</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input, styles.notes, { color: colors.foreground, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]} testID="requirement-notes"/></>}
  </KeyboardAwareScrollViewCompat><View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}><View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>{step > 0 && <Button title={t('capture.back')} onPress={() => { setError(''); setStep(value => value - 1); }} variant="outline" style={styles.flex}/>}<Button title={step === STEPS.length - 1 ? t('requirements.save') : t('capture.next')} onPress={() => step === STEPS.length - 1 ? void save() : setStep(value => value + 1)} loading={saving} style={styles.flex} testID={step === STEPS.length - 1 ? 'requirement-save' : 'requirement-next'}/></View></View></KeyboardAvoidingView></View>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, body: { flex: 1 }, header: { alignItems: 'center', justifyContent: 'space-between', padding: 20 }, title: { fontSize: 19 }, content: { padding: 20, gap: 10 }, heading: { fontSize: 21, marginBottom: 8 }, choicesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, choice: { minHeight: 48, borderWidth: 1, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 14 }, input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 }, notes: { minHeight: 120, paddingTop: 14, textAlignVertical: 'top' }, area: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center', flexDirection: 'row', gap: 14 }, footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12 }, actions: { gap: 10 }, flex: { flex: 1 } });
