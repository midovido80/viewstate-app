import { isMissingPositiveAmount } from '@/services/screenInsets';
import { CompactPropertySpecs } from '@/components/CompactPropertySpecs';
import { compactPropertySpecs } from '@/services/compactPropertyDetails';
import { type PropertySpecIconName } from '@/components/PropertySpecIcon';
import { ApprovedAction, approvedNavigationStyle, approvedActionStyle } from '@/components/ApprovedActions';
import { filterPropertySourcePeople, suggestPropertySourceRole, retainVisibleSourceSelection, type PropertySourceClassificationFilter } from '@/services/propertySourceSelection';
import { ChoiceChip } from '@/components/ChoiceChip';
import { ChoiceFact, ChoiceGrid } from '@/components/ChoiceTile';
import { assertPropertyDetailsEditClassification, assertSavedPropertyClassificationUnchanged, getSavedPropertyTypeLabel } from '@/services/savedPropertyClassification';
import { navigationButtonStyle, navigationButtonTextStyle } from '@/constants/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Dimensions,
  View,
} from 'react-native';
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Property, PropertyDetailField, Transaction, PropertyDemoCaptureMetadata, createPropertyShareSelection, buildPropertySharePreview } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { warehouseFieldVisible } from '@/services/warehouseForm';
import { formatPropertyDetailValue, propertyDetailDisplayDefinitions, propertyDetailLabels } from '@/components/PropertyEnrichmentFields';
import { ModernPropertyForm } from '@/components/ModernPropertyForm';
import { LocationAttachmentCard, LocationAttachmentRow, LocationAttachmentButton, AttachmentPrivacyNote, locationLinkInputStyle } from '@/components/LocationAttachmentUI';
import { grossAnnualRentalYield } from '@/services/commercialComplexSale';
import { isCommercialFloorSale, isCommercialFloorSaleFieldVisible, commercialFloorSaleFieldRank, commercialFloorSaleLabel } from '@/services/commercialFloorSale';
import { getDemoCategory, DEMO_NEARBY_SERVICES, parseDemoNumericInput } from '@/services/propertyDemoCatalog';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { formatPrice, formatRentalCadence, formatRentalPrice, MARKET_CONFIG, toEnglishDigits } from '@/constants/market';
import { getAreaById, searchAreas } from '@/constants/kuwait-areas';
import { store } from '@/services/persistence';
import {
  Person,
  PROPERTY_SOURCE_ROLES,
  PropertySource,
  PropertySourceRole,
} from '@/services/people';
import { deleteSavedProperty } from '@/services/propertyDeletion';
import { getStudioCatalogFieldLabel } from '@/services/studioCatalog';
import { clearConfirmedPropertyEnrichmentDraft, loadPropertyEnrichmentDraft, type PropertyEnrichmentDraftV1 } from '@/services/propertyEnrichmentRecovery';
import { createExpoFileStore, createIndexedDbWebAttachmentBlobStore, createWebAttachmentFileStore, createWebFileAttachments, openAttachment, pickAndStoreMedia, pickAndStorePdfs, persistAttachmentsThenDeleteRemoved, type LocalAttachment, type WebAttachmentBlobStore } from '@/services/attachments';
import { reorderAttachments, resolveWebAttachmentImageSources, setAttachmentCover } from '@/services/attachmentOperations';
import {
  projectPropertyFacts,
  isDemoFeatureSuppressed,
  isMappedTemplateField,
  squareFeetToSquareMeters,
} from '@/services/propertyFactProjection';
import { normalizeGoogleMapsLink, openGoogleMapsQuery, openPastedLocationLink, pastedMapLocation, requestCurrentCoordinates, openSavedPropertyMapsLocation } from '@/services/location';
import { openStudioWebFilePicker, openStudioWebMapsLocation } from '@/services/studioWebActions';
import {
  PropertyEditDraftV1,
  buildPropertyDetailsUpdateCandidate,
  createEditDraft,
  createPropertyUpdateOperation,
  discardPropertyEditDraft,
  exactPropertyEqual,
  executePropertyUpdateRecovery,
  loadPropertyEditDraft,
  loadPropertyUpdateOperation,
  flushPropertyEditDraftWrites,
  PendingPropertyUpdateExistsError,
  PropertyUpdateOperationV1,
  PropertyUpdateRecoveryResult,
  persistPropertyUpdateOperation,
  savePropertyEditDraft,
} from '@/services/propertyUpdateRecovery';
import { Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  applyPropertyTransition,
  createTransactionTransitionProposal,
  propertyTransitionConfirmationMessage,
  propertyTransitionErrorMessage,
  type PropertyTransitionProposal,
  type PropertyTransitionState,
} from '@/services/propertyTypeTransition';
import { getGalleryIndexFromScrollOffset, getOfferedStudioDetailValues, getPropertyDetailActionHref, getPropertyDetailBackRoute, getPropertyDetailCategoryRows, getPropertyDetailLocationDisplay, getPropertyDetailVisibleContent, isOfferedStudio } from '@/services/propertyDetailPresentation';
import { confirmCommittedPropertyReadback, discardPropertyEditDraftAndCleanupOwnedAttachments, getPropertyDetailMapsHref, getPropertyEditMapsFieldError, propertyEditChoicesAreDirty, shouldShowPropertyGallery } from '@/services/propertyDetailEditorUx';
import { getPropertyEditFormHref } from '@/services/propertyFormRoutes';
import { projectPropertyIntent } from '@/services/recordIntentPresentation';

export function getPropertyEditRouteHref(propertyCoreId: string, offeredStudio: boolean): string {
  return getPropertyEditFormHref(
    propertyCoreId,
    'apartment',
    offeredStudio ? 'studio' : 'standard_apartment',
  );
}

function readNumericDetail(value: unknown): number | undefined {
  const unwrapped = typeof value === 'object' && value !== null && 'value' in value
    ? (value as { value: unknown }).value
    : value;
  return typeof unwrapped === 'number' && Number.isFinite(unwrapped) ? unwrapped : undefined;
}

export function PropertyDetailScreen({ forceEdit = false }: { forceEdit?: boolean } = {}) {
  const { propertyCoreId, edit, completion } = useLocalSearchParams<{
    propertyCoreId?: string | string[];
    edit?: string | string[];
    completion?: string | string[];
  }>();
  const id = Array.isArray(propertyCoreId) ? propertyCoreId[0] : propertyCoreId;
  const completionOrigin = Array.isArray(completion) ? completion[0] : completion;
  const router = useRouter();
  const colors = useColors();
  const insets = useScreenInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const [property, setProperty] = useState<Property | null>(null);
  const standardApartment = Boolean(property?.core.propertyType === 'apartment' && !isOfferedStudio(property));
  const [hasEnrichmentDraft, setHasEnrichmentDraft] = useState(false);
  const [legacyEnrichmentDraft, setLegacyEnrichmentDraft] = useState<PropertyEnrichmentDraftV1 | null>(null);
  const [draft, setDraft] = useState<PropertyEditDraftV1 | null>(null);
  const draftRef = useRef<PropertyEditDraftV1 | null>(null);
  const cleanChoicesRef = useRef<PropertyEditDraftV1['choices'] | null>(null);
  const cleanExitOwnedUrisRef = useRef<readonly string[] | null>(null);
  const [mode, setMode] = useState<'detail' | 'edit'>('detail');
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'unreadable'>('loading');
  const [error, setError] = useState('');
  const [priceAttempted, setPriceAttempted] = useState(false);
  const [pendingPropertyTransition, setPendingPropertyTransition] = useState<{
    proposal: PropertyTransitionProposal;
    title: string;
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveCompletionVisible, setSaveCompletionVisible] = useState(false);
  const saveFlight = useRef(false);
  const draftMutationFlight = useRef<Promise<boolean>>(Promise.resolve(true));
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaSearch, setAreaSearch] = useState('');
  const [leaveVisible, setLeaveVisible] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [mapsFieldError, setMapsFieldError] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const [newAttachmentUris, setNewAttachmentUris] = useState<string[]>([]);
  const [pendingOperation, setPendingOperation] = useState<PropertyUpdateOperationV1 | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<PropertyUpdateRecoveryResult['status'] | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [source, setSource] = useState<PropertySource | null>(null);
  const [sourcePerson, setSourcePerson] = useState<Person | null>(null);
  const [sourcePeople, setSourcePeople] = useState<Person[]>([]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourcePersonId, setSourcePersonId] = useState('');
  const [sourceClassification, setSourceClassification] = useState<PropertySourceClassificationFilter>('all');
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceRole, setSourceRole] = useState<PropertySourceRole>('owner');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceConfirmVisible, setSourceConfirmVisible] = useState(false);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [mapsActionError, setMapsActionError] = useState('');
  const [galleryImageSources, setGalleryImageSources] = useState<Readonly<Record<string, string>>>({});
  const [galleryResolutionError, setGalleryResolutionError] = useState('');
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, 'canonical' | 'legacy'>>({});
  const [invalidQuickPickFields, setInvalidQuickPickFields] = useState<Set<PropertyDetailField>>(new Set());
  const editEntryConsumed = useRef(false);
  const studioEditForwardedId = useRef<string | null>(null);
  const actionFlight = useRef(false);
  const canPermanentlyDelete = store.canPermanentlyDelete();
  const webBlobStore = useRef<WebAttachmentBlobStore | null>(null);
  if (Platform.OS === 'web' && !webBlobStore.current) webBlobStore.current = createIndexedDbWebAttachmentBlobStore();
  const attachmentStore = Platform.OS === 'web'
    ? createWebAttachmentFileStore(webBlobStore.current!)
    : createExpoFileStore(FileSystem);

  const openPropertyAttachment = async (attachment: NonNullable<Property['attachments']>[number]) => {
    if (openingAttachmentId) return;
    setOpeningAttachmentId(attachment.id);
    setError('');
    try {
      await openAttachment({
        id: attachment.id,
        kind: attachment.kind,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        uri: attachment.managedUri,
        order: attachment.order,
        isCover: attachment.isCover ? true : undefined,
      }, Sharing, Platform.OS, undefined, undefined, undefined, webBlobStore.current ?? undefined);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'ATTACHMENT_FILE_MISSING'
        ? t('enrich.attachment_missing')
        : cause instanceof Error && cause.message === 'ATTACHMENT_OPEN_UNAVAILABLE'
          ? t('enrich.attachment_unavailable')
          : t('enrich.attachment_failed'));
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const load = useCallback(async () => {
    if (!id) {
      setHasEnrichmentDraft(false);
      setStatus('missing');
      return;
    }
    setStatus('loading');
    try {
      const pending = await loadPropertyUpdateOperation();
      let completedRecoveryForProperty = false;
      if (pending) {
        if (pending.baseline.core.id === id) {
          const recovered = await executePropertyUpdateRecovery({
            operation: pending,
            allowUpdate: false,
            getProperty: value => store.getProperty(value),
            compareAndUpdate: (baseline, candidate) => store.compareAndUpdate(baseline, candidate),
            attachmentFileStore: attachmentStore,
          });
          if (recovered.status === 'complete') {
            completedRecoveryForProperty = true;
            setPendingOperation(null);
            setRecoveryStatus(null);
          } else {
            setPendingOperation(pending);
            setRecoveryStatus(recovered.status);
            setError(
              recovered.status === 'retry_required' ? t('edit.recovery_retry')
                : recovered.status === 'cleanup_failed' ? t('edit.recovery_cleanup')
                  : recovered.status === 'conflict' ? t('edit.recovery_conflict') : t('edit.recovery_update_failed'),
            );
          }
        }
      } else {
        setPendingOperation(null);
        setRecoveryStatus(null);
      }
      const [saved, enrichmentDraft, savedSource] = await Promise.all([
        store.getProperty(id),
        loadPropertyEnrichmentDraft(id),
        store.getPropertySource(id),
      ]);
      if (!saved) {
        setProperty(null);
        setHasEnrichmentDraft(false);
        setStatus('missing');
        return;
      }
      if (completedRecoveryForProperty && enrichmentDraft) {
        await clearConfirmedPropertyEnrichmentDraft(enrichmentDraft);
      }
      setProperty(saved);
      setHasEnrichmentDraft(!completedRecoveryForProperty && enrichmentDraft !== null);
      setLegacyEnrichmentDraft(completedRecoveryForProperty ? null : enrichmentDraft);
      setSource(savedSource);
      setSourcePerson(savedSource ? await store.getPerson(savedSource.personId) : null);
      setStatus('ready');
    } catch {
      setProperty(null);
      setHasEnrichmentDraft(false);
      setStatus('unreadable');
    }
  }, [id, t]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    let active = true;
    let revokeSources = () => {};
    const sourceAttachments = mode === 'edit'
      ? (draft?.choices.attachments ?? property?.attachments ?? [])
      : (property?.attachments ?? []);
    const images = sourceAttachments
      .filter(attachment => attachment.kind === 'image')
      .map(({ id: attachmentId, kind, managedUri }) => ({ id: attachmentId, kind, uri: managedUri }));
    setGalleryImageSources({});
    setGalleryResolutionError('');
    setActiveGalleryIndex(0);
    if (Platform.OS !== 'web' || images.length === 0) {
      return () => { active = false; };
    }
    void resolveWebAttachmentImageSources(images, webBlobStore.current!)
      .then(resolved => {
        if (!active) {
          resolved.revoke();
          return;
        }
        revokeSources = resolved.revoke;
        setGalleryImageSources(resolved.sources);
      })
      .catch(cause => {
        if (!active) return;
        const message = cause instanceof Error && cause.message === 'ATTACHMENT_FILE_MISSING'
          ? t('enrich.attachment_missing')
          : t('enrich.attachment_failed');
        setGalleryResolutionError(message);
        setError(message);
      });
    return () => {
      active = false;
      revokeSources();
    };
  }, [property?.core.id, property?.attachments, mode, draft?.choices.attachments, standardApartment, t]);

  const areaName = (areaId: string) => {
    const area = getAreaById(areaId);
    return area ? (language === 'ar' ? area.ar : area.en) : areaId;
  };

  const openSource = async () => {
    setError('');
    try {
      setSourcePeople(await store.getPeople());
      setSourcePersonId(source?.personId ?? '');
      setSourceClassification('all');
      setSourceSearch('');
      setSourceRole(source?.role ?? 'owner');
      setSourceOpen(true);
    } catch {
      setError(t('source.load_failed'));
    }
  };

  const visibleSourcePeople = filterPropertySourcePeople(sourcePeople, sourceClassification, sourceSearch);
  const visibleSourceSelection = retainVisibleSourceSelection(visibleSourcePeople, sourcePersonId);

  const saveSource = async () => {
    if (!id || !visibleSourceSelection || sourceBusy) return;
    setSourceBusy(true);
    setError('');
    try {
      await store.setPropertySource({ propertyCoreId: id, personId: sourcePersonId, role: sourceRole });
      setSourceOpen(false);
      await load();
    } catch {
      setError(t('source.save_failed'));
    } finally {
      setSourceBusy(false);
    }
  };

  const removeSource = async () => {
    if (!id || sourceBusy) return;
    setSourceConfirmVisible(false);
    setSourceBusy(true);
    setError('');
    try {
      await store.removePropertySource(id);
      setSource(null);
      setSourcePerson(null);
    } catch {
      setError(t('source.save_failed'));
    } finally {
      setSourceBusy(false);
    }
  };

  const confirmRemoveSource = () => {
    setSourceConfirmVisible(true);
  };

  const beginEdit = async () => {
    if (!property || !id) return;
    setError('');
    if (!store.canSafelyUpdate()) {
      setError(t('edit.unsupported'));
      return;
    }
    try {
      const pending = await loadPropertyUpdateOperation();
      if (pending) {
        setError(pending.baseline.core.id === id ? t('edit.recovery_retry') : t('edit.recovery_pending'));
        return;
      }
      const existing = await loadPropertyEditDraft(id);
      if (existing && !exactPropertyEqual(existing.baseline, property)) {
        setError(t('edit.draft_conflict'));
        return;
      }
      if (legacyEnrichmentDraft && !exactPropertyEqual(legacyEnrichmentDraft.baseline, property)) {
        setError(t('edit.draft_conflict'));
        return;
      }
      const next = existing ?? (() => {
        const fresh = createEditDraft(property);
        if (!legacyEnrichmentDraft) return fresh;
        return { ...fresh, choices: createEditDraft(legacyEnrichmentDraft.candidate).choices };
      })();
      assertPropertyDetailsEditClassification(property, next.choices);
      setConflictResolutions({});
      if (!existing && !await savePropertyEditDraft(next)) {
        setError(t('edit.draft_conflict'));
        return;
      }
      setDraft(next);
      draftRef.current = next;
      cleanChoicesRef.current = standardApartment ? createEditDraft(property).choices : null;
      setEditDirty(standardApartment && propertyEditChoicesAreDirty(cleanChoicesRef.current, next.choices));
      setMapsFieldError('');
      setMode('edit');
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'SAVED_PROPERTY_CLASSIFICATION_LOCKED'
        ? (language === 'ar' ? 'مسودة التعديل تحاول تغيير نوع العقار المحفوظ. نوع العقار ثابت عند تعديل التفاصيل.' : 'The edit draft changes the saved property classification. Classification is fixed when editing details.')
        : t('edit.draft_unreadable'));
    }
  };

  useFocusEffect(useCallback(() => {
    const editRequested = (Array.isArray(edit) ? edit[0] : edit) === '1' || forceEdit;
    if (editRequested && status === 'ready' && property && isOfferedStudio(property)) {
      if (studioEditForwardedId.current !== property.core.id) {
        studioEditForwardedId.current = property.core.id;
        router.replace(getPropertyEditRouteHref(property.core.id, true) as never);
      }
      return;
    }
    if (editRequested && status === 'ready' && mode === 'detail' && !editEntryConsumed.current) {
      editEntryConsumed.current = true;
      void beginEdit();
    }
  }, [edit, forceEdit, status, mode, property, router]));

  const updateChoices = (
    changesOrUpdater: Partial<PropertyEditDraftV1['choices']>
      | ((current: PropertyEditDraftV1['choices']) => Partial<PropertyEditDraftV1['choices']>),
    options: { replaceCanonicalDetails?: boolean; replaceDemoMetadata?: boolean } = {},
  ): Promise<boolean> => {
    const mutation = draftMutationFlight.current.then(async () => {
      const previous = draftRef.current;
      if (!previous) return false;
      const changes = typeof changesOrUpdater === 'function'
        ? changesOrUpdater(previous.choices)
        : changesOrUpdater;
      try {
        assertPropertyDetailsEditClassification(previous.baseline, { ...previous.choices, ...changes,
          canonicalDetails: { ...previous.choices.canonicalDetails, ...changes.canonicalDetails },
        });
      } catch {
        setError(language === 'ar' ? 'نوع العقار المحفوظ ثابت. يمكنك تعديل تفاصيله فقط.' : 'The saved property type is fixed. You can edit its details only.');
        return false;
      }
      const next = {
        ...previous,
        choices: {
          ...previous.choices,
          ...changes,
          ...(changes.canonicalDetails ? {
            canonicalDetails: options.replaceCanonicalDetails
              ? changes.canonicalDetails
              : {
                ...(previous.choices.canonicalDetails ?? {}),
                ...changes.canonicalDetails,
              },
          } : {}),
          ...(changes.demoMetadata ? {
            demoMetadata: options.replaceDemoMetadata
              ? changes.demoMetadata
              : {
                ...(previous.choices.demoMetadata ?? changes.demoMetadata),
                ...changes.demoMetadata,
              },
          } : {}),
          ...(changes.newlyCopiedAttachmentUris ? {
            newlyCopiedAttachmentUris: [...new Set([
              ...(previous.choices.newlyCopiedAttachmentUris ?? []),
              ...changes.newlyCopiedAttachmentUris,
            ])],
          } : {}),
        },
        writeGeneration: previous.writeGeneration + 1,
      };
      try {
        const saved = await savePropertyEditDraft(next, previous);
        if (!saved) {
          setError(t('edit.draft_conflict'));
          return false;
        }
        draftRef.current = next;
        setDraft(next);
        setEditDirty(standardApartment && propertyEditChoicesAreDirty(cleanChoicesRef.current, next.choices));
        return true;
      } catch {
        setError(t('edit.draft_unreadable'));
        return false;
      }
    });
    draftMutationFlight.current = mutation.catch(() => false);
    return mutation;
  };

  const resolveFactConflict = async (
    conflict: ReturnType<typeof projectPropertyFacts>['conflicts'][number],
    choice: 'canonical' | 'legacy',
  ) => {
    if (!draft) return;
    const selectedValue = choice === 'legacy' ? conflict.legacyValue : conflict.canonicalValue;
    let persisted: boolean;
    if (conflict.key === 'area') persisted = await updateChoices({ areaSquareMeters: Number(selectedValue) });
    else if (conflict.key === 'areaUnit') persisted = await updateChoices({ areaUnit: selectedValue as 'square_meter' | 'square_foot' });
    else persisted = await updateChoices({ canonicalDetails: { [conflict.key]: String(selectedValue) } });
    if (persisted) setConflictResolutions(current => ({ ...current, [conflict.key]: choice }));
  };
  const factLabel = (key: string) => key === 'area'
    ? (language === 'ar' ? 'المساحة' : 'Area')
    : key === 'areaUnit'
      ? (language === 'ar' ? 'وحدة المساحة' : 'Area unit')
      : propertyDetailLabels[key as PropertyDetailField]?.[language === 'ar' ? 1 : 0] ?? (language === 'ar' ? 'حقيقة العقار' : 'Property fact');

  const updateCanonicalDetail = (field: PropertyDetailField | 'clarification', value: string) => {
    if (!draft) return;
    if (field === 'apartmentSubtype' || field === 'floorUse') return;
    if (field === 'clarification') {
      updateChoices({ canonicalDetails: { ...(draft.choices.canonicalDetails ?? {}), clarification: value } });
      return;
    }
    updateChoices({ canonicalDetails: { ...(draft.choices.canonicalDetails ?? {}), [field]: value } });
  };

  const localAttachments = (draft?.choices.attachments ?? property?.attachments ?? []).map(item => ({
    id: item.id,
    kind: item.kind,
    originalName: item.originalName,
    mimeType: item.mimeType,
    uri: item.managedUri,
    order: item.order,
    ...(item.isCover ? { isCover: true as const } : {}),
  })) as LocalAttachment[];

  const updateAttachmentChoices = (
    transform: (items: LocalAttachment[]) => LocalAttachment[],
  ) => updateChoices(current => {
    const domainItems = current.attachments ?? property?.attachments ?? [];
    const latest = domainItems.map(item => ({
      id: item.id,
      kind: item.kind,
      originalName: item.originalName,
      mimeType: item.mimeType,
      uri: item.managedUri,
      order: item.order,
      ...(item.isCover ? { isCover: true as const } : {}),
    })) as LocalAttachment[];
    return {
      attachments: transform(latest).map(item => {
        const existing = domainItems.find(candidate => candidate.id === item.id);
        return {
          id: item.id,
          kind: item.kind,
          originalName: item.originalName,
          mimeType: item.mimeType,
          order: item.order,
          managedUri: item.uri,
          ...(item.isCover ? { isCover: true } : {}),
          privacy: existing?.privacy ?? { classification: 'normal', disclosurePolicy: 'normal' },
        };
      }),
    };
  });

  const storePickedAttachments = async (next: LocalAttachment[]) => {
    if (!property || !next.length) return;
    const copied = next.map(item => item.uri);
    const owned = await updateChoices(current => {
      const existing = current.attachments ?? property.attachments ?? [];
      const hasCover = existing.some(item => item.isCover);
      let firstNewImageCovered = false;
      return {
        attachments: [
          ...existing,
          ...next.map((item, index) => {
            const makeCover = !hasCover && !firstNewImageCovered && item.kind === 'image';
            if (makeCover) firstNewImageCovered = true;
            return {
              id: item.id,
              kind: item.kind,
              originalName: item.originalName,
              mimeType: item.mimeType,
              order: existing.length + index,
              managedUri: item.uri,
              ...(makeCover ? { isCover: true as const } : {}),
              privacy: { classification: 'normal' as const, disclosurePolicy: 'normal' as const },
            };
          }),
        ],
        newlyCopiedAttachmentUris: [...(current.newlyCopiedAttachmentUris ?? []), ...copied],
      };
    });
    if (!owned) {
      await Promise.all(copied.map(uri => attachmentStore.delete(uri).catch(() => undefined)));
      return;
    }
    setNewAttachmentUris(current => [...current, ...copied]);
  };

  const addMedia = async (mediaTypes: ('images' | 'videos')[]) => {
    if (!property || !draft) return;
    if (Platform.OS === 'web') {
      try {
        openStudioWebFilePicker({
          accept: mediaTypes[0] === 'images' ? 'image/*' : 'video/*',
          onFiles: files => {
            void (async () => {
              try {
                await storePickedAttachments(await createWebFileAttachments(
                  property.core.id,
                  localAttachments,
                  files,
                  undefined,
                  webBlobStore.current!,
                ));
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
              }
            })();
          },
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
      }
      return;
    }
    try {
      await storePickedAttachments(await pickAndStoreMedia(property.core.id, localAttachments, { fileStore: attachmentStore }, undefined, mediaTypes));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
    }
  };

  const addPdfs = async () => {
    if (!property || !draft) return;
    if (Platform.OS === 'web') {
      try {
        openStudioWebFilePicker({
          accept: 'application/pdf',
          onFiles: files => {
            void (async () => {
              try {
                await storePickedAttachments(await createWebFileAttachments(
                  property.core.id,
                  localAttachments,
                  files,
                  undefined,
                  webBlobStore.current!,
                ));
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
              }
            })();
          },
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
      }
      return;
    }
    try {
      await storePickedAttachments(await pickAndStorePdfs(property.core.id, localAttachments, DocumentPicker, { fileStore: attachmentStore }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
    }
  };

  const openMapsLink = async () => {
    const link = draft?.choices.mapsLink?.trim() ?? '';
    const area = getAreaById(draft?.choices.locationAreaId ?? property?.core.locationArea.id ?? '');
    const query = area ? (language === 'ar' ? area.ar : area.en) : '';
    const validation = getPropertyEditMapsFieldError(link, language);
    if (validation) {
      setMapsFieldError(validation);
      return;
    }
    setMapsFieldError('');
    try {
      if (Platform.OS === 'web') {
        openStudioWebMapsLocation({ link, query });
      } else if (link) {
        await openPastedLocationLink(pastedMapLocation(normalizeGoogleMapsLink(link)));
      } else {
        await openGoogleMapsQuery(query);
      }
    } catch {
      setMapsFieldError(language === 'ar'
        ? 'تعذر فتح خرائط Google لهذا الموقع.'
        : 'Could not open Google Maps for this location.');
    }
  };

  const captureEditCoordinates = async () => {
    if (!draft || locationBusy) return;
    setLocationBusy(true);
    try {
      const coordinates = await requestCurrentCoordinates();
      await updateChoices({
        coordinates: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          privacy: { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' },
        },
      });
    } catch {
      setError(t('enrich.location_failed'));
    } finally {
      setLocationBusy(false);
    }
  };

  const transitionStateFor = (choices: PropertyEditDraftV1['choices']): PropertyTransitionState => ({
      propertyType: choices.propertyType,
      transaction: choices.transaction,
      canonicalDetails: choices.canonicalDetails ?? {},
      priceAmount: choices.priceAmount,
      rentalPeriodId: choices.rentalPeriodId,
    });
  const commitPropertyTransition = (proposal: PropertyTransitionProposal) => {
    const current = draftRef.current;
    if (!current) return;
    const transitioned = applyPropertyTransition(
      `property:${current.propertyCoreId}`,
      transitionStateFor(current.choices),
      proposal,
    );
    if (!transitioned) {
      setError(propertyTransitionErrorMessage(language));
      return;
    }
    if (proposal.kind === 'property_type') {
      void updateChoices({
        propertyType: transitioned.propertyType,
        canonicalDetails: transitioned.canonicalDetails as Record<string, string>,
      }, { replaceCanonicalDetails: true });
      return;
    }
    const transaction = transitioned.transaction;
    void updateChoices({
      transaction,
      priceAmount: transitioned.priceAmount,
      rentalPeriodId: transaction === 'rent'
        ? (current.choices.transaction === 'sale'
          ? MARKET_CONFIG.defaultRentalPeriodId
          : transitioned.rentalPeriodId)
        : undefined,
    });
  };

  const requestPropertyTransition = (proposal: PropertyTransitionProposal, title: string) => {
    setError('');
    if (proposal.affected.length === 0) {
      commitPropertyTransition(proposal);
      return;
    }
    const current = draftRef.current;
    if (!current) return;
    const message = propertyTransitionConfirmationMessage(
      proposal,
      language,
      field => field === 'priceAmount'
        ? (proposal.from === 'rent'
          ? (language === 'ar' ? 'قيمة الإيجار' : 'Rental price')
          : (language === 'ar' ? 'سعر البيع' : 'Sale price'))
        : field === 'rentalPeriodId'
          ? (language === 'ar' ? 'دورية الإيجار' : 'Rental period')
          : propertyDetailLabels[field as PropertyDetailField]?.[language === 'ar' ? 1 : 0]
            ?? (language === 'ar' ? 'تفصيل العقار' : 'Property detail'),
      (field, value) => field === 'priceAmount'
        ? (proposal.from === 'rent'
          ? formatRentalPrice(Number(value), 'KWD', current.choices.rentalPeriodId, language, t)
          : formatPrice(Number(value), 'KWD', language))
        : field === 'rentalPeriodId'
          ? formatRentalCadence(value, t)
          : formatPropertyDetailValue(
            field as PropertyDetailField,
            field.startsWith('has') ? value === 'true' : value,
            language,
            t,
          ),
    );
    setPendingPropertyTransition({ proposal, title, message });
  };

  const selectTransaction = (transaction: Transaction) => {
    if (!draft || transaction === draft.choices.transaction) return;
    const proposal = createTransactionTransitionProposal(
      `property:${draft.propertyCoreId}`,
      transitionStateFor(draft.choices),
      transaction,
    );
    if (!proposal) return;
    requestPropertyTransition(
      proposal,
      language === 'ar'
        ? `تغيير نوع المعاملة إلى ${t(`transaction.${transaction}` as keyof Translations)}؟`
        : `Change transaction to ${t(`transaction.${transaction}` as keyof Translations)}?`,
    );
  };

  const confirmPropertyTransition = () => {
    const pending = pendingPropertyTransition;
    setPendingPropertyTransition(null);
    if (pending) commitPropertyTransition(pending.proposal);
  };

  const retryRecovery = async (allowUpdate: boolean) => {
    if (!pendingOperation || saving) return;
    setSaving(true);
    try {
      assertSavedPropertyClassificationUnchanged(pendingOperation.baseline, pendingOperation.candidate);
      const result = await executePropertyUpdateRecovery({
        operation: pendingOperation,
        allowUpdate,
        getProperty: value => store.getProperty(value),
        compareAndUpdate: (baseline, candidate) => store.compareAndUpdate(baseline, candidate),
        attachmentFileStore: attachmentStore,
      });
      if (result.status === 'complete') {
        const saved = await store.getProperty(pendingOperation.baseline.core.id);
        if (legacyEnrichmentDraft) await clearConfirmedPropertyEnrichmentDraft(legacyEnrichmentDraft);
        setProperty(saved);
        setPendingOperation(null);
        setRecoveryStatus(null);
        setDraft(null);
        draftRef.current = null;
        cleanChoicesRef.current = null;
        setEditDirty(false);
        setError('');
        setMode('detail');
        router.replace(`/property/${encodeURIComponent(id!)}` as never);
      } else {
        setRecoveryStatus(result.status);
        setError(
          result.status === 'conflict' ? t('edit.recovery_conflict')
            : result.status === 'cleanup_failed' ? t('edit.recovery_cleanup')
              : result.status === 'retry_required' ? t('edit.recovery_retry')
                : t('edit.recovery_update_failed'),
        );
      }
    } catch {
      setError(t('edit.recovery_update_failed'));
    } finally {
      setSaving(false);
    }
  };

  const deleteOwnedAttachmentForCleanup = async (uri: string) => {
    try {
      await attachmentStore.delete(uri);
    } catch (cause) {
      if (!(cause instanceof Error && (
        cause.message === 'ATTACHMENT_FILE_MISSING'
        || cause.message.includes('ENOENT')
      ))) throw cause;
    }
  };

  const leaveEditor = () => {
    if (!draft) {
      setMode('detail');
      router.replace(`/property/${encodeURIComponent(id!)}` as never);
      return;
    }
    if (!standardApartment || editDirty) {
      setLeaveVisible(true);
      return;
    }
    void (async () => {
      await draftMutationFlight.current;
      const latest = draftRef.current;
      const latestIsDirty = Boolean(latest && propertyEditChoicesAreDirty(cleanChoicesRef.current, latest.choices));
      if (latestIsDirty) {
        setEditDirty(true);
        setLeaveVisible(true);
        return;
      }
      await flushPropertyEditDraftWrites();
      const current = draftRef.current;
      if (!current) return;
      if (cleanExitOwnedUrisRef.current) {
        try {
          for (const uri of cleanExitOwnedUrisRef.current) await deleteOwnedAttachmentForCleanup(uri);
        } catch {
          setError(t('edit.recovery_cleanup'));
          return;
        }
      } else {
        const result = await discardPropertyEditDraftAndCleanupOwnedAttachments({
          draft: current,
          transientOwnedUris: newAttachmentUris,
          discardDraft: candidate => discardPropertyEditDraft(candidate.propertyCoreId, candidate),
          deleteAttachment: deleteOwnedAttachmentForCleanup,
        });
        if (result.status === 'conflict') {
          setError(t('edit.draft_conflict'));
          return;
        }
        if (result.status === 'cleanup_failed') {
          cleanExitOwnedUrisRef.current = result.ownedUris;
          setError(t('edit.recovery_cleanup'));
          return;
        }
      }
      cleanExitOwnedUrisRef.current = null;
      setNewAttachmentUris([]);
      setDraft(null);
      draftRef.current = null;
      cleanChoicesRef.current = null;
      setEditDirty(false);
      setMode('detail');
      router.replace(`/property/${encodeURIComponent(id!)}` as never);
    })();
  };

  const discardEditDraft = async () => {
    const current = draftRef.current;
    if (!current || discarding) return;
    setDiscarding(true);
    try {
      const discarded = await discardPropertyEditDraft(current.propertyCoreId, current);
      setLeaveVisible(false);
      if (!discarded) {
        setError(t('edit.draft_conflict'));
        return;
      }
      const ownedUris = [...new Set([
        ...(current.choices.newlyCopiedAttachmentUris ?? []),
        ...newAttachmentUris,
      ])];
      for (const uri of ownedUris) {
        try {
          await attachmentStore.delete(uri);
        } catch (cause) {
          if (!(cause instanceof Error && (
            cause.message === 'ATTACHMENT_FILE_MISSING'
            || cause.message.includes('ENOENT')
          ))) throw cause;
        }
      }
      setNewAttachmentUris([]);
      setDraft(null);
      draftRef.current = null;
      cleanChoicesRef.current = null;
      setEditDirty(false);
      setMode('detail');
      router.replace(`/property/${encodeURIComponent(id!)}` as never);
    } catch {
      setLeaveVisible(false);
      setError(t('edit.draft_unreadable'));
    } finally {
      setDiscarding(false);
    }
  };

  const save = async () => {
    setPriceAttempted(true);
    if (!draft || saving || saveFlight.current) return;
    saveFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const latestMutationSaved = await draftMutationFlight.current;
      if (!latestMutationSaved) {
        setError(t('edit.draft_conflict'));
        return;
      }
      const currentDraft = draftRef.current;
      if (!currentDraft || currentDraft.propertyCoreId !== draft.propertyCoreId) {
        setError(t('edit.draft_conflict'));
        return;
      }
      const mapsValidation = getPropertyEditMapsFieldError(currentDraft.choices.mapsLink ?? '', language);
      setMapsFieldError(mapsValidation);
      if (mapsValidation) return;
      if (invalidQuickPickFields.size > 0) {
        setError(t('errors.capture_incomplete'));
        return;
      }
      if (projectPropertyFacts(currentDraft.baseline).conflicts.some(conflict => conflictResolutions[conflict.key] === undefined)) {
         setError(language === 'ar'
           ? 'توجد حقائق متعارضة. اختر قيمة معتمدة لكل حقيقة قبل الحفظ.'
           : 'Conflicting facts need resolution. Choose an authoritative value for each fact before saving.');
        return;
      }
      const pending = await loadPropertyUpdateOperation();
      if (pending) {
        if (pending.baseline.core.id !== draft.propertyCoreId) {
          setError(t('edit.recovery_conflict'));
          return;
        }
        assertSavedPropertyClassificationUnchanged(pending.baseline, pending.candidate);
        const retry = await executePropertyUpdateRecovery({
          operation: pending,
          allowUpdate: true,
          getProperty: value => store.getProperty(value),
          compareAndUpdate: (baseline, replacement) => store.compareAndUpdate(baseline, replacement),
          attachmentFileStore: attachmentStore,
        });
        if (retry.status !== 'complete') {
           setError(retry.status === 'conflict' ? t('edit.recovery_conflict') : retry.status === 'cleanup_failed' ? t('edit.recovery_cleanup') : t('edit.save_failed'));
          return;
        }
        if (legacyEnrichmentDraft) await clearConfirmedPropertyEnrichmentDraft(legacyEnrichmentDraft);
        setProperty(pending.candidate);
        setDraft(null);
        draftRef.current = null;
        cleanChoicesRef.current = null;
        setEditDirty(false);
        setMode('detail');
        router.replace(`/property/${encodeURIComponent(id!)}` as never);
        return;
      }
      await flushPropertyEditDraftWrites();
      const persistedDraft = await loadPropertyEditDraft(currentDraft.propertyCoreId);
      if (!persistedDraft || JSON.stringify(persistedDraft) !== JSON.stringify(currentDraft)) {
        setError(t('edit.draft_conflict'));
        return;
      }
      const candidate = buildPropertyDetailsUpdateCandidate(currentDraft.baseline, currentDraft.choices);
      const baselineUris = new Set((currentDraft.baseline.attachments ?? []).map(item => item.managedUri));
      const candidateUris = new Set((candidate.attachments ?? []).map(item => item.managedUri));
      const newlyCopiedUris = [...new Set([
        ...(persistedDraft.choices.newlyCopiedAttachmentUris ?? []),
        ...newAttachmentUris,
      ])].filter(uri => !baselineUris.has(uri));
      const operation = createPropertyUpdateOperation({
        operationId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        baseline: currentDraft.baseline,
        candidate,
        draftSnapshot: currentDraft,
        preparedAt: new Date().toISOString(),
        attachmentCleanup: {
          newlyCopiedUris,
          retiredManagedUris: [...new Set([
            ...[...baselineUris].filter(uri => !candidateUris.has(uri)),
            ...newlyCopiedUris.filter(uri => !candidateUris.has(uri)),
          ])],
          phase: 'before_cas',
          status: 'pending',
        },
      });
      await persistPropertyUpdateOperation(operation);
      const result = await executePropertyUpdateRecovery({
        operation,
        allowUpdate: true,
        getProperty: value => store.getProperty(value),
        compareAndUpdate: (baseline, replacement) => store.compareAndUpdate(baseline, replacement),
        attachmentFileStore: attachmentStore,
      });
      if (result.status !== 'complete') {
         setError(result.status === 'conflict' ? t('edit.recovery_conflict') : result.status === 'cleanup_failed' ? t('edit.recovery_cleanup') : t('edit.save_failed'));
        return;
      }
      let savedProperty = candidate;
      if (completionOrigin === 'enrichment') {
        const readback = await confirmCommittedPropertyReadback(
          candidate,
          propertyCoreId => store.getProperty(propertyCoreId),
        );
        if (!readback || readback.core.id !== id) {
          setError(t('edit.save_failed'));
          // CAS has committed; do not leave the obsolete draft in an editor
          // where Save could retry against its old baseline.
          setNewAttachmentUris([]);
          setDraft(null);
          draftRef.current = null;
          cleanChoicesRef.current = null;
          setEditDirty(false);
          setMode('detail');
          setSaveCompletionVisible(false);
          setProperty(null);
          setStatus('loading');
          router.replace(`/property/${encodeURIComponent(id!)}` as never);
          return;
        }
        savedProperty = readback;
      }
      if (legacyEnrichmentDraft) await clearConfirmedPropertyEnrichmentDraft(legacyEnrichmentDraft);
      setNewAttachmentUris([]);
      setProperty(savedProperty);
      setDraft(null);
      draftRef.current = null;
      cleanChoicesRef.current = null;
      setEditDirty(false);
      setMode('detail');
      if (completionOrigin === 'enrichment') {
        setSaveCompletionVisible(true);
      } else {
        router.replace(`/property/${encodeURIComponent(id!)}` as never);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setError(
        caught instanceof PendingPropertyUpdateExistsError ? t('edit.recovery_pending')
          : message.includes('SAVED_PROPERTY_CLASSIFICATION_LOCKED') ? (language === 'ar' ? 'نوع العقار المحفوظ ثابت. يمكنك تعديل تفاصيله فقط.' : 'The saved property type is fixed. You can edit its details only.')
          : message.includes('INCOMPATIBLE_TYPE_DETAILS') ? t('edit.type_incompatible')
          : message.includes('INVALID_APPROVED_AREA') ? t('edit.area_invalid')
            : message.includes('MISSING_RENTAL_PERIOD') ? t('edit.rental_period_missing')
              : message.includes('INVALID_PRICE') ? t('errors.invalid_price')
                : t('edit.save_failed'),
      );
    } finally {
      saveFlight.current = false;
      setSaving(false);
    }
  };

  const viewSavedProperty = () => {
    if (!property || !id || property.core.id !== id) return;
    setSaveCompletionVisible(false);
    router.replace(`/property/${encodeURIComponent(property.core.id)}` as never);
  };

  const confirmDelete = async () => {
    if (!property || deleting) return;
    if (!store.canPermanentlyDelete()) {
      setDeleteVisible(false);
      setError(t('delete.failed'));
      return;
    }
    setDeleting(true);
    setError('');
    const expected = property;
    try {
      const result = await deleteSavedProperty({ expected, store });
      if (result.status !== 'deleted') {
        setDeleteVisible(false);
        setError(t('delete.failed'));
        return;
      }
      setDeleteVisible(false);
      router.replace('/' as never);
    } catch {
      setDeleteVisible(false);
      setError(t('delete.failed'));
    } finally {
      setDeleting(false);
    }
  };

  if (status !== 'ready' || !property) {
    const message = status === 'loading'
      ? t('edit.loading')
      : status === 'missing' ? t('edit.not_found') : t('edit.unreadable');
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign: 'center' }}>{message}</Text>
        <Button
          title={t('capture.back')}
          onPress={() => router.replace('/' as never)}
          variant="outline"
          testID="property-detail-back"
        />
      </View>
    );
  }

  const choices = draft?.choices;
  const propertyIntent = projectPropertyIntent(property, language);
  const shownTransaction = mode === 'edit' && choices ? choices.transaction : property.activeOffer.transaction;
  const shownPrice = mode === 'edit' && choices
    ? choices.priceAmount
    : property.activeOffer.transaction === 'sale' && propertyIntent.id === 'offered_sale'
      ? property.activeOffer.salePrice.amount
      : property.activeOffer.transaction === 'rent' && propertyIntent.id === 'offered_rent'
        ? property.activeOffer.rentalPrice.amount
        : undefined;
  const shownRentalPeriodId = mode === 'edit' && choices
    ? choices.rentalPeriodId
    : property.activeOffer.transaction === 'rent' && propertyIntent.id === 'offered_rent'
      ? property.activeOffer.rentalPeriodId
      : undefined;
  const demoCategory = getDemoCategory(property.demoCapture?.categoryId);
  const propertyFacts = projectPropertyFacts(property);
  const offeredStudio = isOfferedStudio(property);
  const studioAreaSquareMeters = offeredStudio
    ? property.areaSquareMeters !== undefined
      ? property.areaUnit === 'square_foot'
        ? squareFeetToSquareMeters(property.areaSquareMeters)
        : property.areaSquareMeters
      : undefined
    : undefined;
  const visibleContent = getPropertyDetailVisibleContent(property);

  const galleryImages = (property?.attachments ?? []).filter(a => a.kind === 'image');
  const galleryPageWidth = Dimensions.get('window').width - 24;
  const otherFiles = (property?.attachments ?? []).filter(a => a.kind !== 'image');

  const handleShare = () => {
    if (actionFlight.current) return;
    actionFlight.current = true;
    router.push(`/property/${encodeURIComponent(property.core.id)}/share` as never);
    setTimeout(() => { actionFlight.current = false; }, 1000);
  };
  const handleEdit = () => {
    if (actionFlight.current) return;
    actionFlight.current = true;
    router.push(getPropertyEditRouteHref(property.core.id, offeredStudio) as never);
    setTimeout(() => { actionFlight.current = false; }, 1000);
  };

  const openDetailMapsLink = async () => {
    const location = property?.locationEnrichment;
    try {
      if (!location?.mapsLink?.value && !location?.coordinates) {
        await openGoogleMapsQuery(areaName(property.core.locationArea.id));
      } else {
        await openSavedPropertyMapsLocation(
          location?.mapsLink?.value,
          location?.coordinates,
        );
      }
      setMapsActionError('');
    } catch {
      setMapsActionError(t('detail.maps_unavailable'));
    }
  };
  const detailMapsHref = getPropertyDetailMapsHref({
    link: property.locationEnrichment?.mapsLink?.value,
    coordinates: property.locationEnrichment?.coordinates,
    areaQuery: areaName(property.core.locationArea.id),
    allowAreaSearch: true,
  });

  const savedTypeLabel = getSavedPropertyTypeLabel(property, language, t(`propertyType.${property.core.propertyType}` as keyof Translations));
  const detailsTitle = language === 'ar' ? 'تفاصيل العقار' : 'Property details';
  const identityImage = galleryImages.find(image => image.isCover) ?? galleryImages[0];
  const editTitle = language === 'ar' ? `تعديل تفاصيل ${savedTypeLabel}` : `Edit ${savedTypeLabel} Details`;

  const numericSpecTiles: { fieldId: string, value: string | number | boolean, icon: PropertySpecIconName, label: string }[] = [];
  const addSpec = (fieldId: string, value: string | number | boolean, icon: PropertySpecIconName) => {
    numericSpecTiles.push({ fieldId, value, icon, label: propertyDetailLabels[fieldId as PropertyDetailField]?.[language === 'ar' ? 1 : 0] ?? fieldId });
  };
  if (offeredStudio) {
    addSpec('studioRoomCount', 1, 'bed-outline');
    numericSpecTiles[numericSpecTiles.length - 1].label = language === 'ar' ? 'غرفة مفتوحة' : 'Open room';
  } else if (propertyFacts.templateFacts.bedroomCount !== undefined) addSpec('bedroomCount', propertyFacts.templateFacts.bedroomCount, 'bed-outline');
  if (propertyFacts.templateFacts.bathroomCount !== undefined) addSpec('bathroomCount', propertyFacts.templateFacts.bathroomCount, 'shower');
  if (propertyFacts.templateFacts.livingRoomCount !== undefined) addSpec('livingRoomCount', propertyFacts.templateFacts.livingRoomCount, 'sofa-outline');
  if (propertyFacts.templateFacts.parkingSpaceCount !== undefined) addSpec('parkingSpaceCount', propertyFacts.templateFacts.parkingSpaceCount, 'car');
  if (propertyFacts.templateFacts.floorNumber !== undefined) addSpec('floorNumber', propertyFacts.templateFacts.floorNumber, 'stairs');
  if (!offeredStudio && propertyFacts.areaSquareMeters !== undefined) addSpec('areaSquareMeters', `${propertyFacts.areaSquareMeters} ${language === 'ar' ? 'م²' : 'm²'}`, 'set-square');

  const detailValues = (offeredStudio
    ? getOfferedStudioDetailValues(visibleContent.typeDetails)
    : visibleContent.typeDetails) as Record<string, unknown>;
  const commercialFloorSale = isCommercialFloorSale(property.core.propertyType, detailValues?.floorUse, property.activeOffer.transaction);
  const floorYield = commercialFloorSale && property.activeOffer.transaction === 'sale' ? grossAnnualRentalYield(property.activeOffer.salePrice.amount, typeof detailValues?.monthlyIncome === 'number' ? detailValues.monthlyIncome : undefined) : undefined;
  if (commercialFloorSale) {
    for (let index = numericSpecTiles.length - 1; index >= 0; index--) {
      if (numericSpecTiles[index].fieldId !== 'areaSquareMeters') numericSpecTiles.splice(index, 1);
    }
  }
  if (property.core.propertyType === 'commercial_complex' && property.activeOffer.transaction === 'sale') {
    const yieldPercent = grossAnnualRentalYield(property.activeOffer.salePrice.amount, typeof detailValues?.monthlyIncome === 'number' ? detailValues.monthlyIncome : undefined);
    if (yieldPercent !== undefined) {
      addSpec('grossAnnualRentalYield', `${yieldPercent.toFixed(2)}%`, 'percent');
      numericSpecTiles[numericSpecTiles.length - 1].label = language === 'ar' ? 'العائد الإيجاري السنوي الإجمالي' : 'Gross annual rental yield';
    }
  }
  const actualStudioAreaSquareMeters = studioAreaSquareMeters
    ?? (offeredStudio ? readNumericDetail(detailValues.builtUpAreaSquareMeters) : undefined);
  const locationArea = getAreaById(property.core.locationArea.id);
  const locationDisplay = getPropertyDetailLocationDisplay({
    governorate: locationArea ? (language === 'ar' ? locationArea.governorateAr : locationArea.governorateEn) : undefined,
    area: areaName(property.core.locationArea.id),
    block: property.core.block,
    description: visibleContent.description,
  });
  const availableFeatures = Array.from(new Set([
    ...propertyDetailDisplayDefinitions
      .filter(definition => (!commercialFloorSale || isCommercialFloorSaleFieldVisible(definition.field)) && (property.core.propertyType !== 'warehouse' || warehouseFieldVisible(definition.field, detailValues)) && property.core.propertyType !== 'warehouse' && definition.group === 'amenity' && detailValues[definition.field] === true)
      .map(definition => commercialFloorSale ? commercialFloorSaleLabel(definition.field, language, definition.label[language === 'ar' ? 1 : 0]) : definition.label[language === 'ar' ? 1 : 0]),
    ...(property.core.propertyType === 'warehouse' ? [] : property.demoCapture?.selectedFeatures ?? [])
      .filter(id => !isDemoFeatureSuppressed(id, property.core.propertyType, detailValues, detailValues.floorUse as string | undefined))
      .map(id => demoCategory?.features.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0] ?? id),
  ]));
  const supplementalDetails = propertyDetailDisplayDefinitions
    .filter(definition =>
      (!commercialFloorSale || isCommercialFloorSaleFieldVisible(definition.field)) && (property.core.propertyType !== 'warehouse' || warehouseFieldVisible(definition.field, detailValues))
      && (!commercialFloorSale || definition.field !== 'privateParkingCount' || Array.isArray(detailValues.parkingTypes) && detailValues.parkingTypes.includes('private'))
      && (property.core.propertyType === 'warehouse' || definition.group !== 'amenity')
      && !numericSpecTiles.some(tile => tile.fieldId === definition.field)
      && detailValues[definition.field] !== undefined
      && definition.field !== 'plotAreaSquareMeters'
      && definition.field !== 'builtUpAreaSquareMeters')
    .map(definition => ({
      field: definition.field,
      label: commercialFloorSale ? commercialFloorSaleLabel(definition.field, language, definition.label[language === 'ar' ? 1 : 0]) : definition.label[language === 'ar' ? 1 : 0],
      value: formatPropertyDetailValue(definition.field, detailValues[definition.field], language, t),
    }));
  if (commercialFloorSale) supplementalDetails.sort((a, b) => commercialFloorSaleFieldRank(a.field) - commercialFloorSaleFieldRank(b.field));
  const existingSupplementalFields = new Set<string>(supplementalDetails.map(item => item.field));
  const categoryDetails = getPropertyDetailCategoryRows(property.demoCapture, detailValues, language, property.core.propertyType)
    .filter(item =>
      !(offeredStudio && ['bedroomCount', 'floorCount', 'apartmentCount', 'shopCount', 'officeCount', 'unitCount', 'elevatorCount', 'roomsPerUnit', 'bathroomsPerUnit'].includes(item.field))
      && !(offeredStudio && item.field === 'builtUpAreaSquareMeters')
      && !numericSpecTiles.some(tile => tile.fieldId === item.field)
      && !existingSupplementalFields.has(item.field))
  const studioFacilityDetails = offeredStudio
    ? ([
      ['hasKitchen', language === 'ar' ? 'مطبخ' : 'Kitchen'],
      ['hasHall', language === 'ar' ? 'صالة' : 'Hall'],
      ['hasParking', language === 'ar' ? 'موقف' : 'Parking'],
    ] as const).flatMap(([field, label]) => detailValues[field] === undefined ? [] : [{
      field,
      label,
      value: formatPropertyDetailValue('hasCentralAC', detailValues[field], language),
    }])
    : [];
  const studioAreaDetails = offeredStudio
    && actualStudioAreaSquareMeters !== undefined
    ? [{
      field: 'builtUpAreaSquareMeters',
      label: getStudioCatalogFieldLabel('areaSquareMeters', 'offered')[language === 'ar' ? 1 : 0],
      value: `${formatPropertyDetailValue('builtUpAreaSquareMeters', actualStudioAreaSquareMeters, language)} ${language === 'ar' ? 'م²' : 'm²'}`,
    }]
    : [];
  const propertySupplementalDetails = [...supplementalDetails, ...categoryDetails, ...studioFacilityDetails, ...studioAreaDetails];
  const nearbyServicesTextList = property.nearbyServices?.map(id => DEMO_NEARBY_SERVICES.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0] ?? id) ?? [];
  const compactSpecs = compactPropertySpecs([
    ...numericSpecTiles,
    ...propertySupplementalDetails.map(item => ({ fieldId: item.field, label: item.label, value: item.value })),
    ...(floorYield === undefined ? [] : [{ fieldId: 'grossAnnualRentalYield', label: language === 'ar' ? 'العائد السنوي الإجمالي' : 'Gross annual yield', value: `${floorYield.toFixed(2)}%` }]),
  ], language, property.core.propertyType);
  const compactLocation = [areaName(property.core.locationArea.id), property.core.block ? `${language === 'ar' ? 'قطعة' : 'Block'} ${property.core.block}` : ''].filter(Boolean).join(' · ');
  const descriptionText = locationDisplay.find(item => item.field === 'description')?.value;


  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {mode === 'detail' ? (
        <View testID="property-approved-header" style={{ backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 8, direction: 'ltr', flexDirection: isRTL ? 'row' : 'row-reverse', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => router.replace('/' as never)} accessibilityRole="button" accessibilityLabel={language === 'ar' ? 'الرئيسية' : 'Home'} testID="property-home-action" style={[approvedNavigationStyle, { flexDirection: isRTL ? 'row-reverse' : 'row', gap: 4 }]}>
            <Feather name="home" size={18} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.semiBold, fontSize: 13 }}>{language === 'ar' ? 'الرئيسية' : 'Home'}</Text>
          </TouchableOpacity>
          <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, fontFamily: fonts.bold, fontSize: 17, color: colors.foreground, textAlign: 'center' }}>{detailsTitle}</Text>
          {Platform.OS === 'web' ? (
            <a href={getPropertyDetailBackRoute()} aria-label={t('capture.back')} data-testid="property-detail-back" style={{ ...approvedNavigationStyle, display: 'flex', flexDirection: 'row', gap: 4, boxSizing: 'border-box', color: '#FFFFFF', textDecoration: 'none', fontFamily: fonts.semiBold }}>
              <Text style={[navigationButtonTextStyle, { fontFamily: fonts.semiBold }]}>{t('capture.back')}</Text>
              <Feather name={isRTL ? 'chevron-right' : 'chevron-left'} size={18} color="#FFFFFF" />
            </a>
          ) : (
            <TouchableOpacity onPress={() => router.replace(getPropertyDetailBackRoute() as never)} style={[approvedNavigationStyle, { flexDirection: 'row', gap: 4 }]} testID="property-detail-back" accessibilityRole="button">
              <Text style={[navigationButtonTextStyle, { fontFamily: fonts.semiBold }]}>{t('capture.back')}</Text>
              <Feather name={isRTL ? 'chevron-right' : 'chevron-left'} size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.header}>
          <View style={[styles.headerMain, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={leaveEditor} accessibilityRole="button" testID="property-detail-back" style={[styles.headerSide, approvedNavigationStyle]}>
              <Text numberOfLines={1} style={{ color: navigationButtonTextStyle.color, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{t('capture.back')}</Text>
            </TouchableOpacity>
            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.bold, fontSize: 16 }]}>{editTitle}</Text>
            <TouchableOpacity
              onPress={() => router.replace('/' as never)}
              accessibilityRole="button"
              accessibilityLabel={language === 'ar' ? 'الرئيسية' : 'Home'}
              testID="property-home-action"
              style={[styles.headerSide, approvedNavigationStyle, { flexDirection: 'row', gap: 5 }]}
            >
              <Feather name="home" size={18} color={navigationButtonTextStyle.color} />
              <Text style={{ color: navigationButtonTextStyle.color, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>
                {language === 'ar' ? 'الرئيسية' : 'Home'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={mode === 'detail' ? { paddingBottom: 12 } : styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text testID="property-edit-error" style={[styles.error, { color: colors.destructive, fontFamily: fonts.medium }]}>{error}</Text> : null}
        {pendingOperation && (recoveryStatus === 'retry_required' || recoveryStatus === 'update_failed') ? (
          <Button title={t('edit.retry_update')} onPress={() => void retryRecovery(true)} loading={saving} testID="property-update-retry" />
        ) : null}
        {pendingOperation && recoveryStatus === 'cleanup_failed' ? (
          <Button title={t('edit.retry_cleanup')} onPress={() => void retryRecovery(false)} loading={saving} testID="property-update-cleanup-retry" />
        ) : null}

        {mode === 'detail' ? (
          <>
            <View style={{ paddingHorizontal: 12, gap: 8 }}>
              <View testID="property-identity-card" style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <Text style={{ color: '#173F78', fontFamily: fonts.bold, fontSize: 21, lineHeight: 28, textAlign: isRTL ? 'right' : 'left' }}>{savedTypeLabel}</Text>
                  <View style={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: propertyIntent.valid ? '#173F78' : colors.destructive, fontFamily: fonts.semiBold, fontSize: 13 }}>{propertyIntent.label}</Text>
                  </View>
                  <View style={{ direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 5 }}>
                    <Feather name="map-pin" size={16} color="#173F78" />
                    <Text testID="property-compact-location" style={{ flex: 1, color: '#173F78', fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, textAlign: isRTL ? 'right' : 'left' }}>{compactLocation}</Text>
                  </View>
                </View>
                {shownPrice !== undefined ? <View style={{ flexShrink: 1, maxWidth: '46%', gap: 3 }}>
                  <Text testID="property-compact-price" style={{ color: '#173F78', fontFamily: fonts.bold, fontSize: 24, lineHeight: 31, textAlign: isRTL ? 'left' : 'right' }}>{formatPrice(shownPrice, 'KWD', language)}</Text>
                  {propertyIntent.id === 'offered_rent' ? <Text testID="property-compact-cadence" style={{ color: '#64748B', fontFamily: fonts.medium, fontSize: 13, textAlign: isRTL ? 'left' : 'right' }}>{formatRentalCadence(shownRentalPeriodId, t)}</Text> : null}
                </View> : null}
              </View>

              <CompactPropertySpecs specs={compactSpecs} />

              {availableFeatures.length > 0 && <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 9, borderWidth: 1, borderColor: '#E2E8F0', gap: 7 }}>
                <Text style={{ color: '#173F78', fontFamily: fonts.bold, fontSize: 15, textAlign: isRTL ? 'right' : 'left' }}>{language === 'ar' ? 'المزايا المتوفرة' : 'Available features'}</Text>
                <ChoiceGrid gap={6}>
                  {availableFeatures.map(feat => <ChoiceFact key={feat} label={feat} compact />)}
                </ChoiceGrid>
              </View>}

              {property.core.propertyType !== 'warehouse' && nearbyServicesTextList.length > 0 && <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 9, borderWidth: 1, borderColor: '#E2E8F0', gap: 7 }}>
                <Text style={{ color: '#173F78', fontFamily: fonts.bold, fontSize: 15, textAlign: isRTL ? 'right' : 'left' }}>{language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'}</Text>
                <ChoiceGrid columns={3} gap={6}>
                  {nearbyServicesTextList.map(srv => <ChoiceFact key={srv} label={srv} compact vertical />)}
                </ChoiceGrid>
              </View>}

              <View testID="property-compact-source" style={{ backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#E2E8F0', direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="user" size={19} color="#173F78" />
                <Text style={{ color: '#173F78', fontFamily: fonts.semiBold, fontSize: 13, maxWidth: '28%', textAlign: isRTL ? 'right' : 'left' }}>{t('source.title')}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {sourcePerson ? <>
                    <Text testID="property-source-person" style={{ color: '#173F78', fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, textAlign: isRTL ? 'right' : 'left' }}>{sourcePerson.name}</Text>
                    <Text style={{ color: '#64748B', fontFamily: fonts.regular, fontSize: 11, textAlign: isRTL ? 'right' : 'left' }}>{t(`source.role.${source?.role}` as any)}</Text>
                  </> : <Text style={{ color: '#64748B', fontFamily: fonts.regular, fontSize: 13, textAlign: isRTL ? 'right' : 'left' }}>{language === 'ar' ? 'غير مرتبط' : 'Not linked'}</Text>}
                </View>
                <TouchableOpacity onPress={() => void openSource()} accessibilityRole="button" accessibilityLabel={sourcePerson ? t('source.change') : t('source.choose')} testID="property-source-change" style={{ minHeight: 40, minWidth: 48, paddingHorizontal: 8, borderWidth: 1, borderColor: '#2474D6', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#2474D6', fontFamily: fonts.semiBold, fontSize: 13 }}>{sourcePerson ? (language === 'ar' ? 'تغيير' : 'Change') : (language === 'ar' ? 'ربط' : 'Link')}</Text>
                </TouchableOpacity>
                {sourcePerson && <TouchableOpacity onPress={() => setSourceConfirmVisible(true)} accessibilityRole="button" accessibilityLabel={t('source.unlink')} testID="property-source-unlink" style={{ minHeight: 44, minWidth: 32, alignItems: 'center', justifyContent: 'center' }}><Feather name="link-2" size={18} color={colors.destructive} /></TouchableOpacity>}
              </View>

              {(detailMapsHref || property.locationEnrichment?.coordinates) ? (
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: 0, borderWidth: 1, borderColor: '#2474D6' }}>
                {Platform.OS === 'web' ? detailMapsHref ? (
                  <a
                    href={detailMapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="property-maps-action"
                    aria-label={language === 'ar' ? 'عرض على الخريطة' : 'View on map'}
                    style={{ backgroundColor: '#FFFFFF', borderRadius: 10, minHeight: 40, padding: 8, display: 'flex', flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, color: '#2474D6', textDecoration: 'none' }}
                  >
                    <Feather name="map" size={20} color="#2474D6" />
                    <Text style={{ color: '#2474D6', fontFamily: fonts.bold, fontSize: 14 }}>
                      {language === 'ar' ? 'عرض على الخريطة' : 'View on map'}
                    </Text>
                  </a>
                ) : (
                  <View
                    testID="property-maps-action"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: true }}
                    style={{ backgroundColor: '#FFFFFF', borderRadius: 10, minHeight: 40, padding: 8, flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, opacity: 0.55 }}
                  >
                    <Feather name="map" size={20} color="#2474D6" />
                    <Text style={{ color: '#2474D6', fontFamily: fonts.bold, fontSize: 14 }}>
                      {language === 'ar' ? 'عرض على الخريطة' : 'View on map'}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={openDetailMapsLink} accessibilityRole="button" testID="property-maps-action" style={{ minHeight: 40, direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="map" size={20} color="#2474D6" /><Text style={{ color: '#2474D6', fontFamily: fonts.semiBold, fontSize: 14 }}>{language === 'ar' ? 'عرض على الخريطة' : 'View on map'}</Text>
                  </TouchableOpacity>
                )}
                {mapsActionError ? (
                  <Text
                    accessibilityRole="alert"
                    testID="property-maps-error"
                    style={[styles.error, { color: colors.destructive, fontFamily: fonts.medium, marginTop: 10 }]}
                  >
                    {mapsActionError}
                  </Text>
                ) : null}
              </View>
              ) : null}

              {descriptionText ? <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', gap: 6 }}>
                <Text style={{ color: '#173F78', fontFamily: fonts.bold, fontSize: 15, textAlign: isRTL ? 'right' : 'left' }}>{t('enrich.description')}</Text>
                <Text style={{ color: '#173F78', fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, textAlign: isRTL ? 'right' : 'left' }}>{descriptionText}</Text>
              </View> : null}

            {shouldShowPropertyGallery(galleryImages.length) ? (
              <View style={{ paddingBottom: 4 }}>
                  <View style={{ height: 180, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.card }}>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={event => {
                      const nextIndex = getGalleryIndexFromScrollOffset(
                        event.nativeEvent.contentOffset.x,
                        galleryPageWidth,
                        galleryImages.length,
                      );
                      setActiveGalleryIndex(current => current === nextIndex ? current : nextIndex);
                    }}
                    onScrollEndDrag={event => setActiveGalleryIndex(getGalleryIndexFromScrollOffset(
                      event.nativeEvent.contentOffset.x,
                      galleryPageWidth,
                      galleryImages.length,
                    ))}
                    onMomentumScrollEnd={event => setActiveGalleryIndex(getGalleryIndexFromScrollOffset(
                      event.nativeEvent.contentOffset.x,
                      galleryPageWidth,
                      galleryImages.length,
                    ))}
                  >
                    {galleryImages.map(img => (
                      (Platform.OS !== 'web' || galleryImageSources[img.id]) ? (
                        <Image key={img.id} source={{ uri: Platform.OS === 'web' ? galleryImageSources[img.id] : img.managedUri }} style={{ width: galleryPageWidth, height: 180, resizeMode: 'cover' }} />
                      ) : (
                        <View key={img.id} style={{ width: galleryPageWidth, height: 180, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                          {galleryResolutionError ? (
                            <Text
                              accessibilityRole="alert"
                              testID="property-gallery-resolution-error"
                              style={{ color: colors.destructive, fontFamily: fonts.medium, textAlign: 'center' }}
                            >
                              {galleryResolutionError}
                            </Text>
                          ) : (
                            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: 'center' }}>
                              {language === 'ar' ? 'جارٍ تحميل الصورة…' : 'Loading photo…'}
                            </Text>
                          )}
                        </View>
                      )
                    ))}
                  </ScrollView>
                  <View style={{ position: 'absolute', bottom: 16, left: 16, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 }}>
                    <Text testID="property-gallery-counter" style={{ color: '#fff', fontFamily: fonts.semiBold, fontSize: 14 }}>
                      {activeGalleryIndex + 1} / {galleryImages.length}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      const image = galleryImages[activeGalleryIndex];
                      if (image) void openPropertyAttachment(image);
                    }}
                    disabled={openingAttachmentId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={t('detail.expand_photo')}
                    testID="property-gallery-expand"
                    style={{ position: 'absolute', bottom: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 16 }}
                  >
                    <Feather name="maximize" size={20} color="#fff" />
                  </TouchableOpacity>
                  </View>
              </View>
            ) : null}

            {otherFiles.length > 0 && (
              <View style={{ marginBottom: 4 }}>
                <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <Feather name="paperclip" size={20} color={colors.primary} />
                    <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 18 }}>
                      {t('enrich.media')}
                    </Text>
                  </View>
                  <View style={{ gap: 12 }}>
                    {otherFiles.map(attachment => (
                      <TouchableOpacity
                        key={attachment.id}
                        onPress={() => void openPropertyAttachment(attachment as any)}
                        disabled={openingAttachmentId !== null}
                        testID={`property-attachment-open-${attachment.id}`}
                        style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 12, backgroundColor: colors.background, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
                      >
                        <Feather name={attachment.kind === 'pdf' ? "file-text" : "video"} size={24} color={colors.primary} />
                        <Text style={{ flex: 1, color: colors.foreground, fontFamily: fonts.medium, fontSize: 15, textAlign: isRTL ? 'right' : 'left' }}>
                          {attachment.originalName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

              {canPermanentlyDelete ? (
                <ApprovedAction testID="property-delete-action" title={t('detail.delete')} icon="trash-2" variant="danger" onPress={() => setDeleteVisible(true)} style={{ flex: 0 }} />
              ) : null}
            </View>
          </>
        ) : choices ? (
          <>
            {propertyFacts.conflicts.length > 0 && propertyFacts.conflicts.some(conflict => conflictResolutions[conflict.key] === undefined) ? (
              <View style={[styles.sourceSection, { borderColor: colors.destructive, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.destructive, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>
                  {language === 'ar' ? 'تعارض يحتاج إلى حل' : 'Conflict requires resolution'}
                </Text>
                {propertyFacts.conflicts.map(conflict => (
                  <View key={conflict.key} style={styles.sourceSection}>
                    <Text style={{ color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>
                      {language === 'ar'
                         ? `${factLabel(conflict.key)}: القيمة الحالية ${conflict.canonicalValue} · قيمة التوافق القديمة ${conflict.legacyValue}`
                         : `${factLabel(conflict.key)}: Current value ${conflict.canonicalValue} · Legacy-compatible value ${conflict.legacyValue}`}
                    </Text>
                    <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <TouchableOpacity onPress={() => resolveFactConflict(conflict, 'canonical')} testID={`property-conflict-canonical-${conflict.key}`} style={[styles.headerAction, { borderColor: colors.border }]}>
                        <Text style={{ color: colors.primary, fontFamily: fonts.medium }}>{language === 'ar' ? 'اختيار الحالية' : 'Choose current'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => resolveFactConflict(conflict, 'legacy')} testID={`property-conflict-legacy-${conflict.key}`} style={[styles.headerAction, { borderColor: colors.border }]}>
                        <Text style={{ color: colors.primary, fontFamily: fonts.medium }}>{language === 'ar' ? 'اختيار القديمة' : 'Choose legacy'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>
                  {language === 'ar' ? 'عدّل القيمة في الحقول أدناه لاختيار القيمة المعتمدة.' : 'Edit the field below to choose the authoritative value.'}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('detail.type')}</Text>
            <Text testID="property-fixed-type" style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{savedTypeLabel}</Text>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('detail.transaction')}</Text>
            <View style={styles.horizontal}>
              {(['sale', 'rent'] as Transaction[]).map(transaction => (
                <Choice key={transaction} selected={shownTransaction === transaction} onPress={() => selectTransaction(transaction)} title={t(`transaction.${transaction}` as keyof Translations)} testID={`edit-transaction-${transaction}`} />
              ))}
            </View>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
              {shownTransaction === 'rent'
                ? `${t('price.amount')} · ${formatRentalCadence(shownRentalPeriodId, t)}`
                : t('price.amount')}
            </Text>
            <TextInput
              onBlur={() => setPriceAttempted(true)}
              value={shownPrice === undefined ? '' : String(shownPrice)}
              onChangeText={value => {
                const parsed = value.trim() === '' ? undefined : parseDemoNumericInput(value, true);
                if (parsed === undefined || parsed !== null) updateChoices({ priceAmount: parsed ?? undefined });
              }}
              keyboardType="decimal-pad"
              style={[styles.input, { color: colors.foreground, borderColor: priceAttempted && isMissingPositiveAmount(shownPrice) ? colors.destructive : colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="edit-price"
            />
            {priceAttempted && isMissingPositiveAmount(shownPrice) ? <Text accessibilityRole="alert" testID="edit-price-error" style={{ color: colors.destructive, fontFamily: fonts.medium }}>{t('errors.invalid_price')}</Text> : null}
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'المنطقة' : 'Area / Region'}</Text>
            <TouchableOpacity
              onPress={() => setAreaOpen(true)}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card }]}
              accessibilityRole="button"
              testID="edit-area-selector"
            >
              <Text style={{ color: colors.foreground, fontFamily: fonts.regular }}>{areaName(choices.locationAreaId)}</Text>
            </TouchableOpacity>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'المساحة (م²)' : 'Area (m²)'}</Text>
            <TextInput
              value={choices.areaSquareMeters === undefined ? '' : String(choices.areaSquareMeters)}
              onChangeText={value => {
                const parsed = value.trim() === '' ? undefined : parseDemoNumericInput(value, true);
                 if (parsed === undefined || parsed !== null) updateChoices({ areaSquareMeters: parsed ?? undefined, areaUnit: 'square_meter' });
              }}
              keyboardType="decimal-pad"
              testID="edit-area-square-meters"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            />
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{language === 'ar' ? 'القطعة' : 'Block'}</Text>
            <TextInput
              value={choices.block ?? ''}
              onChangeText={value => updateChoices({ block: value || undefined })}
              keyboardType="number-pad"
              testID="edit-block"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            />
            <ModernPropertyForm
              transaction={shownTransaction}
              salePrice={shownTransaction === 'sale' ? shownPrice : undefined}
              recordScopeKey={`property:${property.core.id}`}
              propertyType={property.core.propertyType}
              values={choices.canonicalDetails ?? {}}
              hideApartmentSubtype
              hideFloorUse
              hidePropertyUse={Boolean((property.typeDetails as unknown as Record<string, unknown> | undefined)?.propertyUse)}
              onChange={updateCanonicalDetail}
              category={demoCategory}
              metadata={choices.demoMetadata}
              nearby={choices.nearbyServices ?? []}
              language={language}
              colors={colors}
              fonts={fonts}
              onDemoChange={(changes: Partial<PropertyDemoCaptureMetadata>) => updateChoices({
                demoMetadata: { categoryId: demoCategory!.id, ...(draftRef.current?.choices.demoMetadata ?? choices.demoMetadata ?? {}), ...changes },
              }, { replaceDemoMetadata: true })}
              onNearbyChange={(nearby: readonly string[]) => updateChoices({ nearbyServices: nearby })}
              onInvalidQuickPickChange={(field, scopeKey, invalid) => {
                if (scopeKey !== `property:${property.core.id}`) return;
                setInvalidQuickPickFields(current => {
                  const next = new Set(current);
                  if (invalid) next.add(field);
                  else next.delete(field);
                  return next;
                });
              }}
            />
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('enrich.description')}</Text>
            <TextInput
              value={choices.description ?? ''}
              onChangeText={value => updateChoices({ description: value })}
              multiline
              style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="property-edit-description"
            />
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('enrich.private_notes')}</Text>
            <TextInput
              value={choices.privateNotes ?? ''}
              onChangeText={value => updateChoices({ privateNotes: value })}
              multiline
              style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="property-edit-private-notes"
            />
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('enrich.paci')}</Text>
            <TextInput
              value={choices.paciNumber ?? ''}
              onChangeText={value => updateChoices({ paciNumber: value })}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="property-edit-paci"
            />
            <LocationAttachmentCard title={language === 'ar' ? 'الموقع' : 'Location'} testID="property-edit-location-card">
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('enrich.maps_link')}</Text>
            <TextInput
              value={choices.mapsLink ?? ''}
              onChangeText={value => {
                updateChoices({ mapsLink: value });
                setMapsFieldError(getPropertyEditMapsFieldError(value, language));
              }}
              placeholder={language === 'ar' ? 'الصق الرابط هنا' : 'Paste link here'}
              style={[styles.input, locationLinkInputStyle, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="property-edit-maps-link"
            />
            {mapsFieldError ? (
              <Text
                accessibilityRole="alert"
                testID="property-edit-maps-link-error"
                style={{ color: colors.destructive, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}
              >
                {mapsFieldError}
              </Text>
            ) : null}
            <LocationAttachmentRow>
              <LocationAttachmentButton label={t('enrich.current_location')} icon="crosshair" onPress={() => void captureEditCoordinates()} busy={locationBusy} testID="property-edit-current-location" />
              <LocationAttachmentButton label={t('enrich.open_maps')} icon="map" onPress={() => void openMapsLink()} testID="property-edit-open-maps" />
            </LocationAttachmentRow>
            {choices.coordinates ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>
                {`${choices.coordinates.latitude}, ${choices.coordinates.longitude}`}
              </Text>
            ) : null}
            </LocationAttachmentCard>
            <LocationAttachmentCard title={language === 'ar' ? 'الصور والملفات' : 'Photos and files'} testID="property-edit-attachments-card">
              <LocationAttachmentRow>
                <LocationAttachmentButton tile icon="image" label={t('enrich.add_images')} onPress={() => void addMedia(['images'])} testID="property-edit-add-images" />
                <LocationAttachmentButton tile icon="video" label={t('enrich.add_videos')} onPress={() => void addMedia(['videos'])} testID="property-edit-add-videos" />
                <LocationAttachmentButton tile icon="file-text" label={t('enrich.add_files')} onPress={() => void addPdfs()} testID="property-edit-add-pdf" />
              </LocationAttachmentRow>
              <AttachmentPrivacyNote />
            {localAttachments.map((attachment, index) => (
              <View key={attachment.id} style={[styles.sourceSection, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TouchableOpacity onPress={() => void openPropertyAttachment({ ...attachment, managedUri: attachment.uri, privacy: { classification: 'normal', disclosurePolicy: 'normal' } })} testID={`property-edit-open-${attachment.id}`}>
                  {attachment.kind === 'image' && (Platform.OS !== 'web' || galleryImageSources[attachment.id]) ? (
                    <Image
                      source={{ uri: Platform.OS === 'web' ? galleryImageSources[attachment.id] : attachment.uri }}
                      style={{ width: 96, height: 72, borderRadius: 8, marginBottom: 8, resizeMode: 'cover' }}
                    />
                  ) : null}
                  <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{attachment.isCover ? '★ ' : ''}{attachment.originalName}</Text>
                </TouchableOpacity>
                <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity disabled={index === 0} onPress={() => updateAttachmentChoices(items => {
                    const currentIndex = items.findIndex(item => item.id === attachment.id);
                    if (currentIndex <= 0) return items;
                    const ids = items.map(item => item.id);
                    [ids[currentIndex - 1], ids[currentIndex]] = [ids[currentIndex], ids[currentIndex - 1]];
                    return reorderAttachments(items, ids);
                  })} testID={`property-edit-up-${attachment.id}`}>
                    <Text style={{ color: colors.primary, fontFamily: fonts.medium }}>{t('enrich.move_up')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={attachment.kind !== 'image'} onPress={() => updateAttachmentChoices(items => setAttachmentCover(items, attachment.id))} testID={`property-edit-cover-${attachment.id}`}>
                    <Text style={{ color: colors.primary, fontFamily: fonts.medium }}>{t('enrich.cover')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateAttachmentChoices(items => {
                    let remaining = items.filter(item => item.id !== attachment.id).map((item, order) => ({ ...item, order }));
                    if (!remaining.some(item => item.isCover)) {
                      const firstImage = remaining.find(item => item.kind === 'image');
                      if (firstImage) remaining = setAttachmentCover(remaining, firstImage.id);
                    }
                    return remaining;
                  })} testID={`property-edit-remove-${attachment.id}`}>
                    <Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{t('enrich.remove')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            </LocationAttachmentCard>
            <Button title={t('edit.save')} onPress={save} loading={saving} testID="property-edit-save" />
          </>
        ) : null}
      </ScrollView>

      <Modal visible={areaOpen} animationType="slide" onRequestClose={() => setAreaOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <TextInput
            value={areaSearch}
            onChangeText={setAreaSearch}
            placeholder={t('location.search')}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, styles.areaSearch, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
            testID="edit-area-search"
          />
          <ScrollView contentContainerStyle={styles.content}>
            {searchAreas(areaSearch).map(area => (
              <TouchableOpacity
                key={area.id}
                onPress={() => {
                  updateChoices({ locationAreaId: area.id });
                  setAreaOpen(false);
                  setAreaSearch('');
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: choices?.locationAreaId === area.id }}
                testID={`edit-area-${area.id}`}
                style={[styles.areaRow, { borderBottomColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{language === 'ar' ? area.ar : area.en}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Button title={t('capture.cancel')} onPress={() => setAreaOpen(false)} variant="outline" />
        </View>
      </Modal>

      <Modal visible={sourceOpen} animationType="slide" onRequestClose={() => !sourceBusy && setSourceOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.sourcePickerHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('source.choose')}</Text>
            <TouchableOpacity onPress={() => setSourceOpen(false)} disabled={sourceBusy} testID="property-source-cancel" accessibilityRole="button">
              <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('capture.cancel')}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10 }}>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{language === 'ar' ? 'تصنيف جهة الاتصال' : 'Contact classification'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', direction: isRTL ? 'rtl' : 'ltr', gap: 8 }} testID="property-source-classification-filters">
              {(['all', ...PROPERTY_SOURCE_ROLES] as const).map(classification => <ChoiceChip key={classification}
                label={classification === 'all' ? (language === 'ar' ? 'الكل' : 'All') : t(`source.role.${classification}`)}
                selected={sourceClassification === classification}
                onPress={() => {
                  if (sourceBusy) return;
                  const next = classification === sourceClassification ? 'all' : classification;
                  setSourceClassification(next);
                  setSourcePersonId(retainVisibleSourceSelection(filterPropertySourcePeople(sourcePeople, next, sourceSearch), sourcePersonId));
                  if (next !== 'all') setSourceRole(next);
                }} testID={`property-source-filter-${classification}`} role="radio" />)}
            </View>
            <TextInput value={sourceSearch} onChangeText={query => {
              setSourceSearch(query);
              setSourcePersonId(retainVisibleSourceSelection(filterPropertySourcePeople(sourcePeople, sourceClassification, query), sourcePersonId));
            }} editable={!sourceBusy} placeholder={language === 'ar' ? 'ابحث بالاسم أو رقم الهاتف' : 'Search name or phone'} accessibilityLabel={language === 'ar' ? 'ابحث بالاسم أو رقم الهاتف' : 'Search name or phone'}
              placeholderTextColor={colors.mutedForeground} testID="property-source-search"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="property-source-results">
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t('source.person')}</Text>
            {visibleSourcePeople.map(person => (
              <TouchableOpacity
                key={person.id}
                disabled={sourceBusy}
                onPress={() => {
                  setSourcePersonId(person.id);
                  setSourceRole(person.id === source?.personId && sourceClassification === 'all' ? source.role : suggestPropertySourceRole(person, sourceClassification, sourceRole));
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: sourcePersonId === person.id }}
                testID={`property-source-choice-${person.id}`}
                style={[styles.choice, {
                  borderColor: sourcePersonId === person.id ? colors.primary : colors.border,
                  backgroundColor: sourcePersonId === person.id ? colors.primary + '16' : colors.card,
                }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>{person.name}</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{person.displayPhone}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {visibleSourcePeople.length === 0 ? (
              <Text testID="property-source-no-results" style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{sourcePeople.length === 0 ? t('source.people_empty') : language === 'ar' ? 'لا توجد جهات اتصال تطابق التصنيف والبحث المختارين.' : 'No contacts match this classification and search.'}</Text>
            ) : null}
          </ScrollView>
          <View style={{ padding: 20, paddingBottom: Math.max(insets.bottom, 20), gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            {sourceClassification === 'all' && visibleSourceSelection ? <>
              <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t('source.role')}</Text>
              <View style={styles.options}>
                {PROPERTY_SOURCE_ROLES.map(role => <Choice key={role} selected={sourceRole === role} onPress={() => setSourceRole(role)} title={t(`source.role.${role}`)} testID={`property-source-role-${role}`} />)}
              </View>
            </> : null}
            <Button title={t('source.save')} onPress={() => void saveSource()} disabled={!visibleSourceSelection || sourceBusy} loading={sourceBusy} testID="property-source-save" />
          </View>
        </View>
      </Modal>

      <Modal
        visible={sourceConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !sourceBusy && setSourceConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]} accessibilityRole="alert" testID="property-source-unlink-dialog">
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('source.unlink_title')}</Text>
            <Text style={[styles.modalMessage, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{t('source.unlink_message')}</Text>
            <TouchableOpacity onPress={() => setSourceConfirmVisible(false)} disabled={sourceBusy} style={[styles.modalAction, { borderColor: colors.border }]} testID="property-source-unlink-cancel" accessibilityRole="button">
              <Text style={[styles.modalActionText, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('source.unlink_cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void removeSource()} disabled={sourceBusy} style={[styles.modalAction, { borderColor: colors.destructive, opacity: sourceBusy ? 0.6 : 1 }]} testID="property-source-unlink-confirm" accessibilityRole="button">
              <Text style={[styles.modalActionText, { color: colors.destructive, fontFamily: fonts.semiBold }]}>{t('source.unlink_confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deleteVisible && canPermanentlyDelete}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]} testID="property-delete-dialog" accessibilityRole="alert">
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('delete.title')}
            </Text>
            <Text style={[styles.modalMessage, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('delete.message').replace('{identity}', `${t(`propertyType.${property.core.propertyType}` as keyof Translations)} · ${areaName(property.core.locationArea.id)} · ${property.core.id}`)}
            </Text>
            <TouchableOpacity onPress={() => setDeleteVisible(false)} disabled={deleting} style={[styles.modalAction, { borderColor: colors.border }]} testID="property-delete-cancel">
              <Text style={[styles.modalActionText, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('capture.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void confirmDelete()} disabled={deleting} style={[styles.modalAction, { borderColor: colors.destructive, opacity: deleting ? 0.6 : 1 }]} testID="property-delete-confirm">
              <Text style={[styles.modalActionText, { color: colors.destructive, fontFamily: fonts.semiBold }]}>{t('delete.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pendingPropertyTransition !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingPropertyTransition(null)}
      >
        <View style={styles.modalOverlay}>
          {pendingPropertyTransition ? (
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.cardRadius,
                  maxHeight: '90%',
                },
              ]}
              testID="property-transition-dialog"
              accessibilityRole="alert"
              accessibilityViewIsModal
            >
              <Text
                style={[
                  styles.modalTitle,
                  { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' },
                ]}
              >
                {pendingPropertyTransition.title}
              </Text>
              <ScrollView style={{ flexGrow: 0, maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
                <Text
                  style={[
                    styles.modalMessage,
                    { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' },
                  ]}
                >
                  {pendingPropertyTransition.message}
                </Text>
              </ScrollView>
              <TouchableOpacity
                onPress={() => setPendingPropertyTransition(null)}
                style={[styles.modalAction, { borderColor: colors.border }]}
                testID="property-transition-cancel"
                accessibilityRole="button"
              >
                <Text style={[styles.modalActionText, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
                  {t('capture.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmPropertyTransition}
                style={[styles.modalAction, { borderColor: colors.destructive }]}
                testID="property-transition-confirm"
                accessibilityRole="button"
              >
                <Text style={[styles.modalActionText, { color: colors.destructive, fontFamily: fonts.semiBold }]}>
                  {t('transition.remove_confirm')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={saveCompletionVisible && completionOrigin === 'enrichment' && property?.core.id === id}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]}
            testID="property-enrichment-save-completion"
            accessibilityRole="alert"
            accessibilityViewIsModal
          >
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('summary.success')}
            </Text>
            <Text style={[styles.modalMessage, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('summary.success_detail')}
            </Text>
            <TouchableOpacity
              onPress={viewSavedProperty}
              style={[styles.modalAction, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              testID="property-enrichment-view-property"
              accessibilityRole="button"
            >
              <Text style={[styles.modalActionText, { color: colors.primaryForeground, fontFamily: fonts.semiBold }]}>
                {t('summary.view_property')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setSaveCompletionVisible(false);
                router.replace('/' as never);
              }}
              style={[styles.modalAction, { borderColor: colors.border }]}
              testID="property-enrichment-home"
              accessibilityRole="button"
            >
              <Text style={[styles.modalActionText, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
                {t('home.title')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={leaveVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.cardRadius,
              },
            ]}
            testID="property-edit-leave-dialog"
            accessibilityRole="alert"
          >
            <Text
              style={[
                styles.modalTitle,
                {
                  color: colors.foreground,
                  fontFamily: fonts.bold,
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
            >
              {t('edit.leave_title')}
            </Text>
            <Text
              style={[
                styles.modalMessage,
                {
                  color: colors.mutedForeground,
                  fontFamily: fonts.regular,
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
            >
              {t('edit.leave_message')}
            </Text>
            <TouchableOpacity
              onPress={() => setLeaveVisible(false)}
              style={[styles.modalAction, { borderColor: colors.border }]}
              testID="property-edit-keep-editing"
              accessibilityRole="button"
            >
              <Text style={[styles.modalActionText, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
                {t('capture.keep_editing')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setLeaveVisible(false);
                setMode('detail');
                router.replace(`/property/${encodeURIComponent(id!)}` as never);
              }}
              style={[styles.modalAction, { borderColor: colors.border }]}
              testID="property-edit-keep-draft-exit"
              accessibilityRole="button"
            >
              <Text style={[styles.modalActionText, { color: colors.primary, fontFamily: fonts.semiBold }]}>
                {t('edit.keep_exit')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void discardEditDraft()}
              disabled={discarding}
              style={[styles.modalAction, { borderColor: colors.border, opacity: discarding ? 0.6 : 1 }]}
              testID="property-edit-discard"
              accessibilityRole="button"
              accessibilityState={{ disabled: discarding, busy: discarding }}
            >
              <Text style={[styles.modalActionText, { color: colors.destructive, fontFamily: fonts.semiBold }]}>
                {t('edit.discard')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {mode === 'detail' && (
        <View style={{ flexShrink: 0, paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 10), paddingTop: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: colors.border, direction: 'ltr', flexDirection: isRTL ? 'row' : 'row-reverse', gap: 10 }}>
          {Platform.OS === 'web' ? (
            <Link
              href={getPropertyDetailActionHref(property.core.id, 'share') as never}
              testID="property-share-action"
              accessibilityRole="link"
              style={{ ...approvedActionStyle, backgroundColor: colors.primary, borderColor: colors.primary, display: 'flex', flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, textDecorationLine: 'none' }}
            >
              <Feather name="share-2" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 16 }}>
                {t('detail.share')}
              </Text>
            </Link>
          ) : (
            <TouchableOpacity onPress={handleShare} testID="property-share-action" style={{ ...approvedActionStyle, backgroundColor: colors.primary, borderColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
              <Feather name="share-2" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 16 }}>
                {t('detail.share')}
              </Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'web' ? (
            <Link
              href={getPropertyEditRouteHref(property.core.id, offeredStudio) as never}
              testID="property-edit-action"
              accessibilityRole="link"
              style={{ ...approvedActionStyle, backgroundColor: colors.card, display: 'flex', flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.primary, textDecorationLine: 'none' }}
            >
              <Feather name="edit-2" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontFamily: fonts.bold, fontSize: 16 }}>
                {t('detail.edit')}
              </Text>
            </Link>
          ) : (
            <TouchableOpacity onPress={handleEdit} testID="property-edit-action" style={{ ...approvedActionStyle, backgroundColor: colors.card, flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.primary }}>
              <Feather name="edit-2" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontFamily: fonts.bold, fontSize: 16 }}>
                {t('detail.edit')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  function DetailRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{value}</Text>
      </View>
    );
  }

  function Choice({ selected, onPress, title, testID }: { selected: boolean; onPress: () => void; title: string; testID: string }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        testID={testID}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        style={[styles.choice, { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.card }]}
      >
        <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{title}</Text>
      </TouchableOpacity>
    );
  }
}

export default PropertyDetailScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, padding: 24, justifyContent: 'center', gap: 24 },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  headerMain: { minHeight: 60, alignItems: 'center' },
  headerTitle: { flex: 2, fontSize: 20, textAlign: 'center' },
  headerSide: { flex: 1, minWidth: 0 },
  headerActionGroups: { gap: 8 },
  headerActions: { flexWrap: 'wrap', alignItems: 'stretch', gap: 8 },
  destructiveActionRow: { width: '100%' },
  headerAction: { minHeight: 40, minWidth: 84, maxWidth: '100%', justifyContent: 'center', flexGrow: 1, flexBasis: 96, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 },
  destructiveAction: { flexGrow: 0, flexBasis: 96 },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  detailRow: { paddingVertical: 18, borderBottomWidth: 1 },
  detailValue: { fontSize: 18, marginTop: 6 },
  sourceSection: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 12 },
  sourceHeader: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  sourceTitle: { flex: 1, gap: 3 },
  relationshipUnlink: { minHeight: 44, borderWidth: 1, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 14 },
  sourcePickerHeader: { minHeight: 60, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  label: { fontSize: 16, marginTop: 8 },
  options: { gap: 8 },
  horizontal: { flexDirection: 'row', gap: 8 },
  choice: { minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  input: { minHeight: 54, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  multiline: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
  error: { padding: 12 },
  demoEditSection: { marginTop: 14, gap: 10 },
  editDemoChoice: { minHeight: 44, padding: 10, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  areaSearch: { marginHorizontal: 20, marginTop: 16 },
  areaRow: { minHeight: 52, justifyContent: 'center', borderBottomWidth: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 29, 31, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 20 },
  modalMessage: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
  modalAction: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalActionText: { fontSize: 15, textAlign: 'center' },
});
