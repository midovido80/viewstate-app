import { createContext, useContext, useState, ReactNode, useMemo, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

export type Language = 'en' | 'ar';

export interface Translations {
  [key: string]: string;
}

const en: Translations = {
  'home.title': 'Properties',
  'home.search': 'Search properties...',
  'home.empty': 'No properties captured yet.',
  'home.new': 'Capture Property',
  'detail.title': 'Property details',
  'detail.edit': 'Edit',
  'detail.type': 'Property type',
  'detail.transaction': 'Transaction',
  'detail.price': 'Price',
  'detail.area': 'Area',
  'edit.title': 'Edit property',
  'edit.save': 'Save changes',
  'edit.loading': 'Loading property…',
  'edit.not_found': 'This property could not be found.',
  'edit.unreadable': 'This property could not be read safely.',
  'edit.unsupported': 'Safe editing is not supported in this browser. You can still view the property.',
  'edit.type_incompatible': 'The property type cannot be changed while its existing type details are present.',
  'edit.area_invalid': 'Choose an area from the approved Kuwait area list.',
  'edit.save_failed': 'Changes were not saved. Your original property and edit draft are preserved.',
  'edit.recovery_conflict': 'This update cannot continue because the saved property or recovery evidence changed. Nothing was overwritten.',
  'edit.recovery_retry': 'A previous update is awaiting your explicit retry. Your edit draft is preserved.',
  'edit.recovery_cleanup': 'The update is confirmed, but cleanup is still pending. Retry cleanup without updating again.',
  'edit.recovery_pending': 'Another property update is unresolved. Finish its recovery before starting a new edit.',
  'edit.recovery_update_failed': 'The update attempt failed. Your draft and recovery evidence are preserved; retry explicitly.',
  'edit.retry_update': 'Retry property update',
  'edit.retry_cleanup': 'Finish update cleanup',
  'edit.transaction_scope': 'Changing a Sale to Rent is unavailable because rental period is outside this basic edit. No changes were made.',
  'edit.draft_unreadable': 'The existing edit draft could not be read and was preserved. Editing is blocked.',
  'edit.draft_conflict': 'A draft for this property was based on a different saved version and was preserved.',
  'edit.leave_title': 'Leave property editing?',
  'edit.leave_message': 'Keep editing, keep this draft and exit, or permanently discard this edit draft.',
  'edit.keep_exit': 'Keep draft and exit',
  'edit.discard': 'Discard edit draft',
  'capture.cancel': 'Cancel',
  'capture.next': 'Next',
  'capture.back': 'Back',
  'capture.finish': 'Finish',
  'capture.keep_editing': 'Keep editing',
  'capture.keep_draft_exit': 'Keep draft and exit',
  'capture.discard': 'Discard draft',
  'capture.discard_title': 'Leave property capture?',
  'capture.discard_message': 'You can keep this draft for later or permanently discard the entered values.',
  'transaction.title': 'What type of transaction?',
  'transaction.sale': 'Sale',
  'transaction.rent': 'Rent',
  'propertyType.title': 'What type of property?',
  'propertyType.apartment': 'Apartment',
  'propertyType.villa': 'Villa',
  'propertyType.house': 'House',
  'propertyType.floor': 'Floor',
  'propertyType.commercial_complex': 'Commercial Complex',
  'propertyType.whole_building': 'Whole Building',
  'propertyType.office': 'Office',
  'propertyType.shop': 'Shop',
  'propertyType.warehouse': 'Warehouse',
  'propertyType.chalet': 'Chalet',
  'propertyType.other_built_property': 'Other',
  'price.sale.title': 'What is the asking price?',
  'price.rent.title': 'What is the rental price?',
  'price.amount': 'Amount (KWD)',
  'location.title': 'Where is this located?',
  'location.areaId': 'Select Area',
  'location.pickerTitle': 'Choose Area',
  'location.search': 'Search for an area...',
  'location.empty': 'No matching area found',
  'location.datasetUnavailable': 'The approved Kuwait area list has not been supplied yet.',
  'summary.title': 'Review Property',
  'summary.submit': 'Save Property',
  'summary.retry_save': 'Retry property save',
  'summary.retry_cleanup': 'Finish draft cleanup',
  'summary.success': 'Property saved successfully!',
  'summary.success_detail': 'The property is now available in your local property list.',
  'summary.back_home': 'Back to properties',
  'summary.draft_cleared': 'Draft cleared.',
  'errors.required': 'This field is required.',
  'errors.invalid_price': 'Please enter a valid price.',
  'errors.validation_title': 'Check property details',
  'errors.capture_incomplete': 'Complete the four required property details before saving.',
  'errors.storage_title': 'Property not saved',
  'errors.storage_save': 'The local save failed. Your draft is still available; please try again.',
  'errors.cleanup_title': 'Property saved',
  'errors.cleanup_after_save': 'The property was saved, but a fresh draft could not be prepared. Finish draft cleanup without saving the property again.',
  'errors.recovery_retry_title': 'Save not confirmed',
  'errors.recovery_retry': 'The previous save could not be confirmed. Your draft is preserved. Review it and retry explicitly; the app will not save it automatically.',
  'errors.recovery_conflict_title': 'Recovery needs attention',
  'errors.recovery_conflict': 'The saved property or draft changed after the pending save began. All data has been preserved, and no uncertain overwrite or cleanup was performed.',
  'errors.recovery_pending': 'A previous save is still unresolved. Finish its recovery before changing or discarding this draft.',
  'errors.recovery_unreadable_title': 'Recovery data unreadable',
  'errors.recovery_unreadable': 'The pending save record could not be read or validated. Your property and draft were preserved, and saving is blocked to prevent an uncertain overwrite.',
  'errors.draft_read_title': 'Draft recovery needed',
  'errors.draft_read': 'The existing draft could not be read and has not been replaced. Discard it only if you intend to permanently remove its stored values.',
  'errors.draft_reset': 'The draft could not be reset. No navigation occurred.',
};

const ar: Translations = {
  'home.title': 'العقارات',
  'home.search': 'البحث عن عقارات...',
  'home.empty': 'لم يتم تسجيل أي عقارات بعد.',
  'home.new': 'تسجيل عقار',
  'detail.title': 'تفاصيل العقار',
  'detail.edit': 'تعديل',
  'detail.type': 'نوع العقار',
  'detail.transaction': 'المعاملة',
  'detail.price': 'السعر',
  'detail.area': 'المنطقة',
  'edit.title': 'تعديل العقار',
  'edit.save': 'حفظ التغييرات',
  'edit.loading': 'جارٍ تحميل العقار…',
  'edit.not_found': 'تعذر العثور على هذا العقار.',
  'edit.unreadable': 'تعذرت قراءة هذا العقار بأمان.',
  'edit.unsupported': 'التعديل الآمن غير مدعوم في هذا المتصفح. لا يزال بإمكانك عرض العقار.',
  'edit.type_incompatible': 'لا يمكن تغيير نوع العقار مع وجود تفاصيل النوع الحالية.',
  'edit.area_invalid': 'اختر منطقة من قائمة مناطق الكويت المعتمدة.',
  'edit.save_failed': 'لم تُحفظ التغييرات. تم الاحتفاظ بالعقار الأصلي ومسودة التعديل.',
  'edit.recovery_conflict': 'لا يمكن متابعة التحديث لأن العقار المحفوظ أو دليل الاسترداد قد تغيّر. لم يتم استبدال أي بيانات.',
  'edit.recovery_retry': 'هناك تحديث سابق بانتظار إعادة محاولة صريحة. تم الاحتفاظ بمسودة التعديل.',
  'edit.recovery_cleanup': 'تم تأكيد التحديث لكن التنظيف لا يزال معلقاً. أعد التنظيف من دون تحديث مرة أخرى.',
  'edit.recovery_pending': 'هناك تحديث عقار آخر غير محسوم. أكمل استرداده قبل بدء تعديل جديد.',
  'edit.recovery_update_failed': 'فشلت محاولة التحديث. تم الاحتفاظ بالمسودة ودليل الاسترداد؛ أعد المحاولة صراحةً.',
  'edit.retry_update': 'إعادة محاولة تحديث العقار',
  'edit.retry_cleanup': 'إكمال تنظيف التحديث',
  'edit.transaction_scope': 'لا يمكن تغيير البيع إلى إيجار لأن مدة الإيجار خارج هذا التعديل الأساسي. لم يتم إجراء أي تغيير.',
  'edit.draft_unreadable': 'تعذرت قراءة مسودة التعديل الحالية وتم الاحتفاظ بها. تم منع التعديل.',
  'edit.draft_conflict': 'تستند مسودة هذا العقار إلى نسخة محفوظة مختلفة وتم الاحتفاظ بها.',
  'edit.leave_title': 'مغادرة تعديل العقار؟',
  'edit.leave_message': 'تابع التعديل أو احتفظ بالمسودة واخرج أو احذف مسودة التعديل نهائياً.',
  'edit.keep_exit': 'حفظ المسودة والخروج',
  'edit.discard': 'حذف مسودة التعديل',
  'capture.cancel': 'إلغاء',
  'capture.next': 'التالي',
  'capture.back': 'رجوع',
  'capture.finish': 'إنهاء',
  'capture.keep_editing': 'متابعة التعديل',
  'capture.keep_draft_exit': 'حفظ المسودة والخروج',
  'capture.discard': 'حذف المسودة',
  'capture.discard_title': 'مغادرة تسجيل العقار؟',
  'capture.discard_message': 'يمكنك الاحتفاظ بهذه المسودة لوقت لاحق أو حذف القيم المدخلة نهائياً.',
  'transaction.title': 'ما هو نوع المعاملة؟',
  'transaction.sale': 'بيع',
  'transaction.rent': 'إيجار',
  'propertyType.title': 'ما هو نوع العقار؟',
  'propertyType.apartment': 'شقة',
  'propertyType.villa': 'فيلا',
  'propertyType.house': 'بيت',
  'propertyType.floor': 'دور',
  'propertyType.commercial_complex': 'مجمع تجاري',
  'propertyType.whole_building': 'عمارة كاملة',
  'propertyType.office': 'مكتب',
  'propertyType.shop': 'محل',
  'propertyType.warehouse': 'مستودع',
  'propertyType.chalet': 'شاليه',
  'propertyType.other_built_property': 'أخرى',
  'price.sale.title': 'ما هو سعر البيع؟',
  'price.rent.title': 'ما هو سعر الإيجار؟',
  'price.amount': 'المبلغ (دينار كويتي)',
  'location.title': 'أين يقع؟',
  'location.areaId': 'اختر المنطقة',
  'location.pickerTitle': 'اختر المنطقة',
  'location.search': 'ابحث عن منطقة...',
  'location.empty': 'لا توجد منطقة مطابقة',
  'location.datasetUnavailable': 'لم يتم تزويد قائمة مناطق الكويت المعتمدة بعد.',
  'summary.title': 'مراجعة العقار',
  'summary.submit': 'حفظ العقار',
  'summary.retry_save': 'إعادة محاولة حفظ العقار',
  'summary.retry_cleanup': 'إكمال تنظيف المسودة',
  'summary.success': 'تم حفظ العقار بنجاح!',
  'summary.success_detail': 'أصبح العقار متاحاً الآن في قائمة العقارات المحلية.',
  'summary.back_home': 'العودة إلى العقارات',
  'summary.draft_cleared': 'تم مسح المسودة.',
  'errors.required': 'هذا الحقل مطلوب.',
  'errors.invalid_price': 'الرجاء إدخال سعر صحيح.',
  'errors.validation_title': 'تحقق من بيانات العقار',
  'errors.capture_incomplete': 'أكمل بيانات العقار الأربعة المطلوبة قبل الحفظ.',
  'errors.storage_title': 'لم يتم حفظ العقار',
  'errors.storage_save': 'تعذر الحفظ محلياً. لا تزال المسودة محفوظة؛ يرجى المحاولة مرة أخرى.',
  'errors.cleanup_title': 'تم حفظ العقار',
  'errors.cleanup_after_save': 'تم حفظ العقار، لكن تعذر تجهيز مسودة جديدة. أكمل تنظيف المسودة من دون حفظ العقار مرة أخرى.',
  'errors.recovery_retry_title': 'لم يتم تأكيد الحفظ',
  'errors.recovery_retry': 'تعذر تأكيد عملية الحفظ السابقة. تم الاحتفاظ بالمسودة. راجعها ثم أعد المحاولة صراحةً؛ لن يحفظها التطبيق تلقائياً.',
  'errors.recovery_conflict_title': 'يلزم الانتباه إلى الاسترجاع',
  'errors.recovery_conflict': 'تغيّر العقار المحفوظ أو محتوى المسودة بعد بدء عملية الحفظ المعلقة. تم الاحتفاظ بجميع البيانات ولم يحدث استبدال أو تنظيف غير مؤكد.',
  'errors.recovery_pending': 'لا تزال عملية حفظ سابقة غير محسومة. أكمل استرجاعها قبل تعديل هذه المسودة أو حذفها.',
  'errors.recovery_unreadable_title': 'بيانات الاسترجاع غير مقروءة',
  'errors.recovery_unreadable': 'تعذرت قراءة سجل الحفظ المعلق أو التحقق منه. تم الاحتفاظ بالعقار والمسودة، وتم منع الحفظ لتجنب استبدال غير مؤكد.',
  'errors.draft_read_title': 'يلزم استرداد المسودة',
  'errors.draft_read': 'تعذرت قراءة المسودة الحالية ولم يتم استبدالها. احذفها فقط إذا كنت تقصد إزالة قيمها المخزنة نهائياً.',
  'errors.draft_reset': 'تعذر إعادة ضبط المسودة. لم تتم المغادرة.',
};

export const translations = { en, ar };

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof Translations) => string;
  isRTL: boolean;
  fonts: {
    regular: string;
    medium: string;
    semiBold: string;
    bold: string;
  };
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const deviceLanguage = getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
  const [language, setLanguageState] = useState<Language>(deviceLanguage);

  useEffect(() => {
    AsyncStorage.getItem('@viewstate_language').then(lang => {
      if (lang === 'ar' || lang === 'en') {
        setLanguageState(lang);
      }
    });
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem('@viewstate_language', lang).catch(console.error);
  }, []);

  const t = (key: keyof Translations): string => {
    const dict = translations[language];
    return (dict[key] || translations.en[key] || key) as string;
  };

  const isRTL = language === 'ar';

  const fonts = useMemo(() => ({
    regular: language === 'ar' ? 'Tajawal_400Regular' : 'Inter_400Regular',
    medium: language === 'ar' ? 'Tajawal_500Medium' : 'Inter_500Medium',
    semiBold: language === 'ar' ? 'Tajawal_700Bold' : 'Inter_600SemiBold', // Tajawal doesn't have 600, using 700 as fallback
    bold: language === 'ar' ? 'Tajawal_700Bold' : 'Inter_700Bold',
  }), [language]);

  const value = useMemo(() => ({ language, setLanguage, t, isRTL, fonts }), [language, isRTL, fonts]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
