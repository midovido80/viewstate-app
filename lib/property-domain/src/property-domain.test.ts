import {
  APARTMENT_SUBTYPES,
  FLOOR_USES,
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  PROPERTY_TYPES,
  buildPropertySharePreview,
  createLiteralText,
  createPriceValue,
  createPrivacyMetadata,
  isPropertyType,
  projectDraftToProperty,
  updatePropertyDraft,
  validateOffer,
  validateProperty,
  validatePropertyAttachments,
  validatePropertyCore,
  validateTypeDetails,
} from "./index.ts";
import type {
  ClassifiedLiteralText,
  Offer,
  Property,
  PropertyAttachmentMetadata,
  PropertyCore,
  PropertyDraft,
  TypeDetails,
} from "./index.ts";

type Test = {
  readonly name: string;
  readonly run: () => void;
};

const tests: Test[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function normalText(value: string): ClassifiedLiteralText {
  return createLiteralText(
    value,
    createPrivacyMetadata("normal", "normal"),
  );
}

function price(amount = 100): { readonly amount: number; readonly currencyCode: string } {
  const result = createPriceValue(amount, "KWD");
  assert(result.ok, "Expected valid price");
  return result.value;
}

function core(propertyType: PropertyCore["propertyType"] = "apartment"): PropertyCore {
  return {
    id: "property-1",
    propertyType,
    locationArea: { id: "area-1" },
  };
}

function property(activeOffer: Offer, propertyType: PropertyCore["propertyType"] = "apartment"): Property {
  return {
    core: core(propertyType),
    activeOffer,
  };
}

test("accepts every approved Property Type", () => {
  for (const propertyType of PROPERTY_TYPES) {
    assert(validatePropertyCore(core(propertyType)).ok, `Expected ${propertyType} to be valid`);
  }
});

test("rejects unknown Property Types", () => {
  assertEqual(isPropertyType("land"), false, "Land must not be an approved built Property Type");
});

test("accepts every approved Apartment subtype for Apartment", () => {
  for (const apartmentSubtype of APARTMENT_SUBTYPES) {
    const result = projectDraftToProperty({
      propertyCoreId: "property-1",
      offerId: "offer-1",
      propertyType: "apartment",
      apartmentSubtype,
      locationAreaId: "area-1",
      transaction: "sale",
      salePrice: price(),
    });
    assert(result.ok, `Expected ${apartmentSubtype} to be valid`);
  }
});

test("excludes Apartment subtype from non-Apartment final output", () => {
  const result = projectDraftToProperty({
    propertyCoreId: "property-1",
    offerId: "offer-1",
    propertyType: "office",
    apartmentSubtype: "duplex",
    locationAreaId: "area-1",
    transaction: "sale",
    salePrice: price(),
  });
  assert(result.ok, "Expected independent office to finalize");
  assertEqual(result.value.typeDetails, undefined, "Office must not receive Apartment details");
});

test("allows independently offered types without a parent", () => {
  const independentTypes = [
    "apartment",
    "floor",
    "office",
    "shop",
    "warehouse",
    "other_built_property",
  ] as const;
  for (const propertyType of independentTypes) {
    assert(validatePropertyCore(core(propertyType)).ok, `Expected independent ${propertyType}`);
  }
});

test("Sale Offer has exactly one transaction discriminant", () => {
  const offer = {
    id: "offer-1",
    propertyCoreId: "property-1",
    transaction: "sale",
    salePrice: price(),
  } as const;
  assert(validateOffer(offer).ok, "Expected valid sale offer");
  assertEqual("purpose" in offer, false, "Purpose must not exist");
});

test("rejects a separate legacy Purpose field", () => {
  const invalidOffer = {
    id: "offer-1",
    propertyCoreId: "property-1",
    transaction: "sale",
    purpose: "rent",
    salePrice: price(),
  } as unknown as Offer;
  assertEqual(validateOffer(invalidOffer).ok, false, "Purpose must be rejected even on unsafe input");
});

test("Sale requires Sale Price", () => {
  const invalidSale = {
    id: "offer-1",
    propertyCoreId: "property-1",
    transaction: "sale",
  } as unknown as Offer;
  assertEqual(validateOffer(invalidSale).ok, false, "Sale without price must fail");
});

test("Sale rejects Rental Price and Rental Period", () => {
  const invalidSale = {
    id: "offer-1",
    propertyCoreId: "property-1",
    transaction: "sale",
    salePrice: price(),
    rentalPrice: price(),
    rentalPeriodId: "monthly",
  } as unknown as Offer;
  assertEqual(validateOffer(invalidSale).ok, false, "Sale with rental terms must fail");
});

test("Rent requires Rental Price and Rental Period", () => {
  const missingPrice = {
    id: "offer-1",
    propertyCoreId: "property-1",
    transaction: "rent",
    rentalPeriodId: "monthly",
  } as unknown as Offer;
  const missingPeriod = {
    id: "offer-1",
    propertyCoreId: "property-1",
    transaction: "rent",
    rentalPrice: price(),
  } as unknown as Offer;
  assertEqual(validateOffer(missingPrice).ok, false, "Rent without price must fail");
  assertEqual(validateOffer(missingPeriod).ok, false, "Rent without period must fail");
});

test("Rent rejects Sale Price", () => {
  const invalidRent = {
    id: "offer-1",
    propertyCoreId: "property-1",
    transaction: "rent",
    rentalPrice: price(),
    rentalPeriodId: "monthly",
    salePrice: price(),
  } as unknown as Offer;
  assertEqual(validateOffer(invalidRent).ok, false, "Rent with sale price must fail");
});

test("BASIC finalization needs only Type, Transaction, Price, and Location Area", () => {
  const result = projectDraftToProperty({
    propertyCoreId: "property-1",
    offerId: "offer-1",
    propertyType: "shop",
    locationAreaId: "area-1",
    transaction: "rent",
    rentalPrice: price(),
    rentalPeriodId: "monthly",
  });
  assert(result.ok, "Four BASIC concepts must finalize without a fifth field");
});

test("Other Built Property clarification is optional", () => {
  const result = projectDraftToProperty({
    propertyCoreId: "property-1",
    offerId: "offer-1",
    propertyType: "other_built_property",
    locationAreaId: "area-1",
    transaction: "sale",
    salePrice: price(),
  });
  assert(result.ok, "Clarification must not become required");
  assertEqual(result.value.typeDetails, undefined, "BASIC Other must omit incomplete details");
});

test("Other Built Property clarification remains literal", () => {
  const literal = "  عقار Mixed-CASE!?  ";
  const result = projectDraftToProperty({
    propertyCoreId: "property-1",
    offerId: "offer-1",
    propertyType: "other_built_property",
    otherBuiltPropertyClarification: normalText(literal),
    locationAreaId: "area-1",
    transaction: "sale",
    salePrice: price(),
  });
  assert(result.ok, "Literal clarification must validate");
  assertEqual(
    result.value.typeDetails?.propertyType === "other_built_property"
      ? result.value.typeDetails.clarification?.value
      : undefined,
    literal,
    "Clarification must not be rewritten",
  );
});

test("Other Built Property clarification uses normal privacy classification", () => {
  const result = projectDraftToProperty({
    propertyCoreId: "property-1",
    offerId: "offer-1",
    propertyType: "other_built_property",
    otherBuiltPropertyClarification: createLiteralText(
      "private classification is incompatible here",
      createPrivacyMetadata("private_notes", "never"),
    ),
    locationAreaId: "area-1",
    transaction: "sale",
    salePrice: price(),
  });
  assertEqual(result.ok, false, "Clarification must use normal privacy classification");
});

test("supports discriminated enrichment details for all eleven Property Types", () => {
  const details: readonly TypeDetails[] = [
    { propertyType: "whole_building", builtUpAreaSquareMeters: 900, floorCount: 4, unitCount: 12 },
    { propertyType: "commercial_complex", shopCount: 8, officeCount: 3, unitCount: 12 },
    { propertyType: "apartment", apartmentSubtype: "duplex", bedroomCount: 3, floorNumber: 2 },
    { propertyType: "floor", floorUse: "residential", bedroomCount: 6, livingRoomCount: 2 },
    { propertyType: "house", bedroomCount: 4, floorCount: 2 },
    { propertyType: "villa", bedroomCount: 6, parkingSpaceCount: 3 },
    { propertyType: "office", bathroomCount: 2, floorNumber: 7 },
    { propertyType: "shop", builtUpAreaSquareMeters: 75, floorNumber: 0 },
    { propertyType: "warehouse", ceilingHeightMeters: 8, builtUpAreaSquareMeters: 1_200 },
    { propertyType: "chalet", bedroomCount: 5, bathroomCount: 4 },
    { propertyType: "other_built_property", clarification: normalText("Farm building") },
  ];

  assertEqual(details.length, PROPERTY_TYPES.length, "Every approved type needs a detail variant");
  for (const item of details) {
    assert(validateTypeDetails(item, core(item.propertyType)).ok, `Expected valid ${item.propertyType} details`);
  }
});

test("rejects enrichment counts that cannot be represented safely", () => {
  const result = validateTypeDetails({
    propertyType: "apartment",
    bedroomCount: Number.MAX_SAFE_INTEGER + 1,
  }, core("apartment"));
  assertEqual(result.ok, false, "Unsafe integer counts must fail without adding a business maximum");
});

test("uses one canonical detail field applicability definition", () => {
  assert(
    PROPERTY_DETAIL_FIELD_DEFINITIONS.some(
      (definition) => definition.field === "builtUpAreaSquareMeters" &&
        definition.appliesTo.length === PROPERTY_TYPES.length,
    ),
    "Built-up area must apply to all Property Types",
  );
  assertEqual(FLOOR_USES.length, 2, "Floor has exactly the Residential and Commercial uses");
});

test("PACI Numbers Count is a non-negative integer only for Commercial Floor", () => {
  const commercial = {
    propertyType: "floor",
    floorUse: "commercial",
    paciNumbersCount: 0,
  } as const;
  assert(
    validateTypeDetails(commercial, core("floor")).ok,
    "Commercial Floor PACI Numbers Count must accept zero",
  );
  for (const invalidValue of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assertEqual(
      validateTypeDetails({ ...commercial, paciNumbersCount: invalidValue }, core("floor")).ok,
      false,
      "PACI Numbers Count must be a safe non-negative integer",
    );
  }
  assertEqual(
    validateTypeDetails({ ...commercial, floorUse: "residential" } as unknown as TypeDetails, core("floor")).ok,
    false,
    "Residential Floor must reject PACI Numbers Count",
  );
  assertEqual(
    validateTypeDetails({ propertyType: "office", paciNumbersCount: 1 } as unknown as TypeDetails, core("office")).ok,
    false,
    "Unrelated Property types must reject PACI Numbers Count",
  );
});

test("requires a use before nonempty Floor enrichment can finalize", () => {
  const missingUse = {
    propertyType: "floor",
    builtUpAreaSquareMeters: 300,
  } as unknown as TypeDetails;
  assertEqual(
    validateTypeDetails(missingUse, core("floor")).ok,
    false,
    "Nonempty Floor enrichment requires a use",
  );
  assert(
    validateTypeDetails({ propertyType: "floor" }, core("floor")).ok,
    "An empty legacy Floor detail shell remains valid",
  );
});

test("rejects fields incompatible with the selected Floor use", () => {
  const incompatible = {
    propertyType: "floor",
    floorUse: "commercial",
    bedroomCount: 3,
  } as unknown as TypeDetails;
  assertEqual(
    validateTypeDetails(incompatible, core("floor")).ok,
    false,
    "Commercial Floor cannot contain residential fields",
  );
});

test("requires nonblank literal clarification only when Other details exist", () => {
  const missing = { propertyType: "other_built_property" } as unknown as TypeDetails;
  const blank = {
    propertyType: "other_built_property",
    clarification: normalText(" \t "),
  } as TypeDetails;
  assertEqual(validateTypeDetails(missing, core("other_built_property")).ok, false, "Other detail shell needs clarification");
  assertEqual(validateTypeDetails(blank, core("other_built_property")).ok, false, "Other clarification cannot be blank");
  assert(
    validateProperty(property({
      id: "offer-1",
      propertyCoreId: "property-1",
      transaction: "sale",
      salePrice: price(),
    }, "other_built_property")).ok,
    "BASIC Other without typeDetails stays valid",
  );
});

test("validates private location enrichment without changing BASIC Area", () => {
  const candidate: Property = {
    ...property({
      id: "offer-1",
      propertyCoreId: "property-1",
      transaction: "sale",
      salePrice: price(),
    }),
    locationEnrichment: {
      paciNumber: createLiteralText("12345678", createPrivacyMetadata("exact_location", "explicit_per_share")),
      coordinates: {
        latitude: 29.3759,
        longitude: 47.9774,
        privacy: createPrivacyMetadata("exact_location", "explicit_per_share"),
      },
    },
  };
  const result = validateProperty(candidate);
  assert(result.ok, "Correctly classified private location enrichment must validate");
  assertEqual(result.value.core.locationArea.id, "area-1", "Enrichment must preserve BASIC Area");
});

test("attachment metadata has stable identity, order, normal privacy, and one image cover", () => {
  const attachment = (
    id: string,
    kind: PropertyAttachmentMetadata["kind"],
    isCover = false,
  ): PropertyAttachmentMetadata => ({
    id,
    kind,
    originalName: `${id}.jpg`,
    mimeType: kind === "image" ? "image/jpeg" : "application/pdf",
    order: 0,
    managedUri: `file:///managed/${id}`,
    ...(isCover ? { isCover: true } : {}),
    privacy: createPrivacyMetadata("normal", "normal"),
  });
  assert(validatePropertyAttachments([attachment("a-1", "image", true)]).ok, "One image cover is valid");
  assertEqual(
    validatePropertyAttachments([
      attachment("a-1", "image", true),
      attachment("a-2", "image", true),
    ]).ok,
    false,
    "More than one cover must fail",
  );
});

test("Draft retains hidden values across type and transaction changes", () => {
  const initial: PropertyDraft = {
    propertyType: "apartment",
    apartmentSubtype: "duplex",
    transaction: "rent",
    rentalPrice: price(200),
    rentalPeriodId: "monthly",
  };
  const changed = updatePropertyDraft(initial, {
    propertyType: "office",
    transaction: "sale",
    salePrice: price(300),
  });
  assertEqual(changed.apartmentSubtype, "duplex", "Hidden subtype must remain recoverable");
  assertEqual(changed.rentalPeriodId, "monthly", "Hidden rental period must remain recoverable");
});

test("Draft projection excludes incompatible hidden commercial values", () => {
  const result = projectDraftToProperty({
    propertyCoreId: "property-1",
    offerId: "offer-1",
    propertyType: "office",
    locationAreaId: "area-1",
    transaction: "sale",
    salePrice: price(300),
    rentalPrice: price(200),
    rentalPeriodId: "monthly",
  });
  assert(result.ok, "Sale projection must ignore recoverable rent values");
  assertEqual("rentalPrice" in result.value.activeOffer, false, "Rent price must not enter sale output");
  assertEqual("rentalPeriodId" in result.value.activeOffer, false, "Rent period must not enter sale output");
});

test("preserves Arabic, English, mixed text, punctuation, casing, and whitespace", () => {
  const literal = "  شقة ABC — Test!?  ";
  const result = validatePropertyCore({
    ...core(),
    description: normalText(literal),
  });
  assert(result.ok, "Mixed literal text must validate");
  assertEqual(result.value.description?.value, literal, "Literal text must be unchanged");
});

test("whitespace-only validation does not mutate original text", () => {
  const literal = " \t ";
  const candidate = {
    ...core(),
    description: normalText(literal),
  };
  const result = validatePropertyCore(candidate);
  assertEqual(result.ok, false, "Whitespace-only text must be detected");
  assertEqual(candidate.description.value, literal, "Validation must not mutate text");
});

test("enforces exact privacy disclosure policies", () => {
  const normalDescription = validatePropertyCore({
    ...core(),
    description: createLiteralText(
      "normal",
      createPrivacyMetadata("normal", "normal"),
    ),
  });
  const wrongClassification = validatePropertyCore({
    ...core(),
    privateNotes: normalText("private"),
  });
  const validSensitiveFields = validatePropertyCore({
    ...core(),
    privateNotes: createLiteralText(
      "private",
      createPrivacyMetadata("private_notes", "never"),
    ),
    ownerSource: createLiteralText(
      "owner",
      createPrivacyMetadata("owner_source", "explicit_per_share"),
    ),
    exactLocation: createLiteralText(
      "exact",
      createPrivacyMetadata("exact_location", "explicit_per_share"),
    ),
  });
  const invalidPolicies = [
    validatePropertyCore({
      ...core(),
      privateNotes: createLiteralText(
        "private",
        createPrivacyMetadata("private_notes", "normal"),
      ),
    }),
    validatePropertyCore({
      ...core(),
      privateNotes: createLiteralText(
        "private",
        createPrivacyMetadata("private_notes", "explicit_per_share"),
      ),
    }),
    validatePropertyCore({
      ...core(),
      ownerSource: createLiteralText(
        "owner",
        createPrivacyMetadata("owner_source", "normal"),
      ),
    }),
    validatePropertyCore({
      ...core(),
      ownerSource: createLiteralText(
        "owner",
        createPrivacyMetadata("owner_source", "never"),
      ),
    }),
    validatePropertyCore({
      ...core(),
      exactLocation: createLiteralText(
        "exact",
        createPrivacyMetadata("exact_location", "normal"),
      ),
    }),
    validatePropertyCore({
      ...core(),
      exactLocation: createLiteralText(
        "exact",
        createPrivacyMetadata("exact_location", "never"),
      ),
    }),
  ];
  assert(normalDescription.ok, "Normal description with normal policy must validate");
  assertEqual(wrongClassification.ok, false, "Private Notes must use private_notes classification");
  assert(validSensitiveFields.ok, "Correct sensitive metadata must validate");
  for (const result of invalidPolicies) {
    assertEqual(result.ok, false, "Invalid classification-to-policy mapping must fail");
  }
});

test("final aggregate requires matching Property Core and Offer identities", () => {
  const result = validateProperty(property({
    id: "offer-1",
    propertyCoreId: "different-property",
    transaction: "sale",
    salePrice: price(),
  }));
  assertEqual(result.ok, false, "Mismatched identities must fail");
});

test("share preview uses supplied localized BASIC labels and monthly rent wording", () => {
  const preview = buildPropertySharePreview({
    property: {
      core: {
        id: "property-1",
        propertyType: "apartment",
        locationArea: { id: "area-salmiya" },
      },
      activeOffer: {
        id: "offer-1",
        propertyCoreId: "property-1",
        transaction: "rent",
        rentalPrice: price(1_250),
        rentalPeriodId: "monthly",
      },
    },
    selection: {
      normalFields: ["property_type", "transaction", "price", "area"],
      attachmentIds: [],
      discloseOwnerSource: false,
      discloseExactLocation: false,
      disclosePaci: false,
      discloseManualLocation: false,
      discloseMapsLink: false,
      personContactIds: [],
    },
    availableAttachments: [],
    labels: {
      propertyType: "Tipo",
      transaction: "Operación",
      price: "Precio",
      area: "Zona",
    },
    normalValueLabels: {
      apartment: "Apartamento",
      rent: "Alquiler",
      "area-salmiya": "Salmiya",
    },
    formattedPrice: "1.250 KWD",
    rentalCadence: "al mes",
    attribution: "Publicado por Casa",
  });

  assertEqual(
    preview.text,
    "🏠 Tipo: \u2068Apartamento\u2069\n↔ Operación: \u2068Alquiler\u2069\n💰 Precio: \u20681.250 KWD al mes\u2069\n📍 Zona: \u2068Salmiya\u2069\n\nPublicado por Casa",
    "Localized preview text must be exact and must not expose stored enum values",
  );
});

test("share preview fail-closes exact locations and maps while never exposing private notes", () => {
  const sharedProperty: Property = {
    core: {
      id: "property-1",
      propertyType: "apartment",
      locationArea: { id: "area-1" },
      privateNotes: createLiteralText(
        "PRIVATE-NOTES-SECRET",
        createPrivacyMetadata("private_notes", "never"),
      ),
      exactLocation: createLiteralText(
        "EXACT-LOCATION-SECRET",
        createPrivacyMetadata("exact_location", "explicit_per_share"),
      ),
    },
    activeOffer: {
      id: "offer-1",
      propertyCoreId: "property-1",
      transaction: "sale",
      salePrice: price(),
    },
  };
  const baseSelection = {
    normalFields: ["property_type"] as const,
    attachmentIds: [],
    discloseOwnerSource: false,
    discloseExactLocation: false,
    disclosePaci: false,
    discloseManualLocation: false,
    discloseMapsLink: false,
    personContactIds: [],
  };
  const privateLocation = { mapsLink: "https://maps.example/EXACT-MAPS-SECRET" };
  const hiddenPreview = buildPropertySharePreview({
    property: sharedProperty,
    selection: baseSelection,
    availableAttachments: [],
    privateLocation,
    rentalCadence: "al mes",
    attribution: "",
  });
  assertEqual(hiddenPreview.text, "🏠 Property type: \u2068apartment\u2069", "Unselected private values must be absent");
  assertEqual(
    hiddenPreview.text.includes("SECRET"),
    false,
    "Private notes, exact location, and maps link must fail closed",
  );

  const explicitPreview = buildPropertySharePreview({
    property: sharedProperty,
    selection: {
      ...baseSelection,
      discloseExactLocation: true,
      discloseMapsLink: true,
    },
    availableAttachments: [],
    privateLocation,
    labels: {
      exactLocation: "Ubicación exacta",
      mapsLink: "Mapa",
    },
    rentalCadence: "al mes",
    attribution: "",
  });
  assertEqual(
    explicitPreview.text,
    "🏠 Property type: \u2068apartment\u2069\n📍 Ubicación exacta: \u2068EXACT-LOCATION-SECRET\u2069\n🗺 Mapa: \u2068https://maps.example/EXACT-MAPS-SECRET\u2069",
    "Only explicit exact-location and maps selections may add their deterministic lines",
  );
  assertEqual(
    explicitPreview.text.includes("PRIVATE-NOTES-SECRET"),
    false,
    "Private notes must never enter the preview, even with other disclosures",
  );
});

const failures: string[] = [];
for (const current of tests) {
  try {
    current.run();
  } catch (error) {
    failures.push(`${current.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  throw new Error(`${failures.length} of ${tests.length} tests failed:\n${failures.join("\n")}`);
}