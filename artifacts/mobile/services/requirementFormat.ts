import { SeekerRequirement } from '@workspace/property-domain';
import { Translations } from '@/contexts/I18nContext';

/**
 * Formats a Requirement's type and meaningful usage/activity into a single string.
 * Examples:
 * - Shop — Cafe (via commercialActivity)
 * - Apartment — Family (via occupancy)
 * - Office (type-only fallback to explain the contract limitation because the domain contract does not support commercialActivity for offices)
 */
export function formatRequirementTypeUsage(
  requirement: SeekerRequirement,
  t: (key: keyof Translations) => string
): string {
  const parts = [t(`propertyType.${requirement.propertyType}` as keyof Translations)];
  
  if ('floorUse' in requirement && requirement.floorUse) {
    parts.push(t(`requirements.floor_use.${requirement.floorUse}` as keyof Translations));
  }
  
  if ('commercialActivity' in requirement && requirement.commercialActivity) {
    parts.push(requirement.commercialActivity);
  } else if ('occupancy' in requirement && requirement.occupancy && requirement.occupancy !== 'any') {
    parts.push(t(`matching.occupancy.${requirement.occupancy}` as keyof Translations));
  }
  
  return parts.join(' — ');
}
