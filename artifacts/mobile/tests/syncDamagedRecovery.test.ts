import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceSync,
  SYNC_STATE_KEY,
  type SyncRecords,
} from "../services/workspaceSync.ts";

test("damaged sync state requires explicit recovery and reviews every difference without changing either workspace", async () => {
  const map = new Map([[SYNC_STATE_KEY, "{broken"]]);
  let current: SyncRecords = {
    "person/local": { name: "Local" },
    "person/both": { name: "Device" },
  };
  let remote = {
    revision: 4,
    records: {
      "person/remote": { name: "Cloud" },
      "person/both": { name: "Server" },
    } as SyncRecords,
  };
  let writes = 0;
  const sync = createWorkspaceSync(
    {
      getItem: async (k) => map.get(k) ?? null,
      setItem: async (k, v) => {
        map.set(k, v);
      },
    },
    {
      read: async () => structuredClone(current),
      apply: async (_, next) => {
        current = next;
      },
    },
    {
      read: async () => structuredClone(remote),
      write: async (_, records) => {
        writes++;
        remote = { revision: 5, records };
        return { accepted: true, workspace: remote };
      },
    },
    () => {},
  );
  await assert.rejects(sync.sync(), /SYNC_STATE_DAMAGED/);
  const state = await sync.recoverDamagedState();
  assert.equal(state.conflicts.length, 3);
  assert.equal(writes, 0);
  assert.ok(
    [...map.values()].some(
      (raw) =>
        raw.includes("{broken") &&
        raw.includes("Cloud") &&
        raw.includes("Local"),
    ),
  );
  assert.equal((await sync.sync()).conflicts.length, 3);
  await sync.resolve("person/local", "local");
  assert.equal((await sync.sync()).conflicts.length, 2);
  await sync.resolve("person/remote", "remote");
  await sync.resolve("person/both", "local");
  await sync.sync();
  assert.deepEqual(current, remote.records);
  assert.deepEqual(Object.keys(current).sort(), [
    "person/both",
    "person/local",
    "person/remote",
  ]);
  assert.equal((current["person/both"] as { name: string }).name, "Device");
});

test("recovery refuses to replace damaged metadata unless its backup is durable", async () => {
  const map = new Map([[SYNC_STATE_KEY, "null"]]);
  const sync = createWorkspaceSync(
    { getItem: async (k) => map.get(k) ?? null, setItem: async () => {} },
    {
      read: async () => ({ "person/a": { name: "Saved" } }),
      apply: async () => {
        throw new Error("must not apply");
      },
    },
    {
      read: async () => ({ revision: 1, records: {} }),
      write: async () => {
        throw new Error("must not write");
      },
    },
    () => {},
  );
  await assert.rejects(sync.recoverDamagedState(), /SYNC_STATE_WRITE_FAILED/);
  assert.equal(map.get(SYNC_STATE_KEY), "null");
});

test("recovery reopens a chosen record when cloud changes before the final decision", async () => {
  const map = new Map([[SYNC_STATE_KEY, "[]"]]);
  const current: SyncRecords = {
    "person/a": { name: "Device" },
    "person/b": { name: "Device B" },
  };
  let remote = {
    revision: 1,
    records: {
      "person/a": { name: "Cloud" },
      "person/b": { name: "Cloud B" },
    } as SyncRecords,
  };
  const sync = createWorkspaceSync(
    {
      getItem: async (k) => map.get(k) ?? null,
      setItem: async (k, v) => {
        map.set(k, v);
      },
    },
    {
      read: async () => structuredClone(current),
      apply: async () => {
        throw new Error("must not apply");
      },
    },
    {
      read: async () => structuredClone(remote),
      write: async () => {
        throw new Error("must not write");
      },
    },
    () => {},
  );
  await sync.recoverDamagedState();
  await sync.resolve("person/a", "local");
  remote = {
    revision: 2,
    records: { ...remote.records, "person/a": { name: "New cloud" } },
  };
  await sync.resolve("person/b", "remote");
  const state = await sync.sync();
  assert.deepEqual(
    state.conflicts.map((c) => c.key),
    ["person/a"],
  );
  assert.deepEqual(state.conflicts[0].remote, { name: "New cloud" });
});
