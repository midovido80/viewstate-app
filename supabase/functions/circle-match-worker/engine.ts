import { evaluateMatch, rankMatchResults, selectMatchShortlist } from '../../../lib/property-domain/src/matching.ts';
import { validateProperty } from '../../../lib/property-domain/src/validation.ts';
import { validateSeekerRequirement } from '../../../lib/property-domain/src/requirements.ts';
import type { Property } from '../../../lib/property-domain/src/types.ts';
import type { SeekerRequirement } from '../../../lib/property-domain/src/requirements.ts';

export interface CircleSnapshot {
  revision: number;
  properties: { id: string; owner: string; facts: Property }[];
  requests: { id: string; owner: string; facts: Omit<SeekerRequirement, 'id'> }[];
}

export function matchCircleSnapshot(snapshot: CircleSnapshot) {
  const properties = snapshot.properties.flatMap(({ id, owner, facts }) => {
    if (!validateProperty(facts).ok) return [];
    const property = {
      ...facts,
      core: { ...facts.core, id },
      activeOffer: { ...facts.activeOffer, propertyCoreId: id },
    };
    return [{ property, owner }];
  });
  return snapshot.requests.flatMap(({ id, owner, facts }) => {
    const requirement = { ...facts, id } as SeekerRequirement;
    if (!validateSeekerRequirement(requirement).ok) return [];
    const candidates = properties.filter(property => property.owner !== owner);
    const results = rankMatchResults(candidates.map(candidate =>
      evaluateMatch(requirement, candidate, { strictFields: ['location'] }),
    ));
    return selectMatchShortlist(results, candidates).map(result => ({
      request_id: id, property_id: result.propertyId, score: result.score,
    }));
  });
}
