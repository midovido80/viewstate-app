import type { Property, PropertyType, RequirementPurpose, SeekerRequirement } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import type { Person, PersonClassification } from '@/services/people';

const classificationLabels: Record<PersonClassification, readonly string[]> = {
  seeker: ['seeker', 'باحث'],
  owner: ['owner', 'مالك'],
  broker: ['broker', 'دلال'],
  real_estate_company: ['real estate company', 'شركة عقارية'],
  building_guard: ['building guard', 'حارس'],
  investor: ['investor', 'مستثمر'],
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
  commercial_plot: ['commercial plot', 'أرض تجارية'],
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

function normalizeSearchText(value: string): string {
  return Array.from(value.trim().toLocaleLowerCase())
    .map(character => {
      const code = character.charCodeAt(0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
      return character;
    })
    .join('');
}

export function searchTerms(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

function fieldsMatch(fields: readonly string[], terms: readonly string[]): boolean {
  const normalizedFields = fields.map(normalizeSearchText);
  return terms.every(term => normalizedFields.some(field => field.includes(term)));
}

function areaFields(areaId: string): string[] {
  const area = getAreaById(areaId);
  return area
    ? [area.id, area.en, area.ar, area.governorateEn, area.governorateAr]
    : [areaId];
}

function uniqueById<T>(values: readonly T[], id: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const valueId = id(value);
    if (seen.has(valueId)) return false;
    seen.add(valueId);
    return true;
  });
}

export function searchGlobalData(data: GlobalSearchData, query: string): GlobalSearchResults {
  const terms = searchTerms(query);
  if (!terms.length) return { people: [], properties: [], requirements: [] };

  const people = uniqueById(data.people, person => person.id)
    .filter(person => fieldsMatch([
      person.name,
      person.displayPhone,
      person.normalizedPhone,
      ...person.classifications.flatMap(value => classificationLabels[value]),
    ], terms));

  const properties = uniqueById(data.properties, property => property.core.id)
    .filter(property => fieldsMatch([
      property.core.id,
      property.core.propertyType,
      ...propertyTypeLabels[property.core.propertyType],
      ...areaFields(property.core.locationArea.id),
      property.core.description?.value ?? '',
    ], terms));

  const peopleById = new Map(data.people.map(person => [person.id, person]));
  const requirements = uniqueById(data.requirements, requirement => requirement.id)
    .map(requirement => ({ requirement, seeker: peopleById.get(requirement.seekerId) }))
    .filter(({ requirement, seeker }) => fieldsMatch([
      seeker?.name ?? '',
      requirement.purpose,
      ...purposeLabels[requirement.purpose],
      requirement.propertyType,
      ...propertyTypeLabels[requirement.propertyType],
      ...requirement.preferredAreaIds.flatMap(areaFields),
      requirement.notes,
    ], terms));

  return { people, properties, requirements };
}