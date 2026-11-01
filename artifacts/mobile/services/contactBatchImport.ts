import { createPerson, type Person, type PersonClassification, type PersonStore } from './people';

export interface ReviewedContactImportEntry {
  readonly key: string;
  readonly name: string;
  readonly displayPhone: string;
  readonly normalizedPhone: string;
}

export type ContactImportDisposition = 'imported' | 'duplicate' | 'invalid' | 'failed';

export interface ContactImportResult {
  readonly entry: ReviewedContactImportEntry;
  readonly disposition: ContactImportDisposition;
  readonly message?: string;
}

export interface ContactBatchImportSummary {
  readonly results: readonly ContactImportResult[];
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
}

export function summarizeContactImportResults(
  results: readonly ContactImportResult[],
): ContactBatchImportSummary {
  return {
    results,
    imported: results.filter(result => result.disposition === 'imported').length,
    skipped: results.filter(result => result.disposition === 'duplicate' || result.disposition === 'invalid').length,
    failed: results.filter(result => result.disposition === 'failed').length,
  };
}

export async function importReviewedContactBatch(input: {
  readonly classification: PersonClassification;
  readonly entries: readonly ReviewedContactImportEntry[];
  readonly store: Pick<PersonStore, 'getPeople' | 'savePerson'>;
  readonly generateId: () => string;
}): Promise<ContactBatchImportSummary> {
  const existing = await input.store.getPeople();
  const knownPhones = new Set(existing.map(person => person.normalizedPhone));
  const seenBatchPhones = new Set<string>();
  const results: ContactImportResult[] = [];

  for (const entry of input.entries) {
    let candidate: Person;
    try {
      candidate = createPerson({
        id: input.generateId(),
        name: entry.name,
        displayPhone: entry.displayPhone,
        normalizedPhone: entry.normalizedPhone,
        classifications: [input.classification],
      });
    } catch (cause) {
      results.push({
        entry,
        disposition: 'invalid',
        message: cause instanceof Error ? cause.message : 'PERSON_INVALID',
      });
      continue;
    }
    if (knownPhones.has(candidate.normalizedPhone) || seenBatchPhones.has(candidate.normalizedPhone)) {
      results.push({ entry, disposition: 'duplicate' });
      continue;
    }
    seenBatchPhones.add(candidate.normalizedPhone);
    try {
      const saved = await input.store.savePerson(candidate);
      if (saved.id !== candidate.id) {
        results.push({ entry, disposition: 'duplicate' });
        knownPhones.add(saved.normalizedPhone);
      } else {
        results.push({ entry, disposition: 'imported' });
        knownPhones.add(candidate.normalizedPhone);
      }
    } catch (cause) {
      seenBatchPhones.delete(candidate.normalizedPhone);
      results.push({
        entry,
        disposition: 'failed',
        message: cause instanceof Error ? cause.message : 'PERSON_SAVE_FAILED',
      });
    }
  }

  return summarizeContactImportResults(results);
}