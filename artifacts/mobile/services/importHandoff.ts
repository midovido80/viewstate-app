import type {
  PropertyDraft,
  PropertyDetailField,
} from "@workspace/property-domain";
import {
  canonicalPropertyTypeChoice,
  getPropertyTypeChoices,
  type PropertyTypeChoice,
} from "./propertySectorSelection";
import { privateMessageNote } from "./nextFormPresentation";
import { getApplicablePropertyFormFields } from "./propertyFormCatalog";
import type { CaptureDetailValues } from "./captureDetailsStorage";
import type { ImportEntry } from "./importInbox";
import type { ImportFacts } from "./messageImport";

export function assertImportSelection(facts: ImportFacts): void {
  if (
    !["offered", "wanted"].includes(facts.intent ?? "") ||
    !["rent", "sale"].includes(facts.transaction ?? "") ||
    !facts.choice ||
    (facts.choice !== "studio" &&
      !getPropertyTypeChoices("all", facts.transaction).includes(
        facts.choice as PropertyTypeChoice,
      ))
  )
    throw Error("IMPORT_CONFIRM_BASICS");
  if (
    facts.transaction === "rent" &&
    !["daily", "monthly", "yearly"].includes(facts.period ?? "")
  )
    throw Error("IMPORT_CONFIRM_PERIOD");
}

export function offeredImportSeed(
  entry: ImportEntry,
  facts: ImportFacts,
): { draft: Partial<PropertyDraft>; details: CaptureDetailValues } {
  assertImportSelection(facts);
  if (facts.intent !== "offered" || !facts.transaction || !facts.choice)
    throw Error("IMPORT_CONFIRM_BASICS");
  const studio = facts.choice === "studio";
  const selected = canonicalPropertyTypeChoice(
    (studio ? "apartment" : facts.choice) as PropertyTypeChoice,
  );
  const subtype =
    selected.propertyType === "apartment"
      ? studio
        ? "studio"
        : (selected.apartmentSubtype ?? "standard_apartment")
      : undefined;
  const applicable = new Set(
    getApplicablePropertyFormFields(
      selected.propertyType,
      selected.floorUse,
      subtype,
    ).map((f) => f.field),
  );
  const details: CaptureDetailValues = {
    ...Object.fromEntries(
      Object.entries(facts.details).filter(([field]) =>
        applicable.has(field as PropertyDetailField),
      ),
    ),
    ...(selected.floorUse ? { floorUse: selected.floorUse } : {}),
    ...(subtype ? { apartmentSubtype: subtype } : {}),
    ...(facts.areaSquareMeters !== undefined
      ? { areaSquareMeters: facts.areaSquareMeters, areaUnit: "square_meter" }
      : {}),
    attachments: entry.files.map(({ uri, ...file }) => ({
      ...file,
      managedUri: uri,
      privacy: {
        classification: "normal" as const,
        disclosurePolicy: "normal" as const,
      },
    })),
  };
  return {
    draft: {
      propertyType: selected.propertyType,
      apartmentSubtype: subtype,
      transaction: facts.transaction,
      ...(facts.areaIds.length === 1
        ? { locationAreaId: facts.areaIds[0] }
        : {}),
      ...(facts.block ? { block: facts.block } : {}),
      ...(facts.price !== undefined
        ? {
            [facts.transaction === "rent" ? "rentalPrice" : "salePrice"]: {
              amount: facts.price,
              currencyCode: "KWD",
            },
          }
        : {}),
      ...(facts.period ? { rentalPeriodId: facts.period } : {}),
      privateNotes: privateMessageNote(
        [entry.text, entry.ocrText].filter(Boolean).join("\n\n"),
      ),
    },
    details,
  };
}
