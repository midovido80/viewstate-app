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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Property, PROPERTY_TYPES, PropertyDetailField, Transaction, PropertyDemoCaptureMetadata, createPropertyShareSelection, buildPropertySharePreview } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { formatPropertyDetailValue, propertyDetailDisplayDefinitions, propertyDetailLabels } from '@/components/PropertyEnrichmentFields';
import { ModernPropertyForm } from '@/components/ModernPropertyForm';
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
  buildPropertyUpdateCandidate,
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
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { applyFloorTransition, createFloorTransitionProposal } from '@/services/amenityTypeTransitions';
import {
  applyPropertyTransition,
  createPropertyTypeTransitionProposal,
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
  const insets = useSafeAreaInsets();
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
    const sourceAttachments = standardApartment && mode === 'edit'
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
      setSourceRole(source?.role ?? 'owner');
      setSourceOpen(true);
    } catch {
      setError(t('source.load_failed'));
    }
  };

  const saveSource = async () => {
    if (!id || !sourcePersonId || sourceBusy) return;
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
    } catch {
      setError(t('edit.draft_unreadable'));
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
    if (field === 'clarification') {
      updateChoices({ canonicalDetails: { ...(draft.choices.canonicalDetails ?? {}), clarification: value } });
      return;
    }
    if (field !== 'floorUse' || !draft.choices.canonicalDetails?.floorUse || draft.choices.canonicalDetails.floorUse === value) {
      updateChoices({ canonicalDetails: { ...(draft.choices.canonicalDetails ?? {}), [field]: value } });
      return;
    }
    const scope = `property:${draft.propertyCoreId}`;
    const proposal = createFloorTransitionProposal(scope, draft.choices.canonicalDetails, value as 'residential' | 'commercial');
    if (!proposal || proposal.affected.length === 0) {
      updateChoices({ canonicalDetails: { ...(draft.choices.canonicalDetails ?? {}), [field]: value } });
      return;
    }
    Alert.alert(
      language === 'ar' ? 'تغيير استخدام الطابق؟' : 'Change floor use?',
      language === 'ar' ? 'سيتم حذف القيم غير المتوافقة بعد التأكيد.' : 'Incompatible values will be removed after confirmation.',
      [
        { text: t('capture.cancel'), style: 'cancel' },
        {
          text: t('transition.remove_confirm'),
          style: 'destructive',
          onPress: () => {
            const next = applyFloorTransition(scope, draft.choices.canonicalDetails ?? {}, proposal);
            if (next) updateChoices({ canonicalDetails: next }, { replaceCanonicalDetails: true });
          },
        },
      ],
    );
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
            const makeCover = standardApartment
              ? !hasCover && !firstNewImageCovered && item.kind === 'image'
              : !hasCover && index === 0 && item.kind === 'image';
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

  const addMedia = async () => {
    if (!property || !draft) return;
    if (standardApartment && Platform.OS === 'web') {
      try {
        openStudioWebFilePicker({
          accept: 'image/*,video/*',
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
      await storePickedAttachments(await pickAndStoreMedia(property.core.id, localAttachments, { fileStore: attachmentStore }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
    }
  };

  const addPdfs = async () => {
    if (!property || !draft) return;
    if (standardApartment && Platform.OS === 'web') {
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
    if (!standardApartment) {
      if (!link) return;
      try {
        await openPastedLocationLink(pastedMapLocation(normalizeGoogleMapsLink(link)));
      } catch {
        setError(t('enrich.maps_link_invalid'));
      }
      return;
    }
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

  const selectPropertyType = (propertyType: Property['core']['propertyType']) => {
    if (!draft || propertyType === draft.choices.propertyType) return;
    const proposal = createPropertyTypeTransitionProposal(
      `property:${draft.propertyCoreId}`,
      transitionStateFor(draft.choices),
      propertyType,
    );
    if (!proposal) return;
    requestPropertyTransition(
      proposal,
      language === 'ar'
        ? `تغيير نوع العقار إلى ${t(`propertyType.${propertyType}` as keyof Translations)}؟`
        : `Change property type to ${t(`propertyType.${propertyType}` as keyof Translations)}?`,
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
      if (standardApartment) {
        const mapsValidation = getPropertyEditMapsFieldError(currentDraft.choices.mapsLink ?? '', language);
        setMapsFieldError(mapsValidation);
        if (mapsValidation) return;
      }
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
      const candidate = buildPropertyUpdateCandidate(currentDraft.baseline, currentDraft.choices);
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
  const galleryPageWidth = Dimensions.get('window').width - 32;
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
      if (standardApartment && !location?.mapsLink?.value && !location?.coordinates) {
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
    standardApartment,
  });

  const numericSpecTiles: { fieldId: string, value: string | number | boolean, icon: any, family: 'Feather' | 'MaterialCommunityIcons', label: string }[] = [];
  const addSpec = (fieldId: string, value: string | number | boolean, icon: any, family: 'Feather' | 'MaterialCommunityIcons') => {
    numericSpecTiles.push({ fieldId, value, icon, family, label: propertyDetailLabels[fieldId as PropertyDetailField]?.[language === 'ar' ? 1 : 0] ?? fieldId });
  };
  if (offeredStudio) {
    addSpec('studioRoomCount', 1, 'bed-outline', 'MaterialCommunityIcons');
    numericSpecTiles[numericSpecTiles.length - 1].label = language === 'ar' ? 'غرفة مفتوحة' : 'Open room';
  } else if (propertyFacts.templateFacts.bedroomCount !== undefined) addSpec('bedroomCount', propertyFacts.templateFacts.bedroomCount, 'bed-outline', 'MaterialCommunityIcons');
  if (propertyFacts.templateFacts.bathroomCount !== undefined) addSpec('bathroomCount', propertyFacts.templateFacts.bathroomCount, 'shower', 'MaterialCommunityIcons');
  if (propertyFacts.templateFacts.livingRoomCount !== undefined) addSpec('livingRoomCount', propertyFacts.templateFacts.livingRoomCount, 'sofa-outline', 'MaterialCommunityIcons');
  if (propertyFacts.templateFacts.parkingSpaceCount !== undefined) addSpec('parkingSpaceCount', propertyFacts.templateFacts.parkingSpaceCount, 'car', 'MaterialCommunityIcons');
  if (propertyFacts.templateFacts.floorNumber !== undefined) addSpec('floorNumber', propertyFacts.templateFacts.floorNumber, 'stairs', 'MaterialCommunityIcons');
  if (!offeredStudio && propertyFacts.areaSquareMeters !== undefined) addSpec('areaSquareMeters', `${propertyFacts.areaSquareMeters} ${language === 'ar' ? 'م²' : 'm²'}`, 'set-square', 'MaterialCommunityIcons');

  const detailValues = (offeredStudio
    ? getOfferedStudioDetailValues(visibleContent.typeDetails)
    : visibleContent.typeDetails) as Record<string, unknown>;
  const actualStudioAreaSquareMeters = studioAreaSquareMeters
    ?? (offeredStudio ? readNumericDetail(detailValues.builtUpAreaSquareMeters) : undefined);
  const locationArea = getAreaById(property.core.locationArea.id);
  const locationDisplay = getPropertyDetailLocationDisplay({
    governorate: locationArea ? (language === 'ar' ? locationArea.governorateAr : locationArea.governorateEn) : undefined,
    area: areaName(property.core.locationArea.id),
    block: property.core.block,
    address: property.locationEnrichment?.manualLocationText?.value,
    description: visibleContent.description,
  });
  const availableFeatures = Array.from(new Set([
    ...propertyDetailDisplayDefinitions
      .filter(definition => definition.group === 'amenity' && detailValues[definition.field] === true)
      .map(definition => definition.label[language === 'ar' ? 1 : 0]),
    ...(property.demoCapture?.selectedFeatures ?? [])
      .filter(id => !isDemoFeatureSuppressed(id, property.core.propertyType, detailValues, detailValues.floorUse as string | undefined))
      .map(id => demoCategory?.features.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0] ?? id),
  ]));
  const supplementalDetails = propertyDetailDisplayDefinitions
    .filter(definition =>
      definition.group !== 'amenity'
      && !numericSpecTiles.some(tile => tile.fieldId === definition.field)
      && detailValues[definition.field] !== undefined
      && definition.field !== 'plotAreaSquareMeters'
      && definition.field !== 'builtUpAreaSquareMeters')
    .map(definition => ({
      field: definition.field,
      label: definition.label[language === 'ar' ? 1 : 0],
      value: formatPropertyDetailValue(definition.field, detailValues[definition.field], language, t),
    }));
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {mode === 'detail' ? (
        <View style={{ backgroundColor: colors.background, paddingBottom: 16 }}>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
            <TouchableOpacity
              onPress={() => router.replace('/' as never)}
              accessibilityRole="button"
              accessibilityLabel={language === 'ar' ? 'الرئيسية' : 'Home'}
              testID="property-home-action"
              style={[navigationButtonStyle, { flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6 }]}
            >
              <Feather name="home" size={22} color={navigationButtonTextStyle.color} />

              <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: navigationButtonTextStyle.color }}>
                {language === 'ar' ? 'الرئيسية' : 'Home'}
              </Text>
            </TouchableOpacity>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 20 }}>
              <TouchableOpacity testID="property-favorite-icon">
                <Feather name="heart" size={24} color={colors.foreground} />
              </TouchableOpacity>
              {canPermanentlyDelete ? (
                <TouchableOpacity onPress={() => setDeleteVisible(true)} accessibilityRole="button" testID="property-delete-action">
                  <Feather name="trash-2" size={24} color={colors.destructive} />
                  <Text style={{ display: 'none' }}>{t('detail.delete')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', paddingHorizontal: 20 }}>
            <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }} />
            <Text style={{ flex: 4, fontFamily: fonts.bold, fontSize: 20, color: colors.foreground, textAlign: 'center' }}>
              {t('detail.title')}
            </Text>
            {Platform.OS === 'web' ? (
              <a
                href={getPropertyDetailBackRoute()}
                aria-label={t('capture.back')}
                data-testid="property-detail-back"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 64, padding: '8px 12px', borderRadius: 10, backgroundColor: navigationButtonStyle.backgroundColor, color: '#FFFFFF', textDecoration: 'none', fontFamily: fonts.semiBold }}
              >
                <Text style={[navigationButtonTextStyle, { fontFamily: fonts.semiBold }]}>{t('capture.back')}</Text>
              </a>
            ) : (
              <TouchableOpacity onPress={() => router.replace(getPropertyDetailBackRoute() as never)} style={navigationButtonStyle} testID="property-detail-back">
                <Text style={[navigationButtonTextStyle, { fontFamily: fonts.semiBold }]}>{t('capture.back')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <View style={[styles.headerMain, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={leaveEditor} accessibilityRole="button" testID="property-detail-back" style={[styles.headerSide, navigationButtonStyle]}>
              <Text numberOfLines={1} style={{ color: navigationButtonTextStyle.color, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{t('capture.back')}</Text>
            </TouchableOpacity>
            <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('edit.title')}</Text>
            <TouchableOpacity
              onPress={() => router.replace('/' as never)}
              accessibilityRole="button"
              accessibilityLabel={language === 'ar' ? 'الرئيسية' : 'Home'}
              testID="property-home-action"
              style={[styles.headerSide, navigationButtonStyle, { flexDirection: 'row', gap: 5 }]}
            >
              <Feather name="home" size={18} color={navigationButtonTextStyle.color} />
              <Text style={{ color: navigationButtonTextStyle.color, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>
                {language === 'ar' ? 'الرئيسية' : 'Home'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={mode === 'detail' ? { paddingBottom: 100 } : styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text testID="property-edit-error" style={[styles.error, { color: colors.destructive, fontFamily: fonts.medium }]}>{error}</Text> : null}
        {pendingOperation && (recoveryStatus === 'retry_required' || recoveryStatus === 'update_failed') ? (
          <Button title={t('edit.retry_update')} onPress={() => void retryRecovery(true)} loading={saving} testID="property-update-retry" />
        ) : null}
        {pendingOperation && recoveryStatus === 'cleanup_failed' ? (
          <Button title={t('edit.retry_cleanup')} onPress={() => void retryRecovery(false)} loading={saving} testID="property-update-cleanup-retry" />
        ) : null}

        {mode === 'detail' ? (
          <>
            {shouldShowPropertyGallery(galleryImages.length) ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
                  <View style={{ height: 260, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.card }}>
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
                        <Image key={img.id} source={{ uri: Platform.OS === 'web' ? galleryImageSources[img.id] : img.managedUri }} style={{ width: galleryPageWidth, height: 260, resizeMode: 'cover' }} />
                      ) : (
                        <View key={img.id} style={{ width: galleryPageWidth, height: 260, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
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
              <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
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

            <View style={{ paddingHorizontal: 16, gap: 16 }}>
              <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 24, textAlign: isRTL ? 'right' : 'left' }}>
                      {t(`propertyType.${property.core.propertyType}`)}
                    </Text>
                  </View>
                   <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: propertyIntent.valid ? colors.primary : colors.destructive, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 }}>
                     <Text style={{ color: propertyIntent.valid ? colors.primary : colors.destructive, fontFamily: fonts.semiBold, fontSize: 14 }}>
                       {propertyIntent.label}
                     </Text>
                   </View>
                </View>

               {shownPrice !== undefined ? (
                 <View style={{ marginTop: 24, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'baseline', gap: 8 }}>
                   <Text style={{ color: colors.primary, fontFamily: fonts.bold, fontSize: 32 }}>
                     {propertyIntent.id === 'offered_rent'
                       ? formatRentalPrice(shownPrice, 'KWD', shownRentalPeriodId, language, t)
                       : formatPrice(shownPrice, 'KWD', language)}
                   </Text>
                   {propertyIntent.id === 'offered_rent' && (
                     <Text style={{ color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: 15 }}>
                       {formatRentalCadence(shownRentalPeriodId, t)}
                     </Text>
                   )}
                 </View>
               ) : null}
              </View>

              <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Feather name="map-pin" size={20} color={colors.primary} />
                  <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 18 }}>
                    {language === 'ar' ? 'الموقع' : 'Location'}
                  </Text>
                </View>
                <View style={{ gap: 10 }}>
                  {locationDisplay.map(item => item.field === 'description' ? (
                    <View key={item.field} style={{ gap: 6 }}>
                      <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('enrich.description')}
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: 15, lineHeight: 24, textAlign: isRTL ? 'right' : 'left' }}>
                        {item.value}
                      </Text>
                    </View>
                  ) : (
                    <DetailRow
                      key={item.field}
                      label={t(`detail.${item.field}` as keyof Translations)}
                      value={item.value}
                    />
                  ))}
                </View>
              </View>

              {numericSpecTiles.length > 0 && (
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 12 }}>
                  {numericSpecTiles.map(spec => (
                    <View key={spec.fieldId} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, flexBasis: '22%', flexGrow: 1, alignItems: 'center', gap: 12 }}>
                      {spec.family === 'Feather'
                        ? <Feather name={spec.icon} size={28} color={colors.primary} />
                        : <MaterialCommunityIcons name={spec.icon} size={28} color={colors.primary} />
                      }
                      <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, fontSize: 15, textAlign: 'center' }}>{spec.value}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' }} numberOfLines={1}>{spec.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {propertySupplementalDetails.length > 0 && (
                <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 18, marginBottom: 8, textAlign: isRTL ? 'right' : 'left' }}>
                    {language === 'ar' ? 'تفاصيل العقار' : 'Property details'}
                  </Text>
                  {propertySupplementalDetails.map(item => <DetailRow key={item.field} label={item.label} value={item.value} />)}
                </View>
              )}

              {availableFeatures.length > 0 && (
                <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <Feather name="check-circle" size={20} color={colors.primary} />
                    <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 18 }}>
                      {language === 'ar' ? 'المزايا المتوفرة' : 'Available features'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10 }}>
                    {availableFeatures.map(feat => (
                      <View key={feat} style={{ backgroundColor: colors.background, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 15 }}>{feat}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
                    <Feather name="user" size={20} color={colors.primary} />
                    <View>
                      <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 18, textAlign: isRTL ? 'right' : 'left' }}>{t('source.title')}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: 14, textAlign: isRTL ? 'right' : 'left' }}>{t('source.private')}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => void openSource()} accessibilityRole="button" testID="property-source-change" style={{ backgroundColor: colors.background, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.primary, fontFamily: fonts.semiBold, fontSize: 14 }}>{sourcePerson ? t('source.change') : t('source.choose')}</Text>
                  </TouchableOpacity>
                </View>
                {sourcePerson ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 16, textAlign: isRTL ? 'right' : 'left' }} testID="property-source-person">{sourcePerson.name}</Text>
                     <Text style={{ color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: 14, textAlign: isRTL ? 'right' : 'left' }}>{t(`source.role.${source?.role}` as any)}</Text>
                    <TouchableOpacity onPress={() => setSourceConfirmVisible(true)} accessibilityRole="button" testID="property-source-unlink" style={{ marginTop: 8, padding: 10, borderWidth: 1, borderColor: colors.destructive, borderRadius: 10 }}>
                      <Text style={{ color: colors.destructive, fontFamily: fonts.semiBold, textAlign: 'center' }}>{t('source.unlink')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: 15, textAlign: isRTL ? 'right' : 'left' }}>{t('source.none')}</Text>
                )}
              </View>

              {nearbyServicesTextList.length > 0 && (
                <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <Feather name="map" size={20} color={colors.primary} />
                    <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 18 }}>
                      {language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10 }}>
                    {nearbyServicesTextList.map(srv => (
                      <View key={srv} style={{ backgroundColor: colors.background, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 15 }}>{srv}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {(detailMapsHref || property.locationEnrichment?.coordinates) ? (
              <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border }}>
                {Platform.OS === 'web' ? detailMapsHref ? (
                  <a
                    href={detailMapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="property-maps-action"
                    aria-label={language === 'ar' ? 'عرض على الخريطة' : 'View on map'}
                    style={{ backgroundColor: colors.foreground, borderRadius: 16, padding: 14, display: 'flex', flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, color: colors.background, textDecoration: 'none' }}
                  >
                    <Feather name="map" size={20} color={colors.background} />
                    <Text style={{ color: colors.background, fontFamily: fonts.bold, fontSize: 16 }}>
                      {language === 'ar' ? 'عرض على الخريطة' : 'View on map'}
                    </Text>
                  </a>
                ) : (
                  <View
                    testID="property-maps-action"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: true }}
                    style={{ backgroundColor: colors.foreground, borderRadius: 16, padding: 14, flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, opacity: 0.55 }}
                  >
                    <Feather name="map" size={20} color={colors.background} />
                    <Text style={{ color: colors.background, fontFamily: fonts.bold, fontSize: 16 }}>
                      {language === 'ar' ? 'عرض على الخريطة' : 'View on map'}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={openDetailMapsLink}
                    testID="property-maps-action"
                    style={{ backgroundColor: colors.foreground, borderRadius: 16, paddingVertical: 14, flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}
                  >
                    <Feather name="map" size={20} color={colors.background} />
                    <Text style={{ color: colors.background, fontFamily: fonts.bold, fontSize: 16 }}>
                      {language === 'ar' ? 'عرض على الخريطة' : 'View on map'}
                    </Text>
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
            <View style={styles.options}>
              {PROPERTY_TYPES.map(type => (
                <Choice key={type} selected={choices.propertyType === type} onPress={() => selectPropertyType(type)} title={t(`propertyType.${type}` as keyof Translations)} testID={`edit-type-${type}`} />
              ))}
            </View>
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
              value={shownPrice === undefined ? '' : String(shownPrice)}
              onChangeText={value => {
                const parsed = value.trim() === '' ? undefined : parseDemoNumericInput(value, true);
                if (parsed === undefined || parsed !== null) updateChoices({ priceAmount: parsed ?? undefined });
              }}
              keyboardType="decimal-pad"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="edit-price"
            />
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
              recordScopeKey={`property:${property.core.id}`}
              propertyType={choices.propertyType}
              values={choices.canonicalDetails ?? {}}
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
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('enrich.manual_location')}</Text>
            <TextInput
              value={choices.manualLocationText ?? ''}
              onChangeText={value => updateChoices({ manualLocationText: value })}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="property-edit-manual-location"
            />
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('enrich.maps_link')}</Text>
            <TextInput
              value={choices.mapsLink ?? ''}
              onChangeText={value => {
                updateChoices({ mapsLink: value });
                if (standardApartment) setMapsFieldError(getPropertyEditMapsFieldError(value, language));
              }}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="property-edit-maps-link"
            />
            {standardApartment && mapsFieldError ? (
              <Text
                accessibilityRole="alert"
                testID="property-edit-maps-link-error"
                style={{ color: colors.destructive, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}
              >
                {mapsFieldError}
              </Text>
            ) : null}
            <TouchableOpacity onPress={() => void openMapsLink()} style={[styles.headerAction, { borderColor: colors.border, backgroundColor: colors.card }]} testID="property-edit-open-maps">
              <Text style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: 'center' }}>{t('enrich.open_maps')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void captureEditCoordinates()} disabled={locationBusy} style={[styles.headerAction, { borderColor: colors.border, backgroundColor: colors.card }]} testID="property-edit-current-location">
              <Text style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: 'center' }}>{t('enrich.current_location')}</Text>
            </TouchableOpacity>
            {choices.coordinates ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>
                {`${choices.coordinates.latitude}, ${choices.coordinates.longitude}`}
              </Text>
            ) : null}
            <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity onPress={() => void addMedia()} style={[styles.headerAction, { borderColor: colors.border, backgroundColor: colors.card }]} testID="property-edit-add-media">
                <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('enrich.add_media')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void addPdfs()} style={[styles.headerAction, { borderColor: colors.border, backgroundColor: colors.card }]} testID="property-edit-add-pdf">
                <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('enrich.add_pdf')}</Text>
              </TouchableOpacity>
            </View>
            {localAttachments.map((attachment, index) => (
              <View key={attachment.id} style={[styles.sourceSection, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TouchableOpacity onPress={() => void openPropertyAttachment({ ...attachment, managedUri: attachment.uri, privacy: { classification: 'normal', disclosurePolicy: 'normal' } })} testID={`property-edit-open-${attachment.id}`}>
                  {standardApartment && attachment.kind === 'image' && (Platform.OS !== 'web' || galleryImageSources[attachment.id]) ? (
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
                  <TouchableOpacity disabled={standardApartment && attachment.kind !== 'image'} onPress={() => updateAttachmentChoices(items => setAttachmentCover(items, attachment.id))} testID={`property-edit-cover-${attachment.id}`}>
                    <Text style={{ color: colors.primary, fontFamily: fonts.medium }}>{t('enrich.cover')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateAttachmentChoices(items => {
                    let remaining = items.filter(item => item.id !== attachment.id).map((item, order) => ({ ...item, order }));
                    if (standardApartment && !remaining.some(item => item.isCover)) {
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
            <Button title={t('edit.save')} onPress={save} loading={saving} testID="property-edit-save" />
          </>
        ) : null}
      </ScrollView>

      <Modal visible={areaOpen} animationType="slide" onRequestClose={() => setAreaOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) }]}>
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
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t('source.role')}</Text>
            <View style={styles.options}>
              {PROPERTY_SOURCE_ROLES.map(role => (
                <Choice
                  key={role}
                  selected={sourceRole === role}
                  onPress={() => setSourceRole(role)}
                  title={t(`source.role.${role}`)}
                  testID={`property-source-role-${role}`}
                />
              ))}
            </View>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t('source.person')}</Text>
            {sourcePeople.map(person => (
              <TouchableOpacity
                key={person.id}
                onPress={() => setSourcePersonId(person.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: sourcePersonId === person.id }}
                testID={`property-source-choice-${person.id}`}
                style={[styles.choice, {
                  borderColor: sourcePersonId === person.id ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>{person.name}</Text>
              </TouchableOpacity>
            ))}
            {sourcePeople.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{t('source.people_empty')}</Text>
            ) : null}
            <Button title={t('source.save')} onPress={() => void saveSource()} disabled={!sourcePersonId} loading={sourceBusy} testID="property-source-save" />
          </ScrollView>
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
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 16), paddingTop: 16, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row', gap: 12 }}>
          {Platform.OS === 'web' ? (
            <Link
              href={getPropertyDetailActionHref(property.core.id, 'share') as never}
              testID="property-share-action"
              accessibilityRole="link"
              style={{ flex: 2, backgroundColor: colors.turquoise, borderRadius: 16, paddingVertical: 14, display: 'flex', flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, textDecorationLine: 'none' }}
            >
              <Feather name="share-2" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 16 }}>
                {t('detail.share')}
              </Text>
            </Link>
          ) : (
            <TouchableOpacity onPress={handleShare} testID="property-share-action" style={{ flex: 2, backgroundColor: colors.turquoise, borderRadius: 16, paddingVertical: 14, flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
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
              style={{ flex: 1, backgroundColor: navigationButtonStyle.backgroundColor, borderRadius: 16, paddingVertical: 14, display: 'flex', flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: navigationButtonStyle.borderColor, textDecorationLine: 'none' }}
            >
              <Feather name="edit-2" size={20} color={navigationButtonTextStyle.color} />
              <Text style={{ color: navigationButtonTextStyle.color, fontFamily: fonts.bold, fontSize: 16 }}>
                {t('detail.edit')}
              </Text>
            </Link>
          ) : (
            <TouchableOpacity onPress={handleEdit} testID="property-edit-action" style={{ flex: 1, backgroundColor: navigationButtonStyle.backgroundColor, borderRadius: 16, paddingVertical: 14, flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: navigationButtonStyle.borderColor }}>
              <Feather name="edit-2" size={20} color={navigationButtonTextStyle.color} />
              <Text style={{ color: navigationButtonTextStyle.color, fontFamily: fonts.bold, fontSize: 16 }}>
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
