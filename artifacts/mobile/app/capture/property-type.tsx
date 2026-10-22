import React, { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { CaptureHeader } from '@/components/CaptureHeader';
import { ChoiceCard as SelectCard, ChoiceGrid } from '@/components/ChoiceTile';
import { Button } from '@/components/Button';
import { APARTMENT_SUBTYPES, PROPERTY_TYPES, type ApartmentSubtype, type Transaction } from '@workspace/property-domain';
import { getPropertyTypeChoices, canonicalPropertyTypeChoice, restorePropertyTypeChoice, getPropertyTypeChoiceLabel, parseFloorUse, parsePropertySector, togglePropertySector, type PropertySectorFilter, type PropertyTypeChoice } from '@/services/propertySectorSelection';
import { applyFloorTransition, createFloorTransitionProposal, type FloorTransitionProposal } from '@/services/amenityTypeTransitions';
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
    sector?: string | string[];
    floorUse?: string | string[];
    propertyUse?: string | string[];
  }>();
  const colors = useColors();
  const insets = useScreenInsets();
  const { draft, updateDraft, captureDetails, replaceCaptureDetails, updateCaptureDetails, getCurrentCaptureDetails } = useCapture();
  const { t, fonts, isRTL, language } = useI18n();
  const initialType = firstParam(params.propertyType);
  const [propertyType, setPropertyType] = useState<PropertyTypeChoice | undefined>(
    PROPERTY_TYPES.includes(initialType as typeof PROPERTY_TYPES[number])
      ? restorePropertyTypeChoice(initialType as typeof PROPERTY_TYPES[number], firstParam(params.apartmentSubtype), firstParam(params.floorUse) ?? firstParam(params.sector))
      : firstParam(params.mode) ? undefined : restorePropertyTypeChoice(draft.propertyType, draft.apartmentSubtype, captureDetails.floorUse),
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
  const [sector, setSector] = useState<PropertySectorFilter>(parsePropertySector(firstParam(params.sector)));
  const [selectedPropertyUse, setSelectedPropertyUse] = useState(parseFloorUse(firstParam(params.propertyUse)));
  const propertyUse = sector === 'all' ? selectedPropertyUse : sector;
  const otherUseRequired = mode === 'offered' && propertyType === 'other_built_property' && !propertyUse;
  const [floorConfirmation, setFloorConfirmation] = useState<FloorTransitionProposal | null>(null);
  const visibleTypes = getPropertyTypeChoices(sector);
  const selectedCanonical = propertyType ? canonicalPropertyTypeChoice(propertyType) : undefined;
  const isFloor = selectedCanonical?.propertyType === 'floor';
  const floorUse = selectedCanonical?.floorUse;
  const chooseSector = (pressed: PropertySectorFilter) => {
    const next = togglePropertySector(sector, pressed);
    setSector(next);
    setSelectedPropertyUse(undefined);
    const keepType = propertyType && getPropertyTypeChoices(next).includes(propertyType);
    if (!keepType) setPropertyType(undefined);
    router.setParams({ sector: next, floorUse: keepType ? selectedCanonical?.floorUse : undefined, propertyUse: undefined, ...(!keepType ? { propertyType: undefined, apartmentSubtype: undefined } : {}) });
  };
  const choosePropertyType = (nextType: PropertyTypeChoice) => {
    setPropertyType(nextType);
    const canonical = canonicalPropertyTypeChoice(nextType);
    router.setParams({ ...canonical, floorUse: canonical.floorUse, apartmentSubtype: nextType === 'duplex' ? 'duplex' : undefined });
  };

  const finishSelection = () => {
    if (otherUseRequired || !propertyType || !visibleTypes.includes(propertyType) || !mode || (isFloor && !floorUse) || (rawTransaction !== undefined && !transaction)) return;
    const canonical = canonicalPropertyTypeChoice(propertyType);
    const selectedSubtype = propertyType === 'duplex' ? 'duplex' : apartmentSubtype;
    const target = getPropertyFormRoute({
      mode,
      ...(transaction ? { transaction } : {}),
      propertyType: canonical.propertyType,
      ...(selectedSubtype ? { apartmentSubtype: selectedSubtype } : {}),
      ...(isFloor && floorUse ? { floorUse } : {}),
      ...(seekerId ? { seekerId } : {}),
      ...(linkPersonId ? { linkPersonId } : {}),
      ...(sourceRole ? { sourceRole } : {}),
    });
    if (target.kind === 'apartment-subtype' || target.kind === 'studio' || target.kind === 'wanted') {
      router.push({ pathname: target.pathname, params: target.params } as never);
      return;
    }

    if (!updateDraft({
      propertyType: canonical.propertyType,
      apartmentSubtype: canonical.propertyType === 'apartment'
        ? selectedSubtype === 'standard' ? 'standard_apartment' : selectedSubtype
        : undefined,
      ...(transaction ? { transaction } : {}),
    })) return;
    if (target.kind === 'floor' && draft.propertyType !== canonical.propertyType) {
      replaceCaptureDetails({
        ...(floorUse ? { floorUse } : {}),
        ...(captureDetails.areaSquareMeters !== undefined ? { areaSquareMeters: captureDetails.areaSquareMeters } : {}),
        ...(captureDetails.areaUnit ? { areaUnit: captureDetails.areaUnit } : {}),
        ...(captureDetails.nearbyServices ? { nearbyServices: captureDetails.nearbyServices } : {}),
        ...(captureDetails.manualLocationText ? { manualLocationText: captureDetails.manualLocationText } : {}),
        ...(captureDetails.mapsLink ? { mapsLink: captureDetails.mapsLink } : {}),
        ...(captureDetails.coordinates ? { coordinates: captureDetails.coordinates } : {}),
        ...(captureDetails.attachments ? { attachments: captureDetails.attachments } : {}),
      });
    }
    if (mode === 'offered' && propertyType === 'other_built_property' && propertyUse && !updateCaptureDetails({ propertyUse })) return;
    if (propertyType === 'duplex' && !updateCaptureDetails({ apartmentSubtype: 'duplex' })) return;
    if (target.kind === 'floor' && floorUse && !updateCaptureDetails({ floorUse })) return;
    router.push({
      pathname: target.pathname,
      params: target.params,
    } as never);
  };

  const handleNext = () => {
    if (mode === 'offered' && isFloor && floorUse && draft.propertyType === 'floor') {
      const proposal = createFloorTransitionProposal(`property-sector:${draft.propertyCoreId ?? 'new'}`, captureDetails, floorUse);
      if (proposal?.affected.length) { setFloorConfirmation(proposal); return; }
    }
    finishSelection();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader step={2} totalSteps={5} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('propertyType.title')}
        </Text>
        <View style={[styles.sectors, { direction: isRTL ? 'rtl' : 'ltr', flexDirection: 'row' }]}>
          {(['all', 'residential', 'commercial'] as const).map(value => (
            <TouchableOpacity key={value} testID={`property-sector-${value}`} accessibilityRole="button" accessibilityState={{ selected: sector === value }} onPress={() => chooseSector(value)} style={[styles.sector, { backgroundColor: sector === value ? colors.primary : colors.card, borderColor: sector === value ? colors.primary : colors.border }]}>
              <Text style={{ color: sector === value ? colors.primaryForeground : colors.foreground, fontFamily: fonts.semiBold }}>{value === 'all' ? (language === 'ar' ? 'الكل' : 'All') : value === 'residential' ? (language === 'ar' ? 'سكني' : 'Residential') : (language === 'ar' ? 'تجاري' : 'Commercial')}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ChoiceGrid>
        {visibleTypes.map(type => (
          <SelectCard
            key={type}
            title={getPropertyTypeChoiceLabel(type, language, t(`propertyType.${canonicalPropertyTypeChoice(type).propertyType}` as keyof Translations))}
            selected={propertyType === type}
            onSelect={() => choosePropertyType(type)}
            testID={`select-type-${type}`}
          />
        ))}
        </ChoiceGrid>
        {mode === 'offered' && propertyType === 'other_built_property' && sector === 'all' ? (
          <View testID="property-other-use-selection" style={styles.floorChoices}>
            <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{language === 'ar' ? 'استخدام العقار' : 'Property use'}</Text>
            <ChoiceGrid>
            {(['residential', 'commercial'] as const).map(value => (
              <SelectCard key={value} title={value === 'residential' ? (language === 'ar' ? 'سكني' : 'Residential') : (language === 'ar' ? 'تجاري' : 'Commercial')} selected={selectedPropertyUse === value} testID={`select-other-use-${value}`} onSelect={() => { setSelectedPropertyUse(value); router.setParams({ propertyUse: value }); }} />
            ))}
            </ChoiceGrid>
          </View>
        ) : null}

      </ScrollView>
      <Modal visible={floorConfirmation !== null} transparent onRequestClose={() => setFloorConfirmation(null)}>
        <View style={styles.backdrop}><View style={[styles.confirmation, { backgroundColor: colors.card }]}>
          <Text style={{ color: colors.foreground }}>{t('transition.floor.message')}</Text>
          <Button title={language === 'ar' ? 'إلغاء' : 'Cancel'} variant="outline" onPress={() => setFloorConfirmation(null)} testID="sector-floor-transition-cancel" />
          <Button title={language === 'ar' ? 'متابعة' : 'Confirm'} onPress={() => {
            if (!floorConfirmation) return;
            const next = applyFloorTransition(`property-sector:${draft.propertyCoreId ?? 'new'}`, getCurrentCaptureDetails(), floorConfirmation);
            setFloorConfirmation(null);
            if (!next) return;
            if (replaceCaptureDetails(next)) finishSelection();
          }} testID="sector-floor-transition-confirm" />
        </View></View>
      </Modal>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }]}>
        <Button
          title={t('capture.next')}
          onPress={handleNext}
          disabled={!propertyType || !visibleTypes.includes(propertyType) || (isFloor && !floorUse) || !mode || (rawTransaction !== undefined && !transaction) || otherUseRequired}
          size="large"
          testID="btn-next"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectors: { gap: 8, marginBottom: 20 },
  sector: { flex: 1, minWidth: 44, minHeight: 44, borderWidth: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  floorChoices: { marginTop: 12, gap: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  confirmation: { borderRadius: 16, padding: 20, gap: 12 },
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  title: { fontSize: 28, marginBottom: 32 },
  footer: { paddingHorizontal: 20, paddingTop: 16 },
});
