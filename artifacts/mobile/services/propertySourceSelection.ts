import type { Person, PropertySourceRole } from '@/services/people';
import { matchesFlexibleSearch } from '@/services/flexibleSearch';

export type PropertySourceClassificationFilter = 'all' | PropertySourceRole;

/** Classification narrows discovery only; the saved source role remains a relationship. */
export function filterPropertySourcePeople(
  people: readonly Person[],
  classification: PropertySourceClassificationFilter,
  query: string,
): Person[] {
  return people.filter(person =>
    (classification === 'all' || person.classifications.includes(classification))
    && (!query.trim() || matchesFlexibleSearch([
      { field: 'name', value: person.name },
      { field: 'phone', value: person.displayPhone },
      { field: 'phone', value: person.normalizedPhone },
    ], query)),
  );
}

export function suggestPropertySourceRole(
  person: Person,
  classification: PropertySourceClassificationFilter,
  previous: PropertySourceRole,
): PropertySourceRole {
  if (classification !== 'all') return classification;
  if (person.classifications.includes(previous)) return previous;
  return person.classifications.find((value): value is PropertySourceRole => value !== 'seeker') ?? previous;
}

export function retainVisibleSourceSelection(people: readonly Person[], selectedId: string): string {
  return people.some(person => person.id === selectedId) ? selectedId : '';
}
