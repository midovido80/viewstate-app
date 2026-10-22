import type { PropertyDetailField } from '@workspace/property-domain';

export const WAREHOUSE_CHOICES: Partial<Record<PropertyDetailField, readonly (readonly [string, string, string])[]>> = {
  warehouseFinish: [['normal', 'Normal', 'عادي'], ['good', 'Good', 'جيد'], ['super_deluxe', 'Super deluxe', 'سوبر ديلوكس']],
  warehouseKind: [['industrial', 'Industrial', 'صناعي'], ['food', 'Food', 'غذائي']],
  warehouseLevels: [['basement', 'Basement', 'سرداب'], ['ground', 'Ground floor', 'أرضي']],
  rampVehicleSize: [['large', 'Large vehicle', 'سيارة كبيرة'], ['medium', 'Medium vehicle', 'سيارة متوسطة'], ['small', 'Small vehicle', 'سيارة صغيرة']],
  electricityPhase: [['two_phase', '2 phase', '2 فاز'], ['three_phase', '3 phase', '3 فاز']],
  electricityCapacityUnit: [['A', 'Ampere (A)', 'أمبير (A)'], ['kW', 'Kilowatt (kW)', 'كيلوواط (kW)'], ['kVA', 'kVA', 'كيلوفولت أمبير (kVA)']],
};
export const WAREHOUSE_SPEC_FIELDS: readonly PropertyDetailField[] = [
  'buildingAgeBand', 'ceilingHeightMeters', 'warehouseFinish', 'warehouseKind', 'hasColdStorage',
  'warehouseLevels', 'entranceCount', 'hasVehicleRamp', 'rampVehicleSize',
  'hasServiceElevator', 'serviceElevatorCapacityTons', 'hasEscalator', 'hasCentralAC', 'hasFireSystem',
  'electricityPhase', 'electricityCapacity', 'electricityCapacityUnit',
];
export const WAREHOUSE_EXTRA_FIELDS: readonly PropertyDetailField[] = ['bathroomCount', 'parkingSpaceCount', 'loadingBayCount'];
export function warehouseFieldVisible(field: PropertyDetailField, values: Readonly<Record<string, unknown>>): boolean {
  if (field === 'hasColdStorage') return values.warehouseKind === 'food';
  if (field === 'rampVehicleSize') return values.hasVehicleRamp === true || values.hasVehicleRamp === 'true';
  if (field === 'serviceElevatorCapacityTons') return values.hasServiceElevator === true || values.hasServiceElevator === 'true';
  return WAREHOUSE_SPEC_FIELDS.includes(field) || WAREHOUSE_EXTRA_FIELDS.includes(field);
}
/** Apply conditional ownership on every write, not only through UI visibility. */
export function sanitizeWarehouseDetails<T extends Record<string, unknown>>(details: T): T {
  const result: Record<string, unknown> = { ...details };
  if (result.warehouseKind === 'industrial') delete result.hasColdStorage;
  if (result.hasVehicleRamp !== true && result.hasVehicleRamp !== 'true') delete result.rampVehicleSize;
  if (result.hasServiceElevator !== true && result.hasServiceElevator !== 'true') delete result.serviceElevatorCapacityTons;
  return result as T;
}
export function toggleWarehouseLevel(current: string, next: string): string {
  const selected = current.split(',').filter(Boolean);
  const updated = selected.includes(next) ? selected.filter(value => value !== next) : [...selected, next];
  return ['basement', 'ground'].filter(value => updated.includes(value)).join(',');
}
