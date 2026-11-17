import test from "node:test";
import assert from "node:assert/strict";
import "./platformModuleStubs.ts";
import {
  pairPropertyFields,
  stackPropertyFields,
  propertyCompletionNotice,
} from "../services/propertyFormLayout.ts";
import { compactPropertyLabel } from "../services/compactPropertyLabel.ts";
import {
  propertyCompletionFields,
  missingCompletionFields,
} from "../services/requiredMatchingFields.ts";
import { WebStore } from "../services/persistence.ts";
import {
  createEditDraft,
  buildPropertyDetailsUpdateCandidate,
  savePropertyEditDraft,
  createPropertyUpdateOperation,
  persistPropertyUpdateOperation,
  executePropertyUpdateRecovery,
} from "../services/propertyUpdateRecovery.ts";
import type { Property } from "@workspace/property-domain";
test("two-column grouping preserves order, full-width fields and large-text stacking", () => {
  const items = [
    { id: "beds" },
    { id: "baths" },
    { id: "layout", fullWidth: true },
    { id: "master" },
    { id: "floor" },
  ];
  assert.deepEqual(
    pairPropertyFields(items).map((row) => row.map((i) => i.id)),
    [["beds", "baths"], ["layout"], ["master", "floor"]],
  );
  assert.deepEqual(pairPropertyFields(items).flat(), items);
  assert.equal(stackPropertyFields(390, 1), false);
  assert.equal(stackPropertyFields(320, 1), false);
  assert.equal(stackPropertyFields(319, 1), true);
  assert.equal(stackPropertyFields(390, 1.6), true);
});
test("compact offer heading always identifies its type without rewriting a free-form title", () => {
  const p: Property = {
    core: {
      id: "p",
      propertyType: "apartment",
      locationArea: { id: "salmiya" },
    },
    activeOffer: {
      id: "o",
      propertyCoreId: "p",
      transaction: "rent",
      rentalPrice: { amount: 500, currencyCode: "KWD" },
      rentalPeriodId: "monthly",
    },
    listingTitle: "عادية",
  };
  assert.equal(compactPropertyLabel(p, "ar", "شقة"), "شقة");
  assert.equal(compactPropertyLabel(p, "en", "Apartment"), "Apartment");
  assert.equal(
    compactPropertyLabel(
      { ...p, typeDetails: { propertyType: "apartment", bedroomCount: 2 } },
      "ar",
      "شقة",
    ),
    "شقة غرفتين",
  );
  assert.equal(
    compactPropertyLabel(
      {
        ...p,
        typeDetails: { propertyType: "apartment", apartmentSubtype: "duplex" },
      },
      "ar",
      "شقة",
    ),
    "دوبلكس",
  );
  assert.equal(
    compactPropertyLabel(
      {
        ...p,
        core: { ...p.core, propertyType: "floor" },
        typeDetails: { propertyType: "floor", floorUse: "residential" },
      },
      "ar",
      "دور",
    ),
    "دور سكني",
  );
  assert.equal(p.listingTitle, "عادية");
});
test("hidden incomplete details produce a specific unsaved notice", () => {
  const missing = missingCompletionFields(
    propertyCompletionFields({
      type: "chalet",
      area: "salmiya",
      price: 500,
      size: 80,
      values: {},
    }),
  );
  assert.deepEqual(missing, ["bedroomCount", "bathroomCount"]);
  assert.match(propertyCompletionNotice(missing, "ar")!, /غرف النوم/);
  assert.equal(propertyCompletionNotice([], "ar"), undefined);
});
test("completed apartment, chalet and building edits persist through original recovery and reopen", async () => {
  for (const type of ["apartment", "chalet", "whole_building"] as const) {
    const rows = new Map<string, string>(),
      storage = {
        getItem: async (k: string) => rows.get(k) ?? null,
        setItem: async (k: string, v: string) => {
          rows.set(k, v);
        },
        removeItem: async (k: string) => {
          rows.delete(k);
        },
      };
    const locks = {
      request: async (_n: string, _o: unknown, work: () => Promise<unknown>) =>
        work(),
    };
    const store = new WebStore(storage, locks as never);
    await store.init();
    await store.saveProperty({
      core: { id: type, propertyType: type, locationArea: { id: "salmiya" } },
      activeOffer: {
        id: type + "-offer",
        propertyCoreId: type,
        transaction: "rent",
        rentalPrice: { amount: 500, currencyCode: "KWD" },
        rentalPeriodId: "monthly",
      },
    });
    const baseline = (await store.getProperty(type))!,
      draft = createEditDraft(baseline, storage);
    draft.choices.areaSquareMeters = 80;
    draft.choices.canonicalDetails =
      type === "whole_building"
        ? {
            apartmentCount: "12",
            sameApartmentLayout: "true",
            roomsPerUnit: "3",
            bathroomsPerUnit: "2",
          }
        : { bedroomCount: "3", bathroomCount: "2" };
    assert.deepEqual(
      missingCompletionFields(
        propertyCompletionFields({
          type,
          area: draft.choices.locationAreaId,
          price: draft.choices.priceAmount,
          size: 80,
          values: draft.choices.canonicalDetails,
        }),
      ),
      [],
    );
    assert.equal(await savePropertyEditDraft(draft, storage), true);
    const candidate = buildPropertyDetailsUpdateCandidate(
        baseline,
        draft.choices,
      ),
      operation = createPropertyUpdateOperation({
        operationId: "op-" + type,
        baseline,
        candidate,
        draftSnapshot: draft,
        preparedAt: "2026-11-07T10:00:00Z",
      });
    await persistPropertyUpdateOperation(operation, storage);
    const result = await executePropertyUpdateRecovery({
      operation,
      allowUpdate: true,
      getProperty: (id) => store.getProperty(id),
      compareAndUpdate: (a, b) => store.compareAndUpdate(a, b),
      storage,
    });
    assert.equal(result.status, "complete", JSON.stringify(result));
    const reopened = new WebStore(storage, locks as never);
    await reopened.init();
    assert.deepEqual(await reopened.getProperty(type), candidate);
  }
});
test("wizard reveals the details page before focusing the missing field", async () => {
  const { registerHooks } = await import("node:module"),
    state = { cursor: 0, values: [] as any[], effects: [] as (() => void)[] };
  (globalThis as any).__wizardValidation = state;
  const mock = `export const useState=initial=>{const s=globalThis.__wizardValidation,i=s.cursor++;if(!(i in s.values))s.values[i]=initial;return [s.values[i],v=>{s.values[i]=v}];};export const useEffect=fn=>{globalThis.__wizardValidation.effects.push(fn);};`;
  const hooks = registerHooks({
    resolve(s, c, next) {
      return s === "react"
        ? { url: "wizard-react", shortCircuit: true }
        : next(s, c);
    },
    load(u, c, next) {
      return u === "wizard-react"
        ? { format: "module", source: mock, shortCircuit: true }
        : next(u, c);
    },
  });
  try {
    const { usePropertyWizardValidation } =
      await import("../hooks/usePropertyWizardValidation.ts");
    let page: 0 | 1 | 2 = 2,
      missing = ["bedroomCount"];
    const focused: string[] = [];
    const form = {
      validate: (_snapshot: unknown, options: any) => {
        assert.equal(options.focus, false);
        return missing;
      },
      focus: (id: string) => {
        assert.equal(page, 0);
        focused.push(id);
      },
    } as any;
    const render = () => {
      state.cursor = 0;
      return usePropertyWizardValidation(form, page, (next) => {
        page = next;
      });
    };
    render()();
    assert.equal(page, 0);
    assert.deepEqual(focused, []);
    render();
    state.effects.splice(0).forEach((fn) => fn());
    assert.deepEqual(focused, ["bedroomCount"]);
    missing = [];
    assert.deepEqual(render()(), []);
  } finally {
    hooks.deregister();
    delete (globalThis as any).__wizardValidation;
  }
});
