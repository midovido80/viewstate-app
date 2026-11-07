import test from "node:test";
import assert from "node:assert/strict";
import "./platformModuleStubs.ts";
import { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import {
  checkMatchEligibility,
  validateProperty,
  type Property,
  type SeekerRequirement,
} from "@workspace/property-domain";
import { WebStore, SQLiteStore } from "../services/persistence.ts";
import { createPerson } from "../services/people.ts";
import {
  changeListingStatus,
  withListingStatus,
  listingStatus,
} from "../services/propertyLifecycle.ts";
import { deleteSavedProperty } from "../services/propertyDeletion.ts";
import { cleanupDeletedProperties } from "../services/propertyDeletionCleanup.ts";
import {
  readBusiness,
  businessRecords,
  fromBusinessRecords,
} from "../services/workspaceSnapshot.ts";
import {
  createWorkspaceSync,
  mergeWorkspace,
  type SyncRecords,
} from "../services/workspaceSync.ts";
import {
  createFollowup,
  initialAssistant,
} from "../services/dailyAssistant.ts";
import { createAssistantRepository } from "../services/dailyAssistantRepository.ts";
import { createMatchNoticeRepository } from "../services/matchNotifications.ts";
import { propertyEditDraftKey } from "../services/propertyUpdateRecovery.ts";
import { propertyOfferStatus } from "../services/propertyVisualPresentation.ts";
const property: Property = {
  core: {
    id: "listing-a",
    propertyType: "apartment",
    locationArea: { id: "salmiya" },
  },
  activeOffer: {
    id: "offer-a",
    propertyCoreId: "listing-a",
    transaction: "rent",
    rentalPrice: { amount: 400, currencyCode: "KWD" },
    rentalPeriodId: "monthly",
  },
};
const person = createPerson({
  id: "person-a",
  name: "Test",
  displayPhone: "50000000",
  classifications: ["seeker", "owner"],
});
const requirement: SeekerRequirement = {
  id: "11111111-1111-4111-8111-111111111111",
  seekerId: person.id,
  propertyType: "apartment",
  purpose: "rent",
  budget: { minimum: 300, maximum: 500, currencyCode: "KWD" },
  preferredAreaIds: ["salmiya"],
  preferredAreaMode: "specific_areas",
  rentalPeriodId: "monthly",
  notes: "",
};
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
const locks = {
  request: async <T>(_n: string, _o: unknown, work: () => Promise<T>) => work(),
};
function sqlite() {
  const db = new DatabaseSync(":memory:");
  const adapter = {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    runAsync: async (sql: string, args: any[] = []) =>
      db.prepare(sql).run(...args),
    getAllAsync: async (sql: string, args: any[] = []) =>
      db.prepare(sql).all(...args),
    getFirstAsync: async (sql: string, args: any[] = []) =>
      db.prepare(sql).get(...args) ?? null,
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
  } as unknown as SQLiteDatabase;
  return {
    store: new SQLiteStore(async () => adapter),
    close: () => db.close(),
  };
}
for (const backend of ["web", "sqlite"] as const)
  test(`${backend}: durable delete preserves people/requests, cleans links and rejects resurrection`, async () => {
    const storage = memory(),
      native = backend === "sqlite" ? sqlite() : undefined,
      store = native?.store ?? new WebStore(storage, locks);
    try {
      await store.init();
      await store.saveProperty(property);
      await store.savePerson(person);
      await store.saveRequirement(requirement);
      await store.linkPersonToProperty({
        personId: person.id,
        propertyCoreId: property.core.id,
      });
      await store.setPropertySource({
        propertyCoreId: property.core.id,
        personId: person.id,
        role: "owner",
      });
      const before = await readBusiness(store);
      assert.equal(
        (
          await deleteSavedProperty({
            store,
            expected: property,
            evidenceStorage: storage,
          })
        ).status,
        "deleted",
      );
      assert.deepEqual(await store.getProperties(), []);
      assert.equal((await store.getPeople()).length, 1);
      assert.equal((await store.getRequirements()).length, 1);
      assert.deepEqual(await store.getPersonPropertyLinks(), []);
      assert.equal(await store.getPropertySource(property.core.id), null);
      assert.deepEqual(await store.getDeletedPropertyIds(), [property.core.id]);
      await assert.rejects(store.saveProperty(property), /PROPERTY_ID_DELETED/);
      assert.equal(
        await store.compareAndUpdate(property, {
          ...property,
          listingTitle: "stale",
        }),
        false,
      );
      const now = await readBusiness(store);
      await assert.rejects(
        store.replaceWorkspace(now, before),
        /PROPERTY_ID_DELETED/,
      );
      const records = businessRecords(now, initialAssistant());
      assert.deepEqual(records[`property/${property.core.id}`], {
        version: 1,
        deleted: true,
      });
      assert.deepEqual(
        fromBusinessRecords(records, initialAssistant()).data
          .deletedPropertyIds,
        [property.core.id],
      );
      if (backend === "web") {
        const reopened = new WebStore(storage, locks);
        await reopened.init();
        assert.deepEqual(await reopened.getProperties(), []);
      }
    } finally {
      native?.close();
    }
  });
test("failed web deletion rolls back without losing people; retry succeeds", async () => {
  const storage = memory(),
    store = new WebStore(storage, locks);
  await store.init();
  await store.saveProperty(property);
  await store.savePerson(person);
  const set = storage.setItem;
  let failed = false;
  storage.setItem = async (k, v) => {
    if (k === "@viewstate_people_v1" && !failed) {
      failed = true;
      throw Error("disk");
    }
    await set(k, v);
  };
  assert.equal(
    (
      await deleteSavedProperty({
        store,
        expected: property,
        evidenceStorage: storage,
      })
    ).status,
    "failed",
  );
  const reopened = new WebStore(storage, locks);
  await reopened.init();
  assert.equal((await reopened.getProperties()).length, 1);
  assert.equal((await reopened.getPeople()).length, 1);
  assert.equal(
    (
      await deleteSavedProperty({
        store: reopened,
        expected: property,
        evidenceStorage: storage,
      })
    ).status,
    "deleted",
  );
});
test("stale confirmation and pending edits leave the property intact", async () => {
  const storage = memory(),
    store = new WebStore(storage, locks);
  await store.init();
  await store.saveProperty(property);
  await storage.setItem(propertyEditDraftKey(property.core.id), "pending");
  assert.equal(
    (
      await deleteSavedProperty({
        store,
        expected: property,
        evidenceStorage: storage,
      })
    ).status,
    "evidence_blocked",
  );
  await assert.rejects(
    changeListingStatus({
      store,
      expected: property,
      status: "paused",
      storage,
    }),
    /PENDING_PROPERTY_EDIT_DRAFT/,
  );
  await storage.removeItem(propertyEditDraftKey(property.core.id));
  const updated = await changeListingStatus({
    store,
    expected: property,
    status: "paused",
    storage,
  });
  assert.equal((await store.deleteProperty(property)).status, "stale");
  assert.deepEqual(await store.getProperty(property.core.id), updated);
});
test("status is validated, reversible and excluded by the original matching evaluator", () => {
  for (const status of ["paused", "rented"] as const) {
    const next = withListingStatus(property, status);
    assert.equal(listingStatus(next), status);
    assert.equal(
      checkMatchEligibility(requirement, { property: next }).eligible,
      false,
    );
    assert.equal(listingStatus(withListingStatus(next, "active")), "active");
  }
  const sale = {
    ...property,
    activeOffer: {
      id: "sale-a",
      propertyCoreId: property.core.id,
      transaction: "sale",
      salePrice: { amount: 50000, currencyCode: "KWD" },
    },
  } as Property;
  const sold = withListingStatus(sale, "sold");
  assert.equal(validateProperty(sold).ok, true);
  assert.equal(propertyOfferStatus(sold, "ar").label, "مباع");
  assert.equal(
    checkMatchEligibility(requirement, { property: sold }).eligible,
    false,
  );
  assert.throws(() => withListingStatus(property, "sold"));
  assert.throws(() => withListingStatus(sale, "rented"));
  assert.equal(
    propertyOfferStatus(withListingStatus(property, "paused"), "ar").label,
    "متوقف تسويقه",
  );
});
test("offline deletion beats stale remote edits, including first sync, without deleting requests", async () => {
  const id = property.core.id,
    deleted: SyncRecords = {
      [`property/${id}`]: { version: 1, deleted: true },
      "person/a": { id: "a" },
      "requirement/a": { id: "a" },
    };
  const remote: SyncRecords = {
    [`property/${id}`]: { ...property, listingTitle: "edited elsewhere" },
    [`source/${id}`]: { propertyCoreId: id },
    "link/a/p": { propertyCoreId: id },
    "task/t": { id: "t", propertyId: id },
    "task/other": { id: "other", propertyId: "other" },
  };
  const merge = mergeWorkspace({}, deleted, remote);
  assert.deepEqual(merge.conflicts, []);
  assert.deepEqual(merge.records[`property/${id}`], {
    version: 1,
    deleted: true,
  });
  assert.equal(merge.records["task/t"], undefined);
  assert.ok(merge.records["task/other"]);
  assert.ok(merge.records["person/a"]);
  let local = deleted,
    cloud = { revision: 5, records: remote },
    online = false;
  const engine = createWorkspaceSync(
    memory(),
    {
      read: async () => structuredClone(local),
      apply: async (_, next) => {
        local = next;
      },
    },
    {
      read: async () => {
        if (!online) throw Error("offline");
        return cloud;
      },
      write: async (revision, records) => {
        assert.equal(revision, cloud.revision);
        cloud = { revision: revision + 1, records };
        return { accepted: true, workspace: cloud };
      },
    },
    () => {},
  );
  await assert.rejects(engine.sync(), /offline/);
  assert.deepEqual(local[`property/${id}`], { version: 1, deleted: true });
  online = true;
  await engine.sync();
  await engine.sync();
  assert.deepEqual(cloud.records[`property/${id}`], {
    version: 1,
    deleted: true,
  });
  assert.deepEqual(local[`property/${id}`], { version: 1, deleted: true });
  assert.ok(cloud.records["requirement/a"]);
});
test("cleanup retries failed file removal and preserves independently owned inbox media", async () => {
  const storage = memory(),
    store = new WebStore(storage, locks);
  await store.init();
  const media = (id: string, managedUri: string) => ({
    id,
    kind: "image" as const,
    originalName: id,
    mimeType: "image/jpeg",
    order: id === "own" ? 0 : 1,
    managedUri,
    privacy: {
      classification: "normal" as const,
      disclosurePolicy: "normal" as const,
    },
  });
  const target: Property = {
    ...property,
    attachments: [
      media("own", "file:///own"),
      media("shared", "file:///shared"),
    ],
  };
  assert.equal(validateProperty(target).ok, true);
  await store.saveProperty(target);
  await storage.setItem(
    "@viewstate/import-inbox/v1",
    JSON.stringify({
      version: 1,
      entries: [{ files: [{ uri: "file:///shared" }] }],
    }),
  );
  const assistant = createAssistantRepository(storage),
    notices = createMatchNoticeRepository(storage),
    deleted: string[] = [];
  let fail = true;
  assert.equal(
    (
      await deleteSavedProperty({
        store,
        expected: target,
        evidenceStorage: storage,
      })
    ).status,
    "deleted",
  );
  const at = "2026-11-07T10:00:00.000Z";
  const inventory = {
    people: [],
    properties: [{ id: property.core.id, title: "Target" }],
  };
  const draft = {
    kind: "note" as const,
    title: "Property note",
    date: "2026-11-07",
    time: "",
    duration: 15,
    personId: "",
    personName: "",
    propertyId: property.core.id,
    notes: "",
  };
  await assistant.update((s) =>
    createFollowup(
      createFollowup(s, draft, inventory, "owned", at),
      { ...draft, propertyId: "", title: "Unrelated" },
      inventory,
      "keep",
      at,
    ),
  );
  const pair = JSON.stringify(["person-a", property.core.id]);
  await notices.update((s) => ({
    ...s,
    seen: { [pair]: "fingerprint", "legacy-key": "keep" },
    entries: [
      {
        id: "notice",
        pair,
        fingerprint: "f",
        propertyId: property.core.id,
        personId: "person-a",
        requirementId: "request",
        createdAt: at,
        read: false,
        prompted: false,
      },
    ],
  }));
  const options = {
    store,
    storage,
    assistant,
    notices,
    deleteFile: async (uri: string) => {
      if (fail) throw Error("file busy");
      deleted.push(uri);
    },
  };
  await assert.rejects(cleanupDeletedProperties(options), /file busy/);
  fail = false;
  await cleanupDeletedProperties(options);
  await cleanupDeletedProperties(options);
  assert.deepEqual(deleted, ["file:///own"]);
  assert.deepEqual(
    (await assistant.load()).tasks.map((t) => t.id),
    ["keep"],
  );
  assert.deepEqual((await notices.load()).entries, []);
  assert.equal((await notices.load()).seen["legacy-key"], "keep");
});
