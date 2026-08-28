import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/contexts/I18nContext';

interface SelectCardProps {
  title: string;
  icon?: keyof typeof Feather.glyphMap;
  selected?: boolean;
  onSelect: () => void;
  testID?: string;
}

export function SelectCard({ title, icon, selected, onSelect, testID }: SelectCardProps) {
  const colors = useColors();
  const { isRTL, fonts } = useI18n();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onSelect}
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ selected: Boolean(selected) }}
      style={[
        styles.container,
        {
          backgroundColor: selected ? colors.accent : colors.card,
          borderColor: selected ? colors.turquoise : colors.border,
          borderRadius: colors.cardRadius,
          flexDirection: isRTL ? 'row-reverse' : 'row',
        }
      ]}
    >
      {icon && (
        <Feather 
          name={icon} 
          size={24} 
          color={selected ? colors.primary : colors.mutedForeground} 
          style={isRTL ? styles.iconRTL : styles.icon}
        />
      )}
      <Text style={[
        styles.title, 
        {
          color: selected ? colors.primary : colors.cardForeground,
          textAlign: isRTL ? 'right' : 'left',
          fontFamily: fonts.medium,
        }
      ]}>
        {title}
      </Text>
      
      <Feather 
        name={selected ? "check-circle" : "circle"} 
        size={24}
        color={selected ? colors.primary : colors.mutedForeground} 
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderWidth: 1,
    marginBottom: 12,
    minHeight: 56,
  },
  icon: {
    marginRight: 16,
  },
  iconRTL: {
    marginLeft: 16,
  },
  title: {
    flex: 1,
    fontSize: 16,
  }
});
