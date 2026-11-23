import { Text, type TextProps } from 'react-native';

export function PhoneNumberText({ children, style, ...props }: TextProps & { children: string }) {
  return <Text {...props} accessibilityLabel={props.accessibilityLabel ?? children}
    style={[style, { writingDirection: 'ltr' }]}>{'\u2066' + children + '\u2069'}</Text>;
}
