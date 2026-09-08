import { generateDomainId } from '@/services/identity';
import {
  createPerson,
  PERSON_CLASSIFICATIONS,
  type Person,
  type PersonClassification,
  type PersonStore,
} from '@/services/people';
import {
  inferPhoneCountry,
  normalizePhoneForCountry,
  type ContactPhoneChoice,
  type PhoneCountryCode,
} from '@/services/phoneEntry';

export interface ContactBatchImportInput {
  contacts: readonly ContactPhoneChoice[];
  classifications: readonly PersonClassification[];
  defaultCountry: PhoneCountryCode;
  store: Pick<PersonStore, 'savePerson'>;
}

export interface ContactBatchImportResult {
  importedCount: number;
  skippedDuplicateCount: number;
  people: Person[];
}

function assertValidClassifications(
  classifications: readonly PersonClassification[],
): void {
  const allowed = new Set<string>(PERSON_CLASSIFICATIONS);
  if (classifications.length === 0) {
    throw new Error('PERSON_CLASSIFICATION_REQUIRED');
  }
  if (
    new Set(classifications).size !== classifications.length
    || classifications.some(value => !allowed.has(value))
  ) {
    throw new Error('INVALID_PERSON_CLASSIFICATION');
  }
}

export async function importContactBatch({
  contacts,
  classifications,
  defaultCountry,
  store,
}: ContactBatchImportInput): Promise<ContactBatchImportResult> {
  assertValidClassifications(classifications);

  const seenNormalizedPhones = new Set<string>();
  const prepared: Person[] = [];
  let skippedDuplicateCount = 0;

  for (const contact of contacts) {
    const country = inferPhoneCountry(contact.phone) ?? defaultCountry;
    const normalizedPhone = normalizePhoneForCountry(contact.phone, country);
    if (seenNormalizedPhones.has(normalizedPhone)) {
      skippedDuplicateCount += 1;
      continue;
    }
    seenNormalizedPhones.add(normalizedPhone);
    prepared.push(createPerson({
      id: generateDomainId(),
      name: contact.name,
      displayPhone: contact.phone,
      normalizedPhone,
      notes: '',
      classifications: [...classifications],
    }));
  }

  const people: Person[] = [];
  for (const person of prepared) {
    people.push(await store.savePerson(person));
  }

  return {
    importedCount: people.length,
    skippedDuplicateCount,
    people,
  };
}