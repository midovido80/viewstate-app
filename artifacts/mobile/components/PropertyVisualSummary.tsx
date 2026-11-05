import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Property } from '@workspace/property-domain';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import {
  propertyVisualFacts,
  propertyOfferStatus,
} from '@/services/propertyVisualPresentation';
import { PropertySpecIcon } from '@/components/PropertySpecIcon';
import { PropertyCover } from '@/components/PropertyCover';
export function PropertyStatus({ property }: { property: Property }) {
  const { language, fonts } = useI18n(),
    s = propertyOfferStatus(property, language);
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        borderRadius: 6,
        backgroundColor: s.background,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontFamily: fonts.medium, color: s.color, fontSize: 12 }}>
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
        flexDirection: isRTL ? 'row-reverse' : 'row',
        gap: compact ? 6 : 0,
        backgroundColor: compact ? 'transparent' : colors.card,
        borderRadius: 12,
        paddingVertical: compact ? 2 : 12,
      }}
    >
      {facts.map((f) => (
        <View
          key={f.id}
          style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}
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
              textAlign: 'center',
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
                textAlign: 'center',
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
  testID,
}: {
  property: Property;
  title: string;
  area: string;
  price: string;
  onPress: () => void;
  testID: string;
}) {
  const { isRTL, fonts } = useI18n(),
    colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${area}, ${price}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        direction: 'ltr',
        minHeight: 158,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: colors.card,
      }}
    >
      <PropertyCover
        property={property}
        label={title}
        style={{ width: 108, minHeight: 158, borderRadius: 0 }}
      />
      <View style={{ flex: 1, minWidth: 0, padding: 10, gap: 6 }}>
        <Text
          style={{
            fontFamily: fonts.bold,
            color: colors.foreground,
            fontSize: 15,
            lineHeight: 21,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {property.listingTitle?.trim() || title}
        </Text>
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Feather name="map-pin" size={13} color={colors.mutedForeground} />
          <Text
            style={{
              fontFamily: fonts.regular,
              color: colors.mutedForeground,
              fontSize: 12,
              textAlign: isRTL ? 'right' : 'left',
              flex: 1,
            }}
          >
            {area}
          </Text>
        </View>
        <PropertyFactStrip property={property} compact />
        <Text
          style={{
            fontFamily: fonts.bold,
            color: colors.primary,
            fontSize: 16,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {price}
        </Text>
        <PropertyStatus property={property} />
      </View>
    </Pressable>
  );
}
