import { useState } from 'react';
import { View, StyleSheet, Text, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { CaptureHeader } from '@/components/CaptureHeader';
import { Button } from '@/components/Button';
import { store } from '@/services/persistence';

import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice } from '@/constants/market';

export default function SummaryScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { draft, projectToProperty, resetDraft } = useCapture();
  const { t, isRTL, language, fonts } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  
  const handleFinish = async () => {
    setSubmitting(true);
    try {
      const projection = projectToProperty();
      if (!projection.ok) {
        Alert.alert(t('errors.required'), projection.issues.map(i => i.message).join('\n'));
        setSubmitting(false);
        return;
      }

      await store.saveProperty(projection.property);
      await resetDraft();
      
      router.replace('/capture/success' as never);
    } catch (e) {
      console.error(e);
      Alert.alert(t('errors.required'), t('errors.required'));
      setSubmitting(false);
    }
  };

  const area = draft.locationAreaId ? getAreaById(draft.locationAreaId) : null;
  const areaDisplay = area
    ? (language === 'ar' ? area.ar : area.en)
    : (draft.locationAreaId || '');

  const SummaryRow = ({ label, value }: { label: string, value: string }) => (
    <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'left' : 'right' }]}>{value}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader title={t('summary.title')} />
      
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]}>
          <SummaryRow 
            label={t('transaction.title')} 
            value={draft.transaction ? t(`transaction.${draft.transaction}` as keyof Translations) : ''} 
          />
          <SummaryRow 
            label={t('propertyType.title')} 
            value={draft.propertyType ? t(`propertyType.${draft.propertyType}` as keyof Translations) : ''} 
          />
          
          {draft.transaction === 'sale' && draft.salePrice && (
            <SummaryRow 
              label={t('price.sale.title')} 
              value={formatPrice(draft.salePrice.amount, draft.salePrice.currencyCode, language)}
            />
          )}
          
          {draft.transaction === 'rent' && draft.rentalPrice && (
            <SummaryRow 
              label={t('price.rent.title')} 
              value={formatPrice(draft.rentalPrice.amount, draft.rentalPrice.currencyCode, language)}
            />
          )}

          <SummaryRow 
            label={t('location.title')} 
            value={areaDisplay}
          />
        </View>

      </ScrollView>
      
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button 
          title={t('summary.submit')} 
          onPress={handleFinish} 
          loading={submitting}
          size="large"
          testID="btn-submit"
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
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  rowLabel: {
    fontSize: 14,
    flex: 1,
  },
  rowValue: {
    fontSize: 14,
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  }
});
