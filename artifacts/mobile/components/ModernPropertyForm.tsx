import { Text, TextInput, View, StyleSheet } from 'react-native';
import type { PropertyType, PropertyCaptureCategoryId, PropertyDemoCaptureMetadata, PropertyDetailField } from '@workspace/property-domain';
import type { DemoCategoryDefinition } from '@/services/propertyDemoCatalog';
import { parseDemoNumericInput } from '@/services/propertyDemoCatalog';
import { ModernPropertyFields } from '@/components/ModernPropertyFields';
import type { EnrichmentFieldValues } from '@/components/PropertyEnrichmentFields';
import { isDemoFeatureSuppressed, isMappedTemplateField } from '@/services/propertyFactProjection';
import { ChoiceChip } from '@/components/ChoiceChip';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { FLOOR_NUMBER_QUICK_PICK_VALUES } from '@/services/numericQuickPick';
import { NearbyServicesSelector } from '@/components/NearbyServicesSelector';
import { CommercialComplexSaleFields } from '@/components/CommercialComplexSaleFields';
import { isCommercialFloorSale } from '@/services/commercialFloorSale';

export interface ModernPropertyFormProps {
  transaction?: 'sale' | 'rent';
  salePrice?: number;
  recordScopeKey: string;
  propertyType: PropertyType;
  values: EnrichmentFieldValues;
  onChange: (field: PropertyDetailField | 'clarification', value: string) => void;
  category?: DemoCategoryDefinition;
  metadata?: PropertyDemoCaptureMetadata;
  nearby: readonly string[];
  language: 'en' | 'ar';
  colors: { foreground: string; border: string; card?: string; primary?: string; destructive?: string; mutedForeground?: string };
  fonts: { regular: string; semiBold: string };
  onDemoChange?: (changes: Partial<PropertyDemoCaptureMetadata>) => void;
  onNearbyChange?: (nearby: readonly string[]) => void;
  onInvalidQuickPickChange?: (field: PropertyDetailField, scopeKey: string, invalid: boolean) => void;
  requireExactValue?: boolean;
  hideFloorUse?: boolean;
  hideApartmentSubtype?: boolean;
  hidePropertyUse?: boolean;
}

export function ModernPropertyForm({ transaction, salePrice, recordScopeKey, propertyType, values, onChange, category, metadata, nearby, language, colors, fonts, onDemoChange, onNearbyChange, onInvalidQuickPickChange, requireExactValue = false, hideFloorUse = false, hidePropertyUse = false, hideApartmentSubtype = false }: ModernPropertyFormProps) {
  const nearbySection = onNearbyChange ? <NearbyServicesSelector values={nearby} onChange={onNearbyChange} language={language} color={colors.foreground} fontFamily={fonts.semiBold} /> : null;
  if (propertyType === 'commercial_complex' && transaction === 'sale') return <View><CommercialComplexSaleFields recordScopeKey={recordScopeKey} values={values} onChange={onChange} salePrice={salePrice} onInvalidQuickPickChange={onInvalidQuickPickChange} />{nearbySection}</View>;
  if (isCommercialFloorSale(propertyType, values.floorUse, transaction)) return <View><CommercialComplexSaleFields profile="floor" recordScopeKey={recordScopeKey} values={values} onChange={onChange} salePrice={salePrice} onInvalidQuickPickChange={onInvalidQuickPickChange} />{nearbySection}</View>;
  return (
    <View>
      <ModernPropertyFields
        recordScopeKey={recordScopeKey}
        propertyType={propertyType as PropertyType}
        values={values}
        onChange={(field, value) => onChange(field, value)}
        onInvalidQuickPickChange={onInvalidQuickPickChange}
        requireExactValue={requireExactValue}
        hideFloorUse={hideFloorUse}
        hideApartmentSubtype={hideApartmentSubtype}
        hidePropertyUse={hidePropertyUse}
        amenityRenderExtra={
          category && onDemoChange ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              {category.features.length > 0 && (
                <View style={styles.chips}>
                  {category.features.filter(feature => !isDemoFeatureSuppressed(feature.id, propertyType, values as Record<string, unknown>, (values as Record<string, string>).floorUse)).map(feature => <ChoiceChip key={feature.id} label={feature.label[language === 'ar' ? 1 : 0]} selected={metadata?.selectedFeatures?.includes(feature.id) ?? false} onPress={() => onDemoChange({ selectedFeatures: metadata?.selectedFeatures?.includes(feature.id) ? metadata.selectedFeatures.filter(id => id !== feature.id) : [...(metadata?.selectedFeatures ?? []), feature.id] })} />)}
                </View>
              )}

            </View>
          ) : null
        }
      />
      {nearbySection}
      {propertyType === 'other_built_property' ? (
        <View>
          <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{language === 'ar' ? 'توضيح نوع العقار' : 'Property clarification'}</Text>
          <TextInput value={(values as Record<string, string>).clarification ?? ''} onChangeText={value => onChange('clarification', value)} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} testID="property-edit-clarification" />
        </View>
      ) : null}
      {category && onDemoChange ? <View style={styles.demo}>
        {category.numericFields.filter(item => !isMappedTemplateField(item.id)).map(item => {
          const current = metadata?.numericValues?.[item.id];
          if (item.kind === 'decimal') {
            return <View key={item.id}><Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{item.label[language === 'ar' ? 1 : 0]}</Text><TextInput value={current === undefined ? '' : String(current)} onChangeText={(value: string) => {
              const parsed = value.trim() === '' ? undefined : parseDemoNumericInput(value, true);
              const invalid = value.trim() !== '' && parsed === null;
              onInvalidQuickPickChange?.(item.id as PropertyDetailField, recordScopeKey, invalid);
              if (parsed === undefined || parsed !== null) {
                const numericValues = { ...(metadata?.numericValues ?? {}) };
                if (parsed === undefined) delete numericValues[item.id]; else numericValues[item.id] = parsed;
                onDemoChange({ numericValues });
              }
            }} keyboardType="decimal-pad" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /></View>;
          }
          return <NumericQuickPick key={item.id} scopeKey={`${recordScopeKey}:demo:${item.id}`} label={item.label[language === 'ar' ? 1 : 0]} value={current === undefined ? '' : String(current)} quickPickValues={item.id === 'floorNumber' ? FLOOR_NUMBER_QUICK_PICK_VALUES : undefined} requireExactValue onChangeText={value => {
            const numericValues = { ...(metadata?.numericValues ?? {}) };
            if (value.trim() === '') delete numericValues[item.id]; else numericValues[item.id] = Number(value);
            onDemoChange({ numericValues });
          }} onPendingValidityChange={(_scope, invalid) => onInvalidQuickPickChange?.(item.id as PropertyDetailField, recordScopeKey, invalid)} testID={`demo-${item.id}-quick-pick`} />;
        })}
        {category.choices.filter(choice => !isMappedTemplateField(choice.id)).map(choice => <View key={choice.id}><Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{choice.label[language === 'ar' ? 1 : 0]}</Text><View style={styles.chips}>{choice.options.map(option => <ChoiceChip key={option.id} label={option.label[language === 'ar' ? 1 : 0]} selected={metadata?.choices?.[choice.id] === option.id} role="radio" onPress={() => onDemoChange({ choices: { ...(metadata?.choices ?? {}), [choice.id]: option.id } })} />)}</View></View>)}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({ demo: { gap: 10, marginTop: 12 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
