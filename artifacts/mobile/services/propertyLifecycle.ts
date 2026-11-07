import type { Property } from "@workspace/property-domain";
import { validateProperty } from "@workspace/property-domain";
import type { PropertyStore } from "./persistence";
import { assertNoPendingPropertyEvidence } from "./propertyDeletion";
import type { RecoveryStorage } from "./propertySaveRecovery";
import type { UpdateStorage } from "./propertyUpdateRecovery";

export type ListingStatus = "active" | "paused" | "rented" | "sold";
export function listingStatus(property: Property): ListingStatus {
  if (
    property.marketingStatus === "paused" ||
    property.marketingStatus === "sold"
  )
    return property.marketingStatus;
  return property.activeOffer.transaction === "rent" &&
    property.rentalAvailability === "rented"
    ? "rented"
    : "active";
}
export function withListingStatus(
  property: Property,
  status: ListingStatus,
): Property {
  if (
    (status === "sold" && property.activeOffer.transaction !== "sale") ||
    (status === "rented" && property.activeOffer.transaction !== "rent")
  )
    throw new Error("INVALID_LISTING_STATUS");
  const next = {
    ...property,
    marketingStatus:
      status === "paused" || status === "sold" ? status : "active",
    ...(property.activeOffer.transaction === "rent"
      ? { rentalAvailability: status === "rented" ? "rented" : "available" }
      : {}),
  } as Property;
  if (!validateProperty(next).ok) throw new Error("INVALID_LISTING_STATUS");
  return next;
}
export async function changeListingStatus(options: {
  expected: Property;
  status: ListingStatus;
  store: PropertyStore;
  storage: RecoveryStorage & UpdateStorage;
}): Promise<Property> {
  await assertNoPendingPropertyEvidence(
    new Set([options.expected.core.id]),
    options.storage,
  );
  const next = withListingStatus(options.expected, options.status);
  if (!(await options.store.compareAndUpdate(options.expected, next)))
    throw new Error("LISTING_CHANGED");
  return next;
}
