import type { PropertyType, Transaction } from './types.ts';
import type { PropertyDetailField } from './taxonomy.ts';

export interface PropertyFormProfile {
  readonly id: string;
  readonly fields: readonly PropertyDetailField[];
  readonly amenities: readonly PropertyDetailField[];
  readonly nearby: boolean;
}
export const FORM_JSON_FIELDS = ['apartmentLayouts', 'floorApartmentCounts'] as const;
export const FORM_MULTI_FIELDS = ['housingTypes', 'buildingParkingTypes', 'parkingTypes', 'warehouseLevels'] as const;
export const FORM_STRING_FIELDS = ['availableFrom', 'rentalScope'] as const;
export const BUILDING_AMENITIES: readonly PropertyDetailField[] = ['hasCentralAC', 'hasSecurityGuard', 'hasCCTV', 'hasFireSystem', 'hasAccessibleEntrance'];
export const COMMERCIAL_AMENITIES: readonly PropertyDetailField[] = ['hasCentralAC', 'hasElevator', 'hasPrivateEntrance', 'hasKitchen', 'hasSecurityGuard', 'hasCCTV', 'hasFireSystem', 'hasAccessibleEntrance'];
const apartmentStructure: readonly PropertyDetailField[] = ['floorCount', 'hasBasement', 'apartmentCount', 'sameApartmentsPerFloor', 'apartmentsPerFloor', 'floorApartmentCounts', 'sameApartmentLayout', 'roomsPerUnit', 'bathroomsPerUnit', 'apartmentLayouts'];
const parking: readonly PropertyDetailField[] = ['parkingTypes', 'privateParkingCount'];
export function getPropertyFormProfile(type: PropertyType, transaction: Transaction | undefined, values: Readonly<Record<string, unknown>> = {}): PropertyFormProfile | undefined {
  if (type === 'whole_building') return transaction === 'sale' ? {
    id: 'building_sale', nearby: true,
    fields: ['occupancy', 'buildingAgeBand', ...apartmentStructure, 'hasCommercialShops', 'shopCount', 'hasCommercialFloors', 'commercialFloorCount', 'elevatorCount', 'hasGuardRoom', 'streetPosition', ...parking, 'rentalOccupancy', 'monthlyIncome', 'hasMortgage'],
    amenities: BUILDING_AMENITIES,
  } : {
    id: 'building_rent', nearby: true,
    fields: ['housingTypes', 'buildingAgeBand', ...apartmentStructure, 'furnishing', 'elevatorCount', 'hasBuildingParking', 'buildingParkingTypes'],
    amenities: BUILDING_AMENITIES,
  };
  if (type === 'commercial_complex' && transaction === 'sale') return { id: 'complex_sale', nearby: true, fields: ['buildingAgeBand', 'floorCount', 'hasBasement', 'unitCount', 'streetPosition', ...parking, 'hasMortgage', 'rentalOccupancy', 'monthlyIncome'], amenities: [] };
  if (type === 'commercial_complex' && transaction === 'rent') return {
    id: 'complex_rent', nearby: false,
    fields: ['buildingAgeBand', 'floorCount', 'hasBasement', 'unitCount', 'streetPosition', ...parking, 'rentalScope', 'availableAreaSquareMeters', 'availableUnitCount'],
    amenities: ['hasCentralAC', 'hasElevator', 'hasEscalator', 'hasSecurityGuard', 'hasCCTV', 'hasFireSystem', 'hasAccessibleEntrance', 'hasLoadingArea', 'hasSharedBathrooms'],
  };
  if (type === 'floor' && values.floorUse === 'commercial' && transaction === 'rent') return {
    id: 'floor_rent', nearby: false,
    fields: ['floorUse', 'buildingAgeBand', 'floorNumber', 'bathroomCount', 'intendedUse', ...parking, 'availableFrom'],
    amenities: [...COMMERCIAL_AMENITIES.filter(field => field !== 'hasCCTV'), 'hasBalcony'],
  };
  if (type === 'office') return { id: 'office', nearby: false, fields: ['buildingAgeBand', 'floorNumber', 'bathroomCount', 'intendedUse', ...parking], amenities: [...COMMERCIAL_AMENITIES, 'hasPrivateBathroom'] };
  if (type === 'shop') return { id: 'shop', nearby: false, fields: ['buildingAgeBand', 'floorNumber', 'frontageWidthMeters', 'ceilingHeightMeters', 'entranceCount', 'bathroomCount', 'commercialActivity', ...parking], amenities: ['hasGlassFront', 'hasCentralAC', 'hasMezzanine', 'hasAttachedStorage', 'hasWaterDrainage', 'hasVentilation', 'hasFireSystem', 'hasLoadingArea'] };
  if (type === 'other_built_property' && values.propertyUse === 'residential') return {
    id: 'other_residential', nearby: true,
    fields: ['propertyUse', 'clarification', 'buildingAgeBand', 'bedroomCount', 'masterBedroomCount', 'bathroomCount', 'livingRoomCount', 'furnishing', 'occupancy', ...parking],
    amenities: ['hasCentralAC', 'hasElevator', 'hasBalcony', 'hasMaidRoom', 'hasLaundryRoom', 'hasSecurityGuard'],
  };
  if (type === 'other_built_property' && values.propertyUse === 'commercial') return {
    id: 'other_commercial', nearby: false,
    fields: ['propertyUse', 'clarification', 'buildingAgeBand', 'bathroomCount', 'intendedUse', ...parking], amenities: COMMERCIAL_AMENITIES,
  };
  return undefined;
}
const truth = (v: unknown) => v === true || v === 'true';
const falsity = (v: unknown) => v === false || v === 'false';
const selected = (v: unknown, item: string) => Array.isArray(v) ? v.includes(item) : typeof v === 'string' && v.split(',').includes(item);
/** Shared conditional field contract for create, edit, persistence and saved display. */
export function isPropertyProfileFieldVisible(field: string, type: PropertyType, transaction: Transaction | undefined, values: Readonly<Record<string, unknown>> = {}): boolean {
  const profile = getPropertyFormProfile(type, transaction, values);
  if (!profile) return true;
  if (field === 'plotAreaSquareMeters' || field === 'builtUpAreaSquareMeters') return true;
  if (![...profile.fields, ...profile.amenities].includes(field as PropertyDetailField)) return false;
  if (field === 'privateParkingCount') return selected(values.parkingTypes, 'private');
  if (field === 'buildingParkingTypes') return truth(values.hasBuildingParking);
  if (field === 'apartmentsPerFloor') return truth(values.sameApartmentsPerFloor);
  if (field === 'floorApartmentCounts') return falsity(values.sameApartmentsPerFloor);
  if (field === 'roomsPerUnit' || field === 'bathroomsPerUnit') return truth(values.sameApartmentLayout);
  if (field === 'apartmentLayouts') return falsity(values.sameApartmentLayout);
  if (field === 'shopCount') return truth(values.hasCommercialShops);
  if (field === 'commercialFloorCount') return truth(values.hasCommercialFloors);
  if (field === 'availableUnitCount' || field === 'availableAreaSquareMeters') return values.rentalScope === 'partial';
  return true;
}
/** Stale fields stay in older records but never leak back into the accepted presentation. */
export function projectPropertyProfileDetails(type: PropertyType, transaction: Transaction | undefined, values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const profile = getPropertyFormProfile(type, transaction, values);
  if (!profile) return { ...values };
  const result = Object.fromEntries(Object.entries(values).filter(([key]) => key === 'propertyType' || isPropertyProfileFieldVisible(key, type, transaction, values)));
  if (type === 'whole_building' && result.apartmentCount === undefined && values.unitCount !== undefined) result.apartmentCount = values.unitCount;
  return result;
}
/** Structured facts must retain JSON structure through draft/save/reload. */
export function propertyFormValueToDraft(field: string, value: unknown): string {
  if ((FORM_JSON_FIELDS as readonly string[]).includes(field)) return JSON.stringify(value);
  if (value && typeof value === 'object' && 'value' in value) return String((value as { value: unknown }).value);
  return String(value);
}
