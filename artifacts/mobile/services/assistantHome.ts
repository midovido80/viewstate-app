import { MATCH_ENGINE_VERSION, type MatchResult, type SeekerRequirement } from '@workspace/property-domain';
import type { BrokerMatchingRunResult } from './brokerInitiatedMatching';
import type { Person } from './people';
import type { AssistantInventory, Followup } from './dailyAssistant';
import { normalizeFlexibleSearchText, flexibleSearchTerms } from './flexibleSearch';

export type HomeQuickAction = 'person' | 'property' | 'import' | 'share' | 'matching';
/** Existing capture entry points only. No alternative capture forms. */
export function homeQuickRoute(action: HomeQuickAction): string | null {
  return action === 'person' ? '/person/new' : action === 'property' ? '/capture/transaction' : action === 'matching' ? '/matching' : null;
}
export interface HomeMatch { person: Person; requirement: SeekerRequirement; result: MatchResult }
/** Read-only projection of the existing engine's shortlists. Never rescoring or accepting another engine. */
export function selectHomeMatches(requirements: readonly SeekerRequirement[], people: readonly Person[], runs: readonly BrokerMatchingRunResult[]): HomeMatch[] {
  const peopleById = new Map(people.map(p => [p.id, p]));
  const requests = new Map(requirements.map(r => [r.id, r]));
  const pairs = new Map<string, HomeMatch>();
  for (const run of runs) {
    const requirement = requests.get(run.requirementId), person = requirement?.seekerId ? peopleById.get(requirement.seekerId) : undefined;
    if (!requirement || !person || run.engineVersion !== MATCH_ENGINE_VERSION) continue;
    for (const result of run.matches) {
      if (result.engineVersion !== MATCH_ENGINE_VERSION || result.requirementId !== requirement.id || !result.eligible || !result.qualifies
        || !['direct', 'provisional', 'negotiation'].includes(result.category) || !Number.isFinite(result.score)) continue;
      const key = JSON.stringify([person.id, result.propertyId]);
      const entry = { person, requirement, result }, old = pairs.get(key);
      if (!old || compareHomeMatch(entry, old) < 0) pairs.set(key, entry);
    }
  }
  return [...pairs.values()].sort(compareHomeMatch).slice(0, 5);
}
function compareHomeMatch(a: HomeMatch, b: HomeMatch): number {
  return b.result.score - a.result.score || a.result.differenceCount - b.result.differenceCount
    || a.result.unknownCount - b.result.unknownCount || a.result.priceAmount - b.result.priceAmount
    || a.person.id.localeCompare(b.person.id) || a.result.propertyId.localeCompare(b.result.propertyId)
    || a.requirement.id.localeCompare(b.requirement.id);
}
/** All task statuses are searchable; Arabic/Persian digits and ISO/slash dates use the shared normalizer. */
export function searchAssistantFollowups(tasks: readonly Followup[], inventory: AssistantInventory, query: string): Followup[] {
  const normalized = normalizeFlexibleSearchText(query).replace(/\//g, '-'), terms = flexibleSearchTerms(normalized);
  if (!terms.length) return [];
  const people = new Map(inventory.people.map(p => [p.id, p.name]));
  const properties = new Map(inventory.properties.map(p => [p.id, p.title]));
  return tasks.filter(task => {
    const text = normalizeFlexibleSearchText([task.title, task.notes, task.date, task.time, task.personName,
      people.get(task.personId), properties.get(task.propertyId)].filter(Boolean).join(' '));
    return terms.every(term => text.includes(term));
  }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}
export function homeGreetingPeriod(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}
