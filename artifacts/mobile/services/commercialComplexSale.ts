import type { PropertyDetailField } from '@workspace/property-domain';

export const COMMERCIAL_COMPLEX_SALE_FIELDS: readonly PropertyDetailField[] = [
  'buildingAgeBand', 'floorCount', 'hasBasement', 'unitCount', 'streetPosition',
  'parkingTypes', 'privateParkingCount', 'hasMortgage', 'rentalOccupancy', 'monthlyIncome',
];

export const COMMERCIAL_COMPLEX_CHOICES: Partial<Record<PropertyDetailField, readonly (readonly [string, string, string])[]>> = {
  buildingAgeBand: [['1_5', '1–5 years', '1–5 سنوات'], ['6_12', '6–12 years', '6–12 سنة'], ['over_12', 'More than 12 years', 'أكثر من 12 سنة']],
  streetPosition: [['one_street', 'One street', 'شارع واحد'], ['two_streets', 'Two streets', 'شارعين'], ['corner', 'Corner', 'زاوية'], ['front_back', 'Front and back', 'بطن وظهر']],
  parkingTypes: [['private', 'Private', 'خاصة'], ['public', 'Public', 'عامة'], ['paid', 'Paid', 'مدفوعة']],
  rentalOccupancy: [['vacant', 'Vacant', 'شاغر'], ['fully_rented', 'Fully rented', 'مؤجر بالكامل'], ['partially_rented', 'Partially rented', 'مؤجر جزئي']],
  hasBasement: [['true', 'Yes', 'نعم'], ['false', 'No', 'لا']],
  hasMortgage: [['true', 'Yes', 'نعم'], ['false', 'No', 'لا']],
};

export function grossAnnualRentalYield(price: number | undefined, monthlyIncome: number | undefined): number | undefined {
  if (price === undefined || monthlyIncome === undefined || !Number.isFinite(price) || price <= 0
    || !Number.isFinite(monthlyIncome) || monthlyIncome < 0) return undefined;
  const result = monthlyIncome * 12 / price * 100;
  return Number.isFinite(result) ? result : undefined;
}

export function toggleComplexParking(current: string, value: string): string {
  const selected = current.split(',').filter(Boolean);
  return (selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]).join(',');
}
