/** Presentation only: retain each form's canonical fields and conditional ownership. */
const PRIORITY: Readonly<Record<string, number>> = {
  hasCentralAC: 0, central_ac: 0,
  hasSecurityGuard: 1, security_guard: 1,
  hasElevator: 2, elevator: 2, elevatorCount: 2, hasServiceElevator: 2,
  parkingTypes: 3, hasBuildingParking: 3, hasParking: 3, parkingSpaceCount: 3, parking: 3,
  hasSplitAC: 4, hasFireSystem: 5, hasCCTV: 6, hasAccessibleEntrance: 7,
  hasPrivateEntrance: 8, hasBalcony: 9, balcony: 9, hasKitchen: 10,
  hasPrivateBathroom: 11, hasMaidRoom: 12, hasLaundryRoom: 13,
  hasLoadingArea: 14, hasVehicleRamp: 15, hasEscalator: 16,
  hasColdStorage: 17, hasSharedPool: 18, hasPool: 18, hasSharedGym: 19,
  hasSeaView: 20, hasWaterfront: 20, hasGarden: 21, hasSolarHeater: 22,
  hasHeating: 23, hasBBQArea: 24,
};

export function propertyAmenityRank(field: string): number {
  return PRIORITY[field] ?? 100;
}

/** Stable order; never mutates catalogs or saved values. */
export function orderPropertyAmenities<T>(items: readonly T[], field: (item: T) => string): T[] {
  return [...items].sort((a, b) => propertyAmenityRank(field(a)) - propertyAmenityRank(field(b)));
}

/** Detail controls stay beside their owner, including unknown/zero/negative answers. */
export const AMENITY_DETAIL_GROUPS = [
  ['elevatorCount'],
  ['hasBuildingParking', 'buildingParkingTypes'],
  ['parkingTypes', 'privateParkingCount'],
  ['hasParking'],
  ['parkingSpaceCount'],
] as const;

/** Prefer the form-owned parking representation over historical alternatives. */
export function availableAmenityDetailGroups(values: Readonly<Record<string, unknown>>): readonly (readonly string[])[] {
  const known = (field: string) => values[field] !== undefined && values[field] !== null && values[field] !== '';
  const elevator = AMENITY_DETAIL_GROUPS[0];
  const parking = AMENITY_DETAIL_GROUPS.slice(1).find(group => known(group[0]));
  return [
    ...(known(elevator[0]) ? [elevator] : []),
    ...(parking ? [parking.filter(field => known(field)
      && (field !== 'buildingParkingTypes' || values.hasBuildingParking === true || values.hasBuildingParking === 'true')
      && (field !== 'privateParkingCount' || (Array.isArray(values.parkingTypes) ? values.parkingTypes : String(values.parkingTypes).split(',')).includes('private')))] : []),
  ];
}
