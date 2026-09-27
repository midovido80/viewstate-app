import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import {
  PROPERTY_TYPES,
  RESIDENTIAL_AMENITIES,
  type CatalogPreference,
  type FloorUse,
  type PropertyType,
  type RequirementOccupancy,
  type RequirementPurpose,
  type RequirementRentalPeriodId,
  type ResidentialAmenity,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { ChoiceChip } from '@/components/ChoiceChip';
import { KuwaitAreaSelector } from '@/components/KuwaitAreaSelector';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { RequirementCatalogPreferences } from '@/components/RequirementCatalogPreferences';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { MARKET_CONFIG } from '@/constants/market';
import { generateDomainId } from '@/services/identity';
import { store } from '@/services/persistence';
import {
  buildPersonRequirement,
  formValuesFromRequirement,
  parseOptionalRequirementNumber,
  toggleRequirementAmenity,
  type RequirementFormValues,
} from '@/services/personRequirementWorkflow';
import { localizedRequirementIssue } from '@/services/requirementIssueMessage';
import {
  retryRequirementNavigation,
  retryRequirementReadback,
  RequirementRouteGeneration,
  requirementSaveStageDiagnostic,
  savePersonRequirement,
  shouldRenderRequirementRecoveryControls,
  tryStartRequirementSave,
  verifyUncertainRequirementWrite,
} from '@/services/requirementSaveOutcome';
import {
  getGenericRequirementApartmentSubtype,
  getGenericRequirementApartmentSubtypePreference,
  parseGenericRequirementApartmentSubtype,
  getRequirementCatalogFields,
  getRequirementPresentationFields,
  type GenericRequirementApartmentSubtype,
} from '@/services/requirementFieldMap';
import { getAreaById } from '@/constants/kuwait-areas';
import { getApplicablePropertyFormFields } from '@/services/propertyFormCatalog';
import { canHydrateStudioRequirement, getWantedApartmentSubtypeLabel, getWantedStudioContextRows, getWantedStudioDisplayRows, isWantedStudio } from '@/services/propertyDetailPresentation';

const RENT_SERVICES = ['swimmingPool', 'gym', 'seaView'] as const;
const AMENITY_LABELS: Record<string, { en: string; ar: string }> = {
  swimmingPool: { en: 'Swimming pool', ar: 'مسبح' }, gym: { en: 'Gym', ar: 'جيم' },
  seaView: { en: 'Sea view', ar: 'إطلالة بحرية' }, centralAC: { en: 'Central A/C', ar: 'تكييف مركزي' },
  private_roof: { en: 'Private roof', ar: 'سطح خاص' },
};
for (const [id, en, ar] of [
  ['heating', 'Heating', 'تدفئة'], ['balcony', 'Balcony', 'بلكونة'], ['maid_room', 'Maid room', 'غرفة خادمة'],
  ['laundry_room', 'Laundry room', 'غرفة غسيل'], ['solar_heater', 'Solar heater', 'سخان شمسي'],
  ['elevator', 'Elevator', 'مصعد'], ['garden', 'Garden', 'حديقة'], ['security_guard', 'Security / Guard', 'أمن / حارس'], ['bbq_area', 'BBQ area', 'منطقة شواء'],
  ['hasPool', 'Swimming pool', 'مسبح'], ['hasWaterfront', 'Waterfront', 'واجهة مائية'], ['hasColdStorage', 'Cold storage', 'تخزين بارد'],
] as const) AMENITY_LABELS[id] = { en, ar };
const localizedPreferenceName = (value: string, language: string, propertyType: PropertyType, floorUse?: FloorUse) =>
  AMENITY_LABELS[value]?.[language === 'ar' ? 'ar' : 'en']
  ?? ({ Bedrooms: language === 'ar' ? 'غرف النوم' : 'Bedrooms', Bathrooms: language === 'ar' ? 'الحمامات' : 'Bathrooms', 'Master bedrooms': language === 'ar' ? 'غرف النوم الرئيسية' : 'Master bedrooms', 'Living rooms': language === 'ar' ? 'غرف المعيشة' : 'Living rooms', 'Driver room': language === 'ar' ? 'غرفة سائق' : 'Driver room' } as Record<string, string>)[value]
  ?? getRequirementCatalogFields(propertyType, floorUse).find(field => field.field === value)?.label[language === 'ar' ? 1 : 0]
  ?? (value === 'centralAC' ? (language === 'ar' ? 'تكييف مركزي' : 'Central A/C') : value);
const STEPS = ['purpose', 'type', 'areas', 'core', 'budget', 'review'] as const;
type AreaMode = 'specific_areas' | 'all_kuwait';
type Extension = {
  preferredAreaMode?: AreaMode;
  masterBedroomsMinimum?: number;
  driverRoom?: boolean;
  preferredAmenityExclusions?: readonly ResidentialAmenity[];
};
type NumberField = 'bedroomsMinimum' | 'bathroomsMinimum' | 'masterBedroomsMinimum' | 'livingRoomCount' | 'parkingSpaceCount' | 'floorNumber' | 'builtUpAreaSquareMeters';

export function getStudioRequirementRouteTarget(
  requirementId: string,
  studio: boolean,
  hydratable: boolean,
): { readonly kind: 'studio'; readonly href: string } | { readonly kind: 'blocked' } | { readonly kind: 'generic' } {
  if (!studio) return { kind: 'generic' };
  if (!hydratable) return { kind: 'blocked' };
  return {
    kind: 'studio',
    href: `/capture/studio?editRequirementId=${encodeURIComponent(requirementId)}`,
  };
}

const isResidential = (type: PropertyType, floorUse?: FloorUse) =>
  ['apartment', 'house', 'villa', 'chalet'].includes(type) || (type === 'floor' && floorUse === 'residential');
let catalogInvalidBridge: (field: string, invalid: boolean) => void = () => undefined;

export default function RequirementEditor() {
  const { requirementId, seekerId, edit, purpose: purposeParam, propertyType: propertyTypeParam, apartmentSubtype: apartmentSubtypeParam } = useLocalSearchParams<{
    requirementId: string | string[];
    seekerId?: string | string[];
    edit?: string | string[];
    purpose?: string | string[];
    propertyType?: string | string[];
    apartmentSubtype?: string | string[];
  }>();
  const routeRequirementId = Array.isArray(requirementId) ? requirementId[0] : requirementId;
  const editing = routeRequirementId !== 'new';
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const ownerFromRoute = Array.isArray(seekerId) ? seekerId[0] : seekerId;
  const routePurpose = Array.isArray(purposeParam) ? purposeParam[0] : purposeParam;
  const routePropertyType = Array.isArray(propertyTypeParam) ? propertyTypeParam[0] : propertyTypeParam;
  const routeApartmentSubtype = Array.isArray(apartmentSubtypeParam) ? apartmentSubtypeParam[0] : apartmentSubtypeParam;
  const initialPurpose: RequirementPurpose = routePurpose === 'buy' || routePurpose === 'rent' ? routePurpose : 'rent';
  const initialPropertyType: PropertyType = PROPERTY_TYPES.includes(routePropertyType as PropertyType)
    ? routePropertyType as PropertyType
    : 'apartment';
  const initialApartmentSubtype: GenericRequirementApartmentSubtype | undefined =
    parseGenericRequirementApartmentSubtype(routeApartmentSubtype);
  const hasExplicitCatalogSelection = (routePurpose === 'rent' || routePurpose === 'buy')
    && PROPERTY_TYPES.includes(routePropertyType as PropertyType)
    && (routePropertyType !== 'apartment' || initialApartmentSubtype !== undefined);
  const startsAtSpecifications = editing || hasExplicitCatalogSelection;
  const scopeKey = editing ? `requirement:${routeRequirementId}` : `requirement:new:${ownerFromRoute ?? 'missing'}`;
  const [baseline, setBaseline] = useState<SeekerRequirement | null>(null);
  const [recordLoaded, setRecordLoaded] = useState(!editing);
  const [step, setStep] = useState(startsAtSpecifications ? 3 : 0);
  const [showCatalogBackControls, setShowCatalogBackControls] = useState(false);
  const [error, setError] = useState('');
  const [developmentSaveTrace, setDevelopmentSaveTrace] = useState('');
  const saveAttemptNumber = useRef(0);
  const [saving, setSaving] = useState(false);
  const [purpose, setPurpose] = useState<RequirementPurpose>(initialPurpose);
  const [propertyType, setPropertyType] = useState<PropertyType>(initialPropertyType);
  const [apartmentSubtype, setApartmentSubtype] = useState<GenericRequirementApartmentSubtype | undefined>(initialApartmentSubtype);
  const [floorUse, setFloorUse] = useState<FloorUse | undefined>();
  const [areaMode, setAreaMode] = useState<AreaMode | undefined>();
  const [areas, setAreas] = useState<string[]>([]);
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [masterBedrooms, setMasterBedrooms] = useState('');
  const [occupancy, setOccupancy] = useState<RequirementOccupancy | undefined>();
  const [livingRooms, setLivingRooms] = useState('');
  const [parking, setParking] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [requiredArea, setRequiredArea] = useState('');
  const [driverRoom, setDriverRoom] = useState(false);
  const [catalog, setCatalog] = useState<readonly CatalogPreference[]>([]);
  const [invalidCatalogFields, setInvalidCatalogFields] = useState<ReadonlySet<string>>(new Set());
  const [amenities, setAmenities] = useState<readonly ResidentialAmenity[]>([]);
  const [excludedAmenities, setExcludedAmenities] = useState<readonly ResidentialAmenity[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [centralACPreference, setCentralACPreference] = useState<boolean | undefined>();
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [cadence, setCadence] = useState<RequirementRentalPeriodId>('monthly');
  const [notes, setNotes] = useState('');
  const draftId = useRef(editing ? routeRequirementId : generateDomainId());
  const studioForwardedId = useRef<string | null>(null);
  const saveFlight = useRef(false);
  const confirmedRequirement = useRef<SeekerRequirement | null>(null);
  const uncertainRequirement = useRef<SeekerRequirement | null>(null);
  const editConflictRequirement = useRef<SeekerRequirement | null>(null);
  const routeGeneration = useRef(new RequirementRouteGeneration());
  const [recoveryAction, setRecoveryAction] = useState<'readback' | 'navigation' | 'verify' | 'edit_conflict' | null>(null);

  useLayoutEffect(() => {
    routeGeneration.current.advance();
    saveFlight.current = false;
    confirmedRequirement.current = null;
    uncertainRequirement.current = null;
    editConflictRequirement.current = null;
    setRecoveryAction(null);
    setSaving(false);
    return () => { routeGeneration.current.advance(); };
  }, [editing, routeRequirementId, ownerFromRoute]);

  useEffect(() => {
    setBaseline(null); setRecordLoaded(!editing); setError(''); setStep(startsAtSpecifications ? 3 : 0); setShowCatalogBackControls(false); setInvalidCatalogFields(new Set());
    confirmedRequirement.current = null; uncertainRequirement.current = null; editConflictRequirement.current = null; setRecoveryAction(null);
    draftId.current = editing ? routeRequirementId : generateDomainId();
    setPurpose(initialPurpose); setPropertyType(initialPropertyType); setApartmentSubtype(initialApartmentSubtype); setFloorUse(undefined); setAreaMode(undefined); setAreas([]);
    setBedrooms(''); setBathrooms(''); setMasterBedrooms(''); setLivingRooms(''); setParking(''); setFloorNumber(''); setRequiredArea('');
    setDriverRoom(false); setCatalog([...getGenericRequirementApartmentSubtypePreference(initialApartmentSubtype)]); setAmenities([]); setExcludedAmenities([]); setServices([]); setCentralACPreference(undefined); setMinimum(''); setMaximum(''); setCadence('monthly'); setNotes('');
    if (!editing) return;
    let cancelled = false;
    void store.getRequirement(routeRequirementId).then(record => {
      if (cancelled) return;
      if (!record) {
        setRecordLoaded(true);
        return;
      }
      setBaseline(record);
      setRecordLoaded(true);
      const form = formValuesFromRequirement(record) as RequirementFormValues & Extension;
      const savedApartmentSubtype = getGenericRequirementApartmentSubtype(form.catalogPreferences);
      setApartmentSubtype(savedApartmentSubtype);
      const number = (field: NumberField) => {
        const item = form.catalogPreferences?.find(value => value.field === field && value.kind === 'number');
        return item?.kind === 'number' ? String(item.value) : '';
      };
      setPurpose(form.purpose); setPropertyType(form.propertyType); setFloorUse(form.floorUse);
      setAreas([...form.preferredAreaIds]);
      setAreaMode((record as SeekerRequirement & Extension).preferredAreaMode ?? (record.preferredAreaIds.length ? 'specific_areas' : undefined));
      setBedrooms(form.bedroomsMinimum === undefined ? '' : String(form.bedroomsMinimum));
      setBathrooms(form.bathroomsMinimum === undefined ? '' : String(form.bathroomsMinimum));
      setMasterBedrooms((record as SeekerRequirement & Extension).masterBedroomsMinimum === undefined ? '' : String((record as SeekerRequirement & Extension).masterBedroomsMinimum));
      setLivingRooms(number('livingRoomCount')); setParking(number('parkingSpaceCount')); setFloorNumber(number('floorNumber')); setRequiredArea(number('builtUpAreaSquareMeters'));
      setDriverRoom((record as SeekerRequirement & Extension).driverRoom === true);
      const legacyMaid = form.catalogPreferences?.some(item => item.field === 'hasMaidRoom' && item.kind === 'feature' && item.value) === true;
      setCatalog((form.catalogPreferences ?? []).filter(item => !['livingRoomCount', 'parkingSpaceCount', 'floorNumber', 'builtUpAreaSquareMeters', 'hasMaidRoom'].includes(item.field)));
      setAmenities([...(record.preferredAmenities ?? []), ...(legacyMaid ? ['maid_room' as const] : [])]); setServices(RENT_SERVICES.filter(value => form[value] === true)); setCentralACPreference(form.centralAC);
      setExcludedAmenities([...(record as SeekerRequirement & Extension).preferredAmenityExclusions ?? []]);
      setOccupancy(form.occupancy); setCadence(form.rentalPeriodId ?? 'monthly');
      setMinimum(form.minimumBudget === undefined ? '' : String(form.minimumBudget)); setMaximum(form.maximumBudget === undefined ? '' : String(form.maximumBudget)); setNotes(form.notes);
    }).catch(() => {
      if (cancelled) return;
      setError(language === 'ar' ? 'تعذر تحميل المتطلب المطلوب.' : 'The requested Requirement could not be loaded.');
      setRecordLoaded(true);
    });
    return () => { cancelled = true; };
  }, [editing, routeRequirementId, ownerFromRoute, initialPurpose, initialPropertyType, initialApartmentSubtype, startsAtSpecifications]);

  const editRequested = (Array.isArray(edit) ? edit[0] : edit) === '1';
  useEffect(() => {
    if (!editRequested || !recordLoaded || !baseline || !isWantedStudio(baseline)) return;
    const target = getStudioRequirementRouteTarget(
      baseline.id,
      true,
      canHydrateStudioRequirement(baseline),
    );
    if (target.kind === 'studio' && studioForwardedId.current !== baseline.id) {
      studioForwardedId.current = baseline.id;
      router.replace(target.href as never);
    }
  }, [editRequested, recordLoaded, baseline, router]);

  const catalogWithCore = useMemo(() => {
    const applicable = new Set(getApplicablePropertyFormFields(propertyType, floorUse, apartmentSubtype).map(field => field.field));
    const values = catalog.filter(item => !['livingRoomCount', 'parkingSpaceCount', 'floorNumber', 'builtUpAreaSquareMeters'].includes(item.field));
    const numeric = (field: NumberField, value: string, comparison: 'minimum' | 'exact') => {
      const parsed = parseOptionalRequirementNumber(value, { integer: comparison !== 'minimum' || field !== 'builtUpAreaSquareMeters' });
      return parsed.ok && parsed.value !== undefined ? [{ field, kind: 'number' as const, comparison, value: parsed.value }] : [];
    };
    return [...values, ...(applicable.has('livingRoomCount') ? numeric('livingRoomCount', livingRooms, 'minimum') : []), ...(applicable.has('parkingSpaceCount') ? numeric('parkingSpaceCount', parking, 'minimum') : []), ...(applicable.has('floorNumber') ? numeric('floorNumber', floorNumber, 'exact') : []), ...(applicable.has('builtUpAreaSquareMeters') ? numeric('builtUpAreaSquareMeters', requiredArea, 'minimum') : [])];
  }, [catalog, livingRooms, parking, floorNumber, requiredArea, propertyType, floorUse, apartmentSubtype]);

  const candidate = () => {
    if (editing && (!recordLoaded || !baseline || baseline.id !== routeRequirementId)) return { ok: false as const, message: language === 'ar' ? 'تعذر تحميل المتطلب المطلوب.' : 'The requested Requirement could not be loaded.' };
    const ownerId = baseline?.seekerId ?? ownerFromRoute;
    if (!ownerId) return { ok: false as const, message: t('requirements.invalid_owner') };
    const parse = (value: string, integer = true) => parseOptionalRequirementNumber(value, { integer });
    const min = parse(minimum, false); const max = parse(maximum, false);
    const beds = parse(bedrooms); const baths = parse(bathrooms); const masters = parse(masterBedrooms);
    const builtArea = parse(requiredArea, false);
    if (!areaMode) return { ok: false as const, message: language === 'ar' ? 'اختر نطاق المناطق.' : 'Choose an area scope.' };
    if (propertyType === 'floor' && !floorUse) return { ok: false as const, message: language === 'ar' ? 'اختر استخدام الدور.' : 'Choose the floor use.' };
    if (areaMode === 'specific_areas' && !areas.length) return { ok: false as const, message: language === 'ar' ? 'اختر منطقة واحدة على الأقل.' : 'Select at least one area.' };
    if (!min.ok || !max.ok || !beds.ok || !baths.ok || !masters.ok || !builtArea.ok || invalidCatalogFields.size > 0) return { ok: false as const, message: language === 'ar' ? 'أدخل أرقاماً صالحة.' : 'Enter valid numbers.' };
    const values = {
      purpose, propertyType, preferredAreaIds: areaMode === 'all_kuwait' ? [] : areas, preferredAreaMode: areaMode,
      minimumBudget: min.value, maximumBudget: max.value, currencyCode: MARKET_CONFIG.currencyCode, notes,
      ...(beds.value !== undefined ? { bedroomsMinimum: beds.value } : {}),
      ...(baths.value !== undefined ? { bathroomsMinimum: baths.value } : {}),
      ...(masters.value !== undefined ? { masterBedroomsMinimum: masters.value } : {}),
      ...(purpose === 'rent' ? { rentalPeriodId: cadence, ...(occupancy ? { occupancy } : {}) } : {}),
      ...(purpose === 'rent' && services.includes('swimmingPool') ? { swimmingPool: true } : {}),
      ...(purpose === 'rent' && services.includes('gym') ? { gym: true } : {}),
      ...(purpose === 'rent' && services.includes('seaView') ? { seaView: true } : {}),
      ...(centralACPreference !== undefined ? { centralAC: centralACPreference } : {}),
      ...(amenities.length ? { preferredAmenities: amenities } : {}),
      ...(excludedAmenities.length ? { preferredAmenityExclusions: excludedAmenities } : {}),
      ...(catalogWithCore.length ? { catalogPreferences: catalogWithCore } : {}),
      ...(floorUse ? { floorUse } : {}), ...(driverRoom ? { driverRoom: true } : {}),
    } as RequirementFormValues & Extension;
    const result = buildPersonRequirement(baseline?.id ?? draftId.current, ownerId, values);
    return result.ok ? result : { ok: false as const, message: localizedRequirementIssue(result.issues[0], language) };
  };

  const transitionType = (next: PropertyType) => {
    if (next === propertyType) return;
    const nextResidential = next === 'floor' && floorUse === undefined ? true : isResidential(next, next === 'floor' ? floorUse : undefined);
    const nextSubtype = next === 'apartment' ? apartmentSubtype : undefined;
    const nextAllowed = new Set(getRequirementCatalogFields(next, next === 'floor' ? floorUse : undefined, nextSubtype).map(item => item.field));
    const removedCatalog = next === 'floor' && floorUse === undefined ? [] : catalog.filter(item => !nextAllowed.has(item.field));
    const hasCore = bedrooms || bathrooms || masterBedrooms || livingRooms || driverRoom;
    const nextHasCentralAC = getApplicablePropertyFormFields(next, next === 'floor' ? floorUse : undefined, nextSubtype).some(field => field.field === 'hasCentralAC');
    const removedNames = [...(!nextResidential ? [bedrooms && 'Bedrooms', bathrooms && 'Bathrooms', masterBedrooms && 'Master bedrooms', livingRooms && 'Living rooms', driverRoom && 'Driver room'].filter(Boolean) : []), ...removedCatalog.map(item => item.field), ...(!nextResidential ? [...amenities, ...excludedAmenities, ...(driverRoom ? ['driverRoom'] : []), ...services] : []), ...(centralACPreference !== undefined && !nextHasCentralAC ? ['centralAC'] : [])].map(value => localizedPreferenceName(String(value), language, next, next === 'floor' ? floorUse : undefined)).filter(Boolean);
    const apply = () => { setPropertyType(next); if (next !== 'floor') setFloorUse(undefined); if (next !== 'apartment') setApartmentSubtype(undefined); const allowed = new Set(getRequirementCatalogFields(next, next === 'floor' ? floorUse : undefined, nextSubtype).map(item => item.field)); if (!(next === 'floor' && floorUse === undefined)) setCatalog(current => current.filter(item => allowed.has(item.field))); if (!nextResidential) { setBedrooms(''); setBathrooms(''); setMasterBedrooms(''); setLivingRooms(''); setDriverRoom(false); setAmenities([]); setExcludedAmenities([]); setServices([]); } if (!nextHasCentralAC) setCentralACPreference(undefined); };
    if ((hasCore && !nextResidential) || removedNames.length) {
      const message = language === 'ar' ? `سيؤدي التغيير إلى إزالة مواصفات غير متوافقة: ${removedNames.join('، ')}` : `Changing type removes incompatible preferences: ${removedNames.join(', ')}`;
      if (typeof window !== 'undefined' && window.confirm) { if (window.confirm(message)) apply(); } else Alert.alert(t('transition.requirement.title'), message, [{ text: t('capture.cancel') }, { text: t('transition.remove_confirm'), onPress: apply }]);
    } else apply();
  };

  const transitionFloor = (next: FloorUse) => {
    if (next === floorUse) return;
    const nextAllowed = new Set(getRequirementCatalogFields('floor', next).map(item => item.field));
    const removedCatalog = catalog.filter(item => !nextAllowed.has(item.field));
    const hasResidential = bedrooms || bathrooms || masterBedrooms || livingRooms || parking || driverRoom;
    const removedNames = [...removedCatalog.map(item => item.field), ...(next === 'commercial' ? [...amenities, ...excludedAmenities, ...(driverRoom ? ['driverRoom'] : []), ...services] : [])];
    const apply = () => { setFloorUse(next); const allowed = new Set(getRequirementCatalogFields('floor', next).map(item => item.field)); setCatalog(current => current.filter(item => allowed.has(item.field))); if (next === 'commercial') { setBedrooms(''); setBathrooms(''); setMasterBedrooms(''); setLivingRooms(''); setDriverRoom(false); setAmenities([]); setExcludedAmenities([]); setServices([]); } };
    if ((propertyType === 'floor' && next === 'commercial' && hasResidential) || removedNames.length) {
      const names = removedNames.map(value => localizedPreferenceName(String(value), language, 'floor', next));
      const message = language === 'ar' ? `سيؤدي التغيير إلى إزالة مواصفات غير متوافقة: ${names.join('، ')}` : `Changing floor use removes incompatible preferences: ${names.join(', ')}`;
      if (typeof window !== 'undefined' && window.confirm) { if (window.confirm(message)) apply(); } else Alert.alert(t('transition.requirement.title'), message, [{ text: t('capture.cancel') }, { text: t('transition.remove_confirm'), onPress: apply }]);
    } else apply();
  };
  const changePurpose = (next: RequirementPurpose) => {
    if (next === purpose) return;
    if (purpose === 'rent' && next === 'buy' && services.length > 0) {
      const message = language === 'ar' ? 'سيؤدي الشراء إلى إزالة خدمات الإيجار.' : 'Buy removes rent-only services.';
      const apply = () => { setPurpose(next); setServices([]); setOccupancy(undefined); };
      if (typeof window !== 'undefined' && window.confirm) { if (window.confirm(message)) apply(); } else Alert.alert(t('transition.requirement.title'), message, [{ text: t('capture.cancel') }, { text: t('transition.remove_confirm'), onPress: apply }]);
      return;
    }
    setPurpose(next);
  };

  const review = () => {
    if (!areaMode || (areaMode === 'specific_areas' && !areas.length)) { setStep(startsAtSpecifications ? 3 : 2); setError(language === 'ar' ? 'اختر نطاق المناطق ومنطقة.' : 'Choose an area scope and area.'); return; }
    if (propertyType === 'floor' && !floorUse) { setStep(1); setError(language === 'ar' ? 'اختر استخدام الدور.' : 'Choose the floor use.'); return; }
    if ((coreApplicable && [bedrooms, bathrooms, masterBedrooms, livingRooms].some(value => !parseOptionalRequirementNumber(value).ok)) || (applicableCoreFields.has('parkingSpaceCount') && !parseOptionalRequirementNumber(parking).ok) || (applicableCoreFields.has('floorNumber') && !parseOptionalRequirementNumber(floorNumber).ok) || (applicableCoreFields.has('builtUpAreaSquareMeters') && !parseOptionalRequirementNumber(requiredArea, { integer: false }).ok)) { setStep(3); setError(language === 'ar' ? 'صحح المواصفات الأساسية.' : 'Correct the core specifications.'); return; }
    if (!parseOptionalRequirementNumber(minimum, { integer: false }).ok || !parseOptionalRequirementNumber(maximum, { integer: false }).ok) { setStep(4); setError(language === 'ar' ? 'صحح الميزانية.' : 'Correct the budget.'); return; }
    const result = candidate();
    if (!result.ok) { setError(result.message); return; }
    setError(''); setStep(5);
  };
  const nextStep = () => {
    if (step === 1 && propertyType === 'floor' && !floorUse) {
      setError(language === 'ar' ? 'اختر استخدام الدور: سكني أو تجاري.' : 'Choose Floor use: Residential or Commercial.');
      return;
    }
    setError('');
    if (startsAtSpecifications && step === 1) setShowCatalogBackControls(false);
    setStep(value => startsAtSpecifications && value === 1 ? 3 : value + 1);
  };
  const previousStep = () => {
    setError('');
    if (startsAtSpecifications && step === 3) {
      setShowCatalogBackControls(true);
      setStep(1);
      return;
    }
    setStep(value => value - 1);
  };
  const changeApartmentSubtype = (next: GenericRequirementApartmentSubtype) => {
    setApartmentSubtype(next);
    setCatalog(current => [
      ...current.filter(item => item.field !== 'apartmentSubtype'),
      ...getGenericRequirementApartmentSubtypePreference(next),
    ]);
  };
  const apartmentSubtypeLabel = (value: string) => getWantedApartmentSubtypeLabel({
    propertyType,
    catalogPreferences: [{ field: 'apartmentSubtype', kind: 'choice', value }],
  }, language) ?? value;
  const save = async () => {
    if (!tryStartRequirementSave(saveFlight, !!confirmedRequirement.current, !!uncertainRequirement.current, !!editConflictRequirement.current)) return;
    const generation = routeGeneration.current.capture();
    const isCurrentRoute = () => routeGeneration.current.isCurrent(generation);
    setError('');
    setDevelopmentSaveTrace('');
    try {
      const result = candidate();
      if (!result.ok) {
        setError(result.message);
        if (__DEV__) setDevelopmentSaveTrace('editor=diagnostic-1 stage=validation code=candidate_rejected adapter=' + (Platform.OS === 'web' ? 'WebStore' : 'SQLiteStore'));
        return;
      }
      setSaving(true);
      const attempt = ++saveAttemptNumber.current;
      const outcome = await savePersonRequirement({
        candidate: result.value,
        baseline,
        store,
        navigate: () => isCurrentRoute()
          ? router.replace({ pathname: '/person/[personId]', params: { personId: result.value.seekerId, requirementSaved: '1' } } as never)
          : undefined,
      });
      if (isCurrentRoute()) {
        if (__DEV__) {
          const diagnostic = requirementSaveStageDiagnostic(outcome);
          const trace = [
            'editor=diagnostic-1',
            'attempt=' + attempt,
            'stage=' + (diagnostic?.stage ?? 'confirmed'),
            'code=' + (diagnostic?.code ?? 'saved'),
            'type=' + (diagnostic?.errorType ?? 'none'),
            'adapter=' + (Platform.OS === 'web' ? 'WebStore' : 'SQLiteStore'),
            'mode=' + (baseline ? 'update' : 'create'),
            'personId=' + result.value.seekerId,
            'requirementId=' + result.value.id,
            'location=' + (diagnostic?.location.join('.') ?? 'none'),
          ].join(' ');
          console.info('[requirement-save-diagnostic]', trace);
          if (outcome.status !== 'saved') setDevelopmentSaveTrace(trace);
        }
        applySaveOutcome(outcome, result.value);
      }
    } finally {
      if (isCurrentRoute()) {
        setSaving(false);
        saveFlight.current = false;
      }
    }
  };

  const personDetailsNavigation = (requirement: SeekerRequirement) =>
    router.replace({ pathname: '/person/[personId]', params: { personId: requirement.seekerId } } as never);
  const applySaveOutcome = (
    outcome: Awaited<ReturnType<typeof savePersonRequirement>>,
    requirement: SeekerRequirement,
  ) => {
    if (outcome.status === 'saved') {
      confirmedRequirement.current = requirement;
      uncertainRequirement.current = null;
      editConflictRequirement.current = null;
      setRecoveryAction(null);
      setError('');
    } else if (outcome.status === 'missing_person') {
      setError(localizedRequirementIssue({ code: 'save_missing_person' }, language));
    } else if (outcome.status === 'non_seeker') {
      setError(localizedRequirementIssue({ code: 'save_non_seeker' }, language));
    } else if (outcome.status === 'saved_readback_failed') {
      confirmedRequirement.current = requirement;
      setRecoveryAction('readback');
      setError(localizedRequirementIssue({ code: 'save_readback_failed' }, language));
    } else if (outcome.status === 'saved_navigation_failed') {
      confirmedRequirement.current = requirement;
      setRecoveryAction('navigation');
      setError(localizedRequirementIssue({ code: 'save_navigation_failed' }, language));
    } else if (outcome.status === 'edit_conflict') {
      editConflictRequirement.current = requirement;
      setRecoveryAction('edit_conflict');
      setError(localizedRequirementIssue({ code: 'save_edit_conflict' }, language));
    } else if (outcome.conflict) {
      if (!outcome.retryAllowed) {
        uncertainRequirement.current = requirement;
        setRecoveryAction('verify');
      }
      setError(localizedRequirementIssue({ code: 'save_conflict' }, language));
    } else {
      if (!outcome.retryAllowed) {
        uncertainRequirement.current = requirement;
        setRecoveryAction('verify');
      }
      setError(localizedRequirementIssue({ code: outcome.retryAllowed ? 'save_storage_failure' : 'save_storage_uncertain' }, language));
    }
  };
  const retryRecoveryAction = async () => {
    if (saveFlight.current) return;
    const confirmed = confirmedRequirement.current;
    const uncertain = uncertainRequirement.current;
    const target = confirmed ?? uncertain;
    if (!target || recoveryAction === 'edit_conflict') return;
    saveFlight.current = true;
    const generation = routeGeneration.current.capture();
    const isCurrentRoute = () => routeGeneration.current.isCurrent(generation);
    setSaving(true);
    try {
      const navigate = () => isCurrentRoute() ? personDetailsNavigation(target) : undefined;
      if (recoveryAction === 'navigation') {
        const outcome = await retryRequirementNavigation(navigate);
        if (isCurrentRoute()) applySaveOutcome(outcome, target);
      } else if (recoveryAction === 'readback' || recoveryAction === 'verify') {
        const outcome = recoveryAction === 'verify'
          ? await verifyUncertainRequirementWrite({ candidate: target, store, navigate })
          : await retryRequirementReadback({ candidate: target, store, navigate });
        if (outcome.status === 'storage_failure' && outcome.retryAllowed) {
          if (isCurrentRoute()) {
            uncertainRequirement.current = null;
            confirmedRequirement.current = null;
            setRecoveryAction(null);
            setError(localizedRequirementIssue({ code: 'save_storage_failure' }, language));
          }
        } else if (outcome.status === 'storage_failure' && outcome.conflict) {
          if (isCurrentRoute()) setError(localizedRequirementIssue({ code: 'save_conflict' }, language));
        } else if (isCurrentRoute()) {
          applySaveOutcome(outcome, target);
        }
      }
    } finally {
      if (isCurrentRoute()) {
        setSaving(false);
        saveFlight.current = false;
      }
    }
  };
  const openPersonDetails = async () => {
    const target = confirmedRequirement.current ?? editConflictRequirement.current;
    if (!target || saveFlight.current) return;
    saveFlight.current = true;
    const generation = routeGeneration.current.capture();
    const isCurrentRoute = () => routeGeneration.current.isCurrent(generation);
    try {
      if (isCurrentRoute()) await personDetailsNavigation(target);
    } catch {
      if (isCurrentRoute() && confirmedRequirement.current) {
        setRecoveryAction('navigation');
        setError(localizedRequirementIssue({ code: 'save_navigation_failed' }, language));
      }
    } finally {
      if (isCurrentRoute()) saveFlight.current = false;
    }
  };
  const confirmReopenLatest = () => {
    const message = language === 'ar'
      ? 'لم تُحفظ تعديلاتك الحالية. ستفقدها إذا فتحت أحدث نسخة من المتطلب. هل تريد المتابعة؟'
      : 'Your current edits were not saved. Opening the latest Requirement will discard them. Continue?';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(message)) void openPersonDetails();
      return;
    }
    Alert.alert(
      language === 'ar' ? 'تعديلات غير محفوظة' : 'Unsaved edits',
      message,
      [
        { text: t('capture.cancel'), style: 'cancel' },
        { text: language === 'ar' ? 'افتح أحدث نسخة' : 'Open latest', style: 'destructive', onPress: () => void openPersonDetails() },
      ],
    );
  };

  const coreApplicable = isResidential(propertyType, floorUse);
  const label = (english: string, arabic: string) => english === 'Amenities' ? '' : language === 'ar' ? arabic : english;
  const applicableCoreFields = new Set(getApplicablePropertyFormFields(propertyType, floorUse, apartmentSubtype).map(field => field.field));
  const catalogDefinitions = getRequirementCatalogFields(propertyType, floorUse, apartmentSubtype);
  const { leading: leadingFields, specifications: otherSpecificationFields, amenities: amenityCatalogFields } = getRequirementPresentationFields(propertyType, floorUse, apartmentSubtype);
  const editableLeadingFields = leadingFields.filter(field => field !== 'apartmentSubtype');
  const showPreferredAmenities = coreApplicable || applicableCoreFields.has('hasCentralAC') || amenityCatalogFields.length > 0;
  const poolCatalogApplies = amenityCatalogFields.includes('hasPool');
  const catalogPool = catalog.find(item => item.field === 'hasPool' && item.kind === 'feature');
  const poolSelected = catalogPool?.kind === 'feature' && catalogPool.value === true || services.includes('swimmingPool');
  const poolExcluded = catalogPool?.kind === 'feature' && catalogPool.value === false && !services.includes('swimmingPool');
  const togglePool = () => {
    if (catalogPool?.kind === 'feature') {
      setServices(current => current.filter(value => value !== 'swimmingPool'));
      setCatalog(current => [...current.filter(item => item.field !== 'hasPool'), ...(catalogPool.value ? [{ field: 'hasPool' as const, kind: 'feature' as const, value: false }] : [])]);
    } else setServices(current => current.includes('swimmingPool') ? current.filter(value => value !== 'swimmingPool') : [...current, 'swimmingPool']);
  };
  const choiceReviewLines = (fields: readonly string[]) => fields.flatMap(field => catalog.filter((item): item is Extract<CatalogPreference, { kind: 'choice' }> => item.kind === 'choice' && item.field === field)).map(item => {
    const definition = catalogDefinitions.find(value => value.field === item.field);
    const itemLabel = definition?.label[language === 'ar' ? 1 : 0] ?? label('Preference', 'تفضيل');
    const itemValue = item.field === 'furnishing' ? t(`enrich.furnishing.${item.value}` as any) : item.field === 'apartmentSubtype' ? apartmentSubtypeLabel(item.value) : item.field === 'intendedUse' ? ({ office: label('Office', 'مكتب'), retail: label('Retail', 'تجزئة'), warehouse: label('Warehouse', 'مستودع'), residential: label('Residential', 'سكني') } as Record<string, string>)[item.value] : item.field === 'commercialActivity' ? ({ retail: label('Retail', 'تجزئة'), office: label('Office', 'مكتب'), restaurant: label('Restaurant', 'مطعم'), clinic: label('Clinic', 'عيادة'), warehouse: label('Warehouse', 'مستودع') } as Record<string, string>)[item.value] : label('Selected choice', 'اختيار محدد');
    return `${itemLabel}: ${itemValue}`;
  });
  const coreReviewLines = [
    ...(propertyType === 'floor' && floorUse ? [`${label('Floor use', 'استخدام الدور')}: ${floorUse === 'commercial' ? label('Commercial', 'تجاري') : label('Residential', 'سكني')}`] : []),
    ...choiceReviewLines(leadingFields),
    ...(coreApplicable ? [`${label('Bedrooms', 'غرف النوم')}: ${bedrooms || '—'}`, `${label('Master bedrooms', 'غرف النوم الرئيسية')}: ${masterBedrooms || '—'}`, `${label('Bathrooms', 'الحمامات')}: ${bathrooms || '—'}`, `${label('Hall', 'صالة')}: ${livingRooms || '—'}`] : []),
    ...(applicableCoreFields.has('parkingSpaceCount') ? [`${label('Parking', 'موقف')}: ${parking || '—'}`] : []),
    ...(applicableCoreFields.has('floorNumber') ? [`${label('Floor', 'الطابق')}: ${floorNumber || '—'}`] : []),
    ...(applicableCoreFields.has('builtUpAreaSquareMeters') ? [`${label('Area', 'المساحة')}: ${requiredArea || '—'}`] : []),
    ...choiceReviewLines(otherSpecificationFields),
  ];
  const reviewLines = [
    `${label('Areas', 'المناطق')}: ${areaMode === 'all_kuwait' ? label('All Kuwait', 'كل مناطق الكويت') : areas.map(id => { const area = getAreaById(id); return area ? (language === 'ar' ? area.ar : area.en) : label('Unknown area', 'منطقة غير معروفة'); }).join(', ')}`,
    ...coreReviewLines,
    ...(purpose === 'rent' && coreApplicable ? [`${label('Occupancy', 'الإشغال')}: ${occupancy ? label(occupancy, occupancy === 'family' ? 'عائلي' : occupancy === 'bachelor' ? 'عزاب' : 'أي') : '—'}`] : []),
    ...(showPreferredAmenities ? [`${label('Preferred amenities', 'المزايا المفضلة')}: ${[...new Set([...amenities, ...(driverRoom ? ['driverRoom'] : []), ...excludedAmenities.map(value => `${value}:excluded`), ...services, ...(centralACPreference !== undefined && applicableCoreFields.has('hasCentralAC') ? [`centralAC${centralACPreference ? '' : ':excluded'}`] : []), ...catalog.filter(item => item.kind === 'feature' && amenityCatalogFields.includes(item.field)).map(item => `${item.field}${item.value ? '' : ':excluded'}`)].map(value => value.endsWith(':excluded') ? `${AMENITY_LABELS[value.slice(0, -9)]?.[language === 'ar' ? 'ar' : 'en'] ?? value.slice(0, -9)} (${label('Must not have', 'يجب ألا تتوفر')})` : AMENITY_LABELS[value]?.[language === 'ar' ? 'ar' : 'en'] ?? (value === 'driverRoom' ? label('Driver room', 'غرفة سائق') : label('Selected amenity', 'ميزة محددة'))))].join(', ') || '—'}`] : []),
    `${label('Budget', 'الميزانية')}: ${minimum || '—'}–${maximum || '—'} ${MARKET_CONFIG.currencyCode}`,
    ...(purpose === 'rent' ? [`${label('Cadence', 'الدورية')}: ${cadence === 'daily' ? label('Daily', 'يومياً') : cadence === 'yearly' ? label('Yearly', 'سنوياً') : label('Monthly', 'شهرياً')}`] : []),
    ...(notes.trim() ? [`${label('Notes', 'الملاحظات')}: ${notes}`] : []),
  ];
  catalogInvalidBridge = (field, invalid) => setInvalidCatalogFields(current => {
    const next = new Set(current);
    if (invalid) next.add(field); else next.delete(field);
    return next;
  });

  if (editing && editRequested && !recordLoaded) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.content}>
          <Text style={{ color: colors.foreground, fontFamily: fonts.medium }} testID="studio-requirement-forwarding">
            {language === 'ar' ? 'جارٍ تحميل المتطلب…' : 'Loading Requirement…'}
          </Text>
        </View>
      </View>
    );
  }
  if (editing && editRequested && recordLoaded && !baseline) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.content}>
          <Text style={{ color: colors.destructive, fontFamily: fonts.medium }} testID="studio-requirement-unavailable">
            {language === 'ar'
              ? 'تعذر تحميل متطلب الاستوديو هذا بأمان للتعديل.'
              : 'This Studio Requirement cannot be safely loaded for editing.'}
          </Text>
          <Button
            title={t('capture.back')}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/people' as never)}
            variant="outline"
          />
        </View>
      </View>
    );
  }

  if (editing && recordLoaded && baseline && isWantedStudio(baseline)) {
    const studioTarget = getStudioRequirementRouteTarget(
      baseline.id,
      true,
      canHydrateStudioRequirement(baseline),
    );
    if (studioTarget.kind !== 'studio') {
      return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace('/people' as never)}
              testID="studio-requirement-back"
            >
              <Text style={{ color: colors.primary }}>{t('capture.back')}</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>
              {label('Studio Requirement', 'متطلب استوديو')}
            </Text>
            <View />
          </View>
          <View style={styles.content}>
            <Text style={{ color: colors.destructive, fontFamily: fonts.medium }} testID="studio-requirement-unavailable">
              {label(
                'This Studio Requirement cannot be safely opened for editing.',
                'لا يمكن فتح متطلب الاستوديو هذا بأمان للتعديل.',
              )}
            </Text>
          </View>
        </View>
      );
    }
    if (editRequested) {
      return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={styles.content}>
            <Text style={{ color: colors.foreground, fontFamily: fonts.medium }} testID="studio-requirement-forwarding">
              {label('Opening Studio Requirement editor…', 'جارٍ فتح محرر متطلب الاستوديو…')}
            </Text>
          </View>
        </View>
      );
    }
    const studioRows = getWantedStudioDisplayRows(baseline, language);
    const contextRows = getWantedStudioContextRows(baseline, language);
    const areaText = baseline.preferredAreaMode === 'all_kuwait'
      ? label('All Kuwait', 'كل مناطق الكويت')
      : baseline.preferredAreaIds.map(id => {
        const area = getAreaById(id);
        return area ? (language === 'ar' ? area.ar : area.en) : id;
      }).join(', ');
    const budgetText = `${baseline.budget.minimum}–${baseline.budget.maximum} ${baseline.budget.currencyCode}`;
    const editStudio = () => router.push(studioTarget.href as never);
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/people' as never)}
            testID="studio-requirement-back"
          >
            <Text style={{ color: colors.primary }}>{t('capture.back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>
            {label('Studio Requirement', 'متطلب استوديو')}
          </Text>
          <View />
        </View>
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} bottomOffset={80}>
          <Text style={[styles.heading, { color: colors.foreground }]}>{label('Wanted apartment', 'الشقة المطلوبة')}</Text>
          <Text style={[styles.summary, { color: colors.mutedForeground }]}>{label('Studio', 'استوديو')}</Text>
          {contextRows.map(row => (
            <Text key={row.field} style={[styles.summary, { color: colors.foreground }]} testID={`studio-requirement-${row.field}`}>
              {`${row.label}: ${row.value}`}
            </Text>
          ))}
          <Text style={[styles.summary, { color: colors.foreground }]}>
            {`${label('Preferred areas', 'المناطق المفضلة')}: ${areaText || label('Any area', 'أي منطقة')}`}
          </Text>
          <Text style={[styles.summary, { color: colors.foreground }]}>
            {`${label('Budget range', 'نطاق الميزانية')}: ${budgetText}`}
          </Text>
          <View style={{ gap: 8 }}>
            {studioRows.map(row => (
              <Text key={row.field} style={[styles.summary, { color: colors.foreground }]} testID={`studio-requirement-${row.field}`}>
                {`${row.label}: ${row.value}`}
              </Text>
            ))}
          </View>
          {baseline.notes.trim() ? (
            <Text style={[styles.summary, { color: colors.foreground }]}>
              {`${label('Notes', 'الملاحظات')}: ${baseline.notes}`}
            </Text>
          ) : null}
        </KeyboardAwareScrollViewCompat>
        <View style={styles.footer}>
          <Button
            title={label('Edit Studio Requirement', 'تعديل متطلب الاستوديو')}
            onPress={editStudio}
            style={styles.flex}
            testID="studio-requirement-edit"
          />
        </View>
      </View>
    );
  }

  return <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}><View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/people' as never)}><Text style={{ color: colors.primary }}>{t('capture.cancel')}</Text></TouchableOpacity><Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{editing ? t('requirements.edit') : t('requirements.add')}</Text><Text style={{ color: colors.mutedForeground }}>{startsAtSpecifications ? `${step >= 3 ? step - 2 : 1}/${3}` : `${step + 1}/${STEPS.length}`}</Text></View><KeyboardAvoidingView behavior="padding" style={styles.body}><KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} bottomOffset={80} keyboardShouldPersistTaps="handled">
     {shouldRenderRequirementRecoveryControls(!!error, recoveryAction) ? <View>
       {error ? <Text style={{ color: colors.destructive }} testID="requirement-error">{error}</Text> : null}
        {__DEV__ && developmentSaveTrace ? (
          <Text selectable style={{ color: colors.mutedForeground, fontSize: 11 }} testID="requirement-development-save-trace">
            {developmentSaveTrace}
          </Text>
        ) : null}
       {recoveryAction && recoveryAction !== 'edit_conflict' && <View style={styles.recoveryActions}>
         <TouchableOpacity onPress={() => void retryRecoveryAction()} disabled={saving} testID="requirement-save-recovery">
           <Text style={{ color: colors.primary }}>{recoveryAction === 'verify' ? label('Check save status', 'تحقق من حالة الحفظ') : recoveryAction === 'readback' ? label('Retry confirmation', 'أعد محاولة التأكيد') : label('Retry opening Person Details', 'أعد محاولة فتح تفاصيل الشخص')}</Text>
         </TouchableOpacity>
         {confirmedRequirement.current && <TouchableOpacity onPress={() => void openPersonDetails()} disabled={saving} testID="requirement-open-person-details">
           <Text style={{ color: colors.primary }}>{label('Open Person Details', 'افتح تفاصيل الشخص')}</Text>
         </TouchableOpacity>}
       </View>}
       {recoveryAction === 'edit_conflict' && <View style={styles.recoveryActions}>
         <TouchableOpacity onPress={confirmReopenLatest} disabled={saving} testID="requirement-reopen-latest">
           <Text style={{ color: colors.primary }}>{label('Return to Person Details to reopen latest', 'عُد إلى تفاصيل الشخص لإعادة فتح أحدث نسخة')}</Text>
         </TouchableOpacity>
       </View>}
     </View> : null}
     {step === 0 && <><Text style={styles.heading}>{t('requirements.purpose')}</Text><View style={styles.wrap}>{(['rent', 'buy'] as const).map(value => <ChoiceChip key={value} label={t(`requirements.purpose.${value}`)} selected={purpose === value} onPress={() => changePurpose(value)} testID={`requirement-purpose-${value}`} role="radio" />)}</View></>}
   {step === 1 && <><Text style={styles.heading}>{t('requirements.property_type')}</Text><View style={styles.wrap}>{PROPERTY_TYPES.map(value => <ChoiceChip key={value} label={t(`propertyType.${value}`)} selected={propertyType === value} onPress={() => transitionType(value)} testID={`requirement-type-${value}`} role="radio" />)}</View>{showCatalogBackControls && propertyType === 'apartment' && <><Text style={styles.heading}>{label('Apartment subtype', 'نوع الشقة')}</Text><View style={styles.wrap}>{(['standard_apartment', 'duplex'] as const).map(value => <ChoiceChip key={value} label={apartmentSubtypeLabel(value)} selected={apartmentSubtype === value} onPress={() => changeApartmentSubtype(value)} testID={`requirement-apartment-subtype-${value}`} role="radio" />)}</View></>}{propertyType === 'floor' && <><Text style={styles.heading}>{label('Floor use', 'استخدام الدور')}</Text><View style={styles.wrap}>{(['residential', 'commercial'] as const).map(value => <ChoiceChip key={value} label={label(value === 'residential' ? 'Residential' : 'Commercial', value === 'residential' ? 'سكني' : 'تجاري')} selected={floorUse === value} onPress={() => transitionFloor(value)} testID={`requirement-floor-use-${value}`} role="radio" />)}</View></>}</>}
    {step === 2 && <><Text style={styles.heading}>{t('requirements.areas')}</Text><View style={styles.wrap}><ChoiceChip label={label('All Kuwait', 'كل مناطق الكويت')} selected={areaMode === 'all_kuwait'} onPress={() => { setAreaMode('all_kuwait'); setAreas([]); }} testID="requirement-all-kuwait" role="radio" /><ChoiceChip label={label('Specific areas', 'مناطق محددة')} selected={areaMode !== 'all_kuwait'} onPress={() => setAreaMode('specific_areas')} testID="requirement-specific-areas" role="radio" /></View>{areaMode !== 'all_kuwait' && <KuwaitAreaSelector selectedIds={areas} onChange={ids => { setAreas(ids); if (ids.length) setAreaMode('specific_areas'); }} multiSelect testID="requirement-area-selector" />}</>}
     {step === 3 && <View testID="requirement-core-step">
       <Text style={styles.heading}>{label('Core specifications', 'المواصفات الأساسية')}</Text>
       {startsAtSpecifications && <><Text style={styles.heading}>{t('requirements.areas')}</Text><View style={styles.wrap}><ChoiceChip label={label('All Kuwait', 'كل مناطق الكويت')} selected={areaMode === 'all_kuwait'} onPress={() => { setAreaMode('all_kuwait'); setAreas([]); }} testID="requirement-all-kuwait" role="radio" /><ChoiceChip label={label('Specific areas', 'مناطق محددة')} selected={areaMode === 'specific_areas'} onPress={() => setAreaMode('specific_areas')} testID="requirement-specific-areas" role="radio" /></View>{areaMode !== 'all_kuwait' && <KuwaitAreaSelector selectedIds={areas} onChange={ids => { setAreas(ids); if (ids.length) setAreaMode('specific_areas'); }} multiSelect testID="requirement-area-selector" />}</>}
       {editableLeadingFields.length > 0 && <RequirementCatalogPreferences scopeKey={`${scopeKey}:leading`} propertyType={propertyType} floorUse={floorUse} values={catalog} onChange={setCatalog} onInvalidChange={catalogInvalidBridge} fields={editableLeadingFields} />}
       {coreApplicable && <>
         <NumericQuickPick scopeKey={scopeKey} label={label('Bedrooms', 'غرف النوم')} value={bedrooms} onChangeText={setBedrooms} testID="requirement-bedrooms-quick-pick" />
         <NumericQuickPick scopeKey={scopeKey} label={label('Master bedrooms', 'غرف النوم الرئيسية')} value={masterBedrooms} onChangeText={setMasterBedrooms} quickPickValues={[0, 1, 2, 3, 4, 5]} testID="requirement-master-bedrooms" />
         <NumericQuickPick scopeKey={scopeKey} label={label('Bathrooms', 'الحمامات')} value={bathrooms} onChangeText={setBathrooms} testID="requirement-bathrooms-quick-pick" />
          <NumericQuickPick scopeKey={scopeKey} label={label('Hall', 'صالة')} value={livingRooms} onChangeText={setLivingRooms} quickPickValues={[0, 1, 2, 3, 4, 5]} testID="requirement-living-rooms" />
       </>}
        {applicableCoreFields.has('parkingSpaceCount') && <NumericQuickPick scopeKey={scopeKey} label={label('Parking', 'موقف')} value={parking} onChangeText={setParking} quickPickValues={[0, 1, 2, 3, 4, 5]} testID="requirement-parking" />}
        {applicableCoreFields.has('floorNumber') && <NumericQuickPick scopeKey={scopeKey} label={label('Floor', 'الطابق')} value={floorNumber} onChangeText={setFloorNumber} testID="requirement-floor-number" />}
        {applicableCoreFields.has('builtUpAreaSquareMeters') && <TextInput value={requiredArea} onChangeText={setRequiredArea} placeholder={label('Required area (m²)', 'المساحة المطلوبة (م²)')} style={styles.input} testID="requirement-required-area" />}
        {otherSpecificationFields.length > 0 && <RequirementCatalogPreferences scopeKey={`${scopeKey}:specifications`} propertyType={propertyType} floorUse={floorUse} values={catalog} onChange={setCatalog} onInvalidChange={catalogInvalidBridge} fields={otherSpecificationFields} />}
        {purpose === 'rent' && coreApplicable && <><Text style={styles.heading}>{label('Occupancy', 'الإشغال')}</Text><View style={styles.wrap}>{(['family', 'bachelor', 'any'] as const).map(value => <ChoiceChip key={value} label={value === 'family' ? label('Family', 'عائلي') : value === 'bachelor' ? label('Bachelor', 'عزاب') : label('Any', 'أي')} selected={occupancy === value} onPress={() => setOccupancy(current => current === value ? undefined : value)} role="radio" />)}</View></>}
        {showPreferredAmenities && <><Text style={styles.heading}>{label('Preferred amenities', 'المزايا المفضلة')}</Text><View style={styles.wrap}>
          {coreApplicable && <ChoiceChip label={`${driverRoom ? '✓ ' : ''}${label('Driver room', 'غرفة سائق')}`} selected={driverRoom} onPress={() => setDriverRoom(value => !value)} testID="requirement-driver-room" role="checkbox" />}
          {coreApplicable && purpose === 'rent' && RENT_SERVICES.filter(service => service !== 'swimmingPool' || !poolCatalogApplies).map(service => <ChoiceChip key={service} label={`${services.includes(service) ? '✓ ' : ''}${AMENITY_LABELS[service][language === 'ar' ? 'ar' : 'en']}`} selected={services.includes(service)} onPress={() => setServices(current => current.includes(service) ? current.filter(value => value !== service) : [...current, service])} testID={`requirement-service-${service}`} role="checkbox" />)}
          {coreApplicable && purpose === 'rent' && poolCatalogApplies && <ChoiceChip label={`${poolSelected || poolExcluded ? '✓ ' : ''}${AMENITY_LABELS.swimmingPool[language === 'ar' ? 'ar' : 'en']}${poolExcluded ? label(' · Must not have', ' · يجب ألا تتوفر') : ''}`} selected={poolSelected || poolExcluded} onPress={togglePool} testID="requirement-service-swimmingPool" role="checkbox" />}
          {applicableCoreFields.has('hasCentralAC') && <ChoiceChip label={`${centralACPreference !== undefined ? '✓ ' : ''}${AMENITY_LABELS.centralAC[language === 'ar' ? 'ar' : 'en']}${centralACPreference === false ? label(' · Must not have', ' · يجب ألا تتوفر') : ''}`} selected={centralACPreference !== undefined} onPress={() => setCentralACPreference(current => current === undefined ? true : undefined)} testID="requirement-central-ac" role="checkbox" />}
        </View>
        <RequirementCatalogPreferencesProxy propertyType={propertyType} floorUse={floorUse} values={catalog} onChange={setCatalog} amenities={amenities} onAmenitiesChange={setAmenities} excluded={excludedAmenities} onExcludedChange={setExcludedAmenities} showAmenities={coreApplicable} amenityFields={purpose === 'rent' ? amenityCatalogFields.filter(field => field !== 'hasPool') : amenityCatalogFields} /></>}
     </View>}
    {step === 4 && <><Text style={styles.heading}>{t('requirements.budget')}</Text><TextInput value={minimum} onChangeText={setMinimum} placeholder={t('requirements.budget_from')} keyboardType="decimal-pad" style={styles.input} testID="requirement-budget-min" /><TextInput value={maximum} onChangeText={setMaximum} placeholder={t('requirements.budget_to')} keyboardType="decimal-pad" style={styles.input} testID="requirement-budget-max" />{purpose === 'rent' && <View style={styles.wrap}>{(['daily', 'monthly', 'yearly'] as const).map(value => <ChoiceChip key={value} label={value === 'daily' ? label('Daily', 'يومياً') : value === 'monthly' ? label('Monthly', 'شهرياً') : label('Yearly', 'سنوياً')} selected={cadence === value} onPress={() => setCadence(value)} testID={`requirement-rental-period-${value}`} role="radio" />)}</View>}<Text style={styles.heading}>{t('requirements.notes')}</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input, styles.notes]} testID="requirement-notes" /></>}
    {step === 5 && <><Text style={styles.heading}>{label('Review', 'مراجعة')}</Text><Text style={styles.summaryTitle}>{purpose === 'rent' ? label('Rent', 'إيجار') : label('Buy', 'شراء')} · {t(`propertyType.${propertyType}`)}</Text>{reviewLines.map((line, index) => <Text key={`${index}-${line}`} style={styles.summary}>{line}</Text>)}</>}
   </KeyboardAwareScrollViewCompat><View style={styles.footer}><View style={styles.actions}>{step > 0 && <Button title={t('capture.back')} onPress={previousStep} variant="outline" style={styles.flex} />}{step === 4 ? <Button title={t('capture.next')} onPress={review} style={styles.flex} testID="requirement-next" /> : step === 5 ? <Button title={t('requirements.save')} onPress={() => void save()} disabled={saving || !!confirmedRequirement.current || !!uncertainRequirement.current || !!editConflictRequirement.current} loading={saving} style={styles.flex} testID="requirement-save" /> : <Button title={t('capture.next')} onPress={nextStep} style={styles.flex} testID="requirement-next" />}</View></View></KeyboardAvoidingView></View>;
}

function RequirementCatalogPreferencesProxy({ propertyType, floorUse, values, onChange, amenities, onAmenitiesChange, excluded, onExcludedChange, showAmenities, amenityFields }: { propertyType: PropertyType; floorUse?: FloorUse; values: readonly CatalogPreference[]; onChange: (values: readonly CatalogPreference[]) => void; amenities: readonly ResidentialAmenity[]; onAmenitiesChange: (values: readonly ResidentialAmenity[]) => void; excluded: readonly ResidentialAmenity[]; onExcludedChange: (values: readonly ResidentialAmenity[]) => void; showAmenities: boolean; amenityFields: readonly CatalogPreference['field'][] }) {
  const { language } = useI18n();
  const labels: Record<ResidentialAmenity, readonly [string, string]> = {
    heating: ['Heating', 'تدفئة'], balcony: ['Balcony', 'بلكونة'], maid_room: ['Maid room', 'غرفة خادمة'],
    laundry_room: ['Laundry room', 'غرفة غسيل'], solar_heater: ['Solar heater', 'سخان شمسي'],
    elevator: ['Elevator', 'مصعد'], garden: ['Garden', 'حديقة'], security_guard: ['Security / Guard', 'أمن / حارس'], bbq_area: ['BBQ area', 'منطقة شواء'],
    private_roof: ['Private roof', 'سطح خاص'],
  };
  return <>{showAmenities && <View style={styles.wrap}>{RESIDENTIAL_AMENITIES.map(amenity => {
    const required = amenities.includes(amenity);
    const isExcluded = excluded.includes(amenity);
    const state = isExcluded ? (language === 'ar' ? ' · يجب ألا تتوفر' : ' · Must not have') : required ? (language === 'ar' ? ' · مطلوب' : ' · Required') : (language === 'ar' ? ' · غير مهم' : ' · Not important');
    return <ChoiceChip key={amenity} label={`${required || isExcluded ? '✓ ' : ''}${labels[amenity][language === 'ar' ? 1 : 0]}${state}`} selected={required || isExcluded} onPress={() => {
      const next = toggleRequirementAmenity(amenity, amenities, excluded);
      onAmenitiesChange(next.preferred);
      onExcludedChange(next.excluded);
    }} testID={`requirement-preferred-amenity-${amenity}`} role="checkbox" />;
  })}</View>}{amenityFields.length > 0 && <RequirementCatalogPreferences scopeKey={`requirement-catalog:${propertyType}:${floorUse ?? 'none'}`} propertyType={propertyType} floorUse={floorUse} values={values} onChange={onChange} onInvalidChange={catalogInvalidBridge} fields={amenityFields} />}</>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, body: { flex: 1 }, header: { minHeight: 60, padding: 20, alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 19 }, content: { padding: 20, gap: 12 }, heading: { fontSize: 20, marginTop: 6, marginBottom: 8 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, input: { minHeight: 50, borderWidth: 1, borderColor: '#999', borderRadius: 12, paddingHorizontal: 14, marginBottom: 8 }, notes: { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }, summaryTitle: { fontSize: 17, fontWeight: '700' }, summary: { fontSize: 15, lineHeight: 22 }, recoveryActions: { gap: 10, paddingVertical: 8 }, footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 }, actions: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 },
});