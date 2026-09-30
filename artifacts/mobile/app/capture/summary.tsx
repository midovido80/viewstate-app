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
import { ModernPropertyForm } from '@/components/ModernPropertyForm';
import {
  applyFloorTransition,
  createFloorTransitionProposal,
  type FloorTransitionProposal,
} from '@/services/amenityTypeTransitions';
import {
  buildPropertyWithCaptureDetails,
  captureDetailsScopeKey,
  hasCaptureEnrichmentValues,
  isBasicApartmentFollowUpCapture,
  shouldSaveBasicCapture,
  type CaptureDetailValues,
} from '@/services/propertyCaptureDetails';
import {
  finalizeCapturedDetails,
  loadPreparedCapturedDetails,
  prepareCapturedDetails,
} from '@/services/propertyCaptureSave';
import type { Property, PropertyDetailField } from '@workspace/property-domain';
import { ensureStudioPropertySourceLink, getStudioPersonSourceRole } from '@/services/studioSave';
import { formatPropertyDetailValue, propertyDetailLabels } from '@/services/propertyDetailPresentation';
import { PROPERTY_FORM_CATALOG } from '@/services/propertyFormCatalog';
import { projectRecordIntent } from '@/services/recordIntentPresentation';
import { getPropertyCardSummary } from '@/services/cardSummaryPresentation';

export default function SummaryScreen() {
  const router = useRouter();
  const { linkPersonId, sourceRole, apartmentSubtype } = useLocalSearchParams<{
    linkPersonId?: string;
    sourceRole?: string;
    apartmentSubtype?: string;
  }>();
  const selectedSourceRole = Array.isArray(sourceRole) ? sourceRole[0] : sourceRole;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    draft,
    draftLoadFailed,
    saveRecoveryStatus,
    projectToProperty,
    savePropertyWithRecovery,
    captureDetails,
    updateCaptureDetails,
    replaceCaptureDetails,
    clearCaptureDetails,
  } = useCapture();
  const { t, isRTL, language, fonts } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [invalidQuickPickFields, setInvalidQuickPickFields] = useState<Set<PropertyDetailField>>(new Set());
  // Studio has its own save workflow. The apartment subtype wizard routes
  // standard apartments through this Summary screen.
  const isBasicApartmentFollowUp = isBasicApartmentFollowUpCapture(
    draft.propertyType,
    apartmentSubtype,
    captureDetails.apartmentSubtype,
  );
  const submitFlight = useRef(new SingleFlight());
  const pendingFloorTransition = useRef<FloorTransitionProposal | null>(null);
  const detailsRef = useRef(captureDetails);
  detailsRef.current = captureDetails;

  const handleDetailChange = (field: PropertyDetailField, value: string) => {
    if (field !== 'floorUse') {
      updateCaptureDetails({ [field]: value });
      return;
    }
    const from = detailsRef.current.floorUse as 'residential' | 'commercial' | undefined;
    if (!from || from === value) {
      updateCaptureDetails({ floorUse: value });
      return;
    }
    const proposal = createFloorTransitionProposal(
      captureDetailsScopeKey(draft.propertyCoreId),
      detailsRef.current,
      value as 'residential' | 'commercial',
    );
    if (!proposal || proposal.affected.length === 0) {
      updateCaptureDetails({ floorUse: value });
      return;
    }
    pendingFloorTransition.current = proposal;
    const affectedDetails = proposal.affected.map(item => {
      const rawValue = item.value === 'true'
        ? true
        : item.value === 'false'
          ? false
          : item.value;
      return `${propertyDetailLabels[item.field][language === 'ar' ? 1 : 0]}: ${
         formatPropertyDetailValue(item.field, rawValue, language, key => t(key as keyof Translations))
      }`;
    }).join('\n');
    Alert.alert(
      t('transition.floor.title'),
      `${t('transition.floor.message')}\n\n${affectedDetails}\n\n${t('transition.draft_only')}`,
      [
        { text: t('capture.cancel'), style: 'cancel', onPress: () => { pendingFloorTransition.current = null; } },
        {
          text: t('transition.remove_confirm'),
          style: 'destructive',
          onPress: () => {
            if (pendingFloorTransition.current !== proposal) return;
            const next = applyFloorTransition(
              captureDetailsScopeKey(draft.propertyCoreId),
              detailsRef.current,
              proposal,
            );
            pendingFloorTransition.current = null;
            if (next) replaceCaptureDetails(next);
          },
        },
      ],
      { cancelable: true, onDismiss: () => { pendingFloorTransition.current = null; } },
    );
  };
  
  const handleFinish = async (includeCapturedDetails = false) => {
    await submitFlight.current.run(async () => {
      setSubmitting(true);
      try {
        if (draftLoadFailed) {
          Alert.alert(t('errors.draft_read_title'), t('errors.draft_read'));
          return;
        }

        if (
          isBasicApartmentFollowUp
          && !includeCapturedDetails
          && hasCaptureEnrichmentValues(captureDetails, draft.description?.value)
        ) {
          Alert.alert(
            language === 'ar' ? 'توجد تفاصيل محفوظة في المسودة' : 'This draft has saved details',
            language === 'ar'
              ? 'تحتوي هذه المسودة على مواصفات أو موقع دقيق أو مرفقات. تم إيقاف الحفظ الأساسي لحمايتها. احفظ التفاصيل مع العقار الآن أو ألغِ للاحتفاظ بالمسودة.'
              : 'This draft contains specifications, precise location, or attachments. BASIC save is paused to protect them. Save the details with the property now, or cancel to keep the draft.',
            [
              { text: language === 'ar' ? 'الاحتفاظ بالمسودة' : 'Keep draft', style: 'cancel' },
              {
                text: language === 'ar' ? 'حفظ التفاصيل الآن' : 'Save details now',
                onPress: () => { void handleFinish(true); },
              },
            ],
          );
          return;
        }

        const saveBasicOnly = shouldSaveBasicCapture(
          captureDetails,
          draft.description?.value,
          isBasicApartmentFollowUp,
          includeCapturedDetails,
        );
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
        if (!saveBasicOnly && invalidQuickPickFields.size > 0) {
          Alert.alert(t('errors.validation_title'), t('errors.capture_incomplete'));
          return;
        }
        let candidate: Property | undefined;
        try {
          candidate = (!saveBasicOnly || !isBasicApartmentFollowUp) && projection && projection.ok
            ? buildPropertyWithCaptureDetails(projection.property, captureDetails, true)
            : undefined;
        } catch (error) {
          const message = error instanceof Error && error.message === 'FLOOR_USE_REQUIRED'
            ? (language === 'ar'
              ? 'اختر الاستخدام السكني أو التجاري للدور قبل حفظ تفاصيله.'
              : 'Choose Residential or Commercial Floor use before saving Floor details.')
            : error instanceof Error && error.message === 'FLOOR_CAPTURE_DETAIL_INCOMPATIBLE'
              ? (language === 'ar'
                ? 'بعض تفاصيل الدور لا تتوافق مع الاستخدام المحدد. صحح التفاصيل ثم أعد المحاولة.'
                : 'Some Floor details do not match the selected use. Correct them before saving.')
              : t('errors.capture_incomplete');
          Alert.alert(t('errors.validation_title'), message);
          return;
        }

        // Resolve the exact role before saving: Person-origin Offered capture
        // must not create an unowned Property if its source context is stale.
        let resolvedSourceRole: ReturnType<typeof getStudioPersonSourceRole> = null;
        if (linkPersonId) {
          try {
            const linkedPerson = await store.getPerson(linkPersonId);
            if (!linkedPerson) {
              Alert.alert(t('errors.storage_title'), t('people.link_failed_message'));
              return;
            }
            resolvedSourceRole = getStudioPersonSourceRole(linkedPerson, selectedSourceRole);
          } catch {
            Alert.alert(t('errors.storage_title'), t('people.link_failed_message'));
            return;
          }
          if (!resolvedSourceRole) {
            Alert.alert(t('errors.storage_title'), t('people.link_failed_message'));
            return;
          }
        }

        const recoveryPropertyCoreId = draft.propertyCoreId;
        let preparedDetails = null;
        if (candidate && projection?.ok) {
          try {
            preparedDetails = await prepareCapturedDetails(projection.property, candidate);
          } catch (error) {
            console.error('Captured detail preparation failed:', error);
            Alert.alert(t('errors.storage_title'), t('errors.storage_save'));
            return;
          }
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

        if (result.status === 'complete') {
          try {
            const evidence = preparedDetails
              ?? (recoveryPropertyCoreId
                ? await loadPreparedCapturedDetails(recoveryPropertyCoreId)
                : null);
            if (evidence) {
              await finalizeCapturedDetails(store, evidence);
            }
            const detailsCleared = await clearCaptureDetails(recoveryPropertyCoreId);
            if (!detailsCleared && Object.keys(captureDetails).length > 0) {
              throw new Error('CAPTURE_DETAILS_CLEANUP_FAILED');
            }
          } catch (error) {
            console.error('Captured detail save failed:', error);
            Alert.alert(t('errors.storage_title'), t('errors.storage_save'));
            router.replace(`/property/${encodeURIComponent(recoveryPropertyCoreId ?? '')}/enrich` as never);
            return;
          }
        }

        const savedId = projection && projection.ok ? projection.property.core.id : draft.propertyCoreId;
        if (linkPersonId && savedId) {
          try {
            if (!resolvedSourceRole) throw new Error('SOURCE_ROLE_MISMATCH');
            await ensureStudioPropertySourceLink(savedId, linkPersonId, resolvedSourceRole, store);
          } catch {
            Alert.alert(t('people.link_failed'), t('people.link_failed_message'));
            return;
          }
        }
        router.replace({
          pathname: '/capture/success',
          params: savedId ? {
            propertyCoreId: savedId,
            ...(saveBasicOnly ? { basicCaptureFollowUp: '1' } : {}),
            ...(linkPersonId ? { linkPersonId } : {}),
            ...(selectedSourceRole ? { sourceRole: selectedSourceRole } : {}),
          } : {},
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
  const previewProperty = (() => {
    if (!draft.propertyType) return null;
    const preview = projectToProperty();
    if (!preview.ok) return null;
    try {
      return buildPropertyWithCaptureDetails(preview.property, captureDetails, false);
    } catch {
      return null;
    }
  })();
  const previewDetails = (previewProperty?.typeDetails ?? {}) as unknown as Record<string, unknown>;
  const previewSubtypeLabel = previewProperty
    ? getPropertyCardSummary(previewProperty, {
      language,
      translate: key => t(key as keyof Translations),
      formatPrice: (amount, currencyCode) => formatPrice(amount, currencyCode, language),
      formatRentalPrice: (amount, currencyCode, period) =>
        formatRentalPrice(amount, currencyCode, period, language, key => t(key as keyof Translations)),
    }).subtypeLabel
    : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader title={t('summary.title')} step={5} totalSteps={5} />
      
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('summary.details')}
          </Text>
        </View>
        
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]}>
          <SummaryRow
            label={t('summary.transaction')}
            value={projectRecordIntent('offered', draft.transaction, language).label}
          />
          {!isBasicApartmentFollowUp ? PROPERTY_FORM_CATALOG.map(({ field }) => [field, previewDetails[field]] as const)
            .filter(([, value]) => value !== undefined && value !== '')
            .map(([field, value]) => (
              <SummaryRow
                key={field}
                label={propertyDetailLabels[field as PropertyDetailField]?.[language === 'ar' ? 1 : 0] ?? field}
                value={formatPropertyDetailValue(
                  field as PropertyDetailField,
                  typeof value === 'object' && value && 'value' in value
                    ? String((value as { value: unknown }).value)
                    : String(value),
                  language,
                  key => t(key as keyof Translations),
                )}
              />
            )) : null}
          <SummaryRow 
            label={t('summary.property_type')}
            value={draft.propertyType ? t(`propertyType.${draft.propertyType}` as keyof Translations) : ''} 
          />
          {previewSubtypeLabel ? (
            <SummaryRow
              label={t('studio.apartment_subtype')}
              value={previewSubtypeLabel}
            />
          ) : null}
          
          {draft.transaction === 'sale' && draft.salePrice && (
            <SummaryRow 
              label={t('summary.sale_price')}
              value={formatPrice(draft.salePrice.amount, draft.salePrice.currencyCode, language)}
            />
          )}
          
          {draft.transaction === 'rent' && draft.rentalPrice && (
            <SummaryRow 
              label={t('summary.rent_price')}
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
            label={t('summary.location')}
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
          onPress={() => { void handleFinish(); }}
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
  detailsCard: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 16,
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
