import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { PROPERTY_TYPES, type PropertyType, type RequirementOccupancy, type RequirementPurpose, type SeekerRequirement, type ResidentialAmenity, type CatalogPreference, type FloorUse, RESIDENTIAL_AMENITIES } from '@workspace/property-domain';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { ChoiceChip } from '@/components/ChoiceChip';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { KuwaitAreaSelector } from '@/components/KuwaitAreaSelector';
import { RequirementCatalogPreferences } from '@/components/RequirementCatalogPreferences';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { MARKET_CONFIG } from '@/constants/market';
import { generateDomainId } from '@/services/identity';
import { store } from '@/services/persistence';
import { buildPersonRequirement, formValuesFromRequirement, parseOptionalRequirementNumber } from '@/services/personRequirementWorkflow';
import { getApplicablePropertyFormFields } from '@/services/propertyFormCatalog';
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
  bbq_area: { en: 'BBQ area', ar: 'منطقة شواء' },
  swimmingPool: { en: 'Swimming pool', ar: 'مسبح' },
  gym: { en: 'Gym', ar: 'جيم' },
  seaView: { en: 'Sea view', ar: 'إطلالة بحرية' },
  centralAC: { en: 'Central A/C', ar: 'تكييف مركزي' },
};
const MATCHING_SERVICES = ['swimmingPool', 'gym', 'seaView', 'centralAC'] as const;
const STEPS = ['purpose', 'type', 'areas', 'budget', 'details', 'notes'] as const;
export default function RequirementEditor() {
  const { requirementId, seekerId } = useLocalSearchParams<{ requirementId: string; seekerId?: string }>();
  const editing = requirementId !== 'new'; const router = useRouter(); const colors = useColors(); const insets = useSafeAreaInsets(); const { t, isRTL, language, fonts } = useI18n();
  const recordScopeKey = editing ? `requirement:${requirementId}` : `requirement:new:owner:${seekerId ?? 'missing'}`;
  const [baseline, setBaseline] = useState<SeekerRequirement | null>(null); const [step, setStep] = useState(0); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [purpose, setPurpose] = useState<RequirementPurpose>('rent'); const [propertyType, setPropertyType] = useState<PropertyType>('apartment'); const [areas, setAreas] = useState<string[]>([]);
  const [minimum, setMinimum] = useState(''); const [maximum, setMaximum] = useState(''); const [currencyCode, setCurrencyCode] = useState<string>(MARKET_CONFIG.currencyCode); const [bedrooms, setBedrooms] = useState(''); const [bathrooms, setBathrooms] = useState(''); const [occupancy, setOccupancy] = useState<RequirementOccupancy | undefined>(); const [rentalPeriodId, setRentalPeriodId] = useState<'monthly' | 'yearly'>('monthly'); const [services, setServices] = useState<string[]>([]); const [preferredAmenities, setPreferredAmenities] = useState<readonly ResidentialAmenity[] | undefined>(); const [catalogPreferences, setCatalogPreferences] = useState<readonly CatalogPreference[]>([]); const [floorUse, setFloorUse] = useState<FloorUse | undefined>(); const [notes, setNotes] = useState('');
  const [quickPickValueScopeKey, setQuickPickValueScopeKey] = useState(recordScopeKey);
  const [quickPickValidation, setQuickPickValidation] = useState(() => createQuickPickValidationScope<'bedrooms' | 'bathrooms'>(recordScopeKey));
  const [invalidCatalogFields, setInvalidCatalogFields] = useState<ReadonlySet<string>>(new Set());
  const propertyTypeRef = useRef(propertyType); const preferredAmenitiesRef = useRef(preferredAmenities); const pendingTypeTransition = useRef<RequirementTransitionProposal | null>(null); const mounted = useRef(true); const saveFlight = useRef(false); const draftId = useRef(editing ? requirementId : generateDomainId()); const hydratedRequirementId = useRef<string | null>(null);
  propertyTypeRef.current = propertyType; preferredAmenitiesRef.current = preferredAmenities;
  useEffect(() => () => { mounted.current = false; pendingTypeTransition.current = null; }, []);
  useEffect(() => {
    // A route/context refresh must not erase a hydrated edit while its ID is unchanged.
    if (editing && hydratedRequirementId.current === requirementId) return;
    pendingTypeTransition.current = null;
    draftId.current = editing ? requirementId : generateDomainId();
    setQuickPickValueScopeKey(recordScopeKey);
    setQuickPickValidation(createQuickPickValidationScope(recordScopeKey));
    setInvalidCatalogFields(new Set());
    setBedrooms('');
    setBathrooms('');
    setPreferredAmenities(undefined);
    setCatalogPreferences([]);
    setFloorUse(undefined);
    setBaseline(null);
  }, [recordScopeKey, editing, requirementId]);
  useEffect(() => { if (!editing || hydratedRequirementId.current === requirementId) return; let cancelled = false; setBaseline(null); void store.getRequirement(requirementId).then(value => { if (cancelled) return; if (!value) { setError(t('requirements.not_found')); return; } hydratedRequirementId.current = requirementId; setBaseline(value); const form = formValuesFromRequirement(value); setPurpose(form.purpose); setPropertyType(form.propertyType); setAreas([...form.preferredAreaIds]); setMinimum(form.minimumBudget === undefined ? '' : String(form.minimumBudget)); setMaximum(form.maximumBudget === undefined ? '' : String(form.maximumBudget)); setCurrencyCode(form.currencyCode); setBedrooms(form.bedroomsMinimum === undefined ? '' : String(form.bedroomsMinimum)); setBathrooms(form.bathroomsMinimum === undefined ? '' : String(form.bathroomsMinimum)); setOccupancy(form.occupancy); setRentalPeriodId(form.rentalPeriodId ?? 'monthly'); setPreferredAmenities(value.preferredAmenities); setCatalogPreferences(form.catalogPreferences ?? []); setFloorUse(form.floorUse); setQuickPickValueScopeKey(recordScopeKey); setServices(['swimmingPool', 'gym', 'seaView', 'centralAC'].flatMap(key => form[key as keyof typeof form] === true ? [key] : form[key as keyof typeof form] === false ? [`no:${key}`] : [])); setNotes(form.notes); }); return () => { cancelled = true; }; }, [editing, requirementId, recordScopeKey, t]);
  const incompatibleCatalogFields = (nextType: PropertyType, nextFloor = floorUse) => {
    const applicable = new Set(getApplicablePropertyFormFields(nextType, nextFloor).map(item => item.field));
    return catalogPreferences.filter(item => !applicable.has(item.field));
  };
  const confirmTransition = (message: string, onConfirm: () => void, onCancel?: () => void) => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(message)) onConfirm(); else onCancel?.();
      return;
    }
    Alert.alert(t('transition.requirement.title'), message, [
      { text: t('capture.cancel'), style: 'cancel' },
      { text: t('transition.remove_confirm'), style: 'destructive', onPress: onConfirm },
    ]);
  };
  const changePurpose = (next: RequirementPurpose) => {
    if (next === purpose) return;
    const hasRentOnly = bedrooms.trim() || bathrooms.trim() || occupancy !== undefined || services.length > 0 || rentalPeriodId === 'yearly';
    if (purpose === 'rent' && next === 'buy' && hasRentOnly) {
      confirmTransition(language === 'ar' ? 'سيؤدي التغيير إلى الشراء إلى إزالة تفضيلات الإيجار.' : 'Switching to buy removes rent-only preferences.', () => { setPurpose(next); setBedrooms(''); setBathrooms(''); setOccupancy(undefined); setRentalPeriodId('monthly'); setServices([]); });
      return;
    }
    setPurpose(next);
  };
  const changeFloorUse = (next: FloorUse) => {
    if (next === floorUse) return;
    const affected = incompatibleCatalogFields('floor', next);
    const apply = () => { setFloorUse(next); setCatalogPreferences(current => current.filter(item => !affected.some(value => value.field === item.field))); };
    if (!affected.length) { apply(); return; }
    confirmTransition(language === 'ar' ? 'سيؤدي تغيير استخدام الدور إلى إزالة بعض التفضيلات غير المتوافقة.' : 'Changing floor use removes incompatible preferences.', apply);
  };
  const changePropertyType = (nextType: PropertyType) => {
    pendingTypeTransition.current = null;
    const affectedCatalog = incompatibleCatalogFields(nextType);
    const applyCatalog = () => {
      setPropertyType(nextType);
      if (nextType !== 'floor') setFloorUse(undefined);
      if (affectedCatalog.length) setCatalogPreferences(current => current.filter(item => !affectedCatalog.some(value => value.field === item.field)));
    };
    if (supportsRequirementAmenities(nextType)) {
      if (!affectedCatalog.length) { applyCatalog(); return; }
      confirmTransition(language === 'ar' ? 'سيؤدي تغيير النوع إلى إزالة بعض التفضيلات غير المتوافقة.' : 'Changing property type removes incompatible preferences.', applyCatalog);
      return;
    }
    const proposal = createRequirementTransitionProposal(recordScopeKey, propertyType, preferredAmenities, nextType);
    if (!proposal) {
      applyCatalog();
      if (preferredAmenities !== undefined) setPreferredAmenities(undefined);
      return;
    }
    pendingTypeTransition.current = proposal;
    const details = proposal.affected.map(amenity => AMENITY_LABELS[amenity][language === 'ar' ? 'ar' : 'en']).join('\n');
    const invalidate = () => { if (pendingTypeTransition.current === proposal) pendingTypeTransition.current = null; };
    const applyAmenity = () => {
          if (!mounted.current || pendingTypeTransition.current !== proposal) return;
          pendingTypeTransition.current = null;
          const next = applyRequirementTransition(recordScopeKey, propertyTypeRef.current, preferredAmenitiesRef.current, proposal);
          if (!next) return;
          propertyTypeRef.current = next.propertyType; preferredAmenitiesRef.current = undefined;
           setPropertyType(next.propertyType); setPreferredAmenities(undefined);
           if (affectedCatalog.length) setCatalogPreferences(current => current.filter(item => !affectedCatalog.some(value => value.field === item.field)));
          setQuickPickValidation(createQuickPickValidationScope(recordScopeKey));
    };
    confirmTransition(`${t('transition.requirement.message')}\n\n${details}\n\n${t('transition.draft_only')}`, applyAmenity, invalidate);
  };
  const cancel = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const ownerId = baseline?.seekerId ?? seekerId;
    router.replace((ownerId ? `/person/${encodeURIComponent(ownerId)}` : '/people') as never);
  };
  const save = async () => {
    if (saveFlight.current) return;
    saveFlight.current = true;
    try {
      if (editing && baseline?.id !== requirementId) { setError(t('requirements.not_found')); return; }
      const ownerId = baseline?.seekerId ?? seekerId;
      if (!ownerId) { setError(t('requirements.invalid_owner')); return; }
       if ((isRequirementNumericQuickPickSurface(purpose, propertyType) && hasPendingInvalidQuickPickForScope(quickPickValidation, recordScopeKey)) || invalidCatalogFields.size > 0) { setError(t('requirements.invalid_number')); return; }
      const parsedMinimum = parseOptionalRequirementNumber(minimum);
      const parsedMaximum = parseOptionalRequirementNumber(maximum);
      const parsedBedrooms = parseOptionalRequirementNumber(bedrooms, { integer: true });
      const parsedBathrooms = parseOptionalRequirementNumber(bathrooms, { integer: true });
      if (!parsedMinimum.ok || !parsedMaximum.ok || !parsedBedrooms.ok || !parsedBathrooms.ok) { setError(t('requirements.invalid_number')); return; }
       const result = buildPersonRequirement(baseline?.id ?? draftId.current, ownerId, {
        purpose, propertyType, preferredAreaIds: areas,
        minimumBudget: parsedMinimum.value, maximumBudget: parsedMaximum.value,
        currencyCode, notes,
         ...(purpose === 'rent' ? {
          ...(parsedBedrooms.value !== undefined ? { bedroomsMinimum: parsedBedrooms.value } : {}),
          ...(parsedBathrooms.value !== undefined ? { bathroomsMinimum: parsedBathrooms.value } : {}),
          ...(occupancy ? { occupancy } : {}),
          rentalPeriodId,
           ...(services.includes('swimmingPool') || services.includes('no:swimmingPool') ? { swimmingPool: services.includes('swimmingPool') } : {}),
           ...(services.includes('gym') || services.includes('no:gym') ? { gym: services.includes('gym') } : {}),
           ...(services.includes('seaView') || services.includes('no:seaView') ? { seaView: services.includes('seaView') } : {}),
           ...(services.includes('centralAC') || services.includes('no:centralAC') ? { centralAC: services.includes('centralAC') } : {}),
        } : {}),
        ...(preferredAmenities !== undefined ? { preferredAmenities } : {}),
         ...(catalogPreferences.length ? { catalogPreferences } : {}),
         ...(floorUse !== undefined ? { floorUse } : {}),
      });
      if (!result.ok) { setError(t(`requirements.error.${result.issues[0].code}`)); return; }
      setSaving(true);
      try {
        if (baseline) {
          if (!await store.updateRequirement(baseline, result.value)) throw new Error('REQUIREMENT_CHANGED');
        } else {
          await store.saveRequirement(result.value);
        }
        router.replace({
          pathname: '/person/[personId]',
          params: { personId: ownerId, requirementSaved: '1' },
        } as never);
      } catch {
        setError(t('requirements.save_failed'));
      } finally {
        setSaving(false);
      }
    } finally {
      saveFlight.current = false;
    }
  };
  const reviewCatalog = catalogPreferences.map(preference => {
    const definition = getApplicablePropertyFormFields(propertyType, floorUse).find(item => item.field === preference.field);
    const label = definition?.label[language === 'ar' ? 1 : 0] ?? preference.field;
    const value = preference.kind === 'number'
      ? `${preference.comparison === 'minimum' ? '≥' : preference.comparison === 'maximum' ? '≤' : '='} ${preference.value}`
      : preference.kind === 'feature' ? (preference.value ? (language === 'ar' ? 'نعم' : 'Yes') : (language === 'ar' ? 'لا' : 'No'))
      : preference.value;
    return `${label}: ${value}`;
  });
  const reviewAmenities = [
    ...(preferredAmenities ?? []).map(amenity => AMENITY_LABELS[amenity]?.[language === 'ar' ? 'ar' : 'en'] ?? amenity),
    ...MATCHING_SERVICES.filter(service => services.includes(service)).map(service => AMENITY_LABELS[service][language === 'ar' ? 'ar' : 'en']),
  ];
  const reviewLines = [
    `${language === 'ar' ? 'الميزانية' : 'Budget'}: ${minimum || '—'}–${maximum || '—'} ${currencyCode}${purpose === 'rent' ? ` (${language === 'ar' ? 'شهري' : 'monthly'})` : ''}`,
    `${language === 'ar' ? 'المناطق' : 'Areas'}: ${areas.length ? areas.join(', ') : (language === 'ar' ? 'غير محددة' : 'Not specified')}`,
    ...(floorUse ? [`${language === 'ar' ? 'استخدام الدور' : 'Floor use'}: ${floorUse === 'residential' ? (language === 'ar' ? 'سكني' : 'Residential') : (language === 'ar' ? 'تجاري' : 'Commercial')}`] : []),
    ...(purpose === 'rent' ? [
      `${language === 'ar' ? 'غرف النوم' : 'Bedrooms'}: ${bedrooms || '—'}`,
      `${language === 'ar' ? 'الحمامات' : 'Bathrooms'}: ${bathrooms || '—'}`,
      `${language === 'ar' ? 'الإشغال' : 'Occupancy'}: ${occupancy ?? (language === 'ar' ? 'غير محدد' : 'Not specified')}`,
      `${language === 'ar' ? 'الدورية' : 'Cadence'}: ${rentalPeriodId === 'yearly' ? (language === 'ar' ? 'سنوياً' : 'Yearly') : (language === 'ar' ? 'شهرياً' : 'Monthly')}`,
      `${language === 'ar' ? 'خدمات المطابقة' : 'Rent services'}: ${MATCHING_SERVICES.filter(service => services.includes(service)).map(service => AMENITY_LABELS[service][language === 'ar' ? 'ar' : 'en']).join(', ') || (language === 'ar' ? 'لا شيء' : 'None')}`,
    ] : []),
    `${language === 'ar' ? 'المزايا' : 'Amenities'}: ${reviewAmenities.join(', ') || (language === 'ar' ? 'لا شيء' : 'None')}`,
    `${language === 'ar' ? 'تفضيلات المواصفات' : 'Catalog preferences'}: ${reviewCatalog.join('; ') || (language === 'ar' ? 'لا شيء' : 'None')}`,
  ];
  const choice = (selected: boolean) => [styles.choice, { backgroundColor: selected ? colors.accent : colors.card, borderColor: selected ? colors.turquoise : colors.border }];
  return <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}><View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><TouchableOpacity onPress={cancel}><Text style={{ color: colors.primary }}>{t('capture.cancel')}</Text></TouchableOpacity><Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{editing ? t('requirements.edit') : t('requirements.add')}</Text><Text style={{ color: colors.mutedForeground }}>{step + 1}/{STEPS.length}</Text></View><KeyboardAvoidingView behavior="padding" style={styles.body}><KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} bottomOffset={80} keyboardShouldPersistTaps="handled">
     {error ? <Text style={{ color: colors.destructive }} testID="requirement-error">{error}</Text> : null}
     {purpose === 'rent' && step === 4 && <View style={styles.choicesWrap}>{(['monthly', 'yearly'] as const).map(value => <ChoiceChip key={value} label={value === 'monthly' ? (language === 'ar' ? 'شهرياً' : 'Monthly') : (language === 'ar' ? 'سنوياً' : 'Yearly')} selected={rentalPeriodId === value} onPress={() => setRentalPeriodId(value)} testID={`requirement-rental-period-${value}`} role="radio" />)}</View>}
     {step === 0 && <><Text style={[styles.heading, { color: colors.foreground }]}>{t('requirements.purpose')}</Text><View style={styles.choicesWrap}>{(['rent', 'buy'] as const).map(value => <ChoiceChip key={value} label={t(`requirements.purpose.${value}`)} selected={purpose === value} onPress={() => changePurpose(value)} testID={`requirement-purpose-${value}`} role="radio" />)}</View></>}
     {step === 1 && <><Text style={[styles.heading, { color: colors.foreground }]}>{t('requirements.property_type')}</Text><View style={styles.choicesWrap}>{PROPERTY_TYPES.map(value => <ChoiceChip key={value} label={t(`propertyType.${value}`)} selected={propertyType === value} onPress={() => changePropertyType(value)} testID={`requirement-type-${value}`} role="radio" />)}</View>{propertyType === 'floor' && <><Text style={[styles.heading, { color: colors.foreground, marginTop: 14 }]}>{language === 'ar' ? 'استخدام الدور' : 'Floor use'}</Text><View style={styles.choicesWrap}>{(['residential', 'commercial'] as const).map(value => <ChoiceChip key={value} label={value === 'residential' ? (language === 'ar' ? 'سكني' : 'Residential') : (language === 'ar' ? 'تجاري' : 'Commercial')} selected={floorUse === value} onPress={() => changeFloorUse(value)} testID={`requirement-floor-use-${value}`} role="radio" />)}</View></>}</>}
     {step === 2 && <><Text style={[styles.heading, { color: colors.foreground }]}>{t('requirements.areas')}</Text><KuwaitAreaSelector selectedIds={areas} onChange={setAreas} multiSelect testID="requirement-area-selector" /></>}
     {step === 3 && <><Text style={[styles.heading, { color: colors.foreground }]}>{t('requirements.budget')}</Text><TextInput value={minimum} onChangeText={setMinimum} keyboardType="numeric" placeholder={t('requirements.budget_from')} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} testID="requirement-budget-min"/><TextInput value={maximum} onChangeText={setMaximum} keyboardType="numeric" placeholder={t('requirements.budget_to')} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} testID="requirement-budget-max"/><Text style={{ color: colors.mutedForeground }}>{currencyCode}{purpose === 'rent' ? ` · ${language === 'ar' ? 'شهري' : 'monthly'}` : ''}</Text></>}
     {step === 4 && <><Text style={[styles.heading, { color: colors.foreground }]}>{language === 'ar' ? 'تفضيلات مواصفات العقار' : 'Property preferences'}</Text><RequirementCatalogPreferences scopeKey={recordScopeKey} propertyType={propertyType} floorUse={floorUse} values={catalogPreferences} onChange={setCatalogPreferences} onInvalidChange={(field, invalid) => setInvalidCatalogFields(current => { const next = new Set(current); if (invalid) next.add(field); else next.delete(field); return next; })}/>{['apartment', 'house', 'villa', 'chalet'].includes(propertyType) && <><Text style={[styles.heading, { color: colors.foreground, marginTop: 18 }]}>{language === 'ar' ? 'المزايا المفضلة' : 'Preferred amenities'}</Text><View style={[styles.choicesWrap, { marginBottom: 20 }]}>{([...RESIDENTIAL_AMENITIES, ...(purpose === 'rent' ? MATCHING_SERVICES : [])]).map(amenity => { const isService = (MATCHING_SERVICES as readonly string[]).includes(amenity); const isSelected = isService ? services.includes(amenity) : preferredAmenities?.includes(amenity as ResidentialAmenity) ?? false; const label = AMENITY_LABELS[amenity][language === 'ar' ? 'ar' : 'en']; return <TouchableOpacity key={amenity} onPress={() => { if (isService) { setServices(current => isSelected ? current.filter(a => a !== amenity) : [...current, amenity]); } else { const current = preferredAmenities ?? []; setPreferredAmenities(isSelected ? current.filter(a => a !== amenity) : [...current, amenity as ResidentialAmenity]); } }} accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }} style={[styles.choice, { backgroundColor: isSelected ? colors.primary + '11' : colors.card, borderColor: isSelected ? colors.primary : colors.border, paddingLeft: isSelected ? 12 : 14, paddingRight: isSelected ? 12 : 14 }]}><View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>{isSelected && <Feather name="check" size={14} color={colors.primary} />}<Text style={{ color: isSelected ? colors.primary : colors.foreground, fontFamily: isSelected ? fonts.semiBold : fonts.medium, fontSize: 15 }}>{label}</Text></View></TouchableOpacity>; })}</View></>}{purpose === 'rent' ? <><Text style={[styles.heading, { color: colors.foreground }]}>{t('matching.rentDetails')}</Text>{isRequirementNumericQuickPickSurface(purpose, propertyType) ? <><NumericQuickPick scopeKey={recordScopeKey} label={language === 'ar' ? 'الحد الأدنى لغرف النوم' : 'Minimum bedrooms'} value={quickPickValueScopeKey === recordScopeKey ? bedrooms : ''} onChangeText={setBedrooms} onPendingValidityChange={(sourceScopeKey, invalid) => setQuickPickValidation(current => updateScopedInvalidQuickPickFields(current, recordScopeKey, sourceScopeKey, 'bedrooms', invalid))} testID="requirement-bedrooms-quick-pick"/><NumericQuickPick scopeKey={recordScopeKey} label={language === 'ar' ? 'الحد الأدنى للحمامات' : 'Minimum bathrooms'} value={quickPickValueScopeKey === recordScopeKey ? bathrooms : ''} onChangeText={setBathrooms} onPendingValidityChange={(sourceScopeKey, invalid) => setQuickPickValidation(current => updateScopedInvalidQuickPickFields(current, recordScopeKey, sourceScopeKey, 'bathrooms', invalid))} testID="requirement-bathrooms-quick-pick"/></> : <><TextInput value={bedrooms} onChangeText={setBedrooms} keyboardType="numeric" placeholder={t('matching.bedrooms')} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}/><TextInput value={bathrooms} onChangeText={setBathrooms} keyboardType="numeric" placeholder={t('matching.bathrooms')} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}/></>}<Text style={{ color: colors.foreground }}>{t('matching.occupancy')}</Text><View style={styles.choicesWrap}>{(['family', 'bachelor', 'any'] as const).map(value => <ChoiceChip key={value} label={t(`matching.occupancy.${value}`)} selected={occupancy === value} onPress={() => setOccupancy(current => current === value ? undefined : value)} role="radio" />)}</View></> : <Text style={{ color: colors.mutedForeground }}>{t('requirements.buy_no_rent_details')}</Text>}</>}
     {step === 5 && <><Text style={[styles.heading, { color: colors.foreground }]}>{language === 'ar' ? 'مراجعة التفضيلات' : 'Review preferences'}</Text><Text style={{ color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }}>{`${purpose === 'rent' ? (language === 'ar' ? 'إيجار' : 'Rent') : (language === 'ar' ? 'شراء' : 'Buy')} · ${t(`propertyType.${propertyType}`)}`}</Text>{reviewLines.map(line => <Text key={line} style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>{line}</Text>)}<Text style={[styles.heading, { color: colors.foreground, marginTop: 14 }]}>{t('requirements.notes')}</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input, styles.notes, { color: colors.foreground, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]} testID="requirement-notes"/></>}
  </KeyboardAwareScrollViewCompat><View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}><View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>{step > 0 && <Button title={t('capture.back')} onPress={() => { setError(''); setStep(value => value - 1); }} variant="outline" style={styles.flex}/>}<Button title={step === STEPS.length - 1 ? t('requirements.save') : t('capture.next')} onPress={() => step === STEPS.length - 1 ? void save() : setStep(value => value + 1)} loading={saving} style={styles.flex} testID={step === STEPS.length - 1 ? 'requirement-save' : 'requirement-next'}/></View></View></KeyboardAvoidingView></View>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, body: { flex: 1 }, header: { alignItems: 'center', justifyContent: 'space-between', padding: 20 }, title: { fontSize: 19 }, content: { padding: 20, gap: 10 }, heading: { fontSize: 21, marginBottom: 8 }, choicesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, choice: { minHeight: 48, borderWidth: 1, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 14 }, input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 }, notes: { minHeight: 120, paddingTop: 14, textAlignVertical: 'top' }, area: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center', flexDirection: 'row', gap: 14 }, footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12 }, actions: { gap: 10 }, flex: { flex: 1 } });
