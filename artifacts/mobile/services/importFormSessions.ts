import { assertImportSelection } from "./importHandoff";
import {
  canonicalPropertyTypeChoice,
  type PropertyTypeChoice,
} from "./propertySectorSelection";
import { createFormSession, type FormSessionStorage } from "./formSession";
import { createStudioFormValues } from "./studioFormModel";
import type { ImportEntry } from "./importInbox";
import type { ImportFacts } from "./messageImport";
import { getApplicablePropertyFormFieldsForMode } from "./propertyFormCatalog";
import type {
  CatalogPreference,
  PropertyDetailField,
} from "@workspace/property-domain";

/** The same identities are used by the original form autosave hooks. */
export function importedSessionIdentity(
  base: string,
  importId?: string,
): string {
  return importId ? `${base}:import:${importId}` : base;
}
export async function prepareImportedForm(
  storage: FormSessionStorage,
  entry: ImportEntry,
  facts: ImportFacts,
  seekerId: string | undefined,
  createId: () => string,
  source?: { personId: string; role: string },
  copyFiles?: (
    propertyId: string,
    files: ImportEntry["files"],
  ) => Promise<ImportEntry["files"]>,
) {
  assertImportSelection(facts);
  if (!facts.transaction || !facts.choice || !facts.intent)
    throw Error("IMPORT_CONFIRM_BASICS");
  if (facts.intent === "wanted" && !seekerId)
    throw Error("IMPORT_PERSON_REQUIRED");
  const studio = facts.choice === "studio";
  const selected = canonicalPropertyTypeChoice(
    (studio ? "apartment" : facts.choice) as PropertyTypeChoice,
  );
  const subtype =
    selected.propertyType === "apartment"
      ? studio
        ? "studio"
        : selected.apartmentSubtype
          ? "duplex"
          : "standard"
      : "";
  const transaction = facts.transaction,
    mode = facts.intent,
    purpose = transaction === "sale" ? "buy" : "rent";
  const params = {
    mode,
    transaction,
    propertyType: selected.propertyType,
    ...(subtype ? { apartmentSubtype: subtype } : {}),
    ...(selected.floorUse ? { floorUse: selected.floorUse } : {}),
    ...(seekerId ? { seekerId } : {}),
    importId: entry.id,
    ...(mode === "offered" && source
      ? { linkPersonId: source.personId, sourceRole: source.role }
      : {}),
  };
  const fields = new Set(
    getApplicablePropertyFormFieldsForMode(
      "wanted",
      selected.propertyType,
      selected.floorUse,
      subtype === "standard"
        ? "standard_apartment"
        : subtype === "duplex"
          ? "duplex"
          : subtype === "studio"
            ? "studio"
            : undefined,
    ).map((f) => f.field),
  );
  const count = (field: PropertyDetailField) =>
    fields.has(field) ? (facts.details[field] ?? "") : "";
  if (studio) {
    if (facts.details.bathroomCount && facts.details.bathroomCount !== "1")
      throw Error("IMPORT_STUDIO_BATHROOM_CONFLICT");
    const identity = importedSessionIdentity(
      `studio:new:${mode}:${transaction}:${seekerId ?? ""}:${mode === "offered" ? (source?.personId ?? "") : ""}`,
      entry.id,
    );
    const session = createFormSession(storage, identity);
    if (!(await session.read())) {
      const values = {
        ...createStudioFormValues(mode, transaction),
        locationAreaId: facts.areaIds.length === 1 ? facts.areaIds[0] : "",
        preferredAreaIds: facts.areaIds,
        preferredAreaMode: facts.allKuwait
          ? ("all_kuwait" as const)
          : ("specific_areas" as const),
        price: String(facts.price ?? ""),
        budgetMinimum: String(facts.minimum ?? ""),
        budgetMaximum: String(facts.price ?? ""),
        rentalPeriodId: facts.period ?? "monthly",
        areaSquareMeters: String(facts.areaSquareMeters ?? ""),
        ...(facts.details.bathroomCount === "1" ? { bathrooms: "1" } : {}),
        floorNumber: facts.details.floorNumber ?? "",
        privateNotes:
          mode === "offered"
            ? [entry.text, entry.ocrText].filter(Boolean).join("\n\n")
            : "",
      };
      const propertyId = createId();
      if (mode === "offered" && entry.files.length && !copyFiles)
        throw Error("IMPORT_COPY_REQUIRED");
      const attachments =
        mode === "offered" && entry.files.length
          ? await copyFiles!(propertyId, entry.files)
          : [];
      await session.write({
        values,
        step: "form",
        attachments,
        selectedPersonId: seekerId ?? "",
        baselineProperty: null,
        baselineRequirement: null,
        propertyId,
        offerId: createId(),
        requirementId: createId(),
      });
    }
    const snapshot = await session.read<{
      propertyId: string;
      requirementId: string;
    }>();
    return {
      pathname: "/capture/studio",
      params,
      targetId:
        mode === "offered" ? snapshot!.propertyId : snapshot!.requirementId,
    };
  }
  if (mode !== "wanted") throw Error("IMPORT_USE_CAPTURE");
  const identity = importedSessionIdentity(
    `requirement:new:${seekerId}:${purpose}:${selected.propertyType}:${subtype === "standard" ? "standard_apartment" : subtype}:${selected.floorUse ?? ""}`,
    entry.id,
  );
  const session = createFormSession(storage, identity);
  if (!(await session.read())) {
    const catalog: CatalogPreference[] = Object.entries(
      facts.details,
    ).flatMap<CatalogPreference>(([field, value]) => {
      const definition = getApplicablePropertyFormFieldsForMode(
        "wanted",
        selected.propertyType,
        selected.floorUse,
        subtype === "standard"
          ? "standard_apartment"
          : subtype === "duplex"
            ? "duplex"
            : undefined,
      ).find((f) => f.field === field);
      if (definition?.wanted.storage !== "catalogPreference") return [];
      if (definition.wanted.preferenceKind === "number")
        return [
          {
            field: field as PropertyDetailField,
            kind: "number",
            comparison: definition.wanted.comparison,
            value: Number(value),
          },
        ];
      if (definition.wanted.preferenceKind === "feature")
        return value === "true"
          ? [
              {
                field: field as PropertyDetailField,
                kind: "feature",
                value: true,
              },
            ]
          : [];
      return [];
    });
    if (subtype)
      catalog.push({
        field: "apartmentSubtype",
        kind: "choice",
        value: subtype === "standard" ? "standard_apartment" : subtype,
      });
    const amenityFields = {
      hasElevator: "elevator",
      hasMaidRoom: "maid_room",
      hasGarden: "garden",
      hasBalcony: "balcony",
    };
    const amenities = Object.entries(amenityFields)
      .filter(
        ([f]) =>
          fields.has(f as PropertyDetailField) &&
          facts.details[f as PropertyDetailField] === "true",
      )
      .map(([, amenity]) => amenity);
    await session.write({
      step: 3,
      showCatalogBackControls: false,
      purpose,
      propertyType: selected.propertyType,
      apartmentSubtype:
        subtype === "standard" ? "standard_apartment" : subtype || undefined,
      floorUse: selected.floorUse,
      areaMode: facts.allKuwait
        ? "all_kuwait"
        : facts.areaIds.length
          ? "specific_areas"
          : undefined,
      areas: facts.areaIds,
      bedrooms: count("bedroomCount"),
      bathrooms: count("bathroomCount"),
      masterBedrooms: count("masterBedroomCount"),
      livingRooms: count("livingRoomCount"),
      parking: count("parkingSpaceCount"),
      floorNumber: count("floorNumber"),
      requiredArea: String(facts.areaSquareMeters ?? ""),
      unspecified: [],
      driverRoom: false,
      catalog,
      amenities,
      excludedAmenities: Object.entries(amenityFields)
        .filter(
          ([f]) =>
            fields.has(f as PropertyDetailField) &&
            facts.details[f as PropertyDetailField] === "false",
        )
        .map(([, amenity]) => amenity),
      services: [],
      centralACPreference:
        facts.details.hasCentralAC === "true"
          ? true
          : facts.details.hasCentralAC === "false"
            ? false
            : undefined,
      minimum: String(facts.minimum ?? ""),
      maximum: String(facts.price ?? ""),
      cadence: facts.period ?? "monthly",
      notes: "",
      commercialActivity: "",
      commercialServices: {},
      automaticNumberCount: "",
      bathroomsEnabled: false,
      kitchenEnabled: false,
      nearbyServices: [],
      baseline: null,
      draftIdentity: createId(),
    });
  }
  const snapshot = await session.read<{ draftIdentity: string }>();
  return {
    pathname: "/requirement/new",
    params: { ...params, purpose },
    targetId: snapshot!.draftIdentity,
  };
}
