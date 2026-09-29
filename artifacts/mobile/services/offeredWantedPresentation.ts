import type { Property, SeekerRequirement } from '@workspace/property-domain';
import type { Person, PersonPropertyLink, PropertySource } from '@/services/people';
import { getAreaById } from '@/constants/kuwait-areas';
import {
  flexibleSearchTerms,
  matchesFlexibleSearch,
  personClassificationSearchValues,
  recordIntentSearchValues,
  type FlexibleSearchField,
} from '@/services/flexibleSearch';
import { projectPropertyIntent, projectRequirementIntent } from '@/services/recordIntentPresentation';
import {
  EMPTY_COMPOSABLE_RECORD_FILTER,
  recordIntentMatchesComposableFilter,
  type ComposableRecordFilter,
} from '@/services/composableRecordFilters';

export type OfferedWantedFilter = 'all' | 'offered' | 'wanted' | 'sale' | 'rent';

interface PresentationBase {
  readonly key: string;
  readonly transaction: 'sale' | 'rent' | 'buy';
  readonly person?: Person;
  readonly personTargets?: readonly Person[];
}

const PROPERTY_TYPE_SEARCH_VALUES: Readonly<Record<Property['core']['propertyType'], readonly string[]>> = {
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
  other_built_property: ['other built property', 'other', 'أخرى'],
};

export interface OfferedPropertyRow extends PresentationBase {
  readonly kind: 'offered';
  readonly id: string;
  readonly property: Property;
  readonly href: string;
}

export interface WantedRequirementRow extends PresentationBase {
  readonly kind: 'wanted';
  readonly id: string;
  readonly requirement: SeekerRequirement;
  readonly href: string;
}

export type OfferedWantedRow = OfferedPropertyRow | WantedRequirementRow;

export interface OfferedWantedAssociations {
  readonly propertySources?: readonly PropertySource[];
  readonly propertyLinks?: readonly PersonPropertyLink[];
  readonly people?: readonly Person[];
}

export interface OfferedWantedStoreReader {
  getProperties(): Promise<Property[]>;
  getRequirements(): Promise<SeekerRequirement[]>;
  getPeople(): Promise<Person[]>;
  getPropertySource(propertyCoreId: string): Promise<PropertySource | null>;
  getPersonPropertyLinks?(): Promise<PersonPropertyLink[]>;
}

export interface OfferedWantedLoadErrors {
  readonly properties: boolean;
  readonly requirements: boolean;
  readonly people: boolean;
  readonly sources: boolean;
  readonly links: boolean;
}

export interface OfferedWantedLoadResult {
  readonly rows: OfferedWantedRow[];
  readonly errors: OfferedWantedLoadErrors;
}

/** Prevents slower loads from an earlier focus/search state replacing a newer inventory snapshot. */
export function createOfferedWantedLoadCoordinator() {
  let currentSequence = 0;
  return {
    begin(): number {
      currentSequence += 1;
      return currentSequence;
    },
    isCurrent(sequence: number): boolean {
      return sequence === currentSequence;
    },
    invalidate(sequence: number): void {
      if (sequence === currentSequence) currentSequence += 1;
    },
  };
}

interface ReadOutcome<T> {
  readonly value: T;
  readonly failed: boolean;
}

async function safelyRead<T>(
  read: () => Promise<T>,
  fallback: T,
): Promise<ReadOutcome<T>> {
  try {
    return { value: await read(), failed: false };
  } catch {
    return { value: fallback, failed: true };
  }
}

/** Reads independent stores independently so optional failures never discard inventory. */
export async function loadOfferedWantedPresentation(
  reader: OfferedWantedStoreReader,
): Promise<OfferedWantedLoadResult> {
  const [propertyRead, requirementRead, peopleRead, linkRead] = await Promise.all([
    safelyRead(() => reader.getProperties(), []),
    safelyRead(() => reader.getRequirements(), []),
    safelyRead(() => reader.getPeople(), []),
    reader.getPersonPropertyLinks
      ? safelyRead(() => reader.getPersonPropertyLinks!(), [])
      : Promise.resolve({ value: [] as const, failed: true }),
  ]);

  const sourceReads = await Promise.all(propertyRead.value.map(property =>
    safelyRead(() => reader.getPropertySource(property.core.id), null),
  ));
  const propertySources = sourceReads.flatMap(read => read.value ? [read.value] : []);
  const personIds = new Set(peopleRead.value.map(person => person.id));
  const unavailableLinkTargets = !peopleRead.failed
    && linkRead.value.some(link => !personIds.has(link.personId));
  const unavailableSourceTargets = !peopleRead.failed
    && propertySources.some(source => !personIds.has(source.personId));
  const rows = deriveOfferedWantedRows(propertyRead.value, requirementRead.value, {
    propertySources,
    propertyLinks: linkRead.value,
    people: peopleRead.value,
  });

  return {
    rows,
    errors: {
      properties: propertyRead.failed,
      requirements: requirementRead.failed,
      people: peopleRead.failed,
      sources: sourceReads.some(read => read.failed) || unavailableSourceTargets,
      links: linkRead.failed || unavailableLinkTargets,
    },
  };
}

export function getOfferedWantedTransactionLabelKey(
  row: OfferedWantedRow,
): 'transaction.sale' | 'transaction.rent' {
  return row.kind === 'wanted' && row.requirement.purpose === 'buy'
    ? 'transaction.sale'
    : row.transaction === 'rent' ? 'transaction.rent' : 'transaction.sale';
}

export function getWantedAreaDisplayValues(
  requirement: SeekerRequirement,
  language: 'en' | 'ar',
  allKuwaitLabel: string,
): string[] {
  if (requirement.preferredAreaMode === 'all_kuwait') return [allKuwaitLabel];
  return requirement.preferredAreaIds.map(areaId => {
    const area = getAreaById(areaId);
    return area ? (language === 'ar' ? area.ar : area.en) : areaId;
  });
}

export function formatWantedBudget(
  budget: Readonly<{ minimum?: number | null; maximum?: number | null }>,
  formatAmount: (amount: number) => string,
): string | null {
  const minimum = typeof budget.minimum === 'number' && Number.isFinite(budget.minimum)
    ? formatAmount(budget.minimum)
    : null;
  const maximum = typeof budget.maximum === 'number' && Number.isFinite(budget.maximum)
    ? formatAmount(budget.maximum)
    : null;
  if (minimum && maximum) return `${minimum} – ${maximum}`;
  return minimum ?? maximum;
}

export function getOfferedWantedHref(
  kind: OfferedWantedRow['kind'],
  id: string,
): string {
  const encodedId = encodeURIComponent(id);
  return kind === 'offered' ? `/property/${encodedId}` : `/requirement/view/${encodedId}`;
}

export function deriveOfferedWantedRows(
  properties: readonly Property[],
  requirements: readonly SeekerRequirement[],
  associations: OfferedWantedAssociations = {},
): OfferedWantedRow[] {
  const uniqueProperties = uniqueByExactId(properties, property => property.core.id);
  const uniqueRequirements = uniqueByExactId(requirements, requirement => requirement.id);
  const peopleById = new Map((associations.people ?? []).map(person => [person.id, person]));
  const sourceByPropertyId = new Map(
    (associations.propertySources ?? []).map(source => [source.propertyCoreId, source.personId]),
  );
  const personByLinkedPropertyId = new Map<string, string[]>();
  for (const link of associations.propertyLinks ?? []) {
    const ids = personByLinkedPropertyId.get(link.propertyCoreId) ?? [];
    if (!ids.includes(link.personId)) ids.push(link.personId);
    personByLinkedPropertyId.set(link.propertyCoreId, ids);
  }
  const offered: OfferedPropertyRow[] = uniqueProperties.map(property => {
    const id = property.core.id;
    const sourcePersonId = sourceByPropertyId.get(id);
    const targets = [
      sourcePersonId ? peopleById.get(sourcePersonId) : undefined,
      ...(personByLinkedPropertyId.get(id) ?? []).map(personId => peopleById.get(personId)),
    ].filter((candidate, index, all): candidate is Person =>
      candidate !== undefined && all.findIndex(person => person?.id === candidate.id) === index);
    const person = targets[0];
    return {
      kind: 'offered',
      id,
      key: `offered:${id}`,
      transaction: property.activeOffer.transaction,
      property,
      href: getOfferedWantedHref('offered', id),
      ...(person ? { person } : {}),
      ...(targets.length ? { personTargets: targets } : {}),
    };
  });
  const wanted: WantedRequirementRow[] = uniqueRequirements.map(requirement => {
    const person = peopleById.get(requirement.seekerId);
    return {
      kind: 'wanted',
      id: requirement.id,
      key: `wanted:${requirement.id}`,
      transaction: requirement.purpose,
      requirement,
      href: getOfferedWantedHref('wanted', requirement.id),
      ...(person ? { person } : {}),
    };
  });
  return [...offered, ...wanted];
}

function uniqueByExactId<T>(records: readonly T[], getId: (record: T) => string): T[] {
  const seen = new Set<string>();
  return records.filter(record => {
    const id = getId(record);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function personFields(persons: readonly Person[]): FlexibleSearchField[] {
  return persons.flatMap(person => [
    { field: 'name', value: person.name },
    // People phone search is already an approved local-search contract.
    { field: 'phone', value: person.displayPhone },
    { field: 'phone', value: person.normalizedPhone },
    ...personClassificationSearchValues(person.classifications)
      .map(value => ({ field: 'classification', value })),
  ]);
}

function areaSearchFields(areaId: string): FlexibleSearchField[] {
  const area = getAreaById(areaId);
  return (area
    ? [area.id, area.en, area.ar, area.governorateEn, area.governorateAr]
    : [areaId]).map(value => ({ field: 'area', value }));
}

function propertySearchFields(row: OfferedPropertyRow): FlexibleSearchField[] {
  const property = row.property;
  const values = PROPERTY_TYPE_SEARCH_VALUES[property.core.propertyType] ?? [];
  const details = property.typeDetails as Readonly<Record<string, unknown>> | undefined;
  const wrappedSubtype = details?.apartmentSubtype;
  const subtype = typeof wrappedSubtype === 'object' && wrappedSubtype !== null && 'value' in wrappedSubtype
    ? String((wrappedSubtype as { readonly value: unknown }).value ?? '')
    : String(wrappedSubtype ?? '');
  const description = property.core.description;
  const safeDescription = description
    && description.privacy.classification === 'normal'
    && description.privacy.disclosurePolicy === 'normal'
    ? description.value
    : '';
  const intent = projectPropertyIntent(property, 'en');
  return [
    { field: 'type', value: property.core.propertyType },
    ...values.map(value => ({ field: 'type', value })),
    ...(subtype ? [{ field: 'subtype', value: subtype }] : []),
    ...(subtype === 'standard_apartment' ? [{ field: 'subtype', value: 'standard apartment' }] : []),
    ...(subtype === 'studio' ? [{ field: 'subtype', value: 'studio apartment' }] : []),
    ...recordIntentSearchValues(intent.id).map(value => ({ field: 'intent', value })),
    ...areaSearchFields(property.core.locationArea.id),
    { field: 'description', value: safeDescription },
    ...personFields(row.personTargets ?? (row.person ? [row.person] : [])),
  ];
}

function requirementSearchFields(row: WantedRequirementRow): FlexibleSearchField[] {
  const requirement = row.requirement;
  const areaFields = requirement.preferredAreaIds.flatMap(areaId => areaSearchFields(areaId));
  const scopeFields = requirement.preferredAreaMode === 'all_kuwait'
    ? ['all kuwait', 'all_kuwait', 'كل مناطق الكويت'].map(value => ({ field: 'area', value }))
    : [];
  const subtype = requirement.catalogPreferences?.find(preference => preference.field === 'apartmentSubtype');
  const intent = projectRequirementIntent(requirement, 'en');
  const seeker = row.person ? [row.person] : [];
  return [
    { field: 'type', value: requirement.propertyType },
    ...(PROPERTY_TYPE_SEARCH_VALUES[requirement.propertyType] ?? [])
      .map(value => ({ field: 'type', value })),
    ...(subtype?.kind === 'choice' ? [{ field: 'subtype', value: subtype.value }] : []),
    ...(subtype?.kind === 'choice' && subtype.value === 'standard_apartment'
      ? [{ field: 'subtype', value: 'standard apartment' }] : []),
    ...recordIntentSearchValues(intent.id).map(value => ({ field: 'intent', value })),
    ...areaFields,
    ...scopeFields,
    // Requirement notes were already an approved search field in these local lists.
    { field: 'notes', value: requirement.notes },
    { field: 'budget', value: requirement.budget.minimum?.toString() ?? '' },
    { field: 'budget', value: requirement.budget.maximum?.toString() ?? '' },
    ...personFields(seeker),
  ];
}

function legacyFilterSelection(filter: OfferedWantedFilter): ComposableRecordFilter {
  switch (filter) {
    case 'offered': return { directions: ['offered'], transactions: [] };
    case 'wanted': return { directions: ['wanted'], transactions: [] };
    case 'sale': return { directions: [], transactions: ['sale'] };
    case 'rent': return { directions: [], transactions: ['rent'] };
    default: return EMPTY_COMPOSABLE_RECORD_FILTER;
  }
}

export function filterOfferedWantedRows(
  rows: readonly OfferedWantedRow[],
  filter: OfferedWantedFilter | ComposableRecordFilter = EMPTY_COMPOSABLE_RECORD_FILTER,
  query = '',
): OfferedWantedRow[] {
  const selection = typeof filter === 'string' ? legacyFilterSelection(filter) : filter;
  const meaningfulQuery = flexibleSearchTerms(query).length > 0;
  return rows.filter(row => {
    const intent = row.kind === 'offered'
      ? projectPropertyIntent(row.property, 'en')
      : projectRequirementIntent(row.requirement, 'en');
    if (!recordIntentMatchesComposableFilter(intent.id, selection)) return false;
    if (!meaningfulQuery) return true;
    return matchesFlexibleSearch(
      row.kind === 'offered' ? propertySearchFields(row) : requirementSearchFields(row),
      query,
    );
  });
}