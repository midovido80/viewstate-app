import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  Property,
  PropertyAttachmentMetadata,
  PropertyDetailField,
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  validateProperty,
} from '@workspace/property-domain';
import { Button } from '@/components/Button';
import {
  EnrichmentFieldValues,
  PropertyEnrichmentFields,
} from '@/components/PropertyEnrichmentFields';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';
import {
  LocalAttachment,
  createExpoFileStore,
  openAttachment,
  persistAttachmentsThenDeleteRemoved,
  pickAndStoreMedia,
  pickAndStorePdfs,
  reorderAttachments,
  setAttachmentCover,
} from '@/services/attachments';
import {
  openPastedLocationLink,
  pastedMapLocation,
} from '@/services/location';
import {
  PropertyEnrichmentDraftV1,
  clearConfirmedPropertyEnrichmentDraft,
  loadPropertyEnrichmentDraft,
  savePropertyEnrichmentDraft,
  flushPropertyEnrichmentDraftWrites,
} from '@/services/propertyEnrichmentRecovery';
import { optionalClassifiedLiteral } from '@/services/literalText';

const normalPrivacy = { classification: 'normal', disclosurePolicy: 'normal' } as const;
const privateNotesPrivacy = { classification: 'private_notes', disclosurePolicy: 'never' } as const;
const exactPrivacy = { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' } as const;
const fileStore = createExpoFileStore(FileSystem);

type ScreenColors = ReturnType<typeof useColors>;
type ScreenFonts = ReturnType<typeof useI18n>['fonts'];

function Section({
  title,
  children,
  colors,
  fonts,
  isRTL,
}: {
  title: string;
  children: React.ReactNode;
  colors: ScreenColors;
  fonts: ScreenFonts;
  isRTL: boolean;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, {
        color: colors.foreground,
        fontFamily: fonts.bold,
        textAlign: isRTL ? 'right' : 'left',
      }]}>{title}</Text>
      {children}
    </View>
  );
}

function Input({
  label,
  colors,
  fonts,
  isRTL,
  ...inputProps
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  colors: ScreenColors;
  fonts: ScreenFonts;
  isRTL: boolean;
}) {
  return (
    <View>
      <Text style={[styles.label, {
        color: colors.foreground,
        fontFamily: fonts.semiBold,
        textAlign: isRTL ? 'right' : 'left',
      }]}>{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          inputProps.multiline && styles.multiline,
          {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor: colors.border,
            textAlign: isRTL ? 'right' : 'left',
          },
        ]}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Action({
  title,
  id,
  onPress,
  destructive,
  colors,
  fonts,
}: {
  title: string;
  id: string;
  onPress: () => void;
  destructive?: boolean;
  colors: ScreenColors;
  fonts: ScreenFonts;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" testID={id} onPress={onPress}>
      <Text style={{
        color: destructive ? colors.destructive : colors.primary,
        fontFamily: fonts.semiBold,
      }}>{title}</Text>
    </TouchableOpacity>
  );
}

function AttachmentCard({
  attachment,
  index,
  count,
  isRTL,
  colors,
  fonts,
  labels,
  onOpen,
  onCover,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  attachment: LocalAttachment;
  index: number;
  count: number;
  isRTL: boolean;
  colors: ScreenColors;
  fonts: ScreenFonts;
  labels: { open: string; cover: string; moveUp: string; moveDown: string; remove: string };
  onOpen: () => void;
  onCover: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.attachment, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${labels.open}: ${attachment.originalName}`}
        testID={`enrich-preview-${attachment.id}`}
        onPress={onOpen}
        style={[styles.attachmentPreview, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
      >
        {attachment.kind === 'image' ? (
          <Image source={{ uri: attachment.uri }} style={styles.attachmentThumbnail} resizeMode="cover" />
        ) : (
          <View style={[styles.attachmentTile, { backgroundColor: colors.background }]}>
            <Feather
              name={attachment.kind === 'video' ? 'play-circle' : 'file-text'}
              size={30}
              color={colors.primary}
            />
          </View>
        )}
        <View style={styles.attachmentName}>
          <Text
            numberOfLines={2}
            style={{
              color: colors.foreground,
              fontFamily: fonts.medium,
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {attachment.isCover ? '★ ' : ''}{attachment.originalName}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={[styles.attachmentActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Action title={labels.open} id={`enrich-open-${attachment.id}`} onPress={onOpen} colors={colors} fonts={fonts} />
        {attachment.kind === 'image' ? (
          <Action title={labels.cover} id={`enrich-cover-${attachment.id}`} onPress={onCover} colors={colors} fonts={fonts} />
        ) : null}
        {index > 0 ? (
          <Action title={labels.moveUp} id={`enrich-up-${attachment.id}`} onPress={onMoveUp} colors={colors} fonts={fonts} />
        ) : null}
        {index < count - 1 ? (
          <Action title={labels.moveDown} id={`enrich-down-${attachment.id}`} onPress={onMoveDown} colors={colors} fonts={fonts} />
        ) : null}
        <Action title={labels.remove} id={`enrich-remove-${attachment.id}`} destructive onPress={onRemove} colors={colors} fonts={fonts} />
      </View>
    </View>
  );
}

function attachmentToLocal(item: PropertyAttachmentMetadata): LocalAttachment {
  return {
    id: item.id,
    kind: item.kind,
    originalName: item.originalName,
    mimeType: item.mimeType,
    uri: item.managedUri,
    order: item.order,
    ...(item.isCover ? { isCover: true as const } : {}),
  };
}

function attachmentToDomain(item: LocalAttachment): PropertyAttachmentMetadata {
  return {
    id: item.id,
    kind: item.kind,
    originalName: item.originalName,
    mimeType: item.mimeType,
    order: item.order,
    managedUri: item.uri,
    ...(item.isCover ? { isCover: true } : {}),
    privacy: normalPrivacy,
  };
}

function initialFields(property: Property): EnrichmentFieldValues {
  const details = property.typeDetails as unknown as Record<string, unknown> | undefined;
  if (!details) return {};
  const knownFields = new Set(PROPERTY_DETAIL_FIELD_DEFINITIONS.map(item => item.field));
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key]) => knownFields.has(key as PropertyDetailField))
      .map(([key, value]) => [
        key,
        typeof value === 'object' && value && 'value' in value
          ? String((value as { value: unknown }).value)
          : String(value),
      ]),
  ) as EnrichmentFieldValues;
}

export default function PropertyEnrichmentScreen() {
  const params = useLocalSearchParams<{ propertyCoreId?: string | string[] }>();
  const id = Array.isArray(params.propertyCoreId) ? params.propertyCoreId[0] : params.propertyCoreId;
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL, fonts } = useI18n();
  const [property, setProperty] = useState<Property | null>(null);
  const [fields, setFields] = useState<EnrichmentFieldValues>({});
  const [description, setDescription] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');
  const [paci, setPaci] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [enrichmentDraft, setEnrichmentDraft] = useState<PropertyEnrichmentDraftV1 | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const propertyRef = useRef<Property | null>(null);
  const enrichmentDraftRef = useRef<PropertyEnrichmentDraftV1 | null>(null);
  const attachmentsRef = useRef<LocalAttachment[]>(attachments);
  const durableCandidateSnapshot = useRef<string | null>(null);
  const buildCandidateRef = useRef<((baseline: Property, nextAttachments?: LocalAttachment[], strict?: boolean) => Property) | undefined>(undefined);
  const autosaveRef = useRef<(reportFailure?: boolean) => Promise<void>>(async () => undefined);
  const autosaveFlight = useRef<Promise<void> | null>(null);
  const autosavePending = useRef(false);
  const persistInProgress = useRef(false);
  const persistFlight = useRef<Promise<Property> | null>(null);
  const attachmentMutationFlight = useRef<Promise<void>>(Promise.resolve());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  propertyRef.current = property;
  enrichmentDraftRef.current = enrichmentDraft;
  attachmentsRef.current = attachments;

  useEffect(() => {
    if (!id) return;
    Promise.all([store.getProperty(id), loadPropertyEnrichmentDraft(id)]).then(async ([saved, recovered]) => {
      if (!saved) {
        if (!mounted.current) return;
        setError(t('edit.not_found'));
        return;
      }
      if (recovered && JSON.stringify(recovered.candidate) === JSON.stringify(saved)) {
        // CAS completed before the process stopped; only exact evidence is removed.
        await clearConfirmedPropertyEnrichmentDraft(recovered);
        if (!mounted.current) return;
        propertyRef.current = saved;
        enrichmentDraftRef.current = null;
        durableCandidateSnapshot.current = JSON.stringify(saved);
        setProperty(saved);
        setEnrichmentDraft(null);
      } else if (recovered && JSON.stringify(recovered.baseline) !== JSON.stringify(saved)) {
        if (!mounted.current) return;
        setError(t('enrich.save_failed'));
        return;
      } else {
        if (!mounted.current) return;
        propertyRef.current = saved;
        enrichmentDraftRef.current = recovered;
        durableCandidateSnapshot.current = JSON.stringify(recovered?.candidate ?? saved);
        generation.current = Math.max(generation.current, recovered?.writeGeneration ?? 0);
        setProperty(saved);
        setEnrichmentDraft(recovered);
      }
      const visible = recovered?.candidate ?? saved;
      setFields(initialFields(visible));
      setDescription(visible.core.description?.value ?? '');
      setPrivateNotes(visible.core.privateNotes?.value ?? '');
      setPaci(visible.locationEnrichment?.paciNumber?.value ?? '');
      setManualLocation(visible.locationEnrichment?.manualLocationText?.value ?? '');
      setMapsLink(visible.locationEnrichment?.mapsLink?.value ?? '');
      setAttachments((visible.attachments ?? []).map(attachmentToLocal).sort((a, b) => a.order - b.order));
    }).catch(() => {
      if (mounted.current) setError(t('edit.unreadable'));
    });
  }, [id, t]);

  const buildCandidate = (baseline: Property, nextAttachments = attachments, strict = true): Property => {
    const rawDetails: Record<string, unknown> = {
      ...((baseline.typeDetails ?? {}) as unknown as Record<string, unknown>),
      propertyType: baseline.core.propertyType,
    };
    PROPERTY_DETAIL_FIELD_DEFINITIONS.forEach(definition => {
      delete rawDetails[definition.field];
    });
    const applicableDefinitions = PROPERTY_DETAIL_FIELD_DEFINITIONS.filter(definition =>
      definition.appliesTo.includes(baseline.core.propertyType)
      && (
        baseline.core.propertyType !== 'floor'
        || !definition.floorUses
        || definition.floorUses.includes(fields.floorUse as 'residential' | 'commercial')
      )
    );
    applicableDefinitions.forEach(({ field: key }) => {
      const raw = fields[key];
      if (!raw?.trim() || key === 'clarification') return;
      if (key === 'intendedUse' || key === 'commercialActivity') {
        rawDetails[key] = { value: raw, privacy: normalPrivacy };
      } else if (key === 'floorUse' || key === 'apartmentSubtype' || key === 'furnishing') {
        rawDetails[key] = raw;
      } else if (key === 'hasMaidRoom' || key === 'hasPool' || key === 'hasWaterfront' || key === 'hasColdStorage') {
        rawDetails[key] = raw === 'true';
      } else {
        rawDetails[key] = Number(raw);
      }
    });
    if (baseline.core.propertyType === 'other_built_property') {
      const clarification = fields.clarification;
      if (clarification?.trim()) rawDetails.clarification = { value: clarification, privacy: normalPrivacy };
    }
    const populatedDetailKeys = Object.keys(rawDetails).filter(key => key !== 'propertyType');
    if (
      baseline.core.propertyType === 'other_built_property'
      && populatedDetailKeys.length > 0
      && !rawDetails.clarification
      && strict
    ) {
      throw new Error('OTHER_CLARIFICATION_REQUIRED');
    }
    const projectedTypeDetails = populatedDetailKeys.length > 0
      ? rawDetails as unknown as Property['typeDetails']
      : undefined;
    const locationEnrichment = {
      ...((baseline.locationEnrichment ?? {}) as unknown as Record<string, unknown>),
      ...(optionalClassifiedLiteral(paci, exactPrivacy) ? { paciNumber: optionalClassifiedLiteral(paci, exactPrivacy) } : {}),
      ...(optionalClassifiedLiteral(manualLocation, exactPrivacy) ? { manualLocationText: optionalClassifiedLiteral(manualLocation, exactPrivacy) } : {}),
      ...(optionalClassifiedLiteral(mapsLink, exactPrivacy) ? { mapsLink: optionalClassifiedLiteral(mapsLink, exactPrivacy) } : {}),
    };
    if (!paci.trim()) delete locationEnrichment.paciNumber;
    if (!manualLocation.trim()) delete locationEnrichment.manualLocationText;
    if (!mapsLink.trim()) delete locationEnrichment.mapsLink;
    const candidate = {
      ...baseline,
      core: {
        ...baseline.core,
        description: optionalClassifiedLiteral(description, normalPrivacy),
        privateNotes: optionalClassifiedLiteral(privateNotes, privateNotesPrivacy),
      },
      typeDetails: projectedTypeDetails,
      locationEnrichment: Object.keys(locationEnrichment).length ? locationEnrichment : undefined,
      attachments: nextAttachments.length ? nextAttachments.map(attachmentToDomain) : undefined,
    } satisfies Property;
    const validation = validateProperty(candidate);
    if (strict && !validation.ok) throw new Error(`INVALID_ENRICHMENT:${validation.issues.map(issue => issue.path.join('.')).join(',')}`);
    return candidate;
  };

  buildCandidateRef.current = buildCandidate;
  autosaveRef.current = async (reportFailure = true) => {
    autosavePending.current = true;
    if (persistInProgress.current) {
      const activePersist = persistFlight.current;
      if (activePersist) {
        try {
          await activePersist;
        } catch {
          // A failed explicit save leaves its evidence in place; retry it as autosave.
        }
        return autosaveRef.current(reportFailure);
      }
      return;
    }
    if (!autosaveFlight.current) {
      autosaveFlight.current = (async () => {
        while (autosavePending.current) {
          autosavePending.current = false;
          const baseline = propertyRef.current;
          const build = buildCandidateRef.current;
          if (!baseline || !build) continue;
          const candidate = build(baseline, attachmentsRef.current, false);
          const candidateSnapshot = JSON.stringify(candidate);
          if (candidateSnapshot === durableCandidateSnapshot.current) continue;
          const expected = enrichmentDraftRef.current;
          const evidence: PropertyEnrichmentDraftV1 = {
            version: 1,
            propertyCoreId: baseline.core.id,
            baseline,
            candidate,
            writeGeneration: Math.max(generation.current, expected?.writeGeneration ?? 0) + 1,
          };
          generation.current = evidence.writeGeneration;
          if (!await savePropertyEnrichmentDraft(evidence, expected)) {
            throw new Error('DRAFT_CONFLICT');
          }
          enrichmentDraftRef.current = evidence;
          durableCandidateSnapshot.current = candidateSnapshot;
          if (mounted.current) setEnrichmentDraft(evidence);
        }
      })().finally(() => {
        autosaveFlight.current = null;
      });
    }
    try {
      await autosaveFlight.current;
    } catch (caught) {
      if (reportFailure && mounted.current) setError(t('enrich.save_failed'));
      throw caught;
    }
  };

  useEffect(() => {
    if (!property) return;
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      void autosaveRef.current().catch(() => undefined);
    }, 350);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    };
  }, [property, fields, description, privateNotes, paci, manualLocation, mapsLink, attachments]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
        void autosaveRef.current()
          .then(() => flushPropertyEnrichmentDraftWrites())
          .catch(() => undefined);
      }
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
      void autosaveRef.current(false)
        .then(() => flushPropertyEnrichmentDraftWrites())
        .catch(() => undefined);
    };
  }, []);

  const persist = (nextAttachments = attachments): Promise<Property> => {
    if (!property) return Promise.reject(new Error('PROPERTY_MISSING'));
    if (persistFlight.current) return Promise.reject(new Error('PERSIST_IN_PROGRESS'));
    persistInProgress.current = true;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = null;
    const flight = Promise.resolve().then(async () => {
      try {
      if (autosaveFlight.current) {
        try {
          await autosaveFlight.current;
        } catch {
          // The explicit persist below retries from the latest known evidence.
        }
      }
      autosavePending.current = false;
      const baseline = propertyRef.current ?? property;
      const candidate = buildCandidate(baseline, nextAttachments);
      const evidence: PropertyEnrichmentDraftV1 = {
        version: 1, propertyCoreId: baseline.core.id, baseline, candidate,
        writeGeneration: Math.max(generation.current, enrichmentDraftRef.current?.writeGeneration ?? 0) + 1,
      };
      generation.current = evidence.writeGeneration;
      if (!await savePropertyEnrichmentDraft(evidence, enrichmentDraftRef.current)) throw new Error('DRAFT_CONFLICT');
      enrichmentDraftRef.current = evidence;
      if (mounted.current) setEnrichmentDraft(evidence);
      if (!await store.compareAndUpdate(baseline, candidate)) throw new Error('PROPERTY_CHANGED');
      if (!await clearConfirmedPropertyEnrichmentDraft(evidence)) throw new Error('DRAFT_CLEANUP_FAILED');
      await flushPropertyEnrichmentDraftWrites();
      propertyRef.current = candidate;
      enrichmentDraftRef.current = null;
      durableCandidateSnapshot.current = JSON.stringify(candidate);
      attachmentsRef.current = [...nextAttachments];
      if (mounted.current) {
        setProperty(candidate);
        setEnrichmentDraft(null);
        setAttachments([...nextAttachments]);
      }
      return candidate;
      } finally {
        persistInProgress.current = false;
        if (persistFlight.current === flight) persistFlight.current = null;
        if (autosavePending.current) {
          void autosaveRef.current().catch(() => undefined);
        }
      }
    });
    persistFlight.current = flight;
    return flight;
  };

  const enqueueAttachmentMutation = <T,>(operation: () => Promise<T>): Promise<T> => {
    const mutation = attachmentMutationFlight.current
      .catch(() => undefined)
      .then(operation);
    // Keep subsequent work serialized even when this operation reports its
    // failure to its caller.
    attachmentMutationFlight.current = mutation.then(() => undefined, () => undefined);
    return mutation;
  };

  const persistAttachmentChanges = async (next: LocalAttachment[]) => {
    // An explicit save owns the existing persist mutex. Wait for it rather
    // than dropping a copied file's metadata update.
    if (persistFlight.current) await persistFlight.current;
    await persist(next);
  };

  const applyAttachmentMutation = async (
    transform: (current: readonly LocalAttachment[]) => LocalAttachment[],
    deleteRemoved = false,
  ) => {
    const previous = attachmentsRef.current;
    const next = transform(previous);
    if (next === previous) return;

    // Updating this ref before persistence lets the existing autosave/recovery
    // path retain evidence if the explicit metadata save reports an error.
    attachmentsRef.current = next;
    if (mounted.current) setAttachments(next);
    if (deleteRemoved) {
      await persistAttachmentsThenDeleteRemoved(
        previous,
        next,
        async value => {
          await persistAttachmentChanges([...value]);
        },
        fileStore,
      );
      return;
    }
    await persistAttachmentChanges(next);
  };

  const updateAttachments = (
    transform: (current: readonly LocalAttachment[]) => LocalAttachment[],
    deleteRemoved = false,
  ) => enqueueAttachmentMutation(() => applyAttachmentMutation(transform, deleteRemoved));

  const reportAttachmentFailure = () => {
    if (mounted.current) setError(t('enrich.attachment_failed'));
  };

  const save = async () => {
    if (!property || saving || persistFlight.current) return;
    setSaving(true);
    setError('');
    try {
      await persist();
      if (mounted.current) {
        Alert.alert(t('enrich.saved'));
        router.replace(`/property/${encodeURIComponent(property.core.id)}` as never);
      }
    } catch (caught) {
      if (mounted.current) {
        setError(caught instanceof Error && caught.message === 'OTHER_CLARIFICATION_REQUIRED'
          ? t('enrich.other_required') : t('enrich.save_failed'));
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const addMedia = async (pdf: boolean) => {
    if (!property) return;
    const mutation = enqueueAttachmentMutation(async () => {
        const currentProperty = propertyRef.current;
        if (!currentProperty) return;
        if (persistFlight.current) await persistFlight.current;
        if (mounted.current) setError('');

        // The picker and file copy are inside the queue as well: a second tap
        // cannot copy against stale metadata while the first addition is pending.
        const sourceAttachments = attachmentsRef.current;
        const added = pdf
          ? await pickAndStorePdfs(currentProperty.core.id, sourceAttachments, DocumentPicker, { fileStore })
          : await pickAndStoreMedia(currentProperty.core.id, sourceAttachments, { fileStore });
        if (!added.length) return;

        // Rebase copied files on the latest committed in-memory order. This is
        // deliberately read while holding the attachment mutation queue.
        await applyAttachmentMutation(currentAttachments => [
          ...currentAttachments,
          ...added.map((attachment, index) => ({
            ...attachment,
            order: currentAttachments.length + index,
          })),
        ]);
      });
    try {
      await mutation;
    } catch {
      if (mounted.current) setError(t('enrich.attachment_failed'));
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    try {
      await updateAttachments(
        current => current.filter(attachment => attachment.id !== attachmentId),
        true,
      );
    } catch {
      if (mounted.current) setError(t('enrich.attachment_failed'));
    }
  };

  const setCover = (attachmentId: string) => void updateAttachments(
    current => setAttachmentCover(current, attachmentId),
  ).catch(reportAttachmentFailure);

  const moveAttachment = (attachmentId: string, offset: -1 | 1) => void updateAttachments(current => {
    const index = current.findIndex(attachment => attachment.id === attachmentId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= current.length) return current as LocalAttachment[];
    const ids = current.map(attachment => attachment.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return reorderAttachments(current, ids);
  }).catch(reportAttachmentFailure);

  if (!property) {
    return <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}><Text style={{ color: colors.foreground }}>{error || t('edit.loading')}</Text></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: colors.border }]}>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} testID="enrich-back">
          <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('capture.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('enrich.title')}</Text>
        <View style={styles.headerSpace} />
      </View>
       <KeyboardAwareScrollViewCompat
         contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
         bottomOffset={24}
         keyboardShouldPersistTaps="handled"
         keyboardDismissMode="interactive"
       >
        {error ? <Text testID="enrich-error" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: fonts.medium }}>{error}</Text> : null}
        <PropertyEnrichmentFields
          propertyType={property.core.propertyType}
          values={fields}
          onChange={(field, value) => setFields(current => ({ ...current, [field]: value }))}
        />
         <Section title={t('enrich.notes')} colors={colors} fonts={fonts} isRTL={isRTL}>
           <Input label={t('enrich.description')} value={description} onChangeText={setDescription} testID="enrich-description" multiline colors={colors} fonts={fonts} isRTL={isRTL} />
           <Input label={t('enrich.private_notes')} value={privateNotes} onChangeText={setPrivateNotes} testID="enrich-private-notes" multiline colors={colors} fonts={fonts} isRTL={isRTL} />
        </Section>
         <Section title={t('enrich.location')} colors={colors} fonts={fonts} isRTL={isRTL}>
           <Input label={t('enrich.paci')} value={paci} onChangeText={setPaci} testID="enrich-paci" colors={colors} fonts={fonts} isRTL={isRTL} />
           <Input label={t('enrich.maps_link')} value={mapsLink} onChangeText={setMapsLink} testID="enrich-maps-link" autoCapitalize="none" colors={colors} fonts={fonts} isRTL={isRTL} />
           {mapsLink.trim() ? (
             <Button title={t('enrich.open_maps')} testID="enrich-open-maps" variant="outline" onPress={() => {
               try {
                 void openPastedLocationLink(pastedMapLocation(mapsLink.trim())).catch(() => setError(t('enrich.location_failed')));
               } catch {
                 setError(t('enrich.location_failed'));
               }
             }} />
           ) : null}
           <Text style={[styles.privacyText, {
             color: colors.mutedForeground,
             fontFamily: fonts.regular,
             textAlign: isRTL ? 'right' : 'left',
           }]}>{t('enrich.location_privacy')}</Text>
        </Section>
        {Platform.OS !== 'web' ? (
           <Section title={t('enrich.media')} colors={colors} fonts={fonts} isRTL={isRTL}>
            <View style={[styles.buttonRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.flex}><Button title={t('enrich.add_media')} testID="enrich-add-media" variant="outline" onPress={() => void addMedia(false)} /></View>
              <View style={styles.flex}><Button title={t('enrich.add_pdf')} testID="enrich-add-pdf" variant="outline" onPress={() => void addMedia(true)} /></View>
            </View>
             <Text style={[styles.privacyText, {
               color: colors.mutedForeground,
               fontFamily: fonts.regular,
               textAlign: isRTL ? 'right' : 'left',
             }]}>{t('enrich.attachment_privacy')}</Text>
             {attachments.map((attachment, index) => (
               <AttachmentCard
                 key={attachment.id}
                 attachment={attachment}
                 index={index}
                 count={attachments.length}
                 isRTL={isRTL}
                 colors={colors}
                 fonts={fonts}
                 labels={{
                   open: t('enrich.open'),
                   cover: t('enrich.cover'),
                   moveUp: t('enrich.move_up'),
                   moveDown: t('enrich.move_down'),
                   remove: t('enrich.remove'),
                 }}
                 onOpen={() => void openAttachment(attachment, Sharing).catch(() => setError(t('enrich.attachment_failed')))}
                 onCover={() => setCover(attachment.id)}
                 onMoveUp={() => moveAttachment(attachment.id, -1)}
                 onMoveDown={() => moveAttachment(attachment.id, 1)}
                 onRemove={() => Alert.alert(
                    t('enrich.remove_title'), t('enrich.remove_message'),
                     [{ text: t('capture.cancel'), style: 'cancel' }, { text: t('enrich.remove'), style: 'destructive', onPress: () => void removeAttachment(attachment.id) }],
                 )}
               />
            ))}
          </Section>
        ) : null}
        <Button title={t('enrich.save')} testID="enrich-save" size="large" loading={saving} onPress={() => void save()} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { minHeight: 60, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  title: { fontSize: 19 },
  headerSpace: { width: 40 },
  content: { padding: 20, gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 19, marginTop: 8 },
  label: { fontSize: 14, marginBottom: 6 },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  buttonRow: { gap: 8 },
  flex: { flex: 1 },
  attachment: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  attachmentPreview: { alignItems: 'center', gap: 12 },
  attachmentThumbnail: { width: 72, height: 72, borderRadius: 8 },
  attachmentTile: { width: 72, height: 72, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  attachmentName: { flex: 1 },
  attachmentActions: { flexWrap: 'wrap', gap: 16 },
  privacyText: { fontSize: 13, lineHeight: 19 },
});