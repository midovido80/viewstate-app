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
import { nextDesign as n } from '@/constants/nextDesign';
import { useRouter } from 'expo-router';
import { matchingTarget } from '@/services/matchingScope';
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
        flexWrap: compact ? 'nowrap' : 'wrap',
        borderWidth: compact ? 0 : 1,
        borderColor: n.border,
        overflow: 'hidden',
        backgroundColor: compact ? 'transparent' : colors.card,
        borderRadius: 12,
        paddingVertical: compact ? 2 : 12,
      }}
    >
      {facts.map((f) => (
        <View
          key={f.id}
          style={{ flex: compact ? 1 : undefined, width: compact ? undefined : '33.333%', minWidth: 0, minHeight: compact ? undefined : 90, padding: compact ? 0 : 10, borderWidth: compact ? 0 : 0.5, borderColor: n.border, alignItems: 'center', justifyContent: 'center', gap: 4 }}
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
  const { isRTL, fonts, language } = useI18n(), colors = useColors(), router = useRouter();
  return <View style={{ backgroundColor: n.white, borderRadius: 16, overflow: 'hidden' }}>
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${title}, ${area}, ${price}`}
      onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? .85 : 1 })}>
      <View style={{ height: 184 }}>
        <PropertyCover property={property} label={title} style={{ height: 184, width: '100%' }} />
        <View style={{ position: 'absolute', top: 12, right: isRTL ? 12 : undefined, left: isRTL ? undefined : 12 }}><PropertyStatus property={property} /></View>
      </View>
      <View style={{ padding: 16, gap: 9 }}>
        <Text style={{ fontFamily: fonts.regular, color: n.muted, fontSize: 12, textAlign: isRTL ? 'right' : 'left' }}>{title}</Text>
        <Text style={{ fontFamily: fonts.bold, color: n.ink, fontSize: 19, lineHeight: 27, textAlign: isRTL ? 'right' : 'left' }}>{property.listingTitle?.trim() || title}</Text>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 5 }}>
          <Feather name="map-pin" size={14} color={n.muted} /><Text style={{ flex: 1, color: n.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: isRTL ? 'right' : 'left' }}>{area}</Text>
        </View>
        <Text style={{ fontFamily: fonts.bold, color: colors.primary, fontSize: 21, textAlign: isRTL ? 'right' : 'left' }}>{price}</Text>
        <PropertyFactStrip property={property} compact />
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" testID={`${testID}-match`} onPress={() => router.push(matchingTarget({ kind: 'property', id: property.core.id }) as never)}
      style={{ paddingHorizontal: 16, minHeight: 48, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: n.border }}>
      <Text style={{ color: n.blue, fontFamily: fonts.semiBold, fontSize: 14 }}>{language === 'ar' ? 'طلبات مناسبة لهذا العقار' : 'Matching requests for this property'}</Text><Feather name={isRTL ? 'chevron-left' : 'chevron-right'} color={n.blue} size={18} />
    </Pressable>
  </View>;
}
