import { getFloorTypeLabel } from '@/services/propertySectorSelection';
import type { CatalogPreference, PropertyDetailField, SeekerRequirement } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice, toEnglishDigits } from '@/constants/market';
import { getRequirementCatalogFields } from '@/services/requirementFieldMap';
import { getPropertyFormField } from '@/services/propertyFormCatalog';
import { getStudioCatalogFieldLabel } from '@/services/studioCatalog';
import {
  formatPropertyDetailValue,
  getWantedApartmentSubtypeLabel,
  getWantedStudioDisplayRows,
  isWantedStudio,
} from '@/services/propertyDetailPresentation';

type Language = 'en' | 'ar';
export interface RequirementDetailRow {
  readonly field: string;
  readonly label: string;
  readonly value: string;
  readonly section: 'overview' | 'location' | 'specifications' | 'preferences' | 'budget' | 'notes';
}

const words = (language: Language, en: string, ar: string) => language === 'ar' ? ar : en;
const yesNo = (value: boolean, language: Language) => words(language, value ? 'Yes' : 'No', value ? 'نعم' : 'لا');
const unspecified = (language: Language) => words(language, 'Not specified', 'غير محدد');
const number = (value: number | undefined, language: Language) =>
  value === undefined ? unspecified(language) : toEnglishDigits(String(value));

const amenityLabels: Record<string, readonly [string, string]> = {
  heating: ['Heating', 'تدفئة'], balcony: ['Balcony', 'شرفة'],
  maid_room: ['Maid room', 'غرفة خادمة'], laundry_room: ['Laundry room', 'غرفة غسيل'],
  solar_heater: ['Solar heater', 'سخان شمسي'], elevator: ['Elevator', 'مصعد'],
  garden: ['Garden', 'حديقة'], security_guard: ['Security / Guard', 'أمن / حارس'],
  bbq_area: ['BBQ area', 'منطقة شواء'], private_roof: ['Private roof', 'سطح خاص'],
};
const choiceLabels: Record<string, readonly [string, string]> = {
  office: ['Office', 'مكتب'], retail: ['Retail', 'تجزئة'],
  warehouse: ['Warehouse', 'مستودع'], residential: ['Residential', 'سكني'],
  restaurant: ['Restaurant', 'مطعم'], clinic: ['Clinic', 'عيادة'],
};

export function getRequirementDetailIdentity(requirementId?: string | string[]): string | null {
  // A deep link with multiple IDs must not guess which record to display.
  const id = Array.isArray(requirementId) ? null : requirementId;
  return id && id.trim() && id !== 'new' ? id : null;
}

/** Read-only projection: each persisted meaning gets one display row, including zero and false. */
export function getRequirementDetailsRows(
  requirement: SeekerRequirement,
  language: Language,
  translate: (key: string) => string,
): RequirementDetailRow[] {
  const rows: RequirementDetailRow[] = [];
  const add = (section: RequirementDetailRow['section'], field: string, label: string, value: string) =>
    rows.push({ section, field, label, value });
  const label = (en: string, ar: string) => words(language, en, ar);
  const localizedAmenity = (id: string) => amenityLabels[id]?.[language === 'ar' ? 1 : 0] ?? id;
  const list = (items?: readonly string[]) => items === undefined
    ? unspecified(language)
    : items.length
      ? items.map(localizedAmenity).join(language === 'ar' ? '، ' : ', ')
      : words(language, 'None', 'لا يوجد');
  const studio = isWantedStudio(requirement);
  const subtype = getWantedApartmentSubtypeLabel(requirement, language);

  add('overview', 'purpose', label('Purpose', 'الغرض'), translate(`requirements.purpose.${requirement.purpose}`));
  add('overview', 'propertyType', label('Property type', 'نوع العقار'), requirement.propertyType === 'floor' ? getFloorTypeLabel(requirement.floorUse, language, translate('propertyType.floor')) : translate(`propertyType.${requirement.propertyType}`));
  if (requirement.propertyType === 'apartment') {
    add('overview', 'apartmentSubtype', label('Apartment subtype', 'نوع الشقة'), subtype ?? unspecified(language));
  }
  if (requirement.propertyType === 'floor') {
    add('overview', 'floorUse', label('Floor use', 'استخدام الدور'),
      requirement.floorUse ? formatPropertyDetailValue('floorUse', requirement.floorUse, language) : unspecified(language));
  }
  if (requirement.purpose === 'rent') {
    const cadence: Record<string, readonly [string, string]> = {
      daily: ['Daily', 'يومي'], monthly: ['Monthly', 'شهري'], yearly: ['Yearly', 'سنوي'],
    };
    add('overview', 'rentalPeriodId', label('Rental cadence', 'دورية الإيجار'),
      requirement.rentalPeriodId ? cadence[requirement.rentalPeriodId][language === 'ar' ? 1 : 0] : unspecified(language));
    add('overview', 'occupancy', label('Occupancy', 'السكن'),
      requirement.occupancy ? translate(`matching.occupancy.${requirement.occupancy}`) : unspecified(language));
  }

  add('location', 'preferredAreaMode', label('Area scope', 'نطاق المناطق'),
    requirement.preferredAreaMode === 'all_kuwait' ? label('All Kuwait', 'كل مناطق الكويت')
      : requirement.preferredAreaMode === 'specific_areas' ? label('Specific areas', 'مناطق محددة')
        : unspecified(language));
  add('location', 'preferredAreaIds', label('Preferred areas, in order', 'المناطق المفضلة بالترتيب'),
    requirement.preferredAreaMode === 'all_kuwait'
      ? label('Not applicable — all Kuwait', 'لا ينطبق — كل الكويت')
      : requirement.preferredAreaIds.length
        ? requirement.preferredAreaIds.map(id => {
          const area = getAreaById(id);
          return area ? (language === 'ar' ? area.ar : area.en) : label('Unknown area', 'منطقة غير معروفة');
        }).join(' → ')
        : unspecified(language));

  if (studio) {
    const openRoom = getWantedStudioDisplayRows(requirement, language).find(row => row.field === 'studioRoomCount');
    if (openRoom) add('specifications', openRoom.field, openRoom.label, openRoom.value);
    if (requirement.bedroomsMinimum !== undefined) {
      add('specifications', 'bedroomsMinimum', label('Minimum bedrooms', 'الحد الأدنى لغرف النوم'), number(requirement.bedroomsMinimum, language));
    }
  } else if (['apartment', 'house', 'villa', 'chalet'].includes(requirement.propertyType)
    || requirement.propertyType === 'floor' && requirement.floorUse === 'residential') {
    add('specifications', 'bedroomsMinimum', label('Minimum bedrooms', 'الحد الأدنى لغرف النوم'), number(requirement.bedroomsMinimum, language));
  }
  if (['apartment', 'house', 'villa', 'chalet'].includes(requirement.propertyType)
    || requirement.propertyType === 'floor' && requirement.floorUse === 'residential') {
    add('specifications', 'bathroomsMinimum', label('Minimum bathrooms', 'الحد الأدنى للحمامات'), number(requirement.bathroomsMinimum, language));
    if (!studio) add('specifications', 'masterBedroomsMinimum', label('Minimum master bedrooms', 'الحد الأدنى لغرف النوم الرئيسية'), number(requirement.masterBedroomsMinimum, language));
    else if (requirement.masterBedroomsMinimum !== undefined) add('specifications', 'masterBedroomsMinimum', label('Minimum master bedrooms', 'الحد الأدنى لغرف النوم الرئيسية'), number(requirement.masterBedroomsMinimum, language));
    add('preferences', 'driverRoom', label('Driver room', 'غرفة سائق'),
      requirement.driverRoom === undefined ? unspecified(language) : yesNo(requirement.driverRoom, language));
    add('preferences', 'preferredAmenities', label('Preferred amenities', 'المزايا المفضلة'), list(requirement.preferredAmenities));
    add('preferences', 'preferredAmenityExclusions', label('Excluded amenities', 'المزايا المستبعدة'), list(requirement.preferredAmenityExclusions));
  }
  if (['whole_building', 'apartment', 'floor', 'house', 'villa', 'chalet',
    'commercial_complex', 'office', 'shop', 'warehouse', 'other_built_property'].includes(requirement.propertyType)) {
    add('preferences', 'centralAC', label('Central air conditioning', 'تكييف مركزي'),
      requirement.centralAC === undefined ? unspecified(language) : yesNo(requirement.centralAC, language));
  }

  const preferences = requirement.catalogPreferences ?? [];
  const allowed = new Set(getRequirementCatalogFields(requirement.propertyType, requirement.floorUse, studio ? 'studio' : undefined).map(item => item.field));
  for (const preference of preferences) {
    if (preference.field === 'apartmentSubtype') continue;
    // Studio-only fields and read-compatible catalog entries are still saved contract data.
    if (!allowed.has(preference.field) && !studio) {
      const definition = getPropertyFormField(preference.field);
      if (!definition.wanted) continue;
    }
    const definition = getPropertyFormField(preference.field);
    const isStudioArea = studio && preference.field === 'builtUpAreaSquareMeters' && preference.kind === 'number';
    const value = isStudioArea
      ? toEnglishDigits(String(preference.value))
      : formatPreference(preference, requirement, language, translate);
    add(definition.group === 'amenity' ? 'preferences' : 'specifications',
      preference.field,
      isStudioArea
        ? getStudioCatalogFieldLabel('areaSquareMeters', 'wanted')[language === 'ar' ? 1 : 0]
        : definition.label[language === 'ar' ? 1 : 0],
      value);
  }

  if (requirement.purpose === 'rent') {
    for (const field of ['swimmingPool', 'gym', 'seaView'] as const) {
      const names = { swimmingPool: ['Swimming pool', 'مسبح'], gym: ['Gym', 'نادي رياضي'], seaView: ['Sea view', 'إطلالة بحرية'] } as const;
      add('preferences', field, names[field][language === 'ar' ? 1 : 0],
        requirement[field] === undefined ? unspecified(language) : yesNo(requirement[field], language));
    }
  }
  add('budget', 'budget.minimum', label('Minimum budget', 'الحد الأدنى للميزانية'),
    formatPrice(requirement.budget.minimum, requirement.budget.currencyCode, language));
  add('budget', 'budget.maximum', label('Maximum budget', 'الحد الأقصى للميزانية'),
    formatPrice(requirement.budget.maximum, requirement.budget.currencyCode, language));
  if (requirement.notes.length) {
    add('notes', 'notes', label('Notes', 'ملاحظات'), requirement.notes);
  }

  const hiddenValues = new Set([
    unspecified(language),
    words(language, 'None', 'لا يوجد'),
  ]);
  return rows.filter(row =>
    row.field !== 'preferredAmenityExclusions'
    && !hiddenValues.has(row.value));
}

function formatPreference(
  preference: CatalogPreference,
  requirement: SeekerRequirement,
  language: Language,
  translate: (key: string) => string,
): string {
  if (preference.kind === 'feature') return yesNo(preference.value, language);
  if (preference.kind === 'number') {
    const value = toEnglishDigits(String(preference.value));
    return preference.comparison === 'minimum' ? `${words(language, 'At least', 'على الأقل')} ${value}`
      : preference.comparison === 'maximum' ? `${words(language, 'Up to', 'حتى')} ${value}` : value;
  }
  if (preference.field === 'apartmentSubtype') return getWantedApartmentSubtypeLabel(requirement, language) ?? preference.value;
  if (preference.field === 'intendedUse' || preference.field === 'commercialActivity') {
    return choiceLabels[preference.value]?.[language === 'ar' ? 1 : 0] ?? preference.value;
  }
  return formatPropertyDetailValue(preference.field as PropertyDetailField, preference.value, language, translate);
}