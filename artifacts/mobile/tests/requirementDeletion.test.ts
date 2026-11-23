import test from "node:test";
import assert from "node:assert/strict";
import "./platformModuleStubs";
import { WebStore } from "../services/persistence";
import { readBusiness } from "../services/workspaceSnapshot";
import { deleteRequirementRecord } from "../services/requirementDeletion";
import type { SeekerRequirement } from "@workspace/property-domain";

test("saved request deletion uses the exact reviewed record, preserves others and rejects a stale confirmation", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (k: string) => values.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: async (k: string) => {
      values.delete(k);
    },
  };
  const store = new WebStore(storage, {
    request: async <T>(_n: string, _o: unknown, work: () => Promise<T>) =>
      work(),
  });
  await store.init();
  const request: SeekerRequirement = {
    id: "44444444-4444-4444-8444-444444444444",
    purpose: "rent",
    propertyType: "apartment",
    preferredAreaMode: "specific_areas",
    preferredAreaIds: ["salmiya"],
    budget: { maximum: 350, currencyCode: "KWD" },
    notes: "طلب مستورد",
    rentalPeriodId: "monthly",
  };
  await store.saveRequirement(request);
  await store.saveRequirement({
    ...request,
    id: "55555555-5555-4555-8555-555555555555",
    notes: "طلب آخر",
  });
  const expected = (await store.getRequirement(request.id))!;
  await store.updateRequirement(expected, { ...expected, notes: "تعديل أحدث" });
  assert.equal(await deleteRequirementRecord(store, expected), "stale");
  const current = (await store.getRequirement(request.id))!;
  const before = await readBusiness(store);
  assert.equal(await deleteRequirementRecord(store, current), "deleted");
  const after = await readBusiness(store);
  assert.deepEqual(
    after.requirements,
    before.requirements.filter((r) => r.id !== request.id),
  );
  assert.deepEqual(after.people, before.people);
  assert.deepEqual(after.properties, before.properties);
  assert.equal(await deleteRequirementRecord(store, current), "missing");
});
