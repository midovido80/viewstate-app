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
