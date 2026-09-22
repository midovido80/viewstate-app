import type {
  ApartmentSubtype,
  FloorUse,
  Furnishing,
  PropertyType,
  Transaction,
  ResidentialAmenity,
} from "./types.ts";

export const RESIDENTIAL_AMENITIES = [
  "heating",
  "balcony",
  "maid_room",
  "laundry_room",
  "solar_heater",
  "elevator",
  "garden",
  "security_guard",
  "bbq_area",
] as const satisfies readonly ResidentialAmenity[];

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
  | "roomsPerUnit"
  | "bathroomsPerUnit"
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
  | "hasHeating"
  | "hasBalcony"
  | "hasLaundryRoom"
  | "hasSolarHeater"
  | "hasElevator"
  | "hasGarden"
  | "hasSecurityGuard"
  | "hasBBQArea"
  | "hasPool"
  | "hasWaterfront"
  | "hasCentralAC"
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
  { field: "roomsPerUnit", appliesTo: ["whole_building", "commercial_complex"] },
  { field: "bathroomsPerUnit", appliesTo: ["whole_building", "commercial_complex"] },
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
  { field: "hasHeating", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasBalcony", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasLaundryRoom", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasSolarHeater", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasElevator", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasGarden", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasSecurityGuard", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasBBQArea", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasPool", appliesTo: ["house", "villa", "chalet"] },
  { field: "hasWaterfront", appliesTo: ["chalet"] },
  { field: "hasCentralAC", appliesTo: ["whole_building", "apartment", "floor", "house", "villa", "chalet", "commercial_complex", "office", "shop", "warehouse", "other_built_property"] },
  { field: "intendedUse", appliesTo: ["floor", "office", "shop", "warehouse"], floorUses: ["commercial"] },
  { field: "commercialActivity", appliesTo: ["floor", "office", "shop", "warehouse"], floorUses: ["commercial"] },
  { field: "frontageWidthMeters", appliesTo: ["floor", "shop", "commercial_complex"], floorUses: ["commercial"] },
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

export function isResidentialAmenity(value: unknown): value is ResidentialAmenity {
  return typeof value === "string" &&
    (RESIDENTIAL_AMENITIES as readonly string[]).includes(value);
}