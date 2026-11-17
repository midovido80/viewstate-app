import React, { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export type NavigationDestination = 'index' | 'matching' | 'people' | 'properties';
/** Approved composition B: building 4, people 1, puzzle 2, home 5. Local vectors, no fonts or downloads. */
export function NavigationIcon({ destination, selected, size = 32 }: { destination: NavigationDestination; selected: boolean; size?: number }) {
  const id = useId().replace(/:/g, '');
  const blue = selected ? '#0755F5' : '#5076A8', navy = selected ? '#173F78' : '#536D90';
  return <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {destination === 'properties' ? <>
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={selected ? '#C0E1FF' : '#D3E1F0'} /><Stop offset="1" stopColor={selected ? '#287CF5' : '#7A9BC3'} /></LinearGradient></Defs>
      <Rect x="14" y="3" width="14" height="33" rx="3" fill={selected ? '#9AC9FF' : '#B2C8E1'} />
      <Rect x="25" y="9" width="9" height="27" rx="2.5" fill={blue} />
      <Path d="M25 9h4v27h-4z" fill={selected ? '#2F8AFF' : '#7A9DC7'} />
      <Rect x="7" y="7" width="19" height="29" rx="3" fill={`url(#${id})`} />
      {[13, 20].flatMap(x => [13, 20, 27].map(y => <Rect key={`${x}-${y}`} x={x} y={y} width="3" height="4" rx=".8" fill={blue} />))}
      <Path d="M5 37h31" stroke={blue} strokeWidth="2.5" strokeLinecap="round" />
    </> : destination === 'people' ? <>
      <Circle cx="15" cy="12" r="6" fill="none" stroke={blue} strokeWidth="2.8" />
      <Path d="M3 34v-3a12 12 0 0 1 24 0v3z" fill="none" stroke={blue} strokeWidth="2.8" strokeLinejoin="round" />
      <Path d="M28 8a5.5 5.5 0 1 1-2 10.6M30 22a10 10 0 0 1 7 9.5V34h-6" fill="none" stroke={blue} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </> : destination === 'matching' ? <>
      <Path d="M3 12h7V8a4 4 0 0 1 8 0v4h5v8h-3a4 4 0 0 0 0 8h3v8H6a3 3 0 0 1-3-3V24H1v-5h2z" fill={blue} />
      <Path d="M25 12h5V8a4 4 0 0 1 8 0v4h1v12h-3a4 4 0 0 0 0 8h3v4H25V26h-4a2 2 0 0 1 0-4h4z" fill={selected ? '#17C3D3' : '#6AABB8'} />
    </> : <>
      <Path d="M8 18v18h24V18" fill="none" stroke={navy} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 19 20 4l17 15" fill="none" stroke={navy} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      {[14, 22].flatMap(x => [17, 25].map(y => <Rect key={`${x}-${y}`} x={x} y={y} width="5" height="5" rx="1" fill={blue} />))}
    </>}
  </Svg>;
}
