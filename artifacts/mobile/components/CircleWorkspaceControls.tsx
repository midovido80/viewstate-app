import React, { useState, type ComponentProps } from "react";
import { Pressable, Switch, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Text } from "./AppText";
import { Button } from "./Button";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import { circleDesign as d } from "@/constants/circleDesign";
import { circleControlColumns } from "@/services/circleWorkspaceLayout";

export type CircleSection =
  "opportunities" | "properties" | "requests" | "members";

export function CircleSectionTabs({
  selected,
  onSelect,
  style,
  ...props
}: Omit<ComponentProps<typeof View>, "children"> & {
  selected: CircleSection;
  onSelect: (value: CircleSection) => void;
}) {
  const { isRTL, language, fonts } = useI18n();
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState<CircleSection | null>(null);
  const columns = width ? circleControlColumns(width, fontScale, "tabs") : 2;
  const labels: Record<CircleSection, readonly [string, string]> = {
    opportunities: ["الفرص", "Opportunities"],
    properties: ["العقارات", "Properties"],
    requests: ["الطلبات", "Requests"],
    members: ["الأعضاء", "Members"],
  };
  return (
    <View
      {...props}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        props.onLayout?.(event);
      }}
      style={[
        {
          direction: "ltr",
          flexDirection: isRTL ? "row-reverse" : "row",
          flexWrap: "wrap",
          gap: d.space.tight,
        },
        style,
      ]}
    >
      {(Object.keys(labels) as CircleSection[]).map((value) => (
        <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === value }}
          accessibilityLabel={labels[value][language === "ar" ? 0 : 1]}
          testID={`circle-section-${value}`}
          onPress={() => onSelect(value)}
          onFocus={() => setFocused(value)}
          onBlur={() => setFocused(null)}
          style={({ pressed }) => ({
            flexBasis: width
              ? (width - d.space.tight * (columns - 1)) / columns
              : "45%",
            flexGrow: 1,
            minWidth: 0,
            minHeight: d.target,
            paddingHorizontal: d.space.tight,
            paddingVertical: d.space.control,
            justifyContent: "center",
            borderRadius: d.radius.control,
            backgroundColor:
              selected === value
                ? pressed
                  ? colors.accent
                  : colors.primary
                : pressed
                  ? colors.background
                  : colors.card,
            borderWidth: focused === value ? 2 : 1,
            borderColor:
              focused === value
                ? colors.accent
                : selected === value
                  ? colors.primary
                  : colors.mutedForeground,
          })}
        >
          <Text
            style={{
              ...d.text.body,
              textAlign: "center",
              fontFamily: fonts.semiBold,
              color:
                selected === value
                  ? colors.primaryForeground
                  : colors.foreground,
            }}
          >
            {labels[value][language === "ar" ? 0 : 1]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function CircleMatchingStatus({
  enabled,
  failed,
  processing,
  busy,
  lastChecked,
  onToggle,
  onChoose,
  style,
  ...props
}: Omit<ComponentProps<typeof View>, "children"> & {
  enabled: boolean;
  failed: boolean;
  processing: boolean;
  busy: boolean;
  lastChecked?: string;
  onToggle: (value: boolean) => void;
  onChoose: () => void;
}) {
  const { isRTL, language, fonts } = useI18n();
  const colors = useColors();
  const ar = language === "ar";
  const L = (arabic: string, english: string) => (ar ? arabic : english);
  const state = failed
    ? L("تعذّر تحديث الحالة. أعد المحاولة.", "Could not refresh. Try again.")
    : processing
      ? L("جارٍ البحث عن مطابقات…", "Checking for matches…")
      : enabled
        ? L(
            "مفعّلة لطلباتك في هذه الدائرة",
            "Enabled for your requests in this circle",
          )
        : L(
            "اختر طلب عميل لتشغيل المطابقة",
            "Choose a client request to start matching",
          );
  const row = isRTL ? ("row-reverse" as const) : ("row" as const);
  return (
    <View
      {...props}
      style={[
        {
          padding: d.space.content,
          gap: d.space.tight,
          borderRadius: d.radius.card,
          backgroundColor: colors.card,
        },
        style,
      ]}
    >
      <View
        style={{
          direction: "ltr",
          flexDirection: row,
          gap: d.space.control,
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: d.space.tight }}>
          <Text
            style={{
              ...d.text.title,
              fontFamily: fonts.semiBold,
              color: colors.foreground,
            }}
          >
            {L("المطابقة التلقائية", "Automatic matching")}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={{
              ...d.text.body,
              fontFamily: fonts.regular,
              color: failed ? colors.destructive : colors.mutedForeground,
            }}
          >
            {state}
          </Text>
        </View>
        <Switch
          testID="circle-matching-switch"
          accessibilityLabel={L(
            "المطابقة التلقائية لطلباتك في الدائرة",
            "Your automatic matching in this circle",
          )}
          value={enabled}
          disabled={busy || failed}
          onValueChange={onToggle}
        />
      </View>
      {lastChecked && (
        <Text
          style={{
            ...d.text.caption,
            fontFamily: fonts.regular,
            color: colors.mutedForeground,
          }}
        >
          {L("آخر تحديث: ", "Last refreshed: ")}
          {"\u2068" +
            new Date(lastChecked).toLocaleTimeString(ar ? "ar-KW" : "en-GB", {
              timeZone: "Asia/Kuwait",
              hour: "2-digit",
              minute: "2-digit",
            }) +
            "\u2069"}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={L(
          "اختيار طلب للمطابقة",
          "Choose a request to match",
        )}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onChoose}
        testID="circle-choose-matching-request"
        style={({ pressed }) => ({
          minHeight: d.target,
          direction: "ltr",
          flexDirection: row,
          alignItems: "center",
          justifyContent: "space-between",
          gap: d.space.tight,
          opacity: busy ? 0.5 : 1,
          backgroundColor: pressed ? colors.background : colors.card,
          borderRadius: d.radius.control,
        })}
      >
        <Text
          style={{
            ...d.text.body,
            color: colors.primary,
            fontFamily: fonts.semiBold,
            flex: 1,
          }}
        >
          {L("اختيار طلب للمطابقة", "Choose a request to match")}
        </Text>
        <Feather
          name={isRTL ? "chevron-left" : "chevron-right"}
          size={20}
          color={colors.primary}
        />
      </Pressable>
    </View>
  );
}

export function CircleWorkspaceActions({
  busy,
  onShare,
  onInvite,
  style,
  ...props
}: Omit<ComponentProps<typeof View>, "children"> & {
  busy: boolean;
  onShare: () => void;
  onInvite: () => void;
}) {
  const { isRTL, language } = useI18n();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const columns = width ? circleControlColumns(width, fontScale, "actions") : 2;
  return (
    <View
      {...props}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        props.onLayout?.(event);
      }}
      style={[
        {
          direction: "ltr",
          flexDirection: isRTL ? "row-reverse" : "row",
          flexWrap: "wrap",
          gap: d.space.tight,
        },
        style,
      ]}
    >
      <Button
        testID="circle-share-fixed"
        title={language === "ar" ? "شارك عقار" : "Share listing"}
        disabled={busy}
        onPress={onShare}
        style={{
          flexGrow: 1,
          flexBasis: width
            ? (width - d.space.tight * (columns - 1)) / columns
            : "45%",
        }}
      />
      <Button
        testID="circle-invite-fixed"
        title={language === "ar" ? "دعوة زميل" : "Invite colleague"}
        variant="outline"
        disabled={busy}
        onPress={onInvite}
        style={{
          flexGrow: 1,
          flexBasis: width
            ? (width - d.space.tight * (columns - 1)) / columns
            : "45%",
        }}
      />
    </View>
  );
}
