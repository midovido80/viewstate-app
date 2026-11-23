import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPersonRequirement,
  formValuesFromRequirement,
} from "../services/personRequirementWorkflow";
import { getRequirementDetailsRows } from "../services/requirementDetailsPresentation";
import { migrateRequestDraft } from "../services/requestDraftMigration";

test("old draft false is unspecified while new explicit false survives restore", () => {
  const old = { step: 3, driverRoom: false, notes: "preserved" };
  const next = migrateRequestDraft(old);
  assert.equal(next.driverRoom, undefined);
  assert.equal(next.notes, "preserved");
  assert.equal(old.driverRoom, false);
  assert.equal(
    migrateRequestDraft({ ...old, requestDraftVersion: 2 }).driverRoom,
    false,
  );
  assert.equal(
    migrateRequestDraft({ ...old, driverRoom: true }).driverRoom,
    true,
  );
});

const base = {
  purpose: "rent" as const,
  propertyType: "chalet" as const,
  preferredAreaMode: "all_kuwait" as const,
  preferredAreaIds: [],
  currencyCode: "KWD",
  notes: "",
  minimumBudget: 80,
  maximumBudget: 120,
};
test("review retains excluded services and their explicit state", () => {
  const result = buildPersonRequirement(
    "11111111-1111-4111-8111-111111111111",
    undefined,
    {
      ...base,
      preferredAmenityExclusions: ["elevator"],
      catalogPreferences: [{ field: "hasPool", kind: "feature", value: true }],
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const rows = getRequirementDetailsRows(result.value, "ar", (key) => key);
  assert.ok(
    rows.some(
      (row) =>
        row.field === "preferredAmenityExclusions" &&
        row.value.includes("مصعد"),
    ),
  );
  assert.equal(rows.find((row) => row.field === "hasPool")?.value, "مطلوبة");
});
test("editing a legacy request does not silently manufacture a monthly price period", () => {
  const result = buildPersonRequirement(
    "11111111-1111-4111-8111-111111111111",
    undefined,
    base,
  );
  assert.equal(result.ok, true);
  if (!result.ok || result.value.purpose !== "rent") return;
  const { rentalPeriodId: ignored, ...legacy } = result.value;
  const values = formValuesFromRequirement(legacy);
  assert.equal(values.rentalPeriodId, undefined);
  const saved = buildPersonRequirement(legacy.id, undefined, values);
  assert.equal(saved.ok, true);
  if (saved.ok && saved.value.purpose === "rent")
    assert.equal(saved.value.rentalPeriodId, undefined);
});
