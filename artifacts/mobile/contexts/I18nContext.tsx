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
  'capture.cancel': 'Cancel',
  'capture.next': 'Next',
  'capture.back': 'Back',
  'capture.finish': 'Finish',
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
  'summary.success': 'Property saved successfully!',
  'summary.success_detail': 'The property is now available in your local property list.',
  'summary.back_home': 'Back to properties',
  'summary.draft_cleared': 'Draft cleared.',
  'errors.required': 'This field is required.',
  'errors.invalid_price': 'Please enter a valid price.',
};

const ar: Translations = {
  'home.title': 'العقارات',
  'home.search': 'البحث عن عقارات...',
  'home.empty': 'لم يتم تسجيل أي عقارات بعد.',
  'home.new': 'تسجيل عقار',
  'capture.cancel': 'إلغاء',
  'capture.next': 'التالي',
  'capture.back': 'رجوع',
  'capture.finish': 'إنهاء',
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
  'summary.success': 'تم حفظ العقار بنجاح!',
  'summary.success_detail': 'أصبح العقار متاحاً الآن في قائمة العقارات المحلية.',
  'summary.back_home': 'العودة إلى العقارات',
  'summary.draft_cleared': 'تم مسح المسودة.',
  'errors.required': 'هذا الحقل مطلوب.',
  'errors.invalid_price': 'الرجاء إدخال سعر صحيح.',
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
