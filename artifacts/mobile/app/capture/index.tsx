import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/Button';
import {
  getApplicablePropertyFormFields,
  PROPERTY_FORM_TYPES,
} from '@/services/propertyFormCatalog';
import { PropertyEnrichmentFields, propertyDetailLabels, formatPropertyDetailValue } from '@/components/PropertyEnrichmentFields';
import {
  applyFloorTransition,
  createFloorTransitionProposal,
  type FloorTransitionProposal,
} from '@/services/amenityTypeTransitions';
import {
  buildPropertyWithCaptureDetails,
  captureDetailsScopeKey,
  type CaptureDetailValues,
} from '@/services/propertyCaptureDetails';
import {
  finalizeCapturedDetails,
  prepareCapturedDetails,
} from '@/services/propertyCaptureSave';
import { store } from '@/services/persistence';
import { getAreaById, getAreasByGovernorate, getSelectableKuwaitAreas, KUWAIT_GOVERNORATES, searchAreasSorted } from '@/constants/kuwait-areas';
import type { Transaction } from '@workspace/property-domain';
import type { PropertyCaptureCategoryId, PropertyDemoCaptureMetadata } from '@workspace/property-domain';
import { PROPERTY_DEMO_CATALOG, getDemoCategory, DEMO_NEARBY_SERVICES, parseDemoNumericInput, hasPopulatedCategoryCapture, createDemoCategoryTransitionProposal, applyDemoCategoryTransition, createDemoTransactionTransitionProposal, applyDemoTransactionTransition } from '@/services/propertyDemoCatalog';

export default function CaptureWorkflow() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { t, isRTL, fonts, language } = useI18n();
  const {
    draft,
    captureDetails,
    updateDraft,
    updateCaptureDetails,
    replaceCaptureDetails,
    projectToProperty,
    savePropertyWithRecovery,
    clearCaptureDetails,
    persistCurrentCapture,
    getCurrentCaptureDetails,
    getCurrentDraft,
  } = useCapture();
  const [stage, setStage] = useState<1 | 2 | 3>(draft.propertyType && draft.transaction ? 2 : 1);
  const [nearby, setNearby] = useState<string[]>(() => {
    try {
      return captureDetails.nearbyServices ? JSON.parse(captureDetails.nearbyServices) as string[] : [];
    } catch {
      return [];
    }
  });
  const [description, setDescription] = useState(draft.description?.value ?? '');
  const [block, setBlock] = useState(draft.block ?? '');
  const [areaSearch, setAreaSearch] = useState('');
  const [areaSelectorOpen, setAreaSelectorOpen] = useState(false);
  const [expandedGovernorates, setExpandedGovernorates] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveFlight = useRef(false);
  const [pendingFloorTransition, setPendingFloorTransition] = useState<FloorTransitionProposal | null>(null);
  const [quickErrors, setQuickErrors] = useState<Record<string, string>>({});
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const demoMetadata = captureDetails.demoMetadata;
  const demoCategory = getDemoCategory(demoMetadata?.categoryId);

  const scopeKey = captureDetailsScopeKey(draft.propertyCoreId);
  const applicable = useMemo(
    () => draft.propertyType
      ? getApplicablePropertyFormFields(draft.propertyType, captureDetails.floorUse as 'residential' | 'commercial' | undefined)
      : [],
    [captureDetails.floorUse, draft.propertyType],
  );
  const selectedArea = draft.locationAreaId ? getAreaById(draft.locationAreaId) : undefined;
  const areaResults = searchAreasSorted(areaSearch, language === 'ar' ? 'ar' : 'en', getSelectableKuwaitAreas());
  useEffect(() => {
    if (
      captureDetails.areaSquareMeters === undefined
      && demoMetadata?.areaSquareMeters !== undefined
    ) {
      updateCaptureDetails({
        areaSquareMeters: demoMetadata.areaSquareMeters,
        ...(demoMetadata.areaUnit ? { areaUnit: demoMetadata.areaUnit } : {}),
      });
    }
  }, [captureDetails.areaSquareMeters, demoMetadata?.areaSquareMeters, demoMetadata?.areaUnit]);

  const chooseFloorUse = (value: string) => {
    const from = captureDetails.floorUse;
    if (!from || from === value) {
      updateCaptureDetails({ floorUse: value });
      return;
    }
    const proposal = createFloorTransitionProposal(scopeKey, captureDetails, value as 'residential' | 'commercial');
    if (!proposal || proposal.affected.length === 0) {
      updateCaptureDetails({ floorUse: value });
      return;
    }
    setPendingFloorTransition(proposal);
    setPendingConfirmation({
      title: t('transition.floor.title'),
      message: `${t('transition.floor.message')}\n\n${proposal.affected.map(item => `${propertyDetailLabels[item.field][language === 'ar' ? 1 : 0]}: ${item.value}`).join(', ')}`,
      onConfirm: () => {
        const next = applyFloorTransition(scopeKey, getCurrentCaptureDetails(), proposal);
        setPendingFloorTransition(null);
        if (next) replaceCaptureDetails(next);
      },
    });
  };

  const selectType = (propertyType: typeof PROPERTY_FORM_TYPES[number]) => {
    if (draft.propertyType === propertyType) return;
    const populated = hasPopulatedCategoryCapture(captureDetails as Record<string, unknown>);
    const sourceDetailsSnapshot = JSON.stringify(captureDetails);
    const apply = () => {
      const currentDetails = getCurrentCaptureDetails();
      if (JSON.stringify(currentDetails) !== sourceDetailsSnapshot) return;
      const shared = {
        ...(currentDetails.areaSquareMeters !== undefined ? { areaSquareMeters: currentDetails.areaSquareMeters } : {}),
        ...(currentDetails.areaUnit ? { areaUnit: currentDetails.areaUnit } : {}),
        nearbyServices: currentDetails.nearbyServices ?? JSON.stringify([]),
      };
      replaceCaptureDetails(shared);
      try {
        setNearby(currentDetails.nearbyServices ? JSON.parse(currentDetails.nearbyServices) as string[] : []);
      } catch {
        setNearby([]);
      }
      setQuickErrors({});
      updateDraft({ propertyType });
    };
    if (!populated) {
      apply();
      return;
    }
    setPendingConfirmation({
      title: language === 'ar' ? 'تغيير نوع العقار؟' : 'Change property type?',
      message: language === 'ar' ? 'سيتم حذف المواصفات غير المتوافقة.' : 'Incompatible specifications will be cleared.',
      onConfirm: apply,
    });
  };

  const selectDemoCategory = (category: typeof PROPERTY_DEMO_CATALOG[number]) => {
    if (demoCategory?.id === category.id) return;
    if (draft.transaction && draft.transaction !== category.transaction) {
      Alert.alert(
        language === 'ar' ? 'المعاملة غير متوافقة' : 'Transaction not compatible',
        language === 'ar' ? 'اختر معاملة متوافقة مع هذا التصنيف.' : 'Choose the transaction compatible with this category.',
      );
      return;
    }
    const next: PropertyDemoCaptureMetadata = { categoryId: category.id };
    const proposal = createDemoCategoryTransitionProposal(demoMetadata, category.id);
    const populated = Boolean(proposal?.affected.length)
      || (!demoMetadata && hasPopulatedCategoryCapture(captureDetails as Record<string, unknown>));
    const apply = () => {
      setNearby([]);
      setQuickErrors({});
      const currentMetadata = getCurrentCaptureDetails().demoMetadata;
      const currentDetails = getCurrentCaptureDetails();
      const transitioned = proposal
        ? applyDemoCategoryTransition(currentMetadata, proposal)
        : next;
      if (!transitioned) return;
      const nearbyServices = transitioned.nearbyServices ?? [];
      setNearby([...nearbyServices]);
      replaceCaptureDetails({
        ...(currentDetails.areaSquareMeters !== undefined ? { areaSquareMeters: currentDetails.areaSquareMeters } : {}),
        ...(currentDetails.areaUnit ? { areaUnit: currentDetails.areaUnit } : {}),
        demoMetadata: transitioned,
        nearbyServices: JSON.stringify(nearbyServices),
      });
      updateDraft({ propertyType: category.canonicalType, transaction: category.transaction });
    };
    if (!populated) {
      apply();
      return;
    }
    setPendingConfirmation({
      title: language === 'ar' ? 'تغيير التصنيف؟' : 'Change category?',
      message: `${language === 'ar' ? 'سيتم حذف مواصفات التصنيف الحالي والمزايا والخدمات القريبة.' : 'Category specifications, features, and nearby services for the current category will be cleared.'}${proposal?.affected.length ? `\n\n${proposal.affected.map(item => `${item.label[language === 'ar' ? 1 : 0]}: ${item.value}`).join(', ')}` : ''}`,
      onConfirm: apply,
    });
  };

  const updateDemoMetadata = (changes: Partial<PropertyDemoCaptureMetadata>) => {
    if (!demoCategory) {
      updateCaptureDetails(changes as CaptureDetailValues);
      return;
    }
    updateCaptureDetails({
      demoMetadata: {
        ...demoMetadata,
        categoryId: demoCategory.id,
        ...changes,
      },
    });
  };

  const selectTransaction = (transaction: Transaction) => {
    if (draft.transaction === transaction) return;
    const hasCategoryData = Boolean(demoCategory)
      || hasPopulatedCategoryCapture(captureDetails as Record<string, unknown>);
    const proposal = createDemoTransactionTransitionProposal(draft, demoMetadata, transaction);
    const sourceDraftSnapshot = JSON.stringify(draft);
    const sourceDetailsSnapshot = JSON.stringify(captureDetails);
    const apply = () => {
      const currentDraft = getCurrentDraft();
      const currentDetails = getCurrentCaptureDetails();
      if (JSON.stringify(currentDraft) !== sourceDraftSnapshot || JSON.stringify(currentDetails) !== sourceDetailsSnapshot) return;
      const transitioned = proposal
        ? applyDemoTransactionTransition(currentDraft, currentDetails.demoMetadata, proposal)
        : null;
      if (proposal && !transitioned) return;
      const sharedArea = {
        ...(currentDetails.areaSquareMeters !== undefined ? { areaSquareMeters: currentDetails.areaSquareMeters } : {}),
        ...(currentDetails.areaUnit ? { areaUnit: currentDetails.areaUnit } : {}),
      };
      const nextMetadata = transitioned?.metadata;
      const nextNearby = transitioned?.nearbyServices ?? nextMetadata?.nearbyServices ?? [];
      setNearby([...nextNearby]);
      replaceCaptureDetails({
        ...sharedArea,
        nearbyServices: JSON.stringify(nextNearby),
        ...(nextMetadata ? { demoMetadata: nextMetadata } : {}),
      });
      const nextDraft = transitioned?.draft;
      if (updateDraft(nextDraft ? {
        transaction: nextDraft.transaction,
        propertyType: nextDraft.propertyType,
        salePrice: nextDraft.salePrice,
        rentalPrice: nextDraft.rentalPrice,
        rentalPeriodId: nextDraft.rentalPeriodId,
      } : {
        transaction,
        propertyType: undefined,
        salePrice: transaction === 'sale' ? currentDraft.salePrice : undefined,
        rentalPrice: transaction === 'rent' ? currentDraft.rentalPrice : undefined,
        rentalPeriodId: transaction === 'rent' ? (currentDraft.rentalPeriodId ?? 'monthly') : undefined,
      })) setStage(1);
    };
    if (!hasCategoryData) {
      apply();
      return;
    }
    setPendingConfirmation({
      title: language === 'ar' ? 'تغيير المعاملة؟' : 'Change transaction?',
      message: `${language === 'ar' ? 'سيتم حذف مواصفات التصنيف الحالي والمزايا والخدمات القريبة.' : 'Category specifications, features, and nearby services will be cleared.'}${proposal?.affected.length ? `\n\n${proposal.affected.map(item => `${item.label[language === 'ar' ? 1 : 0]}: ${item.value}`).join(', ')}` : ''}`,
      onConfirm: apply,
    });
  };

  const updateDescription = (value: string) => {
    setDescription(value);
    updateDraft(value ? {
      description: { value, privacy: { classification: 'normal', disclosurePolicy: 'normal' } },
    } : { description: undefined });
  };

  const openPreview = () => {
    if (!draft.transaction || !draft.propertyType || !draft.locationAreaId) {
      Alert.alert(t('errors.validation_title'), t('errors.capture_incomplete'));
      return;
    }
    if (Object.keys(quickErrors).length > 0) {
      Alert.alert(t('errors.validation_title'), language === 'ar' ? 'صحح القيم غير الصالحة أولاً.' : 'Correct the invalid numeric values first.');
      return;
    }
    const projection = projectToProperty();
    if (!projection.ok) {
      Alert.alert(t('errors.validation_title'), t('errors.capture_incomplete'));
      return;
    }
    setStage(3);
  };

  const save = async () => {
    if (saveFlight.current) return;
    saveFlight.current = true;
    const projection = projectToProperty();
    if (!projection.ok) {
      saveFlight.current = false;
      Alert.alert(t('errors.validation_title'), t('errors.capture_incomplete'));
      return;
    }
    setSubmitting(true);
    try {
      const candidate = buildPropertyWithCaptureDetails(projection.property, captureDetails, true);
      const evidence = await prepareCapturedDetails(projection.property, candidate);
      const result = await savePropertyWithRecovery(projection.property);
      if (result.status !== 'complete') {
        Alert.alert(t('errors.storage_title'), t('errors.storage_save'));
        return;
      }
      if (evidence) {
        await finalizeCapturedDetails(store, evidence);
      }
      await clearCaptureDetails(projection.property.core.id);
      router.replace({
        pathname: '/capture/success',
        params: { propertyCoreId: projection.property.core.id },
      } as never);
    } catch (error) {
      console.error('Capture workflow save failed:', error);
      Alert.alert(t('errors.storage_title'), t('errors.storage_save'));
    } finally {
      saveFlight.current = false;
      setSubmitting(false);
    }
  };

  const saveDraft = async () => {
    if (draftSaveStatus === 'saving') return;
    setDraftSaveStatus('saving');
    let persisted = false;
    try {
      persisted = await persistCurrentCapture();
    } catch {
      persisted = false;
    }
    if (!persisted) {
      setDraftSaveStatus('error');
      return;
    }
    setDraftSaveStatus('saved');
  };

  const header = stage === 1 ? t('capture.progress.transaction')
    : stage === 2 ? t('capture.progress.review') : t('summary.title');

  return (
    <KeyboardAvoidingView
      style={[styles.container, Platform.OS === 'web' ? { width: '100%', maxWidth: 430, alignSelf: 'center' } : null, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={[styles.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={() => stage === 1 ? router.back() : setStage(stage === 3 ? 2 : 1)} accessibilityRole="button" accessibilityLabel={t('capture.back')}>
            <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('home.action.addProperty')}</Text>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('capture.cancel')}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <Text testID={`capture-stage-${stage}`} style={[styles.stageTitle, { color: colors.primary, fontFamily: fonts.semiBold }]}>{header}</Text>
        <View style={[styles.steps, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {[1, 2, 3].map(number => (
            <View key={number} style={styles.step}>
              <View style={[styles.stepDot, { backgroundColor: number <= stage ? colors.primary : colors.border }]}>
                <Text style={{ color: number <= stage ? colors.background : colors.mutedForeground, fontFamily: fonts.bold }}>{number}</Text>
              </View>
              {number < 3 && <View style={[styles.connector, { backgroundColor: number < stage ? colors.primary : colors.border }]} />}
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 96 }]}
      >
        {stage === 1 && (
          <>
            <Text style={[styles.intro, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>
              {language === 'ar' ? 'ابدأ بالتصنيف والمعاملة، وستظهر المواصفات المناسبة تلقائياً.' : 'Start with the transaction and category. Applicable specifications appear automatically.'}
            </Text>
            <Section title={language === 'ar' ? 'نوع المعاملة' : 'Transaction'} colors={colors} fonts={fonts}>
              <View style={styles.chips}>
                {(['sale', 'rent'] as const).map(value => (
                  <Choice key={value} selected={draft.transaction === value} label={t(`transaction.${value}` as keyof Translations)} onPress={() => selectTransaction(value)} colors={colors} fonts={fonts} />
                ))}
              </View>
            </Section>
            <Section title={language === 'ar' ? 'تصنيف العقار' : 'Property category'} colors={colors} fonts={fonts}>
              <View style={[styles.categoryGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {PROPERTY_DEMO_CATALOG.filter(category => !draft.transaction || category.transaction === draft.transaction).map(category => (
                  <TouchableOpacity key={category.id} onPress={() => selectDemoCategory(category)} accessibilityRole="radio" accessibilityState={{ selected: demoCategory?.id === category.id }} style={[styles.category, { backgroundColor: colors.card, borderColor: demoCategory?.id === category.id ? colors.primary : colors.border }]}>
                    <Check selected={demoCategory?.id === category.id} colors={colors} />
                    <Text testID={`capture-category-${category.id}`} style={[styles.categoryLabel, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{category.label[language === 'ar' ? 1 : 0]}</Text>
                    <Text style={[styles.categorySubtitle, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>{category.subtitle[language === 'ar' ? 1 : 0]}</Text>
                  </TouchableOpacity>
                ))}
                {PROPERTY_FORM_TYPES.filter(type => !PROPERTY_DEMO_CATALOG.some(category => category.canonicalType === type)).map(type => (
                  <TouchableOpacity key={type} onPress={() => selectType(type)} accessibilityRole="radio" accessibilityState={{ selected: draft.propertyType === type }} style={[styles.category, { backgroundColor: colors.card, borderColor: draft.propertyType === type ? colors.primary : colors.border }]}>
                    <Check selected={draft.propertyType === type} colors={colors} />
                    <Text style={[styles.categoryLabel, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t(`propertyType.${type}` as keyof Translations)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Section>
          </>
        )}

        {stage === 2 && draft.propertyType && (
          <>
            <Section title={language === 'ar' ? 'البيانات الأساسية' : 'Basic information'} colors={colors} fonts={fonts}>
              <View style={styles.chips}>
                {(['sale', 'rent'] as const).map(value => <Choice key={value} selected={draft.transaction === value} label={t(`transaction.${value}` as keyof Translations)} onPress={() => selectTransaction(value)} colors={colors} fonts={fonts} />)}
              </View>
               <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'المنطقة' : 'Area'}</Text>
               <TouchableOpacity testID="capture-area-selector" accessibilityRole="button" onPress={() => setAreaSelectorOpen(true)} style={[styles.areaField, { borderColor: colors.border, backgroundColor: colors.card }]}>
                 <Text style={{ color: selectedArea ? colors.foreground : colors.mutedForeground, fontFamily: fonts.regular }}>{selectedArea ? (language === 'ar' ? selectedArea.ar : selectedArea.en) : (language === 'ar' ? 'اختر المنطقة' : 'Select area')}</Text>
                 <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
               </TouchableOpacity>
               <Modal visible={areaSelectorOpen} animationType="slide" transparent onRequestClose={() => { setAreaSearch(''); setAreaSelectorOpen(false); }}>
                 <View style={styles.modalBackdrop}>
                   <View style={[styles.areaSheet, { backgroundColor: colors.background }]}>
                     <View style={[styles.areaSheetHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                       <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{language === 'ar' ? 'اختر المنطقة' : 'Select area'}</Text>
                       <TouchableOpacity testID="capture-area-cancel" accessibilityRole="button" onPress={() => { setAreaSearch(''); setAreaSelectorOpen(false); }}><Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{language === 'ar' ? 'إلغاء' : 'Cancel'}</Text></TouchableOpacity>
                     </View>
                     <TextInput testID="capture-area-search" autoFocus value={areaSearch} onChangeText={setAreaSearch} placeholder={language === 'ar' ? 'ابحث بالمنطقة أو المحافظة' : 'Search area or governorate'} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
                     <ScrollView keyboardShouldPersistTaps="handled">
                       {areaSearch.trim() ? areaResults.map(area => (
                         <TouchableOpacity key={area.id} testID={`capture-area-option-${area.id}`} accessibilityRole="radio" accessibilityState={{ selected: draft.locationAreaId === area.id }} onPress={() => { updateDraft({ locationAreaId: area.id }); setAreaSearch(''); setAreaSelectorOpen(false); }} style={[styles.areaOption, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                           <Check selected={draft.locationAreaId === area.id} colors={colors} />
                           <View style={styles.areaOptionText}><Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{language === 'ar' ? area.ar : area.en}</Text><Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{language === 'ar' ? area.governorateAr : area.governorateEn}</Text></View>
                         </TouchableOpacity>
                       )) : KUWAIT_GOVERNORATES.map(governorate => {
                         const expanded = expandedGovernorates.has(governorate.id);
                       return <View key={governorate.id}><TouchableOpacity testID={`capture-governorate-${governorate.id}`} accessibilityRole="button" onPress={() => setExpandedGovernorates(current => { const next = new Set(current); if (next.has(governorate.id)) next.delete(governorate.id); else next.add(governorate.id); return next; })} style={[styles.governorateRow, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}><Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{language === 'ar' ? governorate.ar : governorate.en}</Text><Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} /></TouchableOpacity>{expanded && getAreasByGovernorate(governorate.id, language === 'ar' ? 'ar' : 'en').map(area => <TouchableOpacity key={area.id} testID={`capture-area-option-${area.id}`} accessibilityRole="radio" accessibilityState={{ selected: draft.locationAreaId === area.id }} onPress={() => { updateDraft({ locationAreaId: area.id }); setAreaSearch(''); setAreaSelectorOpen(false); }} style={[styles.areaOption, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}><Check selected={draft.locationAreaId === area.id} colors={colors} /><Text style={{ color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{language === 'ar' ? area.ar : area.en}</Text></TouchableOpacity>)}</View>;
                       })}
                       {areaSearch.trim() && areaResults.length === 0 && <Text style={[styles.emptyArea, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>{language === 'ar' ? 'لا توجد مناطق مطابقة' : 'No matching areas'}</Text>}
                     </ScrollView>
                   </View>
                 </View>
               </Modal>
              <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'القطعة' : 'Block'}</Text>
              <TextInput value={block} onChangeText={value => { setBlock(value); updateDraft({ block: value || undefined }); }} keyboardType="number-pad" placeholder={language === 'ar' ? 'اختياري' : 'Optional'} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
              <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{draft.transaction === 'rent' ? t('summary.rent_price') : t('summary.sale_price')}</Text>
              <TextInput value={draft.transaction === 'rent' ? (draft.rentalPrice?.amount ? String(draft.rentalPrice.amount) : '') : (draft.salePrice?.amount ? String(draft.salePrice.amount) : '')} onChangeText={value => {
                const normalized = value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٫,]/g, '.');
                const amount = Number(normalized);
                if (!Number.isFinite(amount) || amount < 0) return;
                updateDraft(draft.transaction === 'rent' ? { rentalPrice: { amount, currencyCode: 'KWD' } } : { salePrice: { amount, currencyCode: 'KWD' } });
              }} keyboardType="decimal-pad" placeholder={language === 'ar' ? 'السعر' : 'Price'} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
              {draft.transaction === 'rent' && (
                <View style={styles.chips}>
                  <Choice selected={draft.rentalPeriodId === 'monthly'} label={language === 'ar' ? 'شهرياً' : 'Monthly'} onPress={() => updateDraft({ rentalPeriodId: 'monthly' })} colors={colors} fonts={fonts} />
                  <Choice selected={draft.rentalPeriodId === 'yearly'} label={language === 'ar' ? 'سنوياً' : 'Yearly'} onPress={() => updateDraft({ rentalPeriodId: 'yearly' })} colors={colors} fonts={fonts} />
                </View>
              )}
              <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'مساحة العقار' : 'Property area'}</Text>
              <TextInput value={metadataValue(captureDetails.areaSquareMeters)} onChangeText={value => {
                const normalized = value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٫,]/g, '.');
                const number = Number(normalized);
                if (normalized === '' || Number.isFinite(number)) updateCaptureDetails({ areaSquareMeters: normalized === '' ? undefined : number });
              }} keyboardType="decimal-pad" placeholder={language === 'ar' ? 'اختياري' : 'Optional'} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
              <View style={styles.chips}>
                <Choice selected={captureDetails.areaUnit === 'square_meter'} label={language === 'ar' ? 'متر مربع' : 'Square meter'} onPress={() => updateCaptureDetails({ areaUnit: 'square_meter' })} colors={colors} fonts={fonts} />
                <Choice selected={captureDetails.areaUnit === 'square_foot'} label={language === 'ar' ? 'قدم مربع' : 'Square foot'} onPress={() => updateCaptureDetails({ areaUnit: 'square_foot' })} colors={colors} fonts={fonts} />
              </View>
              <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'الوصف' : 'Description'}</Text>
              <TextInput value={description} onChangeText={updateDescription} multiline placeholder={language === 'ar' ? 'تفاصيل إضافية' : 'Additional details'} placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
            </Section>
            <Section title={language === 'ar' ? 'المواصفات' : 'Property specifications'} colors={colors} fonts={fonts}>
              {demoCategory && (
                <DemoSpecificationFields
                  category={demoCategory}
                  metadata={demoMetadata}
                  language={language}
                  colors={colors}
                  fonts={fonts}
                  onChange={updateDemoMetadata}
                  quickErrors={quickErrors}
                  onQuickError={(field: string, invalid: boolean) => setQuickErrors(current => {
                    const next = { ...current };
                    if (invalid) next[field] = language === 'ar' ? 'أدخل قيمة صحيحة.' : 'Enter a valid value.';
                    else delete next[field];
                    return next;
                  })}
                />
              )}
              {!demoCategory && <PropertyEnrichmentFields
                recordScopeKey={scopeKey}
                propertyType={draft.propertyType}
                values={captureDetails}
                onChange={(field, value) => field === 'floorUse' ? chooseFloorUse(value) : updateCaptureDetails({ [field]: value })}
              />}
            </Section>
            <Section title={language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'} colors={colors} fonts={fonts}>
              <View style={styles.chips}>
                {DEMO_NEARBY_SERVICES.map(item => <Choice key={item.id} testID={`capture-nearby-${item.id}`} selected={nearby.includes(item.id)} label={item.label[language === 'ar' ? 1 : 0]} onPress={() => {
                  const id = item.id;
                  const next = nearby.includes(id) ? nearby.filter(item => item !== id) : [...nearby, id];
                  setNearby(next);
                  updateCaptureDetails({
                    nearbyServices: JSON.stringify(next),
                    ...(demoCategory ? { demoMetadata: { ...demoMetadata, categoryId: demoCategory.id, nearbyServices: next } } : {}),
                  });
                }} colors={colors} fonts={fonts} multi />)}
              </View>
            </Section>
          </>
        )}

        {stage === 3 && (
          <Section title={language === 'ar' ? 'مراجعة وتأكيد' : 'Preview and confirmation'} colors={colors} fonts={fonts}>
            <TouchableOpacity onPress={() => setStage(2)} accessibilityRole="button" testID="capture-preview-back-edit" style={[styles.previewEdit, { borderColor: colors.primary }]}>
              <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{language === 'ar' ? 'العودة للتحرير' : 'Back to Edit'}</Text>
            </TouchableOpacity>
            <Text style={[styles.previewTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{demoCategory?.label[language === 'ar' ? 1 : 0] ?? (draft.propertyType ? t(`propertyType.${draft.propertyType}` as keyof Translations) : '')}</Text>
            <Text style={[styles.previewMeta, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>{selectedArea ? (language === 'ar' ? selectedArea.ar : selectedArea.en) : ''}</Text>
            <PreviewRow label={t('summary.transaction')} value={draft.transaction ? t(`transaction.${draft.transaction}` as keyof Translations) : ''} colors={colors} fonts={fonts} />
            <PreviewRow label={t('summary.property_type')} value={draft.propertyType ? t(`propertyType.${draft.propertyType}` as keyof Translations) : ''} colors={colors} fonts={fonts} />
            <PreviewRow label={language === 'ar' ? 'القطعة' : 'Block'} value={draft.block ?? ''} colors={colors} fonts={fonts} />
            <PreviewRow label={draft.transaction === 'rent' ? t('summary.rent_price') : t('summary.sale_price')} value={String((draft.transaction === 'rent' ? draft.rentalPrice?.amount : draft.salePrice?.amount) ?? '')} colors={colors} fonts={fonts} />
            {draft.transaction === 'rent' && <PreviewRow label={language === 'ar' ? 'الدورية' : 'Cadence'} value={draft.rentalPeriodId === 'yearly' ? (language === 'ar' ? 'سنوياً' : 'Yearly') : (language === 'ar' ? 'شهرياً' : 'Monthly')} colors={colors} fonts={fonts} />}
            <PreviewRow label={language === 'ar' ? 'المساحة' : 'Area'} value={captureDetails.areaSquareMeters === undefined ? '' : `${captureDetails.areaSquareMeters} ${captureDetails.areaUnit === 'square_foot' ? (language === 'ar' ? 'قدم مربع' : 'sq ft') : (language === 'ar' ? 'متر مربع' : 'm²')}`} colors={colors} fonts={fonts} />
            {applicable.filter(definition => captureDetails[definition.field] !== undefined).map(definition => <PreviewRow key={definition.field} label={definition.label[language === 'ar' ? 1 : 0]} value={formatPropertyDetailValue(definition.field as any, captureDetails[definition.field], language)} colors={colors} fonts={fonts} />)}
            {nearby.length > 0 && <PreviewRow label={language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'} value={nearby.map(id => DEMO_NEARBY_SERVICES.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0]).join(', ')} colors={colors} fonts={fonts} />}
            <PreviewRow label={language === 'ar' ? 'الوصف' : 'Description'} value={description} colors={colors} fonts={fonts} />
            {demoCategory?.numericFields.map(item => (
              <PreviewRow key={item.id} label={item.label[language === 'ar' ? 1 : 0]} value={metadataValue(demoMetadata?.numericValues?.[item.id])} colors={colors} fonts={fonts} />
            ))}
            {demoCategory?.choices.map(item => (
              <PreviewRow key={item.id} label={item.label[language === 'ar' ? 1 : 0]} value={item.options.find(option => option.id === demoMetadata?.choices?.[item.id])?.label[language === 'ar' ? 1 : 0] ?? ''} colors={colors} fonts={fonts} />
            ))}
            {demoMetadata?.selectedFeatures?.length ? <PreviewRow label={language === 'ar' ? 'المزايا' : 'Features'} value={demoMetadata.selectedFeatures.map(id => demoCategory?.features.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0] ?? id).join(', ')} colors={colors} fonts={fonts} /> : null}
          </Section>
        )}
      </ScrollView>
      {stage === 2 && draftSaveStatus !== 'idle' && (
        <View
          testID={draftSaveStatus === 'saved' ? 'capture-draft-saved' : undefined}
          accessibilityLiveRegion="polite"
          style={[styles.draftStatusPanel, { backgroundColor: colors.card, borderColor: draftSaveStatus === 'error' ? colors.destructive : colors.primary }]}
        >
          <Text style={[styles.draftStatusTitle, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
            {draftSaveStatus === 'saving'
              ? (language === 'ar' ? 'جارٍ حفظ المسودة…' : 'Saving draft…')
              : draftSaveStatus === 'saved'
                ? (language === 'ar' ? 'تم حفظ المسودة' : 'Draft saved')
                : (language === 'ar' ? 'تعذر حفظ المسودة' : 'Draft could not be saved')}
          </Text>
          {draftSaveStatus === 'saved' ? (
            <>
              <Text style={[styles.draftStatusBody, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>
                {language === 'ar' ? 'يمكنك متابعة الإدخال الآن أو العودة لاحقاً لإكمالها.' : 'Your property draft is stored. Continue editing now or return later to resume it.'}
              </Text>
              <View style={[styles.draftStatusActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Button title={language === 'ar' ? 'متابعة التحرير' : 'Continue editing'} onPress={() => setDraftSaveStatus('idle')} variant="outline" style={styles.draftStatusAction} testID="capture-draft-continue" />
                <Button title={language === 'ar' ? 'الخروج' : 'Exit'} onPress={() => router.back()} style={styles.draftStatusAction} testID="capture-draft-exit" />
              </View>
            </>
          ) : draftSaveStatus === 'error' ? (
            <>
              <Text style={[styles.draftStatusBody, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>
                {language === 'ar' ? 'تحقق من التخزين وحاول مرة أخرى.' : 'Storage did not confirm the latest draft. Please try again.'}
              </Text>
              <Button title={language === 'ar' ? 'إعادة المحاولة' : 'Retry'} onPress={saveDraft} variant="outline" testID="capture-draft-retry" />
            </>
          ) : null}
        </View>
      )}
      <Modal
        visible={pendingConfirmation !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPendingConfirmation(null);
          setPendingFloorTransition(null);
        }}
      >
        <View style={styles.confirmationBackdrop}>
          <View style={[styles.confirmationCard, { backgroundColor: colors.card }]}>
            <Text testID="capture-transition-title" style={[styles.confirmationTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>
              {pendingConfirmation?.title}
            </Text>
            <Text testID="capture-transition-message" accessibilityRole="text" style={[styles.confirmationMessage, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>
              {pendingConfirmation?.message}
            </Text>
            <View style={[styles.confirmationActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Button
                title={language === 'ar' ? 'إلغاء' : 'Cancel'}
                variant="outline"
                onPress={() => {
                  setPendingConfirmation(null);
                  setPendingFloorTransition(null);
                }}
                testID="capture-transition-cancel"
                style={styles.confirmationAction}
              />
              <Button
                title={language === 'ar' ? 'متابعة' : 'Confirm'}
                onPress={() => {
                  const confirmation = pendingConfirmation;
                  setPendingConfirmation(null);
                  setPendingFloorTransition(null);
                  confirmation?.onConfirm();
                }}
                testID="capture-transition-confirm"
                style={styles.confirmationAction}
              />
            </View>
          </View>
        </View>
      </Modal>
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        {stage === 2 ? <Button title={language === 'ar' ? 'حفظ كمسودة' : 'Save Draft'} onPress={saveDraft} variant="outline" loading={draftSaveStatus === 'saving'} disabled={draftSaveStatus === 'saving'} testID="capture-save-draft" /> : <Button title={t('capture.back')} onPress={() => setStage(stage === 3 ? 2 : 1)} variant="outline" testID="capture-back" />}
        {stage === 1 ? <Button title={t('capture.next')} onPress={() => draft.transaction && draft.propertyType && (!demoCategory || draft.transaction === demoCategory.transaction) ? setStage(2) : Alert.alert(t('errors.validation_title'), t('errors.capture_incomplete'))} disabled={!draft.transaction || !draft.propertyType || Boolean(demoCategory && draft.transaction !== demoCategory.transaction)} testID="capture-next" /> : stage === 2 ? <Button title={language === 'ar' ? 'معاينة' : 'Preview'} onPress={openPreview} testID="capture-preview" /> : <Button title={t('summary.submit')} onPress={save} loading={submitting} testID="capture-save-property" />}
      </View>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children, colors, fonts }: any) {
  return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{title}</Text>{children}</View>;
}
function Check({ selected, colors, multi = false }: any) {
  return <View style={[styles.check, multi && styles.checkSquare, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}>{selected && <Feather name="check" size={13} color={colors.background} />}</View>;
}
function Choice({ selected, label, onPress, colors, fonts, multi = false, testID }: any) {
  return <TouchableOpacity onPress={onPress} testID={testID} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ selected, checked: multi ? selected : undefined }} style={[styles.choice, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '16' : colors.card }]}><Check selected={selected} colors={colors} multi={multi} /><Text style={[styles.choiceText, { color: selected ? colors.primary : colors.foreground, fontFamily: selected ? fonts.semiBold : fonts.medium }]}>{label}</Text></TouchableOpacity>;
}
function PreviewRow({ label, value, colors, fonts }: any) {
  if (!value) return null;
  return <View style={[styles.previewRow, { borderBottomColor: colors.border }]}><Text style={[styles.previewLabel, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>{label}</Text><Text style={[styles.previewValue, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{value}</Text></View>;
}
function metadataValue(value: number | undefined) {
  return value === undefined ? '' : String(value);
}
function DemoSpecificationFields({ category, metadata, language, colors, fonts, onChange, quickErrors, onQuickError }: any) {
  return (
    <View>
      {category.numericFields.map((item: any) => (
        <View key={item.id} style={styles.demoField}>
          <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{item.label[language === 'ar' ? 1 : 0]}</Text>
          <QuickCount field={item.id} value={metadata?.numericValues?.[item.id]} decimal={item.kind === 'decimal'} error={quickErrors?.[item.id]} colors={colors} fonts={fonts} onValidity={onQuickError} onChange={(value: number | undefined) => {
            const numericValues = { ...(metadata?.numericValues ?? {}) };
            if (value === undefined) delete numericValues[item.id];
            else numericValues[item.id] = value;
            onChange({ numericValues });
          }} />
        </View>
      ))}
      {category.choices.map((choice: any) => (
        <View key={choice.id} style={styles.demoField}>
          <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{choice.label[language === 'ar' ? 1 : 0]}</Text>
          <View style={styles.chips}>{choice.options.map((option: any) => <Choice key={option.id} selected={metadata?.choices?.[choice.id] === option.id} label={option.label[language === 'ar' ? 1 : 0]} onPress={() => onChange({ choices: { ...(metadata?.choices ?? {}), [choice.id]: option.id } })} colors={colors} fonts={fonts} />)}</View>
        </View>
      ))}
      <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'المزايا الخاصة بالفئة' : 'Category features'}</Text>
      <View style={styles.chips}>{category.features.map((feature: any) => {
        const selected = metadata?.selectedFeatures?.includes(feature.id);
        return <Choice key={feature.id} selected={selected} multi label={feature.label[language === 'ar' ? 1 : 0]} onPress={() => onChange({ selectedFeatures: selected ? (metadata?.selectedFeatures ?? []).filter((id: string) => id !== feature.id) : [...(metadata?.selectedFeatures ?? []), feature.id] })} colors={colors} fonts={fonts} />;
      })}</View>
    </View>
  );
}
function QuickCount({ field, value, decimal, colors, fonts, error, onValidity, onChange }: any) {
  const [exact, setExact] = useState(value !== undefined && value > 5 ? String(value) : '');
  const [expanded, setExpanded] = useState(value !== undefined && value > 5);
  useEffect(() => {
    const isExpanded = value !== undefined && value > 5;
    setExpanded(isExpanded);
    if (isExpanded) setExact(String(value));
  }, [value]);
  return <View><View style={styles.chips}>{[0, 1, 2, 3, 4, 5].map(number => <Choice key={number} testID={`capture-quick-${field}-${number}`} selected={value === number} label={String(number)} onPress={() => { setExpanded(false); setExact(''); onValidity(field, false); onChange(number); }} colors={colors} fonts={fonts} />)}<Choice testID={`capture-quick-${field}-more`} selected={value !== undefined && value > 5} label="+6 More" onPress={() => { setExpanded(true); if (value !== undefined && value > 5) setExact(String(value)); }} colors={colors} fonts={fonts} /></View>{(expanded || value !== undefined && value > 5) && <><TextInput testID={`capture-quick-${field}-exact`} value={exact} onChangeText={text => { setExact(text); if (text === '') { onValidity(field, false); onChange(undefined); return; } const number = parseDemoNumericInput(text, decimal); const valid = number !== null && number >= 6; onValidity(field, !valid); if (valid) onChange(number); }} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} placeholder="6+" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: error ? colors.destructive : colors.border, backgroundColor: colors.card }]} />{error ? <Text testID={`capture-quick-${field}-error`} style={{ color: colors.destructive, marginTop: 4 }}>{error}</Text> : null}</>}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18 },
  stageTitle: { textAlign: 'center', marginTop: 12, fontSize: 13 },
  steps: { justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  step: { flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  connector: { width: 40, height: 2, marginHorizontal: 5 },
  content: { padding: 18 },
  intro: { lineHeight: 22, marginBottom: 18 },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 17, marginBottom: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  category: { width: '47%', minHeight: 68, borderWidth: 1, borderRadius: 12, padding: 10, justifyContent: 'flex-start', position: 'relative' },
  categoryLabel: { fontSize: 13, lineHeight: 19 },
  categorySubtitle: { fontSize: 11, marginTop: 5 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkSquare: { borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  horizontalChips: { gap: 8, paddingBottom: 4 },
  choice: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
  choiceText: { fontSize: 13, maxWidth: 210 },
  label: { fontSize: 13, marginTop: 12, marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 15 },
  areaField: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  areaSheet: { maxHeight: '88%', minHeight: '55%', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  areaSheetHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  governorateRow: { minHeight: 48, justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  areaOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, borderBottomWidth: 1 },
  areaOptionText: { flex: 1, gap: 2 },
  emptyArea: { textAlign: 'center', paddingVertical: 28 },
  textarea: { minHeight: 82, textAlignVertical: 'top', paddingTop: 12 },
  footer: { borderTopWidth: 1, paddingHorizontal: 18, paddingTop: 12, flexDirection: 'row', gap: 10 },
  footerButton: { flex: 1 },
  draftStatusPanel: { borderWidth: 1, borderRadius: 12, marginHorizontal: 18, marginBottom: 8, padding: 12, gap: 8 },
  draftStatusTitle: { fontSize: 15 },
  draftStatusBody: { fontSize: 13, lineHeight: 19 },
  draftStatusActions: { gap: 8 },
  draftStatusAction: { flex: 1 },
  confirmationBackdrop: { flex: 1, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', padding: 18 },
  confirmationCard: { width: '100%', maxWidth: 420, borderRadius: 16, padding: 18, gap: 10 },
  confirmationTitle: { fontSize: 18 },
  confirmationMessage: { fontSize: 14, lineHeight: 21 },
  confirmationActions: { gap: 10, marginTop: 6 },
  confirmationAction: { flex: 1 },
  previewTitle: { fontSize: 24, marginBottom: 5 },
  previewEdit: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 12 },
  previewMeta: { marginBottom: 14 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  previewLabel: { flex: 1, fontSize: 13 },
  previewValue: { flex: 1, textAlign: 'right', fontSize: 13 },
  demoField: { marginBottom: 10 },
});