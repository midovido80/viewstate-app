import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { CaptureHeader } from '@/components/CaptureHeader';
import { SelectCard } from '@/components/SelectCard';
import { Button } from '@/components/Button';
import { APARTMENT_SUBTYPES, PROPERTY_TYPES, type ApartmentSubtype, type Transaction } from '@workspace/property-domain';
import { getPropertyFormRoute } from '@/services/propertyFormRoutes';

type OfferMode = 'offered' | 'wanted';
type ApartmentSubtypeChoice = ApartmentSubtype | 'standard';

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function PropertyTypeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    transaction?: string | string[];
    seekerId?: string | string[];
    linkPersonId?: string | string[];
    sourceRole?: string | string[];
    apartmentSubtype?: string | string[];
    propertyType?: string | string[];
  }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { draft, updateDraft, captureDetails, replaceCaptureDetails } = useCapture();
  const { t, fonts, isRTL } = useI18n();
  const initialType = firstParam(params.propertyType);
  const [propertyType, setPropertyType] = useState<typeof PROPERTY_TYPES[number] | undefined>(
    PROPERTY_TYPES.includes(initialType as typeof PROPERTY_TYPES[number])
      ? initialType as typeof PROPERTY_TYPES[number]
      : firstParam(params.mode) ? undefined : draft.propertyType,
  );
  const rawSubtype = firstParam(params.apartmentSubtype);
  const apartmentSubtype: ApartmentSubtypeChoice | undefined = rawSubtype === 'standard'
    ? 'standard'
    : APARTMENT_SUBTYPES.includes(rawSubtype as ApartmentSubtype)
      ? rawSubtype as ApartmentSubtype
      : undefined;
  const rawMode = firstParam(params.mode);
  const mode: OfferMode | undefined = rawMode === 'wanted'
    ? 'wanted'
    : rawMode === 'offered' || rawMode === undefined ? 'offered' : undefined;
  const rawTransaction = firstParam(params.transaction);
  const transaction: Transaction | undefined = rawTransaction === 'sale' || rawTransaction === 'rent'
    ? rawTransaction
    : rawTransaction === undefined && rawMode === undefined ? draft.transaction : undefined;
  const seekerId = firstParam(params.seekerId);
  const linkPersonId = firstParam(params.linkPersonId);
  const sourceRole = firstParam(params.sourceRole);
  const choosePropertyType = (nextType: typeof PROPERTY_TYPES[number]) => {
    setPropertyType(nextType);
    if (nextType !== 'apartment') {
      router.setParams({ propertyType: nextType, apartmentSubtype: undefined });
    } else {
      router.setParams({ propertyType: nextType });
    }
  };

  const handleNext = () => {
    if (!propertyType || !mode || (rawTransaction !== undefined && !transaction)) return;
    const target = getPropertyFormRoute({
      mode,
      ...(transaction ? { transaction } : {}),
      propertyType,
      ...(apartmentSubtype ? { apartmentSubtype } : {}),
      ...(seekerId ? { seekerId } : {}),
      ...(linkPersonId ? { linkPersonId } : {}),
      ...(sourceRole ? { sourceRole } : {}),
    });
    if (target.kind === 'apartment-subtype' || target.kind === 'studio' || target.kind === 'wanted') {
      router.push({ pathname: target.pathname, params: target.params } as never);
      return;
    }

    if (!updateDraft({
      propertyType,
      apartmentSubtype: propertyType === 'apartment'
        ? apartmentSubtype === 'standard' ? 'standard_apartment' : apartmentSubtype
        : undefined,
      ...(transaction ? { transaction } : {}),
    })) return;
    if (target.kind === 'floor' && draft.propertyType !== propertyType) {
      replaceCaptureDetails({
        ...(captureDetails.areaSquareMeters !== undefined ? { areaSquareMeters: captureDetails.areaSquareMeters } : {}),
        ...(captureDetails.areaUnit ? { areaUnit: captureDetails.areaUnit } : {}),
        ...(captureDetails.nearbyServices ? { nearbyServices: captureDetails.nearbyServices } : {}),
        ...(captureDetails.manualLocationText ? { manualLocationText: captureDetails.manualLocationText } : {}),
        ...(captureDetails.mapsLink ? { mapsLink: captureDetails.mapsLink } : {}),
        ...(captureDetails.coordinates ? { coordinates: captureDetails.coordinates } : {}),
        ...(captureDetails.attachments ? { attachments: captureDetails.attachments } : {}),
      });
    }
    router.push({
      pathname: target.pathname,
      params: target.params,
    } as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader step={2} totalSteps={5} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('propertyType.title')}
        </Text>
        {PROPERTY_TYPES.map(type => (
          <SelectCard
            key={type}
            title={t(`propertyType.${type}` as keyof Translations)}
            selected={propertyType === type}
            onSelect={() => choosePropertyType(type)}
            testID={`select-type-${type}`}
          />
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }]}>
        <Button
          title={t('capture.next')}
          onPress={handleNext}
          disabled={!propertyType || !mode || (rawTransaction !== undefined && !transaction)}
          size="large"
          testID="btn-next"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  title: { fontSize: 28, marginBottom: 32 },
  footer: { paddingHorizontal: 20, paddingTop: 16 },
});