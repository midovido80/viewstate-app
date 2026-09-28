import type { Property, SeekerRequirement } from '@workspace/property-domain';
import type { Person, PersonPropertyLink, PropertySource } from '@/services/people';
import { getAreaById, normalizeAreaSearchText } from '@/constants/kuwait-areas';

export type OfferedWantedFilter = 'all' | 'offered' | 'wanted' | 'sale' | 'rent';

interface PresentationBase {
  readonly key: string;
  readonly transaction: 'sale' | 'rent' | 'buy';
  readonly person?: Person;
  readonly personTargets?: readonly Person[];
}

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

export interface OfferedWantedFilterOptions {
  /** Supplied when offered rows must follow the persistence search index. */
  readonly offeredPropertySearchIds?: ReadonlySet<string>;
}

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
  searchProperties(query: string): Promise<Property[]>;
}

export interface OfferedWantedLoadErrors {
  readonly properties: boolean;
  readonly requirements: boolean;
  readonly people: boolean;
  readonly sources: boolean;
  readonly links: boolean;
  readonly search: boolean;
}

export interface OfferedWantedLoadResult {
  readonly rows: OfferedWantedRow[];
  /** null means no property search was requested; [] is a completed empty/failed search. */
  readonly matchingPropertyIds: readonly string[] | null;
  readonly errors: OfferedWantedLoadErrors;
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
  query = '',
): Promise<OfferedWantedLoadResult> {
  const [propertyRead, requirementRead, peopleRead, linkRead, searchRead] = await Promise.all([
    safelyRead(() => reader.getProperties(), []),
    safelyRead(() => reader.getRequirements(), []),
    safelyRead(() => reader.getPeople(), []),
    reader.getPersonPropertyLinks
      ? safelyRead(() => reader.getPersonPropertyLinks!(), [])
      : Promise.resolve({ value: [] as const, failed: false }),
    query.trim()
      ? safelyRead(() => reader.searchProperties(query), [])
      : Promise.resolve({ value: null, failed: false } as const),
  ]);

  const sourceReads = await Promise.all(propertyRead.value.map(property =>
    safelyRead(() => reader.getPropertySource(property.core.id), null),
  ));
  const propertySources = sourceReads.flatMap(read => read.value ? [read.value] : []);
  const rows = deriveOfferedWantedRows(propertyRead.value, requirementRead.value, {
    propertySources,
    propertyLinks: linkRead.value,
    people: peopleRead.value,
  });

  return {
    rows,
    matchingPropertyIds: searchRead.value
      ? searchRead.value.map(property => property.core.id)
      : searchRead.value === null ? null : [],
    errors: {
      properties: propertyRead.failed,
      requirements: requirementRead.failed,
      people: peopleRead.failed,
      sources: sourceReads.some(read => read.failed),
      links: linkRead.failed,
      search: searchRead.failed,
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
  const offered: OfferedPropertyRow[] = properties.map(property => {
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
  const wanted: WantedRequirementRow[] = requirements.map(requirement => {
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

function searchableText(row: OfferedWantedRow): string {
  const personText = row.person
    ? `${row.person.name} ${row.person.displayPhone} ${row.person.normalizedPhone}`
    : '';
  if (row.kind === 'offered') {
    return [
      row.property.core.propertyType,
      row.property.core.locationArea.id,
      row.property.core.description?.value ?? '',
      personText,
    ].join(' ').toLocaleLowerCase();
  }
  const preferredAreaText = row.requirement.preferredAreaIds.flatMap(areaId => {
    const area = getAreaById(areaId);
    return area
      ? [areaId, area.en, area.ar, area.governorateEn, area.governorateAr]
      : [areaId];
  });
  const areaScopeText = row.requirement.preferredAreaMode === 'all_kuwait'
    ? 'all kuwait all_kuwait كل مناطق الكويت'
    : '';
  return [
    row.requirement.propertyType,
    preferredAreaText.join(' '),
    areaScopeText,
    row.requirement.notes,
    row.requirement.purpose,
    row.requirement.budget.minimum,
    row.requirement.budget.maximum,
    personText,
  ].join(' ').toLocaleLowerCase();
}

export function filterOfferedWantedRows(
  rows: readonly OfferedWantedRow[],
  filter: OfferedWantedFilter = 'all',
  query = '',
  options: OfferedWantedFilterOptions = {},
): OfferedWantedRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return rows.filter(row => {
    if (filter === 'offered' && row.kind !== 'offered') return false;
    if (filter === 'wanted' && row.kind !== 'wanted') return false;
    if (filter === 'rent' && row.transaction !== 'rent') return false;
    if (filter === 'sale' && row.transaction !== 'sale' && row.transaction !== 'buy') return false;
    if (!normalizedQuery) return true;
    if (row.kind === 'offered' && options.offeredPropertySearchIds) {
      const associatedPersonText = row.person
        ? `${row.person.name} ${row.person.displayPhone} ${row.person.normalizedPhone}`.toLocaleLowerCase()
        : '';
      return options.offeredPropertySearchIds.has(row.id)
        || normalizeAreaSearchText(associatedPersonText).includes(normalizeAreaSearchText(query));
    }
    return normalizeAreaSearchText(searchableText(row)).includes(normalizeAreaSearchText(query));
  });
}