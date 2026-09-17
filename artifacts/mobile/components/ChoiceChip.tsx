import { StyleSheet, Text, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

export interface ChoiceChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  role?: 'button' | 'checkbox' | 'radio';
}

export function ChoiceChip({ label, selected, onPress, testID, style, role = 'checkbox' }: ChoiceChipProps) {
  const colors = useColors();
  const { fonts } = useI18n();

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'button' ? {} : { checked: selected }}
      testID={testID}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: selected ? colors.primaryForeground : colors.foreground, fontFamily: fonts.medium }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 20,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    flexShrink: 1,
  },
});
