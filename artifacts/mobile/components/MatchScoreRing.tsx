import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useI18n } from '@/contexts/I18nContext';
/** A visual encoding of the existing engine score; never a new matching calculation. */
export function MatchScoreRing({ score, size = 62 }: { score: number; size?: number }) {
  const { fonts, language } = useI18n();
  const valid = Number.isFinite(score), value = valid ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  const radius = (size - 8) / 2, circumference = 2 * Math.PI * radius;
  return <View testID="matching-score-ring" accessibilityLabel={`${language === 'ar' ? 'درجة المطابقة' : 'Match score'}: ${valid ? `${value}%` : '—'}`} style={{ width: size, height: size, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size} height={size} style={{ position: 'absolute' }} aria-hidden>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#E4EBF8" strokeWidth={4} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#235AF3" strokeWidth={4} strokeLinecap="round" fill="none" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - value / 100)} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
    </Svg>
    <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: '#235AF3', writingDirection: 'ltr' }}>{valid ? `${value}%` : '—'}</Text>
  </View>;
}
