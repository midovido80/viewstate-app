import { getFloorTypeLabel } from '@/services/propertySectorSelection';
import type { ApartmentSubtype } from '@workspace/property-domain';
import { navigationButtonStyle, navigationButtonTextStyle } from '@/constants/navigation';
import { getCaptureBackAction } from '@/services/captureBackNavigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/Button';
import {
  getApplicablePropertyFormFields,
  PROPERTY_FORM_TYPES,
} from '@/services/propertyFormCatalog';
import { propertyDetailLabels, formatPropertyDetailValue } from '@/components/PropertyEnrichmentFields';
import { ModernPropertyForm } from '@/components/ModernPropertyForm';
import { grossAnnualRentalYield } from '@/services/commercialComplexSale';
import { AttachmentPickerControl } from '@/components/AttachmentPickerControl';
import { KuwaitAreaSelector } from '@/components/KuwaitAreaSelector';
import { isDemoFeatureSuppressed, isMappedTemplateField } from '@/services/propertyFactProjection';
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
  preserveCaptureOwnershipAndEvidence,
  shouldSaveBasicCapture,
  type CaptureDetailValues,
} from '@/services/propertyCaptureDetails';
import {
  finalizeCapturedDetails,
  prepareCapturedDetails,
} from '@/services/propertyCaptureSave';
import { store } from '@/services/persistence';
import { projectRecordIntent } from '@/services/recordIntentPresentation';
import {
  createExpoFileStore,
  openAttachment,
  pickAndStoreMedia,
  pickAndStorePdfs,
  createWebFileAttachments,
  createIndexedDbWebAttachmentBlobStore,
  createWebAttachmentFileStore,
  persistNewAttachmentsOrDeleteOnFailure,
  type LocalAttachment,
  type WebAttachmentBlobStore,
} from '@/services/attachments';
import { requestCurrentCoordinates, normalizeGoogleMapsLink, pastedMapLocation, openPastedLocationLink, openGoogleMapsQuery } from '@/services/location';
import { getAreaById } from '@/constants/kuwait-areas';
import type { Transaction, PropertyDetailField, PropertyType } from '@workspace/property-domain';
import type { PropertyCaptureCategoryId, PropertyDemoCaptureMetadata } from '@workspace/property-domain';
import { PROPERTY_DEMO_CATALOG, getDemoCategory, getGenericCaptureTypesForTransaction, DEMO_NEARBY_SERVICES, parseDemoNumericInput, hasPopulatedCategoryCapture, createDemoCategoryTransitionProposal, applyDemoCategoryTransition, createDemoTransactionTransitionProposal, applyDemoTransactionTransition, canonicalApartmentSubtypeForCategory } from '@/services/propertyDemoCatalog';
import type { PropertySourceRole } from '@/services/people';
import { ensureStudioPropertySourceLink, getStudioPersonSourceRole } from '@/services/studioSave';
import { transitionCaptureAreaValidation } from '@/services/captureAreaValidation';
import { openStudioWebMapsLocation } from '@/services/studioWebActions';
import { reorderAttachments, resolveWebAttachmentImageSources, setAttachmentCover } from '@/services/attachmentOperations';
import { getCaptureMapsLinkValidationError } from '@/services/captureMapsLinkValidation';
import {
  DEMO_NUMERIC_QUICK_PICK_VALUES,
  openNumericQuickPickMore,
  selectNumericQuickPick,
} from '@/services/numericQuickPick';

export function isGenericStudioCaptureBlocked(
  routeApartmentSubtype?: string,
  draftPropertyType?: string,
  savedApartmentSubtype?: string,
  categoryApartmentSubtype?: string,
): boolean {
  if (draftPropertyType !== undefined && draftPropertyType !== 'apartment') return false;
  if (routeApartmentSubtype === 'standard' || routeApartmentSubtype === 'standard_apartment') return false;
  if (routeApartmentSubtype !== undefined) return true;
  return (draftPropertyType === 'apartment' && savedApartmentSubtype === 'studio')
    || (draftPropertyType === 'apartment' && categoryApartmentSubtype === 'studio');
}

export function getLegacyStudioCaptureEscapeTarget(
  transaction: string | undefined,
  linkPersonId?: string,
  sourceRole?: string,
):
  | {
    readonly pathname: '/capture/studio';
    readonly params: Readonly<Record<string, string>>;
  }
  | {
    readonly pathname: '/capture/transaction';
    readonly params: Readonly<Record<string, string>>;
  } {
  const context = {
    mode: 'offered',
    ...(linkPersonId ? { linkPersonId } : {}),
    ...(sourceRole ? { sourceRole } : {}),
  };
  if (transaction === 'sale' || transaction === 'rent') {
    return {
      pathname: '/capture/studio',
      params: { ...context, transaction },
    };
  }
  return {
    pathname: '/capture/transaction',
    params: context,
  };
}

function firstCaptureParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

// The capture child routes preserve the person link in their params. Keep the
// selected source role alongside it for installations where child routes
// replace (rather than inherit) parent params.
export default function CaptureWorkflow() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    linkPersonId?: string | string[];
    sourceRole?: string | string[];
    apartmentSubtype?: string | string[];
    propertyType?: string | string[];
    transaction?: string | string[];
  }>();
  const linkPersonId = firstCaptureParam(routeParams.linkPersonId);
  const sourceRole = firstCaptureParam(routeParams.sourceRole);
  const routeApartmentSubtype = firstCaptureParam(routeParams.apartmentSubtype);
  const routePropertyTypeParam = firstCaptureParam(routeParams.propertyType);
  const routePropertyType = PROPERTY_FORM_TYPES.find(type => type === routePropertyTypeParam);
  const hasInvalidExplicitPropertyType = routePropertyTypeParam !== undefined && routePropertyType === undefined;
  const routeTransaction = firstCaptureParam(routeParams.transaction);
  // sourceRole remains on the capture route contract for the summary handoff.
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
    persistCaptureDetails,
    getCurrentCaptureDetails,
    getCurrentDraft,
  } = useCapture();
  const selectedPropertyType: PropertyType | undefined = routePropertyTypeParam === undefined
    ? draft.propertyType
    : routePropertyType;
  const isStandardApartmentCapture = isBasicApartmentFollowUpCapture(
    selectedPropertyType,
    routeApartmentSubtype,
    captureDetails.apartmentSubtype,
  );
  const [reviewApartmentDetails, setReviewApartmentDetails] = useState(false);
  const isBasicApartmentFollowUp = isStandardApartmentCapture && !reviewApartmentDetails;
  const [stage, setStage] = useState<1 | 2 | 3>(draft.propertyType && draft.transaction ? 2 : 1);
  const [nearby, setNearby] = useState<string[]>(() => {
    try {
      return captureDetails.nearbyServices ? JSON.parse(captureDetails.nearbyServices) as string[] : [];
    } catch {
      return [];
    }
  });
  const [description, setDescription] = useState(draft.description?.value ?? '');
  const isBasicCaptureFollowUp = shouldSaveBasicCapture(
    captureDetails,
    draft.description?.value || description,
    isBasicApartmentFollowUp,
  );
  const [block, setBlock] = useState(draft.block ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveFlight = useRef(false);
  const sourceLinkRecoveryRef = useRef<{
    propertyCoreId: string;
    personId: string;
    role: PropertySourceRole;
    basicCaptureFollowUp: boolean;
    sourceConfirmed: boolean;
  } | null>(null);
  const [pendingFloorTransition, setPendingFloorTransition] = useState<FloorTransitionProposal | null>(null);
  const [quickErrors, setQuickErrors] = useState<Record<string, string>>({});
  const [areaValidation, setAreaValidation] = useState({ required: false });
  const [locationBusy, setLocationBusy] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const demoMetadata = captureDetails.demoMetadata;
  const demoCategory = getDemoCategory(demoMetadata?.categoryId);
  const isStudioCaptureBlocked = hasInvalidExplicitPropertyType || isGenericStudioCaptureBlocked(
    routeApartmentSubtype,
    selectedPropertyType,
    captureDetails.apartmentSubtype,
    demoMetadata?.categoryId ? canonicalApartmentSubtypeForCategory(demoMetadata.categoryId) : undefined,
  );
  const studioCaptureBlockedMessage = language === 'ar'
    ? 'تحتوي هذه المسودة على بيانات استوديو. الحفظ من نموذج العقار العام متوقف؛ لا تتابع الحفظ من هنا.'
    : 'This draft contains Studio data. Saving from the generic Property form is disabled; do not save it here.';
  const studioDraftTransferWarning = language === 'ar'
    ? 'سيتم فتح مسودة استوديو جديدة. لن تُنقل تفاصيل مسودة العقار العامة، وستبقى المسودة العامة متاحة عند الرجوع.'
    : 'This opens a new Studio draft. Details from the generic Property draft will not be copied; the generic draft remains available if you go back.';
  const openDedicatedStudio = () => {
    const transaction = routeTransaction === undefined
      ? draft.transaction === 'sale' || draft.transaction === 'rent'
        ? draft.transaction
        : undefined
      : routeTransaction === 'sale' || routeTransaction === 'rent'
        ? routeTransaction
        : undefined;
    const target = getLegacyStudioCaptureEscapeTarget(transaction, linkPersonId, sourceRole);
    router.push({ pathname: target.pathname, params: target.params } as never);
  };
  const webBlobStore = useRef<WebAttachmentBlobStore | null>(null);
  if (Platform.OS === 'web' && !webBlobStore.current) webBlobStore.current = createIndexedDbWebAttachmentBlobStore();
  const attachmentStore = Platform.OS === 'web'
    ? createWebAttachmentFileStore(webBlobStore.current!)
    : createExpoFileStore(FileSystem);
  const captureAttachments = (captureDetails.attachments ?? []).map(item => ({
    id: item.id,
    kind: item.kind,
    originalName: item.originalName,
    mimeType: item.mimeType,
    uri: item.managedUri,
    order: item.order,
    ...(item.isCover ? { isCover: true as const } : {}),
  })).sort((left, right) => left.order - right.order) as LocalAttachment[];


  const [captureImageSources, setCaptureImageSources] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    let active = true;
    let revoke = () => {};
    setCaptureImageSources({});
    if (Platform.OS !== 'web') return;
    const images = (captureDetails.attachments ?? [])
      .filter(item => item.kind === 'image')
      .map(item => ({ id: item.id, kind: item.kind, uri: item.managedUri }));
    void resolveWebAttachmentImageSources(images, webBlobStore.current!)
      .then(resolved => {
        if (!active) { resolved.revoke(); return; }
        revoke = resolved.revoke;
        setCaptureImageSources(resolved.sources);
      })
      .catch(() => {
        if (active) Alert.alert(t('errors.storage_title'), t('enrich.attachment_failed'));
      });
    return () => { active = false; revoke(); };
  }, [draft.propertyCoreId, captureDetails.attachments, t]);

  const scopeKey = captureDetailsScopeKey(draft.propertyCoreId);
  const mapsLinkError = getCaptureMapsLinkValidationError(captureDetails.mapsLink)
    ? t('enrich.maps_link_invalid')
    : null;
  const applicable = useMemo(
    () => draft.propertyType
      ? getApplicablePropertyFormFields(draft.propertyType, captureDetails.floorUse as 'residential' | 'commercial' | undefined, captureDetails.apartmentSubtype as ApartmentSubtype | undefined, captureDetails.propertyUse as 'residential' | 'commercial' | undefined)
      : [],
    [captureDetails.floorUse, captureDetails.apartmentSubtype, captureDetails.propertyUse, draft.propertyType],
  );
  const previewFeatureLabels = Array.from(new Set([
    ...applicable
      .filter(definition => definition.group === 'amenity' && captureDetails[definition.field] === 'true')
      .map(definition => definition.label[language === 'ar' ? 1 : 0]),
    ...(demoMetadata?.selectedFeatures ?? [])
      .filter(id => !isDemoFeatureSuppressed(id, draft.propertyType ?? 'other_built_property', captureDetails as Record<string, unknown>, captureDetails.floorUse))
      .map(id => demoCategory?.features.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0] ?? id),
  ]));
  const selectedArea = draft.locationAreaId ? getAreaById(draft.locationAreaId) : undefined;
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
       replaceCaptureDetails(preserveCaptureOwnershipAndEvidence(currentDetails));
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
         ...preserveCaptureOwnershipAndEvidence(currentDetails),
         ...(canonicalApartmentSubtypeForCategory(category.id) ? { apartmentSubtype: canonicalApartmentSubtypeForCategory(category.id) } : {}),
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
       const sharedArea = preserveCaptureOwnershipAndEvidence(currentDetails);
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

  const commitCaptureAttachments = async (next: readonly LocalAttachment[]) => {
    if (!next.length) return;
    const hasCover = captureAttachments.some(item => item.isCover);
    let newCoverAssigned = false;
    const accepted = updateCaptureDetails({
      attachments: [
        ...(captureDetails.attachments ?? []),
        ...next.map((item, index) => {
          const makeCover = !hasCover && !newCoverAssigned && item.kind === 'image';
          if (makeCover) newCoverAssigned = true;
          return {
            id: item.id, kind: item.kind, originalName: item.originalName, mimeType: item.mimeType,
            order: captureAttachments.length + index, managedUri: item.uri,
            ...(makeCover ? { isCover: true as const } : {}),
            privacy: { classification: 'normal' as const, disclosurePolicy: 'normal' as const },
          };
        }),
      ],
    });
    try {
      await persistNewAttachmentsOrDeleteOnFailure(next, async () => accepted && await persistCaptureDetails(), attachmentStore);
    } catch {
      replaceCaptureDetails(captureDetails);
    }
  };

  const addCaptureMedia = async (mediaTypes: ('images' | 'videos')[]) => {
    if (attachmentBusy || !draft.propertyCoreId) return;
    setAttachmentBusy(true);
    try {
      const next = await pickAndStoreMedia(draft.propertyCoreId, captureAttachments, {
        fileStore: attachmentStore,
      }, undefined, mediaTypes);
      await commitCaptureAttachments(next);
    } catch (cause) {
      Alert.alert(t('errors.storage_title'), cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
    } finally {
      setAttachmentBusy(false);
    }
  };

  const addCapturePdfs = async () => {
    if (attachmentBusy || !draft.propertyCoreId) return;
    setAttachmentBusy(true);
    try {
      const next = await pickAndStorePdfs(draft.propertyCoreId, captureAttachments, DocumentPicker, {
        fileStore: attachmentStore,
      });
      if (next.length) {
        await commitCaptureAttachments(next);
      }
    } catch (cause) {
      Alert.alert(t('errors.storage_title'), cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
    } finally {
      setAttachmentBusy(false);
    }
  };

  const addCaptureWebFiles = async (files: readonly { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }[]) => {
    if (attachmentBusy || !files.length || !draft.propertyCoreId || !webBlobStore.current) return;
    setAttachmentBusy(true);
    try {
      await commitCaptureAttachments(await createWebFileAttachments(draft.propertyCoreId, captureAttachments, files, undefined, webBlobStore.current!));
    } catch (cause) {
      Alert.alert(t('errors.storage_title'), cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
    } finally {
      setAttachmentBusy(false);
    }
  };

  const changeCaptureAttachments = async (transform: (items: readonly LocalAttachment[]) => readonly LocalAttachment[]): Promise<boolean> => {
    if (attachmentBusy) return false;
    setAttachmentBusy(true);
    const previous = captureDetails;
    try {
      const next = transform(captureAttachments).map(item => {
        const existing = previous.attachments?.find(value => value.id === item.id)!;
        const { isCover: _cover, ...metadata } = existing;
        return { ...metadata, order: item.order, ...(item.isCover ? { isCover: true as const } : {}) };
      });
      if (!updateCaptureDetails({ attachments: next.length ? next : undefined }) || !await persistCaptureDetails()) {
        replaceCaptureDetails(previous);
        return false;
      }
      return true;
    } catch {
      replaceCaptureDetails(previous);
      Alert.alert(t('errors.storage_title'), t('enrich.attachment_failed'));
      return false;
    } finally {
      setAttachmentBusy(false);
    }
  };

  const moveCaptureAttachment = (attachment: LocalAttachment, delta: number) => changeCaptureAttachments(items => {
    const ids = items.map(item => item.id);
    const index = ids.indexOf(attachment.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return items;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return reorderAttachments(items, ids);
  });

  const removeCaptureAttachment = async (attachment: LocalAttachment) => {
    const persisted = await changeCaptureAttachments(items => {
      let next = items.filter(item => item.id !== attachment.id).map((item, order) => ({ ...item, order }));
      if (!next.some(item => item.isCover)) {
        const firstImage = next.find(item => item.kind === 'image');
        if (firstImage) next = setAttachmentCover(next, firstImage.id);
      }
      return next;
    });
    if (!persisted) return;
    try {
      await attachmentStore.delete(attachment.uri);
    } catch {
      // Metadata is already durably removed; a missing local file is harmless.
    }
  };

  const captureCurrentCoordinates = async () => {
    if (locationBusy) return;
    setLocationBusy(true);
    try {
      const coordinates = await requestCurrentCoordinates();
      updateCaptureDetails({
        coordinates: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          privacy: { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' },
        },
      });
    } catch {
      Alert.alert(t('errors.storage_title'), t('enrich.location_failed'));
    } finally {
      setLocationBusy(false);
    }
  };

  const openCaptureMapsLink = async () => {
    const link = captureDetails.mapsLink?.trim() ?? '';
    const query = selectedArea ? (language === 'ar' ? selectedArea.ar : selectedArea.en) : 'Kuwait';
    if (mapsLinkError) return;
    try {
      if (Platform.OS === 'web') {
        openStudioWebMapsLocation({ link, query });
      } else if (link) {
        await openPastedLocationLink(pastedMapLocation(normalizeGoogleMapsLink(link)));
      } else {
        await openGoogleMapsQuery(query);
      }
    } catch {
      Alert.alert(t('errors.validation_title'), t('enrich.maps_link_invalid'));
    }
  };

  const openPreview = () => {
    if (isStudioCaptureBlocked) return;
    if (!draft.locationAreaId) {
      setAreaValidation(current => transitionCaptureAreaValidation(current, {
        type: 'preview',
        selected: false,
      }));
    }
    if (!draft.transaction || !draft.propertyType) {
      Alert.alert(t('errors.validation_title'), t('errors.capture_incomplete'));
      return;
    }
    if (!draft.locationAreaId) return;
    if (
      isBasicApartmentFollowUp
      && hasCaptureEnrichmentValues(captureDetails, draft.description?.value || description)
    ) {
      Alert.alert(
        language === 'ar' ? 'توجد تفاصيل محفوظة في المسودة' : 'This draft has saved details',
        language === 'ar'
          ? 'تحتوي هذه المسودة على مواصفات أو موقع دقيق أو مرفقات. تم إيقاف الحفظ الأساسي لحمايتها. اعرض نموذج التفاصيل الكامل واحفظها مع العقار، أو ألغِ للاحتفاظ بالمسودة.'
          : 'This draft contains specifications, precise location, or attachments. BASIC save is paused to protect them. Review the full details form and save them with the property, or cancel to keep the draft.',
        [
          { text: language === 'ar' ? 'الاحتفاظ بالمسودة' : 'Keep draft', style: 'cancel' },
          {
            text: language === 'ar' ? 'مراجعة التفاصيل' : 'Review details',
            onPress: () => setReviewApartmentDetails(true),
          },
        ],
      );
      return;
    }
    if (!isBasicApartmentFollowUp && getCaptureMapsLinkValidationError(captureDetails.mapsLink)) return;
    if (!isBasicApartmentFollowUp && Object.keys(quickErrors).length > 0) {
      Alert.alert(t('errors.validation_title'), language === 'ar' ? 'صحح القيم غير الصالحة أولاً.' : 'Correct the invalid numeric values first.');
      return;
    }
    const projection = projectToProperty();
    if (!projection.ok) {
      Alert.alert(t('errors.validation_title'), t('errors.capture_incomplete'));
      return;
    }
    setSaveError(null);
    setStage(3);
  };

  const replaceWithCaptureSuccess = (
    propertyCoreId: string,
    basicFollowUp: boolean,
    personId?: string,
    role?: PropertySourceRole,
  ) => {
    router.replace({
      pathname: '/capture/success',
      params: {
        propertyCoreId,
        ...(basicFollowUp ? { basicCaptureFollowUp: '1' } : {}),
        ...(personId ? { linkPersonId: personId } : {}),
        ...(role ? { sourceRole: role } : {}),
      },
    } as never);
  };

  const save = async () => {
    if (isStudioCaptureBlocked) return;
    if (saveFlight.current) return;
    saveFlight.current = true;
    setSaveError(null);
    setSubmitting(true);
    try {
      const pendingSourceLink = sourceLinkRecoveryRef.current;
      if (pendingSourceLink) {
        if (!pendingSourceLink.sourceConfirmed) {
          await ensureStudioPropertySourceLink(
            pendingSourceLink.propertyCoreId,
            pendingSourceLink.personId,
            pendingSourceLink.role,
            store,
          );
          sourceLinkRecoveryRef.current = { ...pendingSourceLink, sourceConfirmed: true };
        }
        const detailsCleared = await clearCaptureDetails(pendingSourceLink.propertyCoreId);
        if (!detailsCleared && Object.keys(captureDetails).length > 0) {
          throw new Error('CAPTURE_DETAILS_CLEANUP_FAILED');
        }
        sourceLinkRecoveryRef.current = null;
        replaceWithCaptureSuccess(
          pendingSourceLink.propertyCoreId,
          pendingSourceLink.basicCaptureFollowUp,
          pendingSourceLink.personId,
          pendingSourceLink.role,
        );
        return;
      }

      const projection = projectToProperty();
      if (!projection.ok) {
        Alert.alert(t('errors.validation_title'), t('errors.capture_incomplete'));
        return;
      }

      // Resolve the exact source role before creating the Property. Missing or
      // ambiguous Person context is rejected; no default owner is inferred.
      let resolvedSourceRole: PropertySourceRole | null = null;
      if (linkPersonId) {
        const linkedPerson = await store.getPerson(linkPersonId);
        if (!linkedPerson) {
          throw new Error('SOURCE_ROLE_MISMATCH');
        }
        resolvedSourceRole = getStudioPersonSourceRole(linkedPerson, sourceRole);
        if (!resolvedSourceRole) {
          throw new Error('SOURCE_ROLE_MISMATCH');
        }
      }
      const candidate = isBasicApartmentFollowUp
        ? buildPropertyWithCaptureDetails(projection.property, { apartmentSubtype: 'standard_apartment' }, true)
        : buildPropertyWithCaptureDetails(projection.property, captureDetails, true);
      const evidence = candidate
        ? await prepareCapturedDetails(projection.property, candidate)
        : null;
      const result = await savePropertyWithRecovery(projection.property);
      if (result.status !== 'complete') {
        Alert.alert(t('errors.storage_title'), t('errors.storage_save'));
        return;
      }
      if (evidence) {
        await finalizeCapturedDetails(store, evidence);
      }
      if (linkPersonId && resolvedSourceRole) {
        const sourceRecovery = {
          propertyCoreId: projection.property.core.id,
          personId: linkPersonId,
          role: resolvedSourceRole,
          basicCaptureFollowUp: isBasicCaptureFollowUp,
          sourceConfirmed: false,
        };
        sourceLinkRecoveryRef.current = sourceRecovery;
        await ensureStudioPropertySourceLink(
          projection.property.core.id,
          linkPersonId,
          resolvedSourceRole,
          store,
        );
        sourceLinkRecoveryRef.current = {
          ...sourceRecovery,
          sourceConfirmed: true,
        };
      }
      const detailsCleared = await clearCaptureDetails(projection.property.core.id);
      if (!detailsCleared && Object.keys(captureDetails).length > 0) {
        throw new Error('CAPTURE_DETAILS_CLEANUP_FAILED');
      }
      sourceLinkRecoveryRef.current = null;
      replaceWithCaptureSuccess(
        projection.property.core.id,
        isBasicCaptureFollowUp,
        linkPersonId,
        resolvedSourceRole ?? undefined,
      );
    } catch (error) {
      console.error('Capture workflow save failed:', error);
      const message = sourceLinkRecoveryRef.current && !sourceLinkRecoveryRef.current.sourceConfirmed
        ? (language === 'ar'
          ? 'تم حفظ العقار، لكن لم يتم تأكيد ربط الشخص. أعد المحاولة لتأكيد الربط نفسه؛ لن يُحفظ العقار مرة أخرى.'
          : 'The property was saved, but the Person link was not confirmed. Retry to verify the same link; the property will not be saved again.')
        : sourceLinkRecoveryRef.current
        ? (language === 'ar'
          ? 'تم تأكيد ربط الشخص، لكن تعذر تنظيف بيانات المسودة. أعد المحاولة لإكمال الحفظ.'
          : 'The Person link is confirmed, but capture-draft cleanup failed. Retry to complete the save.')
        : error instanceof Error && error.message === 'SOURCE_ROLE_MISMATCH'
        ? (language === 'ar'
          ? 'تعذر التحقق من دور الشخص المحدد. اختر دوراً صالحاً وحاول مرة أخرى.'
          : 'The selected Person source role could not be verified. Choose a valid role and try again.')
        : error instanceof Error && error.message === 'INVALID_LOCATION_LINK'
        ? t('enrich.maps_link_invalid')
        : error instanceof Error && error.message === 'FLOOR_USE_REQUIRED'
        ? (language === 'ar'
          ? 'اختر الاستخدام السكني أو التجاري للدور قبل حفظ تفاصيله.'
          : 'Choose Residential or Commercial Floor use before saving Floor details.')
        : error instanceof Error && error.message === 'FLOOR_CAPTURE_DETAIL_INCOMPATIBLE'
        ? (language === 'ar'
          ? 'بعض تفاصيل الدور لا تتوافق مع الاستخدام المحدد. صحح التفاصيل ثم أعد المحاولة.'
          : 'Some Floor details do not match the selected use. Correct them before saving.')
        : error instanceof Error && error.message.startsWith('INVALID_CAPTURE_DETAILS:')
        ? (language === 'ar'
          ? 'تحقق من أعداد الوحدات: يجب ألا يتجاوز مجموع الشقق والمحلات والمكاتب عدد الوحدات، ثم أعد المحاولة.'
          : 'Check the unit totals: apartments, shops, and offices together cannot exceed the unit count. Correct the details and try again.')
        : t('errors.storage_save');
      setSaveError(message);
      if (Platform.OS !== 'web') Alert.alert(t('errors.validation_title'), message);
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

  const handleBack = () => {
    const action = getCaptureBackAction(stage, router.canGoBack(), {
      mode: 'offered', transaction: draft.transaction, linkPersonId, sourceRole,
    });
    if (action.kind === 'edit') { setStage(2); return; }
    if (action.kind === 'back') { router.back(); return; }
    router.replace(action.route as never);
  };
  const goHome = async () => {
    if (draftSaveStatus === 'saving' || submitting) return;
    setDraftSaveStatus('saving');
    try {
      if (!await persistCurrentCapture()) { setDraftSaveStatus('error'); return; }
      setDraftSaveStatus('saved');
      router.replace('/' as never);
    } catch { setDraftSaveStatus('error'); }
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
          <TouchableOpacity onPress={handleBack} style={navigationButtonStyle} testID="capture-form-back" accessibilityRole="button" accessibilityLabel={t('capture.back')}>
            <Text style={[navigationButtonTextStyle, { fontFamily: fonts.semiBold }]}>{t('capture.back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('home.action.addProperty')}</Text>
          <TouchableOpacity onPress={() => void goHome()} style={navigationButtonStyle} testID="capture-form-home" disabled={draftSaveStatus === 'saving' || submitting} accessibilityRole="button" accessibilityLabel={t('home.title')}>
            <Text style={[navigationButtonTextStyle, { fontFamily: fonts.semiBold }]}>{t('home.title')}</Text>
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
        {isStudioCaptureBlocked ? (
          <View
            accessibilityRole="alert"
            testID="capture-studio-route-blocked"
            style={[styles.saveError, { borderColor: colors.destructive, backgroundColor: colors.destructive + '0F' }]}
          >
            <Text style={{ color: colors.destructive, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>
              {studioCaptureBlockedMessage}
            </Text>
            <Text style={{ color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left', marginTop: 8 }}>
              {studioDraftTransferWarning}
            </Text>
            <Button
              title={language === 'ar' ? 'فتح نموذج الاستوديو' : 'Open Studio form'}
              onPress={openDedicatedStudio}
              variant="secondary"
              style={{ marginTop: 12 }}
              testID="capture-open-dedicated-studio"
            />
          </View>
        ) : null}
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
                {getGenericCaptureTypesForTransaction(PROPERTY_FORM_TYPES, draft.transaction).map(type => (
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
              <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{draft.transaction ? t(`transaction.${draft.transaction}` as keyof Translations) : ''}</Text>
               <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'المنطقة' : 'Area / Region'}</Text>
               <KuwaitAreaSelector
                 selectedIds={draft.locationAreaId ? [draft.locationAreaId] : []}
                  onCancel={() => setAreaValidation(current => transitionCaptureAreaValidation(current, { type: 'cancel' }))}
                  onChange={ids => {
                    updateDraft({ locationAreaId: ids[0] });
                    if (ids[0]) {
                      setAreaValidation(current => transitionCaptureAreaValidation(current, { type: 'select' }));
                    }
                  }}
                 multiSelect={false}
                 testID="capture-area"
               />
                {areaValidation.required ? (
                  <Text
                    testID="capture-area-error"
                    accessibilityRole="alert"
                    style={{ color: colors.destructive, fontFamily: fonts.medium, marginTop: 6 }}
                  >
                    {language === 'ar' ? 'اختر المنطقة للمتابعة.' : 'Select an area to continue.'}
                  </Text>
                ) : null}
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
              {!isBasicApartmentFollowUp && (
                <>
               <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'المساحة (م²)' : 'Area (m²)'}</Text>
              <TextInput value={metadataValue(captureDetails.areaSquareMeters)} onChangeText={value => {
                const normalized = value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٫,]/g, '.');
                const number = Number(normalized);
                 if (normalized === '' || Number.isFinite(number)) updateCaptureDetails({ areaSquareMeters: normalized === '' ? undefined : number, areaUnit: 'square_meter' });
              }} keyboardType="decimal-pad" placeholder={language === 'ar' ? 'اختياري' : 'Optional'} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
              <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'الوصف' : 'Description'}</Text>
              <TextInput value={description} onChangeText={updateDescription} multiline placeholder={language === 'ar' ? 'تفاصيل إضافية' : 'Additional details'} placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
                </>
              )}
            </Section>
            {!isBasicApartmentFollowUp && (
              <>
            <Section title={language === 'ar' ? 'المواصفات' : 'Property specifications'} colors={colors} fonts={fonts}>
              <ModernPropertyForm
                requireExactValue
                transaction={draft.transaction}
                salePrice={draft.salePrice?.amount}
                recordScopeKey={scopeKey}
                propertyType={draft.propertyType ?? 'other_built_property'}
                values={captureDetails}
                hideFloorUse={Boolean(captureDetails.floorUse)}
                hideApartmentSubtype={Boolean(draft.apartmentSubtype || captureDetails.apartmentSubtype)}
                hidePropertyUse={Boolean(captureDetails.propertyUse)}
                category={demoCategory}
                metadata={demoMetadata}
                nearby={nearby}
                language={language}
                colors={colors}
                fonts={fonts}
                onChange={(field: PropertyDetailField, value: string) => field === 'floorUse' ? chooseFloorUse(value) : updateCaptureDetails({ [field]: value })}
                onDemoChange={updateDemoMetadata}
                onNearbyChange={next => {
                  setNearby([...next]);
                  updateCaptureDetails({ nearbyServices: JSON.stringify(next), ...(demoCategory ? { demoMetadata: { ...demoMetadata, categoryId: demoCategory.id, nearbyServices: next } } : {}) });
                }}
                onInvalidQuickPickChange={(field, _scopeKey, invalid) => setQuickErrors(current => {
                  const next = { ...current };
                  if (invalid) next[field] = language === 'ar' ? 'أدخل قيمة صحيحة.' : 'Enter a valid value.';
                  else delete next[field];
                  return next;
                })}
              />
            </Section>
            <Section title={language === 'ar' ? 'الموقع الدقيق والمرفقات' : 'Precise location and attachments'} colors={colors} fonts={fonts}>
              <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('enrich.maps_link')}</Text>
              <TextInput
                value={captureDetails.mapsLink ?? ''}
                onChangeText={value => updateCaptureDetails({ mapsLink: value || undefined })}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
                accessibilityLabel={t('enrich.maps_link')}
                accessibilityHint={mapsLinkError ?? undefined}
                testID="capture-maps-link"
              />
              {mapsLinkError ? (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  testID="capture-maps-link-error"
                  style={{ color: colors.destructive, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}
                >
                  {mapsLinkError}
                </Text>
              ) : null}
              <View style={styles.chips}>
                <Choice selected={Boolean(captureDetails.coordinates)} label={t('enrich.current_location')} onPress={() => void captureCurrentCoordinates()} colors={colors} fonts={fonts} />
                <Choice selected={false} label={t('enrich.open_maps')} onPress={() => void openCaptureMapsLink()} colors={colors} fonts={fonts} />
              </View>
              {captureDetails.coordinates ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>
                  {`${captureDetails.coordinates.latitude}, ${captureDetails.coordinates.longitude}`}
                </Text>
              ) : null}
              <View style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {Platform.OS === 'web' ? <>
                  <AttachmentPickerControl label={t('enrich.add_images')} accept="image/*" testID="capture-add-images" disabled={attachmentBusy} onFiles={files => void addCaptureWebFiles(files)} />
                  <AttachmentPickerControl label={t('enrich.add_videos')} accept="video/*" testID="capture-add-videos" disabled={attachmentBusy} onFiles={files => void addCaptureWebFiles(files)} />
                  <AttachmentPickerControl label={t('enrich.add_files')} accept=".pdf,application/pdf" testID="capture-add-files" disabled={attachmentBusy} onFiles={files => void addCaptureWebFiles(files)} />
                </> : <>
                  <TouchableOpacity onPress={() => void addCaptureMedia(['images'])} disabled={attachmentBusy} style={[styles.choice, { borderColor: colors.border, backgroundColor: colors.card }]} testID="capture-add-images">
                    <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('enrich.add_images')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void addCaptureMedia(['videos'])} disabled={attachmentBusy} style={[styles.choice, { borderColor: colors.border, backgroundColor: colors.card }]} testID="capture-add-videos">
                    <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('enrich.add_videos')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void addCapturePdfs()} disabled={attachmentBusy} style={[styles.choice, { borderColor: colors.border, backgroundColor: colors.card }]} testID="capture-add-files">
                    <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('enrich.add_files')}</Text>
                  </TouchableOpacity>
                </>}
              </View>
              {captureAttachments.map((attachment, index) => (
                <View key={attachment.id} style={[styles.choice, { borderColor: colors.border, backgroundColor: colors.card, marginTop: 8, justifyContent: 'space-between' }]}>
                  <TouchableOpacity onPress={() => void openAttachment(attachment, Sharing).catch(() => Alert.alert(t('errors.storage_title'), t('enrich.attachment_failed')))} testID={`capture-open-${attachment.id}`}>
                    {attachment.kind === 'image' && (Platform.OS !== 'web' || captureImageSources[attachment.id]) ? <Image source={{ uri: Platform.OS === 'web' ? captureImageSources[attachment.id] : attachment.uri }} style={{ width: 96, height: 72, borderRadius: 8, resizeMode: 'cover' }} /> : null}
                    <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{attachment.isCover ? '★ ' : ''}{attachment.originalName}</Text>
                  </TouchableOpacity>
                  <View style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Button title={t('enrich.move_up')} disabled={attachmentBusy || index === 0} onPress={() => void moveCaptureAttachment(attachment, -1)} testID={`capture-up-${attachment.id}`} />
                    <Button title="↓" disabled={attachmentBusy || index === captureAttachments.length - 1} onPress={() => void moveCaptureAttachment(attachment, 1)} testID={`capture-down-${attachment.id}`} />
                    {attachment.kind === 'image' ? <Button title={t('enrich.cover')} disabled={attachmentBusy} onPress={() => void changeCaptureAttachments(items => setAttachmentCover(items, attachment.id))} testID={`capture-cover-${attachment.id}`} /> : null}
                  </View>
                  <TouchableOpacity disabled={attachmentBusy} onPress={() => void removeCaptureAttachment(attachment)} testID={`capture-remove-${attachment.id}`}>
                    <Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{t('enrich.remove')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{t('enrich.attachment_privacy')}</Text>
            </Section>
              </>
            )}
          </>
        )}

        {stage === 3 && (
          <Section title={language === 'ar' ? 'مراجعة وتأكيد' : 'Preview and confirmation'} colors={colors} fonts={fonts}>
            {saveError ? (
              <View
                accessibilityRole="alert"
                testID="capture-save-validation-error"
                style={[styles.saveError, { borderColor: colors.destructive, backgroundColor: colors.destructive + '0F' }]}
              >
                <Text style={{ color: colors.destructive, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>
                  {saveError}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity onPress={() => { setSaveError(null); setStage(2); }} accessibilityRole="button" testID="capture-preview-back-edit" style={[styles.previewEdit, navigationButtonStyle]}>
              <Text style={[navigationButtonTextStyle, { fontFamily: fonts.semiBold }]}>{t('detail.edit')}</Text>
            </TouchableOpacity>
            <Text style={[styles.previewTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{demoCategory?.label[language === 'ar' ? 1 : 0] ?? (draft.propertyType ? (draft.propertyType === 'floor' ? getFloorTypeLabel(captureDetails.floorUse, language, t('propertyType.floor')) : t(`propertyType.${draft.propertyType}` as keyof Translations)) : '')}</Text>
            <Text style={[styles.previewMeta, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>{selectedArea ? (language === 'ar' ? selectedArea.ar : selectedArea.en) : ''}</Text>
            <PreviewRow label={t('summary.transaction')} value={projectRecordIntent('offered', draft.transaction, language).label} colors={colors} fonts={fonts} />
            <PreviewRow label={t('summary.property_type')} value={draft.propertyType ? (draft.propertyType === 'floor' ? getFloorTypeLabel(captureDetails.floorUse, language, t('propertyType.floor')) : t(`propertyType.${draft.propertyType}` as keyof Translations)) : ''} colors={colors} fonts={fonts} />
            <PreviewRow label={language === 'ar' ? 'القطعة' : 'Block'} value={draft.block ?? ''} colors={colors} fonts={fonts} />
            <PreviewRow label={draft.transaction === 'rent' ? t('summary.rent_price') : t('summary.sale_price')} value={String((draft.transaction === 'rent' ? draft.rentalPrice?.amount : draft.salePrice?.amount) ?? '')} colors={colors} fonts={fonts} />
            {draft.transaction === 'rent' && <PreviewRow label={language === 'ar' ? 'الدورية' : 'Cadence'} value={draft.rentalPeriodId === 'yearly' ? (language === 'ar' ? 'سنوياً' : 'Yearly') : (language === 'ar' ? 'شهرياً' : 'Monthly')} colors={colors} fonts={fonts} />}
            {!isBasicApartmentFollowUp && (
              <>
             <PreviewRow label={language === 'ar' ? 'المساحة (م²)' : 'Area (m²)'} value={captureDetails.areaSquareMeters === undefined ? '' : `${captureDetails.areaSquareMeters} ${language === 'ar' ? 'متر مربع' : 'm²'}`} colors={colors} fonts={fonts} />
             {draft.propertyType === 'commercial_complex' && draft.transaction === 'sale' && <PreviewRow label={language === 'ar' ? 'العائد الإيجاري السنوي الإجمالي' : 'Gross annual rental yield'} value={(() => { const result = grossAnnualRentalYield(draft.salePrice?.amount, captureDetails.monthlyIncome?.trim() ? Number(captureDetails.monthlyIncome) : undefined); return result === undefined ? '—' : `${result.toFixed(2)}%`; })()} colors={colors} fonts={fonts} />}
             {applicable.filter(definition => definition.group !== 'amenity' && captureDetails[definition.field] !== undefined && (definition.field !== 'privateParkingCount' || captureDetails.parkingTypes?.split(',').includes('private'))).map(definition => <PreviewRow key={definition.field} label={definition.label[language === 'ar' ? 1 : 0]} value={formatPropertyDetailValue(definition.field, captureDetails[definition.field], language, key => t(key as keyof Translations))} colors={colors} fonts={fonts} />)}
            {nearby.length > 0 && <PreviewRow label={language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'} value={nearby.map(id => DEMO_NEARBY_SERVICES.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0]).join(', ')} colors={colors} fonts={fonts} />}
            <PreviewRow label={language === 'ar' ? 'الوصف' : 'Description'} value={description} colors={colors} fonts={fonts} />
             {demoCategory?.numericFields.filter(item => !isMappedTemplateField(item.id) && demoMetadata?.numericValues?.[item.id] !== undefined).map(item => (
               <PreviewRow key={item.id} label={item.label[language === 'ar' ? 1 : 0]} value={metadataValue(demoMetadata?.numericValues?.[item.id])} colors={colors} fonts={fonts} />
            ))}
             {demoCategory?.choices.filter(item => !isMappedTemplateField(item.id) && demoMetadata?.choices?.[item.id] !== undefined).map(item => (
              <PreviewRow key={item.id} label={item.label[language === 'ar' ? 1 : 0]} value={item.options.find(option => option.id === demoMetadata?.choices?.[item.id])?.label[language === 'ar' ? 1 : 0] ?? ''} colors={colors} fonts={fonts} />
            ))}
              {previewFeatureLabels.length ? <PreviewRow label={language === 'ar' ? 'المزايا المتوفرة في العقار' : 'Available Property Features'} value={previewFeatureLabels.join(', ')} colors={colors} fonts={fonts} /> : null}
             {captureDetails.mapsLink ? <PreviewRow label={t('enrich.maps_link')} value={captureDetails.mapsLink} colors={colors} fonts={fonts} /> : null}
             {captureDetails.coordinates ? <PreviewRow label={language === 'ar' ? 'الإحداثيات الدقيقة' : 'Exact coordinates'} value={`${captureDetails.coordinates.latitude}, ${captureDetails.coordinates.longitude}`} colors={colors} fonts={fonts} /> : null}
             {captureAttachments.length ? <PreviewRow label={language === 'ar' ? 'المرفقات' : 'Attachments'} value={captureAttachments.map(item => item.originalName).join(', ')} colors={colors} fonts={fonts} /> : null}
              </>
            )}
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
        {stage === 2 ? <Button title={language === 'ar' ? 'حفظ كمسودة' : 'Save Draft'} onPress={saveDraft} variant="outline" loading={draftSaveStatus === 'saving'} disabled={draftSaveStatus === 'saving'} testID="capture-save-draft" /> : <Button title={t('capture.back')} onPress={handleBack} variant="navigation" testID="capture-back" />}
      {stage === 1 ? <Button title={t('capture.next')} onPress={() => draft.transaction && draft.propertyType && (!demoCategory || draft.transaction === demoCategory.transaction) ? setStage(2) : Alert.alert(t('errors.validation_title'), t('errors.capture_incomplete'))} disabled={isStudioCaptureBlocked || !draft.transaction || !draft.propertyType || Boolean(demoCategory && draft.transaction !== demoCategory.transaction)} testID="capture-next" /> : stage === 2 ? <Button title={language === 'ar' ? 'معاينة' : 'Preview'} onPress={openPreview} disabled={isStudioCaptureBlocked} testID="capture-preview" /> : <Button title={t('summary.submit')} onPress={save} loading={submitting} disabled={isStudioCaptureBlocked} testID="capture-save-property" />}
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
    <ModernPropertyForm
      recordScopeKey="capture"
      propertyType={category.canonicalType}
      values={{}}
      onChange={() => undefined}
      category={category}
      metadata={metadata}
      nearby={metadata?.nearbyServices ?? []}
      language={language}
      colors={colors}
      fonts={fonts}
      onDemoChange={onChange}
      onInvalidQuickPickChange={(field, _scope, invalid) => onQuickError(field, invalid)}
      onNearbyChange={nearby => onChange({ nearbyServices: nearby })}
    />
    /*
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
  */);
}
function QuickCount({ field, value, decimal, colors, fonts, error, onValidity, onChange }: any) {
  const [exact, setExact] = useState(value !== undefined && value > 5 ? String(value) : '');
  const [expanded, setExpanded] = useState(value !== undefined && value > 5);
  useEffect(() => {
    const isExpanded = value !== undefined && value > 5;
    setExpanded(isExpanded);
    if (isExpanded) setExact(String(value));
  }, [value]);
  return <View><View style={styles.chips}>{DEMO_NUMERIC_QUICK_PICK_VALUES.map(number => <Choice key={number} testID={`capture-quick-${field}-${number}`} selected={value === number} label={String(number)} onPress={() => { const selected = selectNumericQuickPick(number, DEMO_NUMERIC_QUICK_PICK_VALUES); setExpanded(false); setExact(''); onValidity(field, false); onChange(Number(selected)); }} colors={colors} fonts={fonts} />)}<Choice testID={`capture-quick-${field}-more`} selected={expanded && value !== undefined && value >= 6} label="+6" onPress={() => { const transition = openNumericQuickPickMore(); setExpanded(transition.expanded); setExact(transition.value); onValidity(field, false); onChange(Number(transition.value)); }} colors={colors} fonts={fonts} /></View>{(expanded || value !== undefined && value >= 6) && <><TextInput testID={`capture-quick-${field}-exact`} value={exact} onChangeText={text => { setExact(text); if (text === '') { onValidity(field, false); onChange(undefined); return; } const number = parseDemoNumericInput(text, decimal); const valid = number !== null && number >= 6; onValidity(field, !valid); if (valid) onChange(number); }} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} placeholder="6+" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: error ? colors.destructive : colors.border, backgroundColor: colors.card }]} />{error ? <Text testID={`capture-quick-${field}-error`} style={{ color: colors.destructive, marginTop: 4 }}>{error}</Text> : null}</>}</View>;
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
  saveError: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  previewMeta: { marginBottom: 14 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  previewLabel: { flex: 1, fontSize: 13 },
  previewValue: { flex: 1, textAlign: 'right', fontSize: 13 },
  demoField: { marginBottom: 10 },
});
