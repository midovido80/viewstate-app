export type SyncProblem =
  | "offline"
  | "pending"
  | "missing_media"
  | "media_access"
  | "damaged_state"
  | "invalid_data"
  | "server"
  | "unknown";

export function workspaceSyncProblem(error: unknown): SyncProblem {
  const code = error instanceof Error ? error.message : "";
  if (/CONNECTION|FETCH|NETWORK|REAUTHENTICATE|HTTP_40[13]/i.test(code))
    return "offline";
  if (["SYNC_LOCAL_CHANGED", "SYNC_RETRY_AFTER_CONCURRENT_EDIT"].includes(code))
    return "pending";
  if (code === "SYNC_MEDIA_MISSING") return "missing_media";
  if (
    /^(MEDIA_OWNER_MISMATCH|SYNC_MEDIA_(HASH|HASH_MISMATCH|REFERENCE))$/.test(
      code,
    )
  )
    return "media_access";
  if (code === "SYNC_STATE_DAMAGED" || code === "SYNC_RECOVERY_NEEDS_REVIEW")
    return "damaged_state";
  if (/^SYNC_(UNREADABLE_LOCAL_DATA|INVALID_|CONTACT_CONFLICT)/.test(code))
    return "invalid_data";
  if (/^SYNC_(HTTP_|CLOUD_FORMAT)/.test(code)) return "server";
  return "unknown";
}

export function workspaceSyncProblemMessage(
  problem: SyncProblem,
  ar: boolean,
): string {
  const messages: Record<SyncProblem, readonly [string, string]> = {
    offline: [
      "تعذّر الاتصال بنسخة حسابك الخاصة. التغييرات محفوظة على هذا الجهاز وستُعاد المحاولة عند الاتصال.",
      "Your private account copy is offline. Changes remain on this device and will retry when connected.",
    ],
    pending: [
      "تغيّرت بيانات الجهاز أثناء الحفظ. سنعيد المحاولة تلقائيًا دون استبدال تعديلاتك.",
      "Device data changed while saving. We will retry without replacing your edits.",
    ],
    missing_media: [
      "تعذّر العثور على ملف صورة أو مرفق محفوظ ضمن سجلاتك. راجع مرفقات العقارات؛ لم نحذف أي مرفق أو ننشره للدوائر.",
      "An attachment file referenced by your records is missing. Review property attachments; none were deleted or shared with circles.",
    ],
    media_access: [
      "تعذّر التحقق من ملف مرفق أو صلاحية الوصول إليه. أوقفنا مزامنته لحماية بياناتك؛ لم نحذف الملف.",
      "An attachment could not be verified or accessed. Its synchronization stopped to protect your data; the file was not deleted.",
    ],
    damaged_state: [
      "معلومات متابعة الحفظ تحتاج مراجعة آمنة قبل جمع نسخة الجهاز ونسخة حسابك. لا تمسح بيانات التطبيق.",
      "Saved synchronization progress needs safe review before combining device and account copies. Do not clear app data.",
    ],
    invalid_data: [
      "يوجد سجل محلي أو ارتباط يحتاج تصحيحًا قبل الحفظ في حسابك. بيانات الجهاز محفوظة؛ راجع السجل ولا تمسح بيانات التطبيق.",
      "A local record or link needs correction before saving to your account. Device data is preserved; do not clear app data.",
    ],
    server: [
      "تعذّر حفظ نسخة حسابك الخاصة على الخادم. يمكنك متابعة العمل على الجهاز وإعادة المحاولة.",
      "Your private account copy could not be saved on the server. Continue working locally and retry.",
    ],
    unknown: [
      "لم يكتمل تحديث نسخة حسابك الخاصة. بيانات الجهاز محفوظة. أعد المحاولة، وإذا استمرت المشكلة أبلغ الدعم من الإعدادات.",
      "Your private account copy did not finish updating. Device data is preserved. Retry; if it persists, contact support from Settings.",
    ],
  };
  return messages[problem][ar ? 0 : 1];
}
