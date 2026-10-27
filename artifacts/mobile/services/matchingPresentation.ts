import { getAreaById } from '@/constants/kuwait-areas';
import type {
  MatchExplanation,
  MatchCategory,
} from "@workspace/property-domain";
import {
  propertyDetailLabels,
  formatPropertyDetailValue,
} from "@/services/propertyDetailPresentation";
import { DEMO_NEARBY_SERVICES } from "@/services/propertyDemoCatalog";

type Language = "en" | "ar";
const labels: Record<string, [string, string]> = {
  budget: ["Price", "السعر"],
  location: ["Area", "المنطقة"],
  bedrooms: ["Bedrooms", "غرف النوم"],
  bathrooms: ["Bathrooms", "الحمامات"],
  masterBedrooms: ["Master bedrooms", "غرف ماستر"],
  rentalPeriodId: ["Rental period", "دورية الإيجار"],
  driverRoom: ["Driver room", "غرفة سائق"],
};
export function matchingCriterionLabel(
  field: string,
  language: Language,
): string {
  if (field.startsWith("nearby:"))
    return (
      DEMO_NEARBY_SERVICES.find((item) => item.id === field.slice(7))?.label[
        language === "ar" ? 1 : 0
      ] ?? (language === "ar" ? "خدمة قريبة" : "Nearby service")
    );
  return (
    (labels[field] ??
      (propertyDetailLabels as Record<string, readonly string[]>)[field])?.[
      language === "ar" ? 1 : 0
    ] ?? (language === "ar" ? "شرط مطلوب" : "Requested condition")
  );
}
export function matchingCategoryLabel(
  category: MatchCategory,
  language: Language,
): string {
  const labels = {
    provisional: ["Preliminary fit — secondary information missing", "مناسب مبدئيًا — تفاصيل ثانوية ناقصة"],
    direct: ["Meets recorded requirements", "يحقق المتطلبات المسجلة"],
    negotiation: ["Alternative requiring discussion", "بديل يحتاج تفاوضًا"],
    needs_confirmation: ["Confirm missing information", "يحتاج تأكيد معلومات"],
    excluded: ["Outside matching conditions", "خارج شروط الترشيح"],
  };
  return labels[category][language === "ar" ? 1 : 0];
}
export function matchingExplanationText(
  item: MatchExplanation,
  language: Language,
): string {
  const ar = language === "ar";
  const label = matchingCriterionLabel(item.criterion, language);
  const format = (value: unknown) => {
    if (value === undefined) return ar ? "غير مسجل" : "Not recorded";
    if (item.criterion === "location")
      return ar ? "منطقة بديلة" : "Alternative area";
    if (item.criterion in propertyDetailLabels)
      return formatPropertyDetailValue(
        item.criterion as keyof typeof propertyDetailLabels,
        value,
        language,
      );
    return typeof value === "boolean"
      ? value
        ? ar
          ? "يوجد"
          : "Yes"
        : ar
          ? "لا يوجد"
          : "No"
      : String(value);
  };
  if (item.status === "unknown")
    return ar
      ? `${label}: يحتاج تأكيدًا، ولا يُحسب متحققًا.`
      : `${label}: needs confirmation; not counted as met.`;
  if (
    item.criterion === "budget" &&
    item.difference !== undefined &&
    item.difference > 0
  )
    return ar
      ? `أعلى من الميزانية بـ${Number(item.difference.toFixed(2))} (${item.percentDifference}٪). قبول التخفيض أو الزيادة غير مؤكد.`
      : `Above budget by ${Number(item.difference.toFixed(2))} (${item.percentDifference}%). Price negotiation is not confirmed.`;
  if (item.criterion === "location")
    return ar
      ? "منطقة بديلة اخترتها للمناقشة، وتحتاج قبول العميل."
      : "An explicitly selected alternative area; client acceptance is needed.";
  return ar
    ? `${label}: المطلوب ${format(item.expected)}؛ المسجل ${format(item.actual)}.`
    : `${label}: requested ${format(item.expected)}; recorded ${format(item.actual)}.`;
}

export interface MatchingComparisonRow {
  field: string;
  label: string;
  requested: string;
  offered: string;
  status: MatchExplanation['status'];
  statusLabel: string;
}
export function matchingComparisonRows(result: import('@workspace/property-domain').MatchResult, requirement: import('@workspace/property-domain').SeekerRequirement, property: import('@workspace/property-domain').Property | undefined, language: Language): MatchingComparisonRow[] {
  const ar = language === 'ar';
  const value = (field: string, raw: unknown): string => {
    if (raw === undefined) return ar ? 'غير مسجل' : 'Not recorded';
    const mapped = ({ bedrooms: 'bedroomCount', bathrooms: 'bathroomCount', masterBedrooms: 'masterBedroomCount' } as Record<string, string>)[field] ?? field;
    if (mapped in propertyDetailLabels) return formatPropertyDetailValue(mapped as keyof typeof propertyDetailLabels, raw, language);
    if (field === 'rentalPeriodId') return ({ monthly: ar ? 'شهري' : 'Monthly', yearly: ar ? 'سنوي' : 'Yearly', daily: ar ? 'يومي' : 'Daily' } as Record<string, string>)[String(raw)] ?? String(raw);
    return typeof raw === 'boolean' ? raw ? ar ? 'يوجد' : 'Yes' : ar ? 'لا يوجد' : 'No' : String(raw);
  };
  const rows = result.explanations.map(item => ({
    field: item.criterion, label: matchingCriterionLabel(item.criterion, language),
    requested: item.criterion === 'budget' ? `${requirement.budget.minimum}–${requirement.budget.maximum} ${requirement.budget.currencyCode}` : value(item.criterion, item.expected),
    offered: item.criterion === 'budget' ? `${result.priceAmount} ${requirement.budget.currencyCode}` : value(item.criterion, item.actual),
    status: item.status,
    statusLabel: item.status === 'matched' ? ar ? 'متوافق' : 'Meets' : item.status === 'unknown' ? ar ? 'غير مسجل' : 'Unknown' : ar ? 'غير متوافق' : 'Differs',
  }));
  const location: MatchingComparisonRow = {
    field: 'location', label: ar ? 'المنطقة' : 'Area',
    requested: requirement.preferredAreaMode === 'all_kuwait' ? ar ? 'كل الكويت' : 'All Kuwait' : requirement.preferredAreaIds.map(id => getAreaById(id)?.[language] ?? (ar ? 'منطقة محددة' : 'Selected area')).join('، '),
    offered: property ? getAreaById(property.core.locationArea.id)?.[language] ?? (ar ? 'غير مسجلة' : 'Not recorded') : ar ? 'غير مسجلة' : 'Not recorded',
    status: !property ? 'unknown' : rows.find(row => row.field === 'location')?.status ?? 'matched', statusLabel: ar ? 'متوافق' : 'Meets',
  };
  if (location.status !== 'matched') location.statusLabel = location.status === 'unknown' ? ar ? 'غير مسجل' : 'Unknown' : ar ? 'منطقة بديلة' : 'Alternative';
  const withoutLocation = rows.filter(row => row.field !== 'location');
  withoutLocation.push(location);
  const budget = withoutLocation.find(row => row.field === 'budget');
  if (budget && result.priceAmount < requirement.budget.minimum) budget.statusLabel = ar ? 'أقل من النطاق' : 'Below range';
  for (const row of withoutLocation) {
    const nativeMinimum = row.field === 'bedrooms' && requirement.bedroomsMinimum !== undefined || row.field === 'bathrooms' && requirement.bathroomsMinimum !== undefined || row.field === 'masterBedrooms' && requirement.masterBedroomsMinimum !== undefined;
    const catalogMinimum = requirement.catalogPreferences?.some(item => item.field === row.field && item.kind === 'number' && item.comparison === 'minimum');
    if (nativeMinimum || catalogMinimum) row.requested += ar ? ' فأكثر' : '+';
  }
  const priority = ['budget', 'location', 'bedrooms', 'bathrooms', 'hasCentralAC', 'builtUpAreaSquareMeters', 'hasElevator', 'apartmentSubtype'];
  return withoutLocation.sort((a, b) => {
    const rank = (field: string) => priority.includes(field) ? priority.indexOf(field) : priority.length;
    return rank(a.field) - rank(b.field);
  });
}
