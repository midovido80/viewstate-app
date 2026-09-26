import {
  createLiteralText,
  createPrivacyMetadata,
  validateProperty,
  validateSeekerRequirement,
  type CatalogPreference,
  type ApartmentTypeDetails,
  type Property,
  type RequirementAreaMode,
  type RequirementRentalPeriodId,
  type ResidentialAmenity,
  type SeekerRequirement,
  type Transaction,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { getCaptureMapsLinkValidationError } from '@/services/captureMapsLinkValidation';

export type StudioFormMode = 'offered' | 'wanted';
export type StudioAmenity = Extract<ResidentialAmenity, 'balcony' | 'elevator'>;
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
  readonly price: string;
  readonly budgetMinimum: string;
  readonly budgetMaximum: string;
  readonly rentalPeriodId: RequirementRentalPeriodId;
  readonly areaSquareMeters: string;
  readonly bathrooms: string;
  readonly floorNumber: string;
  readonly kitchen: StudioSelection;
  readonly hall: StudioSelection;
  readonly parking: StudioSelection;
  readonly amenities: readonly StudioAmenity[];
  readonly description: string;
}

export type StudioFormErrorCode =
  | 'required'
  | 'invalid_number'
  | 'invalid_choice'
  | 'invalid_area'
  | 'invalid_location_link'
  | 'invalid_budget'
  | 'unsupported_amenity';

export interface StudioFormError {
  readonly field: keyof StudioFormValues | 'preferredAreaIds';
  readonly code: StudioFormErrorCode;
  readonly message: string;
}

export interface StudioFormValidation {
  readonly ok: boolean;
  readonly errors: readonly StudioFormError[];
}

export const STUDIO_AMENITIES = ['balcony', 'elevator'] as const satisfies readonly StudioAmenity[];
const RENTAL_PERIODS = ['daily', 'monthly', 'yearly'] as const;
const PRIVACY_NORMAL = createPrivacyMetadata('normal', 'normal');
const PRIVACY_EXACT_LOCATION = createPrivacyMetadata('exact_location', 'explicit_per_share');

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
    price: '',
    budgetMinimum: '',
    budgetMaximum: '',
    rentalPeriodId: 'monthly',
    areaSquareMeters: '',
    bathrooms: '',
    floorNumber: '',
    kitchen: mode === 'offered' ? 'unknown' : 'not_important',
    hall: mode === 'offered' ? 'unknown' : 'not_important',
    parking: mode === 'offered' ? 'unknown' : 'not_important',
    amenities: [],
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
  field: 'areaSquareMeters' | 'bathrooms' | 'floorNumber',
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
    if (values.mapsLink !== '') {
      errors.push(formError('mapsLink', 'invalid_choice', 'Maps links are only stored for offered Studio properties.'));
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
    if (minimum === null || minimum < 0) {
      errors.push(formError('budgetMinimum', values.budgetMinimum === '' ? 'required' : 'invalid_budget', 'Enter a non-negative minimum budget.'));
    }
    if (maximum === null || maximum < 0) {
      errors.push(formError('budgetMaximum', values.budgetMaximum === '' ? 'required' : 'invalid_budget', 'Enter a non-negative maximum budget.'));
    }
    if (minimum !== null && maximum !== null && minimum > maximum) {
      errors.push(formError('budgetMinimum', 'invalid_budget', 'Minimum budget must not exceed maximum budget.'));
    }
  }

  addOptionalNumberError(errors, 'areaSquareMeters', values.areaSquareMeters, false, true);
  addOptionalNumberError(errors, 'bathrooms', values.bathrooms, true, false);
  addOptionalNumberError(errors, 'floorNumber', values.floorNumber, true, false);

  const offeredChoices: readonly StudioSelection[] = ['yes', 'no', 'unknown'];
  const wantedChoices: readonly StudioSelection[] = ['required', 'not_important', 'must_not_have'];
  const choices = values.mode === 'offered' ? offeredChoices : wantedChoices;
  for (const field of ['kitchen', 'hall', 'parking'] as const) {
    if (!choices.includes(values[field])) {
      errors.push(formError(field, 'invalid_choice', `Selection for ${field} is not valid for ${values.mode} Studio forms.`));
    }
  }
  const amenitySet = new Set<string>();
  values.amenities.forEach(amenity => {
    if (!(STUDIO_AMENITIES as readonly string[]).includes(amenity)) {
      errors.push(formError('amenities', 'unsupported_amenity', 'Amenity is not supported for Studio forms.'));
    } else if (amenitySet.has(amenity)) {
      errors.push(formError('amenities', 'unsupported_amenity', 'Studio amenities must not be duplicated.'));
    }
    amenitySet.add(amenity);
  });
  if (values.mapsLink !== '' && getCaptureMapsLinkValidationError(values.mapsLink)) {
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
  };
  const details = {
    propertyType: 'apartment' as const,
    apartmentSubtype: 'studio' as const,
    studioRoomCount: 1 as const,
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
    ...(values.amenities.includes('balcony') ? { hasBalcony: true } : {}),
    ...(values.amenities.includes('elevator') ? { hasElevator: true } : {}),
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
  seekerId: string,
): SeekerRequirement {
  assertValidForm(values);
  if (values.mode !== 'wanted') throw new Error('STUDIO_REQUIREMENT_REQUIRES_WANTED_MODE');
  const minimum = parseNumericInput(values.budgetMinimum)!;
  const maximum = parseNumericInput(values.budgetMaximum)!;
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
  const candidate = {
    id,
    seekerId,
    purpose: values.transaction === 'sale' ? 'buy' as const : 'rent' as const,
    propertyType: 'apartment' as const,
    preferredAreaIds: values.preferredAreaMode === 'all_kuwait' ? [] : [...values.preferredAreaIds],
    preferredAreaMode: values.preferredAreaMode,
    budget: { minimum, maximum, currencyCode: 'KWD' },
    notes: values.description,
    ...(numberValue(values.bathrooms) !== undefined
      ? { bathroomsMinimum: numberValue(values.bathrooms) }
      : {}),
    ...(values.amenities.length > 0 ? { preferredAmenities: [...values.amenities] } : {}),
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
  return property.core.propertyType === 'apartment'
    && property.typeDetails?.propertyType === 'apartment'
    && property.typeDetails.apartmentSubtype === 'studio'
    && (property.typeDetails.studioRoomCount === undefined || property.typeDetails.studioRoomCount === 1)
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
  const amenityValues: StudioAmenity[] = [];
  if (details.hasBalcony === true) amenityValues.push('balcony');
  if (details.hasElevator === true) amenityValues.push('elevator');
  return {
    ...createStudioFormValues('offered', transaction),
    locationAreaId: property.core.locationArea.id,
    mapsLink: property.locationEnrichment?.mapsLink?.value ?? '',
    price: String(transaction === 'sale'
      ? property.activeOffer.salePrice.amount
      : property.activeOffer.rentalPrice.amount),
    rentalPeriodId: transaction === 'rent'
      ? property.activeOffer.rentalPeriodId as RequirementRentalPeriodId
      : 'monthly',
    areaSquareMeters: parseStudioField(details.builtUpAreaSquareMeters),
    bathrooms: parseStudioField(details.bathroomCount),
    floorNumber: parseStudioField(details.floorNumber),
    kitchen: details.hasKitchen === true ? 'yes' : details.hasKitchen === false ? 'no' : 'unknown',
    hall: details.hasHall === true ? 'yes' : details.hasHall === false ? 'no' : 'unknown',
    parking: details.hasParking === true ? 'yes' : details.hasParking === false ? 'no' : 'unknown',
    amenities: amenityValues,
    description: property.core.description?.value ?? '',
  };
}

export function isStudioRequirement(requirement: SeekerRequirement): boolean {
  if (requirement.propertyType !== 'apartment') return false;
  if ((requirement.preferredAmenities ?? []).some(amenity =>
    !(STUDIO_AMENITIES as readonly string[]).includes(amenity))) return false;
  if ((requirement.preferredAmenityExclusions ?? []).length > 0) return false;
  if (requirement.bedroomsMinimum !== undefined
    || requirement.masterBedroomsMinimum !== undefined
    || requirement.centralAC !== undefined
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
  const amenities = (requirement.preferredAmenities ?? [])
    .filter((amenity): amenity is StudioAmenity => (STUDIO_AMENITIES as readonly string[]).includes(amenity));
  const area = studioPreference(requirement, 'builtUpAreaSquareMeters');
  const floor = studioPreference(requirement, 'floorNumber');
  return {
    ...createStudioFormValues('wanted', transaction),
    preferredAreaMode: requirement.preferredAreaMode ?? (requirement.preferredAreaIds.length ? 'specific_areas' : 'all_kuwait'),
    preferredAreaIds: [...requirement.preferredAreaIds],
    budgetMinimum: String(requirement.budget.minimum),
    budgetMaximum: String(requirement.budget.maximum),
    rentalPeriodId: requirement.purpose === 'rent'
      ? requirement.rentalPeriodId ?? 'monthly'
      : 'monthly',
    areaSquareMeters: area?.kind === 'number' ? String(area.value) : '',
    bathrooms: requirement.bathroomsMinimum === undefined ? '' : String(requirement.bathroomsMinimum),
    floorNumber: floor?.kind === 'number' ? String(floor.value) : '',
    kitchen: wantedSelection(requirement, 'hasKitchen'),
    hall: wantedSelection(requirement, 'hasHall'),
    parking: wantedSelection(requirement, 'hasParking'),
    amenities,
    description: requirement.notes,
  };
}