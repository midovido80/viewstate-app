import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMatch,
  matchingPropertyFacts,
  normalizeSeekerRequirement,
  validateSeekerRequirement,
  type CatalogPreference,
  type Property,
  type SeekerRequirement,
} from "@workspace/property-domain";
import { getRequirementCatalogFields } from "@/services/requirementFieldMap";
import { getPropertyFormField } from "@/services/propertyFormCatalog";
const req = (
  propertyType: SeekerRequirement["propertyType"],
  catalogPreferences: readonly CatalogPreference[],
): SeekerRequirement => ({
  id: "11111111-1111-4111-8111-111111111111",
  purpose: "buy",
  propertyType,
  preferredAreaMode: "all_kuwait",
  preferredAreaIds: [],
  budget: { maximum: 200000, currencyCode: "KWD" },
  notes: "",
  catalogPreferences,
});
const num = (
  field: CatalogPreference["field"],
  value = 2,
): CatalogPreference => ({
  field,
  kind: "number",
  comparison: "minimum",
  value,
});
const prop = (
  type: Property["core"]["propertyType"],
  details: Record<string, unknown>,
): Property =>
  ({
    core: { id: "property", propertyType: type, locationArea: { id: "area" } },
    activeOffer: {
      id: "offer",
      propertyCoreId: "property",
      transaction: "sale",
      salePrice: { amount: 100000, currencyCode: "KWD" },
    },
    typeDetails: { propertyType: type, ...details },
  }) as Property;
test("building counts and plot area are visible, validated and survive serialized reload", () => {
  const fields = [
    "floorCount",
    "unitCount",
    "apartmentCount",
    "shopCount",
    "officeCount",
    "roomsPerUnit",
    "bathroomsPerUnit",
    "plotAreaSquareMeters",
  ] as const;
  const visible = getRequirementCatalogFields("whole_building").map(
    (item) => item.field,
  );
  for (const field of fields) assert.ok(visible.includes(field), field);
  const original = req(
    "whole_building",
    fields.map((field) => num(field)),
  );
  assert.equal(validateSeekerRequirement(original).ok, true);
  const loaded = normalizeSeekerRequirement(
    JSON.parse(JSON.stringify(original)),
  );
  assert.equal(loaded.ok, true);
  if (loaded.ok)
    assert.deepEqual(
      loaded.value.catalogPreferences,
      original.catalogPreferences,
    );
  assert.equal(
    validateSeekerRequirement(req("apartment", [num("floorCount")])).ok,
    false,
  );
  assert.equal(
    validateSeekerRequirement(req("whole_building", [num("unitCount", 2.5)]))
      .ok,
    false,
  );
  assert.equal(
    validateSeekerRequirement(
      req("whole_building", [
        { field: "floorCount", kind: "number", comparison: "exact", value: 2 },
      ]),
    ).ok,
    false,
  );
});
test("warehouse keeps physical kind and floor separate from cold storage", () => {
  const preferences: CatalogPreference[] = [
    { field: "warehouseKind", kind: "choice", value: "food" },
    { field: "warehouseLevels", kind: "choice", value: "ground" },
    num("ceilingHeightMeters", 4.5),
    { field: "hasColdStorage", kind: "feature", value: true },
    { field: "hasFireSystem", kind: "feature", value: true },
  ];
  const wanted = req("warehouse", preferences);
  assert.equal(validateSeekerRequirement(wanted).ok, true);
  assert.equal(
    validateSeekerRequirement(
      req("warehouse", [
        { field: "warehouseKind", kind: "choice", value: "cooled" },
      ]),
    ).ok,
    false,
  );
  const fields = getRequirementCatalogFields("warehouse").map(
    (item) => item.field,
  );
  for (const preference of preferences)
    assert.ok(fields.includes(preference.field), preference.field);
  const match = (details: Record<string, unknown>) =>
    evaluateMatch(wanted, { property: prop("warehouse", details) })
      .explanations;
  const actual = {
    warehouseKind: "food",
    warehouseLevels: ["basement", "ground"],
    ceilingHeightMeters: 5,
    hasColdStorage: true,
    hasFireSystem: true,
  };
  assert.equal(
    match(actual).find((item) => item.criterion === "warehouseLevels")?.status,
    "matched",
  );
  assert.equal(
    match({ ...actual, warehouseLevels: ["basement"] }).find(
      (item) => item.criterion === "warehouseLevels",
    )?.status,
    "ineligible",
  );
  assert.equal(
    match({ ...actual, warehouseLevels: undefined }).find(
      (item) => item.criterion === "warehouseLevels",
    )?.status,
    "unknown",
  );
  assert.equal(
    match({ ...actual, ceilingHeightMeters: 4 }).find(
      (item) => item.criterion === "ceilingHeightMeters",
    )?.status,
    "ineligible",
  );
});
test("new count facts survive matching projection and use minimum comparison", () => {
  const offered = prop("whole_building", {
    floorCount: 4,
    unitCount: 12,
    officeCount: 3,
  });
  assert.equal(matchingPropertyFacts(offered).unitCount, 12);
  assert.equal(matchingPropertyFacts(offered).officeCount, 3);
  const result = evaluateMatch(
    req("whole_building", [num("unitCount", 10), num("officeCount", 4)]),
    { property: offered },
  );
  assert.equal(
    result.explanations.find((item) => item.criterion === "unitCount")?.status,
    "matched",
  );
  assert.equal(
    result.explanations.find((item) => item.criterion === "officeCount")
      ?.status,
    "not_met",
  );
});
test("numeric specification descriptors and selected floor labels are explicit", () => {
  assert.equal(
    getPropertyFormField("ceilingHeightMeters").wanted?.presentation,
    "specification",
  );
  assert.equal(
    getPropertyFormField("warehouseLevels").label[0],
    "Warehouse floor",
  );
});
import { parseRequirementCatalogNumber } from "@/services/requirementFieldMap";
test("catalog numeric input normalizes localized digits and uses prescribed relations", () => {
  assert.deepEqual(parseRequirementCatalogNumber("floorCount", "٣"), {
    ok: true,
    preference: {
      field: "floorCount",
      kind: "number",
      comparison: "minimum",
      value: 3,
    },
  });
  assert.deepEqual(parseRequirementCatalogNumber("floorNumber", "٠"), {
    ok: true,
    preference: {
      field: "floorNumber",
      kind: "number",
      comparison: "exact",
      value: 0,
    },
  });
  assert.deepEqual(
    parseRequirementCatalogNumber("ceilingHeightMeters", "٤٫٥"),
    {
      ok: true,
      preference: {
        field: "ceilingHeightMeters",
        kind: "number",
        comparison: "minimum",
        value: 4.5,
      },
    },
  );
  assert.deepEqual(parseRequirementCatalogNumber("floorCount", "2.5"), {
    ok: false,
  });
  assert.deepEqual(
    parseRequirementCatalogNumber("ceilingHeightMeters", "bad"),
    { ok: false },
  );
  assert.deepEqual(parseRequirementCatalogNumber("floorCount", ""), {
    ok: true,
  });
});
import { WebRequirementStore } from "@/services/requirementPersistence";
test("expanded request preferences survive a real Web store restart", async () => {
  const rows = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => rows.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      rows.set(key, value);
    },
  };
  const locks = {
    request: async <T>(
      _name: string,
      _options: { mode: "exclusive" },
      work: () => Promise<T>,
    ): Promise<T> => work(),
  };
  const people = { getPerson: async () => null };
  const original = req("warehouse", [
    { field: "warehouseKind", kind: "choice", value: "industrial" },
    { field: "warehouseLevels", kind: "choice", value: "basement" },
    num("ceilingHeightMeters", 4.5),
    num("entranceCount", 2),
    num("loadingBayCount", 3),
    num("serviceElevatorCapacityTons", 2.5),
    { field: "hasServiceElevator", kind: "feature", value: true },
    { field: "hasVehicleRamp", kind: "feature", value: false },
    { field: "hasEscalator", kind: "feature", value: true },
    { field: "hasFireSystem", kind: "feature", value: true },
  ]);
  await new WebRequirementStore(storage, () => locks, people).saveRequirement(
    original,
  );
  const reloaded = await new WebRequirementStore(
    storage,
    () => locks,
    people,
  ).getRequirement(original.id);
  assert.deepEqual(reloaded?.catalogPreferences, original.catalogPreferences);
  for (const preference of original.catalogPreferences ?? []) {
    assert.ok(
      getRequirementCatalogFields("warehouse").some(
        (item) => item.field === preference.field,
      ),
      preference.field,
    );
  }
  const building = {
    ...req("whole_building", [
      num("unitCount", 20),
      num("apartmentCount", 15),
      num("shopCount", 2),
      num("officeCount", 3),
      num("roomsPerUnit", 2),
      num("bathroomsPerUnit", 1),
      num("floorCount", 4),
      num("plotAreaSquareMeters", 500),
    ]),
    id: "22222222-2222-4222-8222-222222222222",
  };
  await new WebRequirementStore(storage, () => locks, people).saveRequirement(
    building,
  );
  assert.deepEqual(
    (
      await new WebRequirementStore(
        storage,
        () => locks,
        people,
      ).getRequirement(building.id)
    )?.catalogPreferences,
    building.catalogPreferences,
  );
});
import { matchCircleSnapshot } from "../../../supabase/functions/circle-match-worker/engine";
import {
  circlePropertyFacts,
  circleRequestFacts,
} from "@/services/circleMatchingApi";
test("Circle publication and worker share warehouse membership and building count semantics", () => {
  const warehouseRequest = req("warehouse", [
    { field: "warehouseKind", kind: "choice", value: "food" },
    { field: "warehouseLevels", kind: "choice", value: "ground" },
    num("ceilingHeightMeters", 4.5),
  ]);
  const warehouse = prop("warehouse", {
    warehouseKind: "food",
    warehouseLevels: ["basement", "ground"],
    ceilingHeightMeters: 5,
  });
  const publishedRequest = circleRequestFacts(warehouseRequest);
  const publishedWarehouse = circlePropertyFacts(warehouse);
  assert.ok(publishedRequest);
  assert.ok(publishedWarehouse);
  const run = (facts: Property) =>
    matchCircleSnapshot({
      revision: 1,
      requests: [
        {
          id: warehouseRequest.id,
          owner: "requester",
          facts: publishedRequest!.p_facts as Omit<SeekerRequirement, "id">,
        },
      ],
      properties: [{ id: "warehouse", owner: "publisher", facts }],
    });
  assert.equal(run(publishedWarehouse).length, 1);
  assert.equal(
    run({
      ...publishedWarehouse,
      typeDetails: {
        ...publishedWarehouse.typeDetails,
        warehouseLevels: ["basement"],
      } as Property["typeDetails"],
    }).length,
    0,
  );
  const buildingRequest = req("whole_building", [num("unitCount", 12)]);
  const building = circlePropertyFacts(
    prop("whole_building", { unitCount: 11 }),
  );
  assert.ok(building);
  assert.equal(
    (building.typeDetails as unknown as Record<string, unknown>).unitCount,
    11,
  );
  const snapshot = {
    revision: 1,
    requests: [
      { id: buildingRequest.id, owner: "requester", facts: buildingRequest },
    ],
    properties: [{ id: "building", owner: "publisher", facts: building }],
  };
  assert.equal(
    matchCircleSnapshot(snapshot).length,
    1,
    "one-unit shortfall remains a discussion alternative",
  );
  assert.equal(
    matchCircleSnapshot({
      ...snapshot,
      properties: [
        {
          ...snapshot.properties[0],
          facts: {
            ...building,
            typeDetails: { propertyType: "whole_building", unitCount: 10 },
          },
        },
      ],
    }).length,
    0,
    "two-unit shortfall exceeds count tolerance",
  );
});
