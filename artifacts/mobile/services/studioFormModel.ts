import {
  createLiteralText,
  createPrivacyMetadata,
  validateProperty,
  validateSeekerRequirement,
  type CatalogPreference,
  type ApartmentTypeDetails,
  type Property,
  type PropertyOccupancy,
  type RequirementAreaMode,
  type RequirementRentalPeriodId,
  type ResidentialAmenity,
  type SeekerRequirement,
  type Transaction,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { getCaptureMapsLinkValidationError } from '@/services/captureMapsLinkValidation';
import {
  getStudioCatalogField,
} from '@/services/studioCatalog';

import { STUDIO_FEATURES, type StudioFeatureField } from '@/services/studioAmenities';

export type StudioFormMode = 'offered' | 'wanted';
export type StudioAmenity = Extract<ResidentialAmenity, 'balcony' | 'elevator' | 'security_guard'>;
export type StudioOfferedSelection = 'yes' | 'no' | 'unknown';
export type StudioWantedSelection = 'required' | 'not_important' | 'must_not_have';
export type StudioSelection = StudioOfferedSelection | StudioWantedSelection;

export interface StudioFormValues {
  readonly mode: StudioFormMode;
  readonly transaction: Transaction;
  readonly locationAreaId: string;
  readonly preferredAreaMode: RequirementAreaMode;
  readonly preferredAreaIds: readonly string[];
  readonly mapsLink: string;
  readonly privateNotes: string;
  readonly occupancy?: PropertyOccupancy;
  readonly price: string;
  readonly budgetOpen?: boolean;
  readonly budgetMinimum: string;
  readonly budgetMaximum: string;
  readonly rentalPeriodId: RequirementRentalPeriodId;
  readonly areaSquareMeters: string;
  readonly bathrooms: string;
  /** Original non-template bathroom value, retained only when hydrating legacy records. */
  readonly legacyBathroomCount?: number | null;
  /** Set only after the editor explicitly confirms replacing a legacy bathroom value. */
  readonly legacyBathroomConfirmed?: boolean;
  readonly floorNumber: string;
  readonly kitchen: StudioSelection;
  readonly hall: StudioSelection;
  readonly parking: StudioSelection;
  readonly amenitySelections?: Readonly<Partial<Record<StudioFeatureField, StudioSelection>>>;
  readonly nearbyServices?: readonly string[];
  readonly description: string;
}

export type StudioFormErrorCode =
  | 'required'
  | 'invalid_number'
  | 'invalid_choice'
  | 'invalid_area'
  | 'invalid_location_link'
  | 'invalid_budget';

export interface StudioFormError {
  readonly field: keyof StudioFormValues | 'preferredAreaIds';
  readonly code: StudioFormErrorCode;
  readonly message: string;
}

export interface StudioFormValidation {
  readonly ok: boolean;
  readonly errors: readonly StudioFormError[];
}

/** @deprecated Legacy allowlist used only to recognize stored requirements. */
export const STUDIO_AMENITIES = ['balcony', 'elevator', 'security_guard'] as const satisfies readonly StudioAmenity[];
const RENTAL_PERIODS = ['daily', 'monthly', 'yearly'] as const;
const PRIVACY_NORMAL = createPrivacyMetadata('normal', 'normal');
const PRIVACY_EXACT_LOCATION = createPrivacyMetadata('exact_location', 'explicit_per_share');
const STUDIO_OPEN_ROOM_COUNT = Number(getStudioCatalogField('studioRoomCount').fixedValue) as 1;
const STUDIO_BATHROOM_FIXED_VALUE = getStudioCatalogField('bathrooms').fixedValue!;
const STUDIO_BATHROOM_FIXED_COUNT = Number(STUDIO_BATHROOM_FIXED_VALUE);

export function createStudioFormValues(
  mode: StudioFormMode,
  transaction: Transaction,
): StudioFormValues {
  return {
    mode,
    transaction,
    locationAreaId: '',
    preferredAreaMode: 'specific_areas',
    preferredAreaIds: [],
    mapsLink: '',
    privateNotes: '',
    price: '',
    budgetMinimum: '',
    budgetMaximum: '',
    rentalPeriodId: 'monthly',
    areaSquareMeters: '',
    bathrooms: STUDIO_BATHROOM_FIXED_VALUE,
    floorNumber: '',
    kitchen: mode === 'offered' ? 'unknown' : 'not_important',
    hall: mode === 'offered' ? 'unknown' : 'not_important',
    parking: mode === 'offered' ? 'unknown' : 'not_important',
    amenitySelections: Object.fromEntries(STUDIO_FEATURES.map(item => [item.field, mode === 'offered' ? 'unknown' : 'not_important'])),
    nearbyServices: [],
    description: '',
  };
}

function formError(
  field: StudioFormError['field'],
  code: StudioFormErrorCode,
  message: string,
): StudioFormError {
  return { field, code, message };
}

function parseNumericInput(value: string): number | null {
  const normalized = value
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٫,]/g, '.')
    .trim();
  if (!normalized || !/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseIntegerInput(value: string): number | null {
  const number = parseNumericInput(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

function addOptionalNumberError(
  errors: StudioFormError[],
  field: 'areaSquareMeters' | 'floorNumber',
  value: string,
  integer: boolean,
  positive: boolean,
): void {
  if (value === '') return;
  const number = integer ? parseIntegerInput(value) : parseNumericInput(value);
  if (number === null || (positive ? number <= 0 : number < 0)) {
    errors.push(formError(field, 'invalid_number', `${field} must be a valid ${positive ? 'positive' : 'non-negative'} ${integer ? 'whole number' : 'number'}.`));
  }
}

function legacyBathroomValueIsUntouched(values: StudioFormValues): boolean {
  if (values.legacyBathroomCount === undefined) return false;
  if (values.legacyBathroomCount === null) return values.bathrooms === '';
  return parseIntegerInput(values.bathrooms) === values.legacyBathroomCount;
}

/**
 * Returns the legacy incompatibility that the editor must surface for
 * confirmation before replacing it with the one-bathroom Studio template.
 */
export function getStudioBathroomConfirmationCase(
  values: StudioFormValues,
): 'missing' | 'zero' | 'non_one' | undefined {
  if (values.legacyBathroomCount === undefined || values.legacyBathroomConfirmed === true) return undefined;
  if (values.legacyBathroomCount === null) return 'missing';
  return values.legacyBathroomCount === 0 ? 'zero' : 'non_one';
}

export function validateStudioForm(values: StudioFormValues): StudioFormValidation {
  const errors: StudioFormError[] = [];
  if (values.mode !== 'offered' && values.mode !== 'wanted') {
    errors.push(formError('mode', 'invalid_choice', 'Mode must be offered or wanted.'));
  }
  if (values.transaction !== 'sale' && values.transaction !== 'rent') {
    errors.push(formError('transaction', 'invalid_choice', 'Transaction must be sale or rent.'));
  }
  if (!RENTAL_PERIODS.includes(values.rentalPeriodId)) {
    errors.push(formError('rentalPeriodId', 'invalid_choice', 'Rental period must be daily, monthly, or yearly.'));
  }

  if (values.mode === 'offered') {
    if (values.occupancy !== undefined && !['family', 'bachelor', 'any'].includes(values.occupancy)) {
      errors.push(formError('occupancy', 'invalid_choice', 'Select Family, Bachelor, or Any.'));
    }
    if (!values.locationAreaId || getAreaById(values.locationAreaId) === undefined) {
      errors.push(formError('locationAreaId', 'invalid_area', 'Select a canonical Kuwait area.'));
    }
    const price = parseNumericInput(values.price);
    if (price === null || price <= 0) {
      errors.push(formError('price', values.price === '' ? 'required' : 'invalid_number', 'Enter a positive price.'));
    }
    if (values.preferredAreaMode !== 'specific_areas' || values.preferredAreaIds.length > 0) {
      errors.push(formError('preferredAreaIds', 'invalid_choice', 'Preferred-area scope is only supported for wanted Studio forms.'));
    }
    if (values.budgetMinimum !== '' || values.budgetMaximum !== '') {
      if (values.budgetMinimum !== '') {
        errors.push(formError('budgetMinimum', 'invalid_choice', 'Budget ranges are only supported for wanted Studio forms.'));
      }
      if (values.budgetMaximum !== '') {
        errors.push(formError('budgetMaximum', 'invalid_choice', 'Budget ranges are only supported for wanted Studio forms.'));
      }
    }
  } else {
    if (values.locationAreaId !== '') {
      errors.push(formError('locationAreaId', 'invalid_choice', 'A single offered area is not used for wanted Studio forms.'));
    }
    if (values.price !== '') {
      errors.push(formError('price', 'invalid_choice', 'A single price is not used for wanted Studio forms.'));
    }
    if (values.preferredAreaMode === 'specific_areas') {
      if (values.preferredAreaIds.length === 0) {
        errors.push(formError('preferredAreaIds', 'required', 'Choose at least one area or select All Kuwait.'));
      }
      const seen = new Set<string>();
      values.preferredAreaIds.forEach((areaId, index) => {
        if (typeof areaId !== 'string' || getAreaById(areaId) === undefined) {
          errors.push(formError('preferredAreaIds', 'invalid_area', `Area at position ${index + 1} is not canonical.`));
        } else if (seen.has(areaId)) {
          errors.push(formError('preferredAreaIds', 'invalid_area', 'Preferred areas must not be duplicated.'));
        }
        seen.add(areaId);
      });
    } else if (values.preferredAreaMode !== 'all_kuwait') {
      errors.push(formError('preferredAreaMode', 'invalid_choice', 'Choose specific areas or All Kuwait.'));
    } else if (values.preferredAreaIds.length > 0) {
      errors.push(formError('preferredAreaIds', 'invalid_area', 'All Kuwait cannot include specific areas.'));
    }

    const minimum = parseNumericInput(values.budgetMinimum);
    const maximum = parseNumericInput(values.budgetMaximum);
    if (values.budgetOpen) {
      if (values.budgetMinimum.trim() || values.budgetMaximum.trim()) errors.push(formError('budgetMinimum', 'invalid_budget', 'Open budget cannot contain a constraint.'));
    } else {
      if (!values.budgetMinimum.trim() && !values.budgetMaximum.trim()) errors.push(formError('budgetMinimum', 'required', 'Enter a budget or select Open budget.'));
      if (values.budgetMinimum.trim() && (minimum === null || minimum < 0)) errors.push(formError('budgetMinimum', 'invalid_budget', 'Enter a non-negative minimum budget.'));
      if (values.budgetMaximum.trim() && (maximum === null || maximum <= 0)) errors.push(formError('budgetMaximum', 'invalid_budget', 'Enter a positive maximum budget.'));
      if (minimum === 0 && maximum === null) errors.push(formError('budgetMinimum', 'invalid_budget', 'Enter a positive budget.'));
      if (minimum !== null && maximum !== null && minimum > maximum) errors.push(formError('budgetMinimum', 'invalid_budget', 'Minimum budget must not exceed maximum budget.'));
    }
  }

  addOptionalNumberError(errors, 'areaSquareMeters', values.areaSquareMeters, false, true);
  addOptionalNumberError(errors, 'floorNumber', values.floorNumber, true, false);
  const legacyBathroomIsUnconfirmed = values.legacyBathroomCount !== undefined
    && values.legacyBathroomConfirmed !== true
    && !legacyBathroomValueIsUntouched(values);
  if ((values.bathrooms !== STUDIO_BATHROOM_FIXED_VALUE
      && !legacyBathroomValueIsUntouched(values))
    || legacyBathroomIsUnconfirmed) {
    errors.push(formError('bathrooms', 'invalid_choice', 'Studio bathroom count is fixed at one; confirm a legacy value before replacing it.'));
  }

  for (const field of ['kitchen', 'hall', 'parking'] as const) {
    const definition = getStudioCatalogField(field);
    const quickPickValues = definition.quickPicks?.flatMap(choice => {
      const value = choice.modeValues[values.mode];
      return value === undefined ? [] : [value];
    }) ?? [];
    const untouchedValue = definition.untouchedValues?.[values.mode];
    if (!quickPickValues.includes(values[field]) && values[field] !== untouchedValue) {
      errors.push(formError(field, 'invalid_choice', `Selection for ${field} is not valid for ${values.mode} Studio forms.`));
    }
  }
  const allowedSelections = values.mode === 'offered' ? ['yes', 'no', 'unknown'] : ['required', 'must_not_have', 'not_important'];
  if (Object.entries(values.amenitySelections ?? {}).some(([field, selection]) => !STUDIO_FEATURES.some(item => item.field === field) || !allowedSelections.includes(selection))) {
    errors.push(formError('amenitySelections', 'invalid_choice', 'Select an approved Studio amenity.'));
  }
  if (values.nearbyServices !== undefined && (!Array.isArray(values.nearbyServices) || values.nearbyServices.some(id => typeof id !== 'string' || !id.trim()) || new Set(values.nearbyServices).size !== values.nearbyServices.length)) {
    errors.push(formError('nearbyServices', 'invalid_choice', 'Nearby services must be unique identifiers.'));
  }
  if (values.mode === 'offered' && values.mapsLink !== '' && getCaptureMapsLinkValidationError(values.mapsLink)) {
    errors.push(formError('mapsLink', 'invalid_location_link', 'Enter a supported Google Maps link.'));
  }
  if (values.description !== '' && values.description.trim().length === 0) {
    errors.push(formError('description', 'required', 'Description cannot contain only whitespace.'));
  }
  return { ok: errors.length === 0, errors };
}

function assertValidForm(values: StudioFormValues): void {
  const result = validateStudioForm(values);
  if (!result.ok) {
    throw new Error(`INVALID_STUDIO_FORM:${result.errors.map(error => `${error.field}:${error.code}`).join(',')}`);
  }
}

function numberValue(value: string): number | undefined {
  return value === '' ? undefined : parseNumericInput(value) ?? undefined;
}

function booleanFromOffered(value: StudioSelection): boolean | undefined {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return undefined;
}

function preferenceFromWanted(
  field: 'hasKitchen' | 'hasHall' | 'hasParking',
  value: StudioSelection,
): CatalogPreference | undefined {
  if (value === 'not_important') return undefined;
  return { field, kind: 'feature', value: value === 'required' };
}

function studioPreference(requirement: SeekerRequirement, field: string): CatalogPreference | undefined {
  return requirement.catalogPreferences?.find(preference => preference.field === field);
}

function parseStudioField(value: number | undefined): string {
  if (value === undefined) return '';
  return String(value);
}

export function buildStudioProperty(
  values: StudioFormValues,
  id: string,
  offerId: string,
): Property {
  assertValidForm(values);
  if (values.mode !== 'offered') throw new Error('STUDIO_PROPERTY_REQUIRES_OFFERED_MODE');
  const price = parseNumericInput(values.price)!;
  const core = {
    id,
    propertyType: 'apartment' as const,
    locationArea: { id: values.locationAreaId },
    ...(values.description !== ''
      ? { description: createLiteralText(values.description, PRIVACY_NORMAL) }
      : {}),
    ...(values.privateNotes !== ''
      ? { privateNotes: createLiteralText(values.privateNotes, createPrivacyMetadata('private_notes', 'never')) }
      : {}),
  };
  const details = {
    propertyType: 'apartment' as const,
    apartmentSubtype: 'studio' as const,
    studioRoomCount: STUDIO_OPEN_ROOM_COUNT,
    ...Object.fromEntries(STUDIO_FEATURES.flatMap(item => { const value = booleanFromOffered(values.amenitySelections?.[item.field] ?? 'unknown'); return value === undefined ? [] : [[item.field, value]]; })),
    ...(values.occupancy !== undefined ? { occupancy: values.occupancy } : {}),
    ...(numberValue(values.areaSquareMeters) !== undefined
      ? { builtUpAreaSquareMeters: numberValue(values.areaSquareMeters) }
      : {}),
    ...(numberValue(values.bathrooms) !== undefined
      ? { bathroomCount: numberValue(values.bathrooms) }
      : {}),
    ...(numberValue(values.floorNumber) !== undefined
      ? { floorNumber: numberValue(values.floorNumber) }
      : {}),
    ...(booleanFromOffered(values.kitchen) !== undefined
      ? { hasKitchen: booleanFromOffered(values.kitchen) }
      : {}),
    ...(booleanFromOffered(values.hall) !== undefined
      ? { hasHall: booleanFromOffered(values.hall) }
      : {}),
    ...(booleanFromOffered(values.parking) !== undefined
      ? { hasParking: booleanFromOffered(values.parking) }
      : {}),
  };
  const property: Property = {
    core,
    activeOffer: values.transaction === 'sale'
      ? { id: offerId, propertyCoreId: id, transaction: 'sale', salePrice: { amount: price, currencyCode: 'KWD' } }
      : {
        id: offerId,
        propertyCoreId: id,
        transaction: 'rent',
        rentalPrice: { amount: price, currencyCode: 'KWD' },
        rentalPeriodId: values.rentalPeriodId,
      },
    typeDetails: details,
    nearbyServices: [...(values.nearbyServices ?? [])],
    ...(values.mapsLink !== ''
      ? {
        locationEnrichment: {
          mapsLink: createLiteralText(values.mapsLink, PRIVACY_EXACT_LOCATION),
        },
      }
      : {}),
  };
  const checked = validateProperty(property);
  if (!checked.ok) {
    throw new Error(`INVALID_STUDIO_PROPERTY:${checked.issues.map(item => item.path.join('.')).join(',')}`);
  }
  return checked.value;
}

export function buildStudioRequirement(
  values: StudioFormValues,
  id: string,
  seekerId: string | undefined,
): SeekerRequirement {
  assertValidForm(values);
  if (values.mode !== 'wanted') throw new Error('STUDIO_REQUIREMENT_REQUIRES_WANTED_MODE');
  const minimum = values.budgetOpen ? undefined : parseNumericInput(values.budgetMinimum) ?? undefined;
  const maximum = values.budgetOpen ? undefined : parseNumericInput(values.budgetMaximum) ?? undefined;
  const preferences: CatalogPreference[] = [
    { field: 'apartmentSubtype', kind: 'choice', value: 'studio' },
    ...(numberValue(values.areaSquareMeters) !== undefined
      ? [{ field: 'builtUpAreaSquareMeters', kind: 'number', comparison: 'minimum', value: numberValue(values.areaSquareMeters)! } as const]
      : []),
    ...(numberValue(values.floorNumber) !== undefined
      ? [{ field: 'floorNumber', kind: 'number', comparison: 'exact', value: numberValue(values.floorNumber)! } as const]
      : []),
    ...([
      preferenceFromWanted('hasKitchen', values.kitchen),
      preferenceFromWanted('hasHall', values.hall),
      preferenceFromWanted('hasParking', values.parking),
    ].filter((preference): preference is CatalogPreference => preference !== undefined)),
  ];
  for (const item of STUDIO_FEATURES) {
    if ('amenity' in item || item.field === 'hasCentralAC') continue;
    const selection = values.amenitySelections?.[item.field];
    if (selection === 'required' || selection === 'must_not_have') preferences.push({ field: item.field, kind: 'feature', value: selection === 'required' });
  }
  const candidate = {
    id,
    ...(seekerId !== undefined ? { seekerId } : {}),
    purpose: values.transaction === 'sale' ? 'buy' as const : 'rent' as const,
    propertyType: 'apartment' as const,
    preferredAreaIds: values.preferredAreaMode === 'all_kuwait' ? [] : [...values.preferredAreaIds],
    preferredAreaMode: values.preferredAreaMode,
    budget: { minimum, maximum, currencyCode: 'KWD' },
    ...(values.budgetOpen ? { unspecifiedFields: ['budget' as const] } : {}),
    notes: values.description,
    preferredNearbyServices: [...(values.nearbyServices ?? [])],
    ...(values.amenitySelections?.hasCentralAC === 'required' ? { centralAC: true } : values.amenitySelections?.hasCentralAC === 'must_not_have' ? { centralAC: false } : {}),
    ...(STUDIO_FEATURES.some(item => 'amenity' in item && values.amenitySelections?.[item.field] === 'required') ? { preferredAmenities: STUDIO_FEATURES.flatMap(item => 'amenity' in item && values.amenitySelections?.[item.field] === 'required' ? [item.amenity] : []) } : {}),
    ...(STUDIO_FEATURES.some(item => 'amenity' in item && values.amenitySelections?.[item.field] === 'must_not_have') ? { preferredAmenityExclusions: STUDIO_FEATURES.flatMap(item => 'amenity' in item && values.amenitySelections?.[item.field] === 'must_not_have' ? [item.amenity] : []) } : {}),
    ...(numberValue(values.bathrooms) !== undefined
      ? { bathroomsMinimum: numberValue(values.bathrooms) }
      : {}),
    ...(preferences.length > 0 ? { catalogPreferences: preferences } : {}),
    ...(values.transaction === 'rent' ? { rentalPeriodId: values.rentalPeriodId } : {}),
  };
  const checked = validateSeekerRequirement(candidate, {
    isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
  });
  if (!checked.ok) {
    throw new Error(`INVALID_STUDIO_REQUIREMENT:${checked.issues.map(item => item.path.join('.')).join(',')}`);
  }
  return checked.value;
}

export type StudioProperty = Property & {
  readonly typeDetails: ApartmentTypeDetails & {
    readonly apartmentSubtype: 'studio';
    readonly studioRoomCount?: 1;
  };
};

export function isStudioProperty(property: Property): property is StudioProperty {
  const details = property.typeDetails as (ApartmentTypeDetails & Readonly<Record<string, unknown>>) | undefined;
  const hasBuildingAggregate = [
    'unitCount',
    'apartmentCount',
    'shopCount',
    'officeCount',
    'floorCount',
    'bedroomsPerUnit',
    'bathroomsPerUnit',
  ].some(field => details && field in details);
  return !hasBuildingAggregate
    && property.core.propertyType === 'apartment'
    && property.typeDetails?.propertyType === 'apartment'
    && property.typeDetails.apartmentSubtype === 'studio'
    && (property.typeDetails.studioRoomCount === undefined
      || property.typeDetails.studioRoomCount === STUDIO_OPEN_ROOM_COUNT)
    && getAreaById(property.core.locationArea.id) !== undefined
    && validateProperty(property).ok;
}

export function readStudioProperty(property: Property): StudioFormValues {
  if (!isStudioProperty(property)) throw new Error('NOT_A_STUDIO_PROPERTY');
  const details = property.typeDetails;
  const transaction = property.activeOffer.transaction;
  if (transaction === 'rent'
    && !(RENTAL_PERIODS as readonly string[]).includes(property.activeOffer.rentalPeriodId)) {
    throw new Error('UNSUPPORTED_STUDIO_RENTAL_PERIOD');
  }
  return {
    ...createStudioFormValues('offered', transaction),
    locationAreaId: property.core.locationArea.id,
    mapsLink: property.locationEnrichment?.mapsLink?.value ?? '',
    privateNotes: property.core.privateNotes?.value ?? '',
    ...(details.occupancy !== undefined ? { occupancy: details.occupancy } : {}),
    price: String(transaction === 'sale'
      ? property.activeOffer.salePrice.amount
      : property.activeOffer.rentalPrice.amount),
    rentalPeriodId: transaction === 'rent'
      ? property.activeOffer.rentalPeriodId as RequirementRentalPeriodId
      : 'monthly',
    areaSquareMeters: parseStudioField(details.builtUpAreaSquareMeters),
    bathrooms: parseStudioField(details.bathroomCount),
    ...(details.bathroomCount !== STUDIO_BATHROOM_FIXED_COUNT
      ? { legacyBathroomCount: details.bathroomCount ?? null }
      : {}),
    floorNumber: parseStudioField(details.floorNumber),
    kitchen: details.hasKitchen === true ? 'yes' : details.hasKitchen === false ? 'no' : 'unknown',
    hall: details.hasHall === true ? 'yes' : details.hasHall === false ? 'no' : 'unknown',
    parking: details.hasParking === true ? 'yes' : details.hasParking === false ? 'no' : 'unknown',
    amenitySelections: Object.fromEntries(STUDIO_FEATURES.map(item => [item.field, details[item.field] === true ? 'yes' : details[item.field] === false ? 'no' : 'unknown'])),
    nearbyServices: [...(property.nearbyServices ?? [])],
    description: property.core.description?.value ?? '',
  };
}

export function isStudioRequirement(requirement: SeekerRequirement): boolean {
  if (requirement.propertyType !== 'apartment') return false;
  const rawRequirement = requirement as SeekerRequirement & Readonly<Record<string, unknown>>;
  if ([
    'unitCount',
    'apartmentCount',
    'shopCount',
    'officeCount',
    'floorCount',
    'bedroomsPerUnit',
    'bathroomsPerUnit',
  ].some(field => field in rawRequirement)) return false;
  if ((requirement.preferredAmenities ?? []).some(amenity =>
    !(STUDIO_AMENITIES as readonly string[]).includes(amenity))) return false;
  if ((requirement.preferredAmenityExclusions ?? []).some(amenity => !(STUDIO_AMENITIES as readonly string[]).includes(amenity))) return false;
  if (requirement.bedroomsMinimum !== undefined
    || requirement.masterBedroomsMinimum !== undefined
    || requirement.floorUse !== undefined
    || requirement.driverRoom !== undefined) return false;
  if (requirement.purpose === 'rent'
    && (requirement.occupancy !== undefined
      || requirement.swimmingPool !== undefined
      || requirement.gym !== undefined
      || requirement.seaView !== undefined)) return false;
  const preferences = requirement.catalogPreferences ?? [];
  const supportedFields = new Set([
    'apartmentSubtype',
    'builtUpAreaSquareMeters',
    'floorNumber',
    'hasKitchen',
    'hasHall',
    'hasParking',
    ...STUDIO_FEATURES.filter(item => !('amenity' in item) && item.field !== 'hasCentralAC').map(item => item.field),
  ]);
  if (preferences.some(preference => !supportedFields.has(preference.field))) return false;
  if (new Set(preferences.map(preference => preference.field)).size !== preferences.length) return false;
  const studioChoice = preferences.filter(preference => preference.field === 'apartmentSubtype');
  const preferencesAreValid = preferences.every(preference => {
    if (preference.field === 'apartmentSubtype') {
      return preference.kind === 'choice' && preference.value === 'studio';
    }
    if (preference.field === 'builtUpAreaSquareMeters') {
      return preference.kind === 'number' && preference.comparison === 'minimum'
        && Number.isFinite(preference.value) && preference.value > 0;
    }
    if (preference.field === 'floorNumber') {
      return preference.kind === 'number' && preference.comparison === 'exact'
        && Number.isSafeInteger(preference.value) && preference.value >= 0;
    }
    return preference.kind === 'feature' && typeof preference.value === 'boolean';
  });
  return studioChoice.length === 1
    && preferencesAreValid
    && preferences.some(preference =>
      preference.field === 'apartmentSubtype'
      && preference.kind === 'choice'
      && preference.value === 'studio')
    && validateSeekerRequirement(requirement, {
      isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
      allowLegacyEmptyAreaScope: true,
    }).ok;
}

function wantedSelection(requirement: SeekerRequirement, field: 'hasKitchen' | 'hasHall' | 'hasParking'): StudioWantedSelection {
  const preference = studioPreference(requirement, field);
  return preference?.kind === 'feature'
    ? preference.value ? 'required' : 'must_not_have'
    : 'not_important';
}

export function readStudioRequirement(requirement: SeekerRequirement): StudioFormValues {
  if (!isStudioRequirement(requirement)) throw new Error('NOT_A_STUDIO_REQUIREMENT');
  const transaction: Transaction = requirement.purpose === 'buy' ? 'sale' : 'rent';
  const area = studioPreference(requirement, 'builtUpAreaSquareMeters');
  const floor = studioPreference(requirement, 'floorNumber');
  return {
    ...createStudioFormValues('wanted', transaction),
    preferredAreaMode: requirement.preferredAreaMode ?? (requirement.preferredAreaIds.length ? 'specific_areas' : 'all_kuwait'),
    preferredAreaIds: [...requirement.preferredAreaIds],
    ...(requirement.unspecifiedFields?.includes('budget') ? { budgetOpen: true } : {}),
    budgetMinimum: requirement.budget.minimum === undefined ? '' : String(requirement.budget.minimum),
    budgetMaximum: requirement.budget.maximum === undefined ? '' : String(requirement.budget.maximum),
    rentalPeriodId: requirement.purpose === 'rent'
      ? requirement.rentalPeriodId ?? 'monthly'
      : 'monthly',
    areaSquareMeters: area?.kind === 'number' ? String(area.value) : '',
    bathrooms: requirement.bathroomsMinimum === undefined ? '' : String(requirement.bathroomsMinimum),
    ...(requirement.bathroomsMinimum !== STUDIO_BATHROOM_FIXED_COUNT
      ? { legacyBathroomCount: requirement.bathroomsMinimum ?? null }
      : {}),
    floorNumber: floor?.kind === 'number' ? String(floor.value) : '',
    kitchen: wantedSelection(requirement, 'hasKitchen'),
    hall: wantedSelection(requirement, 'hasHall'),
    parking: wantedSelection(requirement, 'hasParking'),
    amenitySelections: Object.fromEntries(STUDIO_FEATURES.map(item => {
      const value = item.field === 'hasCentralAC' ? requirement.centralAC
        : 'amenity' in item ? requirement.preferredAmenities?.includes(item.amenity) ? true : requirement.preferredAmenityExclusions?.includes(item.amenity) ? false : undefined
        : (() => { const preference = studioPreference(requirement, item.field); return preference?.kind === 'feature' ? preference.value : undefined; })();
      return [item.field, value === true ? 'required' : value === false ? 'must_not_have' : 'not_important'];
    })),
    nearbyServices: [...(requirement.preferredNearbyServices ?? [])],
    description: requirement.notes,
    mapsLink: '',
  };
}
