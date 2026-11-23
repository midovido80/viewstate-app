import test from "node:test";
import assert from "node:assert/strict";
import "./platformModuleStubs";
import { createImportInbox, type ImportEntry } from "../services/importInbox";
import { createFormSession } from "../services/formSession";
import { cancelImport, withActiveImport } from "../services/importLifecycle";
import {
  prepareCapturedDetails,
  loadPreparedCapturedDetails,
  CAPTURE_DETAILS_POINTER_KEY,
} from "../services/propertyCaptureSave";

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
    getAllKeys: async () => [...data.keys()],
  };
}
const entry: ImportEntry = {
  id: "import-test",
  createdAt: "2026-11-22",
  text: "للإيجار شقة بالسالمية 350 دينار",
  files: [],
  status: "received",
};
test("property cancellation clears only its unsaved prepared detail evidence", async () => {
  const storage = memory();
  const baseline = {
    core: {
      id: "target",
      propertyType: "apartment" as const,
      locationArea: { id: "salmiya" },
    },
    activeOffer: {
      id: "offer",
      propertyCoreId: "target",
      transaction: "rent" as const,
      rentalPrice: { amount: 350, currencyCode: "KWD" },
      rentalPeriodId: "monthly",
    },
  };
  const candidate = {
    ...baseline,
    core: { ...baseline.core, title: "شقة مستوردة" },
  };
  await prepareCapturedDetails(baseline, candidate, storage);
  await createImportInbox(storage).add({
    ...entry,
    targetKind: "property",
    targetId: "target",
  });
  await cancelImport({
    storage,
    importId: entry.id,
    store: { getProperty: async () => null, getRequirement: async () => null },
  });
  assert.equal(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY), null);
  assert.equal(await loadPreparedCapturedDetails("target", storage), null);
  await prepareCapturedDetails(baseline, candidate, storage);
  const other = {
    ...entry,
    id: "other",
    targetKind: "property" as const,
    targetId: "unrelated",
  };
  await createImportInbox(storage).add(other);
  await cancelImport({
    storage,
    importId: other.id,
    store: { getProperty: async () => null, getRequirement: async () => null },
  });
  assert.ok(await loadPreparedCapturedDetails("target", storage));
  assert.ok(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY));
});
for (const kind of ["property", "requirement"] as const)
  test(`${kind} cancellation clears only its import draft, blocks late writes and creates no record`, async () => {
    const storage = memory(),
      inbox = createImportInbox(storage);
    const e = {
      ...entry,
      targetKind: kind,
      targetId: "target",
      targetPath: JSON.stringify({
        pathname: kind === "property" ? "/capture" : "/requirement/new",
        params: { importId: entry.id },
      }),
    };
    await inbox.add(e);
    const review = createFormSession(storage, `import-review:${entry.id}`),
      form = createFormSession(storage, `form:import:${entry.id}`),
      other = createFormSession(storage, "unrelated");
    await review.write({ text: "draft" });
    await form.write({ price: 350 });
    await other.write({ keep: true });
    let records = 0,
      cleared = 0;
    const store = {
      getProperty: async () => null,
      getRequirement: async () => null,
    };
    await cancelImport({
      storage,
      store,
      importId: entry.id,
      clearDraft: async () => {
        cleared++;
      },
    });
    assert.equal((await inbox.read()).length, 0);
    assert.equal(await review.read(), null);
    assert.equal(await form.read(), null);
    assert.deepEqual(await other.read(), { keep: true });
    assert.equal(cleared, 1);
    await assert.rejects(form.write({ price: 999 }), /IMPORT_CANCELLED/);
    await assert.rejects(
      withActiveImport(storage, entry.id, async () => {
        records++;
      }),
      /IMPORT_CANCELLED/,
    );
    await inbox.add(e);
    assert.equal((await inbox.read()).length, 0);
    assert.equal(records, 0);
  });

test("cancel refuses a saved target and a pending save without removing the import", async () => {
  const storage = memory(),
    inbox = createImportInbox(storage);
  await inbox.add({ ...entry, targetKind: "property", targetId: "saved" });
  await assert.rejects(
    cancelImport({
      storage,
      importId: entry.id,
      store: {
        getProperty: async () => ({ id: "saved" }),
        getRequirement: async () => null,
      },
    }),
    /IMPORT_ALREADY_SAVED/,
  );
  assert.equal((await inbox.read()).length, 1);
  await assert.rejects(
    cancelImport({
      storage,
      importId: entry.id,
      store: {
        getProperty: async () => null,
        getRequirement: async () => null,
      },
      hasPendingSave: () => true,
    }),
    /IMPORT_SAVE_PENDING/,
  );
  assert.equal((await inbox.read()).length, 1);
});

test("interrupted cancellation retains a cleanup journal and retries after restart without recreating a draft", async () => {
  const storage = memory(),
    inbox = createImportInbox(storage);
  await inbox.add(entry);
  const form = createFormSession(storage, `form:import:${entry.id}`);
  await form.write({ draft: true });
  let fail = true;
  const clear = async () => {
    if (fail) throw Error("disk interrupted");
  };
  await assert.rejects(
    cancelImport({
      storage,
      importId: entry.id,
      store: {
        getProperty: async () => null,
        getRequirement: async () => null,
      },
      clearDraft: clear,
    }),
    /disk interrupted/,
  );
  await assert.rejects(
    withActiveImport(storage, entry.id, async () => {}),
    /IMPORT_CANCELLED/,
  );
  fail = false;
  await cancelImport({
    storage,
    importId: entry.id,
    store: { getProperty: async () => null, getRequirement: async () => null },
    clearDraft: clear,
  });
  assert.equal(await form.read(), null);
  assert.equal((await inbox.read()).length, 0);
});

test("an already running save completes before cancellation and a saved record is never treated as a disposable draft", async () => {
  const storage = memory(),
    inbox = createImportInbox(storage);
  await inbox.add({ ...entry, targetId: "p", targetKind: "property" });
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>((resolve) => {
      started = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  let saved = false;
  const saving = withActiveImport(storage, entry.id, async () => {
    started();
    await gate;
    saved = true;
  });
  await ready;
  const cancelling = cancelImport({
    storage,
    importId: entry.id,
    store: {
      getProperty: async () => (saved ? { id: "p" } : null),
      getRequirement: async () => null,
    },
  });
  const rejected = assert.rejects(cancelling, /IMPORT_ALREADY_SAVED/);
  release();
  await saving;
  await rejected;
  assert.equal((await inbox.read()).length, 1);
  assert.equal(saved, true);
});

test("a cancellation journal cannot clear a different import session", async () => {
  const storage = memory(),
    inbox = createImportInbox(storage);
  await inbox.add(entry);
  const other = createFormSession(storage, "form:import:other");
  await other.write({ keep: true });
  storage.data.set(
    "@viewstate/import-cancel/v1/" + entry.id,
    JSON.stringify({ version: 1, entry: {}, keys: [other.key] }),
  );
  await assert.rejects(
    cancelImport({
      storage,
      importId: entry.id,
      store: {
        getProperty: async () => null,
        getRequirement: async () => null,
      },
    }),
    /IMPORT_CANCEL_JOURNAL_UNREADABLE/,
  );
  assert.deepEqual(await other.read(), { keep: true });
  assert.equal((await inbox.read()).length, 1);
});

test("a failed inbox cancellation commit still blocks saving until its durable intent is recovered", async () => {
  const storage = memory(),
    inbox = createImportInbox(storage);
  await inbox.add(entry);
  const write = storage.setItem;
  let fail = true;
  storage.setItem = async (key, value) => {
    if (fail && key === "@viewstate/import-inbox/v1") {
      fail = false;
      throw Error("inbox disk interrupted");
    }
    await write(key, value);
  };
  await assert.rejects(
    cancelImport({
      storage,
      importId: entry.id,
      store: {
        getProperty: async () => null,
        getRequirement: async () => null,
      },
    }),
    /inbox disk interrupted/,
  );
  await assert.rejects(
    withActiveImport(storage, entry.id, async () => {}),
    /IMPORT_CANCELLED/,
  );
  await cancelImport({
    storage,
    importId: entry.id,
    store: { getProperty: async () => null, getRequirement: async () => null },
  });
  assert.equal((await inbox.read()).length, 0);
});
