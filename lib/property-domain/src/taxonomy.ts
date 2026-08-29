import type {
  ApartmentSubtype,
  FloorUse,
  Furnishing,
  PropertyType,
  Transaction,
} from "./types.ts";

export const PROPERTY_TYPES = [
  "whole_building",
  "commercial_complex",
  "apartment",
  "floor",
  "house",
  "villa",
  "office",
  "shop",
  "warehouse",
  "chalet",
  "other_built_property",
] as const satisfies readonly PropertyType[];

export const APARTMENT_SUBTYPES = [
  "studio",
  "standard_apartment",
  "duplex",
] as const satisfies readonly ApartmentSubtype[];

export const FLOOR_USES = [
  "residential",
  "commercial",
] as const satisfies readonly FloorUse[];

export const FURNISHING_VALUES = [
  "unfurnished",
  "semi_furnished",
  "furnished",
] as const satisfies readonly Furnishing[];

export type PropertyDetailField =
  | "plotAreaSquareMeters"
  | "builtUpAreaSquareMeters"
  | "bathroomCount"
  | "parkingSpaceCount"
  | "floorCount"
  | "unitCount"
  | "apartmentCount"
  | "shopCount"
  | "officeCount"
  | "elevatorCount"
  | "apartmentSubtype"
  | "bedroomCount"
  | "livingRoomCount"
  | "floorNumber"
  | "floorUse"
  | "furnishing"
  | "hasMaidRoom"
  | "hasPool"
  | "hasWaterfront"
  | "intendedUse"
  | "commercialActivity"
  | "frontageWidthMeters"
  | "ceilingHeightMeters"
  | "loadingBayCount"
  | "hasColdStorage"
  | "clarification";

export interface PropertyDetailFieldDefinition {
  readonly field: PropertyDetailField;
  readonly appliesTo: readonly PropertyType[];
  readonly floorUses?: readonly FloorUse[];
}

/** The canonical domain applicability matrix for enrichment fields. */
export const PROPERTY_DETAIL_FIELD_DEFINITIONS: readonly PropertyDetailFieldDefinition[] = [
  { field: "plotAreaSquareMeters", appliesTo: ["whole_building", "commercial_complex", "house", "villa", "warehouse", "chalet", "other_built_property"] },
  { field: "builtUpAreaSquareMeters", appliesTo: PROPERTY_TYPES },
  { field: "bathroomCount", appliesTo: ["apartment", "floor", "house", "villa", "office", "shop", "warehouse", "chalet"] },
  { field: "parkingSpaceCount", appliesTo: PROPERTY_TYPES },
  { field: "floorCount", appliesTo: ["whole_building", "commercial_complex", "house", "villa", "chalet"] },
  { field: "unitCount", appliesTo: ["whole_building", "commercial_complex"] },
  { field: "apartmentCount", appliesTo: ["whole_building", "commercial_complex"] },
  { field: "shopCount", appliesTo: ["whole_building", "commercial_complex"] },
  { field: "officeCount", appliesTo: ["whole_building", "commercial_complex"] },
  { field: "elevatorCount", appliesTo: ["whole_building", "commercial_complex"] },
  { field: "apartmentSubtype", appliesTo: ["apartment"] },
  { field: "bedroomCount", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "livingRoomCount", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "floorNumber", appliesTo: ["apartment", "floor", "office", "shop"] },
  { field: "floorUse", appliesTo: ["floor"] },
  { field: "furnishing", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasMaidRoom", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasPool", appliesTo: ["house", "villa", "chalet"] },
  { field: "hasWaterfront", appliesTo: ["chalet"] },
  { field: "intendedUse", appliesTo: ["floor", "office", "shop", "warehouse"], floorUses: ["commercial"] },
  { field: "commercialActivity", appliesTo: ["floor", "office", "shop", "warehouse"], floorUses: ["commercial"] },
  { field: "frontageWidthMeters", appliesTo: ["floor", "shop"], floorUses: ["commercial"] },
  { field: "ceilingHeightMeters", appliesTo: ["floor", "shop", "warehouse"], floorUses: ["commercial"] },
  { field: "loadingBayCount", appliesTo: ["warehouse"] },
  { field: "hasColdStorage", appliesTo: ["warehouse"] },
  { field: "clarification", appliesTo: ["other_built_property"] },
] as const;

export const TRANSACTIONS = [
  "sale",
  "rent",
] as const satisfies readonly Transaction[];

export function isPropertyType(value: unknown): value is PropertyType {
  return (
    typeof value === "string" &&
    (PROPERTY_TYPES as readonly string[]).includes(value)
  );
}

export function isApartmentSubtype(
  value: unknown,
): value is ApartmentSubtype {
  return (
    typeof value === "string" &&
    (APARTMENT_SUBTYPES as readonly string[]).includes(value)
  );
}

export function isFloorUse(value: unknown): value is FloorUse {
  return (
    typeof value === "string" &&
    (FLOOR_USES as readonly string[]).includes(value)
  );
}

export function isFurnishing(value: unknown): value is Furnishing {
  return typeof value === "string" &&
    (FURNISHING_VALUES as readonly string[]).includes(value);
}

export function isTransaction(value: unknown): value is Transaction {
  return (
    typeof value === "string" &&
    (TRANSACTIONS as readonly string[]).includes(value)
  );
}