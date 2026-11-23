import "./platformModuleStubs.ts";
import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeImportMessage,
  possibleSavedImportDuplicates,
  sameImportText,
  suggestMessageParts,
} from "../services/messageImport";
import {
  createImportInbox,
  importTarget,
  parseNativeDelivery,
  type ImportEntry,
} from "../services/importInbox";
import { offeredImportSeed } from "../services/importHandoff";
import {
  prepareImportedForm,
  importedSessionIdentity,
} from "../services/importFormSessions";
import { createFormSession } from "../services/formSession";
import { createGuestScope } from "../services/accountScope";
import { buildPersonRequirement } from "../services/personRequirementWorkflow";
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
  };
}
const offer =
  "للإيجار شقة بالسالمية، ٣ غرف، حمامين، ١ موقف، مساحة ١٢٠ متر، ٤٠٠ دينار شهري. يوجد مصعد بدون حديقة. قطعة ١٠";
const entry = (id = "delivery-1", text = offer): ImportEntry => ({
  id,
  text,
  createdAt: "2026-11-07T10:00:00Z",
  files: [],
  status: "received",
});
test("Arabic explicit counts, area, zero, services and unknowns", () => {
  const f = analyzeImportMessage(offer);
  assert.equal(f.intent, "offered");
  assert.equal(f.transaction, "rent");
  assert.equal(f.choice, "apartment");
  assert.equal(f.price, 400);
  assert.equal(f.period, "monthly");
  assert.equal(f.details.bedroomCount, "3");
  assert.equal(f.details.bathroomCount, "2");
  assert.equal(f.details.parkingSpaceCount, "1");
  assert.equal(f.areaSquareMeters, 120);
  assert.equal(f.block, "10");
  assert.equal(f.details.hasElevator, "true");
  assert.equal(f.details.hasGarden, "false");
  assert.equal(f.details.masterBedroomCount, undefined);
  assert.equal(f.areaIds.length, 1);
});
test("English and alternate Arabic digits", () => {
  const f = analyzeImportMessage(
    "Office for rent in Salmiya. 0 parking spaces, 2 bathrooms. 600 KWD per month, 80 sqm.",
  );
  assert.equal(f.choice, "office");
  assert.equal(f.details.parkingSpaceCount, "0");
  assert.equal(f.details.bathroomCount, "2");
  assert.equal(f.price, 600);
  assert.equal(f.period, "monthly");
  assert.equal(f.areaSquareMeters, 80);
  assert.equal(analyzeImportMessage("للبيع فيلا ۲۵۰۰۰۰ دينار").price, 250000);
});
test("conflicts, foreign currency and missing cadence are unresolved", () => {
  const f = analyzeImportMessage("شقة 3 غرف، 4 غرف. 500 دولار للإيجار");
  assert.equal(f.details.bedroomCount, undefined);
  assert.equal(f.price, undefined);
  assert.equal(f.period, undefined);
  for (const w of ["numbers", "currency", "period"])
    assert.ok(f.warnings.includes(w));
  assert.equal(analyzeImportMessage("hello").choice, undefined);
});
test("request budget range and multiple areas", () => {
  const f = analyzeImportMessage(
    "مطلوب استئجار شقة بالسالمية أو حولي. 3 غرف. الميزانية 400 - 500 د.ك شهري",
  );
  assert.equal(f.intent, "wanted");
  assert.equal(f.minimum, 400);
  assert.equal(f.price, 500);
  assert.ok(f.areaIds.length > 1);
});
test("links do not fabricate content, split requires independent listings", () => {
  assert.ok(
    analyzeImportMessage("https://example.invalid/ad").warnings.includes(
      "link",
    ),
  );
  assert.equal(suggestMessageParts("للإيجار شقة\n\n٣ غرف").length, 1);
  assert.equal(suggestMessageParts("للإيجار شقة\n\nللبيع فيلا").length, 2);
  assert.equal(sameImportText(" شقة ٣ غرف ", "شقة 3 غرف"), true);
});
test("durable queue serializes, dedupes delivery ids and retains review", async () => {
  const s = memory(),
    inbox = createImportInbox(s);
  await Promise.all([
    inbox.add(entry()),
    inbox.add(entry("d2")),
    inbox.add(entry()),
  ]);
  assert.equal((await inbox.read()).length, 2);
  assert.equal((await inbox.duplicates(entry("d3"))).length, 2);
  await inbox.update({ ...entry(), status: "reviewed" });
  assert.equal((await createImportInbox(s).read())[0].status, "reviewed");
});
test("failed readback and corrupt data never claim success or erase content", async () => {
  const s = memory();
  await assert.rejects(
    createImportInbox({ ...s, setItem: async () => {} }).add(entry()),
    /UNCONFIRMED/,
  );
  s.data.set("@viewstate/import-inbox/v1", "{broken");
  await assert.rejects(createImportInbox(s).read());
  assert.equal(s.data.get("@viewstate/import-inbox/v1"), "{broken");
});
test("account isolation and logout rejection", async () => {
  const s = memory(),
    a = createGuestScope("11111111-1111-4111-8111-111111111111"),
    b = createGuestScope("22222222-2222-4222-8222-222222222222");
  const inbox = createImportInbox(a.storage(s));
  await inbox.add(entry());
  assert.deepEqual(await createImportInbox(b.storage(s)).read(), []);
  a.revoke();
  await assert.rejects(inbox.update(entry()));
});
test("untrusted native payloads reject remote files, paths and empty content", () => {
  assert.equal(
    parseNativeDelivery({ id: "d1", text: "hi", files: [] }).text,
    "hi",
  );
  assert.throws(() =>
    parseNativeDelivery({ id: "../escape", text: "hi", files: [] }),
  );
  assert.throws(() =>
    parseNativeDelivery({
      id: "d1",
      text: "hi",
      files: [{ uri: "https://x", name: "x", mimeType: "image/jpeg" }],
    }),
  );
  assert.throws(() => parseNativeDelivery({ id: "d1", text: "", files: [] }));
});
test("offered seed keeps private original and applicable actual facts only", () => {
  const e = entry(),
    f = analyzeImportMessage(offer);
  f.details.parkingSpaceCount = "0";
  const seed = offeredImportSeed(e, f);
  assert.equal(seed.draft.description, undefined);
  assert.equal(seed.draft.privateNotes?.privacy.disclosurePolicy, "never");
  assert.equal(seed.draft.privateNotes?.value, offer);
  assert.equal(seed.details.parkingSpaceCount, "0");
  assert.throws(() => offeredImportSeed(e, { ...f, intent: "wanted" }));
});
test("request isolated form prefill validates, never puts raw text in shared notes or overwrites edits", async () => {
  const s = memory(),
    e = entry(),
    f = analyzeImportMessage(offer);
  f.intent = "wanted";
  const target = await prepareImportedForm(s, e, f, "person-1", randomUUID);
  assert.equal(target.pathname, "/requirement/new");
  const repo = createFormSession(
    s,
    importedSessionIdentity(
      "requirement:new:person-1:rent:apartment:standard_apartment:",
      e.id,
    ),
  );
  const data = await repo.read<any>();
  assert.equal(data.bedrooms, "3");
  assert.equal(data.bathrooms, "2");
  assert.equal(data.maximum, "400");
  assert.equal(data.notes, "");
  const result = buildPersonRequirement(data.draftIdentity, "person-1", {
    purpose: data.purpose,
    propertyType: data.propertyType,
    preferredAreaIds: data.areas,
    maximumBudget: Number(data.maximum),
    currencyCode: "KWD",
    notes: data.notes,
    bedroomsMinimum: Number(data.bedrooms),
    bathroomsMinimum: Number(data.bathrooms),
    catalogPreferences: data.catalog,
    preferredAmenities: data.amenities,
  });
  assert.equal(result.ok, true);
  await repo.write({ ...data, bedrooms: "7" });
  await prepareImportedForm(s, e, f, "person-1", randomUUID);
  assert.equal((await repo.read<any>()).bedrooms, "7");
  await assert.rejects(
    prepareImportedForm(s, e, f, undefined, randomUUID),
    /PERSON_REQUIRED/,
  );
});
test("studio original form has independent session and private source", async () => {
  const s = memory(),
    f = analyzeImportMessage("استوديو للايجار السالمية 200 دينار شهري"),
    e = entry("studio-1");
  const target = await prepareImportedForm(s, e, f, undefined, randomUUID);
  assert.equal(target.pathname, "/capture/studio");
  const saved = await createFormSession(
    s,
    importedSessionIdentity("studio:new:offered:rent::", e.id),
  ).read<any>();
  assert.equal(saved.values.price, "200");
  assert.equal(saved.values.privateNotes, offer);
});

test("master and maid room counts do not replace bedrooms", () => {
  const f = analyzeImportMessage(
    "للايجار شقة 3 غرف و 1 غرفة خادمة و 2 غرف ماستر. 400 دينار شهري",
  );
  assert.equal(f.details.bedroomCount, "3");
  assert.equal(f.details.masterBedroomCount, "2");
});
test("all Kuwait remains an explicit request area choice", async () => {
  const f = analyzeImportMessage(
    "مطلوب شقة استئجار كل مناطق الكويت من 400 إلى 500 دينار شهري",
  );
  assert.equal(f.allKuwait, true);
  assert.equal(f.minimum, 400);
  assert.equal(f.price, 500);
  const s = memory(),
    e = entry("all-kuwait");
  await prepareImportedForm(s, e, f, "person-1", randomUUID);
  const data = await createFormSession(
    s,
    importedSessionIdentity(
      "requirement:new:person-1:rent:apartment:standard_apartment:",
      e.id,
    ),
  ).read<any>();
  assert.equal(data.areaMode, "all_kuwait");
  assert.equal(data.apartmentSubtype, "standard_apartment");
});
test("studio imported media is copied before form ownership; conflicting count is retained for review", async () => {
  const f = analyzeImportMessage("استوديو للايجار السالمية 200 دينار شهري"),
    s = memory(),
    e = entry("studio-files");
  e.files = [
    {
      id: "file-1",
      uri: "file:///inbox/pic.jpg",
      mimeType: "image/jpeg",
      kind: "image",
      originalName: "pic.jpg",
      order: 0,
    },
  ];
  await assert.rejects(
    prepareImportedForm(s, e, f, undefined, randomUUID),
    /COPY_REQUIRED/,
  );
  const target = await prepareImportedForm(
    s,
    e,
    f,
    undefined,
    randomUUID,
    undefined,
    async (id, files) =>
      files.map((file) => ({
        ...file,
        uri: `file:///properties/${id}/copy.jpg`,
      })),
  );
  const value = await createFormSession(
    s,
    importedSessionIdentity("studio:new:offered:rent::", e.id),
  ).read<any>();
  assert.notEqual(value.attachments[0].uri, e.files[0].uri);
  assert.equal(value.propertyId, target.targetId);
  await assert.rejects(
    prepareImportedForm(
      memory(),
      e,
      { ...f, details: { bathroomCount: "2" } },
      undefined,
      randomUUID,
    ),
    /BATHROOM_CONFLICT/,
  );
});

test("retained handoff routes reject arbitrary destinations", () => {
  assert.deepEqual(
    importTarget({
      targetPath: JSON.stringify({
        pathname: "/capture/price",
        params: { mode: "offered" },
      }),
    }),
    { pathname: "/capture/price", params: { mode: "offered" } },
  );
  assert.throws(() =>
    importTarget({
      targetPath: JSON.stringify({
        pathname: "https://example.invalid",
        params: {},
      }),
    }),
  );
});

test("imported offer and request use real domain validation, persistence, reload and matching", async () => {
  const { WebStore } = await import("../services/persistence");
  const { projectDraftToProperty, evaluateMatch } =
    await import("@workspace/property-domain");
  const { buildPropertyWithCaptureDetails } =
    await import("../services/propertyCaptureDetails");
  const s = memory(),
    locks = {
      request: async (
        _name: string,
        _options: unknown,
        work: () => Promise<unknown>,
      ) => work(),
    };
  const store = new WebStore(s, locks as never);
  await store.init();
  const f = analyzeImportMessage(offer),
    seed = offeredImportSeed(entry(), f);
  const projected = projectDraftToProperty({
    ...seed.draft,
    propertyCoreId: randomUUID(),
    offerId: randomUUID(),
  });
  assert.equal(projected.ok, true);
  if (!projected.ok) throw Error("VALIDATION_FAILED");
  const property = buildPropertyWithCaptureDetails(
    projected.value,
    seed.details,
  );
  await store.saveProperty(property);
  await store.savePerson({
    id: "seeker-1",
    name: "عميل اختباري",
    displayPhone: "50000000",
    normalizedPhone: "50000000",
    classifications: ["seeker"],
    notes: "",
  });
  const built = buildPersonRequirement(randomUUID(), "seeker-1", {
    purpose: "rent",
    propertyType: "apartment",
    preferredAreaIds: f.areaIds,
    maximumBudget: 500,
    currencyCode: "KWD",
    notes: "",
    bedroomsMinimum: 2,
    bathroomsMinimum: 2,
    rentalPeriodId: "monthly",
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw Error("REQUEST_INVALID");
  await store.saveRequirement(built.value);
  const reopened = new WebStore(s, locks as never);
  await reopened.init();
  const properties = await reopened.getProperties(),
    requests = await reopened.getRequirements();
  assert.equal(properties.length, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].seekerId, "seeker-1");
  assert.equal(properties[0].core.privateNotes?.value, offer);
  const result = evaluateMatch(requests[0], { property: properties[0] });
  assert.equal(result.eligible, true);
  assert.equal(result.qualifies, true);
  assert.equal(possibleSavedImportDuplicates(f, properties, []).length, 1);
});

test("a stale review cannot replace a claimed or completed handoff", async () => {
  const s = memory(),
    repo = createImportInbox(s),
    original = entry();
  await repo.add(original);
  const claimed = {
    ...original,
    status: "reviewed" as const,
    targetId: "core-1",
  };
  await repo.update(claimed);
  await assert.rejects(repo.update(original), /HANDOFF_CONFLICT/);
  await repo.update({ ...claimed, status: "transferred" });
  await assert.rejects(repo.update(claimed), /HANDOFF_CONFLICT/);
  assert.equal((await repo.read())[0].targetId, "core-1");
  assert.equal((await repo.read())[0].status, "transferred");
});
test("cross-window account lock covers the whole inbox read/modify/write", async () => {
  const raw = memory();
  let chain = Promise.resolve();
  let locks = 0;
  const shared = <T>(name: string, work: () => Promise<T>) => {
    locks++;
    const next = chain.then(work);
    chain = next.then(() => {});
    return next;
  };
  const a = createImportInbox({ ...raw, withExclusiveLock: shared }),
    b = createImportInbox({ ...raw, withExclusiveLock: shared });
  await Promise.all([a.add(entry("one")), b.add(entry("two"))]);
  assert.equal((await a.read()).length, 2);
  assert.equal(locks, 2);
});
