import type { PresentedIntentId } from '@/services/recordIntentPresentation';

export type RecordDirectionFilter = 'offered' | 'wanted';
export type RecordTransactionFilter = 'sale' | 'rent';

export interface ComposableRecordFilter {
  readonly directions: readonly RecordDirectionFilter[];
  readonly transactions: readonly RecordTransactionFilter[];
}

export type ComposableRecordFilterDimension = keyof ComposableRecordFilter;

export const EMPTY_COMPOSABLE_RECORD_FILTER: ComposableRecordFilter = Object.freeze({
  directions: Object.freeze([]) as readonly RecordDirectionFilter[],
  transactions: Object.freeze([]) as readonly RecordTransactionFilter[],
});

const INTENT_FACETS: Readonly<Partial<Record<
  PresentedIntentId,
  Readonly<{ direction: RecordDirectionFilter; transaction: RecordTransactionFilter }>
>>> = {
  offered_sale: { direction: 'offered', transaction: 'sale' },
  offered_rent: { direction: 'offered', transaction: 'rent' },
  wanted_buy: { direction: 'wanted', transaction: 'sale' },
  wanted_rent: { direction: 'wanted', transaction: 'rent' },
};

export function hasActiveRecordFilters(filter: ComposableRecordFilter): boolean {
  return filter.directions.length > 0 || filter.transactions.length > 0;
}

export function toggleRecordFilter(
  filter: ComposableRecordFilter,
  dimension: ComposableRecordFilterDimension,
  value: RecordDirectionFilter | RecordTransactionFilter,
): ComposableRecordFilter {
  if (dimension === 'directions') {
    const directions = filter.directions.includes(value as RecordDirectionFilter)
      ? filter.directions.filter(candidate => candidate !== value)
      : [...filter.directions, value as RecordDirectionFilter];
    return { directions, transactions: filter.transactions };
  }
  const transactions = filter.transactions.includes(value as RecordTransactionFilter)
    ? filter.transactions.filter(candidate => candidate !== value)
    : [...filter.transactions, value as RecordTransactionFilter];
  return { directions: filter.directions, transactions };
}

/**
 * Within a facet selections are OR; across facets they are AND.
 * Example: Wanted + Rent means a Rental Request, while Offered + Wanted + Rent
 * includes both Offered for Rent and Rental Request records.
 */
export function recordIntentMatchesComposableFilter(
  intentId: PresentedIntentId,
  filter: ComposableRecordFilter,
): boolean {
  if (!hasActiveRecordFilters(filter)) return true;
  const facets = INTENT_FACETS[intentId];
  if (!facets) return false;
  const directionMatches = filter.directions.length === 0
    || filter.directions.includes(facets.direction);
  const transactionMatches = filter.transactions.length === 0
    || filter.transactions.includes(facets.transaction);
  return directionMatches && transactionMatches;
}

export function anyRecordIntentMatchesComposableFilter(
  intentIds: readonly PresentedIntentId[],
  filter: ComposableRecordFilter,
): boolean {
  if (!hasActiveRecordFilters(filter)) return true;
  return intentIds.some(intentId => recordIntentMatchesComposableFilter(intentId, filter));
}
