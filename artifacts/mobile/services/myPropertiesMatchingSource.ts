import {
  evaluateMatch,
  validateProperty,
  type MatchingPropertyCandidate,
  type MatchingPropertyEvidence,
  type Property,
  type SeekerRequirement,
} from '@workspace/property-domain';
import type { PropertyStore } from '@/services/persistence';

type PropertyEvidenceLike = {
  readonly bedroomCount?: unknown;
  readonly bathroomCount?: unknown;
  readonly hasPool?: unknown;
};

export type MyPropertiesStore = Pick<PropertyStore, 'getProperties'>;

/**
 * The My Properties source only reads the existing local PropertyStore.
 * PropertyStore order is authoritative: SQLite/Web already return records in
 * their deterministic creation order, and this adapter preserves that order
 * after filtering.
 */
export class MyPropertiesMatchingSource {
  constructor(private readonly store: MyPropertiesStore) {}

  async getCandidates(
    requirement: SeekerRequirement,
  ): Promise<MatchingPropertyCandidate[]> {
    const properties = await this.store.getProperties();
    const candidates: MatchingPropertyCandidate[] = [];
    const seenPropertyIds = new Set<string>();

    for (const value of properties as unknown[]) {
      const candidate = normalizeMyPropertyCandidate(value);
      if (candidate === null) continue;

      const propertyId = candidate.property.core.id;
      if (seenPropertyIds.has(propertyId)) continue;
      seenPropertyIds.add(propertyId);

      // M2 remains the single owner of hard eligibility semantics. This
      // adapter only uses its result as a local source gate.
      if (!evaluateMatch(requirement, candidate).eligible) continue;
      candidates.push(candidate);
    }

    return candidates;
  }
}

export function normalizeMyPropertyCandidate(
  value: unknown,
): MatchingPropertyCandidate | null {
  if (!isProperty(value)) return null;

  return {
    property: value,
    evidence: normalizeApprovedPropertyEvidence(value),
  };
}

function isProperty(value: unknown): value is Property {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  try {
    return validateProperty(value as Property).ok;
  } catch {
    return false;
  }
}

function normalizeApprovedPropertyEvidence(
  property: Property,
): MatchingPropertyEvidence {
  const details = property.typeDetails as PropertyEvidenceLike | undefined;
  return {
    ...(isFiniteNonNegativeNumber(details?.bedroomCount)
      ? { bedrooms: details.bedroomCount }
      : {}),
    ...(isFiniteNonNegativeNumber(details?.bathroomCount)
      ? { bathrooms: details.bathroomCount }
      : {}),
    ...(typeof details?.hasPool === 'boolean'
      ? { swimmingPool: details.hasPool }
      : {}),
  };
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0;
}