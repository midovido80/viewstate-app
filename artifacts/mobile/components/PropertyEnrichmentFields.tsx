import { APARTMENT_SUBTYPES, FURNISHING_VALUES, type PropertyDetailField, type PropertyType } from '@workspace/property-domain';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { FLOOR_NUMBER_QUICK_PICK_VALUES, isPropertyNumericQuickPickSurface } from '@/services/numericQuickPick';
import { propertyDetailLabels } from '@/services/propertyDetailPresentation';
import {
  getApplicablePropertyFormFields,
  type PropertyFormFieldDefinition,
} from '@/services/propertyFormCatalog';

export {
  formatPropertyDetailValue,
  propertyDetailDisplayDefinitions,
  propertyDetailLabels,
  RESIDENTIAL_AMENITY_PROPERTY_FIELDS,
} from '@/services/propertyDetailPresentation';

export type EnrichmentFieldValues = Partial<Record<PropertyDetailField, string>>;

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function safeDecimalInput(value: string): string | null {
  const normalized = normalizeDigits(value)
    .replace(/[٫,]/g, '.');
  if (normalized === '') return normalized;
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  return Number.isFinite(Number(normalized)) ? normalized : null;
}

export function PropertyEnrichmentFields({
  recordScopeKey,
  propertyType,
  values,
  onChange,
  onInvalidQuickPickChange,
  amenityRenderExtra,
  requireExactValue = false,
}: {
  recordScopeKey: string;
  propertyType: PropertyType;
  values: EnrichmentFieldValues;
  onChange: (field: PropertyDetailField, value: string) => void;
  onInvalidQuickPickChange?: (field: PropertyDetailField, scopeKey: string, invalid: boolean) => void;
  amenityRenderExtra?: React.ReactNode;
  requireExactValue?: boolean;
}) {
  const colors = useColors();
  const { language, isRTL, fonts, t } = useI18n();
  const floorUse = values.floorUse;
  const applicableDefinitions = getApplicablePropertyFormFields(propertyType, floorUse as 'residential' | 'commercial' | undefined);
  const definitions = applicableDefinitions.filter(definition =>
    definition.field !== 'floorUse'
    && definition.group !== 'amenity'
    && definition.field !== 'plotAreaSquareMeters'
    && definition.field !== 'builtUpAreaSquareMeters'
    && (!definition.floorUses || propertyType !== 'floor' || !!floorUse && definition.floorUses.includes(floorUse as 'residential' | 'commercial'))
  );
  const ordered = propertyType === 'floor'
    ? [getApplicablePropertyFormFields(propertyType).find(item => item.field === 'floorUse')!, ...definitions]
    : propertyType === 'apartment'
      ? [...definitions].sort((left, right) => {
        const order: PropertyDetailField[] = [
          'apartmentSubtype',
          'bedroomCount',
          'bathroomCount',
          'floorNumber',
          'parkingSpaceCount',
          'livingRoomCount',
          'furnishing',
        ];
        return order.indexOf(left.field) - order.indexOf(right.field);
      })
      : definitions;

  function renderFieldContent(definition: PropertyFormFieldDefinition) {
    const field = definition.field;
    const testIdField = field === 'floorUse' ? 'floor-use' : field === 'apartmentSubtype' ? 'apartment-subtype' : field;
    const usesResidentialQuickPick = definition.control === 'numeric_quick_pick'
      && isPropertyNumericQuickPickSurface(propertyType, floorUse);

    if (usesResidentialQuickPick) {
      return (
        <NumericQuickPick
          scopeKey={recordScopeKey}
          label={propertyDetailLabels[field][language === 'ar' ? 1 : 0]}
          value={values[field] ?? ''}
          onChangeText={value => onChange(field, value)}
          onPendingValidityChange={(sourceScopeKey, invalid) =>
            onInvalidQuickPickChange?.(field, sourceScopeKey, invalid)}
          testID={`enrich-${field}-quick-pick`}
          quickPickValues={field === 'floorNumber' ? FLOOR_NUMBER_QUICK_PICK_VALUES : undefined}
          requireExactValue={requireExactValue}
        />
      );
    }

    if (definition.control === 'choice') {
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
              label = t(`enrich.apartment_subtype.${value}` as any);
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

    if (definition.control === 'boolean') {
      return (
        <View style={[styles.chipWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {['true', 'false'].map(value => {
            const isSelected = values[field] === value;
            const label = value === 'true' ? t('enrich.yes') : t('enrich.no');
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

    return (
      <TextInput
        value={values[field] ?? ''}
        onChangeText={value => {
          if (definition.control !== 'decimal') {
            onChange(field, value);
            return;
          }
          const normalized = safeDecimalInput(value);
          if (normalized !== null) onChange(field, normalized);
        }}
        keyboardType={definition.control === 'decimal' ? 'decimal-pad' : 'default'}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
        testID={`enrich-field-${field}`}
        accessibilityLabel={propertyDetailLabels[field][language === 'ar' ? 1 : 0]}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      {ordered.map(definition => {
        const usesResidentialQuickPick = definition.control === 'numeric_quick_pick' && isPropertyNumericQuickPickSurface(propertyType, floorUse);
        return (
          <View key={definition.field}>
            {!usesResidentialQuickPick && (
              <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
                {propertyDetailLabels[definition.field][language === 'ar' ? 1 : 0]}
              </Text>
            )}
            {renderFieldContent(definition)}
          </View>
        );
      })}
      {(applicableDefinitions.some(definition => definition.group === 'amenity') || amenityRenderExtra) && (
        <View>
          <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
            {language === 'ar' ? 'المزايا المتوفرة في العقار' : 'Available property features'}
          </Text>
          <View style={[styles.chipWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {applicableDefinitions.filter(definition => definition.group === 'amenity').map(({ field }) => {
              const value = values[field];
              const isTrue = value === 'true';
              const isFalse = value === 'false';
              const baseLabel = propertyDetailLabels[field][language === 'ar' ? 1 : 0];
              const label = isFalse ? (language === 'ar' ? 'بدون ' + baseLabel : 'No ' + baseLabel.toLowerCase()) : baseLabel;
              return (
                <TouchableOpacity
                  key={field}
                  onPress={() => onChange(field, isTrue ? 'false' : 'true')}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isTrue }}
                  style={[styles.chip, {
                    borderColor: isTrue ? colors.primary : isFalse ? colors.border : colors.border,
                    backgroundColor: isTrue ? colors.primary + '11' : colors.card,
                    paddingLeft: isTrue || isFalse ? 12 : 16,
                    paddingRight: isTrue || isFalse ? 12 : 16,
                  }]}
                >
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                    {isTrue && <Feather name="check" size={14} color={colors.primary} />}
                    {isFalse && <Feather name="x" size={14} color={colors.mutedForeground} />}
                    <Text style={[styles.chipText, { color: isTrue ? colors.primary : isFalse ? colors.mutedForeground : colors.foreground, fontFamily: isTrue ? fonts.semiBold : fonts.medium }]}>{label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {amenityRenderExtra}
        </View>
      )}
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
});
