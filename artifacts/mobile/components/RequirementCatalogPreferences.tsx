import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { APARTMENT_SUBTYPES, FURNISHING_VALUES, type CatalogPreference, type FloorUse, type PropertyDetailField, type PropertyType } from '@workspace/property-domain';
import { NumericQuickPick } from '@/components/NumericQuickPick';
import { ChoiceChip } from '@/components/ChoiceChip';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { getRequirementCatalogFields } from '@/services/requirementFieldMap';

const INTENDED_USE_VALUES = ['office', 'retail', 'warehouse', 'residential'] as const;
const COMMERCIAL_ACTIVITY_VALUES = ['retail', 'office', 'restaurant', 'clinic', 'warehouse'] as const;

type Props = {
  scopeKey: string;
  propertyType: PropertyType;
  floorUse?: FloorUse;
  values: readonly CatalogPreference[];
  onChange: (values: readonly CatalogPreference[]) => void;
  onInvalidChange?: (field: PropertyDetailField, invalid: boolean) => void;
  fields?: readonly PropertyDetailField[];
  inlineFeatures?: boolean;
};

export function RequirementCatalogPreferences({ scopeKey, propertyType, floorUse, values, onChange, onInvalidChange, fields, inlineFeatures = false }: Props) {
  const colors = useColors();
  const { language, isRTL, fonts, t } = useI18n();
  const applicableDefinitions = getRequirementCatalogFields(propertyType, floorUse);
  const definitions = fields ? fields.flatMap(field => applicableDefinitions.filter(definition => definition.field === field)) : applicableDefinitions;
  const byField = new Map(values.map(value => [value.field, value]));
  const [modes, setModes] = useState<Record<string, 'exact' | 'minimum' | 'maximum'>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const update = (field: PropertyDetailField, value?: CatalogPreference) => onChange([...values.filter(item => item.field !== field), ...(value ? [value] : [])]);
  const clear = (field: PropertyDetailField) => { update(field); setDrafts(current => { const next = { ...current }; delete next[field]; return next; }); onInvalidChange?.(field, false); };
  const labelFor = (field: PropertyDetailField) => getRequirementCatalogFields(propertyType, floorUse).find(item => item.field === field)?.label[language === 'ar' ? 1 : 0] ?? field;
  const controls = definitions.map(definition => {
    const field = definition.field;
    const current = byField.get(field);
    const label = labelFor(field);
    const isInteger = definition.control === 'count' || definition.control === 'numeric_quick_pick';
    const isBoolean = definition.control === 'boolean' || field.startsWith('has');
    const isChoice = field === 'apartmentSubtype' || field === 'furnishing' || field === 'intendedUse' || field === 'commercialActivity';
    if (isInteger) return <View key={field} style={styles.field}>
      <View style={styles.row}>{(['exact', 'minimum', 'maximum'] as const).map(mode => <TouchableOpacity key={mode} onPress={() => { setModes(currentModes => ({ ...currentModes, [field]: mode })); if (current?.kind === 'number') update(field, { field, kind: 'number', comparison: mode, value: current.value }); }} style={[styles.chip, { borderColor: (current?.kind === 'number' ? current.comparison : modes[field] ?? 'exact') === mode ? colors.primary : colors.border }]}><Text style={{ color: colors.foreground }}>{mode === 'exact' ? '=' : mode === 'minimum' ? '≥' : '≤'}</Text></TouchableOpacity>)}</View>
       <NumericQuickPick scopeKey={`${scopeKey}:catalog:${field}`} label={label} value={current?.kind === 'number' ? String(current.value) : ''} onChangeText={value => { if (!value.trim()) { clear(field); return; } update(field, { field, kind: 'number', comparison: current?.kind === 'number' ? current.comparison : modes[field] ?? 'exact', value: Number(value) }); }} onPendingValidityChange={(_, invalid) => onInvalidChange?.(field, invalid)} testID={`requirement-preference-${field}`} />
      <TouchableOpacity onPress={() => clear(field)} accessibilityRole="button" accessibilityLabel={language === 'ar' ? `مسح ${label}` : `Clear ${label}`} style={styles.clear}><Text style={{ color: colors.mutedForeground }}>{language === 'ar' ? 'مسح' : 'Clear'}</Text></TouchableOpacity>
    </View>;
    if (isBoolean) {
      const selected = current?.kind === 'feature';
      const forbidden = selected && !current.value;
      return <ChoiceChip key={field} label={`${selected ? '✓ ' : ''}${label}${forbidden ? (language === 'ar' ? ' · يجب ألا تتوفر' : ' · Must not have') : ''}`} selected={selected} onPress={() => {
        if (!selected) update(field, { field, kind: 'feature', value: true });
        else clear(field);
      }} testID={`requirement-preference-${field}`} role="checkbox" />;
    }
    if (isChoice) {
      const options = field === 'apartmentSubtype' ? APARTMENT_SUBTYPES : field === 'furnishing' ? FURNISHING_VALUES : field === 'intendedUse' ? INTENDED_USE_VALUES : COMMERCIAL_ACTIVITY_VALUES;
      return <View key={field} style={styles.field}><Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{label}</Text><View style={styles.row}>{options.map(option => <TouchableOpacity key={option} onPress={() => current?.kind === 'choice' && current.value === option ? clear(field) : update(field, { field, kind: 'choice', value: option })} style={[styles.chip, { borderColor: current?.kind === 'choice' && current.value === option ? colors.primary : colors.border, backgroundColor: current?.kind === 'choice' && current.value === option ? colors.primary : colors.card }]}><Text style={{ color: current?.kind === 'choice' && current.value === option ? colors.primaryForeground : colors.foreground }}>{field === 'furnishing' ? t(`enrich.furnishing.${option}` as any) : field === 'apartmentSubtype' ? t(`enrich.apartment_subtype.${option}` as any) : field === 'intendedUse' ? (language === 'ar' ? ({ office: 'مكتب', retail: 'تجزئة', warehouse: 'مستودع', residential: 'سكني' } as Record<string, string>)[option] : option) : (language === 'ar' ? ({ retail: 'تجزئة', office: 'مكتب', restaurant: 'مطعم', clinic: 'عيادة', warehouse: 'مستودع' } as Record<string, string>)[option] : option)}</Text></TouchableOpacity>)}</View></View>;
    }
    const isDecimal = definition.control === 'decimal';
    // Free-text catalog values have no stable Requirement contract. They are
    // intentionally omitted rather than allowing an invalid payload.
    if (!isDecimal && !isChoice) return null;
    const textValue = current?.kind === 'number' ? String(current.value) : current?.kind === 'choice' ? current.value : '';
    return <View key={field} style={styles.field}><Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{label}</Text><View style={styles.row}><TextInput value={drafts[field] ?? textValue} onChangeText={text => { setDrafts(current => ({ ...current, [field]: text })); if (!text.trim()) return clear(field); if (isDecimal) { const value = Number(text); const invalid = !Number.isFinite(value) || value < 0; onInvalidChange?.(field, invalid); if (!invalid) update(field, { field, kind: 'number', comparison: current?.kind === 'number' ? current.comparison : 'exact', value }); } else update(field, { field, kind: 'choice', value: text }); }} keyboardType={isDecimal ? 'decimal-pad' : 'default'} style={[styles.input, { color: colors.foreground, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]} /><TouchableOpacity onPress={() => clear(field)} accessibilityRole="button" accessibilityLabel={language === 'ar' ? `مسح ${label}` : `Clear ${label}`} style={styles.clear}><Text style={{ color: colors.mutedForeground }}>{language === 'ar' ? 'مسح' : 'Clear'}</Text></TouchableOpacity></View></View>;
  });
  // Boolean chips share their parent's flow; numeric/choice fields retain full rows.
  const onlyFeatures = definitions.every(definition => definition.control === 'boolean' || definition.field.startsWith('has'));
  return inlineFeatures && onlyFeatures ? <>{controls}</> : <View style={[styles.wrap, { direction: isRTL ? 'rtl' : 'ltr' }]}>{controls}</View>;
}
const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, field: { width: '100%', gap: 6 }, label: { fontSize: 14 }, clear: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }, chip: { minHeight: 40, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10, justifyContent: 'center' }, input: { flex: 1, minWidth: 120, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 } });