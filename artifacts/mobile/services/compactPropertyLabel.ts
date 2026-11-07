import type { Property } from "@workspace/property-domain";
import {
  getSavedPropertyClassificationFacts,
  getSavedPropertyTypeLabel,
} from "./savedPropertyClassification";
/** A compact list heading always identifies the property; free-form titles stay in its details. */
export function compactPropertyLabel(
  property: Property,
  language: "ar" | "en",
  baseTypeLabel: string,
): string {
  const facts = getSavedPropertyClassificationFacts(property);
  const details = property.typeDetails as unknown as
    Record<string, unknown> | undefined;
  const subtype = facts.apartmentSubtype;
  if (
    property.core.propertyType === "apartment" &&
    subtype !== "studio" &&
    subtype !== "duplex"
  ) {
    const count = details?.bedroomCount;
    if (typeof count === "number" && Number.isInteger(count) && count > 0) {
      return language === "ar"
        ? count === 1
          ? "شقة غرفة واحدة"
          : count === 2
            ? "شقة غرفتين"
            : `شقة ${count} ${count <= 10 ? "غرف" : "غرفة"}`
        : `${count}-bedroom apartment`;
    }
    if (details?.occupancy === "family")
      return language === "ar" ? "شقة للعائلات" : "Family apartment";
    return language === "ar" ? "شقة" : "Apartment";
  }
  if (
    property.core.propertyType === "whole_building" &&
    Array.isArray(details?.housingTypes) &&
    details.housingTypes.length === 1 &&
    details.housingTypes[0] === "company_staff"
  )
    return language === "ar" ? "عمارة شركات" : "Staff residential building";
  return getSavedPropertyTypeLabel(property, language, baseTypeLabel);
}
