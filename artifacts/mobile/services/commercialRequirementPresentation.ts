import type { CommercialRequirementServices } from '@workspace/property-domain';
export const COMMERCIAL_SERVICE_LABELS = {
  automaticNumberCount: ['Number of PACI numbers', 'عدد الأرقام الآلية'],
  cleaning: ['Facility cleaning', 'نظافة مرافق'],
  security: ['Security / Guard', 'أمن وحراسة'],
  cameras: ['Cameras', 'كاميرات'],
  elevators: ['Elevators', 'مصاعد'],
  bathrooms: ['Bathrooms', 'حمامات'],
  kitchen: ['Kitchen', 'مطبخ'],
  parkingTypes: ['Parking', 'المواقف'],
} as const;
export const COMMERCIAL_PARKING_LABELS = { private: ['Private', 'خاصة'], public: ['Public', 'عامة'], paid: ['Paid', 'مدفوعة'] } as const;
export function commercialServiceRows(value: CommercialRequirementServices, language: 'ar' | 'en'): {field: string; label: string; value: string}[] {
  const index = language === 'ar' ? 1 : 0;
  return Object.entries(value).flatMap(([key, item]) => {
    if (item === undefined || (Array.isArray(item) && !item.length)) return [];
    const field = key as keyof CommercialRequirementServices;
    const result = field === 'parkingTypes' ? (item as NonNullable<CommercialRequirementServices['parkingTypes']>).map(id => COMMERCIAL_PARKING_LABELS[id][index]).join(' · ')
      : field === 'bathrooms' || field === 'kitchen' ? (item === 'private' ? ['Private', 'خاص'] : ['Shared', 'مشترك'])[index]
      : item === true ? (language === 'ar' ? 'مطلوب' : 'Required') : item === false ? (language === 'ar' ? 'يجب ألا يتوفر' : 'Must not have') : String(item);
    return [{ field: `commercialServices.${field}`, label: COMMERCIAL_SERVICE_LABELS[field][index], value: result }];
  });
}

export function commercialServicesSummary(value: CommercialRequirementServices, language: 'ar' | 'en'): string[] {
  return commercialServiceRows(value, language).map(row => `${row.label}: ${row.value}`);
}
