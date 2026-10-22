import { KuwaitAreaSelector } from '@/components/KuwaitAreaSelector';
import { PropertyFormCard, PropertyAreaBlockRow, propertyFormInputStyle } from '@/components/PropertyFormCard';
import { useState } from 'react';
import { isMissingPositiveAmount } from '@/services/screenInsets';
import { View, StyleSheet, Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { ChoiceTile as ChoiceChip, ChoiceGrid } from '@/components/ChoiceTile';
import { CaptureHeader } from '@/components/CaptureHeader';
import { Button } from '@/components/Button';
import { formatRentalCadence, MARKET_CONFIG } from '@/constants/market';

export default function PriceScreen() {
  const router = useRouter();
  const { linkPersonId, sourceRole, apartmentSubtype } = useLocalSearchParams<{
    linkPersonId?: string;
    sourceRole?: string;
    apartmentSubtype?: string;
  }>();
  const colors = useColors();
  const insets = useScreenInsets();
  const { draft, updateDraft, isReady } = useCapture();
  const { t, isRTL, fonts, language } = useI18n();
  
  const isSale = draft.transaction === 'sale';
  const amount = isSale
    ? draft.salePrice?.amount?.toString() ?? ''
    : draft.rentalPrice?.amount?.toString() ?? '';
  const [priceAttempted, setPriceAttempted] = useState(false);
  const priceError = priceAttempted && isMissingPositiveAmount(amount);
  const areaError = priceAttempted && !draft.locationAreaId;
  const numAmount = Number(amount);
  const workingRentalPeriodId = draft.rentalPeriodId
    ?? (draft.transaction === 'rent' ? MARKET_CONFIG.defaultRentalPeriodId : undefined);
  const isValid = !isNaN(numAmount)
    && numAmount > 0
    && (isSale || workingRentalPeriodId !== undefined);

  const handleAmountChange = (value: string) => {
    const parsed = Number(value);
    const price = value.length > 0 && Number.isFinite(parsed)
      ? { amount: parsed, currencyCode: MARKET_CONFIG.currencyCode }
      : undefined;

    if (isSale) {
      updateDraft({ salePrice: price });
    } else {
      updateDraft({
        rentalPrice: price,
        ...(draft.rentalPeriodId === undefined
          ? { rentalPeriodId: MARKET_CONFIG.defaultRentalPeriodId }
          : {}),
      });
    }
  };

  const handleNext = () => {
    setPriceAttempted(true);
    if (!isReady || !isValid || !draft.locationAreaId) return;
    
    if (isSale) {
      updateDraft({ 
        salePrice: { amount: numAmount, currencyCode: MARKET_CONFIG.currencyCode },
        rentalPrice: undefined,
        rentalPeriodId: undefined
      });
    } else {
      if (!workingRentalPeriodId) return;
      updateDraft({ 
        rentalPrice: { amount: numAmount, currencyCode: MARKET_CONFIG.currencyCode },
        rentalPeriodId: workingRentalPeriodId,
        salePrice: undefined
      });
    }
    router.push({
      pathname: '/capture/summary',
      params: {
        ...(linkPersonId ? { linkPersonId } : {}),
        ...(sourceRole ? { sourceRole } : {}),
        ...(apartmentSubtype ? { apartmentSubtype } : {}),
      },
    } as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader step={3} totalSteps={4} />
      
      <KeyboardAwareScrollViewCompat
        style={styles.container}
        contentContainerStyle={styles.content}
        bottomOffset={100}
        keyboardShouldPersistTaps="handled"
      >
        <PropertyFormCard title={t('capture.progress.basics')} icon="map-pin">
          <PropertyAreaBlockRow area={<>
            <Text style={{ color: areaError ? colors.destructive : '#173F78', fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{t('location.areaId')}</Text>
            <KuwaitAreaSelector selectedIds={draft.locationAreaId ? [draft.locationAreaId] : []} multiSelect={false} onChange={ids => updateDraft({ locationAreaId: ids[0] })} testID="basic-capture-area" />
            {areaError ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{language === 'ar' ? 'اختر المنطقة للمتابعة.' : 'Select an area to continue.'}</Text> : null}
          </>} block={<>
            <Text style={{ color: '#173F78', fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{language === 'ar' ? 'القطعة' : 'Block'}</Text>
            <TextInput value={draft.block ?? ''} onChangeText={block => updateDraft({ block: block || undefined })} keyboardType="number-pad" testID="basic-capture-block" style={[propertyFormInputStyle, { textAlign: isRTL ? 'right' : 'left', fontFamily: fonts.semiBold }]} />
          </>} />


        <Text style={[styles.label, { color: priceError ? colors.destructive : colors.mutedForeground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
          {isSale
            ? t('price.amount')
            : `${t('price.amount')} · ${formatRentalCadence(workingRentalPeriodId, t)}`}
        </Text>
        <TextInput
          value={amount}
          onBlur={() => setPriceAttempted(true)}
          onChangeText={handleAmountChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            propertyFormInputStyle,
            { 
              backgroundColor: colors.card,
              borderColor: priceError ? colors.destructive : colors.border,
              color: colors.foreground,
              textAlign: isRTL ? 'right' : 'left',
              fontFamily: fonts.semiBold,
              borderRadius: colors.inputRadius,
              marginBottom: 16,
            }
          ]}
          testID="input-price"
        />

        {priceError ? <Text accessibilityRole="alert" testID="price-required-error" style={{ color: colors.destructive, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left', marginBottom: 12 }}>{t('errors.invalid_price')}</Text> : null}

        {!isSale ? (
          <ChoiceGrid style={styles.choicesWrap}>
            {(['monthly', 'yearly'] as const).map(period => (
              <ChoiceChip
                key={period}
                label={t(`price.cadence.choice.${period}`)}
                selected={workingRentalPeriodId === period}
                onPress={() => updateDraft({ rentalPeriodId: period })}
                testID={`price-period-${period}`}
                role="radio"
              />
            ))}
          </ChoiceGrid>
        ) : null}
        </PropertyFormCard>
      </KeyboardAwareScrollViewCompat>
      
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button 
          title={t('capture.next')} 
          onPress={handleNext} 
          disabled={!isReady}
          size="large"
          testID="btn-next"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 28,
    marginBottom: 32,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    height: 56,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 18,
  },
  confirmation: {
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderRadius: 10,
    gap: 12,
  },
  choicesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  }
});
