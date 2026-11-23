import { resolveMatchingScope, matchingEntryHref } from './matchingScope';
import type { QuickMatchingFilters } from './quickMatching';
import type { MatchingResultsLayout } from '@/services/matchingGroups';
import { MATCH_ENGINE_VERSION, type MatchingPolicy, type SeekerRequirement } from '@workspace/property-domain';

export interface MatchingReturnSession {
  readonly token: string;
  readonly engineVersion: typeof MATCH_ENGINE_VERSION;
  readonly createdAt: number;
  readonly scopeRequirementId?: string;
  readonly scopePropertyId?: string;
  readonly best?: boolean;
  readonly mode: 'saved' | 'quick';
  readonly layout?: MatchingResultsLayout;
  readonly quickRequirement?: SeekerRequirement;
  readonly quickFilters?: QuickMatchingFilters;
  readonly policies: Record<string, MatchingPolicy>;
  readonly excluded: Record<string, string[]>;
  readonly scrollOffset: number;
}
let session: MatchingReturnSession | undefined;
let serial = 0;
export function clearMatchingReturn() { session = undefined; serial++; }
/** RAM only, bounded to one return context. Scores are never cached or persisted. */
export function rememberMatchingReturn(input: Omit<MatchingReturnSession, 'token' | 'engineVersion' | 'createdAt'>, now = Date.now()): string {
  const token = `match-${now}-${++serial}`;
  session = JSON.parse(JSON.stringify({ ...input, token, engineVersion: MATCH_ENGINE_VERSION, createdAt: now }));
  return token;
}
export function readMatchingReturn(token: string | undefined, now = Date.now()): MatchingReturnSession | undefined {
  if (!token || !session || token !== session.token || session.engineVersion !== MATCH_ENGINE_VERSION || now < session.createdAt || now - session.createdAt > 15 * 60 * 1000) return undefined;
  return JSON.parse(JSON.stringify(session));
}
export function withMatchingReturn(href: string, token?: string): string {
  return readMatchingReturn(token) ? `${href}${href.includes('?') ? '&' : '?'}matchingReturn=${encodeURIComponent(token!)}` : href;
}
export function matchingBackRoute(token?: string): string {
  const current = readMatchingReturn(token);
  if (!current) return '/properties';
  const scope = resolveMatchingScope({ propertyId: current.scopePropertyId, requirementId: current.scopeRequirementId, best: current.best ? '1' : undefined });
  if (scope.kind === 'invalid') return '/properties';
  const target = new URLSearchParams(matchingEntryHref(scope).split('?')[1]);
  target.delete('returnSession');
  return `/matching?returnSession=${encodeURIComponent(current.token)}&${target.toString()}`;
}
