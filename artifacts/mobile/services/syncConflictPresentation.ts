import { stableSync, type SyncConflict } from "./workspaceSync";
import type { WorkspaceValidationIssue } from "./workspaceValidation";

export function canChooseSyncVersion(conflict: SyncConflict): boolean {
  return (
    !conflict.validationIssues?.length ||
    conflict.base !== undefined ||
    (conflict.local !== undefined && conflict.remote !== undefined)
  );
}

export function syncMissingVersionLabel(
  conflict: SyncConflict,
  choice: "local" | "remote",
  language: "ar" | "en",
): string {
  if (conflict.base !== undefined)
    return language === "ar"
      ? "السجل محذوف من هذه النسخة"
      : "Record deleted in this version";
  return choice === "remote"
    ? language === "ar"
      ? "ما وصل للسحابة للحين"
      : "Not uploaded to the cloud yet"
    : language === "ar"
      ? "ما فيه نسخة على الجهاز للحين"
      : "No device copy yet";
}

export function syncValidationIssueMessage(
  issue: WorkspaceValidationIssue,
  language: "ar" | "en",
): string {
  const messages: Record<string, [string, string]> = {
    missing_requirement_person: [
      "الطلب مرتبط بشخص غير موجود. تقدر تحتفظ بالطلب ومواصفاته وتفك الربط المفقود.",
      "This request refers to a missing contact. Keep the request and its specifications by removing the missing link.",
    ],
    duplicate_person_phone: [
      "فيه سجلين لجهات الاتصال برقم الهاتف نفسه. راجع السجلين قبل المزامنة.",
      "Two contacts use the same phone number. Review both records before syncing.",
    ],
    invalid_requirement: [
      "بعض بيانات الطلب تحتاج تصحيح. افتح الطلب وراجع الحقول المحددة.",
      "Some request fields need correction. Open the request and review the identified fields.",
    ],
    invalid_property: [
      "بعض مواصفات العقار غير متوافقة. افتح العقار وراجع تفاصيله.",
      "Some property specifications are inconsistent. Open the property and review its details.",
    ],
    invalid_person: [
      "بيانات جهة الاتصال تحتاج تصحيح. راجع الاسم والرقم والأدوار.",
      "The contact needs correction. Review its name, phone and roles.",
    ],
    invalid_source: [
      "مصدر العقار مرتبط بسجل غير موجود أو بيانات غير صالحة. راجع مصدر العقار.",
      "The property source has a missing reference or invalid data. Review its source.",
    ],
    invalid_link: [
      "ربط الشخص بالعقار يشير إلى سجل غير موجود. راجع الربط قبل المزامنة.",
      "The contact/property link refers to a missing record. Review the link before syncing.",
    ],
  };
  return (messages[issue.code] ?? [
    "بيانات السجل تحتاج مراجعة قبل المزامنة.",
    "Review this record before syncing.",
  ])[language === "ar" ? 0 : 1];
}

export interface SyncFieldDifference {
  path: string[];
  local: unknown;
  remote: unknown;
}

export function syncConflictDifferences(
  local: unknown,
  remote: unknown,
  path: string[] = [],
): SyncFieldDifference[] {
  if (stableSync(local) === stableSync(remote)) return [];
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(local) || !object(remote)) return [{ path, local, remote }];
  return [...new Set([...Object.keys(local), ...Object.keys(remote)])].flatMap(
    (key) => syncConflictDifferences(local[key], remote[key], [...path, key]),
  );
}

export function syncConflictName(conflict: SyncConflict): string {
  for (const value of [conflict.local, conflict.remote, conflict.base]) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const name = conflict.key.startsWith("person/")
      ? record.name
      : (record.listingTitle ?? record.title);
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "";
}
