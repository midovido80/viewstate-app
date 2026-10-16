import {
  isApartmentSubtype,
  isFloorUse,
  isFurnishing,
  isPropertyType,
  isTransaction,
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
} from "./taxonomy.ts";
import { PROPERTY_SOURCE_ROLES } from "./types.ts";
import type {
  ClassifiedLiteralText,
  LocationEnrichmentMetadata,
  Offer,
  PriceValue,
  PrivacyClassification,
  Property,
  PropertyAttachmentMetadata,
  PropertyCore,
  PropertySource,
  PropertyDemoCaptureMetadata,
  ShareDisclosurePolicy,
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
  expectedDisclosurePolicy: ShareDisclosurePolicy,
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

  if (text.privacy.disclosurePolicy !== expectedDisclosurePolicy) {
    issues.push(issue(
      "invalid_disclosure_policy",
      [...path, "privacy", "disclosurePolicy"],
      `Disclosure policy must be ${expectedDisclosurePolicy}.`,
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
    ...validateClassifiedLiteralText(core.description, ["description"], "normal", "normal"),
    ...validateClassifiedLiteralText(core.privateNotes, ["privateNotes"], "private_notes", "never"),
    ...validateClassifiedLiteralText(core.ownerSource, ["ownerSource"], "owner_source", "explicit_per_share"),
    ...validateClassifiedLiteralText(core.exactLocation, ["exactLocation"], "exact_location", "explicit_per_share"),
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

  const candidate = details as TypeDetails & Record<string, unknown>;
  if (details.propertyType === "apartment") {
    if (candidate.studioRoomCount !== undefined
      && (details.apartmentSubtype !== "studio" || candidate.studioRoomCount !== 1)) {
      issues.push(issue(
        "incompatible_detail_field",
        ["typeDetails", "studioRoomCount"],
        "Studio room count is fixed at one and is valid only for a Studio apartment.",
      ));
    }
    for (const field of ["hasKitchen", "hasHall", "hasParking"] as const) {
      if (candidate[field] !== undefined && details.apartmentSubtype !== "studio") {
        issues.push(issue(
          "incompatible_detail_field",
          ["typeDetails", field],
          `${field} is supported only for a Studio apartment.`,
        ));
      }
    }
  }
  if (candidate.occupancy !== undefined && !["family", "bachelor", "any"].includes(candidate.occupancy as string)) {
    issues.push(issue("invalid_physical_value", ["typeDetails", "occupancy"], "Occupancy must be family, bachelor, or any."));
  }
  if (candidate.propertyUse !== undefined && !isFloorUse(candidate.propertyUse)) {
    issues.push(issue("invalid_physical_value", ["typeDetails", "propertyUse"], "Property use must be residential or commercial."));
  }
  if (details.propertyType === "apartment" && details.apartmentSubtype === "studio" && candidate.masterBedroomCount !== undefined) {
    issues.push(issue("incompatible_detail_field", ["typeDetails", "masterBedroomCount"], "Master bedrooms are not applicable to a Studio."));
  }
  if (typeof candidate.masterBedroomCount === "number" && typeof candidate.bedroomCount === "number"
    && candidate.masterBedroomCount > candidate.bedroomCount) {
    issues.push(issue("invalid_physical_value", ["typeDetails", "masterBedroomCount"], "Master bedrooms cannot exceed total bedrooms."));
  }
  if (candidate.furnishing !== undefined && !isFurnishing(candidate.furnishing)) {
    issues.push(issue("invalid_furnishing", ["typeDetails", "furnishing"], "Furnishing must be unfurnished, semi_furnished, or furnished."));
  }

  if (details.propertyType === "floor") {
    const enrichmentKeys = Object.keys(candidate).filter((key) => key !== "propertyType");
    if (enrichmentKeys.length > 0 && !isFloorUse(candidate.floorUse)) {
      issues.push(issue("invalid_floor_use", ["typeDetails", "floorUse"], "Enriched Floor details require Residential or Commercial use."));
    }
  }

  if (details.propertyType === "other_built_property") {
    if (details.clarification === undefined) {
      issues.push(issue("required", ["typeDetails", "clarification"], "Other Built Property details require a clarification."));
    }
    issues.push(...validateClassifiedLiteralText(
      details.clarification,
      ["typeDetails", "clarification"],
      "normal",
      "normal",
    ));
  }

  for (const definition of PROPERTY_DETAIL_FIELD_DEFINITIONS) {
    const value = candidate[definition.field];
    if (value === undefined) continue;

    if (!(definition.appliesTo as readonly string[]).includes(details.propertyType)) {
      issues.push(issue(
        "incompatible_detail_field",
        ["typeDetails", definition.field],
        `${definition.field} is not compatible with ${details.propertyType}.`,
      ));
      continue;
    }

    if (details.propertyType === "other_built_property" && definition.propertyUses
      && !definition.propertyUses.includes(candidate.propertyUse as "residential" | "commercial")) {
      issues.push(issue("incompatible_detail_field", ["typeDetails", definition.field], "This field requires residential Property use."));
    }
    if (
      details.propertyType === "floor" &&
      definition.floorUses !== undefined &&
      (!isFloorUse(candidate.floorUse) ||
        !(definition.floorUses as readonly string[]).includes(candidate.floorUse))
    ) {
      issues.push(issue(
        "incompatible_detail_field",
        ["typeDetails", definition.field],
        `${definition.field} is not compatible with this Floor use.`,
      ));
    }
  }

  const positiveFields = [
    "plotAreaSquareMeters",
    "builtUpAreaSquareMeters",
    "frontageWidthMeters",
    "ceilingHeightMeters",
  ] as const;
  const commercialChoices = {
    buildingAgeBand: ["1_5", "6_12", "over_12"],
    streetPosition: ["one_street", "two_streets", "corner", "front_back"],
    rentalOccupancy: ["vacant", "fully_rented", "partially_rented"],
  };
  for (const [field, options] of Object.entries(commercialChoices)) {
    if (candidate[field] !== undefined && !options.includes(candidate[field] as string)) {
      issues.push(issue("invalid_physical_value", ["typeDetails", field], "Invalid commercial choice."));
    }
  }
  if (candidate.parkingTypes !== undefined && (!Array.isArray(candidate.parkingTypes)
    || candidate.parkingTypes.some(value => !["private", "public", "paid"].includes(value))
    || new Set(candidate.parkingTypes).size !== candidate.parkingTypes.length)) {
    issues.push(issue("invalid_physical_value", ["typeDetails", "parkingTypes"], "Invalid parking types."));
  }
  if (candidate.privateParkingCount !== undefined && (!Array.isArray(candidate.parkingTypes) || !candidate.parkingTypes.includes("private"))) {
    issues.push(issue("incompatible_detail_field", ["typeDetails", "privateParkingCount"], "Private parking count requires private parking."));
  }
  if (candidate.monthlyIncome !== undefined && (typeof candidate.monthlyIncome !== "number" || !Number.isFinite(candidate.monthlyIncome) || candidate.monthlyIncome < 0)) {
    issues.push(issue("invalid_physical_value", ["typeDetails", "monthlyIncome"], "Monthly income must be a non-negative finite amount."));
  }
  for (const field of positiveFields) {
    const value = candidate[field];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
      issues.push(issue("invalid_physical_value", ["typeDetails", field], `${field} must be a positive finite number.`));
    }
  }

  const countFields = [
    "privateParkingCount",
    "bathroomCount",
    "parkingSpaceCount",
    "floorCount",
    "unitCount",
    "roomsPerUnit",
    "bathroomsPerUnit",
    "apartmentCount",
    "shopCount",
    "officeCount",
    "elevatorCount",
    "bedroomCount",
    "masterBedroomCount",
    "studioRoomCount",
    "livingRoomCount",
    "floorNumber",
    "loadingBayCount",
  ] as const;
  if (details.propertyType === "commercial_complex" && candidate.floorCount !== undefined && (typeof candidate.floorCount !== "number" || candidate.floorCount < 1)) {
    issues.push(issue("invalid_physical_value", ["typeDetails", "floorCount"], "A commercial complex must have at least one floor."));
  }
  for (const field of countFields) {
    const value = candidate[field];
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    ) {
      issues.push(issue("invalid_physical_value", ["typeDetails", field], `${field} must be a non-negative integer.`));
    }
  }

  for (const field of [
    "hasBasement",
    "hasMortgage",
    "hasMaidRoom",
    "hasHeating",
    "hasBalcony",
    "hasLaundryRoom",
    "hasSolarHeater",
    "hasElevator",
    "hasGarden",
    "hasSecurityGuard",
    "hasBBQArea",
    "hasPool",
    "hasWaterfront",
    "hasColdStorage",
    "hasCentralAC",
    "hasKitchen",
    "hasHall",
    "hasParking",
  ] as const) {
    const value = candidate[field];
    if (value !== undefined && typeof value !== "boolean") {
      issues.push(issue("invalid_physical_value", ["typeDetails", field], `${field} must be boolean.`));
    }
  }

  for (const field of ["intendedUse", "commercialActivity"] as const) {
    if (candidate[field] !== undefined) {
      issues.push(...validateClassifiedLiteralText(
        candidate[field] as ClassifiedLiteralText,
        ["typeDetails", field],
        "normal",
        "normal",
      ));
    }
  }

  const aggregateUnitFields = ["unitCount", "apartmentCount", "shopCount", "officeCount"] as const;
  const aggregateUnitCountsApplicable = aggregateUnitFields.every(field =>
    PROPERTY_DETAIL_FIELD_DEFINITIONS.find(definition => definition.field === field)
      ?.appliesTo.includes(details.propertyType) === true,
  );
  if (
    aggregateUnitCountsApplicable &&
    typeof candidate.unitCount === "number" &&
    ["apartmentCount", "shopCount", "officeCount"].reduce(
      (sum, field) => sum + (typeof candidate[field] === "number" ? candidate[field] as number : 0),
      0,
    ) > candidate.unitCount
  ) {
    issues.push(issue(
      "invalid_physical_value",
      ["typeDetails", "unitCount"],
      "Known apartment, shop, and office counts cannot exceed unitCount.",
    ));
  }

  return issues.length === 0 ? valid(details) : invalid(issues);
}

export function validateLocationEnrichment(
  enrichment: LocationEnrichmentMetadata,
): ValidationResult<LocationEnrichmentMetadata> {
  const issues: ValidationIssue[] = [
    ...validateClassifiedLiteralText(enrichment.paciNumber, ["locationEnrichment", "paciNumber"], "exact_location", "explicit_per_share"),
    ...validateClassifiedLiteralText(enrichment.manualLocationText, ["locationEnrichment", "manualLocationText"], "exact_location", "explicit_per_share"),
    ...validateClassifiedLiteralText(enrichment.mapsLink, ["locationEnrichment", "mapsLink"], "exact_location", "explicit_per_share"),
  ];

  if (enrichment.coordinates !== undefined) {
    const { latitude, longitude, privacy } = enrichment.coordinates;
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      issues.push(issue("invalid_coordinates", ["locationEnrichment", "coordinates"], "Coordinates must contain valid latitude and longitude."));
    }
    if (privacy.classification !== "exact_location") {
      issues.push(issue("invalid_privacy_classification", ["locationEnrichment", "coordinates", "privacy", "classification"], "Coordinates require exact_location privacy classification."));
    }
    if (privacy.disclosurePolicy !== "explicit_per_share") {
      issues.push(issue("invalid_disclosure_policy", ["locationEnrichment", "coordinates", "privacy", "disclosurePolicy"], "Coordinates require explicit_per_share disclosure."));
    }
  }

  return issues.length === 0 ? valid(enrichment) : invalid(issues);
}

export function validatePropertyAttachments(
  attachments: readonly PropertyAttachmentMetadata[],
): ValidationResult<readonly PropertyAttachmentMetadata[]> {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const orders = new Set<number>();
  let coverCount = 0;

  attachments.forEach((attachment, index) => {
    const path = ["attachments", String(index)];
    issues.push(...validateRequiredIdentifier(attachment.id, [...path, "id"]));
    issues.push(...validateRequiredIdentifier(attachment.originalName, [...path, "originalName"]));
    issues.push(...validateRequiredIdentifier(attachment.mimeType, [...path, "mimeType"]));
    issues.push(...validateRequiredIdentifier(attachment.managedUri, [...path, "managedUri"]));

    if (ids.has(attachment.id)) {
      issues.push(issue("invalid_attachment", [...path, "id"], "Attachment identities must be unique."));
    }
    ids.add(attachment.id);

    if (!["image", "video", "pdf"].includes(attachment.kind)) {
      issues.push(issue("invalid_attachment", [...path, "kind"], "Attachment kind must be image, video, or pdf."));
    }
    if (!Number.isInteger(attachment.order) || attachment.order < 0) {
      issues.push(issue("invalid_attachment", [...path, "order"], "Attachment order must be a non-negative integer."));
    } else if (orders.has(attachment.order)) {
      issues.push(issue("invalid_attachment", [...path, "order"], "Attachment order values must be unique."));
    }
    orders.add(attachment.order);
    const hasCompatibleMimeType =
      attachment.kind === "image"
        ? attachment.mimeType.startsWith("image/")
        : attachment.kind === "video"
          ? attachment.mimeType.startsWith("video/")
          : attachment.kind === "pdf"
            ? attachment.mimeType === "application/pdf"
            : false;
    if (!hasCompatibleMimeType) {
      issues.push(issue("invalid_attachment", [...path, "mimeType"], "MIME type must match the attachment kind."));
    }
    if (attachment.isCover === true) {
      coverCount += 1;
      if (attachment.kind !== "image") {
        issues.push(issue("invalid_attachment", [...path, "isCover"], "Only an image may be the Property cover."));
      }
    }
    if (attachment.privacy.classification !== "normal") {
      issues.push(issue("invalid_privacy_classification", [...path, "privacy", "classification"], "Attachments require normal privacy classification."));
    }
    if (attachment.privacy.disclosurePolicy !== "normal") {
      issues.push(issue("invalid_disclosure_policy", [...path, "privacy", "disclosurePolicy"], "Attachments require normal disclosure policy."));
    }
  });

  if (coverCount > 1) {
    issues.push(issue("invalid_attachment", ["attachments"], "At most one image may be the Property cover."));
  }

  return issues.length === 0 ? valid(attachments) : invalid(issues);
}

export function validatePropertySource(
  source: PropertySource,
): ValidationResult<PropertySource> {
  const issues = [
    ...validateRequiredIdentifier(source.propertyCoreId, ["propertyCoreId"]),
    ...validateRequiredIdentifier(source.personId, ["personId"]),
  ];
  if (!PROPERTY_SOURCE_ROLES.includes(source.role)) {
    issues.push(issue(
      "invalid_source_role",
      ["role"],
      "Property source role is not approved.",
    ));
  }
  return issues.length === 0 ? valid(source) : invalid(issues);
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
  const demoResult = validateDemoCapture(property.demoCapture);
  if (!demoResult.ok) issues.push(...demoResult.issues);
  if (property.areaSquareMeters !== undefined && (!Number.isFinite(property.areaSquareMeters) || property.areaSquareMeters < 0)) issues.push(issue("invalid_area", ["areaSquareMeters"], "Area must be finite and non-negative."));
  if (property.areaUnit !== undefined && property.areaUnit !== "square_meter" && property.areaUnit !== "square_foot") issues.push(issue("invalid_area_unit", ["areaUnit"], "Area unit is invalid."));

  if (!coreResult.ok) issues.push(...coreResult.issues);
  if (!offerResult.ok) issues.push(...offerResult.issues);

  if (property.activeOffer.propertyCoreId !== property.core.id) {
    issues.push(issue("property_core_mismatch", ["activeOffer", "propertyCoreId"], "Offer must reference this Property Core."));
  }

  if (property.typeDetails !== undefined) {
    const detailsResult = validateTypeDetails(property.typeDetails, property.core);
    if (!detailsResult.ok) issues.push(...detailsResult.issues);
  }

  if (property.locationEnrichment !== undefined) {
    const locationResult = validateLocationEnrichment(property.locationEnrichment);
    if (!locationResult.ok) issues.push(...locationResult.issues);
  }

  if (property.attachments !== undefined) {
    const attachmentResult = validatePropertyAttachments(property.attachments);
    if (!attachmentResult.ok) issues.push(...attachmentResult.issues);
  }

  return issues.length === 0 ? valid(property) : invalid(issues);
}

const CAPTURE_CATEGORY_IDS = new Set([
  "whole_building_corporate_rent", "whole_building_sale", "commercial_complex_sale",
  "family_apartment", "bachelor_apartment", "house", "villa", "chalet", "warehouse", "duplex",
]);

export function validateDemoCapture(value: PropertyDemoCaptureMetadata | undefined): ValidationResult<PropertyDemoCaptureMetadata | undefined> {
  if (value === undefined) return valid(undefined);
  const issues: ValidationIssue[] = [];
  if (!CAPTURE_CATEGORY_IDS.has(value.categoryId)) issues.push(issue("invalid_demo_category", ["demoCapture", "categoryId"], "Demo category is not approved."));
  if (value.areaSquareMeters !== undefined && (!Number.isFinite(value.areaSquareMeters) || value.areaSquareMeters < 0)) issues.push(issue("invalid_demo_area", ["demoCapture", "areaSquareMeters"], "Demo area must be finite and non-negative."));
  if (value.areaUnit !== undefined && value.areaUnit !== "square_meter" && value.areaUnit !== "square_foot") issues.push(issue("invalid_demo_area_unit", ["demoCapture", "areaUnit"], "Demo area unit is invalid."));
  for (const [name, values] of [["numericValues", value.numericValues], ["choices", value.choices]] as const) {
    if (!values) continue;
    for (const [key, entry] of Object.entries(values)) {
      if (!key || (name === "numericValues" ? typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 : typeof entry !== "string" || !entry)) issues.push(issue("invalid_demo_value", ["demoCapture", name, key], "Demo metadata value is invalid."));
    }
  }
  for (const [name, values] of [["selectedFeatures", value.selectedFeatures], ["nearbyServices", value.nearbyServices]] as const) {
    if (values && values.some(entry => typeof entry !== "string" || !entry)) issues.push(issue("invalid_demo_id", ["demoCapture", name], "Demo metadata identifier is invalid."));
  }
  return issues.length ? invalid(issues) : valid(value);
}
