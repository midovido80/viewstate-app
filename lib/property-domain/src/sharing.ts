import { PROPERTY_DETAIL_FIELD_DEFINITIONS } from "./taxonomy.ts";
import type { PropertyDetailField } from "./taxonomy.ts";
import type { Property } from "./types.ts";
import { validateProperty } from "./validation.ts";

export const PROPERTY_SHARE_NORMAL_FIELDS = [
  "property_type",
  "transaction",
  "price",
  "area",
  "type_details",
  "description",
] as const;

export type PropertyShareNormalField =
  typeof PROPERTY_SHARE_NORMAL_FIELDS[number];

export interface PropertyShareSelection {
  readonly normalFields: readonly PropertyShareNormalField[];
  readonly attachmentIds: readonly string[];
  readonly discloseOwnerSource: boolean;
  readonly discloseExactLocation: boolean;
  readonly disclosePaci: boolean;
  readonly discloseManualLocation: boolean;
  readonly discloseMapsLink: boolean;
  /** Selecting IDs is the per-share disclosure action. No linked Person is inferred. */
  readonly personContactIds: readonly string[];
}

export interface PropertyShareContact {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
}

export interface PropertySharePrivateLocation {
  readonly paci?: string;
  readonly manualLocation?: string;
  readonly mapsLink?: string;
}

export interface PropertyShareAttachment {
  readonly id: string;
  readonly propertyCoreId: string;
}

export interface PropertyShareLabels {
  readonly propertyType: string;
  readonly transaction: string;
  readonly price: string;
  readonly area: string;
  readonly typeDetails: string;
  readonly description: string;
  readonly ownerSource: string;
  readonly exactLocation: string;
  readonly paci: string;
  readonly manualLocation: string;
  readonly mapsLink: string;
  readonly personContact: string;
}

export interface PropertyShareRequest {
  readonly property: Property;
  readonly selection: PropertyShareSelection;
  /** Local attachment records; cross-Property records cannot be selected. */
  readonly availableAttachments: readonly PropertyShareAttachment[];
  readonly privateLocation?: PropertySharePrivateLocation;
  /** Contacts are candidates only; they are never included without a selected ID. */
  readonly contacts?: readonly PropertyShareContact[];
  readonly labels?: Partial<PropertyShareLabels>;
  readonly detailLabels?: Partial<Record<PropertyDetailField, string>>;
  readonly detailValueLabels?: Readonly<Record<string, string>>;
  /** Localized display values for BASIC enums and the approved Area ID. */
  readonly normalValueLabels?: Readonly<Record<string, string>>;
  /** Optional localized price rendering; the canonical amount is still selected here. */
  readonly formattedPrice?: string;
  /** Localized rendering of the stored rent cadence, supplied by the presentation layer. */
  readonly rentalCadence: string;
  /** Localized product attribution, supplied by the presentation layer. */
  readonly attribution: string;
}

export interface PropertySharePreview {
  /** This exact text must be passed to the platform share adapter. */
  readonly text: string;
  /** In the exact requested order, for resolution by a local-file adapter. */
  readonly attachmentIds: readonly string[];
}

export class PropertySharePolicyError extends Error {
  readonly code:
    | "INVALID_PROPERTY"
    | "DUPLICATE_SELECTION"
    | "UNKNOWN_NORMAL_FIELD"
    | "UNKNOWN_ATTACHMENT"
    | "UNKNOWN_PERSON_CONTACT"
    | "MISSING_DISCLOSURE_VALUE";

  constructor(
    code:
      | "INVALID_PROPERTY"
      | "DUPLICATE_SELECTION"
      | "UNKNOWN_NORMAL_FIELD"
      | "UNKNOWN_ATTACHMENT"
      | "UNKNOWN_PERSON_CONTACT"
      | "MISSING_DISCLOSURE_VALUE",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "PropertySharePolicyError";
  }
}

const defaultLabels: PropertyShareLabels = {
  propertyType: "Property type",
  transaction: "Transaction",
  price: "Price",
  area: "Area",
  typeDetails: "Property detail",
  description: "Description",
  ownerSource: "Owner / source",
  exactLocation: "Exact location",
  paci: "PACI",
  manualLocation: "Manual location",
  mapsLink: "Maps link",
  personContact: "Contact",
};

/**
 * Creates a fresh, non-persisted selection. Normal BASIC fields and available
 * normal details are on; every sensitive disclosure and attachment is off.
 */
export function createPropertyShareSelection(
  property: Property,
): PropertyShareSelection {
  const validation = validateProperty(property);
  if (!validation.ok) {
    throw new PropertySharePolicyError(
      "INVALID_PROPERTY",
      "A share selection can only be created for a validated Property.",
    );
  }
  const normalFields: PropertyShareNormalField[] = [
    "property_type",
    "transaction",
    "price",
    "area",
  ];
  if (property.typeDetails !== undefined && PROPERTY_DETAIL_FIELD_DEFINITIONS.some(
    definition => (property.typeDetails as unknown as Record<string, unknown>)[definition.field] !== undefined,
  )) {
    normalFields.push("type_details");
  }
  if (property.core.description !== undefined) normalFields.push("description");

  return {
    normalFields,
    attachmentIds: [],
    discloseOwnerSource: false,
    discloseExactLocation: false,
    disclosePaci: false,
    discloseManualLocation: false,
    discloseMapsLink: false,
    personContactIds: [],
  };
}

function assertUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) {
    throw new PropertySharePolicyError(
      "DUPLICATE_SELECTION",
      "A share selection cannot contain duplicate IDs or fields.",
    );
  }
}

function requireDisclosure(
  selected: boolean,
  value: string | undefined,
  name: string,
): string | undefined {
  if (!selected) return undefined;
  if (value === undefined || value.length === 0) {
    throw new PropertySharePolicyError(
      "MISSING_DISCLOSURE_VALUE",
      `${name} was selected but has no value.`,
    );
  }
  return value;
}

/**
 * Canonical privacy boundary for Property sharing. It accepts one Property,
 * validates it, and constructs both the exact preview text and file ID list.
 * Private Notes are deliberately absent from the selection and output model.
 */
export function buildPropertySharePreview(
  request: PropertyShareRequest,
): PropertySharePreview {
  const validation = validateProperty(request.property);
  if (!validation.ok) {
    throw new PropertySharePolicyError(
      "INVALID_PROPERTY",
      `Only a validated Property can be shared: ${validation.issues
        .map(item => `${item.path.join(".")}:${item.code}`)
        .join(", ")}`,
    );
  }

  const { property, selection } = request;
  assertUnique(selection.normalFields);
  assertUnique(selection.attachmentIds);
  assertUnique(selection.personContactIds);

  const approvedFields = new Set<string>(PROPERTY_SHARE_NORMAL_FIELDS);
  const unknownField = selection.normalFields.find(field => !approvedFields.has(field));
  if (unknownField !== undefined) {
    throw new PropertySharePolicyError(
      "UNKNOWN_NORMAL_FIELD",
      `Unapproved normal Property field: ${String(unknownField)}`,
    );
  }

  assertUnique(request.availableAttachments.map(attachment => attachment.id));
  const availableAttachments = new Set(
    request.availableAttachments
      .filter(attachment => attachment.propertyCoreId === property.core.id)
      .map(attachment => attachment.id),
  );
  const unknownAttachment = selection.attachmentIds.find(
    id => !availableAttachments.has(id),
  );
  if (unknownAttachment !== undefined) {
    throw new PropertySharePolicyError(
      "UNKNOWN_ATTACHMENT",
      `Attachment is not available for this Property: ${unknownAttachment}`,
    );
  }

  const suppliedLabels = request.labels;
  const labels: PropertyShareLabels = {
    propertyType: suppliedLabels?.propertyType ?? defaultLabels.propertyType,
    transaction: suppliedLabels?.transaction ?? defaultLabels.transaction,
    price: suppliedLabels?.price ?? defaultLabels.price,
    area: suppliedLabels?.area ?? defaultLabels.area,
    typeDetails: suppliedLabels?.typeDetails ?? defaultLabels.typeDetails,
    description: suppliedLabels?.description ?? defaultLabels.description,
    ownerSource: suppliedLabels?.ownerSource ?? defaultLabels.ownerSource,
    exactLocation: suppliedLabels?.exactLocation ?? defaultLabels.exactLocation,
    paci: suppliedLabels?.paci ?? defaultLabels.paci,
    manualLocation:
      suppliedLabels?.manualLocation ?? defaultLabels.manualLocation,
    mapsLink: suppliedLabels?.mapsLink ?? defaultLabels.mapsLink,
    personContact:
      suppliedLabels?.personContact ?? defaultLabels.personContact,
  };
  const lines: string[] = [];
  const fields = new Set(selection.normalFields);
  const add = (label: string, value: string | undefined) => {
    if (value !== undefined && value.length > 0) lines.push(`${label}: ${value}`);
  };

  const localizedNormalValue = (value: string) =>
    request.normalValueLabels?.[value] ?? value;
  if (fields.has("property_type")) {
    add(labels.propertyType, localizedNormalValue(property.core.propertyType));
  }
  if (fields.has("transaction")) {
    add(labels.transaction, localizedNormalValue(property.activeOffer.transaction));
  }
  if (fields.has("price")) {
    const price = property.activeOffer.transaction === "sale"
      ? property.activeOffer.salePrice
      : property.activeOffer.rentalPrice;
    const renderedPrice = request.formattedPrice ?? `${price.amount} ${price.currencyCode}`;
    add(
      labels.price,
      property.activeOffer.transaction === "rent"
        ? `${renderedPrice} ${request.rentalCadence}`
        : renderedPrice,
    );
  }
  if (fields.has("area")) {
    add(labels.area, localizedNormalValue(property.core.locationArea.id));
  }
  if (fields.has("type_details") && property.typeDetails !== undefined) {
    const details = property.typeDetails as unknown as Record<string, unknown>;
    for (const definition of PROPERTY_DETAIL_FIELD_DEFINITIONS) {
      const value = details[definition.field];
      if (value === undefined) continue;
      const literalValue = typeof value === "object" && value !== null && "value" in value
        ? String((value as { value: unknown }).value)
        : request.detailValueLabels?.[String(value)]
          ?? (typeof value === "boolean" ? value ? "Yes" : "No" : String(value));
      add(request.detailLabels?.[definition.field] ?? `${labels.typeDetails} · ${definition.field}`, literalValue);
    }
  }
  if (fields.has("description")) add(labels.description, property.core.description?.value);

  add(
    labels.ownerSource,
    requireDisclosure(
      selection.discloseOwnerSource,
      property.core.ownerSource?.value,
      labels.ownerSource,
    ),
  );
  add(
    labels.exactLocation,
    requireDisclosure(
      selection.discloseExactLocation,
      property.core.exactLocation?.value,
      labels.exactLocation,
    ),
  );
  add(
    labels.paci,
    requireDisclosure(
      selection.disclosePaci,
      request.privateLocation?.paci,
      labels.paci,
    ),
  );
  add(
    labels.manualLocation,
    requireDisclosure(
      selection.discloseManualLocation,
      request.privateLocation?.manualLocation,
      labels.manualLocation,
    ),
  );
  add(
    labels.mapsLink,
    requireDisclosure(
      selection.discloseMapsLink,
      request.privateLocation?.mapsLink,
      labels.mapsLink,
    ),
  );

  const contacts = new Map((request.contacts ?? []).map(contact => [contact.id, contact]));
  for (const id of selection.personContactIds) {
    const contact = contacts.get(id);
    if (contact === undefined) {
      throw new PropertySharePolicyError(
        "UNKNOWN_PERSON_CONTACT",
        `Person contact is not available for explicit sharing: ${id}`,
      );
    }
    add(labels.personContact, `${contact.name} — ${contact.phone}`);
  }

  if (lines.length > 0 && request.attribution.length > 0) {
    lines.push("", request.attribution);
  }

  return {
    text: lines.join("\n"),
    attachmentIds: [...selection.attachmentIds],
  };
}