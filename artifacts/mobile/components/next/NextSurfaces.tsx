import React from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useI18n } from "@/contexts/I18nContext";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { nextDesign as n } from "@/constants/nextDesign";

export function NextPage({
  title,
  subtitle,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  back?: () => void;
}) {
  const { isRTL, fonts, language } = useI18n(),
    insets = useScreenInsets(),
    router = useRouter();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: n.background }}
      contentContainerStyle={{
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
        padding: 18,
        paddingBottom: insets.bottom + 24,
        gap: 20,
      }}
    >
      <View
        style={{
          direction: "ltr",
          flexDirection: isRTL ? "row-reverse" : "row",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            flex: 1,
            textAlign: isRTL ? "right" : "left",
            color: n.ink,
            fontFamily: fonts.bold,
            fontSize: 27,
            lineHeight: 36,
          }}
        >
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={language === "ar" ? "رجوع" : "Back"}
          onPress={
            back ??
            (() =>
              router.canGoBack() ? router.back() : router.replace("/" as never))
          }
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: n.white,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: n.border,
          }}
        >
          <Feather
            name={isRTL ? "arrow-right" : "arrow-left"}
            size={20}
            color={n.navy}
          />
        </Pressable>
      </View>
      {subtitle ? (
        <Text
          style={{
            color: n.muted,
            fontFamily: fonts.regular,
            lineHeight: 23,
            fontSize: 14,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      {children}
    </ScrollView>
  );
}
export function NextSurface({
  children,
  title,
  testID,
}: {
  children: React.ReactNode;
  title?: string;
  testID?: string;
}) {
  const { isRTL, fonts } = useI18n();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: n.white,
        borderColor: n.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 18,
        gap: 12,
      }}
    >
      {title ? (
        <Text
          accessibilityRole="header"
          style={{
            color: n.ink,
            fontFamily: fonts.bold,
            fontSize: 19,
            lineHeight: 28,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
export function NextReadChips({
  values,
}: {
  values: readonly { label: string; testID?: string }[];
}) {
  const { isRTL, fonts } = useI18n();
  return (
    <View
      style={{
        direction: "ltr",
        flexDirection: isRTL ? "row-reverse" : "row",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      {values.map((v, i) => (
        <View
          key={i}
          testID={v.testID}
          style={{
            paddingHorizontal: 11,
            paddingVertical: 7,
            backgroundColor: n.soft,
            borderRadius: 8,
            maxWidth: "100%",
          }}
        >
          <Text
            selectable
            style={{
              color: n.navy,
              fontFamily: fonts.medium,
              fontSize: 13,
              lineHeight: 20,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {v.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
/** Pairs retain their original controls and validation owners; large text stacks. */
export function NextFieldPair({
  first,
  second,
}: {
  first: React.ReactNode;
  second?: React.ReactNode;
}) {
  const { isRTL } = useI18n(),
    { fontScale, width } = useWindowDimensions();
  const stacked = fontScale > 1.4 || width < 350;
  return (
    <View
      style={{
        direction: "ltr",
        flexDirection: stacked ? "column" : isRTL ? "row-reverse" : "row",
        gap: 12,
      }}
    >
      <View style={{ flex: stacked ? undefined : 1, minWidth: 0 }}>
        {first}
      </View>
      {second ? (
        <View style={{ flex: stacked ? undefined : 1, minWidth: 0 }}>
          {second}
        </View>
      ) : null}
    </View>
  );
}
