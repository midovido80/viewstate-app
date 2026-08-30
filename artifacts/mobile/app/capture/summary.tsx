import { useRef, useState } from 'react';
import { View, StyleSheet, Text, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { CaptureHeader } from '@/components/CaptureHeader';
import { Button } from '@/components/Button';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { SingleFlight } from '@/services/serialTaskQueue';
import { store } from '@/services/persistence';

export default function SummaryScreen() {
  const router = useRouter();
  const { linkPersonId } = useLocalSearchParams<{ linkPersonId?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    draft,
    draftLoadFailed,
    saveRecoveryStatus,
    projectToProperty,
    savePropertyWithRecovery,
  } = useCapture();
  const { t, isRTL, language, fonts } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const submitFlight = useRef(new SingleFlight());
  
  const handleFinish = async () => {
    await submitFlight.current.run(async () => {
      setSubmitting(true);
      try {
        if (draftLoadFailed) {
          Alert.alert(t('errors.draft_read_title'), t('errors.draft_read'));
          return;
        }

        const hasPendingRecovery = saveRecoveryStatus === 'retry_required'
          || saveRecoveryStatus === 'cleanup_pending';
        const projection = hasPendingRecovery ? null : projectToProperty();
        if (projection && !projection.ok) {
          const hasInvalidPrice = projection.issues.some(issue => issue.code === 'invalid_price');
          Alert.alert(
            t('errors.validation_title'),
            t(hasInvalidPrice ? 'errors.invalid_price' : 'errors.capture_incomplete'),
          );
          return;
        }

        const result = await savePropertyWithRecovery(
          projection && projection.ok ? projection.property : undefined,
        );

        if (result.status === 'save_failed') {
          console.error('Property save failed:', result.error);
          Alert.alert(t('errors.storage_title'), t('errors.storage_save'));
          return;
        }

        if (result.status === 'cleanup_failed') {
          console.error('Post-save draft cleanup failed:', result.error);
          Alert.alert(t('errors.cleanup_title'), t('errors.cleanup_after_save'));
          return;
        }

        if (result.status === 'retry_required') {
          Alert.alert(t('errors.recovery_retry_title'), t('errors.recovery_retry'));
          return;
        }

        if (result.status === 'conflict' || result.status === 'unresolved_draft') {
          Alert.alert(t('errors.recovery_conflict_title'), t('errors.recovery_conflict'));
          return;
        }

        const savedId = projection && projection.ok ? projection.property.core.id : draft.propertyCoreId;
        if (linkPersonId && savedId) {
          try {
            await store.linkPersonToProperty({ personId: linkPersonId, propertyCoreId: savedId });
          } catch {
            Alert.alert(t('people.link_failed'), t('people.link_failed_message'));
            return;
          }
        }
        router.replace({
          pathname: '/capture/success',
          params: savedId ? { propertyCoreId: savedId, ...(linkPersonId ? { linkPersonId } : {}) } : {},
        } as never);
      } finally {
        setSubmitting(false);
      }
    });
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
      <CaptureHeader title={t('summary.title')} step={5} totalSteps={5} />
      
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
              value={formatRentalPrice(
                draft.rentalPrice.amount,
                draft.rentalPrice.currencyCode,
                draft.rentalPeriodId,
                language,
                t,
              )}
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
          title={t(
            saveRecoveryStatus === 'cleanup_pending'
              ? 'summary.retry_cleanup'
              : saveRecoveryStatus === 'retry_required'
                ? 'summary.retry_save'
                : 'summary.submit'
          )}
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
