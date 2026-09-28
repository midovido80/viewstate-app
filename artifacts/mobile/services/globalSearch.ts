import type { Property, PropertyType, RequirementPurpose, SeekerRequirement } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import type { Person, PersonClassification } from '@/services/people';
import { isOfferedStudio, isWantedStudio } from '@/services/propertyDetailPresentation';

const classificationLabels: Record<PersonClassification, readonly string[]> = {
  seeker: ['seeker', 'باحث'],
  owner: ['owner', 'مالك'],
  broker: ['broker', 'دلال'],
  real_estate_company: ['real estate company', 'شركة عقارية'],
  building_guard: ['building guard', 'حارس'],
};

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

const purposeLabels: Record<RequirementPurpose, readonly string[]> = {
  rent: ['rent', 'إيجار'],
  buy: ['buy', 'شراء'],
};

export interface GlobalSearchData {
  readonly people: readonly Person[];
  readonly properties: readonly Property[];
  readonly requirements: readonly SeekerRequirement[];
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
export type SearchMatchKind = 'exact' | 'prefix' | 'substring' | 'alias' | 'fuzzy';
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

const ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['studio', 'استوديو', 'ستوديو', 'استديو', 'ستديو', 'ستيديو'],
  ['shop', 'store', 'shops', 'stores', 'محل', 'محلات'],
];

function normalizeSearchText(value: string): string {
  return Array.from(value.normalize('NFKC').trim().toLocaleLowerCase())
    .map(character => {
      const code = character.charCodeAt(0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
      if (/[\u064b-\u065f\u0670\u0640]/u.test(character)) return '';
      if (/[أإآٱ]/u.test(character)) return 'ا';
      if (character === 'ى') return 'ي';
      return character;
    })
    .join('');
}

export function searchTerms(query: string): string[] {
  return normalizeSearchText(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function aliasTerms(term: string): string[] {
  for (const group of ALIAS_GROUPS) {
    const normalized = group.map(normalizeSearchText);
    if (normalized.includes(term)) return normalized.filter(value => value !== term);
  }
  return [];
}

function boundedEditDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex++;
      rightIndex++;
      continue;
    }
    if (++edits > 1) return false;
    if (leftIndex + 1 < left.length && rightIndex + 1 < right.length
      && left[leftIndex] === right[rightIndex + 1]
      && left[leftIndex + 1] === right[rightIndex]) {
      leftIndex += 2;
      rightIndex += 2;
    } else if (left.length >= right.length) leftIndex++;
    else rightIndex++;
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

const MATCH_RANK: Record<SearchMatchKind, number> = {
  exact: 0,
  prefix: 1,
  substring: 2,
  alias: 3,
  fuzzy: 4,
};

interface SearchableField {
  readonly field: SearchMatchField;
  readonly value: string;
}

interface ScoredMatch {
  readonly reason: SearchMatchReason;
  readonly worstRank: number;
  readonly rankSum: number;
}

function directMatch(value: string, term: string): SearchMatchKind | undefined {
  if (value === term || value.split(/[^\p{L}\p{N}]+/u).includes(term)) return 'exact';
  if (value.startsWith(term) || value.split(/[^\p{L}\p{N}]+/u).some(word => word.startsWith(term))) return 'prefix';
  if (value.includes(term)) return 'substring';
  return undefined;
}

function termMatch(fields: readonly SearchableField[], term: string): SearchMatchReason | undefined {
  const normalized = fields.map(field => ({ ...field, value: normalizeSearchText(field.value) }));
  for (const kind of ['exact', 'prefix', 'substring'] as const) {
    const match = normalized.find(field => directMatch(field.value, term) === kind);
    if (match) return { kind, field: match.field };
  }

  const aliases = aliasTerms(term);
  if (aliases.length) {
    const aliasMatch = normalized.find(field => aliases.some(alias => directMatch(field.value, alias) !== undefined));
    if (aliasMatch) return { kind: 'alias', field: aliasMatch.field };
  }

  // Only allow a bounded one-edit/transposition typo for sufficiently long tokens.
  if (term.length >= 4) {
    for (const field of normalized) {
      const words = field.value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      if (words.some(word => Math.abs(word.length - term.length) <= 1 && boundedEditDistanceAtMostOne(word, term))) {
        return { kind: 'fuzzy', field: field.field };
      }
    }
  }
  return undefined;
}

function scoreFields(fields: readonly SearchableField[], terms: readonly string[]): ScoredMatch | undefined {
  if (!terms.length) return undefined;
  const reasons = terms.map(term => termMatch(fields, term));
  if (reasons.some(reason => !reason)) return undefined;
  const matches = reasons as SearchMatchReason[];
  const bestReason = matches.reduce((best, current) =>
    MATCH_RANK[current.kind] < MATCH_RANK[best.kind] ? current : best,
  );
  const ranks = matches.map(match => MATCH_RANK[match.kind]);
  return {
    reason: bestReason,
    worstRank: Math.max(...ranks),
    rankSum: ranks.reduce((sum, rank) => sum + rank, 0),
  };
}

function areaFields(areaId: string): string[] {
  const area = getAreaById(areaId);
  return area
    ? [area.id, area.en, area.ar, area.governorateEn, area.governorateAr]
    : [areaId];
}

function rankedUnique<T>(
  values: readonly T[],
  id: (value: T) => string,
  fields: (value: T) => readonly SearchableField[],
  terms: readonly string[],
): { readonly values: T[]; readonly why: ReadonlyMap<string, SearchMatchReason> } {
  const byId = new Map<string, { value: T; score: ScoredMatch; index: number }>();
  values.forEach((value, index) => {
    const score = scoreFields(fields(value), terms);
    if (!score) return;
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
  const terms = searchTerms(query);
  if (!terms.length) return {
    people: [], properties: [], requirements: [],
    why: { people: new Map(), properties: new Map(), requirements: new Map() },
  };

  const people = rankedUnique(data.people, person => person.id, person => [
    { field: 'name', value: person.name },
    { field: 'phone', value: person.displayPhone },
    { field: 'phone', value: person.normalizedPhone },
    ...person.classifications.flatMap(value =>
      classificationLabels[value].map(label => ({ field: 'classification' as const, value: label }))),
  ], terms);

  const properties = rankedUnique(data.properties, property => property.core.id, property => [
    { field: 'identifier', value: property.core.id },
    { field: 'type', value: property.core.propertyType },
    ...propertyTypeLabels[property.core.propertyType].map(value => ({ field: 'type' as const, value })),
    ...(isOfferedStudio(property) ? [{ field: 'type' as const, value: 'studio' }] : []),
    ...areaFields(property.core.locationArea.id).map(value => ({ field: 'area' as const, value })),
    { field: 'description', value: property.core.description?.value ?? '' },
  ], terms);

  const peopleById = new Map(data.people.map(person => [person.id, person]));
  const requirements = rankedUnique(data.requirements, requirement => requirement.id, requirement => {
    const seeker = peopleById.get(requirement.seekerId);
    const studio = isWantedStudio(requirement);
    return [
      { field: 'name', value: seeker?.name ?? '' },
      { field: 'requirement', value: requirement.purpose },
      ...purposeLabels[requirement.purpose].map(value => ({ field: 'requirement' as const, value })),
      { field: 'type', value: requirement.propertyType },
      ...propertyTypeLabels[requirement.propertyType].map(value => ({ field: 'type' as const, value })),
      ...(studio ? [{ field: 'type' as const, value: 'studio' }] : []),
      ...requirement.preferredAreaIds.flatMap(areaFields).map(value => ({ field: 'area' as const, value })),
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