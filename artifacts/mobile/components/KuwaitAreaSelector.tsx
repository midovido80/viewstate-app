import { useScreenInsets } from '@/hooks/useScreenInsets';
import { useMemo, useState, useEffect } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getAreaById,
  getAreasByGovernorate,
  getSelectableKuwaitAreas,
  KUWAIT_GOVERNORATES,
  searchAreasSorted,
} from '@/constants/kuwait-areas';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

interface KuwaitAreaSelectorProps {
  readonly selectedIds: readonly string[];
  readonly onChange: (ids: string[]) => void;
  readonly onCancel?: () => void;
  readonly multiSelect?: boolean;
  readonly testID?: string;
}

export function KuwaitAreaSelector({
  selectedIds,
  onChange,
  onCancel,
  multiSelect = true,
  testID = 'kuwait-area-selector',
}: KuwaitAreaSelectorProps) {
  const colors = useColors();
  const insets = useScreenInsets();
  const { language, isRTL, fonts } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // cancel preservation: manage local state while open
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>([...selectedIds]);

  useEffect(() => {
    if (open) {
      setLocalSelectedIds([...selectedIds]);
      setQuery('');
    }
  }, [open, selectedIds]);

  const [openGovernorates, setOpenGovernorates] = useState<Set<string>>(
    () => new Set(KUWAIT_GOVERNORATES.map(governorate => governorate.id)),
  );

  const selected = useMemo(
    () => selectedIds
      .map(id => getAreaById(id))
      .filter((area): area is NonNullable<typeof area> => area !== undefined),
    [selectedIds],
  );

  const visibleAreas = useMemo(
    () => query.trim()
      ? searchAreasSorted(query, language)
      : getSelectableKuwaitAreas(),
    [language, query],
  );

  const toggleArea = (id: string) => {
    if (!multiSelect) {
      onChange([id]);
      setOpen(false);
      return;
    }

    setLocalSelectedIds(current => {
      if (current.includes(id)) {
        return current.filter(value => value !== id);
      }
      return [...current, id];
    });
  };

  const toggleGovernorate = (id: string) => {
    setOpenGovernorates(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const areasByGovernorate = useMemo(() => {
    const visible = new Set(visibleAreas.map(area => area.id));
    return KUWAIT_GOVERNORATES.map(governorate => ({
      governorate,
      areas: getAreasByGovernorate(governorate.id, language)
        .filter(area => visible.has(area.id)),
    })).filter(group => group.areas.length > 0);
  }, [language, visibleAreas]);

  const governorateTestID = testID === 'capture-area'
    ? (id: string) => `capture-governorate-${id}`
    : (id: string) => `${testID}-governorate-${id}`;
  const areaTestID = testID === 'capture-area'
    ? (id: string) => `capture-area-option-${id}`
    : (id: string) => `${testID}-area-${id}`;

  const placeholder = language === 'ar' ? 'اختر المنطقة' : 'Select area';
  const summary = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? (language === 'ar' ? selected[0].ar : selected[0].en)
      : `${selected.length} ${language === 'ar' ? 'مناطق' : 'areas'}`;

  return (
    <>
      <TouchableOpacity
        testID={`${testID}${testID === 'capture-area' ? '-selector' : ''}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.collapsedField, { borderColor: colors.border, backgroundColor: colors.card }]}
      >
        <Text style={{ color: selected.length > 0 ? colors.foreground : colors.mutedForeground, fontFamily: fonts.semiBold, flex: 1, minWidth: 0, textAlign: isRTL ? 'right' : 'left' }}>
          {summary}
        </Text>
        <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => { onCancel?.(); setOpen(false); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>
                {placeholder}
              </Text>
              <TouchableOpacity testID={`${testID}-cancel`} accessibilityRole="button" onPress={() => { onCancel?.(); setOpen(false); }}>
                <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1, minHeight: 0 }} removeClippedSubviews={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={language === 'ar' ? 'ابحث بالمنطقة أو المحافظة' : 'Search area or governorate'}
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel={language === 'ar' ? 'بحث المناطق' : 'Search areas'}
                testID={`${testID}-search`}
                style={[
                  styles.search,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    textAlign: isRTL ? 'right' : 'left',
                    fontFamily: fonts.regular,
                  },
                ]}
              />

              <View style={styles.groupContainer}>
                {areasByGovernorate.map(({ governorate, areas }) => {
                  const expanded = openGovernorates.has(governorate.id);
                  return (
                    <View key={governorate.id} style={styles.group}>
                      <TouchableOpacity
                        onPress={() => toggleGovernorate(governorate.id)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        testID={governorateTestID(governorate.id)}
                        style={[
                          styles.groupHeader,
                          {
                            backgroundColor: colors.secondary,
                            borderColor: colors.border,
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                          },
                        ]}
                      >
                        <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                          {language === 'ar' ? governorate.ar : governorate.en}
                        </Text>
                        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      {expanded ? (
                        <View style={styles.areaList}>
                          {areas.map(area => {
                            const isSelected = multiSelect ? localSelectedIds.includes(area.id) : selectedIds.includes(area.id);
                            return (
                              <TouchableOpacity
                                key={area.id}
                                onPress={() => toggleArea(area.id)}
                                accessibilityRole={multiSelect ? "checkbox" : "radio"}
                                accessibilityState={{ checked: isSelected }}
                                testID={areaTestID(area.id)}
                                style={[
                                  styles.areaRow,
                                  { flexDirection: isRTL ? 'row-reverse' : 'row' }
                                ]}
                              >
                                <Text style={{
                                  color: isSelected ? colors.primary : colors.foreground,
                                  fontFamily: isSelected ? fonts.semiBold : fonts.regular,
                                  flex: 1,
                                  textAlign: isRTL ? 'right' : 'left',
                                }}>
                                  {language === 'ar' ? area.ar : area.en}
                                </Text>
                                {isSelected && <Feather name="check" size={18} color={colors.primary} />}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {multiSelect && (
              <View style={[styles.modalFooter, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
                <TouchableOpacity
                  onPress={() => {
                    onChange(localSelectedIds);
                    setOpen(false);
                  }}
                  testID={`${testID}-apply`}
                  style={[styles.applyButton, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.background, fontFamily: fonts.semiBold, fontSize: 16 }}>
                    {language === 'ar' ? 'تطبيق' : 'Apply'}
                    {localSelectedIds.length > 0 ? ` (${localSelectedIds.length})` : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  collapsedField: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%' },
  modalHeader: { padding: 16, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 0 },
  modalTitle: { fontSize: 18 },
  scrollContent: { padding: 16, gap: 16 },
  search: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  groupContainer: { gap: 12 },
  group: { gap: 4 },
  groupHeader: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center' },
  areaList: { paddingHorizontal: 4 },
  areaRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  applyButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
