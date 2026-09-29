import type { Property, PropertyType, SeekerRequirement } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import type { Person } from '@/services/people';
import { isOfferedStudio, isWantedStudio } from '@/services/propertyDetailPresentation';
import {
  projectPropertyIntent,
  projectRequirementIntent,
} from '@/services/recordIntentPresentation';
import {
  flexibleSearchTerms,
  personClassificationSearchValues,
  recordIntentSearchValues,
  scoreFlexibleSearchFields,
  type FlexibleSearchField,
} from '@/services/flexibleSearch';

const propertyTypeLabels: Record<PropertyType, readonly string[]> = {
  apartment: ['apartment', 'شقة'],
  villa: ['villa', 'فيلا'],
  house: ['house', 'بيت'],
  floor: ['floor', 'دور'],
  commercial_complex: ['commercial complex', 'مجمع تجاري'],
  whole_building: ['whole building', 'عمارة كاملة'],
  office: ['office', 'مكتب'],
  shop: ['shop', 'محل'],
  warehouse: ['warehouse', 'مستودع'],
  chalet: ['chalet', 'شاليه'],
  other_built_property: ['other', 'أخرى'],
};

export interface GlobalSearchData {
  readonly people: readonly Person[];
  readonly properties: readonly Property[];
  readonly requirements: readonly SeekerRequirement[];
  /** Canonical source and link relationships indexed by Property ID, if available. */
  readonly linkedPeopleByProperty?: ReadonlyMap<string, readonly Person[]>;
  /** Search remains useful for readable records, but no-results is unsafe if link search failed. */
  readonly linkedPeopleUnavailable?: boolean;
}

export interface GlobalSearchResults {
  readonly people: readonly Person[];
  readonly properties: readonly Property[];
  readonly requirements: readonly {
    readonly requirement: SeekerRequirement;
    readonly seeker: Person | undefined;
  }[];
}

export type SearchMatchField = 'identifier' | 'name' | 'phone' | 'classification' | 'type' | 'area' | 'description' | 'requirement' | 'notes';
export type SearchMatchKind = 'exact' | 'prefix' | 'substring' | 'alias';
export interface SearchMatchReason {
  readonly kind: SearchMatchKind;
  readonly field: SearchMatchField;
}

export interface GlobalSearchResultsWithReasons extends GlobalSearchResults {
  readonly why: {
    readonly people: ReadonlyMap<string, SearchMatchReason>;
    readonly properties: ReadonlyMap<string, SearchMatchReason>;
    readonly requirements: ReadonlyMap<string, SearchMatchReason>;
  };
}

export const searchTerms = flexibleSearchTerms;

const MATCH_RANK: Record<SearchMatchKind, number> = {
  exact: 0,
  prefix: 1,
  substring: 2,
  alias: 3,
};

type SearchableField = FlexibleSearchField & { readonly field: SearchMatchField };

interface ScoredMatch {
  readonly reason: SearchMatchReason;
  readonly worstRank: number;
  readonly rankSum: number;
}

function areaFields(areaId: string): string[] {
  const area = getAreaById(areaId);
  return area
    ? [area.id, area.en, area.ar, area.governorateEn, area.governorateAr]
    : [areaId];
}

function searchableDescription(property: Property): string {
  const description = property.core.description;
  if (!description
    || description.privacy.classification !== 'normal'
    || description.privacy.disclosurePolicy !== 'normal') return '';
  return description.value;
}

/** The exact safe description projection also governs result subtitles. */
export function getSearchablePublicPropertyDescription(property: Property): string {
  return searchableDescription(property);
}

function readSubtype(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return String((value as { readonly value: unknown }).value ?? '');
  }
  return String(value ?? '');
}

function offeredApartmentSubtype(property: Property): string[] {
  if (property.core.propertyType !== 'apartment') return [];
  const details = property.typeDetails as Readonly<Record<string, unknown>> | undefined;
  const subtype = readSubtype(details?.apartmentSubtype).toLowerCase();
  if (!subtype) return [];
  return [
    subtype,
    subtype === 'standard_apartment' || subtype === 'standard' ? 'standard apartment' : '',
    subtype === 'duplex' ? 'duplex apartment' : '',
    subtype === 'studio' ? 'studio apartment' : '',
  ].filter(Boolean);
}

function wantedApartmentSubtype(requirement: SeekerRequirement): string[] {
  if (requirement.propertyType !== 'apartment') return [];
  const subtype = requirement.catalogPreferences?.find(preference => preference.field === 'apartmentSubtype');
  return subtype?.kind === 'choice' ? [subtype.value] : [];
}

function linkedPersonFields(people: readonly Person[]): SearchableField[] {
  return people.flatMap(person => [
    { field: 'name', value: person.name },
    ...personClassificationSearchValues(person.classifications)
      .map(value => ({ field: 'classification' as const, value })),
  ]);
}

function rankedUnique<T>(
  values: readonly T[],
  id: (value: T) => string,
  fields: (value: T) => readonly SearchableField[],
  terms: readonly string[],
): { readonly values: T[]; readonly why: ReadonlyMap<string, SearchMatchReason> } {
  const byId = new Map<string, { value: T; score: ScoredMatch; index: number }>();
  values.forEach((value, index) => {
    const match = scoreFlexibleSearchFields(fields(value), terms);
    if (!match) return;
    const score: ScoredMatch = {
      reason: { kind: match.kind, field: match.field as SearchMatchField },
      worstRank: match.worstRank,
      rankSum: match.rankSum,
    };
    const key = id(value);
    const existing = byId.get(key);
    if (!existing || score.worstRank < existing.score.worstRank
      || score.worstRank === existing.score.worstRank && score.rankSum < existing.score.rankSum) {
      byId.set(key, { value, score, index: existing?.index ?? index });
    }
  });
  const sorted = [...byId.values()].sort((left, right) =>
    left.score.worstRank - right.score.worstRank
      || left.score.rankSum - right.score.rankSum
      || left.index - right.index,
  );
  return {
    values: sorted.map(item => item.value),
    why: new Map(sorted.map(item => [id(item.value), item.score.reason])),
  };
}

export function searchGlobalData(data: GlobalSearchData, query: string): GlobalSearchResults {
  const { people, properties, requirements } = searchGlobalDataWithMatchReasons(data, query);
  return {
    people,
    properties,
    requirements,
  };
}

export function searchGlobalDataWithMatchReasons(data: GlobalSearchData, query: string): GlobalSearchResultsWithReasons {
  const terms = flexibleSearchTerms(query);
  if (!terms.length) return {
    people: [], properties: [], requirements: [],
    why: { people: new Map(), properties: new Map(), requirements: new Map() },
  };

  const people = rankedUnique(data.people, person => person.id, person => [
    { field: 'name', value: person.name },
    { field: 'phone', value: person.displayPhone },
    { field: 'phone', value: person.normalizedPhone },
    ...personClassificationSearchValues(person.classifications)
      .map(value => ({ field: 'classification' as const, value })),
  ], terms);

  const properties = rankedUnique(data.properties, property => property.core.id, property => {
    const intent = projectPropertyIntent(property, 'en');
    const linkedPeople = data.linkedPeopleByProperty?.get(property.core.id) ?? [];
    return [
      { field: 'identifier', value: property.core.id },
      { field: 'type', value: property.core.propertyType },
      ...propertyTypeLabels[property.core.propertyType].map(value => ({ field: 'type' as const, value })),
      ...offeredApartmentSubtype(property).map(value => ({ field: 'type' as const, value })),
      ...(isOfferedStudio(property) ? [{ field: 'type' as const, value: 'studio' }] : []),
      ...recordIntentSearchValues(intent.id).map(value => ({ field: 'type' as const, value })),
      ...areaFields(property.core.locationArea.id).map(value => ({ field: 'area' as const, value })),
      { field: 'description', value: searchableDescription(property) },
      ...linkedPersonFields(linkedPeople),
    ];
  }, terms);

  const peopleById = new Map(data.people.map(person => [person.id, person]));
  const requirements = rankedUnique(data.requirements, requirement => requirement.id, requirement => {
    const seeker = peopleById.get(requirement.seekerId);
    const studio = isWantedStudio(requirement);
    const intent = projectRequirementIntent(requirement, 'en');
    const allKuwaitArea = requirement.preferredAreaMode === 'all_kuwait'
      ? ['all kuwait', 'all_kuwait', 'كل مناطق الكويت'] : [];
    return [
      { field: 'name', value: seeker?.name ?? '' },
      ...recordIntentSearchValues(intent.id).map(value => ({ field: 'requirement' as const, value })),
      { field: 'type', value: requirement.propertyType },
      ...propertyTypeLabels[requirement.propertyType].map(value => ({ field: 'type' as const, value })),
      ...wantedApartmentSubtype(requirement).map(value => ({ field: 'type' as const, value })),
      ...(studio ? [{ field: 'type' as const, value: 'studio' }] : []),
      ...(seeker ? personClassificationSearchValues(seeker.classifications)
        .map(value => ({ field: 'classification' as const, value })) : []),
      ...requirement.preferredAreaIds.flatMap(areaFields).map(value => ({ field: 'area' as const, value })),
      ...allKuwaitArea.map(value => ({ field: 'area' as const, value })),
      { field: 'notes', value: requirement.notes },
    ];
  }, terms);

  return {
    people: people.values,
    properties: properties.values,
    requirements: requirements.values.map(requirement => ({
      requirement,
      seeker: peopleById.get(requirement.seekerId),
    })),
    why: { people: people.why, properties: properties.why, requirements: requirements.why },
  };
}