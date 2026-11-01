import React from 'react';
import Svg, { Path } from 'react-native-svg';

// These detail icons render directly. They never download a font when a saved
// property's specification section first appears (including on slow Preview links).
export type PropertySpecIconName = 'bed-outline' | 'shower' | 'sofa-outline' | 'car' | 'stairs' | 'set-square' | 'percent' | 'master-bedroom' | 'users' | 'calendar' | 'money' | 'building';
const paths: Record<PropertySpecIconName, string> = {
  'master-bedroom': 'M3 18V8 M21 18V11 M3 14H21 M3 11H21V14 M6 11V8H12V11 M3 18V21 M21 18V21 M17 2L18 4L20 4L18.5 5.5L19 8L17 6.5L15 8L15.5 5.5L14 4L16 4Z',
  users: 'M10 7A3 3 0 1 1 4 7A3 3 0 1 1 10 7 M20 7A3 3 0 1 1 14 7A3 3 0 1 1 20 7 M1 21V17A4 4 0 0 1 5 13H9A4 4 0 0 1 13 17V21 M15 13H18A4 4 0 0 1 22 17V21 M5 21V17 M18 21V17',
  calendar: 'M4 5H20V22H4Z M4 10H20 M8 2V7 M16 2V7 M8 14H10 M14 14H16 M8 18H10',
  money: 'M2 5H22V19H2Z M15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12 M5 9H6 M18 15H19',
  building: 'M4 22V3H18V22 M2 22H22 M8 7H10 M13 7H15 M8 11H10 M13 11H15 M8 15H10 M13 15H15 M10 22V18H14V22',

  percent: 'M4 20L20 4 M8 6A2 2 0 1 1 4 6A2 2 0 1 1 8 6 M20 18A2 2 0 1 1 16 18A2 2 0 1 1 20 18',
  'bed-outline': 'M3 18V6 M21 18V10 M3 14H21 M3 10H21V14 M6 10V7H11V10 M13 10V7H18V10 M3 18V21 M21 18V21',
  shower: 'M5 10V7A5 5 0 0 1 15 7 M11 10A4 4 0 0 1 19 10H11 M11 13V14 M15 13V14 M19 13V14 M12 17V18 M16 17V18 M20 17V18',
  'sofa-outline': 'M5 12V7A2 2 0 0 1 7 5H17A2 2 0 0 1 19 7V12 M5 12A2 2 0 0 0 1 12V18H23V12A2 2 0 0 0 19 12V15H5V12 M4 18V21 M20 18V21',
  car: 'M4 11L6 5H18L20 11 M4 11H20A2 2 0 0 1 22 13V18H2V13A2 2 0 0 1 4 11 M5 14H7 M17 14H19 M4 18V21 M20 18V21',
  stairs: 'M3 21H8V16H13V11H18V6H22 M3 3H22 M22 3V21',
  'set-square': 'M4 3V21H22L4 3 M8 12V17H13L8 12 M4 8H6 M4 13H6 M4 18H6 M10 21V19 M15 21V19',
};

export function PropertySpecIcon({ name, size = 24, color }: { name: PropertySpecIconName; size?: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    <Path d={paths[name]} />
  </Svg>;
}
