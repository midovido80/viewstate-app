import { APARTMENT_SUBTYPES, FURNISHING_VALUES, PROPERTY_DETAIL_FIELD_DEFINITIONS, PropertyDetailField, PropertyType } from '@workspace/property-domain';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

export type EnrichmentFieldValues = Partial<Record<PropertyDetailField, string>>;

export const propertyDetailLabels: Record<PropertyDetailField, [string, string]> = {
  plotAreaSquareMeters: ['Plot area (m²)', 'مساحة الأرض (م²)'],
  builtUpAreaSquareMeters: ['Built-up area (m²)', 'مساحة البناء (م²)'],
  bathroomCount: ['Bathrooms', 'الحمامات'],
  parkingSpaceCount: ['Parking spaces', 'مواقف السيارات'],
  floorCount: ['Floors', 'عدد الأدوار'],
  unitCount: ['Units', 'عدد الوحدات'],
  apartmentCount: ['Apartments', 'عدد الشقق'],
  shopCount: ['Shops', 'عدد المحلات'],
  officeCount: ['Offices', 'عدد المكاتب'],
  elevatorCount: ['Elevators', 'عدد المصاعد'],
  apartmentSubtype: ['Apartment subtype', 'نوع الشقة'],
  bedroomCount: ['Bedrooms', 'غرف النوم'],
  livingRoomCount: ['Living rooms', 'غرف المعيشة'],
  floorNumber: ['Floor number', 'رقم الدور'],
  floorUse: ['Floor use', 'استخدام الدور'],
  furnishing: ['Furnishing', 'التأثيث'],
  hasMaidRoom: ['Maid room', 'غرفة خادمة'],
  hasPool: ['Pool', 'مسبح'],
  hasWaterfront: ['Waterfront', 'واجهة بحرية'],
  intendedUse: ['Intended use', 'الاستخدام المقصود'],
  commercialActivity: ['Commercial activity', 'النشاط التجاري'],
  frontageWidthMeters: ['Frontage width (m)', 'عرض الواجهة (م)'],
  ceilingHeightMeters: ['Ceiling height (m)', 'ارتفاع السقف (م)'],
  loadingBayCount: ['Loading bays', 'مناطق التحميل'],
  hasColdStorage: ['Cold storage', 'تخزين مبرد'],
  clarification: ['Clarification (required with details)', 'التوضيح (مطلوب عند إضافة تفاصيل)'],
};

export function formatPropertyDetailValue(field: PropertyDetailField, value: unknown, language: 'en' | 'ar'): string {
  if (typeof value === 'object' && value && 'value' in value) {
    return String((value as { value: unknown }).value);
  }
  if (typeof value === 'boolean') {
    return value ? (language === 'ar' ? 'نعم' : 'Yes') : (language === 'ar' ? 'لا' : 'No');
  }
  if (field === 'furnishing') {
    const localized = language === 'ar'
      ? { unfurnished: 'غير مؤثث', semi_furnished: 'نصف مؤثث', furnished: 'مؤثث' }
      : { unfurnished: 'Unfurnished', semi_furnished: 'Semi-furnished', furnished: 'Furnished' };
    return localized[value as keyof typeof localized] ?? String(value);
  }
  if (field === 'floorUse') {
    return value === 'residential'
      ? (language === 'ar' ? 'سكني' : 'Residential')
      : value === 'commercial' ? (language === 'ar' ? 'تجاري' : 'Commercial') : String(value);
  }
  return String(value);
}

const booleanFields = new Set<PropertyDetailField>(['hasMaidRoom', 'hasPool', 'hasWaterfront', 'hasColdStorage']);
const literalFields = new Set<PropertyDetailField>(['intendedUse', 'commercialActivity', 'clarification']);

export function PropertyEnrichmentFields({
  propertyType,
  values,
  onChange,
}: {
  propertyType: PropertyType;
  values: EnrichmentFieldValues;
  onChange: (field: PropertyDetailField, value: string) => void;
}) {
  const colors = useColors();
  const { language, isRTL, fonts, t } = useI18n();
  const floorUse = values.floorUse;
  const definitions = PROPERTY_DETAIL_FIELD_DEFINITIONS.filter(definition =>
    definition.appliesTo.includes(propertyType)
    && definition.field !== 'floorUse'
    && (!definition.floorUses || propertyType !== 'floor' || !!floorUse && definition.floorUses.includes(floorUse as 'residential' | 'commercial'))
  );
  const ordered = propertyType === 'floor'
    ? [PROPERTY_DETAIL_FIELD_DEFINITIONS.find(item => item.field === 'floorUse')!, ...definitions]
    : definitions;

  return (
    <View style={styles.wrap}>
      {ordered.map(definition => definition.field === 'floorUse' ? (
        <View key={definition.field}>
          <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t('enrich.floor_use')}</Text>
          <View style={[styles.choices, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {(['residential', 'commercial'] as const).map(value => (
              <TouchableOpacity
                key={value}
                onPress={() => onChange('floorUse', value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: floorUse === value }}
                testID={`enrich-floor-use-${value}`}
                style={[styles.choice, { borderColor: floorUse === value ? colors.primary : colors.border, backgroundColor: colors.card }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{t(`enrich.${value}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
       ) : definition.field === 'apartmentSubtype' ? (
        <View key={definition.field}>
          <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
             {propertyDetailLabels.apartmentSubtype[language === 'ar' ? 1 : 0]}
          </Text>
          <View style={styles.wrap}>
            {APARTMENT_SUBTYPES.map(value => (
              <TouchableOpacity
                key={value}
                onPress={() => onChange('apartmentSubtype', value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: values.apartmentSubtype === value }}
                testID={`enrich-apartment-subtype-${value}`}
                style={[styles.choice, { borderColor: values.apartmentSubtype === value ? colors.primary : colors.border, backgroundColor: colors.card }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>
                  {language === 'ar'
                    ? ({ studio: 'استوديو', standard_apartment: 'شقة عادية', duplex: 'دوبلكس' } as const)[value]
                    : ({ studio: 'Studio', standard_apartment: 'Standard apartment', duplex: 'Duplex' } as const)[value]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
       ) : definition.field === 'furnishing' || booleanFields.has(definition.field) ? (
        <View key={definition.field}>
          <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
            {propertyDetailLabels[definition.field][language === 'ar' ? 1 : 0]}
          </Text>
          <View style={[styles.choices, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {(definition.field === 'furnishing' ? FURNISHING_VALUES : ['true', 'false'] as const).map(value => (
              <TouchableOpacity
                key={value}
                onPress={() => onChange(definition.field, value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: values[definition.field] === value }}
                testID={`enrich-${definition.field}-${value}`}
                style={[styles.choice, { borderColor: values[definition.field] === value ? colors.primary : colors.border, backgroundColor: colors.card }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>
                  {definition.field === 'furnishing'
                    ? t(`enrich.furnishing.${value}`)
                    : value === 'true' ? t('enrich.yes') : t('enrich.no')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
       ) : (
        <View key={definition.field}>
          <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
             {propertyDetailLabels[definition.field][language === 'ar' ? 1 : 0]}
          </Text>
          <TextInput
            value={values[definition.field] ?? ''}
            onChangeText={value => onChange(definition.field, value)}
             keyboardType={literalFields.has(definition.field) ? 'default' : 'decimal-pad'}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
            testID={`enrich-field-${definition.field}`}
             accessibilityLabel={propertyDetailLabels[definition.field][language === 'ar' ? 1 : 0]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  label: { fontSize: 14, marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  choices: { gap: 8 },
  choice: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});