import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";
import { capturePriceText } from "../services/capturePriceInput";
import {
  createPropertySaveOperation,
  executePropertySaveRecovery,
  parsePropertySaveOperation,
  type PropertySaveSource,
} from "../services/propertySaveRecovery";
import type { Property, PropertyDraft } from "@workspace/property-domain";

const draft: PropertyDraft = {
  propertyCoreId: "saved-property",
  offerId: "saved-offer",
  propertyType: "apartment",
  transaction: "rent",
  locationAreaId: "salmiya",
  rentalPrice: { amount: 12.5, currencyCode: "KWD" },
  rentalPeriodId: "daily",
};
const property: Property = {
  core: {
    id: "saved-property",
    propertyType: "apartment",
    locationArea: { id: "salmiya" },
  },
  activeOffer: {
    id: "saved-offer",
    propertyCoreId: "saved-property",
    transaction: "rent",
    rentalPrice: { amount: 12.5, currencyCode: "KWD" },
    rentalPeriodId: "daily",
  },
};
const source = { personId: "broker-person", role: "broker" as const };

test("provider cleanup separates fresh price state while retaining old details for exact completion", async () => {
  const text = await readFile("contexts/CaptureContext.tsx", "utf8");
  const ast = ts.createSourceFile(
    "CaptureContext.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let callback: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(ast) === "cleanupRecoveredDraft" &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    )
      callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(callback);
  const compiled = ts.transpileModule(
    "return (" + callback!.getText(ast) + ");",
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  const draftRef = { current: structuredClone(draft) };
  const captureDetailsRef = {
    current: { rentalPriceInput: "12.5" } as Record<string, string>,
  };
  const captureDetailsOwnerRef = { current: draft.propertyCoreId };
  const retainedDetailsRef = { current: new Map() };
  let visible: Record<string, string> = captureDetailsRef.current;
  const values = {
    mutationsBlocked: { current: false },
    flushDraftWrites: async () => {},
    serializeRecoveryValue: JSON.stringify,
    draftRef,
    createFreshDraft: () => ({
      propertyCoreId: "fresh-property",
      offerId: "fresh-offer",
    }),
    replaceDraftIfUnchanged: async () => true,
    loadDraft: async () => null,
    setCurrentDraft: (next: PropertyDraft) => {
      draftRef.current = next;
    },
    captureDetailsOwnerRef,
    captureDetailsRef,
    retainedDetailsRef,
    setCaptureDetails: (next: Record<string, string>) => {
      visible = next;
    },
    setDraftOrigin: () => {},
    setDraftLoadFailed: () => {},
  };
  const cleanup = new Function(...Object.keys(values), compiled)(
    ...Object.values(values),
  );
  assert.equal(await cleanup(JSON.stringify(draft)), "replaced");
  assert.equal(draftRef.current.propertyCoreId, "fresh-property");
  assert.equal(captureDetailsOwnerRef.current, "fresh-property");
  assert.equal(
    capturePriceText({ ...draftRef.current, transaction: "rent" }, visible),
    "",
  );
  assert.deepEqual(retainedDetailsRef.current.get("saved-property"), {
    rentalPriceInput: "12.5",
  });
});

test("source completion survives serialization and a failed link retries before cleanup without another property", async () => {
  const operation = createPropertySaveOperation({
    operationId: "operation",
    draft,
    targetProperty: property,
    preparedAt: "2026-11-22",
    source,
  });
  const restored = parsePropertySaveOperation(JSON.stringify(operation));
  assert.deepEqual(restored.source, source);
  let current = structuredClone(draft),
    writes = 0,
    clear = 0,
    links = 0;
  const properties: Property[] = [];
  const options = {
    operation: restored,
    allowSave: true,
    getProperties: async () => properties,
    saveProperty: async (p: Property) => {
      writes++;
      properties.push(p);
    },
    getDraft: () => current,
    cleanupDraft: async () => {
      current = { propertyCoreId: "fresh-property", offerId: "fresh-offer" };
      return "replaced" as const;
    },
    clearOperation: async () => {
      clear++;
      return true;
    },
    completeSource: async (id: string, pending: PropertySaveSource) => {
      assert.equal(id, property.core.id);
      assert.deepEqual(pending, source);
      links++;
      if (links === 1) throw new Error("link failed");
    },
  };
  assert.equal(
    (await executePropertySaveRecovery(options)).status,
    "cleanup_failed",
  );
  assert.equal(writes, 1);
  assert.equal(clear, 0);
  assert.equal(current.propertyCoreId, "saved-property");
  const retry = await executePropertySaveRecovery({
    ...options,
    operation: parsePropertySaveOperation(JSON.stringify(restored)),
  });
  assert.equal(retry.status, "complete");
  if (retry.status === "complete")
    assert.equal(retry.propertyCoreId, "saved-property");
  assert.equal(writes, 1);
  assert.equal(links, 2);
  assert.equal(clear, 1);
});

test("cleanup acknowledgement retries keep the saved identity when the current draft is already new", async () => {
  const operation = createPropertySaveOperation({
    operationId: "cleanup",
    draft,
    targetProperty: property,
    preparedAt: "2026-11-22",
  });
  let current = structuredClone(draft),
    clear = 0;
  const options = {
    operation,
    allowSave: true,
    getProperties: async () => [property],
    saveProperty: async () => {
      throw new Error("must not write twice");
    },
    getDraft: () => current,
    cleanupDraft: async () => {
      current = { propertyCoreId: "fresh-property", offerId: "fresh-offer" };
      return "replaced" as const;
    },
    clearOperation: async () => ++clear > 1,
  };
  assert.equal(
    (await executePropertySaveRecovery(options)).status,
    "cleanup_failed",
  );
  const retried = await executePropertySaveRecovery(options);
  assert.equal(retried.status, "complete");
  if (retried.status === "complete")
    assert.equal(retried.propertyCoreId, "saved-property");
  assert.equal(current.propertyCoreId, "fresh-property");
});
