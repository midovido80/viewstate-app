import type {
  Property,
  PropertyDraft,
  TypeDetails,
  ValidationIssue,
  ValidationResult,
} from "./types.ts";
import { invalid, issue, validateProperty } from "./validation.ts";

export function updatePropertyDraft(
  draft: PropertyDraft,
  changes: Partial<PropertyDraft>,
): PropertyDraft {
  return { ...draft, ...changes };
}

export function projectDraftToProperty(
  draft: PropertyDraft,
): ValidationResult<Property> {
  const issues: ValidationIssue[] = [];

  if (draft.propertyCoreId === undefined) {
    issues.push(issue("required", ["propertyCoreId"], "Property Core identity is required."));
  }
  if (draft.offerId === undefined) {
    issues.push(issue("required", ["offerId"], "Offer identity is required."));
  }
  if (draft.propertyType === undefined) {
    issues.push(issue("required", ["propertyType"], "Property type is required."));
  }
  if (draft.locationAreaId === undefined) {
    issues.push(issue("required", ["locationAreaId"], "Location Area is required."));
  }
  if (draft.transaction === undefined) {
    issues.push(issue("required", ["transaction"], "Transaction is required."));
  }

  if (draft.transaction === "sale" && draft.salePrice === undefined) {
    issues.push(issue("missing_sale_price", ["salePrice"], "Sale price is required."));
  }
  if (draft.transaction === "rent" && draft.rentalPrice === undefined) {
    issues.push(issue("missing_rental_price", ["rentalPrice"], "Rental price is required."));
  }
  if (draft.transaction === "rent" && draft.rentalPeriodId === undefined) {
    issues.push(issue("missing_rental_period", ["rentalPeriodId"], "Rental period is required."));
  }

  if (
    issues.length > 0 ||
    draft.propertyCoreId === undefined ||
    draft.offerId === undefined ||
    draft.propertyType === undefined ||
    draft.locationAreaId === undefined ||
    draft.transaction === undefined
  ) {
    return invalid(issues);
  }

  const core = {
    id: draft.propertyCoreId,
    propertyType: draft.propertyType,
    locationArea: { id: draft.locationAreaId },
    ...(draft.description === undefined ? {} : { description: draft.description }),
    ...(draft.privateNotes === undefined ? {} : { privateNotes: draft.privateNotes }),
    ...(draft.ownerSource === undefined ? {} : { ownerSource: draft.ownerSource }),
    ...(draft.exactLocation === undefined ? {} : { exactLocation: draft.exactLocation }),
  };

  const activeOffer =
    draft.transaction === "sale"
      ? {
          id: draft.offerId,
          propertyCoreId: draft.propertyCoreId,
          transaction: "sale" as const,
          salePrice: draft.salePrice!,
        }
      : {
          id: draft.offerId,
          propertyCoreId: draft.propertyCoreId,
          transaction: "rent" as const,
          rentalPrice: draft.rentalPrice!,
          rentalPeriodId: draft.rentalPeriodId!,
        };

  let typeDetails: TypeDetails | undefined;
  if (draft.propertyType === "apartment" && draft.apartmentSubtype !== undefined) {
    typeDetails = {
      propertyType: "apartment",
      apartmentSubtype: draft.apartmentSubtype,
    };
  } else if (draft.propertyType === "other_built_property") {
    if (draft.otherBuiltPropertyClarification !== undefined) {
      typeDetails = {
        propertyType: "other_built_property",
        clarification: draft.otherBuiltPropertyClarification,
      };
    }
  }

  const property: Property = {
    core,
    activeOffer,
    ...(typeDetails === undefined ? {} : { typeDetails }),
  };

  return validateProperty(property);
}