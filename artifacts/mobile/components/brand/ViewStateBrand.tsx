import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';

/** The approved V mark is vector artwork, so it stays crisp on every density. */
export function ViewStateMark({ size = 36 }: { size?: number }) {
  const colors = useColors();
  return <Svg width={size} height={size} viewBox="0 0 80 80" aria-hidden>
    <Path d="M8 9h15l18 38L59 9h14L42 74z" fill={colors.primary} />
    <Path d="M34 9h15l-8 19z" fill={colors.primary} opacity={0.5} />
  </Svg>;
}
export function ViewStateBrand({ large = false }: { large?: boolean }) {
  const { fonts } = useI18n(), colors = useColors();
  return <View style={{ flexDirection: 'row', direction: 'ltr', gap: large ? 8 : 5, alignItems: 'center', justifyContent: 'center' }}>
    <ViewStateMark size={large ? 52 : 31} />
    <Text style={{ fontFamily: fonts.bold, fontSize: large ? 32 : 22, color: colors.text, letterSpacing: -0.7 }}>ViewState</Text>
  </View>;
}
