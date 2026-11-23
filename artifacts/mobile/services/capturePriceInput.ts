import type { PropertyDraft } from "@workspace/property-domain";
import type { CaptureDetailValues } from "./captureDetailsStorage";
import { MARKET_CONFIG } from "@/constants/market";

export function capturePriceText(
  draft: PropertyDraft,
  details: CaptureDetailValues,
): string {
  return draft.transaction === "rent"
    ? (details.rentalPriceInput ?? draft.rentalPrice?.amount.toString() ?? "")
    : (details.salePriceInput ?? draft.salePrice?.amount.toString() ?? "");
}

export function capturePriceChange(
  transaction: PropertyDraft["transaction"],
  text: string,
): {
  draft: Partial<PropertyDraft>;
  details: CaptureDetailValues;
} {
  const normalized = text
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٫,]/g, ".");
  const amount = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)
    ? Number(normalized)
    : NaN;
  const price =
    Number.isFinite(amount) && amount > 0
      ? { amount, currencyCode: MARKET_CONFIG.currencyCode }
      : undefined;
  return transaction === "rent"
    ? { draft: { rentalPrice: price }, details: { rentalPriceInput: text } }
    : { draft: { salePrice: price }, details: { salePriceInput: text } };
}

export function otherClarificationValid(
  propertyType: PropertyDraft["propertyType"],
  clarification?: string,
): boolean {
  return (
    propertyType !== "other_built_property" || Boolean(clarification?.trim())
  );
}
export function reconcileCapturePrice(
  draft: PropertyDraft,
  details: CaptureDetailValues,
): PropertyDraft {
  const raw =
    draft.transaction === "rent"
      ? details.rentalPriceInput
      : draft.transaction === "sale"
        ? details.salePriceInput
        : undefined;
  return raw === undefined
    ? draft
    : { ...draft, ...capturePriceChange(draft.transaction, raw).draft };
}
