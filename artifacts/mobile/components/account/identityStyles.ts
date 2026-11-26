import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useI18n } from "@/contexts/I18nContext";
import { pilot2Theme as t, pilot2Typography } from "@/constants/pilot2Theme";

export function useAccountScreenStyles() {
  const { fonts, isRTL } = useI18n();
  return useMemo(() => {
    const type = pilot2Typography(fonts);
    const direction = {
      direction: "ltr" as const,
      flexDirection: isRTL ? ("row-reverse" as const) : ("row" as const),
    };
    const align = { textAlign: isRTL ? ("right" as const) : ("left" as const) };
    return StyleSheet.create({
      safe: { flex: 1, backgroundColor: t.color.background },
      content: {
        flexGrow: 1,
        padding: t.space.xl,
        gap: t.space.lg,
        width: "100%",
        maxWidth: t.size.page,
        alignSelf: "center",
      },
      top: {
        ...direction,
        alignItems: "center",
        justifyContent: "space-between",
        gap: t.space.lg,
      },
      brand: {
        ...type.heading,
        color: t.color.primary,
        writingDirection: "ltr",
      },
      title: { ...type.title, ...align, color: t.color.text },
      description: { ...type.body, ...align, color: t.color.muted },
      email: {
        ...type.caption,
        color: t.color.muted,
        writingDirection: "ltr",
        textAlign: "left",
      },
      field: { gap: t.space.sm },
      label: { ...type.label, ...align, color: t.color.text },
      muted: { ...type.caption, color: t.color.muted },
      red: { ...type.caption, ...align, color: t.color.danger },
      input: {
        ...type.body,
        minHeight: t.size.touch,
        paddingHorizontal: t.space.md,
        paddingVertical: t.space.md,
        borderWidth: 1,
        borderColor: t.color.controlBorder,
        borderRadius: t.radius.control,
        backgroundColor: t.color.surface,
        color: t.color.text,
      },
      invalid: {
        borderColor: t.color.danger,
        backgroundColor: t.color.dangerSoft,
      },
      avatarRow: { ...direction, gap: t.space.lg, alignItems: "center" },
      avatar: {
        width: t.size.avatar,
        height: t.size.avatar,
        borderRadius: t.radius.pill,
      },
      avatarEmpty: {
        backgroundColor: t.color.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      },
      quiet: {
        minHeight: t.size.touch,
        justifyContent: "center",
        paddingVertical: t.space.sm,
      },
      link: { ...type.label, ...align, color: t.color.primary },
      primary: {
        minHeight: t.size.touch,
        borderRadius: t.radius.control,
        backgroundColor: t.color.primary,
        alignItems: "center",
        justifyContent: "center",
        padding: t.space.md,
      },
      primaryText: {
        ...type.label,
        color: t.color.onPrimary,
        textAlign: "center",
      },
      roleChoices: { ...direction, flexWrap: "wrap", gap: t.space.sm },
      roleChoice: {
        minHeight: t.size.touch,
        flexGrow: 1,
        flexBasis: "44%",
        borderWidth: 1,
        borderColor: t.color.controlBorder,
        backgroundColor: t.color.surface,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.space.md,
        paddingVertical: t.space.sm,
        alignItems: "center",
        justifyContent: "center",
      },
      roleSelected: {
        backgroundColor: t.color.primary,
        borderColor: t.color.primary,
      },
    });
  }, [fonts, isRTL]);
}
