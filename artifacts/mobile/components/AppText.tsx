import * as React from "react";
import { Platform, Text as NativeText } from "react-native";
import * as I18n from "@/contexts/I18nContext";
import { textDirectionStyle } from "@/services/textDirection";

export function Text({
  style,
  ...props
}: React.ComponentProps<typeof NativeText>) {
  const context = React.useContext(I18n.I18nContext);
  const defaults = textDirectionStyle(context?.isRTL ?? false, Platform.OS);
  return (
    <NativeText
      {...props}
      style={[
        defaults,
        style,
        Platform.OS === "android" && { direction: defaults.direction },
      ]}
    />
  );
}
