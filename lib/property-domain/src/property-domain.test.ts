import {
  APARTMENT_SUBTYPES,
  PROPERTY_TYPES,
  createLiteralText,
  createPriceValue,
  createPrivacyMetadata,
  isPropertyType,
  projectDraftToProperty,
  updatePropertyDraft,
  validateOffer,
  validateProperty,
  validatePropertyCore,
} from "./index.ts";
import type {
  ClassifiedLiteralText,
  Offer,
  Property,
  PropertyCore,
  PropertyDraft,
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