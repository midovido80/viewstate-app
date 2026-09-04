import {
  checkMatchEligibility,
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
  readonly floorUse?: unknown;
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
      if (!checkMatchEligibility(requirement, candidate).eligible) continue;
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
    property: projectApprovedMatchingProperty(value),
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
  const propertyType = property.core.propertyType;
  const supportsBedrooms = propertyType === 'apartment'
    || propertyType === 'house'
    || propertyType === 'villa'
    || propertyType === 'chalet'
    || (propertyType === 'floor' && details?.floorUse === 'residential');
  const supportsBathrooms = supportsBedrooms
    || propertyType === 'office'
    || propertyType === 'shop'
    || propertyType === 'warehouse'
    || (propertyType === 'floor' && details?.floorUse === 'commercial');
  const supportsPool = propertyType === 'house'
    || propertyType === 'villa'
    || propertyType === 'chalet';

  return {
    ...(supportsBedrooms && isFiniteNonNegativeNumber(details?.bedroomCount)
      ? { bedrooms: details.bedroomCount }
      : {}),
    ...(supportsBathrooms && isFiniteNonNegativeNumber(details?.bathroomCount)
      ? { bathrooms: details.bathroomCount }
      : {}),
    ...(supportsPool && typeof details?.hasPool === 'boolean'
      ? { swimmingPool: details.hasPool }
      : {}),
  };
}

function projectApprovedMatchingProperty(property: Property): Property {
  const activeOffer = property.activeOffer.transaction === 'rent'
    ? {
      id: property.activeOffer.id,
      propertyCoreId: property.activeOffer.propertyCoreId,
      transaction: 'rent' as const,
      rentalPrice: {
        amount: property.activeOffer.rentalPrice.amount,
        currencyCode: property.activeOffer.rentalPrice.currencyCode,
      },
      // Required by the frozen RentOffer contract; never interpreted by M2.
      rentalPeriodId: property.activeOffer.rentalPeriodId,
    }
    : {
      id: property.activeOffer.id,
      propertyCoreId: property.activeOffer.propertyCoreId,
      transaction: 'sale' as const,
      salePrice: {
        amount: property.activeOffer.salePrice.amount,
        currencyCode: property.activeOffer.salePrice.currencyCode,
      },
    };

  return {
    core: {
      id: property.core.id,
      propertyType: property.core.propertyType,
      locationArea: { id: property.core.locationArea.id },
    },
    activeOffer,
    typeDetails: projectApprovedTypeDetails(property),
  };
}

function projectApprovedTypeDetails(property: Property): Property['typeDetails'] {
  const details = property.typeDetails as PropertyEvidenceLike | undefined;
  if (!details) return undefined;
  const evidence = normalizeApprovedPropertyEvidence(property);

  const base = {
    propertyType: property.core.propertyType,
    ...(evidence.bedrooms !== undefined
      ? { bedroomCount: evidence.bedrooms }
      : {}),
    ...(evidence.bathrooms !== undefined
      ? { bathroomCount: evidence.bathrooms }
      : {}),
  };

  if (
    (property.core.propertyType === 'house'
      || property.core.propertyType === 'villa'
      || property.core.propertyType === 'chalet')
    && evidence.swimmingPool !== undefined
  ) {
    return {
      ...base,
      hasPool: evidence.swimmingPool,
    } as Property['typeDetails'];
  }

  if (property.core.propertyType === 'floor') {
    if (
      Object.keys(base).length > 1
      && (details.floorUse === 'residential' || details.floorUse === 'commercial')
    ) {
      return {
        ...base,
        floorUse: details.floorUse,
      } as Property['typeDetails'];
    }
  }

  if (property.core.propertyType === 'other_built_property') {
    // Its required clarification is literal text and is not M2 evidence.
    return undefined;
  }

  return Object.keys(base).length > 1
    ? base as Property['typeDetails']
    : undefined;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0;
}