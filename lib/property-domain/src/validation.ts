import {
  isApartmentSubtype,
  isPropertyType,
  isTransaction,
} from "./taxonomy.ts";
import type {
  ClassifiedLiteralText,
  Offer,
  PriceValue,
  PrivacyClassification,
  Property,
  PropertyCore,
  TypeDetails,
  ValidationIssue,
  ValidationResult,
} from "./types.ts";

export function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function invalid<T>(
  issues: readonly ValidationIssue[],
): ValidationResult<T> {
  return { ok: false, issues };
}

export function issue(
  code: ValidationIssue["code"],
  path: readonly string[],
  message: string,
): ValidationIssue {
  return { code, path, message };
}

export function validateRequiredIdentifier(
  value: unknown,
  path: readonly string[],
): readonly ValidationIssue[] {
  if (typeof value !== "string" || value.length === 0) {
    return [issue("invalid_identifier", path, "A non-empty identifier is required.")];
  }

  if (value.trim().length === 0) {
    return [issue("whitespace_only", path, "Whitespace-only text is not valid.")];
  }

  return [];
}

export function validateLiteralText(
  text: ClassifiedLiteralText | undefined,
  path: readonly string[],
): readonly ValidationIssue[] {
  if (text === undefined || text.value.length > 0 && text.value.trim().length > 0) {
    return [];
  }

  return [issue("whitespace_only", [...path, "value"], "Whitespace-only text is not valid.")];
}

export function validateClassifiedLiteralText(
  text: ClassifiedLiteralText | undefined,
  path: readonly string[],
  expectedClassification: PrivacyClassification,
  shareableProjectionEligible: boolean | undefined,
): readonly ValidationIssue[] {
  const issues = [...validateLiteralText(text, path)];
  if (text === undefined) return issues;

  if (text.privacy.classification !== expectedClassification) {
    issues.push(issue(
      "invalid_privacy_classification",
      [...path, "privacy", "classification"],
      `Expected ${expectedClassification} privacy classification.`,
    ));
  }

  if (
    shareableProjectionEligible !== undefined &&
    text.privacy.shareableProjectionEligible !== shareableProjectionEligible
  ) {
    issues.push(issue(
      "invalid_shareable_eligibility",
      [...path, "privacy", "shareableProjectionEligible"],
      `Shareable projection eligibility must be ${String(shareableProjectionEligible)}.`,
    ));
  }

  return issues;
}

export function validatePrice(
  price: PriceValue | undefined,
  path: readonly string[],
): readonly ValidationIssue[] {
  if (price === undefined) {
    return [issue("required", path, "A price is required.")];
  }

  const issues: ValidationIssue[] = [];
  if (!Number.isFinite(price.amount) || price.amount <= 0) {
    issues.push(issue("invalid_price", [...path, "amount"], "Price must be a positive finite number."));
  }
  issues.push(...validateRequiredIdentifier(price.currencyCode, [...path, "currencyCode"]).map(
    (item) => ({ ...item, code: "invalid_currency_code" as const }),
  ));
  return issues;
}

export function validatePropertyCore(
  core: PropertyCore,
): ValidationResult<PropertyCore> {
  const issues: ValidationIssue[] = [
    ...validateRequiredIdentifier(core.id, ["id"]),
    ...validateRequiredIdentifier(core.locationArea.id, ["locationArea", "id"]),
    ...validateClassifiedLiteralText(core.description, ["description"], "normal", undefined),
    ...validateClassifiedLiteralText(core.privateNotes, ["privateNotes"], "private_notes", false),
    ...validateClassifiedLiteralText(core.ownerSource, ["ownerSource"], "owner_source", false),
    ...validateClassifiedLiteralText(core.exactLocation, ["exactLocation"], "exact_location", false),
  ];

  if (!isPropertyType(core.propertyType)) {
    issues.push(issue("invalid_property_type", ["propertyType"], "Property type is not approved."));
  }

  return issues.length === 0 ? valid(core) : invalid(issues);
}

export function validateTypeDetails(
  details: TypeDetails,
  core: PropertyCore,
): ValidationResult<TypeDetails> {
  const issues: ValidationIssue[] = [];

  if (details.propertyType !== core.propertyType) {
    issues.push(issue("type_details_mismatch", ["typeDetails", "propertyType"], "Type details must match Property Core."));
  }

  if (details.propertyType === "apartment" && details.apartmentSubtype !== undefined && !isApartmentSubtype(details.apartmentSubtype)) {
    issues.push(issue("invalid_apartment_subtype", ["typeDetails", "apartmentSubtype"], "Apartment subtype is not approved."));
  }

  if (details.propertyType === "other_built_property") {
    issues.push(...validateClassifiedLiteralText(
      details.clarification,
      ["typeDetails", "clarification"],
      "normal",
      undefined,
    ));
  }

  return issues.length === 0 ? valid(details) : invalid(issues);
}

export function validateOffer(offer: Offer): ValidationResult<Offer> {
  const issues: ValidationIssue[] = [
    ...validateRequiredIdentifier(offer.id, ["id"]),
    ...validateRequiredIdentifier(offer.propertyCoreId, ["propertyCoreId"]),
  ];

  if ("purpose" in offer) {
    issues.push(issue(
      "legacy_purpose_not_allowed",
      ["purpose"],
      "Purpose is not a separate domain field; use transaction.",
    ));
  }

  if (!isTransaction(offer.transaction)) {
    issues.push(issue("invalid_transaction", ["transaction"], "Transaction must be sale or rent."));
  } else if (offer.transaction === "sale") {
    issues.push(...validatePrice(offer.salePrice, ["salePrice"]));
    if ("rentalPrice" in offer || "rentalPeriodId" in offer) {
      issues.push(issue("incompatible_rental_terms", [], "Sale offers cannot contain rental terms."));
    }
  } else {
    issues.push(...validatePrice(offer.rentalPrice, ["rentalPrice"]));
    issues.push(...validateRequiredIdentifier(offer.rentalPeriodId, ["rentalPeriodId"]).map(
      (item) => ({ ...item, code: "missing_rental_period" as const }),
    ));
    if ("salePrice" in offer) {
      issues.push(issue("incompatible_sale_terms", [], "Rent offers cannot contain sale terms."));
    }
  }

  return issues.length === 0 ? valid(offer) : invalid(issues);
}

export function validateProperty(
  property: Property,
): ValidationResult<Property> {
  const issues: ValidationIssue[] = [];
  const coreResult = validatePropertyCore(property.core);
  const offerResult = validateOffer(property.activeOffer);

  if (!coreResult.ok) issues.push(...coreResult.issues);
  if (!offerResult.ok) issues.push(...offerResult.issues);

  if (property.activeOffer.propertyCoreId !== property.core.id) {
    issues.push(issue("property_core_mismatch", ["activeOffer", "propertyCoreId"], "Offer must reference this Property Core."));
  }

  if (property.typeDetails !== undefined) {
    const detailsResult = validateTypeDetails(property.typeDetails, property.core);
    if (!detailsResult.ok) issues.push(...detailsResult.issues);
  }

  return issues.length === 0 ? valid(property) : invalid(issues);
}