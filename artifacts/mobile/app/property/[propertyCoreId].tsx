import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Property, PROPERTY_TYPES, PropertyDetailField, Transaction, PropertyDemoCaptureMetadata } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { formatPropertyDetailValue, propertyDetailDisplayDefinitions, propertyDetailLabels } from '@/components/PropertyEnrichmentFields';
import { ModernPropertyForm } from '@/components/ModernPropertyForm';
import { getDemoCategory, DEMO_NEARBY_SERVICES, parseDemoNumericInput } from '@/services/propertyDemoCatalog';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { formatPrice, formatRentalCadence, formatRentalPrice, MARKET_CONFIG } from '@/constants/market';
import { getAreaById, searchAreas } from '@/constants/kuwait-areas';
import { store } from '@/services/persistence';
import {
  Person,
  PROPERTY_SOURCE_ROLES,
  PropertySource,
  PropertySourceRole,
} from '@/services/people';
import { deleteSavedProperty } from '@/services/propertyDeletion';
import { clearConfirmedPropertyEnrichmentDraft, loadPropertyEnrichmentDraft, type PropertyEnrichmentDraftV1 } from '@/services/propertyEnrichmentRecovery';
import { createExpoFileStore, createIndexedDbWebAttachmentBlobStore, createWebAttachmentFileStore, openAttachment, pickAndStoreMedia, pickAndStorePdfs, persistAttachmentsThenDeleteRemoved, type LocalAttachment, type WebAttachmentBlobStore } from '@/services/attachments';
import { reorderAttachments, setAttachmentCover } from '@/services/attachmentOperations';
import { projectPropertyFacts, isDemoFeatureSuppressed, isMappedTemplateField } from '@/services/propertyFactProjection';
import { normalizeGoogleMapsLink, openPastedLocationLink, pastedMapLocation, requestCurrentCoordinates } from '@/services/location';
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
import { applyFloorTransition, createFloorTransitionProposal } from '@/services/amenityTypeTransitions';

export function PropertyDetailScreen({ forceEdit = false }: { forceEdit?: boolean } = {}) {
  const { propertyCoreId, edit } = useLocalSearchParams<{ propertyCoreId?: string | string[]; edit?: string }>();
  const id = Array.isArray(propertyCoreId) ? propertyCoreId[0] : propertyCoreId;
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const [property, setProperty] = useState<Property | null>(null);
  const [hasEnrichmentDraft, setHasEnrichmentDraft] = useState(false);
  const [legacyEnrichmentDraft, setLegacyEnrichmentDraft] = useState<PropertyEnrichmentDraftV1 | null>(null);
  const [draft, setDraft] = useState<PropertyEditDraftV1 | null>(null);
  const draftRef = useRef<PropertyEditDraftV1 | null>(null);
  const [mode, setMode] = useState<'detail' | 'edit'>('detail');
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'unreadable'>('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const saveFlight = useRef(false);
  const draftMutationFlight = useRef<Promise<boolean>>(Promise.resolve(true));
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaSearch, setAreaSearch] = useState('');
  const [leaveVisible, setLeaveVisible] = useState(false);
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
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, 'canonical' | 'legacy'>>({});
  const [invalidQuickPickFields, setInvalidQuickPickFields] = useState<Set<PropertyDetailField>>(new Set());
  const editEntryConsumed = useRef(false);
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
      setMode('edit');
    } catch {
      setError(t('edit.draft_unreadable'));
    }
  };

  useFocusEffect(useCallback(() => {
    if ((edit === '1' || forceEdit) && status === 'ready' && mode === 'detail' && !editEntryConsumed.current) {
      editEntryConsumed.current = true;
      void beginEdit();
    }
  }, [edit, forceEdit, status, mode]));

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

  const addMedia = async () => {
    if (!property || !draft) return;
    try {
      const next = await pickAndStoreMedia(property.core.id, localAttachments, { fileStore: attachmentStore });
      if (next.length) {
        const copied = next.map(item => item.uri);
        const owned = await updateChoices(current => {
          const existing = current.attachments ?? property.attachments ?? [];
          const hasCover = existing.some(item => item.isCover);
          return {
            attachments: [
              ...existing,
              ...next.map((item, index) => ({
                id: item.id,
                kind: item.kind,
                originalName: item.originalName,
                mimeType: item.mimeType,
                order: existing.length + index,
                managedUri: item.uri,
                ...(!hasCover && index === 0 && item.kind === 'image' ? { isCover: true } : {}),
                privacy: { classification: 'normal' as const, disclosurePolicy: 'normal' as const },
              })),
            ],
            newlyCopiedAttachmentUris: [...(current.newlyCopiedAttachmentUris ?? []), ...copied],
          };
        });
        if (!owned) {
          await Promise.all(copied.map(uri => attachmentStore.delete(uri).catch(() => undefined)));
          return;
        }
        setNewAttachmentUris(current => [...current, ...copied]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
    }
  };

  const addPdfs = async () => {
    if (!property || !draft) return;
    try {
      const next = await pickAndStorePdfs(property.core.id, localAttachments, DocumentPicker, { fileStore: attachmentStore });
      if (next.length) {
        const copied = next.map(item => item.uri);
        const owned = await updateChoices(current => {
          const existing = current.attachments ?? property.attachments ?? [];
          return {
            attachments: [
              ...existing,
              ...next.map((item, index) => ({
                id: item.id,
                kind: item.kind,
                originalName: item.originalName,
                mimeType: item.mimeType,
                order: existing.length + index,
                managedUri: item.uri,
                privacy: { classification: 'normal' as const, disclosurePolicy: 'normal' as const },
              })),
            ],
            newlyCopiedAttachmentUris: [...(current.newlyCopiedAttachmentUris ?? []), ...copied],
          };
        });
        if (!owned) {
          await Promise.all(copied.map(uri => attachmentStore.delete(uri).catch(() => undefined)));
          return;
        }
        setNewAttachmentUris(current => [...current, ...copied]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('enrich.attachment_failed'));
    }
  };

  const openMapsLink = async () => {
    const link = draft?.choices.mapsLink?.trim();
    if (!link) return;
    try {
      await openPastedLocationLink(pastedMapLocation(normalizeGoogleMapsLink(link)));
    } catch {
      setError(t('enrich.maps_link_invalid'));
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

  const selectTransaction = (transaction: Transaction) => {
    if (!draft || transaction === draft.choices.transaction) return;
    setError('');
    updateChoices({
      transaction,
      priceAmount: undefined,
      ...(transaction === 'rent' && draft.baseline.activeOffer.transaction === 'sale'
        ? { rentalPeriodId: MARKET_CONFIG.defaultRentalPeriodId }
        : {}),
    });
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

  const leaveEditor = () => {
    if (!draft) {
      setMode('detail');
      router.replace(`/property/${encodeURIComponent(id!)}` as never);
      return;
    }
    setLeaveVisible(true);
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
      if (legacyEnrichmentDraft) await clearConfirmedPropertyEnrichmentDraft(legacyEnrichmentDraft);
      setNewAttachmentUris([]);
      setProperty(candidate);
      setDraft(null);
      draftRef.current = null;
      setMode('detail');
      router.replace(`/property/${encodeURIComponent(id!)}` as never);
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
  const shownTransaction = mode === 'edit' && choices ? choices.transaction : property.activeOffer.transaction;
  const shownPrice = mode === 'edit' && choices
    ? choices.priceAmount
    : property.activeOffer.transaction === 'sale'
      ? property.activeOffer.salePrice.amount
      : property.activeOffer.rentalPrice.amount;
  const shownRentalPeriodId = mode === 'edit' && choices
    ? choices.rentalPeriodId
    : property.activeOffer.transaction === 'rent'
      ? property.activeOffer.rentalPeriodId
      : undefined;
  const demoCategory = getDemoCategory(property.demoCapture?.categoryId);
  const propertyFacts = projectPropertyFacts(property);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={[styles.headerMain, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            onPress={mode === 'edit' ? leaveEditor : () => router.back()}
            accessibilityRole="button"
            testID="property-detail-back"
            style={[styles.headerSide, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}
            >
              {t('capture.back')}
            </Text>
          </TouchableOpacity>
          <Text
            numberOfLines={1}
            style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.bold }]}
          >
            {mode === 'edit' ? t('edit.title') : t('detail.title')}
          </Text>
          <View style={styles.headerSide} />
        </View>
        {mode === 'detail' ? (
          <View style={styles.headerActionGroups}>
            <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
               <TouchableOpacity onPress={() => router.push(`/property/${encodeURIComponent(property.core.id)}/edit` as never)} accessibilityRole="button" testID="property-edit-action" style={[styles.headerAction, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: 'center' }}>{t('detail.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push(`/property/${encodeURIComponent(property.core.id)}/share` as never)} accessibilityRole="button" testID="property-share-action" style={[styles.headerAction, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: 'center' }}>{t('detail.share')}</Text>
              </TouchableOpacity>
            </View>
            {canPermanentlyDelete ? (
              <View style={[styles.destructiveActionRow, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                <TouchableOpacity onPress={() => setDeleteVisible(true)} accessibilityRole="button" testID="property-delete-action" style={[styles.headerAction, styles.destructiveAction, { borderColor: colors.destructive }]}>
                  <Text style={{ color: colors.destructive, fontFamily: fonts.semiBold, textAlign: 'center' }}>{t('detail.delete')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text testID="property-edit-error" style={[styles.error, { color: colors.destructive, fontFamily: fonts.medium }]}>{error}</Text> : null}
        {pendingOperation && (recoveryStatus === 'retry_required' || recoveryStatus === 'update_failed') ? (
          <Button
            title={t('edit.retry_update')}
            onPress={() => void retryRecovery(true)}
            loading={saving}
            testID="property-update-retry"
          />
        ) : null}
        {pendingOperation && recoveryStatus === 'cleanup_failed' ? (
          <Button
            title={t('edit.retry_cleanup')}
            onPress={() => void retryRecovery(false)}
            loading={saving}
            testID="property-update-cleanup-retry"
          />
        ) : null}
        {mode === 'detail' ? (
          <>
            <DetailRow label={t('detail.type')} value={t(`propertyType.${property.core.propertyType}` as keyof Translations)} />
            <DetailRow label={t('detail.transaction')} value={t(`transaction.${property.activeOffer.transaction}` as keyof Translations)} />
            <DetailRow
              label={t('detail.price')}
              value={property.activeOffer.transaction === 'rent'
                ? formatRentalPrice(shownPrice!, 'KWD', shownRentalPeriodId, language, t)
                : formatPrice(shownPrice!, 'KWD', language)}
            />
            <DetailRow label={language === 'ar' ? 'المنطقة' : 'Area / Region'} value={areaName(property.core.locationArea.id)} />
            <View style={[styles.sourceSection, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.sourceHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.sourceTitle}>
                  <Text style={{ color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }}>{t('source.title')}</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{t('source.private')}</Text>
                </View>
                <TouchableOpacity onPress={() => void openSource()} testID="property-source-change" accessibilityRole="button">
                  <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t(source ? 'source.change' : 'source.choose')}</Text>
                </TouchableOpacity>
              </View>
              {source && sourcePerson ? (
                <>
                  <TouchableOpacity
                    onPress={() => router.push(`/person/${encodeURIComponent(sourcePerson.id)}` as never)}
                    testID="property-source-person"
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{sourcePerson.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{t(`source.role.${source.role}`)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmRemoveSource} testID="property-source-unlink" accessibilityRole="button" style={[styles.relationshipUnlink, { borderColor: colors.destructive }]}>
                    <Text style={{ color: colors.destructive, fontFamily: fonts.medium, textAlign: 'center' }}>{t('source.unlink')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{t('source.none')}</Text>
              )}
            </View>
             {(property.typeDetails || Object.keys(propertyFacts.templateFacts).length > 0) ? propertyDetailDisplayDefinitions
               .filter(definition =>
                 definition.appliesTo.includes(property.core.propertyType)
                 && definition.field !== 'plotAreaSquareMeters'
                 && definition.field !== 'builtUpAreaSquareMeters')
             .map(definition => {
                  const value = ((property.typeDetails ?? {}) as unknown as Record<string, unknown>)[definition.field]
                    ?? propertyFacts.templateFacts[definition.field];
                return value === undefined ? null : (
                  <DetailRow
                    key={definition.field}
                    label={propertyDetailLabels[definition.field][language === 'ar' ? 1 : 0]}
                    value={formatPropertyDetailValue(definition.field as PropertyDetailField, value, language)}
                  />
                );
              }) : null}
            {property.core.description ? <DetailRow label={t('enrich.description')} value={property.core.description.value} /> : null}
            {property.core.block ? <DetailRow label={language === 'ar' ? 'القطعة' : 'Block'} value={property.core.block} /> : null}
            {demoCategory?.numericFields.filter(field => !isMappedTemplateField(field.id) || projectPropertyFacts(property).templateFacts[field.id] !== undefined).map(field => {
              const value = property.demoCapture?.numericValues?.[field.id];
              return value === undefined ? null : <DetailRow key={`demo-${field.id}`} label={field.label[language === 'ar' ? 1 : 0]} value={String(value)} />;
            })}
             {projectPropertyFacts(property).areaSquareMeters !== undefined ? (
              <DetailRow
                 label={language === 'ar' ? 'المساحة (م²)' : 'Area (m²)'}
                 value={`${projectPropertyFacts(property).areaSquareMeters} ${language === 'ar' ? 'متر مربع' : 'm²'}`}
              />
            ) : null}
            {demoCategory?.choices.filter(choice => !isMappedTemplateField(choice.id) || projectPropertyFacts(property).templateFacts[choice.id] !== undefined).map(choice => {
              const selected = property.demoCapture?.choices?.[choice.id];
              const option = choice.options.find(item => item.id === selected);
              return option ? <DetailRow key={`demo-choice-${choice.id}`} label={choice.label[language === 'ar' ? 1 : 0]} value={option.label[language === 'ar' ? 1 : 0]} /> : null;
            })}
            {property.demoCapture?.selectedFeatures?.filter(id => !isDemoFeatureSuppressed(id, property.core.propertyType, (property.typeDetails ?? {}) as Record<string, unknown>, (property.typeDetails as Record<string, string> | undefined)?.floorUse)).length ? <DetailRow label={language === 'ar' ? 'المزايا' : 'Features'} value={property.demoCapture.selectedFeatures.filter(id => !isDemoFeatureSuppressed(id, property.core.propertyType, (property.typeDetails ?? {}) as Record<string, unknown>, (property.typeDetails as Record<string, string> | undefined)?.floorUse)).map(id => demoCategory?.features.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0] ?? id).join(', ')} /> : null}
            {property.nearbyServices?.length ? (
              <DetailRow
                label={language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'}
                value={property.nearbyServices.map(id => DEMO_NEARBY_SERVICES.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0] ?? id).join(', ')}
              />
            ) : null}
            {property.core.privateNotes ? <DetailRow label={t('enrich.private_notes')} value={property.core.privateNotes.value} /> : null}
            {property.locationEnrichment?.manualLocationText ? <DetailRow label={t('enrich.manual_location')} value={property.locationEnrichment.manualLocationText.value} /> : null}
            {property.locationEnrichment?.mapsLink ? <DetailRow label={t('enrich.maps_link')} value={property.locationEnrichment.mapsLink.value} /> : null}
            {property.locationEnrichment?.coordinates ? (
              <DetailRow
                label={language === 'ar' ? 'الإحداثيات الدقيقة' : 'Exact coordinates'}
                value={`${property.locationEnrichment.coordinates.latitude}, ${property.locationEnrichment.coordinates.longitude}`}
              />
            ) : null}
            {property.attachments?.map(attachment => (
              <TouchableOpacity
                key={attachment.id}
                onPress={() => void openPropertyAttachment(attachment)}
                disabled={openingAttachmentId !== null}
                accessibilityRole="button"
                accessibilityLabel={`${t(`enrich.attachment_kind.${attachment.kind}`)}, ${attachment.originalName}`}
                testID={`property-attachment-open-${attachment.id}`}
              >
                <DetailRow
                  label={`${attachment.isCover ? '★ ' : ''}${t(`enrich.attachment_kind.${attachment.kind}`)}`}
                  value={attachment.originalName}
                />
              </TouchableOpacity>
            ))}
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
                <Choice key={type} selected={choices.propertyType === type} onPress={() => updateChoices({ propertyType: type })} title={t(`propertyType.${type}` as keyof Translations)} testID={`edit-type-${type}`} />
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
              onChangeText={value => updateChoices({ mapsLink: value })}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="property-edit-maps-link"
            />
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
                  <TouchableOpacity onPress={() => updateAttachmentChoices(items => setAttachmentCover(items, attachment.id))} testID={`property-edit-cover-${attachment.id}`}>
                    <Text style={{ color: colors.primary, fontFamily: fonts.medium }}>{t('enrich.cover')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateAttachmentChoices(items => items.filter(item => item.id !== attachment.id).map((item, order) => ({ ...item, order })))} testID={`property-edit-remove-${attachment.id}`}>
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
                  onPress={() => {
                    setSourceRole(role);
                    if (!sourcePeople.some(person =>
                      person.id === sourcePersonId && person.classifications.includes(role)
                    )) setSourcePersonId('');
                  }}
                  title={t(`source.role.${role}`)}
                  testID={`property-source-role-${role}`}
                />
              ))}
            </View>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t('source.person')}</Text>
            {sourcePeople.filter(person => person.classifications.includes(sourceRole)).map(person => (
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
            {!sourcePeople.some(person => person.classifications.includes(sourceRole)) ? (
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