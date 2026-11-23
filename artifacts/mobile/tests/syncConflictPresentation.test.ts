import test from "node:test";
import assert from "node:assert/strict";
import {
  syncMissingVersionLabel,
  canChooseSyncVersion,
  syncConflictDifferences,
  syncConflictName,
} from "../services/syncConflictPresentation";

test("an unpublished invalid local record is not called deleted and has no destructive absent-cloud choice", () => {
  const conflict = {
    key: "requirement/r",
    base: undefined,
    local: { id: "r" },
    remote: undefined,
    validationIssues: [
      {
        code: "missing_requirement_person",
        keys: ["requirement/r"],
        paths: ["seekerId"],
      },
    ],
  };
  assert.equal(
    syncMissingVersionLabel(conflict, "remote", "ar"),
    "ما وصل للسحابة للحين",
  );
  assert.equal(canChooseSyncVersion(conflict), false);
  assert.equal(
    syncMissingVersionLabel({ ...conflict, base: { id: "r" } }, "remote", "en"),
    "Record deleted in this version",
  );
  assert.equal(
    canChooseSyncVersion({ ...conflict, validationIssues: undefined }),
    true,
  );
});

test("conflict review names the actual contact or entered property title", () => {
  assert.equal(
    syncConflictName({
      key: "person/a",
      base: undefined,
      local: { name: "أحمد" },
      remote: { name: "Ahmed" },
    }),
    "أحمد",
  );
  assert.equal(
    syncConflictName({
      key: "property/p",
      base: {},
      local: { listingTitle: "شقة بحرية" },
      remote: {},
    }),
    "شقة بحرية",
  );
});

test("conflict review shows only different fields and keeps arrays and deletion explicit", () => {
  const differences = syncConflictDifferences(
    {
      activeOffer: { rentalPrice: { amount: 350, currencyCode: "KWD" } },
      notes: "قديم",
      roles: ["broker"],
    },
    {
      activeOffer: { rentalPrice: { amount: 400, currencyCode: "KWD" } },
      roles: ["broker", "owner"],
    },
  );
  assert.deepEqual(
    differences.map((difference) => difference.path.join(".")),
    ["activeOffer.rentalPrice.amount", "notes", "roles"],
  );
  assert.equal(differences[0].local, 350);
  assert.equal(differences[0].remote, 400);
  assert.equal(differences[1].remote, undefined);
  assert.equal(
    syncConflictDifferences({ notes: "a" }, { notes: "a" }).length,
    0,
  );
  assert.deepEqual(
    syncConflictDifferences(undefined, { name: "أحمد" })[0].path,
    [],
  );
});
