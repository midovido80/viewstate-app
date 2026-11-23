import { URL } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import "./platformModuleStubs";
import { sourceMatch } from "./sourceAssertions";
import {
  buildPropertyWithCaptureDetails,
  shouldSaveBasicCapture,
} from "../services/propertyCaptureDetails";
import {
  loadCaptureDetails,
  saveCaptureDetails,
  type CaptureDetailValues,
} from "../services/captureDetailsStorage";
import { getPropertyFormRoute } from "../services/propertyFormRoutes";
import {
  projectDraftToProperty,
  type PropertyDraft,
} from "@workspace/property-domain";
import {
  capturePriceText,
  capturePriceChange,
  otherClarificationValid,
} from "../services/capturePriceInput";
class MemoryStorage {
  values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
}
test("sequential decimal typing preserves displayed text through draft reload", async () => {
  const storage = new MemoryStorage();
  for (const [keys, expected] of [
    [["1", "2", ".", "5"], 12.5],
    [["0", ".", "5"], 0.5],
    [["١", "٢", "٫", "٥"], 12.5],
  ] as const) {
    let draft: PropertyDraft = {
      propertyCoreId: "p",
      offerId: "o",
      transaction: "sale",
    };
    let details: CaptureDetailValues = {};
    for (const key of keys) {
      const text = capturePriceText(draft, details) + key;
      const change = capturePriceChange("sale", text);
      draft = { ...draft, ...change.draft };
      details = { ...details, ...change.details };
      await saveCaptureDetails("p", details, undefined, storage);
      details = await loadCaptureDetails("p", storage);
      assert.equal(capturePriceText(draft, details), text);
    }
    assert.equal(draft.salePrice?.amount, expected);
  }
});
test("Arabic decimals parse and invalid or blank input clears the previous numeric price", async () => {
  for (const [text, amount] of [
    ["12.", 12],
    ["12.5", 12.5],
    ["0.5", 0.5],
    ["١٢٫٥", 12.5],
    ["۱۲,۵", 12.5],
  ] as const)
    assert.equal(
      capturePriceChange("rent", text).draft.rentalPrice?.amount,
      amount,
    );
  for (const text of ["", " ", "-1", "0", "12..5", "abc", "Infinity", "1e3"]) {
    const change = capturePriceChange("sale", text);
    assert.equal(change.draft.salePrice, undefined, text);
    assert.equal(change.details.salePriceInput, text);
  }
});
test("sale/rent drafts stay isolated without becoming optional specifications", async () => {
  const sale = capturePriceChange("sale", "12.");
  const rent = capturePriceChange("rent", "0.5");
  const draft: PropertyDraft = {
    propertyCoreId: "p",
    offerId: "o",
    transaction: "sale",
    ...sale.draft,
  };
  assert.equal(
    capturePriceText({ ...draft, transaction: "rent" }, sale.details),
    "",
  );
  const details = { ...sale.details, ...rent.details };
  assert.equal(
    capturePriceText({ ...draft, ...rent.draft, transaction: "rent" }, details),
    "0.5",
  );
  assert.equal(capturePriceText(draft, details), "12.");
  assert.equal(
    capturePriceText(
      { ...draft, transaction: "rent" },
      { ...details, rentalPriceInput: "" },
    ),
    "",
  );
  assert.equal(shouldSaveBasicCapture(details), true);
});
test("both screen price controls use the durable text model", async () => {
  for (const filename of ["price.tsx", "index.tsx"]) {
    const source = await readFile(
      new URL(`../app/capture/${filename}`, import.meta.url),
      "utf8",
    );
    sourceMatch(source, /capturePriceText\(draft, captureDetails\)/);
    sourceMatch(source, /capturePriceChange\(draft.transaction, value\)/);
    sourceMatch(source, /updateCaptureDetails\(change.details\)/);
    sourceMatch(source, /updateDraft\(change.draft\)/);
  }
});
test("Other route requires editable clarification before Next", async () => {
  const source = await readFile(
    new URL("../app/capture/price.tsx", import.meta.url),
    "utf8",
  );
  sourceMatch(source, /<RequiredField id="clarification"/);
  sourceMatch(source, /value=\{captureDetails.clarification \?\? ""\}/);
  sourceMatch(source, /updateCaptureDetails\(\{ clarification \}\)/);
  sourceMatch(source, /const missing = requiredForm.validate\(\)/);
  sourceMatch(source, /missing.length/);
});
for (const propertyUse of ["residential", "commercial"] as const)
  for (const transaction of ["sale", "rent"] as const)
    test(`Other ${propertyUse}/${transaction} saves and reloads clarification`, async () => {
      assert.equal(
        otherClarificationValid("other_built_property", "  "),
        false,
      );
      assert.equal(
        otherClarificationValid(
          "other_built_property",
          "عقار مبني متعدد الاستخدامات",
        ),
        true,
      );
      assert.equal(otherClarificationValid("villa", undefined), true);
      assert.equal(
        getPropertyFormRoute({
          mode: "offered",
          propertyType: "other_built_property",
          transaction,
        }).pathname,
        "/capture/price",
      );
      const storage = new MemoryStorage();
      await saveCaptureDetails(
        "other-p",
        { propertyUse, clarification: "عقار مبني متعدد الاستخدامات" },
        undefined,
        storage,
      );
      const details = await loadCaptureDetails("other-p", storage);
      const projected = projectDraftToProperty({
        propertyCoreId: "other-p",
        offerId: "other-o",
        propertyType: "other_built_property",
        transaction,
        locationAreaId: "salmiya",
        ...(transaction === "sale"
          ? { salePrice: { amount: 12.5, currencyCode: "KWD" } }
          : {
              rentalPrice: { amount: 12.5, currencyCode: "KWD" },
              rentalPeriodId: "monthly",
            }),
      });
      assert.ok(projected.ok);
      const saved = buildPropertyWithCaptureDetails(projected.value, details);
      const reloaded = JSON.parse(JSON.stringify(saved));
      assert.equal(reloaded.core.id, "other-p");
      assert.equal(reloaded.typeDetails.propertyUse, propertyUse);
      assert.equal(
        reloaded.typeDetails.clarification.value,
        "عقار مبني متعدد الاستخدامات",
      );
    });
import * as captureInput from "../services/capturePriceInput";

test("restart reconciles authoritative raw price after numeric/text partial writes", async () => {
  assert.equal(
    typeof captureInput.reconcileCapturePrice,
    "function",
    "restart reconciliation is required",
  );
  for (const transaction of ["sale", "rent"] as const) {
    for (const [raw, expected] of [
      ["125", 125],
      ["١٢٫٥", 12.5],
      ["", undefined],
      ["invalid", undefined],
      ["-1", undefined],
    ] as const) {
      const storage = new MemoryStorage();
      const draft: PropertyDraft = {
        propertyCoreId: "restart-p",
        offerId: "restart-o",
        propertyType: "villa",
        transaction,
        locationAreaId: "salmiya",
        salePrice: { amount: 12, currencyCode: "KWD" },
        rentalPrice: { amount: 12, currencyCode: "KWD" },
        rentalPeriodId: "monthly",
      };
      await saveCaptureDetails(
        "restart-p",
        transaction === "sale"
          ? { salePriceInput: raw, rentalPriceInput: "999" }
          : { rentalPriceInput: raw, salePriceInput: "999" },
        undefined,
        storage,
      );
      const restored = await loadCaptureDetails("restart-p", storage);
      const reconciled = captureInput.reconcileCapturePrice(
        JSON.parse(JSON.stringify(draft)),
        restored,
      );
      const projected = projectDraftToProperty(reconciled);
      if (expected === undefined) assert.equal(projected.ok, false, raw);
      else {
        assert.ok(projected.ok);
        assert.equal(
          projected.value.activeOffer.transaction === "sale"
            ? projected.value.activeOffer.salePrice?.amount
            : projected.value.activeOffer.rentalPrice?.amount,
          expected,
        );
      }
      assert.equal(
        transaction === "sale"
          ? reconciled.rentalPrice?.amount
          : reconciled.salePrice?.amount,
        12,
        "inactive raw text must not rewrite the other transaction",
      );
    }
  }
});

test("legacy numeric drafts without active raw text preserve their price", () => {
  assert.equal(typeof captureInput.reconcileCapturePrice, "function");
  for (const transaction of ["sale", "rent"] as const) {
    const draft: PropertyDraft = {
      propertyCoreId: "legacy-p",
      offerId: "legacy-o",
      transaction,
      salePrice: { amount: 12, currencyCode: "KWD" },
      rentalPrice: { amount: 12, currencyCode: "KWD" },
    };
    const reconciled = captureInput.reconcileCapturePrice(
      draft,
      transaction === "sale"
        ? { rentalPriceInput: "999" }
        : { salePriceInput: "999" },
    );
    assert.deepEqual(reconciled, draft);
  }
});

test("full capture validation and preview use reconciled active prices", async () => {
  const source = await readFile(
    new URL("../app/capture/index.tsx", import.meta.url),
    "utf8",
  );
  sourceMatch(
    source,
    /const priceDraft = reconcileCapturePrice\(draft, captureDetails\)/,
  );
  sourceMatch(source, /price: activePriceAmount/);
  sourceMatch(source, /isMissingPositiveAmount\(activePriceAmount\)/);
  sourceMatch(source, /priceDraft.salePrice.amount/);
  sourceMatch(source, /priceDraft.rentalPrice.amount/);
});
