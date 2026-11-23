import type { PropertyDraft, PropertyType } from "@workspace/property-domain";
/** Form visibility only. Existing saved kitchens remain in the original domain model. */
export function showsNextKitchenFields(
  type: PropertyType,
  subtype?: string,
  use?: string,
): boolean {
  return (
    ["house", "villa", "chalet"].includes(type) ||
    (type === "apartment" && subtype === "duplex") ||
    type === "office" ||
    (type === "floor" && use === "commercial")
  );
}
/** Intake must never replace a resumed or partially completed capture. */
export function canBeginMessageCapture(
  draft: PropertyDraft,
  details: object,
): boolean {
  return (
    Object.entries(draft).every(
      ([key, value]) =>
        key === "propertyCoreId" || key === "offerId" || value === undefined,
    ) &&
    Object.values(details).every((value) => value === undefined || value === "")
  );
}
export function privateMessageNote(value: string) {
  return {
    value,
    privacy: {
      classification: "private_notes" as const,
      disclosurePolicy: "never" as const,
    },
  };
}
