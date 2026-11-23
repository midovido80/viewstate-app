import {
  RECORD_INTENT_LABELS,
  type PresentedIntentId,
} from '@/services/recordIntentPresentation';

export type FlexibleSearchMatchKind = 'exact' | 'prefix' | 'substring' | 'alias';

export interface FlexibleSearchField {
  readonly field: string;
  readonly value: string;
}

export interface FlexibleSearchMatch {
  readonly field: string;
  readonly kind: FlexibleSearchMatchKind;
}

export interface FlexibleSearchScore extends FlexibleSearchMatch {
  readonly worstRank: number;
  readonly rankSum: number;
}

/** Approved spelling and domain-synonym groups shared by every local search surface. */
export const FLEXIBLE_SEARCH_ALIASES: readonly (readonly string[])[] = [
  ['studio', 'studios', 'استوديو', 'ستوديو', 'استديو', 'ستديو', 'ستيديو', 'استوديوهات', 'ستوديوهات'],
  ['shop', 'shops', 'store', 'stores', 'محل', 'محلات', 'متجر', 'متاجر', 'دكان', 'دكاكين'],
];

const CLASSIFICATION_TERMS: Readonly<Record<string, readonly string[]>> = {
  seeker: ['seeker', 'باحث'],
  owner: ['owner', 'مالك'],
  broker: ['broker', 'دلال'],
  real_estate_company: ['real estate company', 'شركة عقارية'],
  building_guard: ['building guard', 'حارس'],
};

const INTENT_TERMS: Readonly<Record<PresentedIntentId, readonly string[]>> = {
  offered_sale: ['sale', 'sell', 'for sale', 'بيع'],
  offered_rent: ['rent', 'rental', 'for rent', 'إيجار'],
  wanted_buy: ['buy', 'purchase', 'buying', 'شراء'],
  wanted_rent: ['rent', 'rental', 'for rent', 'إيجار', 'استئجار'],
  conflict: [],
};

const MATCH_RANK: Record<FlexibleSearchMatchKind, number> = {
  exact: 0,
  prefix: 1,
  substring: 2,
  alias: 3,
};

/**
 * Canonical comparison form only. Never use this to rewrite displayed or saved text.
 */
export function normalizeFlexibleSearchText(value: string): string {
  return Array.from(value.normalize('NFKC').toLowerCase())
    .map(character => {
      const code = character.charCodeAt(0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
      if (character === '\u0640' || /\p{M}/u.test(character)) return '';
      if (/[أإآٱ]/u.test(character)) return 'ا';
      if (character === 'ى' || character === 'ی') return 'ي';
      if (character === 'ة') return 'ه';
      if (character === 'ک') return 'ك';
      return /[\p{L}\p{N}]/u.test(character) ? character : ' ';
    })
    .join('')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function flexibleSearchTerms(query: string): string[] {
  return normalizeFlexibleSearchText(query).split(' ').filter(Boolean);
}

/** Retained short export for the global-search service and its existing callers. */
export const searchTerms = flexibleSearchTerms;

export function personClassificationSearchValues(classifications: readonly string[]): string[] {
  return classifications.flatMap(classification => [
    classification,
    ...(CLASSIFICATION_TERMS[classification] ?? []),
  ]);
}

export function recordIntentSearchValues(id: PresentedIntentId): string[] {
  return [
    RECORD_INTENT_LABELS[id].en,
    RECORD_INTENT_LABELS[id].ar,
    ...INTENT_TERMS[id],
  ];
}

function directMatch(value: string, term: string): FlexibleSearchMatchKind | undefined {
  if (!term) return undefined;
  const tokens = value.split(' ').filter(Boolean);
  if (value === term || tokens.includes(term)) return 'exact';
  if (tokens.some(token => token.startsWith(term)) || value.startsWith(term)) return 'prefix';
  if (value.includes(term)) return 'substring';
  return undefined;
}

function aliasesForTerm(term: string): string[] {
  return FLEXIBLE_SEARCH_ALIASES.flatMap(group => {
    const normalized = group.map(normalizeFlexibleSearchText);
    return normalized.some(alias => alias === term || alias.includes(term))
      ? normalized.filter(alias => alias !== term)
      : [];
  });
}

function bestTermMatch(fields: readonly FlexibleSearchField[], term: string): FlexibleSearchMatch | undefined {
  const normalizedFields = fields.map(field => ({
    field: field.field,
    value: normalizeFlexibleSearchText(field.value),
  }));
  for (const kind of ['exact', 'prefix', 'substring'] as const) {
    const match = normalizedFields.find(field => directMatch(field.value, term) === kind);
    if (match) return { field: match.field, kind };
  }

  const aliases = aliasesForTerm(term);
  if (aliases.length) {
    const match = normalizedFields.find(field =>
      aliases.some(alias => directMatch(field.value, alias) !== undefined),
    );
    if (match) return { field: match.field, kind: 'alias' };
  }
  return undefined;
}

/**
 * Every query token must match some safe field on the same record. Field order and
 * record order are preserved; no fuzzy or reordered-letter matching is attempted.
 */
export function scoreFlexibleSearchFields(
  fields: readonly FlexibleSearchField[],
  terms: readonly string[],
): FlexibleSearchScore | undefined {
  if (!terms.length) return undefined;
  const matches = terms.map(term => bestTermMatch(fields, term));
  if (matches.some(match => !match)) return undefined;
  const resolved = matches as FlexibleSearchMatch[];
  const best = resolved.reduce((current, next) =>
    MATCH_RANK[next.kind] < MATCH_RANK[current.kind] ? next : current,
  );
  const ranks = resolved.map(match => MATCH_RANK[match.kind]);
  return {
    ...best,
    worstRank: Math.max(...ranks),
    rankSum: ranks.reduce((sum, rank) => sum + rank, 0),
  };
}

export function matchesFlexibleSearch(
  fields: readonly FlexibleSearchField[],
  query: string,
): boolean {
  const terms = flexibleSearchTerms(query);
  return terms.length > 0 && scoreFlexibleSearchFields(fields, terms) !== undefined;
}