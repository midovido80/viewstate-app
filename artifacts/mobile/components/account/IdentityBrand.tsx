import React from "react";
import { View } from "react-native";
import { ViewStateMark } from "@/components/brand/ViewStateBrand";
import { Text } from "@/components/AppText";
import { useI18n } from "@/contexts/I18nContext";
import {
  pilot2Theme as theme,
  pilot2Typography,
} from "@/constants/pilot2Theme";

export function IdentityBrand({
  inverse = false,
  compact = false,
}: {
  inverse?: boolean;
  compact?: boolean;
}) {
  const { fonts } = useI18n();
  const type = pilot2Typography(fonts);
  const color = inverse ? theme.color.onPrimary : theme.color.primary;
  return (
    <View
      style={{ alignItems: "center", gap: theme.space.sm, direction: "ltr" }}
    >
      <ViewStateMark size={compact ? 40 : 72} color={color} />
      <Text
        style={[
          compact ? type.heading : type.display,
          { color, textAlign: "center", writingDirection: "ltr" },
        ]}
      >
        ViewState
      </Text>
    </View>
  );
}
