import { createContext, useContext, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { CHOICE_GRID_GAP, choiceIcon, choiceTileWidth } from '@/services/choicePresentation';
import type { ChoiceChipProps } from '@/components/ChoiceChip';

const GridWidth = createContext<number | undefined>(undefined);

export function ChoiceCard({ title, icon, selected, onSelect, testID }: { title: string; icon?: keyof typeof Feather.glyphMap; selected?: boolean; onSelect: () => void; testID?: string }) {
  return <ChoiceTile label={title} icon={icon} selected={Boolean(selected)} onPress={onSelect} testID={testID} role="radio" />;
}

/** One measured grid shared by ordinary, conditional and inline catalog choices. */
export function ChoiceGrid({ children, testID, style, columns = 2, gap = CHOICE_GRID_GAP }: { children: ReactNode; testID?: string; style?: StyleProp<ViewStyle>; columns?: 2 | 3; gap?: number }) {
  const { isRTL } = useI18n();
  const [width, setWidth] = useState<number>();
  return <View testID={testID} onLayout={event => setWidth(choiceTileWidth(event.nativeEvent.layout.width, columns, gap))}
    style={[style, styles.grid, { gap, direction: isRTL ? 'rtl' : 'ltr' }]}>
    <GridWidth.Provider value={width}>{children}</GridWidth.Provider>
  </View>;
}

export function ChoiceTile({ label, selected, onPress, testID, accessibilityLabel, role = 'checkbox', optionId, icon }: Omit<ChoiceChipProps, 'style'> & { optionId?: string; icon?: keyof typeof Feather.glyphMap }) {
  const colors = useColors();
  const { isRTL, fonts } = useI18n();
  const width = useContext(GridWidth);
  // Legacy callers may include a textual tick. The control supplies one accessible indicator.
  const displayLabel = label.replace(/^✓\s*/, '');
  const foreground = selected ? '#173F78' : colors.foreground;
  return <TouchableOpacity onPress={onPress} testID={testID} activeOpacity={0.75}
    accessibilityRole={role} accessibilityLabel={accessibilityLabel ?? displayLabel}
    accessibilityState={role === 'button' ? { selected } : { checked: selected }}
    style={[styles.tile, { width: width ?? '47%', flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: selected ? '#EFF6FF' : colors.card, borderColor: selected ? '#2474D6' : colors.border }]}>
    <Feather name={icon ?? choiceIcon(displayLabel, optionId)} size={21} color={foreground} accessible={false} />
    <Text style={[styles.label, { color: foreground, fontFamily: selected ? fonts.semiBold : fonts.medium, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{displayLabel}</Text>
    <View accessible={false} style={[styles.indicator, { backgroundColor: selected ? '#2474D6' : 'transparent', borderColor: selected ? '#2474D6' : '#94A3B8' }]}>
      {selected && <Feather name="check" size={12} color="#FFFFFF" />}
    </View>
  </TouchableOpacity>;
}

/** Saved facts have no checkbox or press handler; unknown values are filtered by callers. */
export function ChoiceFact({ label, optionId, testID, compact = false, vertical = false }: { label: string; optionId?: string; testID?: string; compact?: boolean; vertical?: boolean }) {
  const width = useContext(GridWidth);
  const { isRTL, fonts } = useI18n();
  return <View testID={testID} style={[styles.tile, styles.fact, compact && { minHeight: vertical ? 48 : 38, paddingVertical: 6, paddingHorizontal: 7, borderRadius: 8, borderWidth: 0 }, { width: width ?? '47%', flexDirection: vertical ? 'column' : compact ? (isRTL ? 'row' : 'row-reverse') : (isRTL ? 'row-reverse' : 'row') }]}>
    <Feather name={choiceIcon(label, optionId)} size={21} color="#173F78" accessible={false} />
    <Text style={[styles.label, compact && { fontSize: 13, lineHeight: 19 }, vertical && { flex: 0, textAlign: 'center' }, { color: '#173F78', fontFamily: fonts.medium, textAlign: vertical ? 'center' : isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: CHOICE_GRID_GAP, alignItems: 'stretch' },
  tile: { direction: 'ltr', minHeight: 64, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center', gap: 7, flexGrow: 0, flexShrink: 0 },
  label: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 21 },
  indicator: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  fact: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
});
