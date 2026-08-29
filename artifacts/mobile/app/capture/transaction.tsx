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

export default function TransactionScreen() {
  const router = useRouter();
  const { linkPersonId } = useLocalSearchParams<{ linkPersonId?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { draft, updateDraft } = useCapture();
  const { t, fonts, isRTL } = useI18n();

  const handleNext = () => {
    if (draft.transaction) {
      router.push({ pathname: '/capture/property-type', params: linkPersonId ? { linkPersonId } : {} } as never);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader step={1} totalSteps={4} />
      
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('transaction.title')}</Text>
        
        <SelectCard 
          title={t('transaction.sale')}
          icon="tag"
          selected={draft.transaction === 'sale'}
          onSelect={() => updateDraft({ transaction: 'sale' as Transaction })}
          testID="select-sale"
        />
        
        <SelectCard 
          title={t('transaction.rent')}
          icon="key"
          selected={draft.transaction === 'rent'}
          onSelect={() => updateDraft({ transaction: 'rent' as Transaction })}
          testID="select-rent"
        />
      </View>
      
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), borderTopColor: colors.border }]}>
        <Button 
          title={t('capture.next')} 
          onPress={handleNext} 
          disabled={!draft.transaction}
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
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 28,
    marginBottom: 32,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    backgroundColor: 'transparent',
  }
});
