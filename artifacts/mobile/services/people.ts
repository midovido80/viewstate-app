export const PERSON_CLASSIFICATIONS = [
  'seeker',
  'owner',
  'broker',
  'real_estate_company',
  'building_guard',
] as const;

export type PersonClassification = typeof PERSON_CLASSIFICATIONS[number];

/**
 * User-authored fields are kept exactly as entered. normalizedPhone is the
 * comparison/search representation and must never replace displayPhone.
 */
export interface Person {
  id: string;
  classifications: PersonClassification[];
  name: string;
  displayPhone: string;
  normalizedPhone: string;
  notes: string;
}

export interface PersonPropertyLink {
  personId: string;
  propertyCoreId: string;
}

export interface PersonInput {
  id: string;
  classifications: readonly PersonClassification[];
  name: string;
  displayPhone: string;
  notes?: string;
}

const classificationSet = new Set<string>(PERSON_CLASSIFICATIONS);

function normalizePhoneDigit(character: string): string {
  const code = character.charCodeAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return character;
}

export function normalizePersonPhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = Array.from(trimmed)
    .map(normalizePhoneDigit)
    .filter(character => character >= '0' && character <= '9')
    .join('');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function createPerson(input: PersonInput): Person {
  const person: Person = {
    id: input.id,
    classifications: [...input.classifications],
    name: input.name,
    displayPhone: input.displayPhone,
    normalizedPhone: normalizePersonPhone(input.displayPhone),
    notes: input.notes ?? '',
  };
  assertValidPerson(person);
  return person;
}

export function assertValidPerson(person: Person): void {
  if (!person.id) throw new Error('PERSON_ID_REQUIRED');
  if (!person.name.trim()) throw new Error('PERSON_NAME_REQUIRED');
  if (!person.displayPhone.trim() || !person.normalizedPhone.replace('+', '')) {
    throw new Error('PERSON_PHONE_REQUIRED');
  }
  if (person.normalizedPhone !== normalizePersonPhone(person.displayPhone)) {
    throw new Error('PERSON_PHONE_NORMALIZATION_MISMATCH');
  }
  if (!Array.isArray(person.classifications) || person.classifications.length === 0) {
    throw new Error('PERSON_CLASSIFICATION_REQUIRED');
  }
  if (
    new Set(person.classifications).size !== person.classifications.length
    || person.classifications.some(value => !classificationSet.has(value))
  ) {
    throw new Error('INVALID_PERSON_CLASSIFICATION');
  }
}

export function getPersonSearchText(person: Person): string {
  return [
    person.name.toLocaleLowerCase(),
    person.displayPhone.toLocaleLowerCase(),
    person.normalizedPhone,
  ].join(' ');
}

export function personMatchesSearch(person: Person, query: string): boolean {
  const literalQuery = query.toLocaleLowerCase();
  const normalizedQuery = normalizePersonPhone(query);
  return getPersonSearchText(person).includes(literalQuery)
    || (normalizedQuery.replace('+', '').length > 0
      && person.normalizedPhone.includes(normalizedQuery));
}

export interface PersonStore {
  savePerson(person: Person): Promise<void>;
  updatePerson(expected: Person, replacement: Person): Promise<boolean>;
  getPerson(id: string): Promise<Person | null>;
  getPeople(): Promise<Person[]>;
  searchPeople(query: string): Promise<Person[]>;
  deletePerson(id: string): Promise<boolean>;
  linkPersonToProperty(link: PersonPropertyLink): Promise<void>;
  unlinkPersonFromProperty(link: PersonPropertyLink): Promise<boolean>;
  getPersonPropertyLinks(): Promise<PersonPropertyLink[]>;
  getLinksForPerson(personId: string): Promise<PersonPropertyLink[]>;
  getLinksForProperty(propertyCoreId: string): Promise<PersonPropertyLink[]>;
}