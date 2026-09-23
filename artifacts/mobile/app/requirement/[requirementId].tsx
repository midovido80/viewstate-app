import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  type RequirementFormValues,
} from '@/services/personRequirementWorkflow';
import { localizedRequirementIssue } from '@/services/requirementIssueMessage';
import { getRequirementCatalogFields } from '@/services/requirementFieldMap';
import { getAreaById } from '@/constants/kuwait-areas';
import { getApplicablePropertyFormFields } from '@/services/propertyFormCatalog';

const RENT_SERVICES = ['swimmingPool', 'gym', 'seaView', 'centralAC'] as const;
const AMENITY_LABELS: Record<string, { en: string; ar: string }> = {
  swimmingPool: { en: 'Swimming pool', ar: 'مسبح' }, gym: { en: 'Gym', ar: 'جيم' },
  seaView: { en: 'Sea view', ar: 'إطلالة بحرية' }, centralAC: { en: 'Central A/C', ar: 'تكييف مركزي' },
};
for (const [id, en, ar] of [
  ['heating', 'Heating', 'تدفئة'], ['balcony', 'Balcony', 'بلكونة'], ['maid_room', 'Maid room', 'غرفة خادمة'],
  ['laundry_room', 'Laundry room', 'غرفة غسيل'], ['solar_heater', 'Solar heater', 'سخان شمسي'],
  ['elevator', 'Elevator', 'مصعد'], ['garden', 'Garden', 'حديقة'], ['security_guard', 'Security / Guard', 'أمن / حارس'], ['bbq_area', 'BBQ area', 'منطقة شواء'],
  ['hasPool', 'Pool', 'مسبح'], ['hasWaterfront', 'Waterfront', 'واجهة مائية'], ['hasColdStorage', 'Cold storage', 'تخزين بارد'],
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

const isResidential = (type: PropertyType, floorUse?: FloorUse) =>
  ['apartment', 'house', 'villa', 'chalet'].includes(type) || (type === 'floor' && floorUse === 'residential');
let catalogInvalidBridge: (field: string, invalid: boolean) => void = () => undefined;

export default function RequirementEditor() {
  const { requirementId, seekerId } = useLocalSearchParams<{ requirementId: string; seekerId?: string }>();
  const editing = requirementId !== 'new';
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const ownerFromRoute = Array.isArray(seekerId) ? seekerId[0] : seekerId;
  const scopeKey = editing ? `requirement:${requirementId}` : `requirement:new:${ownerFromRoute ?? 'missing'}`;
  const [baseline, setBaseline] = useState<SeekerRequirement | null>(null);
  const [recordLoaded, setRecordLoaded] = useState(!editing);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [purpose, setPurpose] = useState<RequirementPurpose>('rent');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartment');
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
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [cadence, setCadence] = useState<'monthly' | 'yearly'>('monthly');
  const [notes, setNotes] = useState('');
  const draftId = useRef(editing ? requirementId : generateDomainId());
  const saveFlight = useRef(false);

  useEffect(() => {
    setBaseline(null); setRecordLoaded(!editing); setError(''); setStep(0); setInvalidCatalogFields(new Set());
    draftId.current = editing ? requirementId : generateDomainId();
    setPurpose('rent'); setPropertyType('apartment'); setFloorUse(undefined); setAreaMode(undefined); setAreas([]);
    setBedrooms(''); setBathrooms(''); setMasterBedrooms(''); setLivingRooms(''); setParking(''); setFloorNumber(''); setRequiredArea('');
    setDriverRoom(false); setCatalog([]); setAmenities([]); setExcludedAmenities([]); setServices([]); setMinimum(''); setMaximum(''); setCadence('monthly'); setNotes('');
    if (!editing) return;
    let cancelled = false;
    void store.getRequirement(requirementId).then(record => {
      if (cancelled || !record) return;
      setBaseline(record);
      setRecordLoaded(true);
      const form = formValuesFromRequirement(record) as RequirementFormValues & Extension;
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
      setAmenities([...(record.preferredAmenities ?? []), ...(legacyMaid ? ['maid_room' as const] : [])]); setServices(RENT_SERVICES.filter(value => form[value] === true));
      setExcludedAmenities([...(record as SeekerRequirement & Extension).preferredAmenityExclusions ?? []]);
      setOccupancy(form.occupancy); setCadence(form.rentalPeriodId ?? 'monthly');
      setMinimum(form.minimumBudget === undefined ? '' : String(form.minimumBudget)); setMaximum(form.maximumBudget === undefined ? '' : String(form.maximumBudget)); setNotes(form.notes);
    });
    return () => { cancelled = true; };
  }, [editing, requirementId, ownerFromRoute]);

  const catalogWithCore = useMemo(() => {
    const applicable = new Set(getApplicablePropertyFormFields(propertyType, floorUse).map(field => field.field));
    const values = catalog.filter(item => !['livingRoomCount', 'parkingSpaceCount', 'floorNumber', 'builtUpAreaSquareMeters'].includes(item.field));
    const numeric = (field: NumberField, value: string, comparison: 'minimum' | 'exact') => {
      const parsed = parseOptionalRequirementNumber(value, { integer: comparison !== 'minimum' || field !== 'builtUpAreaSquareMeters' });
      return parsed.ok && parsed.value !== undefined ? [{ field, kind: 'number' as const, comparison, value: parsed.value }] : [];
    };
    return [...values, ...(applicable.has('livingRoomCount') ? numeric('livingRoomCount', livingRooms, 'minimum') : []), ...(applicable.has('parkingSpaceCount') ? numeric('parkingSpaceCount', parking, 'minimum') : []), ...(applicable.has('floorNumber') ? numeric('floorNumber', floorNumber, 'exact') : []), ...(applicable.has('builtUpAreaSquareMeters') ? numeric('builtUpAreaSquareMeters', requiredArea, 'minimum') : [])];
  }, [catalog, livingRooms, parking, floorNumber, requiredArea, propertyType, floorUse]);

  const candidate = () => {
    if (editing && (!recordLoaded || !baseline || baseline.id !== requirementId)) return { ok: false as const, message: language === 'ar' ? 'تعذر تحميل المتطلب المطلوب.' : 'The requested Requirement could not be loaded.' };
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
      ...(services.includes('centralAC') ? { centralAC: true } : {}),
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
    const nextAllowed = new Set(getRequirementCatalogFields(next, next === 'floor' ? floorUse : undefined).map(item => item.field));
    const removedCatalog = next === 'floor' && floorUse === undefined ? [] : catalog.filter(item => !nextAllowed.has(item.field));
    const hasCore = bedrooms || bathrooms || masterBedrooms || livingRooms || driverRoom;
    const removedNames = [...(!nextResidential ? [bedrooms && 'Bedrooms', bathrooms && 'Bathrooms', masterBedrooms && 'Master bedrooms', livingRooms && 'Living rooms', driverRoom && 'Driver room'].filter(Boolean) : []), ...removedCatalog.map(item => item.field), ...(!nextResidential ? [...amenities, ...excludedAmenities, ...(driverRoom ? ['driverRoom'] : []), ...services] : [])].map(value => localizedPreferenceName(String(value), language, next, next === 'floor' ? floorUse : undefined)).filter(Boolean);
    const apply = () => { setPropertyType(next); if (next !== 'floor') setFloorUse(undefined); const allowed = new Set(getRequirementCatalogFields(next, next === 'floor' ? floorUse : undefined).map(item => item.field)); if (!(next === 'floor' && floorUse === undefined)) setCatalog(current => current.filter(item => allowed.has(item.field))); if (!nextResidential) { setBedrooms(''); setBathrooms(''); setMasterBedrooms(''); setLivingRooms(''); setDriverRoom(false); setAmenities([]); setExcludedAmenities([]); setServices(current => current.filter(value => value === 'centralAC' && getApplicablePropertyFormFields(next, next === 'floor' ? floorUse : undefined).some(field => field.field === 'hasCentralAC'))); } };
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
    const apply = () => { setFloorUse(next); const allowed = new Set(getRequirementCatalogFields('floor', next).map(item => item.field)); setCatalog(current => current.filter(item => allowed.has(item.field))); if (next === 'commercial') { setBedrooms(''); setBathrooms(''); setMasterBedrooms(''); setLivingRooms(''); setDriverRoom(false); setAmenities([]); setExcludedAmenities([]); setServices(current => current.filter(value => value === 'centralAC')); } };
    if ((propertyType === 'floor' && next === 'commercial' && hasResidential) || removedNames.length) {
      const names = removedNames.map(value => localizedPreferenceName(String(value), language, 'floor', next));
      const message = language === 'ar' ? `سيؤدي التغيير إلى إزالة مواصفات غير متوافقة: ${names.join('، ')}` : `Changing floor use removes incompatible preferences: ${names.join(', ')}`;
      if (typeof window !== 'undefined' && window.confirm) { if (window.confirm(message)) apply(); } else Alert.alert(t('transition.requirement.title'), message, [{ text: t('capture.cancel') }, { text: t('transition.remove_confirm'), onPress: apply }]);
    } else apply();
  };
  const changePurpose = (next: RequirementPurpose) => {
    if (next === purpose) return;
    if (purpose === 'rent' && next === 'buy' && services.some(value => value !== 'centralAC')) {
      const message = language === 'ar' ? 'سيؤدي الشراء إلى إزالة خدمات الإيجار.' : 'Buy removes rent-only services.';
      const apply = () => { setPurpose(next); setServices(current => current.filter(value => value === 'centralAC')); setOccupancy(undefined); };
      if (typeof window !== 'undefined' && window.confirm) { if (window.confirm(message)) apply(); } else Alert.alert(t('transition.requirement.title'), message, [{ text: t('capture.cancel') }, { text: t('transition.remove_confirm'), onPress: apply }]);
      return;
    }
    setPurpose(next);
  };

  const review = () => {
    if (!areaMode || (areaMode === 'specific_areas' && !areas.length)) { setStep(2); setError(language === 'ar' ? 'اختر نطاق المناطق ومنطقة.' : 'Choose an area scope and area.'); return; }
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
    setStep(value => value + 1);
  };
  const save = async () => {
    if (saveFlight.current) return;
    saveFlight.current = true; setError('');
    try {
      const result = candidate();
      if (!result.ok) { setError(result.message); return; }
      setSaving(true);
      if (baseline) { if (!await store.updateRequirement(baseline, result.value)) throw new Error('REQUIREMENT_CHANGED'); }
      else await store.saveRequirement(result.value);
      router.replace({ pathname: '/person/[personId]', params: { personId: result.value.seekerId, requirementSaved: '1' } } as never);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'REQUIREMENT_CHANGED' ? localizedRequirementIssue({ code: 'save_conflict' }, language) : t('requirements.save_failed'));
    } finally { setSaving(false); saveFlight.current = false; }
  };

  const coreApplicable = isResidential(propertyType, floorUse);
  const label = (english: string, arabic: string) => english === 'Amenities' ? '' : language === 'ar' ? arabic : english;
  const applicableCoreFields = new Set(getApplicablePropertyFormFields(propertyType, floorUse).map(field => field.field));
  const coreReviewLines = [
    ...(propertyType === 'floor' && floorUse ? [`${label('Floor use', 'استخدام الدور')}: ${floorUse === 'commercial' ? label('Commercial', 'تجاري') : label('Residential', 'سكني')}`] : []),
    ...(coreApplicable ? [`${label('Bedrooms', 'غرف النوم')}: ${bedrooms || '—'}`, `${label('Master bedrooms', 'غرف النوم الرئيسية')}: ${masterBedrooms || '—'}`, `${label('Bathrooms', 'الحمامات')}: ${bathrooms || '—'}`, `${label('Living rooms', 'غرف المعيشة')}: ${livingRooms || '—'}`] : []),
    ...(applicableCoreFields.has('parkingSpaceCount') ? [`${label('Parking', 'المواقف')}: ${parking || '—'}`] : []),
    ...(applicableCoreFields.has('floorNumber') ? [`${label('Floor', 'الدور')}: ${floorNumber || '—'}`] : []),
    ...(applicableCoreFields.has('builtUpAreaSquareMeters') ? [`${label('Area', 'المساحة')}: ${requiredArea || '—'}`] : []),
  ];
  const reviewLines = [
    `${label('Areas', 'المناطق')}: ${areaMode === 'all_kuwait' ? label('All Kuwait', 'كل مناطق الكويت') : areas.map(id => { const area = getAreaById(id); return area ? (language === 'ar' ? area.ar : area.en) : label('Unknown area', 'منطقة غير معروفة'); }).join(', ')}`,
    ...coreReviewLines,
    `${label('Preferred amenities', 'المزايا المفضلة')}: ${[...amenities, ...(driverRoom ? ['driverRoom'] : []), ...excludedAmenities.map(value => `${value}:excluded`), ...services, ...catalog.filter(item => item.kind === 'feature' && item.value).map(item => item.field)].map(value => value.endsWith(':excluded') ? `${AMENITY_LABELS[value.slice(0, -9)]?.[language === 'ar' ? 'ar' : 'en'] ?? value.slice(0, -9)} (${label('Must not have', 'يجب ألا تتوفر')})` : AMENITY_LABELS[value]?.[language === 'ar' ? 'ar' : 'en'] ?? (value === 'driverRoom' ? label('Driver room', 'غرفة سائق') : label('Selected amenity', 'ميزة محددة'))).join(', ') || '—'}`,
    ...catalog.filter(item => item.kind === 'choice').map(item => {
      const definition = getRequirementCatalogFields(propertyType, floorUse).find(value => value.field === item.field);
      const itemLabel = definition?.label[language === 'ar' ? 1 : 0] ?? label('Preference', 'تفضيل');
      const itemValue = item.field === 'furnishing' ? t(`enrich.furnishing.${item.value}` as any) : item.field === 'apartmentSubtype' ? t(`enrich.apartment_subtype.${item.value}` as any) : item.field === 'intendedUse' ? ({ office: label('Office', 'مكتب'), retail: label('Retail', 'تجزئة'), warehouse: label('Warehouse', 'مستودع'), residential: label('Residential', 'سكني') } as Record<string, string>)[item.value] : item.field === 'commercialActivity' ? ({ retail: label('Retail', 'تجزئة'), office: label('Office', 'مكتب'), restaurant: label('Restaurant', 'مطعم'), clinic: label('Clinic', 'عيادة'), warehouse: label('Warehouse', 'مستودع') } as Record<string, string>)[item.value] : label('Selected choice', 'اختيار محدد');
      return `${itemLabel}: ${itemValue}`;
    }),
    `${label('Budget', 'الميزانية')}: ${minimum || '—'}–${maximum || '—'} ${MARKET_CONFIG.currencyCode}`,
    ...(purpose === 'rent' ? [`${label('Cadence', 'الدورية')}: ${cadence === 'yearly' ? label('Yearly', 'سنوياً') : label('Monthly', 'شهرياً')}`, `${label('Occupancy', 'الإشغال')}: ${occupancy ? label(occupancy, occupancy === 'family' ? 'عائلي' : occupancy === 'bachelor' ? 'عزاب' : 'أي') : '—'}`] : []),
    ...(notes.trim() ? [`${label('Notes', 'الملاحظات')}: ${notes}`] : []),
  ];
  catalogInvalidBridge = (field, invalid) => setInvalidCatalogFields(current => {
    const next = new Set(current);
    if (invalid) next.add(field); else next.delete(field);
    return next;
  });

  return <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}><View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/people' as never)}><Text style={{ color: colors.primary }}>{t('capture.cancel')}</Text></TouchableOpacity><Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{editing ? t('requirements.edit') : t('requirements.add')}</Text><Text style={{ color: colors.mutedForeground }}>{step + 1}/{STEPS.length}</Text></View><KeyboardAvoidingView behavior="padding" style={styles.body}><KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} bottomOffset={80} keyboardShouldPersistTaps="handled">
    {error ? <Text style={{ color: colors.destructive }} testID="requirement-error">{error}</Text> : null}
     {step === 0 && <><Text style={styles.heading}>{t('requirements.purpose')}</Text><View style={styles.wrap}>{(['rent', 'buy'] as const).map(value => <ChoiceChip key={value} label={t(`requirements.purpose.${value}`)} selected={purpose === value} onPress={() => changePurpose(value)} testID={`requirement-purpose-${value}`} role="radio" />)}</View></>}
    {step === 1 && <><Text style={styles.heading}>{t('requirements.property_type')}</Text><View style={styles.wrap}>{PROPERTY_TYPES.map(value => <ChoiceChip key={value} label={t(`propertyType.${value}`)} selected={propertyType === value} onPress={() => transitionType(value)} testID={`requirement-type-${value}`} role="radio" />)}</View>{propertyType === 'floor' && <><Text style={styles.heading}>{label('Floor use', 'استخدام الدور')}</Text><View style={styles.wrap}>{(['residential', 'commercial'] as const).map(value => <ChoiceChip key={value} label={label(value === 'residential' ? 'Residential' : 'Commercial', value === 'residential' ? 'سكني' : 'تجاري')} selected={floorUse === value} onPress={() => transitionFloor(value)} testID={`requirement-floor-use-${value}`} role="radio" />)}</View></>}</>}
    {step === 2 && <><Text style={styles.heading}>{t('requirements.areas')}</Text><View style={styles.wrap}><ChoiceChip label={label('All Kuwait', 'كل مناطق الكويت')} selected={areaMode === 'all_kuwait'} onPress={() => { setAreaMode('all_kuwait'); setAreas([]); }} testID="requirement-all-kuwait" role="radio" /><ChoiceChip label={label('Specific areas', 'مناطق محددة')} selected={areaMode !== 'all_kuwait'} onPress={() => setAreaMode('specific_areas')} testID="requirement-specific-areas" role="radio" /></View>{areaMode !== 'all_kuwait' && <KuwaitAreaSelector selectedIds={areas} onChange={ids => { setAreas(ids); if (ids.length) setAreaMode('specific_areas'); }} multiSelect testID="requirement-area-selector" />}</>}
     {step === 3 && <View testID="requirement-core-step">
       <Text style={styles.heading}>{label('Core specifications', 'المواصفات الأساسية')}</Text>
       {coreApplicable && <>
         <NumericQuickPick scopeKey={scopeKey} label={label('Bedrooms', 'غرف النوم')} value={bedrooms} onChangeText={setBedrooms} testID="requirement-bedrooms-quick-pick" />
         <NumericQuickPick scopeKey={scopeKey} label={label('Master bedrooms', 'غرف النوم الرئيسية')} value={masterBedrooms} onChangeText={setMasterBedrooms} quickPickValues={[0, 1, 2, 3, 4, 5]} testID="requirement-master-bedrooms" />
         <NumericQuickPick scopeKey={scopeKey} label={label('Bathrooms', 'الحمامات')} value={bathrooms} onChangeText={setBathrooms} testID="requirement-bathrooms-quick-pick" />
          <NumericQuickPick scopeKey={scopeKey} label={label('Living rooms / halls', 'غرف المعيشة / الصالات')} value={livingRooms} onChangeText={setLivingRooms} quickPickValues={[0, 1, 2, 3, 4, 5]} testID="requirement-living-rooms" />
       </>}
        {applicableCoreFields.has('parkingSpaceCount') && <NumericQuickPick scopeKey={scopeKey} label={label('Parking spaces', 'مواقف السيارات')} value={parking} onChangeText={setParking} quickPickValues={[0, 1, 2, 3, 4, 5]} testID="requirement-parking" />}
        {applicableCoreFields.has('floorNumber') && <NumericQuickPick scopeKey={scopeKey} label={label('Preferred floor number', 'رقم الدور المفضل')} value={floorNumber} onChangeText={setFloorNumber} testID="requirement-floor-number" />}
        {applicableCoreFields.has('builtUpAreaSquareMeters') && <TextInput value={requiredArea} onChangeText={setRequiredArea} placeholder={label('Required area (m²)', 'المساحة المطلوبة (م²)')} style={styles.input} testID="requirement-required-area" />}
        {applicableCoreFields.has('hasCentralAC') && <ChoiceChip label={label('Central A/C', 'تكييف مركزي')} selected={services.includes('centralAC')} onPress={() => setServices(current => current.includes('centralAC') ? current.filter(value => value !== 'centralAC') : [...current, 'centralAC'])} testID="requirement-central-ac" role="checkbox" />}
       {coreApplicable && <><Text style={styles.heading}>{label('Preferred amenities', 'المزايا المفضلة')}</Text>
         <ChoiceChip label={label('Driver room', 'غرفة سائق')} selected={driverRoom} onPress={() => setDriverRoom(value => !value)} testID="requirement-driver-room" role="checkbox" />
         {RENT_SERVICES.filter(service => purpose === 'rent' || service === 'centralAC').map(service => <ChoiceChip key={service} label={AMENITY_LABELS[service][language === 'ar' ? 'ar' : 'en']} selected={services.includes(service)} onPress={() => setServices(current => current.includes(service) ? current.filter(value => value !== service) : [...current, service])} testID={`requirement-service-${service}`} role="checkbox" />)}
         {purpose === 'rent' && <><Text style={styles.heading}>{label('Occupancy', 'الإشغال')}</Text><View style={styles.wrap}>{(['family', 'bachelor', 'any'] as const).map(value => <ChoiceChip key={value} label={value === 'family' ? label('Family', 'عائلي') : value === 'bachelor' ? label('Bachelor', 'عزاب') : label('Any', 'أي')} selected={occupancy === value} onPress={() => setOccupancy(current => current === value ? undefined : value)} role="radio" />)}</View></>}
          <RequirementCatalogPreferencesProxy propertyType={propertyType} floorUse={floorUse} values={catalog} onChange={setCatalog} amenities={amenities} onAmenitiesChange={setAmenities} excluded={excludedAmenities} onExcludedChange={setExcludedAmenities} showAmenities />
       </>}
        {!coreApplicable && <RequirementCatalogPreferencesProxy propertyType={propertyType} floorUse={floorUse} values={catalog} onChange={setCatalog} amenities={amenities} onAmenitiesChange={setAmenities} excluded={excludedAmenities} onExcludedChange={setExcludedAmenities} showAmenities={false} />}
     </View>}
    {step === 4 && <><Text style={styles.heading}>{t('requirements.budget')}</Text><TextInput value={minimum} onChangeText={setMinimum} placeholder={t('requirements.budget_from')} keyboardType="decimal-pad" style={styles.input} testID="requirement-budget-min" /><TextInput value={maximum} onChangeText={setMaximum} placeholder={t('requirements.budget_to')} keyboardType="decimal-pad" style={styles.input} testID="requirement-budget-max" />{purpose === 'rent' && <View style={styles.wrap}>{(['monthly', 'yearly'] as const).map(value => <ChoiceChip key={value} label={value === 'monthly' ? label('Monthly', 'شهرياً') : label('Yearly', 'سنوياً')} selected={cadence === value} onPress={() => setCadence(value)} testID={`requirement-rental-period-${value}`} role="radio" />)}</View>}<Text style={styles.heading}>{t('requirements.notes')}</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input, styles.notes]} testID="requirement-notes" /></>}
    {step === 5 && <><Text style={styles.heading}>{label('Review', 'مراجعة')}</Text><Text style={styles.summaryTitle}>{purpose === 'rent' ? label('Rent', 'إيجار') : label('Buy', 'شراء')} · {t(`propertyType.${propertyType}`)}</Text>{reviewLines.map((line, index) => <Text key={`${index}-${line}`} style={styles.summary}>{line}</Text>)}</>}
   </KeyboardAwareScrollViewCompat><View style={styles.footer}><View style={styles.actions}>{step > 0 && <Button title={t('capture.back')} onPress={() => { setError(''); setStep(value => value - 1); }} variant="outline" style={styles.flex} />}{step === 4 ? <Button title={t('capture.next')} onPress={review} style={styles.flex} testID="requirement-next" /> : step === 5 ? <Button title={t('requirements.save')} onPress={() => void save()} loading={saving} style={styles.flex} testID="requirement-save" /> : <Button title={t('capture.next')} onPress={nextStep} style={styles.flex} testID="requirement-next" />}</View></View></KeyboardAvoidingView></View>;
}

function RequirementCatalogPreferencesProxy({ propertyType, floorUse, values, onChange, amenities, onAmenitiesChange, excluded, onExcludedChange, showAmenities }: { propertyType: PropertyType; floorUse?: FloorUse; values: readonly CatalogPreference[]; onChange: (values: readonly CatalogPreference[]) => void; amenities: readonly ResidentialAmenity[]; onAmenitiesChange: (values: readonly ResidentialAmenity[]) => void; excluded: readonly ResidentialAmenity[]; onExcludedChange: (values: readonly ResidentialAmenity[]) => void; showAmenities: boolean }) {
  const { language } = useI18n();
  const labels: Record<ResidentialAmenity, readonly [string, string]> = {
    heating: ['Heating', 'تدفئة'], balcony: ['Balcony', 'بلكونة'], maid_room: ['Maid room', 'غرفة خادمة'],
    laundry_room: ['Laundry room', 'غرفة غسيل'], solar_heater: ['Solar heater', 'سخان شمسي'],
    elevator: ['Elevator', 'مصعد'], garden: ['Garden', 'حديقة'], security_guard: ['Security / Guard', 'أمن / حارس'], bbq_area: ['BBQ area', 'منطقة شواء'],
  };
  return <>{showAmenities && <View style={styles.wrap}>{RESIDENTIAL_AMENITIES.map(amenity => {
    const required = amenities.includes(amenity);
    const isExcluded = excluded.includes(amenity);
    const state = isExcluded ? (language === 'ar' ? ' · يجب ألا تتوفر' : ' · Must not have') : required ? (language === 'ar' ? ' · مطلوب' : ' · Required') : (language === 'ar' ? ' · غير مهم' : ' · Not important');
    return <ChoiceChip key={amenity} label={`${labels[amenity][language === 'ar' ? 1 : 0]}${state}`} selected={required || isExcluded} onPress={() => {
      if (required) {
        onAmenitiesChange(amenities.filter(value => value !== amenity));
        onExcludedChange([...excluded, amenity]);
      } else if (isExcluded) {
        onExcludedChange(excluded.filter(value => value !== amenity));
      } else {
        onAmenitiesChange([...amenities, amenity]);
        onExcludedChange(excluded.filter(value => value !== amenity));
      }
    }} testID={`requirement-preferred-amenity-${amenity}`} role="checkbox" />;
  })}</View>}<RequirementCatalogPreferences scopeKey={`requirement-catalog:${propertyType}:${floorUse ?? 'none'}`} propertyType={propertyType} floorUse={floorUse} values={values} onChange={onChange} onInvalidChange={catalogInvalidBridge} /></>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, body: { flex: 1 }, header: { minHeight: 60, padding: 20, alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 19 }, content: { padding: 20, gap: 12 }, heading: { fontSize: 20, marginTop: 6, marginBottom: 8 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, input: { minHeight: 50, borderWidth: 1, borderColor: '#999', borderRadius: 12, paddingHorizontal: 14, marginBottom: 8 }, notes: { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }, summaryTitle: { fontSize: 17, fontWeight: '700' }, summary: { fontSize: 15, lineHeight: 22 }, footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 }, actions: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 },
});