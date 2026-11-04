import test from "node:test";
import assert from "node:assert/strict";
import "./platformModuleStubs.ts";
import {
  mergeWorkspace,
  createWorkspaceSync,
  stableSync,
  type SyncRecords,
  type CloudWorkspace,
} from "../services/workspaceSync.ts";
import {
  createOfflineAccountCache,
  offlineOwnerMatches,
} from "../services/offlineAccount.ts";
import { createWorkspaceMedia } from "../services/workspaceMedia.ts";
import { createAccountCloudRequest } from "../services/workspaceCloud.ts";
import { WebStore, SQLiteStore } from "../services/persistence.ts";
import {
  readBusiness,
  validateBusiness,
} from "../services/workspaceSnapshot.ts";
import { createPerson } from "../services/people.ts";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import type { Property } from "@workspace/property-domain";
const owner = "179f829a-eb0d-44ad-8e64-e64a87900c41";
function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: async (k: string) => {
      map.delete(k);
    },
  };
}
function harness(initial: SyncRecords = {}) {
  let remote: CloudWorkspace = { revision: 0, records: {} },
    current = structuredClone(initial),
    online = true,
    active = true,
    failApply = false,
    failSave = false;
  const storage = memory(),
    original = storage.setItem;
  storage.setItem = async (k, v) => {
    if (failSave) throw new Error("disk");
    return original(k, v);
  };
  const local = {
    read: async () => structuredClone(current),
    apply: async (expected: SyncRecords, next: SyncRecords) => {
      if (failApply) throw new Error("apply interrupted");
      assert.equal(stableSync(current), stableSync(expected));
      current = structuredClone(next);
    },
  };
  const cloud = {
    read: async () => {
      if (!online) throw new Error("offline");
      return structuredClone(remote);
    },
    write: async (expected: number, records: SyncRecords) => {
      if (!online) throw new Error("offline");
      if (expected !== remote.revision)
        return { accepted: false, workspace: structuredClone(remote) };
      remote = {
        revision: remote.revision + 1,
        records: structuredClone(records),
      };
      return { accepted: true, workspace: structuredClone(remote) };
    },
  };
  const assertActive = () => {
    if (!active) throw new Error("ACCOUNT_SCOPE_CLOSED");
  };
  const make = () => createWorkspaceSync(storage, local, cloud, assertActive);
  return {
    storage,
    local,
    cloud,
    make,
    setLocal: (v: SyncRecords) => {
      current = structuredClone(v);
    },
    localValue: () => current,
    remote: () => remote,
    setRemote: (v: SyncRecords) => {
      remote = { revision: remote.revision + 1, records: structuredClone(v) };
    },
    offline: () => {
      online = false;
    },
    online: () => {
      online = true;
    },
    revoke: () => {
      active = false;
    },
    failApply: (v: boolean) => {
      failApply = v;
    },
    failSave: (v: boolean) => {
      failSave = v;
    },
  };
}
test("three-way merge preserves independent updates and propagates deletions without resurrecting unchanged records", () => {
  assert.deepEqual(
    mergeWorkspace(
      { "person/a": { name: "a" }, "person/b": { name: "b" } },
      { "person/a": { name: "new" }, "person/b": { name: "b" } },
      { "person/a": { name: "a" }, "person/b": { name: "remote" } },
    ),
    {
      records: { "person/a": { name: "new" }, "person/b": { name: "remote" } },
      conflicts: [],
    },
  );
  assert.deepEqual(
    mergeWorkspace(
      { "person/a": { name: "a" } },
      {},
      { "person/a": { name: "a" } },
    ).records,
    {},
  );
  assert.equal(
    mergeWorkspace(
      { "person/a": { name: "a" } },
      {},
      { "person/a": { name: "changed" } },
    ).conflicts.length,
    1,
  );
});
test("offline changes survive restart and synchronize only after network recovery", async () => {
  const h = harness({ "person/a": { name: "original" } });
  await h.make().sync();
  h.offline();
  h.setLocal({
    "person/a": { name: "offline edit" },
    "task/1": { title: "local task" },
  });
  await assert.rejects(h.make().sync(), /offline/);
  assert.equal((h.localValue()["person/a"] as any).name, "offline edit");
  h.online();
  const state = await h.make().sync();
  assert.equal(state.conflicts.length, 0);
  assert.deepEqual(h.remote().records, h.localValue());
});
test("two devices with overlapping edits retain both versions, resolve explicitly, and reject stale resolutions", async () => {
  const h = harness({ "person/a": { name: "base" } }),
    sync = h.make();
  await sync.sync();
  h.setLocal({ "person/a": { name: "device" } });
  h.setRemote({ "person/a": { name: "cloud" } });
  const state = await sync.sync();
  assert.equal(state.conflicts.length, 1);
  assert.equal((h.remote().records["person/a"] as any).name, "cloud");
  assert.equal((h.localValue()["person/a"] as any).name, "device");
  await sync.resolve("person/a", "remote");
  h.setRemote({ "person/a": { name: "newer cloud" } });
  assert.equal((await sync.sync()).conflicts.length, 1);
  await sync.resolve("person/a", "remote");
  await sync.sync();
  assert.equal((h.localValue()["person/a"] as any).name, "newer cloud");
});
test("interrupted apply and interrupted acknowledgement preserve durable local changes and retry without duplicates", async () => {
  const h = harness({ "person/a": { name: "base" } }),
    sync = h.make();
  await sync.sync();
  h.setLocal({ "person/a": { name: "updated" } });
  h.failApply(true);
  await assert.rejects(sync.sync(), /apply interrupted/);
  h.failApply(false);
  await h.make().sync();
  assert.equal(Object.keys(h.remote().records).length, 1);
  assert.deepEqual(h.localValue(), h.remote().records);
  h.setLocal({ "person/a": { name: "again" } });
  h.failSave(true);
  await assert.rejects(sync.sync(), /disk/);
  h.failSave(false);
  await h.make().sync();
  assert.deepEqual(h.localValue(), h.remote().records);
});
test("concurrent cloud CAS rejection retries a fresh merge; same-flight calls share one run", async () => {
  const h = harness({ "person/a": { name: "a" } });
  let writes = 0;
  const original = h.cloud.write;
  h.cloud.write = async (e, r) => {
    writes++;
    if (writes === 1) {
      h.setRemote({ "task/remote": { title: "remote" } });
      return { accepted: false, workspace: h.remote() };
    }
    return original(e, r);
  };
  const sync = h.make();
  await Promise.all([sync.sync(), sync.sync()]);
  assert.equal(writes, 2);
  assert.deepEqual(Object.keys(h.remote().records).sort(), [
    "person/a",
    "task/remote",
  ]);
});
test("account revocation during network flight prevents applying data or acknowledging a foreign workspace", async () => {
  const h = harness({ "person/a": { name: "a" } });
  h.cloud.read = async () => {
    h.revoke();
    return { revision: 1, records: { "person/b": { name: "b" } } };
  };
  await assert.rejects(h.make().sync(), /ACCOUNT_SCOPE_CLOSED/);
  assert.deepEqual(h.localValue(), { "person/a": { name: "a" } });
});
test("invalid merged references are not published before local validation", async () => {
  const h = harness({ "person/a": { name: "a" } });
  let writes = 0;
  h.cloud.write = async () => {
    writes++;
    throw new Error("should not publish");
  };
  const sync = createWorkspaceSync(
    h.storage,
    {
      ...h.local,
      validate: async () => {
        throw new Error("SYNC_UNKNOWN_RECORD_KIND");
      },
    },
    h.cloud,
    () => {},
  );
  await assert.rejects(sync.sync(), /SYNC_UNKNOWN_RECORD_KIND/);
  assert.equal(writes, 0);
});
test("secure offline receipt survives expiry, cannot change owner through a profile, and explicit forget removes it", async () => {
  const storage = memory(),
    cache = createOfflineAccountCache(storage, "fixture");
  const account = {
    userId: owner,
    email: "fixture@test.invalid",
    expiresAt: 1,
  };
  const profile = {
    user_id: owner,
    display_name: "Test",
    phone: "50000000",
    company: "",
    classification: "broker" as const,
    other_classification: "",
  };
  await cache.remember(account, profile);
  assert.deepEqual((await cache.read())?.account, account);
  await assert.rejects(
    cache.remember(account, {
      ...profile,
      user_id: "29f45c92-1f5e-472b-b59c-06f24ba60eba",
    }),
    /OWNER_MISMATCH/,
  );
  await cache.forget();
  assert.equal(await cache.read(), null);
});
test("media synchronizes verified bytes, never publishes a local file path, and rejects corrupt downloads", async () => {
  const hash = "a".repeat(64),
    bytes = new Uint8Array([1, 2, 3]).buffer;
  let uploads = 0;
  const media = createWorkspaceMedia(
    {
      read: async () => bytes,
      hash: async () => hash,
      upload: async () => {
        uploads++;
      },
      download: async () => bytes,
      write: async () => `file:///private/${hash}`,
    },
    () => {},
  );
  const records = {
    "property/p": {
      core: { id: "p" },
      attachments: [
        {
          id: "one",
          managedUri: "file:///private/original",
          mimeType: "image/jpeg",
        },
        {
          id: "two",
          managedUri: "file:///private/same-bytes",
          mimeType: "image/jpeg",
        },
      ],
    },
  };
  const cloud = await media.encode(records);
  assert.equal(JSON.stringify(cloud).includes("file:///"), false);
  assert.equal(uploads, 1);
  assert.equal(stableSync(media.canonical(records)), stableSync(cloud));
  await media.decode(cloud);
  const bad = createWorkspaceMedia(
    {
      read: async () => bytes,
      hash: async () => "b".repeat(64),
      upload: async () => {},
      download: async () => bytes,
      write: async () => {
        throw new Error("do not write corrupt bytes");
      },
    },
    () => {},
  );
  await assert.rejects(bad.decode(cloud), /HASH_MISMATCH/);
});
test("cloud requests pin their owner-checked JWT in each request and classify temporary failures", async () => {
  let header = "";
  const request = createAccountCloudRequest(
    { url: "https://fixture.supabase.co", publishableKey: "public" },
    async () => "fixture-token",
    () => {},
    async (_url, options) => {
      header = (options?.headers as Record<string, string>).Authorization;
      return new Response("[]");
    },
  );
  await request("/rest/v1/account_workspaces");
  assert.equal(header, "Bearer fixture-token");
  const offline = createAccountCloudRequest(
    { url: "https://fixture.supabase.co", publishableKey: "public" },
    async () => "t",
    () => {},
    async () => new Response("", { status: 503 }),
  );
  await assert.rejects(
    offline("/rest/v1/account_workspaces"),
    /CONNECTION_UNAVAILABLE/,
  );
});
const property: Property = {
  core: {
    id: "property-a",
    propertyType: "apartment",
    locationArea: { id: "salmiya" },
  },
  activeOffer: {
    id: "offer-a",
    propertyCoreId: "property-a",
    transaction: "rent",
    rentalPrice: { amount: 400, currencyCode: "KWD" },
    rentalPeriodId: "monthly",
  },
};
const person = createPerson({
  id: "person-a",
  name: "Person",
  displayPhone: "50000000",
  classifications: ["seeker"],
});
test("real WebStore snapshot CAS preserves all records, rejects races and rolls back a failed write", async () => {
  const storage = memory(),
    locks = {
      request: async <T>(_n: string, _o: unknown, work: () => Promise<T>) =>
        work(),
    },
    store = new WebStore(storage, locks);
  await store.init();
  await store.saveProperty(property);
  await store.savePerson(person);
  const before = await readBusiness(store),
    next = {
      ...before,
      properties: [{ ...property, core: { ...property.core, block: "3" } }],
    };
  await store.replaceWorkspace(before, next);
  assert.deepEqual(
    await store.getProperty(property.core.id),
    next.properties[0],
  );
  await assert.rejects(store.replaceWorkspace(before, next), /LOCAL_CHANGED/);
  const original = storage.setItem;
  let failed = false;
  storage.setItem = async (k, v) => {
    if (k === "@viewstate_people_v1" && !failed) {
      failed = true;
      throw new Error("disk");
    }
    return original(k, v);
  };
  await assert.rejects(
    store.replaceWorkspace(next, {
      ...before,
      people: [{ ...person, name: "changed too" }],
    }),
    /disk/,
  );
  assert.deepEqual(await readBusiness(store), next);
});
test("SQLite snapshot replacement is an actual transaction and rolls back all tables on interruption", async () => {
  const db = new DatabaseSync(":memory:");
  let fail = false;
  const adapter = {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    runAsync: async (sql: string, args: unknown[] = []) => {
      if (fail && sql.startsWith("INSERT INTO people"))
        throw new Error("write interrupted");
      return db.prepare(sql).run(...(args as any[]));
    },
    getAllAsync: async (sql: string, args: unknown[] = []) =>
      db.prepare(sql).all(...(args as any[])),
    getFirstAsync: async (sql: string, args: unknown[] = []) =>
      db.prepare(sql).get(...(args as any[])) ?? null,
    withTransactionAsync: async (work: () => Promise<void>) => {
      db.exec("BEGIN");
      try {
        await work();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as SQLiteDatabase;
  const store = new SQLiteStore(async () => adapter);
  await store.init();
  await store.saveProperty(property);
  await store.savePerson(person);
  const before = await readBusiness(store),
    after = { ...before, properties: [] };
  fail = true;
  await assert.rejects(store.replaceWorkspace(before, after), /interrupted/);
  assert.deepEqual(await readBusiness(store), before);
  fail = false;
  await store.replaceWorkspace(before, after);
  assert.equal((await store.getProperties()).length, 0);
  assert.equal((await store.getPeople()).length, 1);
  db.close();
});
test("workspace validation rejects foreign references and never silently merges contacts with the same phone", () => {
  assert.throws(
    () =>
      validateBusiness({
        properties: [],
        people: [person, { ...person, id: "other" }],
        requirements: [],
        links: [],
        sources: [],
      }),
    /CONTACT_CONFLICT/,
  );
});

test("offline receipt cannot expose the previous owner after SDK identity changes or sign-out", () => {
  const a = {
    version: 1 as const,
    account: { userId: owner, email: "fixture@test.invalid", expiresAt: 1 },
    profile: {
      user_id: owner,
      display_name: "Test",
      phone: "50000000",
      company: "",
      classification: "broker" as const,
      other_classification: "",
    },
  };
  assert.equal(
    offlineOwnerMatches(a, JSON.stringify({ user: { id: owner } }), owner),
    true,
  );
  assert.equal(
    offlineOwnerMatches(
      a,
      JSON.stringify({ user: { id: "29f45c92-1f5e-472b-b59c-06f24ba60eba" } }),
      undefined,
    ),
    false,
  );
  assert.equal(
    offlineOwnerMatches(
      a,
      JSON.stringify({ user: { id: owner } }),
      "29f45c92-1f5e-472b-b59c-06f24ba60eba",
    ),
    false,
  );
  assert.equal(offlineOwnerMatches(a, null, undefined), false);
  assert.equal(
    offlineOwnerMatches(a, JSON.stringify({ user: { id: owner } }), null),
    false,
  );
});
test("late profile synchronization cannot overwrite a newer offline edit or resurrect a signed-out receipt", async () => {
  const cache = createOfflineAccountCache(memory(), "fixture"),
    account = { userId: owner, email: "fixture@test.invalid", expiresAt: 1 };
  const old = {
    user_id: owner,
    display_name: "Old",
    phone: "50000000",
    company: "",
    classification: "broker" as const,
    other_classification: "",
  };
  await cache.remember(account, old, true);
  await cache.remember(account, { ...old, display_name: "New" }, true);
  await cache.acknowledgeProfile(old, account, old);
  assert.equal((await cache.read())?.profile.display_name, "New");
  assert.equal((await cache.read())?.pendingProfile, true);
  await cache.forget();
  await cache.acknowledgeProfile(old, account, old);
  assert.equal(await cache.read(), null);
});
