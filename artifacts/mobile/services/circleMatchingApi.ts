import type { Property, PropertyDetailField, SeekerRequirement } from '@workspace/property-domain';
import { normalizeMyPropertyCandidate } from './myPropertiesMatchingSource';
import type { CloudRequest } from './workspaceCloud';

export async function circleRpc<T>(request: CloudRequest, name: `vs_circle_${string}`, params = {}): Promise<T> {
  const response = await request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  const body = await response.text();
  return (body ? JSON.parse(body) : null) as T;
}

const sharedDetailFields = new Set<PropertyDetailField>([
  'apartmentSubtype', 'furnishing', 'bedroomCount', 'bathroomCount',
  'masterBedroomCount', 'studioRoomCount', 'parkingSpaceCount',
  'hasCentralAC', 'hasElevator', 'hasSecurityGuard', 'hasBalcony', 'hasMaidRoom',
]);

export function circlePropertyFacts(property: Property) {
  if (property.core.propertyType !== 'apartment' || property.activeOffer.transaction !== 'rent'
    || property.activeOffer.rentalPrice.currencyCode !== 'KWD' || property.marketingStatus === 'sold') return null;
  const source = normalizeMyPropertyCandidate(property)?.property;
  if (!source) return null;
  const { core, activeOffer, marketingStatus, rentalAvailability } = source;
  return {
    core, activeOffer, marketingStatus, rentalAvailability,
    typeDetails: {
      propertyType: 'apartment',
      ...Object.fromEntries(Object.entries(source.typeDetails ?? {})
        .filter(([field]) => sharedDetailFields.has(field as PropertyDetailField))),
    },
  };
}

export function circleRequestFacts(requirement: SeekerRequirement) {
  if (requirement.purpose !== 'rent' || requirement.propertyType !== 'apartment'
    || requirement.budget.currencyCode !== 'KWD' || !requirement.budget.maximum
    || !requirement.rentalPeriodId) return null;
  return {
    p_source: requirement.id,
    p_areas: requirement.preferredAreaMode === 'all_kuwait' ? [] : requirement.preferredAreaIds,
    p_max: requirement.budget.maximum,
    p_period: requirement.rentalPeriodId,
    p_bedrooms: requirement.bedroomsMinimum ?? null,
    p_bathrooms: requirement.bathroomsMinimum ?? null,
  };
}
