import test from "node:test";
import assert from "node:assert/strict";
import {
  createNextWorkspaceRepository,
  emptyNextWorkspace,
  NEXT_WORKSPACE_KEY,
  parseNextWorkspace,
  recentFromPath,
  recordRecent,
} from "../services/nextWorkspace.ts";
import {
  canBeginMessageCapture,
  privateMessageNote,
  showsNextKitchenFields,
} from "../services/nextFormPresentation.ts";
import {
  createEditDraft,
  buildPropertyDetailsUpdateCandidate,
} from "../services/propertyUpdateRecovery.ts";
import { buildPropertyWithCaptureDetails } from "../services/propertyCaptureDetails.ts";
import {
  createPropertyShareSelection,
  buildPropertySharePreview,
  type Property,
} from "@workspace/property-domain";
const at = "2026-11-07T10:00:00.000Z";
function memory() {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: async (key: string) => rows.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      rows.set(key, value);
    },
  };
}
test("recent work records real routes, excludes unsaved forms and uses record identities", () => {
  for (const route of [
    "/",
    "/people",
    "/person/new",
    "/property/new",
    "/requirement/new",
    "/capture/price",
    "/requirement/view",
  ])
    assert.equal(recentFromPath(route), null, route);
  assert.deepEqual(recentFromPath("/property/p1/share"), {
    kind: "property",
    id: "p1",
  });
  assert.deepEqual(recentFromPath("/requirement/view/r1"), {
    kind: "requirement",
    id: "r1",
  });
  assert.deepEqual(recentFromPath("/person/p1"), { kind: "person", id: "p1" });
  let state = emptyNextWorkspace();
  for (let i = 0; i < 15; i++)
    state = recordRecent(state, { kind: "property", id: String(i), at });
  state = recordRecent(state, { kind: "person", id: "14", at });
  state = recordRecent(state, {
    kind: "property",
    id: "14",
    at: "2026-11-07T11:00:00Z",
  });
  assert.equal(state.recent.length, 12);
  assert.equal(state.recent[0].at, "2026-11-07T11:00:00Z");
  assert.equal(
    state.recent.filter((x) => x.kind === "property" && x.id === "14").length,
    1,
  );
  assert.equal(state.recent[1].kind, "person");
});
test("corrupt or future recent-work data is retained, never silently replaced", async () => {
  const storage = memory(),
    repo = createNextWorkspaceRepository(storage);
  for (const raw of [
    "{",
    "{}",
    JSON.stringify({ version: 2, introduced: false, recent: [] }),
    JSON.stringify({
      version: 1,
      introduced: false,
      recent: [{ kind: "property", id: "a", at: "bad" }],
    }),
  ]) {
    storage.rows.set(NEXT_WORKSPACE_KEY, raw);
    assert.throws(() => parseNextWorkspace(raw));
    await assert.rejects(repo.update((s) => ({ ...s, introduced: true })));
    assert.equal(storage.rows.get(NEXT_WORKSPACE_KEY), raw);
  }
});
test("concurrent introduction and visit writes retain both across repository instances", async () => {
  const storage = memory(),
    a = createNextWorkspaceRepository(storage),
    b = createNextWorkspaceRepository(storage);
  await Promise.all([
    a.update((s) => ({ ...s, introduced: true })),
    b.update((s) => recordRecent(s, { kind: "person", id: "client", at })),
    a.update((s) => recordRecent(s, { kind: "property", id: "offer", at })),
  ]);
  const read = await b.read();
  assert.equal(read.introduced, true);
  assert.deepEqual(
    read.recent.map((x) => x.id),
    ["offer", "client"],
  );
  assert.deepEqual(
    await createNextWorkspaceRepository(memory()).read(),
    emptyNextWorkspace(),
  );
});
test("an unconfirmed save fails visibly and the write queue recovers on retry", async () => {
  const storage = memory();
  let broken = true;
  const adapter = {
    getItem: storage.getItem,
    setItem: async (k: string, v: string) => {
      if (!broken) await storage.setItem(k, v);
    },
  };
  const repo = createNextWorkspaceRepository(adapter);
  await assert.rejects(
    repo.update((s) => ({ ...s, introduced: true })),
    /UNCONFIRMED/,
  );
  broken = false;
  assert.equal(
    (await repo.update((s) => ({ ...s, introduced: true }))).introduced,
    true,
  );
});
test("message capture cannot overwrite any original capture values or details", () => {
  const scaffold = { propertyCoreId: "p", offerId: "o" };
  assert.equal(canBeginMessageCapture(scaffold, {}), true);
  for (const changes of [
    { listingTitle: "Old title" },
    { propertyType: "villa" as const },
    { privateNotes: privateMessageNote("old") },
    { transaction: "rent" as const },
  ])
    assert.equal(
      canBeginMessageCapture({ ...scaffold, ...changes }, {}),
      false,
    );
  assert.equal(canBeginMessageCapture(scaffold, { bathroomCount: "0" }), false);
  assert.equal(canBeginMessageCapture(scaffold, { attachments: [] }), false);
});
test("kitchen presentation follows approved types while old apartment/shop/floor records round-trip", () => {
  for (const type of ["house", "villa", "chalet", "office"] as const)
    assert.equal(showsNextKitchenFields(type), true);
  assert.equal(showsNextKitchenFields("apartment", "duplex"), true);
  assert.equal(showsNextKitchenFields("floor", undefined, "commercial"), true);
  for (const type of [
    "apartment",
    "shop",
    "floor",
    "whole_building",
    "warehouse",
    "commercial_complex",
  ] as const)
    assert.equal(showsNextKitchenFields(type), false);
  for (const type of ["apartment", "shop", "floor"] as const) {
    const p: Property = {
      core: { id: "p", propertyType: type, locationArea: { id: "salmiya" } },
      activeOffer: {
        id: "o",
        propertyCoreId: "p",
        transaction: "rent",
        rentalPrice: { amount: 500, currencyCode: "KWD" },
        rentalPeriodId: "monthly",
      },
    };
    const original = buildPropertyWithCaptureDetails(p, {
      ...(type === "floor" ? { floorUse: "residential" } : {}),
      kitchens: JSON.stringify([{ layout: "american", equipment: "equipped" }]),
    });
    const draft = createEditDraft(original),
      updated = buildPropertyDetailsUpdateCandidate(original, draft.choices);
    assert.deepEqual(
      (updated.typeDetails as any).kitchens,
      (original.typeDetails as any).kitchens,
    );
  }
});
test("pasted source text is private and absent from the original default share preview", () => {
  const message = "Owner phone +965 99999999 — private original message";
  const property: Property = {
    core: {
      id: "p",
      propertyType: "apartment",
      locationArea: { id: "salmiya" },
      privateNotes: privateMessageNote(message),
    },
    activeOffer: {
      id: "o",
      propertyCoreId: "p",
      transaction: "rent",
      rentalPrice: { amount: 500, currencyCode: "KWD" },
      rentalPeriodId: "monthly",
    },
  };
  assert.equal(property.core.privateNotes?.privacy.disclosurePolicy, "never");
  const selection = createPropertyShareSelection(property);
  const preview = buildPropertySharePreview({
    property,
    selection,
    availableAttachments: [],
    rentalCadence: "monthly",
    attribution: "ViewState",
  });
  assert.equal(preview.text.includes(message), false);
  assert.equal(preview.text.includes("99999999"), false);
});
