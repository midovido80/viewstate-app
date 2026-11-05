import { validateSeekerRequirement, MATCH_ENGINE_VERSION, type MatchingPolicy, type SeekerRequirement } from '@workspace/property-domain';
import { BrokerInitiatedMatching, type BrokerMatchingRequirementStore, type BrokerMatchingCandidateSource, type BrokerMatchingRunResult } from './brokerInitiatedMatching';
import { validMatchingRequirements, runMatchingForAllRequirements, groupMatchAllResultsByPerson } from './matchingUi';
import type { Person } from './people';

export type MatchingScope = { kind: 'all' | 'best' } | { kind: 'property' | 'requirement'; id: string } | { kind: 'invalid' };
type Param = string | string[] | undefined;
const one = (value: Param): string | undefined => typeof value === 'string' ? value || undefined : value?.length === 1 ? value[0] || undefined : undefined;
export function resolveMatchingScope(params: { scope?: Param; propertyId?: Param; requirementId?: Param; best?: Param }): MatchingScope {
  const kind = one(params.scope), property = one(params.propertyId), requirement = one(params.requirementId);
  if (Object.values(params).some(value => Array.isArray(value) && value.length !== 1)) return { kind: 'invalid' };
  if (kind === 'all' || kind === 'best') return { kind };
  if (kind === 'property') return property ? { kind, id: property } : { kind: 'invalid' };
  if (kind === 'requirement') return requirement ? { kind, id: requirement } : { kind: 'invalid' };
  if (kind || property && requirement) return { kind: 'invalid' };
  return property ? { kind: 'property', id: property } : requirement ? { kind: 'requirement', id: requirement } : { kind: one(params.best) === '1' ? 'best' : 'all' };
}
export function matchingScopeKey(scope: MatchingScope): string {
  return 'id' in scope ? JSON.stringify([scope.kind, scope.id]) : scope.kind;
}
let entrySerial = 0;
/** Explicit empty values overwrite parameters retained by the existing tab route. */
export function matchingTarget(scope: Exclude<MatchingScope, { kind: 'invalid' }>) {
  return { pathname: '/matching' as const, params: {
    scope: scope.kind, entry: String(++entrySerial), propertyId: scope.kind === 'property' ? scope.id : '',
    requirementId: scope.kind === 'requirement' ? scope.id : '', best: scope.kind === 'best' ? '1' : '', returnSession: '',
  } };
}
export function matchingEntryHref(scope: Exclude<MatchingScope, { kind: 'invalid' }>): string {
  return '/matching?' + new URLSearchParams(matchingTarget(scope).params).toString();
}
export function matchingRestoreFits(scope: MatchingScope, restore: { scopePropertyId?: string; scopeRequirementId?: string; best?: boolean } | undefined): boolean {
  return !!restore && matchingScopeKey(scope) === matchingScopeKey(resolveMatchingScope({ propertyId: restore.scopePropertyId, requirementId: restore.scopeRequirementId, best: restore.best ? '1' : undefined }));
}
/** Scope is applied before engine ranking, and never falls back to a general run on a missing record. */
export async function runSavedMatchingScope(input: {
  scope: MatchingScope; store: BrokerMatchingRequirementStore; source: BrokerMatchingCandidateSource;
  requirements: readonly SeekerRequirement[]; people: readonly Person[];
  policies: Record<string, MatchingPolicy>; excluded: Record<string, string[]>;
}) {
  const { scope, store, source, people, policies, excluded } = input;
  if (scope.kind === 'invalid') throw new Error('MATCHING_SCOPE_INVALID');
  const selected = scope.kind === 'requirement'
    ? input.requirements.filter(item => item.id === scope.id && validateSeekerRequirement(item).ok)
    : validMatchingRequirements(input.requirements);
  if (scope.kind === 'requirement' && selected.length !== 1) throw new Error('MATCHING_REQUIREMENT_NOT_FOUND');
  const candidates = scope.kind === 'property' ? (await source.getCandidates()).filter(candidate => candidate.property.core.id === scope.id) : undefined;
  if (scope.kind === 'property' && candidates?.length !== 1) throw new Error('MATCHING_PROPERTY_NOT_FOUND');
  const matching = new BrokerInitiatedMatching(store, candidates ? { getCandidates: async () => candidates } : source);
  const runs = await runMatchingForAllRequirements(selected, id => matching.runForRequirement(id, policies[id], excluded[id]));
  if (runs.some(run => run.engineVersion !== MATCH_ENGINE_VERSION)) throw new Error('STALE_MATCH_ENGINE');
  let groups = groupMatchAllResultsByPerson(selected, people, runs);
  if (scope.kind === 'property') groups = groups.map(group => ({ ...group, requirementGroups: group.requirementGroups.filter(request => request.matches.length || request.needsConfirmation.length) })).filter(group => group.requirementGroups.length);
  const unlinked: { requirement: SeekerRequirement; run: BrokerMatchingRunResult } | null = scope.kind === 'requirement' && !selected[0].seekerId ? { requirement: selected[0], run: runs[0] } : null;
  return { groups, selected, runs, unlinked };
}
