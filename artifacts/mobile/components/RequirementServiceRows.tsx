import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/contexts/I18nContext";

export function RequirementServiceGroup({
  title,
  children,
  collapsible = false,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
}) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();
  const [open, setOpen] = useState(!collapsible);
  return (
    <View
      style={[
        styles.group,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <Pressable
        disabled={!collapsible}
        accessibilityRole={collapsible ? "button" : undefined}
        accessibilityState={collapsible ? { expanded: open } : undefined}
        onPress={() => setOpen((value) => !value)}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            {
              color: colors.foreground,
              backgroundColor: colors.background,
              fontFamily: fonts.bold,
              textAlign: isRTL ? "right" : "left",
            },
          ]}
        >
          {title}
          {collapsible ? (open ? " −" : " +") : ""}
        </Text>
      </Pressable>
      <View style={{ display: open ? "flex" : "none" }}>{children}</View>
    </View>
  );
}

export function RequirementServiceRow({
  label,
  state,
  onPress,
  onExclude,
  testID,
}: {
  label: string;
  state: "required" | "excluded" | "unset";
  onPress(): void;
  onExclude?: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();
  const align = isRTL ? "right" : "left";
  const [expanded, setExpanded] = useState(false);
  const row = isRTL ? "row-reverse" : "row";
  const selected = state !== "unset";
  const status =
    state === "required"
      ? isRTL
        ? "مطلوبة"
        : "Required"
      : state === "excluded"
        ? isRTL
          ? "غير مرغوبة"
          : "Excluded"
        : isRTL
          ? "بدون تفضيل"
          : "No preference";
  const tint = state === "excluded" ? colors.destructive : colors.primary;
  const excludeLabel =
    state === "excluded"
      ? isRTL
        ? "إلغاء الاستبعاد"
        : "Clear exclusion"
      : isRTL
        ? "استبعاد"
        : "Exclude";
  return (
    <View>
      <View
        style={[styles.row, { flexDirection: row, borderColor: colors.border }]}
      >
        <Pressable
          testID={testID}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={status ? label + "، " + status : label}
          onPress={() => {
            onPress();
            setExpanded(true);
          }}
          style={[styles.option, { flexDirection: row }]}
        >
          <View style={styles.text}>
            <Text
              style={{
                textAlign: align,
                color: colors.foreground,
                fontFamily: fonts.semiBold,
              }}
            >
              {label}
            </Text>
            {status && (
              <Text
                style={{
                  textAlign: align,
                  fontSize: 12,
                  color: colors.foreground,
                  fontFamily: fonts.regular,
                }}
              >
                {status}
              </Text>
            )}
          </View>
          <Feather
            name={
              state === "required"
                ? "check-square"
                : state === "excluded"
                  ? "minus-square"
                  : "square"
            }
            size={22}
            color={selected ? tint : colors.mutedForeground}
          />
        </Pressable>
        {onExclude && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={excludeLabel + " " + label}
            onPress={onExclude}
            testID={testID ? testID + "-exclude" : undefined}
            style={styles.exclude}
          >
            <Text
              style={{
                fontSize: 12,
                color: colors.primary,
                fontFamily: fonts.semiBold,
              }}
            >
              {excludeLabel}
            </Text>
          </Pressable>
        )}
      </View>
      {expanded && (
        <View
          style={{
            direction: "ltr",
            flexDirection: isRTL ? "row-reverse" : "row",
            flexWrap: "wrap",
            gap: 6,
            paddingHorizontal: 12,
            paddingBottom: 10,
          }}
        >
          {(
            [
              "required",
              "unset",
              ...(onExclude ? (["excluded"] as const) : []),
            ] as const
          ).map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="radio"
              accessibilityState={{ checked: state === choice }}
              onPress={() => {
                if (choice !== state) {
                  if (choice === "required") onPress();
                  else if (choice === "excluded") onExclude?.();
                  else if (state === "excluded") onExclude?.();
                  else onPress();
                }
                setExpanded(false);
              }}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                justifyContent: "center",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: state === choice ? colors.primary : colors.border,
                backgroundColor:
                  state === choice ? colors.primary : colors.card,
              }}
            >
              <Text
                style={{
                  color:
                    state === choice
                      ? colors.primaryForeground
                      : colors.foreground,
                  fontFamily: fonts.medium,
                  textAlign: align,
                }}
              >
                {choice === "required"
                  ? isRTL
                    ? "مطلوبة"
                    : "Required"
                  : choice === "excluded"
                    ? isRTL
                      ? "غير مرغوبة"
                      : "Unwanted"
                    : isRTL
                      ? "بدون تفضيل"
                      : "No preference"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  title: { paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  row: {
    direction: "ltr",
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  option: {
    direction: "ltr",
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
    gap: 10,
  },
  text: { flex: 1, gap: 2 },
  exclude: {
    minHeight: 44,
    minWidth: 48,
    paddingHorizontal: 9,
    justifyContent: "center",
  },
});
