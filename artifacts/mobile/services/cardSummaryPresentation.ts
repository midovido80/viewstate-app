import type { Property, SeekerRequirement } from '@workspace/property-domain';
import type { PersonPropertyLink, PropertySource } from '@/services/people';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatWantedBudget, getWantedAreaDisplayValues } from '@/services/offeredWantedPresentation';
import { getWantedApartmentSubtypeLabel, isOfferedStudio, isWantedStudio } from '@/services/propertyDetailPresentation';
import { getStudioCatalogFieldLabel } from '@/services/studioCatalog';
import { toEnglishDigits } from '@/constants/market';
import { squareFeetToSquareMeters } from '@/services/propertyFactProjection';
import {
  projectPropertyIntent,
  projectRequirementIntent,
} from '@/services/recordIntentPresentation';

export type CardSummaryLanguage = 'en' | 'ar';

export interface CardSummaryFormatters {
  readonly language: CardSummaryLanguage;
  readonly translate: (key: string) => string;
  readonly formatPrice: (amount: number, currencyCode: string) => string;
  readonly formatRentalPrice: (amount: number, currencyCode: string, rentalPeriodId?: string) => string;
}

export interface PropertyCardSummary {
  readonly typeLabel: string;
  readonly subtypeLabel?: string;
  readonly areaLabel: string;
  readonly studioAreaLabel?: string;
  readonly valueLabel: string;
}

export interface RequirementCardSummary {
  readonly typeLabel: string;
  readonly subtypeLabel?: string;
  readonly areaLabel: string;
  readonly studioAreaLabel?: string;
  readonly valueLabel: string;
}

export interface PersonActivityLine {
  readonly key: string;
  readonly id: string;
  readonly kind: 'request' | 'offer';
  readonly href: string;
  readonly label: string;
}

export function getPropertyCardSummary(
  property: Property,
  formatters: CardSummaryFormatters,
): PropertyCardSummary {
  const { language, translate } = formatters;
  const typeLabel = translate(`propertyType.${property.core.propertyType}`);
  const subtypeLabel = getPropertySubtype(property, formatters);
  const studioArea = isOfferedStudio(property)
    ? getOfferedStudioAreaSquareMeters(property)
    : undefined;
  const studioAreaLabel = studioArea === undefined
    ? undefined
    : `${getStudioCatalogFieldLabel('areaSquareMeters', 'offered')[language === 'ar' ? 1 : 0]}: ${toEnglishDigits(String(studioArea))}`;
  const area = getAreaById(property.core.locationArea.id);
  const areaLabel = area ? (language === 'ar' ? area.ar : area.en) : property.core.locationArea.id;
  const offer = property.activeOffer;
  const valueLabel = offer.transaction === 'rent'
    ? formatters.formatRentalPrice(offer.rentalPrice.amount, offer.rentalPrice.currencyCode, offer.rentalPeriodId)
    : offer.transaction === 'sale'
      ? formatters.formatPrice(offer.salePrice.amount, offer.salePrice.currencyCode)
      : language === 'ar' ? 'السعر غير متاح' : 'Price unavailable';
  return {
    typeLabel,
    ...(subtypeLabel ? { subtypeLabel } : {}),
    areaLabel,
    ...(studioAreaLabel ? { studioAreaLabel } : {}),
    valueLabel,
  };
}

export function getRequirementCardSummary(
  requirement: SeekerRequirement,
  formatters: CardSummaryFormatters,
): RequirementCardSummary {
  const { language, translate } = formatters;
  const typeLabel = translate(`propertyType.${requirement.propertyType}`);
  const subtypeLabel = getRequirementCardSubtypeLabel(requirement, language);
  const studioArea = isWantedStudio(requirement)
    ? requirement.catalogPreferences?.find(preference =>
      preference.field === 'builtUpAreaSquareMeters' && preference.kind === 'number')
    : undefined;
  const studioAreaLabel = studioArea?.kind === 'number'
    ? `${getStudioCatalogFieldLabel('areaSquareMeters', 'wanted')[language === 'ar' ? 1 : 0]}: ${toEnglishDigits(String(studioArea.value))}`
    : undefined;
  const areaLabel = getWantedAreaDisplayValues(requirement, language, translate('properties.all_kuwait')).join(' · ')
    || (language === 'ar' ? 'لم تحدد منطقة' : 'No preferred area');
  const valueLabel = formatWantedBudget(
    requirement.budget,
    amount => formatters.formatPrice(amount, requirement.budget.currencyCode),
  ) ?? (language === 'ar' ? 'لم تحدد الميزانية' : 'No budget specified');
  return {
    typeLabel,
    ...(subtypeLabel ? { subtypeLabel } : {}),
    areaLabel,
    ...(studioAreaLabel ? { studioAreaLabel } : {}),
    valueLabel,
  };
}

/** Derives Person activity with one canonical intent from linked/source/property and Requirement records. */
export function getPersonDirectIntentActivityLines(
  personId: string,
  properties: readonly Property[],
  requirements: readonly SeekerRequirement[],
  links: readonly PersonPropertyLink[],
  sources: readonly PropertySource[],
  formatters: CardSummaryFormatters,
): PersonActivityLine[] {
  const { language } = formatters;
  const requirementsForPerson = requirements.filter(requirement => requirement.seekerId === personId);
  const propertyIds = new Set([
    ...links.filter(link => link.personId === personId).map(link => link.propertyCoreId),
    ...sources.filter(source => source.personId === personId).map(source => source.propertyCoreId),
  ]);
  const propertyById = new Map(properties.map(property => [property.core.id, property]));
  const requestLines: PersonActivityLine[] = requirementsForPerson.map(requirement => {
    const summary = getRequirementCardSummary(requirement, formatters);
    const parts = [
      projectRequirementIntent(requirement, language).label,
      summary.typeLabel,
      summary.subtypeLabel,
      summary.areaLabel,
      summary.studioAreaLabel,
      summary.valueLabel,
    ];
    return {
      key: `request:${requirement.id}`,
      id: requirement.id,
      kind: 'request',
      href: `/requirement/view/${encodeURIComponent(requirement.id)}`,
      label: localizedActivityLabel(parts),
    };
  });
  const seenProperties = new Set<string>();
  const offerLines: PersonActivityLine[] = [];
  for (const propertyId of propertyIds) {
    if (seenProperties.has(propertyId)) continue;
    seenProperties.add(propertyId);
    const property = propertyById.get(propertyId);
    if (!property) continue;
    const summary = getPropertyCardSummary(property, formatters);
    const parts = [
      projectPropertyIntent(property, language).label,
      summary.typeLabel,
      summary.subtypeLabel,
      summary.areaLabel,
      summary.studioAreaLabel,
      summary.valueLabel,
    ];
    offerLines.push({
      key: `offer:${propertyId}`,
      id: propertyId,
      kind: 'offer',
      href: `/property/${encodeURIComponent(propertyId)}`,
      label: localizedActivityLabel(parts),
    });
  }
  if (requestLines.length && offerLines.length) {
    return [
      requestLines[0]!,
      offerLines[0]!,
      ...requestLines.slice(1),
      ...offerLines.slice(1),
    ];
  }
  return [...requestLines, ...offerLines];
}

export function getPersonActivityMoreLabel(count: number, language: CardSummaryLanguage): string {
  return language === 'ar' ? `+${count} أخرى` : `+${count} more`;
}

function getPropertySubtype(property: Property, formatters: CardSummaryFormatters): string | undefined {
  if (property.core.propertyType !== 'apartment') return undefined;
  const details = property.typeDetails as Readonly<Record<string, unknown>> | undefined;
  const value = details?.apartmentSubtype;
  const subtype = typeof value === 'object' && value !== null && 'value' in value
    ? String((value as { value: unknown }).value)
    : String(value ?? '');
  const canonical = subtype === 'standard' ? 'standard_apartment' : subtype;
  if (canonical === 'studio' && isOfferedStudio(property)) return formatters.translate('enrich.apartment_subtype.studio');
  if (canonical === 'standard_apartment') return formatters.language === 'ar' ? 'عادية' : 'Standard';
  if (canonical === 'duplex' || canonical === 'studio') {
    return formatters.translate(`enrich.apartment_subtype.${canonical}`);
  }
  return undefined;
}

function getRequirementCardSubtypeLabel(
  requirement: SeekerRequirement,
  language: CardSummaryLanguage,
): string | undefined {
  const hasStandardApartmentSubtype = requirement.propertyType === 'apartment'
    && requirement.catalogPreferences?.some(preference =>
      preference.field === 'apartmentSubtype'
      && preference.kind === 'choice'
      && (preference.value === 'standard' || preference.value === 'standard_apartment'),
    ) === true;
  if (hasStandardApartmentSubtype) return language === 'ar' ? 'عادية' : 'Standard';
  return getWantedApartmentSubtypeLabel(requirement, language);
}

function readNumber(value: unknown): number | undefined {
  const unwrapped = typeof value === 'object' && value !== null && 'value' in value
    ? (value as { value: unknown }).value
    : value;
  return typeof unwrapped === 'number' && Number.isFinite(unwrapped) ? unwrapped : undefined;
}

function getOfferedStudioAreaSquareMeters(property: Property): number | undefined {
  if (property.areaSquareMeters !== undefined) {
    return property.areaUnit === 'square_foot'
      ? squareFeetToSquareMeters(property.areaSquareMeters)
      : property.areaSquareMeters;
  }
  return readNumber(
    (property.typeDetails as Readonly<Record<string, unknown>> | undefined)?.builtUpAreaSquareMeters,
  );
}

function localizedActivityLabel(parts: readonly (string | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}