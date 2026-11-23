import { sourceMatch, sourceDoesNotMatch, sourceIndex, sourcePattern } from "./sourceAssertions";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getRequirementPresentationFields } from "@/services/requirementFieldMap";
import {
  buildPersonRequirement,
  formValuesFromRequirement,
  toggleRequirementAmenity,
} from "@/services/personRequirementWorkflow";

test("Requirement correction has one canonical owner for duplicated meanings", async () => {
  const source = await readFile("app/requirement/[requirementId].tsx", "utf8");
  const map = await readFile("services/requirementFieldMap.ts", "utf8");
  sourceMatch(source, /preferredAreaMode/);
  sourceMatch(source, /requirement-all-kuwait/);
  sourceMatch(source, /requirement-master-bedrooms/);
  sourceMatch(source, /localizedRequirementIssue/);
  sourceMatch(source, /getAreaById/);
  sourceMatch(source, /preferredAmenityExclusions/);
  const services = await readFile("components/RequirementServiceRows.tsx", "utf8");
  sourceMatch(services, /Unwanted/);
  sourceDoesNotMatch(source, /غير مهم|Not important/);
  sourceMatch(source, /onExcludedChange/);
  sourceMatch(map, /'bedroomCount'/);
  sourceMatch(map, /'bathroomCount'/);
  sourceMatch(map, /'hasCentralAC'/);
  sourceMatch(map, /isRequirementCatalogFieldAllowed/);
});

test("Requirement catalog booleans never fall through to free text", async () => {
  const source = await readFile(
    "components/RequirementCatalogPreferences.tsx",
    "utf8",
  );
  sourceMatch(source, /field\.startsWith\(["']has["']\)/);
  sourceMatch(source, /kind: ["']feature["']/);
  sourceMatch(
    source,
    /const options = CHOICE_VALUES\[field\];\s*if \(!options\) return null;/,
  );
  const booleanBranch = source.slice(
    source.indexOf("if (definition.control ==="),
    source.indexOf("const options = CHOICE_VALUES[field]"),
  );
  sourceDoesNotMatch(booleanBranch, /<TextInput/);
});

test("Commercial Floor gates residential controls and exposes typed commercial choices", async () => {
  const [source, map] = await Promise.all([
    readFile("app/requirement/[requirementId].tsx", "utf8"),
    readFile("services/requirementFieldMap.ts", "utf8"),
  ]);
  sourceMatch(source, /coreApplicable &&/);
  sourceMatch(source, /requirement-driver-room/);
  sourceMatch(source, /floorUse === 'residential'/);
  sourceMatch(source, /applicableCoreFields\.has\('parkingSpaceCount'\)/);
  sourceMatch(source, /applicableCoreFields\.has\('floorNumber'\)/);
  sourceMatch(
    source,
    /applicableCoreFields\.has\('builtUpAreaSquareMeters'\)/,
  );
  sourceMatch(source, /<RequestReview requirement=\{result\.value\}/);
  sourceMatch(
    source,
    /coreApplicable && \(?\s*<RequirementServiceGroup title=\{label\('Property amenities', 'مرافق العقار'\)\}/,
  );
  sourceMatch(source, /Floor use/);
  sourceMatch(source, /localizedPreferenceName/);
  sourceMatch(source, /step === 1 && propertyType === 'floor' && !floorUse/);
  sourceMatch(source, /Choose Floor use: Residential or Commercial/);
  sourceMatch(map, /'intendedUse'/);
  sourceMatch(map, /'commercialActivity'/);
});

test("Apartment choices lead every applicable specification group without entering amenities", () => {
  for (const purpose of ["rent", "buy"] as const) {
    const fields = getRequirementPresentationFields("apartment");
    assert.deepEqual(
      fields.leading,
      ["apartmentSubtype", "furnishing"],
      purpose,
    );
    assert.equal(fields.specifications.includes("apartmentSubtype"), false);
    assert.equal(fields.amenities.includes("furnishing"), false);
    assert.equal(fields.amenities.includes("hasCentralAC"), false);
  }
  assert.deepEqual(
    getRequirementPresentationFields("floor", "residential").leading,
    ["furnishing"],
  );
  assert.deepEqual(
    getRequirementPresentationFields("floor", "commercial").leading,
    [],
  );
  assert.deepEqual(getRequirementPresentationFields("office").leading, []);
  assert.deepEqual(getRequirementPresentationFields("villa").leading, [
    "furnishing",
  ]);
  assert.ok(
    getRequirementPresentationFields("villa").amenities.includes("hasPool"),
  );
  assert.ok(
    getRequirementPresentationFields("warehouse").amenities.includes(
      "hasColdStorage",
    ),
  );
});

test("one canonical Central A/C, three-value Occupancy, and apartment choices survive edit", () => {
  for (const purpose of ["rent", "buy"] as const) {
    const result = buildPersonRequirement(
      "11111111-1111-4111-8111-111111111111",
      "seeker",
      {
        purpose,
        propertyType: "apartment",
        preferredAreaIds: ["salmiya"],
        preferredAreaMode: "specific_areas",
        minimumBudget: 300,
        maximumBudget: 600,
        currencyCode: "KWD",
        notes: "",
        centralAC: true,
        ...(purpose === "rent" ? { occupancy: "family" as const } : {}),
        catalogPreferences: [
          { field: "apartmentSubtype", kind: "choice", value: "duplex" },
          { field: "furnishing", kind: "choice", value: "furnished" },
        ],
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    const restored = formValuesFromRequirement(result.value);
    assert.equal(restored.centralAC, true);
    assert.equal(
      restored.catalogPreferences?.filter(
        (item) => item.field === "hasCentralAC",
      ).length ?? 0,
      0,
    );
    assert.deepEqual(
      restored.catalogPreferences?.map((item) => item.field),
      ["apartmentSubtype", "furnishing"],
    );
    assert.equal(restored.occupancy, purpose === "rent" ? "family" : undefined);
    const edit = buildPersonRequirement(
      result.value.id,
      result.value.seekerId,
      { ...restored, notes: "updated" },
    );
    assert.equal(edit.ok, true);
    if (edit.ok) assert.equal(edit.value.id, result.value.id);
  }
  for (const occupancy of ["family", "bachelor", "any"] as const) {
    const result = buildPersonRequirement(
      "11111111-1111-4111-8111-111111111111",
      "seeker",
      {
        purpose: "rent",
        propertyType: "apartment",
        preferredAreaIds: ["salmiya"],
        preferredAreaMode: "specific_areas",
        minimumBudget: 300,
        maximumBudget: 600,
        currencyCode: "KWD",
        notes: "",
        occupancy,
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        formValuesFromRequirement(result.value).occupancy,
        occupancy,
      );
      assert.equal(
        result.value.catalogPreferences?.some(
          (item) => String(item.field) === "occupancy",
        ) ?? false,
        false,
      );
    }
  }
  const excludedAC = buildPersonRequirement(
    "11111111-1111-4111-8111-111111111111",
    "seeker",
    {
      purpose: "rent",
      propertyType: "apartment",
      preferredAreaIds: ["salmiya"],
      preferredAreaMode: "specific_areas",
      minimumBudget: 300,
      maximumBudget: 600,
      currencyCode: "KWD",
      notes: "",
      centralAC: false,
    },
  );
  assert.equal(excludedAC.ok, true);
  if (excludedAC.ok) {
    const restored = formValuesFromRequirement(excludedAC.value);
    assert.equal(restored.centralAC, false);
    const edit = buildPersonRequirement(
      excludedAC.value.id,
      excludedAC.value.seekerId,
      restored,
    );
    assert.equal(edit.ok && edit.value.centralAC, false);
  }
});

test("Private roof is typed, localized, residential, and survives Requirement editing", async () => {
  const domain = await import("@workspace/property-domain");
  assert.ok(domain.RESIDENTIAL_AMENITIES.includes("private_roof"));
  assert.equal(domain.isResidentialAmenity("private_roof"), true);

  for (const [propertyType, floorUse] of [
    ["apartment", undefined],
    ["house", undefined],
    ["villa", undefined],
    ["chalet", undefined],
    ["floor", "residential"],
  ] as const) {
    const result = buildPersonRequirement(
      "11111111-1111-4111-8111-111111111111",
      "seeker",
      {
        purpose: "buy",
        propertyType,
        ...(floorUse ? { floorUse } : {}),
        preferredAreaIds: ["salmiya"],
        preferredAreaMode: "specific_areas",
        minimumBudget: 300,
        maximumBudget: 600,
        currencyCode: "KWD",
        notes: "",
        preferredAmenities: ["private_roof"],
      },
    );
    assert.equal(result.ok, true, propertyType);
    if (!result.ok) continue;
    const restored = formValuesFromRequirement(result.value);
    assert.deepEqual(restored.preferredAmenities, ["private_roof"]);
    const edited = buildPersonRequirement(
      result.value.id,
      result.value.seekerId,
      restored,
    );
    assert.equal(edited.ok, true, propertyType);
    if (edited.ok)
      assert.deepEqual(edited.value.preferredAmenities, ["private_roof"]);
  }

  const commercial = buildPersonRequirement(
    "11111111-1111-4111-8111-111111111111",
    "seeker",
    {
      purpose: "buy",
      propertyType: "floor",
      floorUse: "commercial",
      preferredAreaIds: ["salmiya"],
      preferredAreaMode: "specific_areas",
      minimumBudget: 300,
      maximumBudget: 600,
      currencyCode: "KWD",
      notes: "",
      preferredAmenities: ["private_roof"],
    },
  );
  assert.equal(commercial.ok, false);

  const legacyExcluded = buildPersonRequirement(
    "11111111-1111-4111-8111-111111111111",
    "seeker",
    {
      purpose: "buy",
      propertyType: "apartment",
      preferredAreaIds: ["salmiya"],
      preferredAreaMode: "specific_areas",
      minimumBudget: 300,
      maximumBudget: 600,
      currencyCode: "KWD",
      notes: "",
      preferredAmenityExclusions: ["balcony"],
    },
  );
  assert.equal(legacyExcluded.ok, true);
  if (legacyExcluded.ok) {
    const restored = formValuesFromRequirement(legacyExcluded.value);
    assert.deepEqual(restored.preferredAmenityExclusions, ["balcony"]);
    const edited = buildPersonRequirement(
      legacyExcluded.value.id,
      legacyExcluded.value.seekerId,
      restored,
    );
    assert.equal(edited.ok, true);
    if (edited.ok)
      assert.deepEqual(edited.value.preferredAmenityExclusions, ["balcony"]);
  }

  const source = await readFile("app/requirement/[requirementId].tsx", "utf8");
  sourceMatch(
    source,
    /keys=\{\['elevator', 'garden', 'bbq_area', 'private_roof', 'balcony'\]\}/,
  );
  sourceMatch(source, /private_roof: \{ en: 'Private roof', ar: 'سطح خاص' \}/);
});

test("New amenity deselection is unspecified and existing exclusions remain editable", () => {
  const selected = toggleRequirementAmenity("private_roof", [], []);
  assert.deepEqual(selected, { preferred: ["private_roof"], excluded: [] });

  const cleared = toggleRequirementAmenity(
    "private_roof",
    selected.preferred,
    selected.excluded,
  );
  assert.deepEqual(cleared, { preferred: [], excluded: [] });

  const legacyExcluded = toggleRequirementAmenity(
    "balcony",
    [],
    ["balcony", "heating"],
  );
  assert.deepEqual(legacyExcluded, { preferred: [], excluded: ["heating"] });
  const nextSelection = toggleRequirementAmenity(
    "balcony",
    legacyExcluded.preferred,
    legacyExcluded.excluded,
  );
  assert.deepEqual(nextSelection, {
    preferred: ["balcony"],
    excluded: ["heating"],
  });
});

test("Requirement form renders approved labels and prevents duplicate pool and waterfront services", async () => {
  const source = await readFile("app/requirement/[requirementId].tsx", "utf8");
  const component = await readFile(
    "components/RequirementCatalogPreferences.tsx",
    "utf8",
  );
  sourceMatch(source, /label\('Living rooms — at least', 'الصالات — على الأقل'\)/);
  sourceMatch(source, /label\('Parking — at least', 'المواقف — على الأقل'\)/);
  sourceMatch(source, /label\('Floor', 'الطابق'\)/);
  assert.equal(
    (source.match(/testID="requirement-central-ac"/g) ?? []).length,
    1,
  );
  sourceMatch(
    source,
    /centralACPreference !== undefined \? \{ centralAC: centralACPreference \}/,
  );
  sourceMatch(source, /setCentralACPreference\(form\.centralAC\)/);
  sourceMatch(source, /service === 'swimmingPool' && poolCatalogApplies/);
  sourceMatch(
    source,
    /amenityCatalogFields\.filter\(field => field !== 'hasPool'\)/,
  );
  sourceMatch(source, /<RequestReview requirement=\{result\.value\}/);
  assert.equal(
    (
      source.match(
        sourcePattern(/label\('Which services are required\?', 'شنو الخدمات المطلوبة؟'\)/g),
      ) ?? []
    ).length,
    1,
  );
  assert.ok(
    source.indexOf("fields={editableLeadingFields}") <
      source.indexOf('testID="requirement-bedrooms-quick-pick"'),
  );
  assert.ok(
    source.indexOf('testID="requirement-required-area"') <
      source.indexOf("fields={editableSpecificationFields}"),
  );
  assert.ok(
    source.indexOf("fields={editableSpecificationFields}") <
      source.indexOf('testID="requirement-central-ac"'),
  );
  sourceMatch(source, /purpose === 'rent' && coreApplicable &&/);
  sourceMatch(
    component,
    /definition\.control === ["']boolean["'][\s\S]*?<RequirementServiceRow[\s\S]*?kind: ["']feature["']/,
  );
  sourceDoesNotMatch(component, /غير مهم|Not important/);
  sourceMatch(source, /requirement-amenities-flow/);
  sourceMatch(
    source,
    /fields=\{propertyType === 'chalet' \? amenityCatalogFields\.filter\(field => field !== 'hasPool' && field !== 'hasWaterfront'\) : coreApplicable && purpose === 'rent' \? amenityCatalogFields\.filter\(field => field !== 'hasPool'\) : amenityCatalogFields\} inlineFeatures/,
  );
});
