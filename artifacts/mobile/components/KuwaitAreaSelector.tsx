import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import { ChoiceChip } from '@/components/ChoiceChip';

interface KuwaitAreaSelectorProps {
  readonly selectedIds: readonly string[];
  readonly onChange: (ids: string[]) => void;
  readonly multiSelect?: boolean;
  readonly testID?: string;
}

export function KuwaitAreaSelector({
  selectedIds,
  onChange,
  multiSelect = true,
  testID = 'kuwait-area-selector',
}: KuwaitAreaSelectorProps) {
  const colors = useColors();
  const { language, isRTL, fonts } = useI18n();
  const [query, setQuery] = useState('');
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
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(value => value !== id));
      return;
    }
    onChange(multiSelect ? [...selectedIds, id] : [id]);
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

  return (
    <View style={styles.container} testID={testID}>
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
      {selected.length > 0 ? (
        <View style={styles.selectedWrap} testID={`${testID}-selected`}>
          {selected.map(area => (
            <ChoiceChip
              key={area.id}
              label={`${language === 'ar' ? area.ar : area.en} ×`}
              selected
              onPress={() => toggleArea(area.id)}
              testID={`${testID}-selected-${area.id}`}
              role="button"
            />
          ))}
        </View>
      ) : null}
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
              <View style={styles.areaWrap}>
                {areas.map(area => (
                  <ChoiceChip
                    key={area.id}
                    label={language === 'ar' ? area.ar : area.en}
                    selected={selectedIds.includes(area.id)}
                    onPress={() => toggleArea(area.id)}
                     testID={areaTestID(area.id)}
                    role={multiSelect ? 'checkbox' : 'radio'}
                  />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  search: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  selectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { gap: 6 },
  groupHeader: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center' },
  areaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});