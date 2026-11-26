import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { useI18n } from "@/contexts/I18nContext";
import {
  pilot2Theme as theme,
  pilot2Typography,
} from "@/constants/pilot2Theme";

export function IdentityButton({
  label,
  onPress,
  secondary = false,
  busy = false,
  disabled = false,
  icon,
  testID,
}: {
  label: string;
  onPress(): void;
  secondary?: boolean;
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  testID?: string;
}) {
  const { fonts, isRTL } = useI18n();
  const foreground = secondary ? theme.color.text : theme.color.onPrimary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          flexDirection: isRTL ? "row-reverse" : "row",
          backgroundColor: secondary
            ? theme.color.surface
            : theme.color.primary,
          borderColor: secondary
            ? theme.color.controlBorder
            : theme.color.primary,
        },
        pressed && styles.pressed,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <View>{icon}</View>
      ) : null}
      <Text
        style={[
          pilot2Typography(fonts).label,
          { color: foreground, textAlign: "center", flexShrink: 1 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: theme.size.touch,
    borderWidth: 1,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
    direction: "ltr",
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
});
