import { View, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { CaptureHeader } from '@/components/CaptureHeader';
import { Button } from '@/components/Button';
import { formatRentalCadence, MARKET_CONFIG } from '@/constants/market';

export default function PriceScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { draft, updateDraft, isReady } = useCapture();
  const { t, isRTL, fonts } = useI18n();
  
  const isSale = draft.transaction === 'sale';
  const amount = isSale
    ? draft.salePrice?.amount?.toString() ?? ''
    : draft.rentalPrice?.amount?.toString() ?? '';
  const numAmount = Number(amount);
  const workingRentalPeriodId = draft.rentalPeriodId
    ?? (draft.rentalPrice === undefined ? MARKET_CONFIG.defaultRentalPeriodId : undefined);
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
        ...(draft.rentalPrice === undefined && draft.rentalPeriodId === undefined
          ? { rentalPeriodId: MARKET_CONFIG.defaultRentalPeriodId }
          : {}),
      });
    }
  };

  const handleNext = () => {
    if (!isReady || !isValid) return;
    
    if (isSale) {
      updateDraft({ 
        salePrice: { amount: numAmount, currencyCode: MARKET_CONFIG.currencyCode },
        rentalPrice: undefined,
        rentalPeriodId: undefined
      });
    } else {
      if (!draft.rentalPeriodId) return;
      updateDraft({ 
        rentalPrice: { amount: numAmount, currencyCode: MARKET_CONFIG.currencyCode },
        rentalPeriodId: draft.rentalPeriodId,
        salePrice: undefined
      });
    }
    router.push('/capture/location' as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader step={3} totalSteps={4} />
      
      <KeyboardAwareScrollViewCompat
        style={styles.container}
        contentContainerStyle={styles.content}
        bottomOffset={100}
      >
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
          {isSale ? t('price.sale.title') : t('price.rent.title')}
        </Text>

        <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
          {isSale
            ? t('price.amount')
            : `${t('price.amount')} · ${formatRentalCadence(workingRentalPeriodId, t)}`}
        </Text>
        <TextInput
          value={amount}
          onChangeText={handleAmountChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            { 
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
              textAlign: isRTL ? 'right' : 'left',
              fontFamily: fonts.semiBold,
              borderRadius: colors.inputRadius,
            }
          ]}
          testID="input-price"
        />
      </KeyboardAwareScrollViewCompat>
      
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button 
          title={t('capture.next')} 
          onPress={handleNext} 
          disabled={!isReady || !isValid}
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
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  }
});
