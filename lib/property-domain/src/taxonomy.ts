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
  "private_roof",
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
  | "housingTypes"
  | "hasBuildingParking"
  | "buildingParkingTypes"
  | "sameApartmentLayout"
  | "sameApartmentsPerFloor"
  | "apartmentsPerFloor"
  | "apartmentLayouts"
  | "floorApartmentCounts"
  | "hasCommercialShops"
  | "hasCommercialFloors"
  | "commercialFloorCount"
  | "hasGuardRoom"
  | "hasCCTV"
  | "hasLoadingArea"
  | "hasSharedBathrooms"
  | "hasPrivateBathroom"
  | "hasGlassFront"
  | "hasMezzanine"
  | "hasAttachedStorage"
  | "hasWaterDrainage"
  | "hasVentilation"
  | "rentalScope"
  | "availableUnitCount"
  | "availableAreaSquareMeters"
  | "availableFrom"

  | "warehouseFinish"
  | "warehouseKind"
  | "warehouseLevels"
  | "entranceCount"
  | "hasVehicleRamp"
  | "rampVehicleSize"
  | "hasServiceElevator"
  | "serviceElevatorCapacityTons"
  | "hasEscalator"
  | "hasFireSystem"
  | "electricityPhase"
  | "electricityCapacity"
  | "electricityCapacityUnit"
  | "buildingAgeBand"
  | "hasBasement"
  | "streetPosition"
  | "parkingTypes"
  | "privateParkingCount"
  | "hasMortgage"
  | "rentalOccupancy"
  | "monthlyIncome"
  | "hasPrivateEntrance"
  | "hasAccessibleEntrance"
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
  | "studioRoomCount"
  | "propertyUse"
  | "occupancy"
  | "masterBedroomCount"
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
  | "hasSplitAC"
  | "hasSharedPool"
  | "hasSharedGym"
  | "hasSeaView"
  | "hasKitchen"
  | "hasHall"
  | "hasParking"
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
  readonly propertyUses?: readonly FloorUse[];
  readonly apartmentSubtypes?: readonly ApartmentSubtype[];
}

/** The canonical domain applicability matrix for enrichment fields. */
export const PROPERTY_DETAIL_FIELD_DEFINITIONS: readonly PropertyDetailFieldDefinition[] = [
  { field: "buildingAgeBand", appliesTo: ["commercial_complex", "floor", "warehouse", "whole_building", "office", "shop", "other_built_property"], floorUses: ["commercial"] },
  { field: "parkingTypes", appliesTo: ["commercial_complex", "floor", "whole_building", "office", "shop", "other_built_property"], floorUses: ["commercial"] },
  { field: "privateParkingCount", appliesTo: ["commercial_complex", "floor", "whole_building", "office", "shop", "other_built_property"], floorUses: ["commercial"] },
  { field: "rentalOccupancy", appliesTo: ["commercial_complex", "floor", "whole_building"], floorUses: ["commercial"] },
  { field: "monthlyIncome", appliesTo: ["commercial_complex", "floor", "whole_building"], floorUses: ["commercial"] },
  { field: "hasBasement", appliesTo: ["commercial_complex", "whole_building"] },
  { field: "streetPosition", appliesTo: ["commercial_complex", "whole_building"] },
  { field: "hasMortgage", appliesTo: ["commercial_complex", "whole_building"] },
  { field: "hasPrivateEntrance", appliesTo: ["floor", "office", "other_built_property"], floorUses: ["commercial"] },
  { field: "hasAccessibleEntrance", appliesTo: ["floor", "whole_building", "commercial_complex", "office", "other_built_property"], floorUses: ["commercial"] },
  { field: "plotAreaSquareMeters", appliesTo: ["whole_building", "commercial_complex", "house", "villa", "warehouse", "chalet", "other_built_property"] },
  { field: "builtUpAreaSquareMeters", appliesTo: PROPERTY_TYPES },
  { field: "bathroomCount", appliesTo: ["apartment", "floor", "house", "villa", "office", "shop", "warehouse", "chalet", "other_built_property"] },
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
  { field: "studioRoomCount", appliesTo: ["apartment"], apartmentSubtypes: ["studio"] },
  { field: "propertyUse", appliesTo: ["other_built_property"] },
  { field: "occupancy", appliesTo: ["whole_building", "apartment", "floor", "house", "villa", "chalet", "other_built_property"], floorUses: ["residential"], propertyUses: ["residential"] },
  { field: "bedroomCount", appliesTo: ["whole_building", "apartment", "floor", "house", "villa", "chalet", "other_built_property"], floorUses: ["residential"], propertyUses: ["residential"] },
  { field: "masterBedroomCount", appliesTo: ["whole_building", "apartment", "floor", "house", "villa", "chalet", "other_built_property"], floorUses: ["residential"], propertyUses: ["residential"], apartmentSubtypes: ["standard_apartment", "duplex"] },
  { field: "livingRoomCount", appliesTo: ["apartment", "floor", "house", "villa", "chalet", "other_built_property"], floorUses: ["residential"], propertyUses: ["residential"] },
  { field: "floorNumber", appliesTo: ["apartment", "floor", "office", "shop"] },
  { field: "floorUse", appliesTo: ["floor"] },
  { field: "furnishing", appliesTo: ["apartment", "floor", "house", "villa", "chalet", "whole_building", "other_built_property"], floorUses: ["residential"], propertyUses: ["residential"] },
  { field: "hasMaidRoom", appliesTo: ["apartment", "floor", "house", "villa", "chalet", "other_built_property"], floorUses: ["residential"], propertyUses: ["residential"] },
  { field: "hasHeating", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasBalcony", appliesTo: ["apartment", "floor", "house", "villa", "chalet", "other_built_property"], floorUses: ["residential", "commercial"], propertyUses: ["residential"] },
  { field: "hasLaundryRoom", appliesTo: ["apartment", "floor", "house", "villa", "chalet", "other_built_property"], floorUses: ["residential"], propertyUses: ["residential"] },
  { field: "hasSolarHeater", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasElevator", appliesTo: ["apartment", "floor", "house", "villa", "chalet", "commercial_complex", "office", "other_built_property"], floorUses: ["residential", "commercial"] },
  { field: "hasGarden", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasSecurityGuard", appliesTo: ["apartment", "floor", "house", "villa", "chalet", "whole_building", "commercial_complex", "office", "other_built_property"], floorUses: ["residential", "commercial"] },
  { field: "hasBBQArea", appliesTo: ["apartment", "floor", "house", "villa", "chalet"], floorUses: ["residential"] },
  { field: "hasPool", appliesTo: ["house", "villa", "chalet"] },
  { field: "hasWaterfront", appliesTo: ["chalet"] },
  { field: "hasCentralAC", appliesTo: ["whole_building", "apartment", "floor", "house", "villa", "chalet", "commercial_complex", "office", "shop", "warehouse", "other_built_property"] },
  { field: "hasKitchen", appliesTo: ["apartment", "floor", "office", "other_built_property"], apartmentSubtypes: ["studio"], floorUses: ["commercial"] },
  { field: "hasSplitAC", appliesTo: ["apartment"], apartmentSubtypes: ["studio"] },
  { field: "hasSharedPool", appliesTo: ["apartment"], apartmentSubtypes: ["studio"] },
  { field: "hasSharedGym", appliesTo: ["apartment"], apartmentSubtypes: ["studio"] },
  { field: "hasSeaView", appliesTo: ["apartment"], apartmentSubtypes: ["studio"] },
  { field: "hasHall", appliesTo: ["apartment"], apartmentSubtypes: ["studio"] },
  { field: "hasParking", appliesTo: ["apartment"], apartmentSubtypes: ["studio"] },
  { field: "intendedUse", appliesTo: ["floor", "office", "shop", "warehouse", "other_built_property"], floorUses: ["commercial"] },
  { field: "commercialActivity", appliesTo: ["floor", "office", "shop", "warehouse"], floorUses: ["commercial"] },
  { field: "frontageWidthMeters", appliesTo: ["floor", "shop", "commercial_complex"], floorUses: ["commercial"] },
  { field: "ceilingHeightMeters", appliesTo: ["floor", "shop", "warehouse"], floorUses: ["commercial"] },
  { field: "warehouseFinish", appliesTo: ["warehouse"] },
  { field: "warehouseKind", appliesTo: ["warehouse"] },
  { field: "warehouseLevels", appliesTo: ["warehouse"] },
  { field: "entranceCount", appliesTo: ["warehouse", "shop"] },
  { field: "hasVehicleRamp", appliesTo: ["warehouse"] },
  { field: "rampVehicleSize", appliesTo: ["warehouse"] },
  { field: "hasServiceElevator", appliesTo: ["warehouse"] },
  { field: "serviceElevatorCapacityTons", appliesTo: ["warehouse"] },
  { field: "hasEscalator", appliesTo: ["warehouse", "commercial_complex"] },
  { field: "hasFireSystem", appliesTo: ["warehouse", "whole_building", "commercial_complex", "floor", "office", "shop", "other_built_property"], floorUses: ["commercial"] },
  { field: "electricityPhase", appliesTo: ["warehouse"] },
  { field: "electricityCapacity", appliesTo: ["warehouse"] },
  { field: "electricityCapacityUnit", appliesTo: ["warehouse"] },
  { field: "loadingBayCount", appliesTo: ["warehouse"] },
  { field: "hasColdStorage", appliesTo: ["warehouse"] },
  { field: "housingTypes", appliesTo: ["whole_building"] },
  { field: "hasBuildingParking", appliesTo: ["whole_building"] },
  { field: "buildingParkingTypes", appliesTo: ["whole_building"] },
  { field: "sameApartmentLayout", appliesTo: ["whole_building"] },
  { field: "sameApartmentsPerFloor", appliesTo: ["whole_building"] },
  { field: "apartmentsPerFloor", appliesTo: ["whole_building"] },
  { field: "apartmentLayouts", appliesTo: ["whole_building"] },
  { field: "floorApartmentCounts", appliesTo: ["whole_building"] },
  { field: "hasCommercialShops", appliesTo: ["whole_building"] },
  { field: "hasCommercialFloors", appliesTo: ["whole_building"] },
  { field: "commercialFloorCount", appliesTo: ["whole_building"] },
  { field: "hasGuardRoom", appliesTo: ["whole_building"] },
  { field: "hasCCTV", appliesTo: ["whole_building", "commercial_complex", "floor", "office", "other_built_property"], floorUses: ["commercial"] },
  { field: "hasLoadingArea", appliesTo: ["commercial_complex", "shop", "other_built_property"] },
  { field: "hasSharedBathrooms", appliesTo: ["commercial_complex"] },
  { field: "hasPrivateBathroom", appliesTo: ["office"] },
  { field: "hasGlassFront", appliesTo: ["shop"] },
  { field: "hasMezzanine", appliesTo: ["shop"] },
  { field: "hasAttachedStorage", appliesTo: ["shop"] },
  { field: "hasWaterDrainage", appliesTo: ["shop"] },
  { field: "hasVentilation", appliesTo: ["shop"] },
  { field: "rentalScope", appliesTo: ["commercial_complex"] },
  { field: "availableUnitCount", appliesTo: ["commercial_complex"] },
  { field: "availableAreaSquareMeters", appliesTo: ["commercial_complex"] },
  { field: "availableFrom", appliesTo: ["floor"], floorUses: ["commercial"] },
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

