import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeWorkspace,
  createWorkspaceSync,
  SYNC_STATE_KEY,
  type SyncRecords,
} from "../services/workspaceSync";

test("independent fields of the same request merge without a false record conflict", () => {
  const base = {
    "requirement/r": {
      id: "r",
      budget: { minimum: 80, maximum: 120 },
      notes: "a",
    },
  };
  const local = {
    "requirement/r": {
      id: "r",
      budget: { minimum: 90, maximum: 120 },
      notes: "a",
    },
  };
  const remote = {
    "requirement/r": {
      id: "r",
      budget: { minimum: 80, maximum: 120 },
      notes: "b",
    },
  };
  const merged = mergeWorkspace(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.deepEqual(merged.records["requirement/r"], {
    id: "r",
    budget: { minimum: 90, maximum: 120 },
    notes: "b",
  });
});

test("independent property edits that break a combined invariant remain resolvable and never publish", async () => {
  const key = "property/p";
  const base = {
    [key]: { typeDetails: { bedroomCount: 3, masterBedroomCount: 2 } },
  };
  let current: SyncRecords = {
    [key]: { typeDetails: { bedroomCount: 2, masterBedroomCount: 2 } },
  };
  let remote = {
    revision: 2,
    records: {
      [key]: { typeDetails: { bedroomCount: 3, masterBedroomCount: 3 } },
    } as SyncRecords,
  };
  let writes = 0;
  const storage = new Map([
    [
      SYNC_STATE_KEY,
      JSON.stringify({
        version: 1,
        base: { revision: 1, records: base },
        conflicts: [],
        resolutions: {},
      }),
    ],
  ]);
  const sync = createWorkspaceSync(
    {
      getItem: async (k) => storage.get(k) ?? null,
      setItem: async (k, v) => {
        storage.set(k, v);
      },
    },
    {
      read: async () => structuredClone(current),
      validate: async (records) => {
        const p = records[key] as (typeof base)[typeof key];
        if (p.typeDetails.masterBedroomCount > p.typeDetails.bedroomCount)
          throw new Error("SYNC_INVALID_PROPERTY");
      },
      apply: async (expected, next) => {
        assert.deepEqual(current, expected);
        current = structuredClone(next);
      },
    },
    {
      read: async () => structuredClone(remote),
      write: async (expected, records) => {
        assert.equal(expected, remote.revision);
        writes++;
        remote = { revision: remote.revision + 1, records };
        return { accepted: true, workspace: structuredClone(remote) };
      },
    },
    () => {},
  );
  const pending = await sync.sync();
  assert.equal(pending.conflicts.length, 1);
  assert.equal(writes, 0);
  await sync.resolve(key, "local");
  assert.equal((await sync.sync()).conflicts.length, 0);
  assert.equal(writes, 1);
  assert.deepEqual(remote.records[key], {
    typeDetails: { bedroomCount: 2, masterBedroomCount: 2 },
  });
});

test("same field edits, concurrent creation and delete-versus-edit remain explicit conflicts", () => {
  const old = { id: "r", notes: "a", services: ["pool"] };
  for (const [base, local, remote] of [
    [
      { "requirement/r": old },
      { "requirement/r": { ...old, notes: "b" } },
      { "requirement/r": { ...old, notes: "c" } },
    ],
    [
      {},
      { "requirement/r": { ...old, notes: "b" } },
      { "requirement/r": { ...old, notes: "c" } },
    ],
    [{ "requirement/r": old }, {}, { "requirement/r": { ...old, notes: "c" } }],
    [
      { "requirement/r": old },
      { "requirement/r": { ...old, services: ["pool", "gym"] } },
      { "requirement/r": { ...old, services: ["pool", "sea"] } },
    ],
  ])
    assert.equal(mergeWorkspace(base, local, remote).conflicts.length, 1);
});
