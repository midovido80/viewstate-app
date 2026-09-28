import { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { CaptureHeader } from '@/components/CaptureHeader';
import { SelectCard } from '@/components/SelectCard';
import { Button } from '@/components/Button';
import { Transaction } from '@workspace/property-domain';
import { getPropertyTypeSelectionRoute } from '@/services/propertyFormRoutes';

type OfferMode = 'offered' | 'wanted';

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function TransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    transaction?: string | string[];
    seekerId?: string | string[];
    linkPersonId?: string | string[];
    sourceRole?: string | string[];
  }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { draft } = useCapture();
  const { t, fonts, isRTL, language } = useI18n();
  const initialMode = firstParam(params.mode);
  const initialTransaction = firstParam(params.transaction);
  const [offerMode, setOfferMode] = useState<OfferMode | undefined>(
    initialMode === 'wanted' || initialMode === 'offered' ? initialMode : undefined,
  );
  const [transaction, setTransaction] = useState<Transaction | undefined>(
    initialTransaction === 'sale' || initialTransaction === 'rent'
      ? initialTransaction
      : undefined,
  );

  const handleNext = () => {
    if (!offerMode || !transaction) return;
    router.push(getPropertyTypeSelectionRoute({
      mode: offerMode,
      transaction,
      ...(firstParam(params.seekerId) ? { seekerId: firstParam(params.seekerId) } : {}),
      ...(firstParam(params.linkPersonId) ? { linkPersonId: firstParam(params.linkPersonId) } : {}),
      ...(firstParam(params.sourceRole) ? { sourceRole: firstParam(params.sourceRole) } : {}),
    }) as never);
  };

  const label = (english: string, arabic: string) => language === 'ar' ? arabic : english;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader step={1} totalSteps={5} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('transaction.title')}
        </Text>
        <Text style={[styles.groupTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
          {label('Offered or Wanted', 'معروض أم مطلوب')}
        </Text>
        <SelectCard
          title={label('Offered', 'معروض')}
          icon="home"
          selected={offerMode === 'offered'}
          onSelect={() => {
            setOfferMode('offered');
            router.setParams({ mode: 'offered' });
          }}
          testID="select-offered"
        />
        <SelectCard
          title={label('Wanted', 'مطلوب')}
          icon="search"
          selected={offerMode === 'wanted'}
          onSelect={() => {
            setOfferMode('wanted');
            router.setParams({ mode: 'wanted' });
          }}
          testID="select-wanted"
        />

        <Text style={[styles.groupTitle, styles.transactionHeading, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
          {label('Sale or Rent', 'بيع أم إيجار')}
        </Text>
        <SelectCard
          title={offerMode === 'wanted'
            ? label('Wanted Purchase', 'مطلوب للشراء')
            : label('Offered Sale', 'معروض للبيع')}
          icon="tag"
          selected={transaction === 'sale'}
          onSelect={() => {
            setTransaction('sale');
            router.setParams({ transaction: 'sale' });
          }}
          testID="select-sale"
        />
        <SelectCard
          title={offerMode === 'wanted'
            ? label('Wanted Rent', 'مطلوب للإيجار')
            : label('Offered Rent', 'معروض للإيجار')}
          icon="key"
          selected={transaction === 'rent'}
          onSelect={() => {
            setTransaction('rent');
            router.setParams({ transaction: 'rent' });
          }}
          testID="select-rent"
        />
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), borderTopColor: colors.border }]}>
        <Button
          title={t('capture.next')}
          onPress={handleNext}
          disabled={!offerMode || !transaction}
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
  groupTitle: { fontSize: 17, marginBottom: 8 },
  transactionHeading: { marginTop: 16 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    backgroundColor: 'transparent',
  },
});