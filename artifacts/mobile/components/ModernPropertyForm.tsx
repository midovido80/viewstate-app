import { Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import type { PropertyType, PropertyCaptureCategoryId, PropertyDemoCaptureMetadata, PropertyDetailField } from '@workspace/property-domain';
import type { DemoCategoryDefinition } from '@/services/propertyDemoCatalog';
import { DEMO_NEARBY_SERVICES, parseDemoNumericInput } from '@/services/propertyDemoCatalog';
import { ModernPropertyFields } from '@/components/ModernPropertyFields';
import type { EnrichmentFieldValues } from '@/components/PropertyEnrichmentFields';
import { isMappedTemplateField } from '@/services/propertyFactProjection';

export interface ModernPropertyFormProps {
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
}

export function ModernPropertyForm({ recordScopeKey, propertyType, values, onChange, category, metadata, nearby, language, colors, fonts, onDemoChange, onNearbyChange, onInvalidQuickPickChange }: ModernPropertyFormProps) {
  return (
    <View>
      <ModernPropertyFields recordScopeKey={recordScopeKey} propertyType={propertyType as PropertyType} values={values} onChange={(field, value) => onChange(field, value)} onInvalidQuickPickChange={onInvalidQuickPickChange} />
      {propertyType === 'other_built_property' ? (
        <View>
          <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{language === 'ar' ? 'توضيح نوع العقار' : 'Property clarification'}</Text>
          <TextInput value={(values as Record<string, string>).clarification ?? ''} onChangeText={value => onChange('clarification', value)} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} testID="property-edit-clarification" />
        </View>
      ) : null}
      {category && onDemoChange ? <View style={styles.demo}>
        {category.numericFields.filter(item => !isMappedTemplateField(item.id)).map(item => <View key={item.id}><Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{item.label[language === 'ar' ? 1 : 0]}</Text><TextInput value={metadata?.numericValues?.[item.id] === undefined ? '' : String(metadata.numericValues[item.id])} onChangeText={(value: string) => {
          const parsed = value.trim() === '' ? undefined : parseDemoNumericInput(value, item.kind === 'decimal');
          const invalid = value.trim() !== '' && parsed === null;
          onInvalidQuickPickChange?.(item.id as PropertyDetailField, recordScopeKey, invalid);
          if (invalid) {
            const numericValues = { ...(metadata?.numericValues ?? {}) };
            delete numericValues[item.id];
            onDemoChange({ numericValues });
          }
          if (parsed === undefined || parsed !== null) {
            const numericValues = { ...(metadata?.numericValues ?? {}) };
            if (parsed === undefined) delete numericValues[item.id];
            else numericValues[item.id] = parsed;
            onDemoChange({ numericValues });
          }
        }} keyboardType="decimal-pad" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /></View>)}
        {category.choices.filter(choice => !isMappedTemplateField(choice.id)).map(choice => <View key={choice.id}><Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{choice.label[language === 'ar' ? 1 : 0]}</Text><View>{choice.options.map(option => <TouchableOpacity key={option.id} onPress={() => onDemoChange({ choices: { ...(metadata?.choices ?? {}), [choice.id]: option.id } })}><Text style={{ color: colors.foreground }}>{metadata?.choices?.[choice.id] === option.id ? '✓ ' : ''}{option.label[language === 'ar' ? 1 : 0]}</Text></TouchableOpacity>)}</View></View>)}
        <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{language === 'ar' ? 'المزايا' : 'Features'}</Text>
        {category.features.map(feature => <TouchableOpacity key={feature.id} onPress={() => onDemoChange({ selectedFeatures: metadata?.selectedFeatures?.includes(feature.id) ? metadata.selectedFeatures.filter(id => id !== feature.id) : [...(metadata?.selectedFeatures ?? []), feature.id] })}><Text style={{ color: colors.foreground }}>{metadata?.selectedFeatures?.includes(feature.id) ? '✓ ' : ''}{feature.label[language === 'ar' ? 1 : 0]}</Text></TouchableOpacity>)}
        <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'}</Text>
        {DEMO_NEARBY_SERVICES.map(item => <TouchableOpacity key={item.id} onPress={() => onNearbyChange?.(nearby.includes(item.id) ? nearby.filter(id => id !== item.id) : [...nearby, item.id])}><Text style={{ color: colors.foreground }}>{nearby.includes(item.id) ? '✓ ' : ''}{item.label[language === 'ar' ? 1 : 0]}</Text></TouchableOpacity>)}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({ demo: { gap: 10, marginTop: 12 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 } });