import { validateProperty, validateSeekerRequirement, type Property, type SeekerRequirement } from '@workspace/property-domain';
import { normalizeMyPropertyCandidate } from './myPropertiesMatchingSource';
import { COMMERCIAL_NEARBY_SERVICES, DEMO_NEARBY_SERVICES } from './propertyDemoCatalog';
import type { CloudRequest } from './workspaceCloud';

const nearbyIds = new Set<string>([...DEMO_NEARBY_SERVICES, ...COMMERCIAL_NEARBY_SERVICES].map(option => option.id));
const activityValues = ['retail', 'office', 'restaurant', 'clinic', 'warehouse'];
const intendedUseValues = ['office', 'retail', 'warehouse', 'residential'];

export async function circleRpc<T>(request: CloudRequest, name: `vs_circle_${string}`, params = {}): Promise<T> {
  const response = await request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  const body = await response.text();
  return (body ? JSON.parse(body) : null) as T;
}

/** Only the domain's matching projection is published. Never send the private record. */
export function circlePropertyFacts(property: Property) {
  const offer = property.activeOffer;
  const price = offer.transaction === 'rent' ? offer.rentalPrice : offer.salePrice;
  if (price.currencyCode !== 'KWD' || property.marketingStatus === 'sold'
    || (offer.transaction === 'rent' && property.core.propertyType === 'commercial_complex')) return null;
  const source = normalizeMyPropertyCandidate(property)?.property;
  if (!source) return null;
  const { core, activeOffer, marketingStatus, rentalAvailability, nearbyServices, areaSquareMeters, areaUnit } = source;
  const details = { ...source.typeDetails } as Record<string, unknown>;
  // Free-form remarks are never included. Structured arrays use the same safe
  // fields as the domain validators, even for records from older clients.
  delete details.clarification;
  // The engine derives hasKitchen from kitchen specifications, but stored
  // apartment details accept that flag only for a Studio.
  if (core.propertyType === 'apartment' && details.apartmentSubtype !== 'studio') delete details.hasKitchen;
  if (core.propertyType === 'other_built_property') details.clarification = 'Other built property';
  for (const field of ['commercialActivity', 'intendedUse', 'clarification']) {
    const value = details[field];
    if (field !== 'clarification' && !(field === 'commercialActivity' ? activityValues : intendedUseValues).includes(String(value))) {
      delete details[field];
      continue;
    }
    if (typeof value === 'string') details[field] = {
      value, privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    };
  }
  for (const [field, keys] of [
    ['apartmentLayouts', ['apartmentCount', 'bedrooms', 'bathrooms']],
    ['floorApartmentCounts', ['floorNumber', 'apartmentCount']],
  ] as const) {
    const rows = details[field];
    if (Array.isArray(rows)) details[field] = rows.map(row =>
      Object.fromEntries(keys.map(key => [key, row[key]])));
  }
  const facts: Property = {
    core, activeOffer, marketingStatus, rentalAvailability, areaSquareMeters, areaUnit,
    nearbyServices: nearbyServices ? [...new Set(nearbyServices.filter(id => nearbyIds.has(id)))] : undefined,
    typeDetails: details as unknown as Property['typeDetails'],
  };
  return validateProperty(facts).ok ? facts : null;
}

export function circleRequestFacts(requirement: SeekerRequirement) {
  if (requirement.budget.currencyCode !== 'KWD'
    || (requirement.purpose === 'rent' && requirement.propertyType === 'commercial_complex')
    || !validateSeekerRequirement(requirement, { allowLegacyEmptyAreaScope: true }).ok) return null;
  const { id, propertyType, purpose, budget, preferredAreaIds, preferredAreaMode,
    unspecifiedFields, preferredNearbyServices, commercialActivity, commercialServices,
    preferredAmenities, preferredAmenityExclusions, catalogPreferences, floorUse, propertyUse,
    masterBedroomsMinimum, driverRoom, bedroomsMinimum, bathroomsMinimum, centralAC, kitchens } = requirement;
  return {
    p_source: id,
    p_facts: {
      purpose, propertyType,
      budget: { currencyCode: budget.currencyCode, minimum: budget.minimum, maximum: budget.maximum },
      preferredAreaIds: [...preferredAreaIds],
      preferredAreaMode: preferredAreaMode ?? (preferredAreaIds.length ? 'specific_areas' : 'all_kuwait'),
      notes: '',
      unspecifiedFields,
      preferredNearbyServices: preferredNearbyServices?.filter(id => nearbyIds.has(id)),
      commercialActivity: commercialActivity && activityValues.includes(commercialActivity) ? commercialActivity : undefined,
      commercialServices,
      preferredAmenities, preferredAmenityExclusions,
      catalogPreferences: catalogPreferences?.map(preference => ({
        field: preference.field, kind: preference.kind, value: preference.value,
        ...(preference.kind === 'number' ? { comparison: preference.comparison } : {}),
      })),
      floorUse, propertyUse, masterBedroomsMinimum, driverRoom, bedroomsMinimum, bathroomsMinimum, centralAC, kitchens,
      ...(purpose === 'rent' ? {
        rentalPeriodId: requirement.rentalPeriodId, occupancy: requirement.occupancy,
        swimmingPool: requirement.swimmingPool, gym: requirement.gym, seaView: requirement.seaView,
      } : {}),
    },
  };
}
