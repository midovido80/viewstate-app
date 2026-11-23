/** Stable reading order: a full-width field ends a row without reordering any controls. */
export function pairPropertyFields<T extends { fullWidth?: boolean }>(
  items: readonly T[],
): T[][] {
  const rows: T[][] = [];
  let pending: T[] = [];
  for (const item of items) {
    if (item.fullWidth) {
      if (pending.length) rows.push(pending);
      pending = [];
      rows.push([item]);
    } else {
      pending.push(item);
      if (pending.length === 2) {
        rows.push(pending);
        pending = [];
      }
    }
  }
  if (pending.length) rows.push(pending);
  return rows;
}
export function stackPropertyFields(width: number, fontScale: number): boolean {
  return width < 320 || fontScale > 1.35;
}

const requiredLabels: Record<string, readonly [string, string]> = {
  locationAreaId: ["Area", "المنطقة"],
  price: ["Price", "السعر"],
  areaSquareMeters: ["Area (m²)", "المساحة"],
  bedroomCount: ["Bedrooms", "غرف النوم"],
  bathroomCount: ["Bathrooms", "الحمامات"],
  floorUse: ["Floor use", "نوع الدور"],
  propertyUse: ["Property use", "استخدام العقار"],
  apartmentCount: ["Apartment count", "عدد الشقق"],
  sameApartmentLayout: ["Apartment layouts", "توزيع الشقق"],
  roomsPerUnit: ["Bedrooms per apartment", "غرف كل شقة"],
  bathroomsPerUnit: ["Bathrooms per apartment", "حمامات كل شقة"],
  apartmentLayouts: ["Apartment layouts", "توزيع الشقق"],
};
export function propertyCompletionNotice(
  missing: readonly string[],
  language: "ar" | "en",
): string | undefined {
  if (!missing.length) return undefined;
  const label =
    requiredLabels[missing[0]]?.[language === "ar" ? 1 : 0] ??
    (language === "ar" ? "المواصفات المطلوبة" : "Required specifications");
  return language === "ar"
    ? `لم يُحفظ التعديل بعد. أكمل ${label} في صفحة تفاصيل العقار.`
    : `Changes are not saved yet. Complete ${label} on Property details.`;
}
