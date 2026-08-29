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
const countFields = new Set<PropertyDetailField>([
  'bedroomCount', 'bathroomCount', 'livingRoomCount', 'parkingSpaceCount',
  'floorCount', 'apartmentCount', 'shopCount', 'officeCount',
  'unitCount', 'elevatorCount', 'floorNumber', 'loadingBayCount'
]);
const choiceFields = new Set<PropertyDetailField>(['apartmentSubtype', 'floorUse', 'furnishing']);
const decimalFields = new Set<PropertyDetailField>(['plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'frontageWidthMeters', 'ceilingHeightMeters']);

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function safeCountInput(value: string): string | null {
  const normalized = normalizeDigits(value);
  if (!/^\d*$/.test(normalized)) return null;
  if (normalized === '') return normalized;
  return Number.isSafeInteger(Number(normalized)) ? normalized : null;
}

function safeDecimalInput(value: string): string | null {
  const normalized = normalizeDigits(value)
    .replace(/[٫,]/g, '.');
  if (normalized === '') return normalized;
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  return Number.isFinite(Number(normalized)) ? normalized : null;
}

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

  function renderFieldContent(definition: typeof PROPERTY_DETAIL_FIELD_DEFINITIONS[number]) {
    const field = definition.field;
    const testIdField = field === 'floorUse' ? 'floor-use' : field === 'apartmentSubtype' ? 'apartment-subtype' : field;

    if (choiceFields.has(field)) {
      const options = field === 'floorUse' ? ['residential', 'commercial']
        : field === 'apartmentSubtype' ? APARTMENT_SUBTYPES
        : FURNISHING_VALUES;

      return (
        <View style={[styles.chipWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {options.map(value => {
            const isSelected = values[field] === value;
            let label = value;
            if (field === 'floorUse') label = t(`enrich.${value}` as any);
            else if (field === 'furnishing') label = t(`enrich.furnishing.${value}` as any);
            else if (field === 'apartmentSubtype') {
              label = language === 'ar'
                ? ({ studio: 'استوديو', standard_apartment: 'شقة عادية', duplex: 'دوبلكس' } as any)[value] || value
                : ({ studio: 'Studio', standard_apartment: 'Standard apartment', duplex: 'Duplex' } as any)[value] || value;
            }

            return (
              <TouchableOpacity
                key={value}
                onPress={() => onChange(field, value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                testID={`enrich-${testIdField}-${value}`}
                style={[
                  styles.chip,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary + '11' : colors.card
                  }
                ]}
              >
                <Text style={[
                  styles.chipText,
                  {
                    color: isSelected ? colors.primary : colors.foreground,
                    fontFamily: isSelected ? fonts.semiBold : fonts.medium
                  }
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (booleanFields.has(field)) {
      return (
        <View style={[styles.chipWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {['true', 'false', ''].map(value => {
            const isSelected = values[field] === value || (value === '' && !values[field]);
            const label = value === 'true' ? t('enrich.yes') : value === 'false' ? t('enrich.no') : (language === 'ar' ? 'مسح' : 'Clear');
            return (
              <TouchableOpacity
                key={value || 'clear'}
                onPress={() => onChange(field, value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                testID={`enrich-${testIdField}-${value || 'clear'}`}
                style={[
                  styles.chip,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary + '11' : colors.card
                  }
                ]}
              >
                <Text style={[
                  styles.chipText,
                  {
                    color: isSelected ? colors.primary : colors.foreground,
                    fontFamily: isSelected ? fonts.semiBold : fonts.medium
                  }
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    if (countFields.has(field)) {
      return (
        <View style={[styles.stepperWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            style={[styles.stepperButton, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => {
              const current = Number.parseInt(values[field] || '0', 10);
              const next = Number.isNaN(current) ? 0 : Math.max(0, current - 1);
              onChange(field, String(next));
            }}
            testID={`enrich-${field}-minus`}
            accessibilityRole="button"
            accessibilityLabel={`${propertyDetailLabels[field][language === 'ar' ? 1 : 0]} −`}
          >
            <Text style={[styles.stepperButtonText, { color: colors.foreground, fontFamily: fonts.medium }]}>-</Text>
          </TouchableOpacity>

          <TextInput
            value={values[field] ?? ''}
            onChangeText={value => {
              const normalized = safeCountInput(value);
              if (normalized !== null) onChange(field, normalized);
            }}
            keyboardType="number-pad"
            style={[styles.stepperInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            testID={`enrich-field-${field}`}
            accessibilityLabel={propertyDetailLabels[field][language === 'ar' ? 1 : 0]}
          />

          <TouchableOpacity
            style={[styles.stepperButton, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => {
              const current = Number.parseInt(values[field] || '0', 10);
              const next = Number.isNaN(current)
                ? 1
                : Number.isSafeInteger(current + 1) ? current + 1 : current;
              onChange(field, String(next));
            }}
            testID={`enrich-${field}-plus`}
            accessibilityRole="button"
            accessibilityLabel={`${propertyDetailLabels[field][language === 'ar' ? 1 : 0]} +`}
          >
            <Text style={[styles.stepperButtonText, { color: colors.foreground, fontFamily: fonts.medium }]}>+</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <TextInput
        value={values[field] ?? ''}
        onChangeText={value => {
          if (!decimalFields.has(field)) {
            onChange(field, value);
            return;
          }
          const normalized = safeDecimalInput(value);
          if (normalized !== null) onChange(field, normalized);
        }}
        keyboardType={decimalFields.has(field) ? 'decimal-pad' : 'default'}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
        testID={`enrich-field-${field}`}
        accessibilityLabel={propertyDetailLabels[field][language === 'ar' ? 1 : 0]}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      {ordered.map(definition => (
        <View key={definition.field}>
          <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
             {propertyDetailLabels[definition.field][language === 'ar' ? 1 : 0]}
          </Text>
          {renderFieldContent(definition)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  label: { fontSize: 14, marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 19,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chipText: {
    fontSize: 14,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 22,
  },
  stepperInput: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 16,
  }
});
