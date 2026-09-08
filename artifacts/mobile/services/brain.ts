import type { Property, SeekerRequirement } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import {
  loadMatchingDataSnapshot,
  runSavedMatchingSnapshot,
  type MatchAllPersonGroup,
  type MatchingDataReader,
  type MatchingDataSnapshot,
} from '@/services/matchingUi';
import type { BrokerMatchingRunResult } from '@/services/brokerInitiatedMatching';
import { getPersonSearchText, type Person } from '@/services/people';

/**
 * The only actions that a server may ask the on-device Brain to perform.
 * IDs are deliberately not part of this protocol: records are selected from
 * the local ViewState snapshot, never constructed from a model response.
 */
export const BRAIN_GOALS = [
  'property_search',
  'people_requirements_search',
  'find_matches',
] as const;

export type BrainGoal = typeof BRAIN_GOALS[number];

export type BrainIntent =
  | { readonly goal: 'property_search'; readonly criteria: string; readonly serverCriteria?: BrainServerCriteria }
  | { readonly goal: 'people_requirements_search'; readonly criteria: string; readonly serverCriteria?: BrainServerCriteria }
  | { readonly goal: 'find_matches'; readonly serverCriteria?: BrainServerCriteria };

/** The data-only response contract of POST /brain/intent. */
export interface BrainServerCriteria {
  readonly originalQuery: string;
  readonly propertyType?: string;
  /** A business use, never a substitute for the Shop property type. */
  readonly commercialActivity?: string;
  readonly purpose?: string;
  readonly areaTerms?: readonly string[];
  readonly budgetMin?: number;
  readonly budgetMax?: number;
  readonly personTerms?: readonly string[];
}

export type BrainIntentValidation =
  | { readonly ok: true; readonly value: BrainIntent }
  | { readonly ok: false; readonly issues: readonly BrainIntentIssue[] };

export interface BrainIntentIssue {
  readonly code:
    | 'invalid_intent'
    | 'invalid_goal'
    | 'criteria_required'
    | 'unexpected_field';
  readonly path: readonly string[];
}

const goalAliases: Readonly<Record<string, BrainGoal>> = {
  property_search: 'property_search',
  'Property Search': 'property_search',
  people_requirements_search: 'people_requirements_search',
  'People/Requirements Search': 'people_requirements_search',
  find_matches: 'find_matches',
  'Find Matches': 'find_matches',
};

/**
 * Validates an untrusted structured server response and reduces friendly
 * display labels to the stable local protocol. Search intents may use either
 * `criteria` or `query` on the wire, but are normalized to `criteria`.
 */
export function validateBrainIntent(value: unknown): BrainIntentValidation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, issues: [{ code: 'invalid_intent', path: [] }] };
  }
  const record = value as Record<string, unknown>;
  // The API returns `intent` plus extraction fields. Normalize it here so
  // callers cannot accidentally trust IDs or other model-created records.
  if ('intent' in record) return validateServerBrainIntent(record);
  const goal = typeof record.goal === 'string' ? goalAliases[record.goal] : undefined;
  if (!goal) {
    return { ok: false, issues: [{ code: 'invalid_goal', path: ['goal'] }] };
  }

  const allowed = goal === 'find_matches'
    ? new Set(['goal'])
    : new Set(['goal', 'criteria', 'query']);
  const unexpected = Object.keys(record).find(key => !allowed.has(key));
  if (unexpected) {
    return { ok: false, issues: [{ code: 'unexpected_field', path: [unexpected] }] };
  }
  if (goal === 'find_matches') return { ok: true, value: { goal } };

  const supplied = record.criteria ?? record.query;
  if (
    typeof supplied !== 'string'
    || supplied.trim().length === 0
    || (record.criteria !== undefined && record.query !== undefined)
  ) {
    return { ok: false, issues: [{ code: 'criteria_required', path: ['criteria'] }] };
  }
  return { ok: true, value: { goal, criteria: supplied.trim() } as BrainIntent };
}

function validateServerBrainIntent(record: Record<string, unknown>): BrainIntentValidation {
  const goal = typeof record.intent === 'string' ? goalAliases[record.intent] : undefined;
  if (!goal) return { ok: false, issues: [{ code: 'invalid_goal', path: ['intent'] }] };
  const allowed = new Set([
    'intent', 'originalQuery', 'propertyType', 'commercialActivity', 'purpose', 'areaTerms',
    'budgetMin', 'budgetMax', 'personTerms',
  ]);
  const unexpected = Object.keys(record).find(key => !allowed.has(key));
  if (unexpected) return { ok: false, issues: [{ code: 'unexpected_field', path: [unexpected] }] };
  if (typeof record.originalQuery !== 'string' || !record.originalQuery.trim()) {
    return { ok: false, issues: [{ code: 'criteria_required', path: ['originalQuery'] }] };
  }
  const optionalString = (value: unknown): value is string | null =>
    value === undefined || value === null || typeof value === 'string';
  const optionalTerms = (value: unknown): value is readonly string[] | null =>
    value === undefined || value === null
    || (Array.isArray(value) && value.every(term => typeof term === 'string'));
  const optionalBudget = (value: unknown): value is number | null =>
    value === undefined || value === null
    || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (
    !optionalString(record.propertyType) || !optionalString(record.commercialActivity)
    || !optionalString(record.purpose)
    || !optionalTerms(record.areaTerms) || !optionalTerms(record.personTerms)
    || !optionalBudget(record.budgetMin) || !optionalBudget(record.budgetMax)
    || (typeof record.budgetMin === 'number' && typeof record.budgetMax === 'number'
      && record.budgetMin > record.budgetMax)
  ) {
    return { ok: false, issues: [{ code: 'invalid_intent', path: [] }] };
  }
  const criteria: BrainServerCriteria = {
    originalQuery: record.originalQuery.trim(),
    ...(typeof record.propertyType === 'string' ? { propertyType: record.propertyType } : {}),
    ...(typeof record.commercialActivity === 'string' ? { commercialActivity: record.commercialActivity } : {}),
    ...(typeof record.purpose === 'string' ? { purpose: record.purpose } : {}),
    ...(Array.isArray(record.areaTerms) ? { areaTerms: record.areaTerms } : {}),
    ...(typeof record.budgetMin === 'number' ? { budgetMin: record.budgetMin } : {}),
    ...(typeof record.budgetMax === 'number' ? { budgetMax: record.budgetMax } : {}),
    ...(Array.isArray(record.personTerms) ? { personTerms: record.personTerms } : {}),
  };
  if (goal === 'find_matches') return { ok: true, value: { goal, serverCriteria: criteria } };
  return { ok: true, value: { goal, criteria: criteria.originalQuery, serverCriteria: criteria } };
}

export interface PeopleRequirementsReference {
  /** References to the exact objects read from ViewState; no records are copied. */
  readonly person: Person;
  readonly requirements: readonly SeekerRequirement[];
}

export interface BrainPropertySearchResult {
  readonly goal: 'property_search';
  readonly properties: readonly Property[];
}

export interface BrainPeopleRequirementsSearchResult {
  readonly goal: 'people_requirements_search';
  readonly people: readonly PeopleRequirementsReference[];
}

export interface BrainMatchesResult {
  readonly goal: 'find_matches';
  readonly snapshot: MatchingDataSnapshot;
  readonly runs: readonly BrokerMatchingRunResult[];
  readonly groups: readonly MatchAllPersonGroup[];
}

export type BrainDispatchResult =
  | BrainPropertySearchResult
  | BrainPeopleRequirementsSearchResult
  | BrainMatchesResult;

export type BrainViewStateReader = MatchingDataReader;

export interface BrainPresentationProperty {
  readonly id: string;
  readonly propertyType: Property['core']['propertyType'];
  readonly areaId: string;
  readonly transaction: Property['activeOffer']['transaction'];
  readonly priceAmount: number;
  readonly currencyCode: string;
  readonly activity?: string;
}

export interface BrainPresentationRequirement {
  readonly id: string;
  readonly seekerId: string;
  readonly personName?: string;
  readonly purpose: SeekerRequirement['purpose'];
  readonly propertyType: SeekerRequirement['propertyType'];
  readonly usage?: { readonly kind: 'activity' | 'occupancy' | 'floorUse'; readonly value: string };
  readonly preferredAreaIds: readonly string[];
  readonly budgetMinimum?: number;
  readonly budgetMaximum?: number;
  readonly currencyCode: string;
}

export interface BrainPresentationPerson {
  readonly id: string;
  readonly name: string;
  readonly classifications: readonly Person['classifications'][number][];
}

export type BrainPresentation =
  | {
      readonly goal: 'property_search';
      readonly properties: readonly BrainPresentationProperty[];
    }
  | {
      readonly goal: 'people_requirements_search';
      readonly people: readonly {
        readonly person: BrainPresentationPerson;
        readonly requirements: readonly BrainPresentationRequirement[];
      }[];
    }
  | {
      readonly goal: 'find_matches';
      readonly runs: readonly {
        readonly requirementId: string;
        readonly requirement: BrainPresentationRequirement | null;
        readonly person: BrainPresentationPerson | null;
        readonly matches: readonly {
          readonly property: BrainPresentationProperty | null;
          readonly score: number;
        }[];
      }[];
    };

export type BrainLocale = 'ar' | 'en';
export type BrainErrorCode =
  | 'INTENT_ABORTED' | 'INTENT_TIMEOUT' | 'INTENT_NETWORK'
  | 'INTENT_SERVER' | 'INTENT_INVALID_RESPONSE';

/** A safe UI-facing failure: its code intentionally contains no diagnostics. */
export class BrainRequestError extends Error {
  constructor(readonly code: BrainErrorCode) {
    super(code);
    this.name = 'BrainRequestError';
  }
}

import { publicApiUrl } from '@/services/runtimeApi';

/**
 * Sends only the user's text and locale to the classifier. Local ViewState
 * data never crosses this boundary; the returned intent is validated before
 * the local dispatcher reads the injected store.
 */
export async function executeBrainRequest(
  text: string,
  locale: BrainLocale = 'en',
  options?: { readonly signal?: AbortSignal },
): Promise<BrainPresentation> {
  const request = text.trim();
  if (!request) throw new BrainRequestError('INTENT_INVALID_RESPONSE');
  const url = publicApiUrl('/api/brain/intent');
  if (!url) throw new BrainRequestError('INTENT_NETWORK');
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: request, locale }),
  }, 15_000, options?.signal);
  if (!response.ok) throw new BrainRequestError('INTENT_SERVER');
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BrainRequestError('INTENT_INVALID_RESPONSE');
  }
  const validation = validateBrainIntent(payload);
  if (!validation.ok) throw new BrainRequestError('INTENT_INVALID_RESPONSE');
  // Deferred so the pure local brain can also be exercised in Node without
  // loading React Native persistence. This is still the app's sole local
  // ViewState store, and is never included in the request body.
  const { store } = await import('@/services/persistence');
  return buildBrainPresentation(
    await new ViewStateBrain(store).dispatch(validation.value),
  );
}

export function buildBrainPresentation(result: BrainDispatchResult): BrainPresentation {
  switch (result.goal) {
    case 'property_search':
      return { goal: result.goal, properties: result.properties.map(presentProperty) };
    case 'people_requirements_search':
      return {
        goal: result.goal,
        people: result.people.map(group => ({
          person: presentPerson(group.person),
          requirements: group.requirements.map(requirement =>
            presentRequirement(requirement, group.person.name)),
        })),
      };
    case 'find_matches': {
      const requirements = new Map(result.snapshot.requirements.map(item => [item.id, item]));
      const people = new Map(result.snapshot.people.map(item => [item.id, item]));
      const properties = new Map(result.snapshot.properties.map(item => [item.core.id, item]));
      return {
        goal: result.goal,
        runs: result.runs.map(run => {
          const requirement = requirements.get(run.requirementId);
          const person = requirement ? people.get(requirement.seekerId) : undefined;
          return {
            requirementId: run.requirementId,
            requirement: requirement ? presentRequirement(requirement, person?.name) : null,
            person: person ? presentPerson(person) : null,
            matches: run.matches.map(match => ({
              property: properties.has(match.propertyId)
                ? presentProperty(properties.get(match.propertyId)!)
                : null,
              score: match.score,
            })),
          };
        }),
      };
    }
  }
}

function presentPerson(person: Person): BrainPresentationPerson {
  return { id: person.id, name: person.name, classifications: person.classifications };
}

function presentRequirement(
  requirement: SeekerRequirement,
  personName?: string,
): BrainPresentationRequirement {
  const usage = requirement.commercialActivity
    ? { kind: 'activity' as const, value: requirement.commercialActivity }
    : 'occupancy' in requirement && requirement.occupancy && requirement.occupancy !== 'any'
      ? { kind: 'occupancy' as const, value: requirement.occupancy }
      : requirement.floorUse
        ? { kind: 'floorUse' as const, value: requirement.floorUse }
        : undefined;
  return {
    id: requirement.id,
    seekerId: requirement.seekerId,
    personName,
    purpose: requirement.purpose,
    propertyType: requirement.propertyType,
    usage,
    preferredAreaIds: requirement.preferredAreaIds,
    budgetMinimum: requirement.budget.minimum,
    budgetMaximum: requirement.budget.maximum,
    currencyCode: requirement.budget.currencyCode,
  };
}

function presentProperty(property: Property): BrainPresentationProperty {
  const price = property.activeOffer.transaction === 'sale'
    ? property.activeOffer.salePrice
    : property.activeOffer.rentalPrice;
  return {
    id: property.core.id,
    propertyType: property.core.propertyType,
    areaId: property.core.locationArea.id,
    transaction: property.activeOffer.transaction,
    priceAmount: price.amount,
    currencyCode: price.currencyCode,
    activity: commercialActivity(property),
  };
}

/**
 * Pure local dispatcher. It has no device-audio, persistence, network, or
 * record-creation path. Matching intentionally uses the same captured
 * snapshot and M4 source as Match All, preserving its score and qualification
 * semantics.
 */
export class ViewStateBrain {
  constructor(private readonly reader: BrainViewStateReader) {}

  async dispatch(intent: BrainIntent): Promise<BrainDispatchResult> {
    const snapshot = await loadMatchingDataSnapshot(this.reader);
    switch (intent.goal) {
      case 'property_search':
        return {
          goal: intent.goal,
          properties: searchProperties(snapshot.properties, intent.criteria, intent.serverCriteria),
        };
      case 'people_requirements_search':
        return {
          goal: intent.goal,
          people: searchPeopleAndRequirements(
            snapshot.people,
            snapshot.requirements,
            intent.criteria,
            intent.serverCriteria,
          ),
        };
      case 'find_matches': {
        const scopedSnapshot = selectMatchingSnapshot(snapshot, intent.serverCriteria);
        const { runs, presentation } = await runSavedMatchingSnapshot(scopedSnapshot);
        return {
          goal: intent.goal,
          snapshot: scopedSnapshot,
          runs,
          groups: presentation.groups,
        };
      }
    }
  }
}

export function searchProperties(
  properties: readonly Property[],
  criteria: string,
  serverCriteria?: BrainServerCriteria,
): Property[] {
  const term = normalizeSearch(criteria);
  const hasStructuredCriteria = hasExplicitCriteria(serverCriteria);
  if (!term && !hasStructuredCriteria) return [];
  return properties.filter(property =>
    propertyMatchesCriteria(property, hasStructuredCriteria ? serverCriteria : undefined)
    && (hasStructuredCriteria || propertyTextMatches(property, criteria)));
}

export function searchPeopleAndRequirements(
  people: readonly Person[],
  requirements: readonly SeekerRequirement[],
  criteria: string,
  serverCriteria?: BrainServerCriteria,
): PeopleRequirementsReference[] {
  const terms = (
    serverCriteria
      ? serverCriteria.personTerms ?? []
      : [criteria]
  ).map(normalizeSearch).filter(Boolean);
  if (!terms.length && !hasExplicitCriteria(serverCriteria)) return [];
  const peopleById = new Map(people.map(person => [person.id, person]));
  const matchedRequirements = requirements.filter(requirement =>
    requirementMatchesCriteria(requirement, serverCriteria)
    && (terms.length === 0 || terms.some(term =>
      textMatches(requirementSearchText(requirement), term))));
  const matchedRequirementIds = new Set(matchedRequirements.map(requirement => requirement.id));

  return people.flatMap(person => {
    const personMatches = terms.length > 0 && terms.some(term =>
      textMatches(getPersonSearchText(person), term));
    const linked = requirements.filter(requirement => requirement.seekerId === person.id);
    const selected = personMatches
      ? linked
      : linked.filter(requirement => matchedRequirementIds.has(requirement.id));
    return selected.length > 0 || personMatches
      ? [{ person: peopleById.get(person.id)!, requirements: selected }]
      : [];
  });
}

function selectMatchingSnapshot(
  snapshot: MatchingDataSnapshot,
  criteria?: BrainServerCriteria,
): MatchingDataSnapshot {
  if (!hasExplicitCriteria(criteria)) return snapshot;
  const matchedPeople = new Set(
    snapshot.people
      .filter(person => matchesAnyPersonTerm(person, criteria?.personTerms))
      .map(person => person.id),
  );
  const requirements = snapshot.requirements.filter(requirement =>
    requirementMatchesCriteria(requirement, criteria)
    && (!criteria?.personTerms?.length || matchedPeople.has(requirement.seekerId)));
  return {
    people: snapshot.people,
    requirements,
    // Intent criteria select the Requirements to run. Candidate Properties
    // stay complete so the deterministic engine remains the only authority
    // for eligibility, cross-area location-floor scoring, and qualification.
    properties: snapshot.properties,
  };
}

function hasExplicitCriteria(criteria?: BrainServerCriteria): boolean {
  return !!criteria && (
    criteria.propertyType !== undefined || criteria.commercialActivity !== undefined
    || criteria.purpose !== undefined
    || !!criteria.areaTerms?.length || criteria.budgetMin !== undefined
    || criteria.budgetMax !== undefined || !!criteria.personTerms?.length
  );
}

function propertyMatchesCriteria(property: Property, criteria?: BrainServerCriteria): boolean {
  if (!criteria) return true;
  const propertyCommercialActivity = commercialActivity(property);
  const price = property.activeOffer.transaction === 'sale'
    ? property.activeOffer.salePrice : property.activeOffer.rentalPrice;
  const expectedTransaction = criteria.purpose === 'buy' ? 'sale' : criteria.purpose;
  return (
    // Property type and business activity are separate exact filters: "Shop"
    // must not be interpreted as a saved activity such as "retail".
    (criteria.propertyType === undefined || property.core.propertyType === criteria.propertyType)
    && (criteria.commercialActivity === undefined
      || (propertyCommercialActivity !== undefined
        && normalizeSearch(propertyCommercialActivity) === normalizeSearch(criteria.commercialActivity)))
    && (expectedTransaction === undefined || property.activeOffer.transaction === expectedTransaction)
    && (criteria.budgetMin === undefined || price.amount >= criteria.budgetMin)
    && (criteria.budgetMax === undefined || price.amount <= criteria.budgetMax)
    && (!criteria.areaTerms?.length || criteria.areaTerms.some(term =>
      textMatches(propertySearchText(property), term)))
  );
}

function requirementMatchesCriteria(
  requirement: SeekerRequirement,
  criteria?: BrainServerCriteria,
): boolean {
  if (!criteria) return true;
  const expectedPurpose = criteria.purpose === 'sale' ? 'buy' : criteria.purpose;
  return (
    (criteria.propertyType === undefined || requirement.propertyType === criteria.propertyType)
    && (criteria.commercialActivity === undefined
      || (requirement.commercialActivity !== undefined
        && normalizedExactMatch(requirement.commercialActivity, criteria.commercialActivity)))
    && (expectedPurpose === undefined || requirement.purpose === expectedPurpose)
    && (criteria.budgetMin === undefined || (requirement.budget.minimum ?? 0) >= criteria.budgetMin)
    && (criteria.budgetMax === undefined || (requirement.budget.maximum ?? Infinity) <= criteria.budgetMax)
    && (!criteria.areaTerms?.length || criteria.areaTerms.some(term =>
      textMatches(requirementSearchText(requirement), term)))
  );
}

function matchesAnyPersonTerm(person: Person, terms?: readonly string[]): boolean {
  return !terms?.length || terms.some(term =>
    textMatches(getPersonSearchText(person), term));
}

function propertySearchText(property: Property): string {
  const area = getAreaById(property.core.locationArea.id);
  const price = property.activeOffer.transaction === 'sale'
    ? property.activeOffer.salePrice
    : property.activeOffer.rentalPrice;
  return [
    property.core.id,
    property.core.propertyType,
    commercialActivity(property),
    property.activeOffer.transaction,
    property.core.locationArea.id,
    area?.en,
    area?.ar,
    area?.governorateEn,
    area?.governorateAr,
    price.currencyCode,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

/**
 * The one normalization boundary for local textual Brain searches. It only
 * folds orthographic equivalents; it deliberately does not conflate ة/ه/ت or
 * perform stemming/fuzzy matching.
 */
export function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    // Keep token boundaries: deleting punctuation could turn unrelated words
    // into an accidental match (for example, "a-b" into "ab").
    .replace(/[\s\u200c\u200d\p{P}\p{S}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizedExactMatch(left: string, right: string): boolean {
  return left === right || normalizeSearch(left) === normalizeSearch(right);
}

function textMatches(text: string, query: string): boolean {
  const normalizedQuery = normalizeSearch(query);
  const normalizedText = normalizeSearch(text);
  if (!normalizedQuery || !normalizedText) return false;
  if (text === query || normalizedText === normalizedQuery) return true;
  const queryTokens = normalizedQuery.split(' ');
  const textTokens = normalizedText.split(' ');
  return queryTokens.every(token => textTokens.includes(token));
}

function propertyTextMatches(property: Property, query: string): boolean {
  const activity = commercialActivity(property);
  // An explicitly saved activity is checked before the general field list.
  return !!activity && normalizedExactMatch(activity, query)
    || textMatches(propertySearchText(property), query);
}

function commercialActivity(property: Property): string | undefined {
  const details = property.typeDetails;
  return !!details && 'commercialActivity' in details
    ? details.commercialActivity?.value
    : undefined;
}

function requirementSearchText(requirement: SeekerRequirement): string {
  const areas = requirement.preferredAreaIds.flatMap(areaId => {
    const area = getAreaById(areaId);
    return [areaId, area?.en, area?.ar, area?.governorateEn, area?.governorateAr];
  });
  return [
    requirement.id,
    requirement.seekerId,
    requirement.purpose,
    requirement.propertyType,
    requirement.notes,
    ...areas,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  upstreamSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  upstreamSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new BrainRequestError('INTENT_TIMEOUT');
    if (upstreamSignal?.aborted) throw new BrainRequestError('INTENT_ABORTED');
    throw new BrainRequestError('INTENT_NETWORK');
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener('abort', abort);
  }
}