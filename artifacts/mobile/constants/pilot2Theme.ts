import type { TextStyle } from "react-native";

export const pilot2Theme = {
  color: {
    background: "#F6F7F4",
    surface: "#FFFFFF",
    text: "#183A3D",
    muted: "#59686A",
    primary: "#155E63",
    onPrimary: "#FFFFFF",
    primarySoft: "#E7F0EE",
    border: "#D5DEDA",
    controlBorder: "#81928F",
    focus: "#155E63",
    match: "#ECE6F4",
    onMatch: "#705781",
    contact: "#25D366",
    onContact: "#10382F",
    danger: "#AC3346",
    dangerSoft: "#FFF0F2",
    scrim: "#10382F66",
    pressed: "#EAF0EC",
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, hero: 48 },
  radius: { control: 12, card: 20, hero: 28, pill: 999 },
  size: { touch: 48, icon: 20, avatar: 72, page: 480 },
} as const;

type Fonts = { regular: string; medium: string; bold: string };
export function pilot2Typography(fonts: Fonts) {
  return {
    display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 44 },
    title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 36 },
    heading: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 28 },
    body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24 },
    label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 22 },
    caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 },
  } satisfies Record<string, TextStyle>;
}
