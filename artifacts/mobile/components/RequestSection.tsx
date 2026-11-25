import { Text } from "@/components/AppText";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/contexts/I18nContext";

export function RequestSection({
  title,
  children,
  collapsible = false,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
}) {
  const colors = useColors();
  const { isRTL, fonts } = useI18n();
  const [open, setOpen] = useState(!collapsible);
  const heading = (
    <Text
      style={{
        fontFamily: fonts.bold,
        fontSize: 17,
        color: colors.foreground,
        textAlign: isRTL ? "right" : "left",
      }}
    >
      {title}
      {collapsible ? (open ? " −" : " +") : ""}
    </Text>
  );
  return (
    <View
      style={{
        padding: 16,
        gap: 14,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        borderRadius: 16,
      }}
    >
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          {heading}
        </Pressable>
      ) : (
        heading
      )}
      <View style={{ display: open ? "flex" : "none", gap: 12 }}>
        {children}
      </View>
    </View>
  );
}
