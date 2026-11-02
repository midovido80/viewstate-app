import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Props = Omit<ComponentProps<typeof Pressable>, 'children' | 'style'> & {
  selected: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};
/** Equal first-row widths; larger text can still use the existing horizontal scroll. */
export function useIntentFilterWidth() {
  const { width, fontScale } = useWindowDimensions();
  return Math.max(56 * Math.min(fontScale, 1.3), (width - 40 - 4 * 6) / 5);
}

/** Presentation only: the owning screen retains its existing toggle/reset/filter rules. */
export function RaisedFilterButton({ selected, children, style, ...props }: Props) {
  const colors = useColors();
  return <Pressable hitSlop={{ top: 5, bottom: 5 }} {...props} style={({ pressed }) => [
    styles.button,
    { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : '#D8E1EF' },
    style,
    pressed && styles.pressed,
  ]}>{children}</Pressable>;
}
const styles = StyleSheet.create({
  button: {
    height: 34, minHeight: 34, paddingHorizontal: 4, paddingVertical: 0,
    alignItems: 'center', justifyContent: 'center', borderRadius: 9,
    borderWidth: 1, borderBottomWidth: 2,
    shadowColor: '#173F78', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 1.5, elevation: 1,
  },
  pressed: { transform: [{ translateY: 1 }], shadowOpacity: 0, elevation: 0, opacity: 0.9 },
});
