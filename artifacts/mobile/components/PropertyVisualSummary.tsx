import { Text } from "@/components/AppText";
import React from "react";
import { Pressable, View } from "react-native";
import type { Property } from "@workspace/property-domain";
import { Feather } from "@expo/vector-icons";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import {
  propertyVisualFacts,
  propertyOfferStatus,
  propertyCardHeading,
  propertyCardSpecifications,
} from "@/services/propertyVisualPresentation";
import { PropertySpecIcon } from "@/components/PropertySpecIcon";
import { nextDesign as n } from "@/constants/nextDesign";
import { useRouter } from "expo-router";
import { matchingTarget } from "@/services/matchingScope";
import { PropertyCover } from "@/components/PropertyCover";
import { Action } from "@/components/assistant/ui";
export function PropertyStatus({ property }: { property: Property }) {
  const { language, fonts, isRTL } = useI18n(),
    s = propertyOfferStatus(property, language);
  return (
    <View
      style={{
        direction: "ltr",
        alignSelf: isRTL ? "flex-end" : "flex-start",
        borderRadius: 6,
        backgroundColor: s.background,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.medium,
          color: s.color,
          fontSize: 14,
          lineHeight: 21,
          textAlign: isRTL ? "right" : "left",
          writingDirection: isRTL ? "rtl" : "ltr",
        }}
      >
        {s.label}
      </Text>
    </View>
  );
}
export function PropertyFactStrip({
  property,
  compact = false,
}: {
  property: Property;
  compact?: boolean;
}) {
  const { language, isRTL, fonts } = useI18n(),
    colors = useColors(),
    facts = propertyVisualFacts(property, language);
  if (!facts.length) return null;
  return (
    <View
      testID="property-visual-facts"
      style={{
        direction: "ltr",
        flexDirection: isRTL ? "row-reverse" : "row",
        gap: compact ? 6 : 0,
        flexWrap: compact ? "nowrap" : "wrap",
        borderWidth: compact ? 0 : 1,
        borderColor: n.border,
        overflow: "hidden",
        backgroundColor: compact ? "transparent" : colors.card,
        borderRadius: 12,
        paddingVertical: compact ? 2 : 12,
      }}
    >
      {facts.map((f) => (
        <View
          key={f.id}
          style={{
            flex: compact ? 1 : undefined,
            width: compact ? undefined : "33.333%",
            minWidth: 0,
            minHeight: compact ? undefined : 90,
            padding: compact ? 0 : 10,
            borderWidth: compact ? 0 : 0.5,
            borderColor: n.border,
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <PropertySpecIcon
            name={f.icon}
            size={compact ? 17 : 23}
            color={colors.primary}
          />
          <Text
            style={{
              fontFamily: fonts.semiBold,
              color: colors.foreground,
              fontSize: compact ? 11 : 14,
              textAlign: "center",
            }}
          >
            {f.value}
          </Text>
          {!compact && (
            <Text
              style={{
                fontFamily: fonts.regular,
                color: colors.mutedForeground,
                fontSize: 11,
                textAlign: "center",
              }}
            >
              {f.label}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
export function PropertyVisualCard({
  property,
  title,
  area,
  price,
  onPress,
  onShareToCircles,
  testID,
}: {
  property: Property;
  title: string;
  area: string;
  price: string;
  onPress: () => void;
  onShareToCircles?: () => void;
  testID: string;
}) {
  const { isRTL, fonts, language } = useI18n(),
    colors = useColors(),
    router = useRouter();
  const heading = propertyCardHeading(property, title);
  return (
    <View
      style={{
        direction: "ltr",
        backgroundColor: colors.card,
        borderRadius: colors.cardRadius,
        overflow: "hidden",
      }}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${heading}, ${area}, ${price}`}
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        {property.attachments?.some(
          (attachment) => attachment.kind === "image",
        ) ? (
          <PropertyCover
            property={property}
            label={heading}
            style={{ width: "100%", aspectRatio: 2 }}
          />
        ) : null}
        <View style={{ padding: colors.spacing * 2 }}>
          <PropertyCardContent
            property={property}
            title={title}
            area={area}
            price={price}
          />
        </View>
      </Pressable>
      {onShareToCircles && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <Action
            label={
              language === "ar"
                ? "مشاركة في دائرة الثقة"
                : "Share to Trust Circles"
            }
            icon="users"
            tone="primary"
            onPress={onShareToCircles}
            testID={`property-circle-share-${property.core.id}`}
          />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        testID={`${testID}-match`}
        onPress={() =>
          router.push(
            matchingTarget({ kind: "property", id: property.core.id }) as never,
          )
        }
        style={{
          paddingHorizontal: 16,
          minHeight: 48,
          direction: "ltr",
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderTopWidth: 1,
          borderColor: n.border,
        }}
      >
        <Text
          style={{ color: n.blue, fontFamily: fonts.semiBold, fontSize: 14 }}
        >
          {language === "ar" ? "مطابقة العقار" : "Match property"}
        </Text>
        <Feather
          name={isRTL ? "chevron-left" : "chevron-right"}
          color={n.blue}
          size={18}
        />
      </Pressable>
    </View>
  );
}

export function PropertyCardContent({
  property,
  title,
  area,
  price,
}: {
  property: Property;
  title: string;
  area: string;
  price: string;
}) {
  const { isRTL, fonts, language } = useI18n(),
    colors = useColors();
  const heading = propertyCardHeading(property, title);
  const specifications = propertyCardSpecifications(property, language);
  // Android's paragraph alignment is inherited separately from bidi text shaping.
  const text = {
    direction: "ltr" as const,
    writingDirection: isRTL ? ("rtl" as const) : ("ltr" as const),
    textAlign: isRTL ? ("right" as const) : ("left" as const),
  };
  return (
    <View
      testID="property-card-content"
      style={{ direction: "ltr", gap: colors.spacing }}
    >
      <View style={{ alignSelf: isRTL ? "flex-end" : "flex-start" }}>
        <PropertyStatus property={property} />
      </View>
      <Text
        testID="property-card-title"
        style={[
          text,
          {
            fontFamily: fonts.bold,
            fontSize: 18,
            lineHeight: 27,
            color: colors.cardForeground,
          },
        ]}
      >
        {heading}
      </Text>
      {specifications ? (
        <Text
          testID="property-card-specifications"
          style={[
            text,
            {
              fontFamily: fonts.medium,
              fontSize: 15,
              lineHeight: 23,
              color: colors.foreground,
            },
          ]}
        >
          {specifications}
        </Text>
      ) : null}
      <View
        style={{
          direction: "ltr",
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: colors.spacing,
        }}
      >
        <Feather name="map-pin" size={16} color={colors.mutedForeground} />
        <Text
          testID="property-card-area"
          style={[
            text,
            {
              flex: 1,
              fontFamily: fonts.regular,
              fontSize: 14,
              lineHeight: 21,
              color: colors.mutedForeground,
            },
          ]}
        >
          {area}
        </Text>
      </View>
      <Text
        testID="property-card-price"
        style={[
          text,
          {
            fontFamily: fonts.bold,
            fontSize: 18,
            lineHeight: 27,
            color: colors.primary,
          },
        ]}
      >
        {price}
      </Text>
    </View>
  );
}
