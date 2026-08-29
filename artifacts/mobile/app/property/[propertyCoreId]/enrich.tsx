import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  openGoogleMaps,
  openPastedLocationLink,
  pastedMapLocation,
  requestCurrentCoordinates,
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
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number; accuracy: number | null }>();
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [enrichmentDraft, setEnrichmentDraft] = useState<PropertyEnrichmentDraftV1 | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!id) return;
    Promise.all([store.getProperty(id), loadPropertyEnrichmentDraft(id)]).then(async ([saved, recovered]) => {
      if (!saved) {
        setError(t('edit.not_found'));
        return;
      }
      if (recovered && JSON.stringify(recovered.candidate) === JSON.stringify(saved)) {
        // CAS completed before the process stopped; only exact evidence is removed.
        await clearConfirmedPropertyEnrichmentDraft(recovered);
        setProperty(saved);
        setEnrichmentDraft(null);
      } else if (recovered && JSON.stringify(recovered.baseline) !== JSON.stringify(saved)) {
        setError(t('enrich.save_failed'));
        return;
      } else {
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
      setCoordinates(visible.locationEnrichment?.coordinates
        ? {
          latitude: visible.locationEnrichment.coordinates.latitude,
          longitude: visible.locationEnrichment.coordinates.longitude,
          accuracy: null,
        }
        : undefined);
      setAttachments((visible.attachments ?? []).map(attachmentToLocal).sort((a, b) => a.order - b.order));
    }).catch(() => setError(t('edit.unreadable')));
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
      ...(coordinates ? { coordinates: { latitude: coordinates.latitude, longitude: coordinates.longitude, privacy: exactPrivacy } } : {}),
    };
    if (!paci.trim()) delete locationEnrichment.paciNumber;
    if (!manualLocation.trim()) delete locationEnrichment.manualLocationText;
    if (!mapsLink.trim()) delete locationEnrichment.mapsLink;
    if (!coordinates) delete locationEnrichment.coordinates;
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

  const autosave = async () => {
    if (!property) return;
    const candidate = buildCandidate(property, attachments, false);
    const evidence: PropertyEnrichmentDraftV1 = {
      version: 1, propertyCoreId: property.core.id, baseline: property, candidate,
      writeGeneration: Math.max(generation.current, enrichmentDraft?.writeGeneration ?? 0) + 1,
    };
    generation.current = evidence.writeGeneration;
    if (!await savePropertyEnrichmentDraft(evidence, enrichmentDraft)) {
      setError(t('enrich.save_failed'));
      return;
    }
    setEnrichmentDraft(evidence);
  };

  useEffect(() => {
    if (!property) return;
    const timer = setTimeout(() => { void autosave().catch(() => setError(t('enrich.save_failed'))); }, 350);
    return () => clearTimeout(timer);
  }, [property, fields, description, privateNotes, paci, manualLocation, mapsLink, coordinates, attachments]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void autosave().then(() => flushPropertyEnrichmentDraftWrites()).catch(() => setError(t('enrich.save_failed')));
    });
    return () => {
      subscription.remove();
      void autosave().then(() => flushPropertyEnrichmentDraftWrites()).catch(() => undefined);
    };
  }, [property, fields, description, privateNotes, paci, manualLocation, mapsLink, coordinates, attachments, enrichmentDraft]);

  const persist = async (nextAttachments = attachments) => {
    if (!property) throw new Error('PROPERTY_MISSING');
    const candidate = buildCandidate(property, nextAttachments);
    const evidence: PropertyEnrichmentDraftV1 = {
      version: 1, propertyCoreId: property.core.id, baseline: property, candidate,
      writeGeneration: Math.max(generation.current, enrichmentDraft?.writeGeneration ?? 0) + 1,
    };
    generation.current = evidence.writeGeneration;
    if (!await savePropertyEnrichmentDraft(evidence, enrichmentDraft)) throw new Error('DRAFT_CONFLICT');
    setEnrichmentDraft(evidence);
    if (!await store.compareAndUpdate(property, candidate)) throw new Error('PROPERTY_CHANGED');
    if (!await clearConfirmedPropertyEnrichmentDraft(evidence)) throw new Error('DRAFT_CLEANUP_FAILED');
    await flushPropertyEnrichmentDraftWrites();
    setProperty(candidate);
    setEnrichmentDraft(null);
    setAttachments([...nextAttachments]);
    return candidate;
  };

  const save = async () => {
    if (!property || saving) return;
    setSaving(true);
    setError('');
    try {
      await persist();
      Alert.alert(t('enrich.saved'));
      router.replace(`/property/${encodeURIComponent(property.core.id)}` as never);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'OTHER_CLARIFICATION_REQUIRED'
        ? t('enrich.other_required') : t('enrich.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const addMedia = async (pdf: boolean) => {
    if (!property) return;
    setError('');
    try {
      const added = pdf
        ? await pickAndStorePdfs(property.core.id, attachments, DocumentPicker, { fileStore })
        : await pickAndStoreMedia(property.core.id, attachments, { fileStore });
      if (added.length) {
        // Make copied managed files visible and durably recoverable before CAS.
        const attempted = [...attachments, ...added];
        setAttachments(attempted);
        await persist(attempted);
      }
    } catch {
      setError(t('enrich.attachment_failed'));
    }
  };

  const replaceAttachments = async (next: LocalAttachment[]) => {
    try {
      await persistAttachmentsThenDeleteRemoved(
        attachments,
        next,
        async value => { await persist([...value]); },
        fileStore,
      );
    } catch {
      setError(t('enrich.attachment_failed'));
    }
  };

  const coordinatesLabel = useMemo(() => coordinates
    ? `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`
    : '', [coordinates]);

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
      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} bottomOffset={24}>
        {error ? <Text testID="enrich-error" accessibilityRole="alert" style={{ color: colors.destructive, fontFamily: fonts.medium }}>{error}</Text> : null}
        <PropertyEnrichmentFields
          propertyType={property.core.propertyType}
          values={fields}
          onChange={(field, value) => setFields(current => ({ ...current, [field]: value }))}
        />
        <Section title={t('enrich.notes')}>
          <Input label={t('enrich.description')} value={description} onChangeText={setDescription} testID="enrich-description" multiline />
          <Input label={t('enrich.private_notes')} value={privateNotes} onChangeText={setPrivateNotes} testID="enrich-private-notes" multiline />
        </Section>
        <Section title={t('enrich.location')}>
          <Input label={t('enrich.paci')} value={paci} onChangeText={setPaci} testID="enrich-paci" />
          <Input label={t('enrich.manual_location')} value={manualLocation} onChangeText={setManualLocation} testID="enrich-manual-location" />
          <Input label={t('enrich.maps_link')} value={mapsLink} onChangeText={setMapsLink} testID="enrich-maps-link" autoCapitalize="none" />
          <Button title={t('enrich.current_location')} testID="enrich-current-location" variant="outline" onPress={async () => {
            try { setCoordinates(await requestCurrentCoordinates()); } catch { setError(t('enrich.location_failed')); }
          }} />
          {coordinatesLabel ? <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{coordinatesLabel}</Text> : null}
          {coordinates ? <Button title={t('enrich.open_maps')} testID="enrich-open-maps" variant="outline" onPress={() => void openGoogleMaps(coordinates).catch(() => setError(t('enrich.location_failed')))} /> : null}
          {mapsLink.trim() ? <Button title={t('enrich.open_maps')} testID="enrich-open-original-link" variant="outline" onPress={() => {
            try { void openPastedLocationLink(pastedMapLocation(mapsLink.trim())).catch(() => setError(t('enrich.location_failed'))); } catch { setError(t('enrich.location_failed')); }
          }} /> : null}
        </Section>
        {Platform.OS !== 'web' ? (
          <Section title={t('enrich.media')}>
            <View style={[styles.buttonRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.flex}><Button title={t('enrich.add_media')} testID="enrich-add-media" variant="outline" onPress={() => void addMedia(false)} /></View>
              <View style={styles.flex}><Button title={t('enrich.add_pdf')} testID="enrich-add-pdf" variant="outline" onPress={() => void addMedia(true)} /></View>
            </View>
            {attachments.map((attachment, index) => (
              <View key={attachment.id} style={[styles.attachment, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: fonts.medium }}>{attachment.isCover ? '★ ' : ''}{attachment.originalName}</Text>
                <View style={styles.attachmentActions}>
                  <Action title={t('enrich.open')} id={`enrich-open-${attachment.id}`} onPress={() => void openAttachment(attachment, Sharing).catch(() => setError(t('enrich.attachment_failed')))} />
                  {attachment.kind === 'image' ? <Action title={t('enrich.cover')} id={`enrich-cover-${attachment.id}`} onPress={() => void persist(setAttachmentCover(attachments, attachment.id)).catch(() => setError(t('enrich.attachment_failed')))} /> : null}
                  {index > 0 ? <Action title={t('enrich.move_up')} id={`enrich-up-${attachment.id}`} onPress={() => {
                    const ids = attachments.map(item => item.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                    void persist(reorderAttachments(attachments, ids)).catch(() => setError(t('enrich.attachment_failed')));
                  }} /> : null}
                  {index < attachments.length - 1 ? <Action title={t('enrich.move_down')} id={`enrich-down-${attachment.id}`} onPress={() => {
                    const ids = attachments.map(item => item.id); [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                    void persist(reorderAttachments(attachments, ids)).catch(() => setError(t('enrich.attachment_failed')));
                  }} /> : null}
                  <Action title={t('enrich.remove')} id={`enrich-remove-${attachment.id}`} destructive onPress={() => Alert.alert(
                    t('enrich.remove_title'), t('enrich.remove_message'),
                    [{ text: t('capture.cancel'), style: 'cancel' }, { text: t('enrich.remove'), style: 'destructive', onPress: () => void replaceAttachments(attachments.filter(item => item.id !== attachment.id)) }],
                  )} />
                </View>
              </View>
            ))}
          </Section>
        ) : null}
        <Button title={t('enrich.save')} testID="enrich-save" size="large" loading={saving} onPress={() => void save()} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>{children}</View>;
  }
  function Input(props: React.ComponentProps<typeof TextInput> & { label: string }) {
    const { label, ...inputProps } = props;
    return <View><Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text><TextInput {...inputProps} placeholderTextColor={colors.mutedForeground} style={[styles.input, inputProps.multiline && styles.multiline, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]} accessibilityLabel={label} /></View>;
  }
  function Action({ title, id, onPress, destructive }: { title: string; id: string; onPress: () => void; destructive?: boolean }) {
    return <TouchableOpacity accessibilityRole="button" testID={id} onPress={onPress}><Text style={{ color: destructive ? colors.destructive : colors.primary, fontFamily: fonts.semiBold }}>{title}</Text></TouchableOpacity>;
  }
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
  attachmentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
});