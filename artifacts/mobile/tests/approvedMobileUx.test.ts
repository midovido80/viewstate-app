import test from "node:test";
import assert from "node:assert/strict";
import "./platformModuleStubs.ts";
import {
  compareKitchens,
  validKitchens,
  validateProperty,
  normalizeSeekerRequirement,
  evaluateMatch,
  type Property,
  type PropertyType,
  type SeekerRequirement,
} from "@workspace/property-domain";
import { buildPropertyWithCaptureDetails } from "../services/propertyCaptureDetails.ts";
import {
  createEditDraft,
  buildPropertyDetailsUpdateCandidate,
} from "../services/propertyUpdateRecovery.ts";
import {
  buildPersonRequirement,
  formValuesFromRequirement,
} from "../services/personRequirementWorkflow.ts";
import { getPropertyTypeChoices } from "../services/propertySectorSelection.ts";
import { createNumericQuickPickLocalState } from "../services/numericQuickPick.ts";
import { WebRequirementStore } from "../services/requirementPersistence.ts";
import { createPerson } from "../services/people.ts";
import {
  matchingBackRoute,
  rememberMatchingReturn,
} from "../services/matchingReturnSession.ts";
import { BrokerInitiatedMatching } from "../services/brokerInitiatedMatching.ts";
import { MyPropertiesMatchingSource } from "../services/myPropertiesMatchingSource.ts";
const base = (type: PropertyType, id = "property"): Property => ({
  core: { id, propertyType: type, locationArea: { id: "salmiya" } },
  activeOffer: {
    id: `${id}-offer`,
    propertyCoreId: id,
    transaction: "rent",
    rentalPrice: { amount: 500, currencyCode: "KWD" },
    rentalPeriodId: "monthly",
  },
});
const request: SeekerRequirement = {
  id: "11111111-1111-4111-8111-111111111111",
  seekerId: "seeker",
  purpose: "rent",
  propertyType: "apartment",
  preferredAreaIds: [],
  preferredAreaMode: "all_kuwait",
  budget: { minimum: 400, maximum: 600, currencyCode: "KWD" },
  rentalPeriodId: "monthly",
  notes: "",
};
const kitchens = [
  { layout: "american", equipment: "equipped", access: "private" },
  { layout: "regular", equipment: "unequipped", access: "shared" },
] as const;
test("multiple kitchens survive offered create / JSON reload / edit without changing other services", () => {
  for (const type of [
    "apartment",
    "house",
    "villa",
    "chalet",
    "office",
    "shop",
    "floor",
  ] as const) {
    const created = buildPropertyWithCaptureDetails(base(type), {
      ...(type === "floor" ? { floorUse: "residential" } : {}),
      kitchens: JSON.stringify(kitchens),
      ...(type === "villa" || type === "house" || type === "chalet"
        ? { hasGuardRoom: "false" }
        : {}),
    });
    assert.equal(validateProperty(created).ok, true);
    assert.deepEqual((created.typeDetails as any).kitchens, kitchens, type);
    const loaded = JSON.parse(JSON.stringify(created));
    const edit = createEditDraft(loaded);
    const updated = buildPropertyDetailsUpdateCandidate(loaded, edit.choices);
    assert.deepEqual((updated.typeDetails as any).kitchens, kitchens, type);
    assert.equal(
      (updated.typeDetails as any).hasGuardRoom,
      type === "villa" || type === "house" || type === "chalet"
        ? false
        : undefined,
    );
  }
});
test("wanted kitchens and the five housing choices survive normalization and editing", () => {
  for (const occupancy of [
    "family",
    "bachelor",
    "company_staff",
    "women",
    "mixed",
  ] as const) {
    const normalized = normalizeSeekerRequirement({
      ...request,
      occupancy,
      kitchens,
    });
    assert.equal(normalized.ok, true);
    if (!normalized.ok) return;
    const edited = buildPersonRequirement(
      request.id,
      request.seekerId,
      formValuesFromRequirement(JSON.parse(JSON.stringify(normalized.value))),
    );
    assert.equal(edited.ok, true);
    if (!edited.ok) return;
    assert.deepEqual(edited.value.kitchens, kitchens);
    assert.equal(
      edited.value.purpose === "rent" && edited.value.occupancy,
      occupancy,
    );
  }
});
test("kitchen assignment is order-independent, one-to-one and does not count unknown equipment as confirmed", () => {
  assert.equal(compareKitchens(kitchens, [...kitchens].reverse()), true);
  assert.equal(
    compareKitchens(
      [{ equipment: "equipped" }, { equipment: "equipped" }],
      kitchens,
    ),
    false,
  );
  assert.equal(compareKitchens([{ equipment: "equipped" }], [{}]), undefined);
  assert.equal(compareKitchens([{}], undefined), undefined);
  assert.equal(compareKitchens([], []), true);
  assert.equal(compareKitchens([], [{}]), false);
  assert.equal(validKitchens([{ equipment: "invented" }]), false);
});
test("the existing matching engine compares kitchen facts, without changing legacy candidates", () => {
  const property = buildPropertyWithCaptureDetails(base("apartment"), {
    kitchens: JSON.stringify(kitchens),
  });
  const candidate = { property };
  const result = evaluateMatch({ ...request, kitchens }, candidate as any);
  assert.equal(
    result.explanations.find((item) => item.criterion === "kitchens")?.status,
    "matched",
  );
  const unknown = evaluateMatch({ ...request, kitchens }, {
    property: base("apartment"),
  } as any);
  assert.equal(
    unknown.explanations.find((item) => item.criterion === "kitchens")?.status,
    "unknown",
  );
});
test("property-scoped matching filters candidates before the shortlist, so a saved low-ranked property is still evaluated", async () => {
  const target = base("apartment", "saved");
  const others = Array.from({ length: 8 }, (_, i) =>
    base("apartment", `other-${i}`),
  );
  const source = new MyPropertiesMatchingSource({
    getProperties: async () => [...others, target],
  });
  const engine = new BrokerInitiatedMatching(
    { getRequirement: async () => request },
    {
      getCandidates: async (req) =>
        (await source.getCandidates(req)).filter(
          (item) => item.property.core.id === target.core.id,
        ),
    },
  );
  const run = await engine.runForRequirement(request.id);
  assert.equal(run.evaluatedCandidateCount, 1);
  assert.ok(
    [...run.matches, ...run.needsConfirmation].every(
      (item) => item.propertyId === "saved",
    ),
  );
});
test("rent type lists exclude complex while sale lists retain it, with original other types unchanged", () => {
  assert.equal(
    getPropertyTypeChoices("commercial", "rent").includes("commercial_complex"),
    false,
  );
  assert.equal(
    getPropertyTypeChoices("commercial", "sale").includes("commercial_complex"),
    true,
  );
  assert.equal(
    getPropertyTypeChoices("residential", "rent").includes("villa"),
    true,
  );
});
test("unset counts, parking zero, 10 rooms and 40 floors remain distinct exact draft values", () => {
  for (const value of ["", "0", "10", "40"]) {
    const state = createNumericQuickPickLocalState(
      "record",
      value,
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    assert.equal(state.pending, value);
    assert.equal(state.expanded, value === "40");
  }
});
test("matching back restores both property scope and best-view scope", () => {
  const token = rememberMatchingReturn({
    scopePropertyId: "property",
    best: true,
    mode: "saved",
    policies: {},
    excluded: {},
    scrollOffset: 20,
  });
  assert.match(matchingBackRoute(token), /propertyId=property/);
  assert.doesNotMatch(matchingBackRoute(token), /best=1/, 'record scope must not inherit the Home best filter');
});

test("new kitchen and occupancy fields survive a real web repository restart without quarantine", async () => {
  const map = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
  const locks = {
    request: async <T>(
      _name: string,
      _options: unknown,
      work: () => Promise<T>,
    ) => work(),
  };
  const person = createPerson({
    id: "seeker",
    name: "Test",
    classifications: ["seeker"],
    displayPhone: "50000000",
  });
  const people = { getPerson: async () => person };
  const value = { ...request, kitchens, occupancy: "women" as const };
  await new WebRequirementStore(storage, () => locks, people).saveRequirement(
    value,
  );
  const restarted = new WebRequirementStore(storage, () => locks, people);
  assert.deepEqual(await restarted.getRequirement(value.id), value);
});
