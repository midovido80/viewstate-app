import {
  MATCH_ENGINE_VERSION,
  type MatchResult,
  type SeekerRequirement,
} from "@workspace/property-domain";
import type { Person } from "@/services/people";
import type { MatchAllPersonGroup } from "@/services/matchingUi";

export type MatchingResultsView = "people" | "properties";
export interface MatchingResultsLayout {
  view: MatchingResultsView;
  /** undefined opens the first group; comparisons open only on request. null closes all. */
  group?: string | null;
  card?: string | null;
}
export interface MatchingPair {
  requirement: SeekerRequirement;
  result: MatchResult;
}
export interface PropertyPersonMatches {
  person: Person;
  ready: MatchingPair[];
  pending: MatchingPair[];
}
export interface MatchingPropertyGroup {
  propertyId: string;
  people: PropertyPersonMatches[];
}

/** Presentation of the same bounded shortlists. No scoring, candidate search or writes. */
export function groupMatchingByProperty(
  groups: readonly MatchAllPersonGroup[],
): MatchingPropertyGroup[] {
  const properties = new Map<string, Map<string, PropertyPersonMatches>>();
  const seen = new Set<string>();
  for (const group of groups)
    for (const request of group.requirementGroups) {
      if (request.requirement.seekerId !== group.person.id) continue;
      for (const [items, bucket] of [
        [request.matches, "ready"],
        [request.needsConfirmation, "pending"],
      ] as const) {
        for (const result of items) {
          if (
            result.engineVersion !== MATCH_ENGINE_VERSION ||
            result.requirementId !== request.requirement.id ||
            !result.eligible
          )
            continue;
          if (
            bucket === "ready"
              ? !result.qualifies ||
                !["direct", "provisional", "negotiation"].includes(
                  result.category,
                )
              : result.category !== "needs_confirmation"
          )
            continue;
          const key = JSON.stringify([
            group.person.id,
            result.requirementId,
            result.propertyId,
          ]);
          if (seen.has(key)) continue;
          seen.add(key);
          let people = properties.get(result.propertyId);
          if (!people) {
            people = new Map();
            properties.set(result.propertyId, people);
          }
          let person = people.get(group.person.id);
          if (!person) {
            person = { person: group.person, ready: [], pending: [] };
            people.set(group.person.id, person);
          }
          person[bucket].push({ requirement: request.requirement, result });
        }
      }
    }
  return [...properties].map(([propertyId, people]) => ({
    propertyId,
    people: [...people.values()],
  }));
}
export function personPropertyCounts(group: MatchAllPersonGroup) {
  return {
    ready: new Set(
      group.requirementGroups.flatMap((item) =>
        item.matches.map((result) => result.propertyId),
      ),
    ).size,
    pending: new Set(
      group.requirementGroups.flatMap((item) =>
        item.needsConfirmation.map((result) => result.propertyId),
      ),
    ).size,
  };
}
export function propertyPeopleCounts(group: MatchingPropertyGroup) {
  return {
    ready: group.people.filter((person) => person.ready.length).length,
    pending: group.people.filter((person) => person.pending.length).length,
  };
}
export function matchingCountLabel(
  count: number,
  unit: "properties" | "people",
  pending: boolean,
  language: "en" | "ar",
): string {
  if (language === "en")
    return `${count} ${unit === "properties" ? "properties" : "people"} ${pending ? "need information confirmation" : unit === "properties" ? "suggested" : "have suitable requests"}`;
  if (count === 1)
    return unit === "properties"
      ? pending
        ? "عقار واحد يحتاج تأكيد معلومات"
        : "عقار واحد مرشح لهذا الطلب"
      : pending
        ? "شخص واحد تحتاج مطابقته تأكيد معلومات"
        : "شخص واحد لديه طلب مناسب لهذا العقار";
  if (count === 2)
    return unit === "properties"
      ? pending
        ? "عقاران يحتاجان تأكيد معلومات"
        : "عقاران مرشحان لهذا الطلب"
      : pending
        ? "شخصان تحتاج مطابقتهما تأكيد معلومات"
        : "شخصان لديهما طلبات مناسبة لهذا العقار";
  return unit === "properties"
    ? `${count} ${pending ? "عقارات تحتاج تأكيد معلومات" : "عقارات مرشحة لهذا الطلب"}`
    : `${count} ${pending ? "أشخاص تحتاج مطابقتهم تأكيد معلومات" : "أشخاص لديهم طلبات مناسبة لهذا العقار"}`;
}
