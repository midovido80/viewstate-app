import {
  matchingPropertyFacts,
  validateProperty,
  type MatchingPropertyCandidate,
  type Property,
  type SeekerRequirement,
} from "@workspace/property-domain";
import type { PropertyStore } from "@/services/persistence";
import { projectPropertyFacts } from "@/services/propertyFactProjection";

export type MyPropertiesStore = Pick<PropertyStore, "getProperties">;

/** One read snapshot per explicit run. A new source is created for every run. */
export class MyPropertiesMatchingSource {
  private snapshot?: Promise<MatchingPropertyCandidate[]>;
  constructor(private readonly store: MyPropertiesStore) {}
  async getCandidates(
    _requirement: SeekerRequirement,
  ): Promise<MatchingPropertyCandidate[]> {
    if (!this.snapshot) this.snapshot = this.readSnapshot();
    return this.snapshot;
  }
  private async readSnapshot(): Promise<MatchingPropertyCandidate[]> {
    const properties = await this.store.getProperties();
    const seen = new Set<string>();
    return properties.flatMap((value, index) => {
      const candidate = normalizeMyPropertyCandidate(value);
      if (!candidate || seen.has(candidate.property.core.id)) return [];
      seen.add(candidate.property.core.id);
      return [{ ...candidate, propertyChronology: index }];
    });
  }
}

/** Facts only: no private notes, exact location, source contacts, media or commission. */
export function normalizeMyPropertyCandidate(
  value: unknown,
): MatchingPropertyCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    if (!validateProperty(value as Property).ok) return null;
  } catch {
    return null;
  }
  const source = value as Property;
  const projected = projectPropertyFacts(source);
  const details = matchingPropertyFacts({
    ...source,
    typeDetails: {
      ...projected.templateFacts,
      ...source.typeDetails,
    } as Property["typeDetails"],
    ...(projected.areaSquareMeters === undefined
      ? {}
      : {
          areaSquareMeters: projected.areaSquareMeters,
          areaUnit: "square_meter",
        }),
  });
  const offer = source.activeOffer;
  return {
    property: {
      core: {
        id: source.core.id,
        propertyType: source.core.propertyType,
        locationArea: { id: source.core.locationArea.id },
      },
      activeOffer:
        offer.transaction === "rent"
          ? {
              id: offer.id,
              propertyCoreId: offer.propertyCoreId,
              transaction: "rent",
              rentalPrice: { ...offer.rentalPrice },
              rentalPeriodId: offer.rentalPeriodId,
            }
          : {
              id: offer.id,
              propertyCoreId: offer.propertyCoreId,
              transaction: "sale",
              salePrice: { ...offer.salePrice },
            },
      typeDetails: {
        propertyType: source.core.propertyType,
        ...details,
      } as Property["typeDetails"],
      ...(projected.areaSquareMeters === undefined
        ? {}
        : {
            areaSquareMeters: projected.areaSquareMeters,
            areaUnit: "square_meter",
          }),
      ...(projected.nearbyServices === undefined
        ? {}
        : { nearbyServices: [...projected.nearbyServices] }),
    },
  };
}
