import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Props = Omit<ComponentProps<typeof Pressable>, 'children' | 'style'> & {
  selected: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};
/** Presentation only: the owning screen retains its existing toggle/reset/filter rules. */
export function RaisedFilterButton({ selected, children, style, ...props }: Props) {
  const colors = useColors();
  return <Pressable {...props} style={({ pressed }) => [
    styles.button,
    { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : '#D8E1EF' },
    style,
    pressed && styles.pressed,
  ]}>{children}</Pressable>;
}
const styles = StyleSheet.create({
  button: {
    minHeight: 44, paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center', borderRadius: 14,
    borderWidth: 1, borderBottomWidth: 3,
    shadowColor: '#173F78', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 3,
  },
  pressed: { transform: [{ translateY: 1 }], shadowOpacity: 0, elevation: 0, opacity: 0.9 },
});
