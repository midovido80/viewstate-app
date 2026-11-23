import test from "node:test";
import assert from "node:assert/strict";
import "./platformModuleStubs";
import {
  createWorkspaceSync,
  type SyncRecords,
} from "../services/workspaceSync";
import { fromBusinessRecords } from "../services/workspaceSnapshot";
import { decodeAssistant } from "../services/dailyAssistant";
import { WebStore, SQLiteStore } from "../services/persistence";
import { readBusiness, validateBusiness } from "../services/workspaceSnapshot";
import type { Person } from "../services/people";
import type { SeekerRequirement } from "@workspace/property-domain";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

const requestId = "44444444-4444-4444-8444-444444444444";
const missingPersonId = "55555555-5555-4555-8555-555555555555";
function fixture() {
  const records: SyncRecords = {};
  for (let i = 0; i < 13; i++)
    records[`person/p${i}`] = {
      id: `p${i}`,
      name: `وسيط ${i}`,
      displayPhone: `+9655000${String(i).padStart(4, "0")}`,
      normalizedPhone: `+9655000${String(i).padStart(4, "0")}`,
      classifications: ["broker"],
      notes: "",
    };
  records[`requirement/${requestId}`] = {
    id: requestId,
    seekerId: missingPersonId,
    purpose: "rent",
    propertyType: "villa",
    preferredAreaMode: "specific_areas",
    preferredAreaIds: ["salmiya"],
    budget: { currencyCode: "KWD", minimum: 6000, maximum: 6500 },
    notes: "طلب محفوظ لا يجوز حذفه",
    rentalPeriodId: "monthly",
  };
  return records;
}
function harness(records = fixture()) {
  let current = structuredClone(records),
    remote = { revision: 0, records: {} as SyncRecords },
    failApply = false,
    writes = 0;
  const storage = new Map<string, string>();
  const make = () =>
    createWorkspaceSync(
      {
        getItem: async (k) => storage.get(k) ?? null,
        setItem: async (k, v) => {
          storage.set(k, v);
        },
      },
      {
        read: async () => structuredClone(current),
        validate: async (candidate) => {
          fromBusinessRecords(candidate, decodeAssistant(null));
        },
        apply: async (expected, next) => {
          if (failApply) throw Error("interrupted apply");
          assert.deepEqual(current, expected);
          current = structuredClone(next);
        },
      },
      {
        read: async () => structuredClone(remote),
        write: async (revision, next) => {
          assert.equal(revision, remote.revision);
          writes++;
          remote = { revision: revision + 1, records: structuredClone(next) };
          return { accepted: true, workspace: structuredClone(remote) };
        },
      },
      () => {},
    );
  return {
    make,
    current: () => current,
    remote: () => remote,
    writes: () => writes,
    setLocal: (value: SyncRecords) => {
      current = structuredClone(value);
    },
    failApply: (value: boolean) => {
      failApply = value;
    },
  };
}

test("one missing client reference identifies the request, not all 14 unpublished records", async () => {
  const h = harness(),
    state = await h.make().sync();
  assert.equal(state.conflicts.length, 1);
  assert.equal(state.conflicts[0].key, `requirement/${requestId}`);
  assert.equal(
    state.conflicts[0].validationIssues?.[0].code,
    "missing_requirement_person",
  );
  assert.equal(h.writes(), 0);
  assert.equal(Object.keys(h.current()).length, 14);
});

test("explicit missing-client repair preserves all people, request fields and budget, then survives restart", async () => {
  const h = harness(),
    sync = h.make();
  await sync.sync();
  await sync.repairMissingRequirementPerson(`requirement/${requestId}`);
  const repaired = await h.make().sync();
  assert.equal(repaired.conflicts.length, 0);
  assert.equal(Object.keys(h.current()).length, 14);
  const request = h.current()[`requirement/${requestId}`] as Record<
    string,
    unknown
  >;
  assert.equal(request.seekerId, undefined);
  assert.deepEqual(request.budget, {
    currencyCode: "KWD",
    minimum: 6000,
    maximum: 6500,
  });
  assert.equal(request.notes, "طلب محفوظ لا يجوز حذفه");
  assert.deepEqual(h.current(), h.remote().records);
});

test("an interrupted repaired apply retries the acknowledged cloud version without creating a new conflict", async () => {
  const h = harness(),
    sync = h.make();
  await sync.sync();
  await sync.repairMissingRequirementPerson(`requirement/${requestId}`);
  h.failApply(true);
  await assert.rejects(sync.sync(), /interrupted apply/);
  h.failApply(false);
  assert.equal((await h.make().sync()).conflicts.length, 0);
  assert.equal(h.writes(), 1);
});

test("repair refuses a stale review instead of detaching a newly restored client", async () => {
  const h = harness(),
    sync = h.make();
  await sync.sync();
  const next = structuredClone(h.current());
  next[`person/${missingPersonId}`] = {
    ...(next["person/p0"] as object),
    id: missingPersonId,
    displayPhone: "+96559999999",
    normalizedPhone: "+96559999999",
  };
  h.setLocal(next);
  await assert.rejects(
    sync.repairMissingRequirementPerson(`requirement/${requestId}`),
    /SYNC_CONFLICT_CHANGED/,
  );
  const finalState = await sync.sync();
  assert.equal(
    finalState.conflicts.length,
    0,
    JSON.stringify(
      finalState.conflicts.map((c) => ({
        key: c.key,
        issues: c.validationIssues,
      })),
    ),
  );
  assert.equal(
    (h.current()[`requirement/${requestId}`] as Record<string, unknown>)
      .seekerId,
    missingPersonId,
  );
});

test("a client restored after queuing a repair keeps the relationship intact", async () => {
  const h = harness(),
    sync = h.make();
  await sync.sync();
  await sync.repairMissingRequirementPerson(`requirement/${requestId}`);
  const next = structuredClone(h.current());
  next[`person/${missingPersonId}`] = {
    ...(next["person/p0"] as object),
    id: missingPersonId,
    displayPhone: "+96559999999",
    normalizedPhone: "+96559999999",
  };
  h.setLocal(next);
  assert.equal((await sync.sync()).conflicts.length, 0);
  assert.equal(
    (h.current()[`requirement/${requestId}`] as Record<string, unknown>)
      .seekerId,
    missingPersonId,
  );
});

test("a newer local edit invalidates a queued repair without overwriting the edit", async () => {
  const h = harness(),
    sync = h.make();
  await sync.sync();
  await sync.repairMissingRequirementPerson(`requirement/${requestId}`);
  const next = structuredClone(h.current());
  (next[`requirement/${requestId}`] as Record<string, unknown>).notes =
    "ملاحظة أحدث";
  h.setLocal(next);
  assert.equal((await sync.sync()).conflicts.length, 1);
  assert.equal(h.writes(), 0);
  await sync.repairMissingRequirementPerson(`requirement/${requestId}`);
  assert.equal((await sync.sync()).conflicts.length, 0);
  assert.equal(
    (h.current()[`requirement/${requestId}`] as Record<string, unknown>).notes,
    "ملاحظة أحدث",
  );
});

test("separate missing-client repairs remain queued together until the whole workspace is valid", async () => {
  const records = fixture(),
    secondId = "66666666-6666-4666-8666-666666666666";
  records[`requirement/${secondId}`] = {
    ...(records[`requirement/${requestId}`] as object),
    id: secondId,
  };
  const h = harness(records),
    sync = h.make();
  assert.equal((await sync.sync()).conflicts.length, 2);
  await sync.repairMissingRequirementPerson(`requirement/${requestId}`);
  const pending = await sync.sync();
  assert.equal(pending.conflicts.length, 1);
  assert.equal(pending.conflicts[0].key, `requirement/${secondId}`);
  assert.equal(h.writes(), 0);
  await sync.repairMissingRequirementPerson(`requirement/${secondId}`);
  assert.equal((await sync.sync()).conflicts.length, 0);
  assert.equal(Object.keys(h.current()).length, 15);
});

for (const native of [false, true])
  test(`${native ? "SQLite" : "Web"} deleting a person preserves their requests without a broken owner link and rolls back interruptions`, async () => {
    const db = native ? new DatabaseSync(":memory:") : undefined;
    const values = new Map<string, string>();
    let fail = false;
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (fail && key.endsWith("@viewstate_people_v1")) {
          fail = false;
          throw Error("delete interrupted");
        }
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    };
    const adapter = db
      ? ({
          execAsync: async (sql: string) => {
            db.exec(sql);
          },
          runAsync: async (sql: string, args: unknown[] = []) => {
            if (fail && sql.startsWith("DELETE FROM people")) {
              fail = false;
              throw Error("delete interrupted");
            }
            return db.prepare(sql).run(...(args as never[]));
          },
          getAllAsync: async (sql: string, args: unknown[] = []) =>
            db.prepare(sql).all(...(args as never[])),
          getFirstAsync: async (sql: string, args: unknown[] = []) =>
            db.prepare(sql).get(...(args as never[])) ?? null,
          withTransactionAsync: async (work: () => Promise<void>) => {
            db.exec("BEGIN");
            try {
              await work();
              db.exec("COMMIT");
            } catch (error) {
              db.exec("ROLLBACK");
              throw error;
            }
          },
        } as unknown as SQLiteDatabase)
      : undefined;
    const store = native
      ? new SQLiteStore(async () => adapter!)
      : new WebStore(storage, {
          request: async <T>(
            _name: string,
            _options: unknown,
            work: () => Promise<T>,
          ) => work(),
        });
    try {
      await store.init();
      const person: Person = {
        ...(fixture()["person/p0"] as Person),
        id: missingPersonId,
      };
      await store.savePerson(person);
      await store.saveRequirement(
        fixture()[`requirement/${requestId}`] as SeekerRequirement,
      );
      const before = await readBusiness(store);
      fail = true;
      await assert.rejects(store.deletePerson(person.id), /delete interrupted/);
      assert.deepEqual(await readBusiness(store), before);
      assert.equal(await store.deletePerson(person.id), true);
      const after = await readBusiness(store);
      assert.equal(after.people.length, 0);
      assert.equal(after.requirements.length, 1);
      assert.equal(after.requirements[0].seekerId, undefined);
      assert.equal(after.requirements[0].notes, "طلب محفوظ لا يجوز حذفه");
      assert.doesNotThrow(() => validateBusiness(after));
      const reopened = native
        ? new SQLiteStore(async () => adapter!)
        : new WebStore(storage, {
            request: async <T>(
              _name: string,
              _options: unknown,
              work: () => Promise<T>,
            ) => work(),
          });
      await reopened.init();
      assert.deepEqual(await readBusiness(reopened), after);
      assert.equal(await reopened.deletePerson("missing-person"), false);
      assert.deepEqual(await readBusiness(reopened), after);
    } finally {
      db?.close();
    }
  });
