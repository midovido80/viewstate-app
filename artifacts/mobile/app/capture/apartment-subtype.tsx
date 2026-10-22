import React, { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { CaptureHeader } from '@/components/CaptureHeader';
import { ChoiceCard as SelectCard, ChoiceGrid } from '@/components/ChoiceTile';
import { Button } from '@/components/Button';
import type { Transaction } from '@workspace/property-domain';
import { getPropertyFormRoute } from '@/services/propertyFormRoutes';

type ApartmentSubtypeChoice = 'studio' | 'standard';
type OfferMode = 'offered' | 'wanted';

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ApartmentSubtypeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    transaction?: string | string[];
    seekerId?: string | string[];
    linkPersonId?: string | string[];
    sourceRole?: string | string[];
    apartmentSubtype?: string | string[];
  }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { updateDraft, updateCaptureDetails } = useCapture();
  const { t, fonts, isRTL, language } = useI18n();
  const initialSubtype = firstParam(params.apartmentSubtype);
  const [apartmentSubtype, setApartmentSubtype] = useState<ApartmentSubtypeChoice | undefined>(
    initialSubtype === 'studio' || initialSubtype === 'standard' ? initialSubtype : undefined,
  );
  const rawMode = firstParam(params.mode);
  const mode: OfferMode = rawMode === 'wanted' ? 'wanted' : 'offered';
  const rawTransaction = firstParam(params.transaction);
  const transaction: Transaction | undefined = rawTransaction === 'sale' || rawTransaction === 'rent'
    ? rawTransaction
    : undefined;
  const seekerId = firstParam(params.seekerId);
  const linkPersonId = firstParam(params.linkPersonId);
  const sourceRole = firstParam(params.sourceRole);
  const routeParams = {
    mode,
    ...(transaction ? { transaction } : {}),
    ...(seekerId ? { seekerId } : {}),
    ...(linkPersonId ? { linkPersonId } : {}),
    ...(sourceRole ? { sourceRole } : {}),
  };
  const languageLabel = (english: string, arabic: string) => language === 'ar' ? arabic : english;

  const handleBack = () => {
    router.navigate({
      pathname: '/capture/property-type',
      params: {
        ...routeParams,
        propertyType: 'apartment',
        ...(apartmentSubtype ? { apartmentSubtype } : {}),
      },
    } as never);
  };

  const handleNext = () => {
    if (!apartmentSubtype) return;
    const target = getPropertyFormRoute({
      mode,
      ...(transaction ? { transaction } : {}),
      propertyType: 'apartment',
      apartmentSubtype,
      ...(seekerId ? { seekerId } : {}),
      ...(linkPersonId ? { linkPersonId } : {}),
      ...(sourceRole ? { sourceRole } : {}),
    });
    if (target.kind === 'studio' || target.kind === 'wanted') {
      router.push({ pathname: target.pathname, params: target.params } as never);
      return;
    }

    if (!updateDraft({
      propertyType: 'apartment',
      apartmentSubtype: 'standard_apartment',
      ...(transaction ? { transaction } : {}),
    })) return;
    if (!updateCaptureDetails({ apartmentSubtype: 'standard_apartment' })) return;
    router.push({
      pathname: target.pathname,
      params: target.params,
    } as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader step={2} totalSteps={5} onBack={handleBack} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
          {languageLabel('Apartment type', 'نوع الشقة')}
        </Text>
        <ChoiceGrid>
        <SelectCard
          title={languageLabel('Studio apartment', 'شقة استوديو')}
          selected={apartmentSubtype === 'studio'}
          onSelect={() => {
            setApartmentSubtype('studio');
            router.setParams({ apartmentSubtype: 'studio' });
          }}
          testID="select-apartment-studio"
        />
        <SelectCard
          title={languageLabel('Standard apartment', 'شقة عادية')}
          selected={apartmentSubtype === 'standard'}
          onSelect={() => {
            setApartmentSubtype('standard');
            router.setParams({ apartmentSubtype: 'standard' });
          }}
          testID="select-apartment-standard"
        />
        </ChoiceGrid>
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }]}>
        <Button
          title={t('capture.next')}
          onPress={handleNext}
          disabled={!apartmentSubtype}
          size="large"
          testID="btn-next"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  title: { fontSize: 28, marginBottom: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 16 },
});