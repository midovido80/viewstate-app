import type { RequirementValidationIssue } from '@workspace/property-domain';
import type { Language } from '@/contexts/I18nContext';

type RequirementIssueAlias =
  | 'missing_area_mode'
  | 'missing_specific_area'
  | 'invalid_number'
  | 'invalid_range'
  | 'master_bedroom_exceeds_bedrooms'
  | 'incompatible_category_preference'
  | 'invalid_requirement_draft'
  | 'save_conflict'
  | 'save_missing_person'
  | 'save_non_seeker'
  | 'save_edit_conflict'
  | 'save_storage_failure'
  | 'save_storage_uncertain'
  | 'save_readback_failed'
  | 'save_navigation_failed';

export type LocalizableRequirementIssueCode =
  | RequirementValidationIssue['code']
  | RequirementIssueAlias;

export type LocalizableRequirementIssue = {
  readonly code: LocalizableRequirementIssueCode | (string & {});
  readonly path?: readonly string[];
};

const messages: Record<LocalizableRequirementIssueCode, readonly [english: string, arabic: string]> = {
  invalid_requirement: ['Review the Requirement details and try again.', 'راجع تفاصيل المتطلب وحاول مرة أخرى.'],
  required: ['Complete the required Requirement details.', 'أكمل تفاصيل المتطلب المطلوبة.'],
  invalid_identifier: ['The Requirement identity is invalid.', 'هوية المتطلب غير صالحة.'],
  invalid_uuid_v4: ['The Requirement identity is invalid.', 'هوية المتطلب غير صالحة.'],
  invalid_seeker: ['Choose a valid seeker.', 'اختر باحثاً صالحاً.'],
  invalid_purpose: ['Choose Rent or Buy.', 'اختر الإيجار أو الشراء.'],
  invalid_property_type: ['Choose an approved property type.', 'اختر نوع عقار معتمداً.'],
  invalid_area_list: ['Add at least one preferred area.', 'أضف منطقة مفضلة واحدة على الأقل.'],
  missing_area_mode: ['Choose a preferred area scope.', 'اختر نطاق المناطق المفضلة.'],
  missing_specific_area: ['Choose at least one specific preferred area.', 'اختر منطقة مفضلة محددة واحدة على الأقل.'],
  invalid_area_id: ['Choose an area from the approved Kuwait list.', 'اختر منطقة من قائمة الكويت المعتمدة.'],
  duplicate_area_id: ['Each preferred area can appear only once.', 'لا يمكن تكرار المنطقة المفضلة.'],
  invalid_budget: ['Enter a valid budget range; From must not exceed To.', 'أدخل نطاق ميزانية صالحاً بحيث لا يتجاوز الحد الأدنى الحد الأقصى.'],
  invalid_range: ['Enter a valid range; the minimum must not exceed the maximum.', 'أدخل نطاقاً صالحاً؛ يجب ألا يتجاوز الحد الأدنى الحد الأقصى.'],
  invalid_currency: ['A currency is required.', 'العملة مطلوبة.'],
  invalid_number: ['Enter a valid non-negative number.', 'أدخل رقماً صالحاً غير سالب.'],
  invalid_rent_field: ['Enter valid rent details.', 'أدخل تفاصيل إيجار صالحة.'],
  master_bedroom_exceeds_bedrooms: ['Master bedrooms cannot exceed total bedrooms.', 'لا يمكن أن يتجاوز عدد غرف النوم الرئيسية إجمالي غرف النوم.'],
  invalid_occupancy: ['Choose a valid occupancy preference.', 'اختر تفضيل إشغال صالحاً.'],
  buy_rent_field_not_allowed: ['Rent-only fields are not allowed for Buy.', 'حقول الإيجار غير مسموحة لمتطلبات الشراء.'],
  invalid_amenity: ['Choose an approved amenity.', 'اختر ميزة معتمدة.'],
  duplicate_amenity: ['Each amenity can be selected only once.', 'لا يمكن اختيار الميزة أكثر من مرة.'],
  amenities_not_allowed: ['Amenities are not supported for this Requirement category.', 'المزايا غير مدعومة لفئة هذا المتطلب.'],
  invalid_catalog_preference: ['This property preference is invalid or not supported for the selected category.', 'تفضيل العقار غير صالح أو غير مدعوم للفئة المختارة.'],
  duplicate_catalog_preference: ['Each property preference can be selected only once.', 'لا يمكن اختيار تفضيل المواصفات أكثر من مرة.'],
  catalog_preference_not_allowed: ['This property preference is not available for the selected category or floor use.', 'تفضيل العقار غير متاح للفئة أو استخدام الدور المختار.'],
  incompatible_category_preference: ['Remove or change the preference that is not supported by this category.', 'أزل أو غيّر التفضيل غير المدعوم لهذه الفئة.'],
  invalid_floor_use: ['Choose an approved floor use for this Floor Requirement.', 'اختر استخداماً معتمداً لمتطلب الدور.'],
  invalid_requirement_draft: ['The Requirement draft is invalid. Review the highlighted details and try again.', 'مسودة المتطلب غير صالحة. راجع التفاصيل المحددة وحاول مرة أخرى.'],
  save_conflict: ['This Requirement changed before it could be saved. Review it and retry.', 'تغير هذا المتطلب قبل حفظه. راجعه وحاول مرة أخرى.'],
  save_missing_person: ['This Person is no longer available. Return to People and choose a Person again.', 'هذا الشخص لم يعد متاحاً. عُد إلى قائمة الأشخاص واختر شخصاً مرة أخرى.'],
  save_non_seeker: ['This Person is not classified as a seeker. Open Person Details and add the seeker classification before saving.', 'هذا الشخص غير مصنف كباحث. افتح تفاصيل الشخص وأضف تصنيف الباحث قبل الحفظ.'],
  save_edit_conflict: ['This Requirement changed elsewhere. Your edits were not saved. You can review them here; reopening the latest version requires confirming that they will be discarded.', 'تم تغيير هذا المتطلب في مكان آخر. لم تُحفظ تعديلاتك. يمكنك مراجعتها هنا؛ وستحتاج إلى تأكيد فقدانها قبل فتح أحدث نسخة.'],
  save_storage_failure: ['The Requirement could not be saved. Your entries are still here; you can safely try again.', 'تعذر حفظ المتطلب. ما زالت بياناتك هنا؛ يمكنك المحاولة مرة أخرى بأمان.'],
  save_storage_uncertain: ['The save result is uncertain. Your entries are still here; check its exact-ID status before retrying.', 'نتيجة الحفظ غير مؤكدة. ما زالت بياناتك هنا؛ تحقق من حالة المتطلب باستخدام هويته المحددة قبل إعادة المحاولة.'],
  save_readback_failed: ['The Requirement may have been saved, but it could not be confirmed. Your entries are still here; check the saved Requirement or open Person Details. Do not save it again yet.', 'قد يكون المتطلب قد حُفظ، لكن تعذر تأكيده. ما زالت بياناتك هنا؛ تحقق من المتطلب المحفوظ أو افتح تفاصيل الشخص. لا تحفظه مرة أخرى الآن.'],
  save_navigation_failed: ['The Requirement was saved and confirmed, but Person Details could not be opened. Your entries are still here; retry opening Person Details without saving again.', 'تم حفظ المتطلب وتأكيده، لكن تعذر فتح تفاصيل الشخص. ما زالت بياناتك هنا؛ أعد محاولة فتح تفاصيل الشخص دون الحفظ مرة أخرى.'],
};

const fallback = {
  en: 'Review the Requirement details and try again.',
  ar: 'راجع تفاصيل المتطلب وحاول مرة أخرى.',
} as const;

/**
 * Converts a domain validation issue into safe user-facing copy.
 *
 * The domain message and code are deliberately ignored: neither is guaranteed
 * to be localized, and internal identifiers must never reach the UI.
 */
export function localizedRequirementIssue(
  issue: LocalizableRequirementIssue | null | undefined,
  language: Language,
): string {
  const selectedLanguage: Language = language === 'ar' ? 'ar' : 'en';
  if (!issue) return fallback[selectedLanguage];
  const message = messages[issue.code as LocalizableRequirementIssueCode];
  return message?.[selectedLanguage === 'ar' ? 1 : 0] ?? fallback[selectedLanguage];
}
