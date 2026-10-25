import { MATCH_ENGINE_VERSION, type MatchingPolicy, type SeekerRequirement } from '@workspace/property-domain';

export interface MatchingReturnSession {
  readonly token: string;
  readonly engineVersion: typeof MATCH_ENGINE_VERSION;
  readonly createdAt: number;
  readonly scopeRequirementId?: string;
  readonly mode: 'saved' | 'quick';
  readonly quickRequirement?: SeekerRequirement;
  readonly policies: Record<string, MatchingPolicy>;
  readonly excluded: Record<string, string[]>;
  readonly scrollOffset: number;
}
let session: MatchingReturnSession | undefined;
let serial = 0;
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
  return `/matching?returnSession=${encodeURIComponent(current.token)}${current.scopeRequirementId ? `&requirementId=${encodeURIComponent(current.scopeRequirementId)}` : ''}`;
}
