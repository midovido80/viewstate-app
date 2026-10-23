import { OrderedPropertyAmenities } from '@/components/OrderedPropertyAmenities';
import { PropertyFormCard, propertyFormInputStyle } from '@/components/PropertyFormCard';
import { PropertyReview, PropertyReviewFooter } from '@/components/PropertyReview';
import { formatPrice, formatRentalCadence, toEnglishDigits } from '@/constants/market';
import { STUDIO_FEATURES } from '@/services/studioAmenities';
import { NearbyServicesSelector } from '@/components/NearbyServicesSelector';
import { DEMO_NEARBY_SERVICES } from '@/services/propertyDemoCatalog';
import { navigationButtonStyle, navigationButtonTextStyle } from '@/constants/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { Feather } from '@expo/vector-icons';
import type { Property, PropertyAttachmentMetadata, SeekerRequirement, Transaction } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { ChoiceTile as ChoiceChip, ChoiceGrid } from '@/components/ChoiceTile';
import { KuwaitAreaSelector } from '@/components/KuwaitAreaSelector';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { getAreaById } from '@/constants/kuwait-areas';
import { generateDomainId } from '@/services/identity';
import { store } from '@/services/persistence';
import type { Person } from '@/services/people';
import {
  buildStudioProperty,
  buildStudioRequirement,
  createStudioFormValues,
  isStudioProperty,
  isStudioRequirement,
  readStudioProperty,
  readStudioRequirement,
  getStudioBathroomConfirmationCase,
  validateStudioForm,
  type StudioFormError,
  type StudioFormMode,
  type StudioFormValues,
  type StudioSelection,
} from '@/services/studioFormModel';
import {
  getStudioCatalogChoiceLabel,
  getStudioCatalogField,
  getStudioCatalogFieldLabel,
  STUDIO_FORM_FIELD_ORDER,
  type StudioCatalogFieldId,
} from '@/services/studioCatalog';
import { projectRecordIntent } from '@/services/recordIntentPresentation';
import {
  prepareStudioPropertyEditCandidate,
  ensureStudioPropertySourceLink,
  resolveStudioPersonSourceContext,
  saveStudioPropertyFromPersonSource,
  retryStudioPropertyRecovery,
  saveStudioProperty,
  saveStudioRequirement,
  type StudioPersonSourceContext,
  type StudioPropertySaveResult,
} from '@/services/studioSave';
import {
  retryRequirementReadback,
  verifyUncertainRequirementWrite,
} from '@/services/requirementSaveOutcome';
import { localizedRequirementIssue } from '@/services/requirementIssueMessage';
import {
  createExpoFileStore,
  createIndexedDbWebAttachmentBlobStore,
  createWebAttachmentFileStore,
  createWebFileAttachments,
  pickAndStoreMedia,
  pickAndStorePdfs,
  type WebAttachmentBlobStore,
} from '@/services/attachments';
import {
  reorderAttachments,
  resolveWebAttachmentImageSources,
  setAttachmentCover,
  type AttachmentFileStore,
  type LocalAttachment,
} from '@/services/attachmentOperations';
import { openPastedLocationLink, openGoogleMapsQuery, requestCurrentCoordinates } from '@/services/location';
import { LocationAttachmentCard, LocationAttachmentRow, LocationAttachmentButton, AttachmentPrivacyNote, locationLinkInputStyle } from '@/components/LocationAttachmentUI';
import * as Linking from 'expo-linking';
import { createPrivacyMetadata } from '@workspace/property-domain';
import {
  openStudioWebFilePicker,
  openStudioWebMapsLocation,
} from '@/services/studioWebActions';

type InputRef = { current: TextInput | null };
type RouteParams = {
  mode?: string;
  transaction?: string;
  seekerId?: string;
  linkPersonId?: string;
  sourceRole?: string;
  editPropertyId?: string;
  editRequirementId?: string;
};

export function getStudioEditBackTarget(
  mode: StudioFormMode,
  editing: boolean,
  propertyId?: string,
  requirementId?: string,
  seekerId?: string,
):
  | { readonly pathname: '/requirement/[requirementId]'; readonly params: { readonly requirementId: string; readonly seekerId?: string } }
  | { readonly pathname: '/property/[propertyCoreId]'; readonly params: { readonly propertyCoreId: string } }
  | null {
  if (!editing) return null;
  if (mode === 'wanted' && requirementId) {
    return {
      pathname: '/requirement/[requirementId]',
      params: seekerId ? { requirementId, seekerId } : { requirementId },
    };
  }
  if (mode === 'offered' && propertyId) {
    return {
      pathname: '/property/[propertyCoreId]',
      params: { propertyCoreId: propertyId },
    };
  }
  return null;
}

const isTransaction = (value: string | undefined): value is Transaction =>
  value === 'sale' || value === 'rent';
const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;
const localFromPropertyAttachment = (attachment: PropertyAttachmentMetadata): LocalAttachment => ({
  id: attachment.id,
  kind: attachment.kind,
  originalName: attachment.originalName,
  mimeType: attachment.mimeType,
  uri: attachment.managedUri,
  order: attachment.order,
  ...(attachment.isCover ? { isCover: true as const } : {}),
});
const propertyAttachmentMetadata = (attachment: LocalAttachment): PropertyAttachmentMetadata => ({
  id: attachment.id,
  kind: attachment.kind,
  originalName: attachment.originalName,
  mimeType: attachment.mimeType,
  order: attachment.order,
  managedUri: attachment.uri,
  ...(attachment.isCover ? { isCover: true as const } : {}),
  privacy: createPrivacyMetadata('normal', 'normal'),
});

export default function StudioCaptureRoute() {
  const params = useLocalSearchParams<RouteParams>();
  const router = useRouter();
  const colors = useColors();
  const insets = useScreenInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const translateRef = useRef(t);
  translateRef.current = t;
  const modeParam = firstParam(params.mode);
  const transactionParam = firstParam(params.transaction);
  const editPropertyId = firstParam(params.editPropertyId);
  const editRequirementId = firstParam(params.editRequirementId);
  const seekerParam = firstParam(params.seekerId);
  const linkPersonId = firstParam(params.linkPersonId);
  const sourceRole = firstParam(params.sourceRole);
  const editing = !!editPropertyId || !!editRequirementId;
  const [mode, setMode] = useState<StudioFormMode>(
    modeParam === 'wanted' || editRequirementId ? 'wanted' : 'offered',
  );
  const [values, setValues] = useState<StudioFormValues>(() =>
    createStudioFormValues(
      modeParam === 'wanted' || editRequirementId ? 'wanted' : 'offered',
      isTransaction(transactionParam) ? transactionParam : 'rent',
    ),
  );
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [baselineProperty, setBaselineProperty] = useState<Property | null>(null);
  const [baselineRequirement, setBaselineRequirement] = useState<SeekerRequirement | null>(null);
  const [editOwnerPerson, setEditOwnerPerson] = useState<Person | null>(null);
  const [recordLoaded, setRecordLoaded] = useState(!editing);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [selectedPersonId, setSelectedPersonId] = useState(seekerParam ?? '');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, StudioFormError>>(new Map());
  const [personError, setPersonError] = useState('');
  const [propertyRecovery, setPropertyRecovery] = useState<{
    id: string;
    candidate: Property;
    baseline: Property | null;
    message: string;
  } | null>(null);
  const [savedProperty, setSavedProperty] = useState<Property | null>(null);
  const [propertySourceConfirmed, setPropertySourceConfirmed] = useState(false);
  const [savedRequirement, setSavedRequirement] = useState<SeekerRequirement | null>(null);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [webImageSources, setWebImageSources] = useState<Readonly<Record<string, string>>>({});
  const [peopleError, setPeopleError] = useState(false);
  const flight = useRef(false);
  const sourceContext = useRef<StudioPersonSourceContext | null>(null);
  const committedRequirement = useRef<SeekerRequirement | null>(null);
  const uncertainRequirement = useRef<SeekerRequirement | null>(null);
  const inputRefs = useRef<Record<string, InputRef>>({});
  const scrollRef = useRef<ScrollView | null>(null);
  const focusTargets = useRef<Record<string, View | null>>({});
  const draftPropertyId = useRef(generateDomainId());
  const draftOfferId = useRef(generateDomainId());
  const draftRequirementId = useRef(generateDomainId());
  const stagedFiles = useRef(new Map<string, LocalAttachment>());
  const preserveStagedFiles = useRef(false);
  const uncertainStagedOwnership = useRef(false);
  const webAttachmentBlobs = useRef<WebAttachmentBlobStore | null>(null);
  if (Platform.OS === 'web' && !webAttachmentBlobs.current) {
    webAttachmentBlobs.current = createIndexedDbWebAttachmentBlobStore();
  }
  const attachmentFileStore: AttachmentFileStore = Platform.OS === 'web'
    ? createWebAttachmentFileStore(webAttachmentBlobs.current!)
    : createExpoFileStore(FileSystem);
  const routeTransaction = isTransaction(transactionParam) ? transactionParam : undefined;
  const isValidRoute = editing
    || ((modeParam === 'offered' || modeParam === 'wanted') && routeTransaction !== undefined);
  const topInset = insets.top;
  const bottomInset = insets.bottom;
  const returnToForm = useCallback(() => {
    setError('');
    setStep('form');
  }, []);

  useEffect(() => {
    let active = true;
    let revoke: () => void = () => {};
    if (Platform.OS === 'web') {
      void resolveWebAttachmentImageSources(attachments, webAttachmentBlobs.current!).then(result => {
        if (!active) {
          result.revoke();
          return;
        }
        revoke = result.revoke;
        setWebImageSources(result.sources);
      }).catch(() => {
        if (active) setAttachmentError(language === 'ar'
          ? 'تعذر معاينة أحد المرفقات.'
          : 'An attachment preview could not be loaded.');
      });
    } else {
      setWebImageSources({});
    }
    return () => {
      active = false;
      revoke();
    };
  }, [attachments, language]);

  useEffect(() => () => {
    if (preserveStagedFiles.current || uncertainStagedOwnership.current) return;
    void Promise.all([...stagedFiles.current.values()].map(item =>
      attachmentFileStore.delete(item.uri).catch(() => undefined)));
  }, []);

  const update = useCallback(<K extends keyof StudioFormValues>(key: K, value: StudioFormValues[K]) => {
    setValues(current => ({ ...current, [key]: value }));
    setFieldErrors(current => {
      const next = new Map(current);
      next.delete(key);
      if (key === 'budgetMinimum' || key === 'budgetMaximum') next.delete('budget');
      if (key === 'preferredAreaIds' || key === 'preferredAreaMode') next.delete('preferredAreaIds');
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPeopleError(false);
    setPeopleLoading(true);
    void (async () => {
      try {
        const result = await store.getPeople();
        let options = result.filter(person => person.classifications.includes('seeker'));
        if (seekerParam && !options.some(person => person.id === seekerParam)) {
          const directPerson = await store.getPerson(seekerParam);
          if (directPerson?.classifications.includes('seeker')) options = [directPerson, ...options];
        }
        if (!cancelled) setPeople(options);
      } catch {
        if (cancelled) return;
        setPeopleError(true);
        if (seekerParam) {
          try {
            const directPerson = await store.getPerson(seekerParam);
            if (!cancelled && directPerson?.classifications.includes('seeker')) setPeople([directPerson]);
          } catch {
            // Keep the explicit people-load failure visible.
          }
        }
      } finally {
        if (!cancelled) setPeopleLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seekerParam]);

  useEffect(() => {
    let cancelled = false;
    setLoading(editing);
    setRecordLoaded(!editing);
    setError('');
    setFieldErrors(new Map());
    setBaselineProperty(null);
    setBaselineRequirement(null);
    setEditOwnerPerson(null);
    setStep('form');
    if (!editing) {
      if ((modeParam !== 'offered' && modeParam !== 'wanted') || !routeTransaction) {
        setError(translateRef.current('studio.load_failed'));
        return;
      }
      const nextMode = modeParam;
      setMode(nextMode);
      setValues(createStudioFormValues(nextMode, routeTransaction));
      setAttachments([]);
      stagedFiles.current.clear();
      setSelectedPersonId(seekerParam ?? '');
      draftPropertyId.current = generateDomainId();
      draftOfferId.current = generateDomainId();
      draftRequirementId.current = generateDomainId();
      setLoading(false);
      return;
    }
    if (editPropertyId && editRequirementId) {
      setError(translateRef.current('studio.load_failed'));
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        if (editPropertyId) {
          const property = await store.getProperty(editPropertyId);
          if (!property || !isStudioProperty(property)) throw new Error('STUDIO_NOT_FOUND');
          if (!cancelled) {
            setMode('offered');
            setBaselineProperty(property);
            setAttachments((property.attachments ?? []).map(localFromPropertyAttachment));
            const studioValues = readStudioProperty(property);
            setValues({
              ...studioValues,
              areaSquareMeters: property.areaSquareMeters === undefined
                ? studioValues.areaSquareMeters
                : String(property.areaSquareMeters),
            });
          }
        } else if (editRequirementId) {
          const requirement = await store.getRequirement(editRequirementId);
          if (!requirement || !isStudioRequirement(requirement)) throw new Error('STUDIO_NOT_FOUND');
          const person = requirement.seekerId
            ? await store.getPerson(requirement.seekerId)
            : null;
          if (requirement.seekerId && !person) throw new Error('STUDIO_PERSON_NOT_FOUND');
          if (!cancelled) {
            setMode('wanted');
            setBaselineRequirement(requirement);
            setAttachments([]);
            setEditOwnerPerson(person);
            setSelectedPersonId(requirement.seekerId ?? '');
            setValues(readStudioRequirement(requirement));
          }
        }
        if (!cancelled) setRecordLoaded(true);
      } catch (error) {
        if (!cancelled) {
          setError(translateRef.current(
            error instanceof Error && error.message === 'STUDIO_PERSON_NOT_FOUND'
              ? 'studio.person_missing'
              : 'studio.load_failed',
          ));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [editPropertyId, editRequirementId, editing, modeParam, routeTransaction, seekerParam]);

  const selectedPerson = useMemo(
    () => people.find(person => person.id === selectedPersonId)
      ?? (editOwnerPerson?.id === selectedPersonId ? editOwnerPerson : null),
    [editOwnerPerson, people, selectedPersonId],
  );
  const wantedIdentityReady = mode !== 'wanted'
    || selectedPersonId === ''
    || (!!selectedPerson
      && selectedPerson.id === selectedPersonId
      && selectedPerson.classifications.includes('seeker')
      && (!seekerParam || selectedPerson.id === seekerParam));
  const showingReview = step === 'review' && wantedIdentityReady;
  const propertyReview = showingReview && mode === 'offered' && !editing;
  const getEditBackTarget = () => getStudioEditBackTarget(
    mode,
    editing,
    baselineProperty?.core.id ?? editPropertyId,
    baselineRequirement?.id ?? editRequirementId,
    baselineRequirement?.seekerId ?? selectedPersonId,
  );
  const leaveStudio = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const target = getEditBackTarget();
    if (target) router.replace(target as never);
  };
  const handleHeaderBack = () => {
    if (showingReview) returnToForm();
    else leaveStudio();
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'review') {
        returnToForm();
        return true;
      }
      leaveStudio();
      return true;
    });
    return () => subscription.remove();
  }, [baselineProperty, baselineRequirement, editPropertyId, editRequirementId, mode, returnToForm, router, selectedPersonId, step]);

  const areaTitle = (id: string) => {
    const area = getAreaById(id);
    return area ? (language === 'ar' ? area.ar : area.en) : id;
  };
  const setFieldRef = (field: string) => (ref: TextInput | null) => {
    inputRefs.current[field] = { current: ref };
  };
  const setFocusTarget = (field: string) => (ref: View | null) => {
    focusTargets.current[field] = ref;
  };
  const focusField = (field: string) => {
    const input = inputRefs.current[field]?.current;
    const target = (input ?? focusTargets.current[field]) as unknown as {
      focus?: () => void;
      measureLayout?: (
        relativeTo: unknown,
        onSuccess: (x: number, y: number) => void,
        onFail?: () => void,
      ) => void;
    } | null;
    try {
      target?.focus?.();
    } catch {
      // A non-focusable layout wrapper can still be scrolled into view below.
    }
    if (target?.measureLayout && scrollRef.current) {
      try {
        target.measureLayout(
          scrollRef.current as never,
          (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true }),
          () => undefined,
        );
      } catch {
        // Keep the field-specific error visible even if a host cannot measure.
      }
    }
  };
  const labelStyle = {
    color: colors.foreground,
    fontFamily: fonts.medium,
    textAlign: isRTL ? 'right' as const : 'left' as const,
  };
  const getError = (field: string) => fieldErrors.get(field);
  const localizedFieldError = (field: string) => {
    const issue = getError(field);
    return issue ? t(`studio.error.${issue.code}`) : undefined;
  };
  const choosePerson = (personId: string) => {
    if (!people.some(person => person.id === personId && person.classifications.includes('seeker'))) {
      setPersonError(t('studio.person_missing'));
      setError(t('studio.person_missing'));
      return;
    }
    setSelectedPersonId(personId);
    setPersonError('');
    setError('');
  };

  const appendStagedAttachments = (picked: readonly LocalAttachment[]) => {
    if (!picked.length) return;
    picked.forEach(item => stagedFiles.current.set(item.id, item));
    setAttachments(current => {
      let next = [...current, ...picked];
      if (!next.some(item => item.isCover)) {
        const firstImage = next.find(item => item.kind === 'image');
        if (firstImage) next = setAttachmentCover(next, firstImage.id);
      }
      return next;
    });
    setAttachmentError('');
  };

  const attachmentFailureMessage = () => language === 'ar'
    ? 'تعذر إضافة الملف. تحقق من نوع الملف أو أذونات مكتبة الصور وحاول مرة أخرى.'
    : 'The file could not be added. Check its type or media-library permission and try again.';

  const addStudioMedia = async (mediaTypes: ('images' | 'videos')[]) => {
    if (mode !== 'offered' || attachmentBusy) return;
    setAttachmentBusy(true);
    try {
      const id = baselineProperty?.core.id ?? draftPropertyId.current;
      const picked = await pickAndStoreMedia(id, attachments, { fileStore: attachmentFileStore }, undefined, mediaTypes);
      appendStagedAttachments(picked);
    } catch {
      setAttachmentError(attachmentFailureMessage());
    } finally {
      setAttachmentBusy(false);
    }
  };

  const addStudioPdf = async () => {
    if (mode !== 'offered' || attachmentBusy) return;
    setAttachmentBusy(true);
    try {
      const id = baselineProperty?.core.id ?? draftPropertyId.current;
      const picked = await pickAndStorePdfs(id, attachments, DocumentPicker, { fileStore: attachmentFileStore });
      appendStagedAttachments(picked);
    } catch {
      setAttachmentError(attachmentFailureMessage());
    } finally {
      setAttachmentBusy(false);
    }
  };

  const addStudioWebFiles = (kind: 'images' | 'videos' | 'pdf') => {
    if (mode !== 'offered' || Platform.OS !== 'web' || attachmentBusy) return;
    try {
      openStudioWebFilePicker({
        accept: kind === 'images' ? 'image/*' : kind === 'videos' ? 'video/*' : '.pdf,application/pdf',
        onFiles: files => {
          if (!files.length) return;
          setAttachmentBusy(true);
          const ownerId = baselineProperty?.core.id ?? draftPropertyId.current;
          void createWebFileAttachments(ownerId, attachments, files, undefined, webAttachmentBlobs.current!)
            .then(appendStagedAttachments)
            .catch(() => setAttachmentError(attachmentFailureMessage()))
            .finally(() => setAttachmentBusy(false));
        },
      });
    } catch {
      setAttachmentError(attachmentFailureMessage());
    }
  };

  const removeStudioAttachment = (item: LocalAttachment) => {
    setAttachments(current => {
      const remaining = current.filter(candidate => candidate.id !== item.id);
      if (!remaining.some(candidate => candidate.isCover)) {
        const firstImage = remaining.find(candidate => candidate.kind === 'image');
        if (firstImage) return setAttachmentCover(remaining, firstImage.id);
      }
      return remaining.map((candidate, order) => ({ ...candidate, order }));
    });
    const staged = stagedFiles.current.get(item.id);
    if (staged) {
      stagedFiles.current.delete(item.id);
      void attachmentFileStore.delete(staged.uri).catch(() => undefined);
    }
  };

  const moveStudioAttachment = (item: LocalAttachment, offset: -1 | 1) => {
    setAttachments(current => {
      const ordered = [...current].sort((left, right) => left.order - right.order);
      const index = ordered.findIndex(candidate => candidate.id === item.id);
      const target = index + offset;
      if (target < 0 || target >= ordered.length) return current;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return reorderAttachments(current, ordered.map(candidate => candidate.id));
    });
  };

  const renderPersonSelector = () => (
    <View ref={setFocusTarget('person')} style={styles.field} testID="studio-person-field">
      <Text style={[styles.label, labelStyle]}>{t('studio.person')}</Text>
      {seekerParam ? (
        selectedPerson?.id === seekerParam && selectedPerson.classifications.includes('seeker') ? (
          <View style={[styles.staticValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{selectedPerson.name}</Text>
          </View>
        ) : peopleLoading ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{t('studio.choose_person')}</Text>
        ) : (
          <FieldError message={t('studio.person_missing')} />
        )
      ) : peopleLoading ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{t('studio.choose_person')}</Text>
      ) : peopleError && (!selectedPerson || !selectedPerson.classifications.includes('seeker')) ? (
        <FieldError message={t('people.load_failed')} />
      ) : people.length === 0 ? (
        <>
          <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{t('people.empty')}</Text>
          <Button
            title={t('people.add')}
            onPress={() => router.push('/person/new' as never)}
            testID="studio-add-person"
          />
          <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>
            {language === 'ar'
              ? 'بعد حفظ الشخص، افتح تفاصيله واختر «إضافة طلب استوديو» للمتابعة.'
              : 'After saving, open Person Details and choose “Add Wanted Studio” to continue.'}
          </Text>
        </>
      ) : (
        <>
          {peopleError ? <FieldError message={t('people.load_failed')} /> : null}
          <View style={styles.personList}>
            {people.map(person => (
              <TouchableOpacity
                key={person.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedPersonId === person.id }}
                testID={`studio-seeker-${person.id}`}
                onPress={() => choosePerson(person.id)}
                style={[
                  styles.personChoice,
                  {
                    borderColor: selectedPersonId === person.id ? colors.primary : colors.border,
                    backgroundColor: colors.card,
                  },
                ]}
              >
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium, flex: 1 }}>{person.name}</Text>
                {selectedPersonId === person.id ? <Feather name="check-circle" size={20} color={colors.primary} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      {personError ? <FieldError message={personError} /> : null}
    </View>
  );

  const validate = () => {
    const result = validateStudioForm(values);
    const next = new Map<string, StudioFormError>();
    result.errors.forEach(item => {
      if (!next.has(String(item.field))) next.set(String(item.field), item);
    });
    if (mode === 'wanted' && selectedPersonId
      && (!selectedPerson || !selectedPerson.classifications.includes('seeker'))) {
      setError(t('studio.person_missing'));
      setPersonError(t('studio.person_missing'));
    } else if (mode === 'wanted' && seekerParam
      && (selectedPerson?.id !== seekerParam || !selectedPerson.classifications.includes('seeker'))) {
      setError(t('studio.person_missing'));
      setPersonError(t('studio.person_missing'));
    } else if (!result.ok) {
      const firstIssue = result.errors[0];
      setError(firstIssue
        ? firstIssue.field === 'bathrooms' && getStudioBathroomConfirmationCase(values)
          ? (language === 'ar'
            ? 'يجب تأكيد استبدال قيمة الحمام القديمة قبل المتابعة.'
            : 'Confirm replacing the saved bathroom value before continuing.')
          : t(`studio.error.${firstIssue.code}`)
        : t('studio.validation'));
      setPersonError('');
    } else {
      setError('');
      setPersonError('');
    }
    setFieldErrors(next);
    if (mode === 'wanted' && selectedPersonId && (!selectedPerson
      || !selectedPerson.classifications.includes('seeker')
      || (seekerParam && selectedPerson.id !== seekerParam))) {
      focusField('person');
    } else if (!result.ok && result.errors.length) {
      const first = next.keys().next().value as string;
      const target = first === 'budget' ? 'budgetMinimum'
        : first === 'preferredAreaMode' ? 'preferredAreaIds'
          : first === 'rentalPeriodId' ? 'cadence'
            : first;
      focusField(target);
    }
    return result.ok && wantedIdentityReady;
  };

  const linkPropertySourceIfNeeded = async (property: Property) => {
    if (linkPersonId && !editing) {
      const context = sourceContext.current?.personId === linkPersonId
        ? sourceContext.current
        : await resolveStudioPersonSourceContext(linkPersonId, sourceRole, store);
      sourceContext.current = context;
      await ensureStudioPropertySourceLink(property.core.id, context.personId, context.role, store);
    }
    setPropertySourceConfirmed(true);
  };

  const navigateAfterPropertySave = async (property: Property) => {
    await linkPropertySourceIfNeeded(property);
    router.replace({ pathname: '/property/[propertyCoreId]', params: { propertyCoreId: property.core.id } } as never);
  };

  const finishPropertySave = async (property: Property) => {
    preserveStagedFiles.current = true;
    uncertainStagedOwnership.current = false;
    const retained = new Set((property.attachments ?? []).map(item => `${item.id}\u0000${item.managedUri}`));
    const removed = (baselineProperty?.attachments ?? [])
      .filter(item => !retained.has(`${item.id}\u0000${item.managedUri}`));
    await Promise.all(removed.map(item => attachmentFileStore.delete(item.managedUri).catch(() => undefined)));
    setSavedProperty(property);
    await linkPropertySourceIfNeeded(property);
  };

  const doSave = async () => {
    if (flight.current || !recordLoaded || propertyRecovery) return;
    if (committedRequirement.current || uncertainRequirement.current) return;
    if (!validate()) {
      setStep('form');
      return;
    }
    flight.current = true;
    setSaving(true);
    setError('');
    try {
      if (mode === 'offered') {
        const built = buildStudioProperty(
          values,
          baselineProperty?.core.id ?? draftPropertyId.current,
          baselineProperty?.activeOffer.id ?? draftOfferId.current,
        );
        const candidateWithoutAttachments = baselineProperty
          ? prepareStudioPropertyEditCandidate(baselineProperty, built)
          : built;
        const candidate: Property = {
          ...candidateWithoutAttachments,
          ...(attachments.length
            ? { attachments: attachments.map(propertyAttachmentMetadata) }
            : { attachments: undefined }),
        };
        let outcome: StudioPropertySaveResult;
        if (linkPersonId && !editing) {
          const sourceSave = await saveStudioPropertyFromPersonSource({
            candidate,
            baseline: baselineProperty,
            store,
            personId: linkPersonId,
            requestedRole: sourceRole,
          });
          sourceContext.current = sourceSave.sourceContext;
          outcome = sourceSave.outcome;
        } else {
          outcome = await saveStudioProperty({
            candidate,
            baseline: baselineProperty,
            store,
          });
        }
        if (outcome.status === 'saved') {
          try {
            await finishPropertySave(outcome.property);
            setError('');
          } catch {
            setError(t('studio.link_failed'));
          }
        } else if (outcome.status === 'recovery_required') {
          uncertainStagedOwnership.current = true;
          setPropertyRecovery({
            id: outcome.propertyId,
            candidate,
            baseline: baselineProperty,
            message: t('studio.save_uncertain'),
          });
        } else if (outcome.status === 'saved_readback_failed') {
          uncertainStagedOwnership.current = true;
          setPropertyRecovery({
            id: outcome.propertyId,
            candidate,
            baseline: baselineProperty,
            message: t('studio.saved_readback_failed'),
          });
        } else if (outcome.status === 'conflict') {
          setError(t('studio.save_conflict'));
        } else {
          if (!outcome.retryAllowed) {
            uncertainStagedOwnership.current = true;
            setPropertyRecovery({
              id: candidate.core.id,
              candidate,
              baseline: baselineProperty,
              message: t('studio.save_uncertain'),
            });
          }
          setError(outcome.retryAllowed ? t('studio.save_failed') : t('studio.save_uncertain'));
        }
      } else {
        const ownerId = baselineRequirement?.seekerId ?? (selectedPersonId || undefined);
        const candidate = buildStudioRequirement(
          values,
          baselineRequirement?.id ?? draftRequirementId.current,
          ownerId,
        );
        const result = await saveStudioRequirement({
          candidate,
          baseline: baselineRequirement,
          store,
          navigate: () => router.replace({
            pathname: '/requirement/view/[requirementId]',
            params: {
              requirementId: candidate.id,
              ...(!editing && !ownerId ? { postSave: '1' } : {}),
            },
          } as never),
        });
        if (result.status === 'saved') {
          committedRequirement.current = null;
          uncertainRequirement.current = null;
          setSavedRequirement(result.requirement);
          setError('');
        } else if (result.status === 'missing_person') {
          setError(localizedRequirementIssue({ code: 'save_missing_person' }, language));
        } else if (result.status === 'non_seeker') {
          setError(localizedRequirementIssue({ code: 'save_non_seeker' }, language));
        } else if (result.status === 'invalid_requirement') {
          setError(localizedRequirementIssue(result.issue, language));
        } else if (result.status === 'saved_readback_failed' || result.status === 'saved_navigation_failed') {
          committedRequirement.current = candidate;
          setError(localizedRequirementIssue({
            code: result.status === 'saved_navigation_failed' ? 'save_navigation_failed' : 'save_readback_failed',
          }, language));
        } else if (result.status === 'edit_conflict'
          || (result.status === 'storage_failure' && result.conflict)) {
          if (result.status !== 'edit_conflict') uncertainRequirement.current = candidate;
          setError(localizedRequirementIssue({
            code: result.status === 'edit_conflict' ? 'save_edit_conflict' : 'save_conflict',
          }, language));
        } else {
          if (result.status === 'storage_failure' && result.retryAllowed === false) {
            uncertainRequirement.current = candidate;
          }
          setError(localizedRequirementIssue({
            code: result.status === 'storage_failure' && result.retryAllowed === false
              ? 'save_storage_uncertain'
              : 'save_storage_failure',
          }, language));
        }
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : '';
      setError(message.startsWith('INVALID_STUDIO_REQUIREMENT:')
        ? localizedRequirementIssue({ code: 'invalid_requirement' }, language)
        : message.startsWith('STUDIO_SOURCE_')
          ? t('studio.link_failed')
          : t('studio.save_failed'));
    } finally {
      flight.current = false;
      setSaving(false);
    }
  };

  const retryPropertySave = async () => {
    if (!propertyRecovery || flight.current) return;
    flight.current = true;
    setSaving(true);
    try {
      const result = await retryStudioPropertyRecovery({
        propertyId: propertyRecovery.id,
        candidate: propertyRecovery.candidate,
        baseline: propertyRecovery.baseline,
        store,
      });
      if (result.status === 'saved') {
        setSavedProperty(result.property);
        preserveStagedFiles.current = true;
        await finishPropertySave(result.property).catch(() => setError(t('studio.link_failed')));
      } else if (result.status === 'conflict') {
        setError(t('studio.save_conflict'));
      } else {
        setError(t('studio.save_uncertain'));
      }
    } finally {
      flight.current = false;
      setSaving(false);
    }
  };

  const retryRequirementConfirmation = async () => {
    const candidate = committedRequirement.current ?? uncertainRequirement.current;
    if (!candidate || flight.current) return;
    flight.current = true;
    setSaving(true);
    try {
      const navigate = () => router.replace({
        pathname: '/requirement/view/[requirementId]',
        params: {
          requirementId: candidate.id,
          ...(!editing && !candidate.seekerId ? { postSave: '1' } : {}),
        },
      } as never);
      const wasUncertain = !!uncertainRequirement.current;
      const outcome = wasUncertain
        ? await verifyUncertainRequirementWrite({ candidate, store, navigate })
        : await retryRequirementReadback({ candidate, store, navigate });
      if (outcome.status === 'saved') {
        const readback = await store.getRequirement(candidate.id);
        if (!readback) {
          committedRequirement.current = candidate;
          setError(localizedRequirementIssue({ code: 'save_readback_failed' }, language));
          return;
        }
        committedRequirement.current = null;
        uncertainRequirement.current = null;
        uncertainStagedOwnership.current = false;
        preserveStagedFiles.current = true;
        setSavedRequirement(readback);
        setError('');
      } else if (outcome.status === 'storage_failure' && outcome.retryAllowed) {
        committedRequirement.current = null;
        uncertainRequirement.current = null;
        uncertainStagedOwnership.current = false;
        setError(t('studio.save_failed'));
      } else if (outcome.status === 'storage_failure' && outcome.conflict) {
        uncertainRequirement.current = candidate;
        setError(t('studio.save_conflict'));
      } else if (outcome.status === 'saved_navigation_failed') {
        committedRequirement.current = candidate;
        setError(localizedRequirementIssue({ code: 'save_navigation_failed' }, language));
      } else {
        committedRequirement.current = candidate;
        setError(localizedRequirementIssue({ code: 'save_readback_failed' }, language));
      }
    } finally {
      flight.current = false;
      setSaving(false);
    }
  };

  const textInput = (
    key: keyof StudioFormValues,
    label: string,
    options: { keyboardType?: 'numeric' | 'decimal-pad'; multiline?: boolean; placeholder?: string } = {},
  ) => (
    <View style={styles.field} key={key}>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
      <TextInput
        ref={setFieldRef(key)}
        value={String(values[key] ?? '')}
        onChangeText={text => update(key, text as StudioFormValues[typeof key])}
        keyboardType={options.keyboardType}
        multiline={options.multiline}
        placeholder={options.placeholder}
        placeholderTextColor={colors.mutedForeground}
        testID={`studio-${key}`}
        accessibilityLabel={label}
        style={[
          styles.input,
          key === 'mapsLink' ? locationLinkInputStyle : undefined,
          {
            color: colors.foreground,
            borderColor: getError(key) ? colors.destructive : colors.border,
            backgroundColor: colors.card,
            textAlign: isRTL ? 'right' : 'left',
            fontFamily: fonts.regular,
            minHeight: options.multiline ? 100 : key === 'mapsLink' ? 52 : 48,
          },
        ]}
      />
      {getError(key) ? <FieldError message={localizedFieldError(key)!} /> : null}
    </View>
  );

  const catalogLabel = (id: StudioCatalogFieldId) => {
    const labels = getStudioCatalogFieldLabel(id, mode);
    return labels[language === 'ar' ? 1 : 0];
  };
  const studioReviewIntent = () => projectRecordIntent(
    mode,
    mode === 'wanted' && values.transaction === 'sale' ? 'buy' : values.transaction,
    language,
  );
  const transactionLabel = () => {
    const choice = getStudioCatalogField('transaction').quickPicks?.find(
      candidate => candidate.modeValues[mode] === values.transaction,
    );
    const label = choice ? getStudioCatalogChoiceLabel(choice, mode) : undefined;
    return label?.[language === 'ar' ? 1 : 0] ?? t(`studio.${values.transaction}`);
  };
  const changeWantedTransaction = () => {
    const personId = selectedPersonId || seekerParam;
    // Transaction changes keep ownership optional. The shared chooser resumes
    // the same catalog path without forcing Person creation.
    router.replace({
      pathname: '/capture/transaction',
      params: { mode: 'wanted', ...(personId ? { seekerId: personId } : {}) },
    } as never);
  };

  const binaryPreference = (field: 'kitchen' | 'hall' | 'parking') => {
    const catalogField = getStudioCatalogField(field);
    const choices = catalogField.quickPicks ?? [];
    return (
      <View key={field} style={styles.field} testID={`studio-${field}-field`}>
        <Text style={[styles.label, labelStyle]}>{catalogLabel(field)}</Text>
        <ChoiceGrid style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {choices.map((choice, index) => {
            const semanticValue = choice.modeValues[mode] as StudioSelection | undefined;
            if (!semanticValue) return null;
            const choiceLabel = getStudioCatalogChoiceLabel(choice, mode);
            return (
              <ChoiceChip
                key={`${field}-${semanticValue}`}
                label={choiceLabel[language === 'ar' ? 1 : 0]}
                selected={values[field] === semanticValue}
                onPress={() => update(field, semanticValue)}
                testID={`studio-${field}-${index === 0 ? 'positive' : 'negative'}`}
                role="radio"
              />
            );
          })}
        </ChoiceGrid>
        {getError(field) ? <FieldError message={localizedFieldError(field)!} /> : null}
      </View>
    );
  };

  const renderBathroomField = () => {
    const legacyCase = getStudioBathroomConfirmationCase(values);
    const legacyValue = values.legacyBathroomCount;
    const legacyValueLabel = legacyValue === null || legacyValue === undefined
      ? (language === 'ar' ? 'غير مسجل' : 'not recorded')
      : String(legacyValue);
    return (
      <View ref={setFocusTarget('bathrooms')} style={styles.field} testID="studio-bathrooms-field">
        <Text style={[styles.label, labelStyle]}>{catalogLabel('bathrooms')}</Text>
        <View style={[styles.staticValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>
            {getStudioCatalogField('bathrooms').fixedValue}
          </Text>
        </View>
        {getStudioCatalogField('bathrooms').helpText ? (
          <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>
            {getStudioCatalogField('bathrooms').helpText![language === 'ar' ? 1 : 0]}
          </Text>
        ) : null}
        {legacyCase ? (
          <View style={[styles.recovery, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>
              {language === 'ar'
                ? `القيمة المحفوظة للحمامات: ${legacyValueLabel}. ستبقى كما هي ما لم تؤكد استبدالها بواحد.`
                : `Saved bathroom value: ${legacyValueLabel}. It will remain unchanged unless you confirm replacing it with one.`}
            </Text>
            <Button
              title={language === 'ar' ? 'تأكيد الاستبدال بواحد' : 'Confirm replacing with one'}
              onPress={() => {
                setValues(current => ({ ...current, bathrooms: '1', legacyBathroomConfirmed: true }));
                setFieldErrors(current => {
                  const next = new Map(current);
                  next.delete('bathrooms');
                  return next;
                });
                setError('');
              }}
              testID="studio-confirm-bathroom-replacement"
            />
          </View>
        ) : null}
        {getError('bathrooms') ? (
          <FieldError message={legacyCase
            ? (language === 'ar'
              ? 'أكد استبدال قيمة الحمام القديمة قبل المتابعة.'
              : 'Confirm replacing the saved bathroom value before continuing.')
            : localizedFieldError('bathrooms')!}
          />
        ) : null}
      </View>
    );
  };

  const renderCadence = () => values.transaction === 'rent' ? (
    <View ref={setFocusTarget('cadence')} style={styles.field} testID="studio-cadence-field">
      <Text style={[styles.label, labelStyle]}>{catalogLabel('rentalPeriodId')}</Text>
      <ChoiceGrid style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {getStudioCatalogField('rentalPeriodId').quickPicks?.map(choice => {
          const period = choice.modeValues[mode];
          if (!period) return null;
          const choiceLabel = getStudioCatalogChoiceLabel(choice, mode);
          return (
            <ChoiceChip
              key={period}
              label={choiceLabel[language === 'ar' ? 1 : 0]}
              selected={values.rentalPeriodId === period}
              onPress={() => update('rentalPeriodId', period as StudioFormValues['rentalPeriodId'])}
              testID={`studio-cadence-${period}`}
              role="radio"
            />
          );
        })}
      </ChoiceGrid>
      {getError('rentalPeriodId') ? <FieldError message={localizedFieldError('rentalPeriodId')!} /> : null}
    </View>
  ) : null;

  const renderCatalogField = (fieldId: StudioCatalogFieldId) => {
    switch (fieldId) {
      case 'transaction':
        if (mode === 'wanted') return null;
        return (
          <View key={fieldId} style={styles.field} testID="studio-transaction-field">
            <Text style={[styles.label, labelStyle]}>{catalogLabel(fieldId)}</Text>
            <ChoiceGrid style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {getStudioCatalogField(fieldId).quickPicks?.map(choice => {
                const transaction = choice.modeValues[mode];
                if (!transaction) return null;
                const choiceLabel = getStudioCatalogChoiceLabel(choice, mode);
                return (
                  <ChoiceChip
                    key={transaction}
                    label={choiceLabel[language === 'ar' ? 1 : 0]}
                    selected={values.transaction === transaction}
                    onPress={() => update('transaction', transaction as Transaction)}
                    testID={`studio-transaction-${transaction}`}
                    role="radio"
                  />
                );
              })}
            </ChoiceGrid>
          </View>
        );
      case 'locationAreaId':
        return mode === 'offered' ? (
          <View key={fieldId} ref={setFocusTarget('locationAreaId')} style={styles.field}>
            <Text style={[styles.label, labelStyle]}>{catalogLabel(fieldId)}</Text>
            <KuwaitAreaSelector
              selectedIds={values.locationAreaId ? [values.locationAreaId] : []}
              multiSelect={false}
              onChange={ids => update('locationAreaId', ids[0] ?? '')}
              testID="studio-area"
            />
            {getError('locationAreaId') ? <FieldError message={localizedFieldError('locationAreaId')!} /> : null}
          </View>
        ) : (
          <View key={fieldId} ref={setFocusTarget('preferredAreaIds')} style={styles.field} testID="studio-preferred-area-field">
            <Text style={[styles.label, labelStyle]}>{catalogLabel(fieldId)}</Text>
            <ChoiceGrid style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {(['specific_areas', 'all_kuwait'] as const).map(scope => (
                <ChoiceChip
                  key={scope}
                  label={scope === 'all_kuwait' ? t('properties.all_kuwait') : t('studio.specific_areas')}
                  selected={values.preferredAreaMode === scope}
                  onPress={() => {
                    update('preferredAreaMode', scope);
                    if (scope === 'all_kuwait') update('preferredAreaIds', []);
                  }}
                  testID={`studio-area-mode-${scope}`}
                  role="radio"
                  />
              ))}
            </ChoiceGrid>
            {values.preferredAreaMode === 'specific_areas' ? (
              <KuwaitAreaSelector
                selectedIds={values.preferredAreaIds}
                onChange={ids => update('preferredAreaIds', ids)}
                testID="studio-preferred-areas"
              />
            ) : null}
            {getError('preferredAreaIds') ? <FieldError message={localizedFieldError('preferredAreaIds')!} /> : null}
          </View>
        );
      case 'mapsLink':
        return null;
      case 'price':
        return <View key={fieldId}>{textInput('price', catalogLabel(fieldId), { keyboardType: 'decimal-pad' })}</View>;
      case 'budgetMinimum':
        return (
          <View key={fieldId} style={styles.row}>
            <View style={styles.half}>{textInput('budgetMinimum', catalogLabel('budgetMinimum'), { keyboardType: 'decimal-pad' })}</View>
            <View style={styles.half}>{textInput('budgetMaximum', catalogLabel('budgetMaximum'), { keyboardType: 'decimal-pad' })}</View>
          </View>
        );
      case 'budgetMaximum':
        return null;
      case 'rentalPeriodId':
        return <View key={fieldId}>{renderCadence()}</View>;
      case 'areaSquareMeters':
        return <View key={fieldId} ref={setFocusTarget('areaSquareMeters')}>{textInput('areaSquareMeters', catalogLabel(fieldId), { keyboardType: 'decimal-pad' })}</View>;
      case 'studioRoomCount':
        return (
          <View key={fieldId} style={styles.field}>
            <Text style={[styles.label, labelStyle]}>{catalogLabel(fieldId)}</Text>
            <View style={[styles.staticValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{getStudioCatalogField(fieldId).fixedValue}</Text>
            </View>
            <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>{t('studio.room_fixed')}</Text>
          </View>
        );
      case 'bathrooms':
        return <View key={fieldId}>{renderBathroomField()}</View>;
      case 'kitchen':
      case 'hall':
      case 'parking':
        return binaryPreference(fieldId);
      case 'floorNumber':
        return <View key={fieldId}>{textInput('floorNumber', catalogLabel(fieldId), { keyboardType: 'numeric' })}</View>;
      case 'amenities':
        return <View key={fieldId} style={styles.field} testID="studio-amenities">
          <Text style={[styles.label, labelStyle]}>{catalogLabel(fieldId)}</Text>
          <OrderedPropertyAmenities entries={[
            ...STUDIO_FEATURES.map(item => {
            const selection = values.amenitySelections?.[item.field];
            const selected = selection === 'yes' || selection === 'required' || selection === 'no' || selection === 'must_not_have';
            return { field: item.field, content: <ChoiceChip key={item.field} optionId={item.field} label={`${item.label[language === 'ar' ? 1 : 0]}${selection === 'no' || selection === 'must_not_have' ? (isRTL ? ' · بدون' : ' · Without') : ''}`} selected={selected}
              onPress={() => update('amenitySelections', { ...values.amenitySelections, [item.field]: selected ? (mode === 'offered' ? 'unknown' : 'not_important') : (mode === 'offered' ? 'yes' : 'required') })} testID={`studio-amenity-${item.field}`} role="checkbox" /> };
          }),
            { field: 'parking', details: true, content: binaryPreference('parking') },
          ]} />
        </View>;
      case 'nearbyServices':
        return <NearbyServicesSelector key={fieldId} values={values.nearbyServices ?? []} onChange={value => update('nearbyServices', value)} language={language} color={colors.foreground} fontFamily={fonts.semiBold} />;
      case 'description':
        return <View key={fieldId}>{textInput('description', catalogLabel(fieldId), { multiline: true })}</View>;
    }
  };

  const renderForm = () => (
    <>
      {mode === 'wanted' && (seekerParam || editing) ? renderPersonSelector() : null}
      <>
          {mode === 'wanted' ? (
            <View style={styles.field} testID="studio-transaction-summary">
              <Text style={[styles.label, labelStyle]}>{catalogLabel('transaction')}</Text>
              <View style={[styles.transactionSummary, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>
                  {transactionLabel()}
                </Text>
                {!editing ? (
                  <Button
                    title={language === 'ar' ? 'تغيير' : 'Change'}
                    variant="outline"
                    onPress={changeWantedTransaction}
                    testID="studio-transaction-change"
                  />
                ) : null}
              </View>
            </View>
          ) : null}
          {mode === 'offered' ? <>
            <PropertyFormCard title={language === 'ar' ? 'البيانات الأساسية' : 'Basic information'} icon="map-pin" testID="studio-basic-card">
              {renderCatalogField('locationAreaId')}
              {renderCatalogField('price')}
              {renderCatalogField('rentalPeriodId')}
              {renderCatalogField('transaction')}
            </PropertyFormCard>
            <PropertyFormCard title={language === 'ar' ? 'مواصفات الاستوديو' : 'Studio specifications'} icon="home">
              {STUDIO_FORM_FIELD_ORDER[mode].filter(fieldId => !['locationAreaId', 'price', 'rentalPeriodId', 'transaction', 'mapsLink', 'parking', 'amenities', 'nearbyServices', 'description'].includes(fieldId)).map(fieldId => renderCatalogField(fieldId))}
          {mode === 'offered' ? (
            <View style={styles.field} testID="studio-occupancy-field">
              <Text style={[styles.label, labelStyle]}>{language === 'ar' ? 'نوع السكن' : 'Occupancy'}</Text>
              <ChoiceGrid style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {(['family', 'bachelor', 'any'] as const).map(value => (
                  <ChoiceChip
                    key={value}
                    label={({ family: ['Family', 'عائلات'], bachelor: ['Bachelor', 'عزاب'], any: ['Any', 'الكل'] })[value][language === 'ar' ? 1 : 0]}
                    selected={values.occupancy === value}
                    onPress={() => update('occupancy', values.occupancy === value ? undefined : value)}
                    role="radio"
                    testID={`studio-occupancy-${value}`}
                  />
                ))}
              </ChoiceGrid>
            </View>
          ) : null}
            </PropertyFormCard>
            <PropertyFormCard title={language === 'ar' ? 'المزايا المتوفرة' : 'Available features'} icon="check-square">{renderCatalogField('amenities')}</PropertyFormCard>
            {renderCatalogField('nearbyServices')}
            <PropertyFormCard title={language === 'ar' ? 'ملاحظات إضافية' : 'Additional notes'} icon="file-text">
              {renderCatalogField('description')}
              {textInput('privateNotes', language === 'ar' ? 'ملاحظات خاصة' : 'Private notes', { multiline: true })}
            </PropertyFormCard>
          </> : <PropertyFormCard title={language === 'ar' ? 'المتطلبات' : 'Requirements'} icon="search">{STUDIO_FORM_FIELD_ORDER[mode].filter(fieldId => fieldId !== 'parking').map(fieldId => renderCatalogField(fieldId))}</PropertyFormCard>}
          {mode === 'offered' ? renderExactLocationSection() : null}
          {mode === 'offered' ? renderStudioAttachments() : null}
        </>
    </>
  );

  const renderExactLocationSection = () => (
    <LocationAttachmentCard title={language === 'ar' ? 'الموقع' : 'Location'} testID="studio-exact-location">
      {textInput('mapsLink', language === 'ar' ? 'رابط خرائط Google' : 'Google Maps URL')}
      <LocationAttachmentRow>
        <LocationAttachmentButton label={t('enrich.current_location')} icon="crosshair" testID="studio-current-location" busy={locationBusy} disabled={saving} onPress={() => {
          if (mode !== 'offered' || locationBusy || saving) return;
          setLocationBusy(true);
          setLocationError('');
          void requestCurrentCoordinates().then(coordinates => {
            update('mapsLink', `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`);
          }).catch(() => setLocationError(t('enrich.location_failed'))).finally(() => setLocationBusy(false));
        }} />
        <LocationAttachmentButton
        label={language === 'ar' ? 'فتح خرائط Google' : 'Open Google Maps'}
        icon="map"
        onPress={() => {
          setLocationError('');
          const link = values.mapsLink.trim();
          const query = mode === 'offered'
            ? areaTitle(values.locationAreaId)
            : values.preferredAreaMode === 'all_kuwait'
              ? 'Kuwait'
              : values.preferredAreaIds.map(areaTitle).join(', ') || 'Kuwait';
          if (Platform.OS === 'web') {
            try {
              openStudioWebMapsLocation({ link, query });
            } catch {
              setLocationError(language === 'ar'
                ? 'تعذر فتح رابط خرائط Google صالح.'
                : 'Could not open a valid Google Maps link.');
            }
            return;
          }
          void (link
            ? openPastedLocationLink({ source: 'pasted_link', link }, Linking)
            : openGoogleMapsQuery(query, Linking))
            .catch(() => setLocationError(language === 'ar'
              ? 'تعذر فتح رابط خرائط Google صالح.'
              : 'Could not open a valid Google Maps link.'));
        }}
        testID="studio-open-google-maps"
      />
      </LocationAttachmentRow>
      {locationError ? <FieldError message={locationError} /> : null}
    </LocationAttachmentCard>
  );

  const renderStudioAttachments = () => (
    <LocationAttachmentCard title={language === 'ar' ? 'الصور والملفات' : 'Photos and files'} testID="studio-attachments">
      <LocationAttachmentRow>
        <LocationAttachmentButton tile icon="image" label={t('enrich.add_images')}
          onPress={() => Platform.OS === 'web' ? addStudioWebFiles('images') : void addStudioMedia(['images'])}
          disabled={attachmentBusy || saving} testID="studio-add-images" />
        <LocationAttachmentButton tile icon="video" label={t('enrich.add_videos')}
          onPress={() => Platform.OS === 'web' ? addStudioWebFiles('videos') : void addStudioMedia(['videos'])}
          disabled={attachmentBusy || saving} testID="studio-add-videos" />
        <LocationAttachmentButton tile icon="file-text" label={t('enrich.add_files')}
          onPress={() => Platform.OS === 'web' ? addStudioWebFiles('pdf') : void addStudioPdf()}
          disabled={attachmentBusy || saving} testID="studio-add-file" />
      </LocationAttachmentRow>
      <AttachmentPrivacyNote />
      {attachmentBusy ? <ActivityIndicator color={colors.primary} /> : null}
      {attachmentError ? <FieldError message={attachmentError} /> : null}
      {attachments.slice().sort((left, right) => left.order - right.order).map((item, index) => (
        <View key={item.id} style={[styles.attachmentRow, { borderColor: colors.border, backgroundColor: colors.card }]} testID={`studio-attachment-${item.id}`}>
          {item.kind === 'image' ? (
            <Image
              source={{ uri: Platform.OS === 'web' ? webImageSources[item.id] ?? '' : item.uri }}
              style={styles.attachmentPreview}
              resizeMode="cover"
              accessibilityLabel={item.originalName}
            />
          ) : (
            <View style={[styles.attachmentPreview, styles.attachmentFileIcon, { backgroundColor: colors.secondary }]}>
              <Feather name={item.kind === 'video' ? 'video' : 'file-text'} size={24} color={colors.primary} />
            </View>
          )}
          <View style={styles.attachmentDescription}>
            <Text numberOfLines={2} style={{ color: colors.foreground, fontFamily: fonts.medium }}>{item.originalName}</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>
              {item.kind === 'image' ? (language === 'ar' ? 'صورة' : 'Image')
                : item.kind === 'video' ? (language === 'ar' ? 'فيديو' : 'Video')
                  : 'PDF'}
              {item.isCover ? (language === 'ar' ? ' · صورة الغلاف' : ' · Cover') : ''}
            </Text>
            <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Button title={language === 'ar' ? '↑' : '↑'} onPress={() => moveStudioAttachment(item, -1)} disabled={index === 0} testID={`studio-attachment-up-${item.id}`} />
              <Button title="↓" onPress={() => moveStudioAttachment(item, 1)} disabled={index === attachments.length - 1} testID={`studio-attachment-down-${item.id}`} />
              {item.kind === 'image' ? (
                <Button
                  title={language === 'ar' ? 'تعيين غلاف' : 'Set cover'}
                  onPress={() => setAttachments(current => setAttachmentCover(current, item.id))}
                  disabled={item.isCover}
                  testID={`studio-attachment-cover-${item.id}`}
                />
              ) : null}
              <Button title={language === 'ar' ? 'إزالة' : 'Remove'} onPress={() => removeStudioAttachment(item)} testID={`studio-attachment-remove-${item.id}`} />
            </View>
          </View>
        </View>
      ))}
      {attachments.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>
          {language === 'ar' ? 'لا توجد مرفقات بعد.' : 'No attachments yet.'}
        </Text>
      ) : null}
    </LocationAttachmentCard>
  );

  const reviewItem = (label: string, value: string) => (
    <View key={label} style={[styles.reviewRow, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>{label}</Text>
      <Text style={{ color: colors.foreground, fontFamily: fonts.medium, flex: 1, textAlign: isRTL ? 'left' : 'right' }}>{value}</Text>
    </View>
  );

  const renderReviewCatalogField = (fieldId: StudioCatalogFieldId) => {
    switch (fieldId) {
      case 'transaction': {
        return reviewItem(
          catalogLabel(fieldId),
          studioReviewIntent().label,
        );
      }
      case 'locationAreaId':
        return reviewItem(catalogLabel(fieldId), mode === 'offered'
          ? areaTitle(values.locationAreaId)
          : values.preferredAreaMode === 'all_kuwait'
            ? t('properties.all_kuwait')
            : values.preferredAreaIds.map(areaTitle).join(', '));
      case 'mapsLink':
        return reviewItem(catalogLabel(fieldId), values.mapsLink || '—');
      case 'price':
        return reviewItem(catalogLabel(fieldId),
          `${values.price} KWD${values.transaction === 'rent' ? ` / ${t(`studio.${values.rentalPeriodId}`)}` : ''}`);
      case 'budgetMinimum':
        return reviewItem(
          `${catalogLabel('budgetMinimum')} – ${catalogLabel('budgetMaximum')}`,
          `${values.budgetMinimum} – ${values.budgetMaximum} KWD${values.transaction === 'rent' ? ` / ${t(`studio.${values.rentalPeriodId}`)}` : ''}`,
        );
      case 'budgetMaximum':
      case 'rentalPeriodId':
        return null;
      case 'areaSquareMeters':
        return reviewItem(catalogLabel(fieldId), values.areaSquareMeters ? `${values.areaSquareMeters} m²` : '—');
      case 'studioRoomCount':
        return reviewItem(catalogLabel(fieldId), getStudioCatalogField(fieldId).fixedValue!);
      case 'bathrooms':
        return (
          <View key={fieldId}>
            {reviewItem(catalogLabel(fieldId), getStudioCatalogField(fieldId).fixedValue!)}
            {getStudioBathroomConfirmationCase(values) ? reviewItem(
              language === 'ar' ? 'القيمة القديمة المحفوظة' : 'Saved legacy value',
              language === 'ar'
                ? `ستبقى ${values.legacyBathroomCount ?? 'غير مسجل'} ما لم تؤكد الاستبدال.`
                : `${values.legacyBathroomCount ?? 'not recorded'} remains unchanged unless you confirm replacement.`,
            ) : null}
          </View>
        );
      case 'kitchen':
      case 'hall':
      case 'parking':
        if (values[fieldId] === 'not_important') return null;
        return reviewItem(
          catalogLabel(fieldId),
          values[fieldId] === 'unknown'
            ? '—'
            : values[fieldId] === 'required' || values[fieldId] === 'must_not_have'
              ? t(`studio.${values[fieldId]}`)
              : values[fieldId] === 'yes' || values[fieldId] === 'no'
                ? t(`studio.${values[fieldId]}`)
                : '—',
        );
      case 'floorNumber':
        return reviewItem(catalogLabel(fieldId), values.floorNumber || '—');
      case 'amenities':
        return reviewItem(catalogLabel(fieldId), STUDIO_FEATURES.flatMap(item => {
          const selected = values.amenitySelections?.[item.field];
          return selected === 'yes' || selected === 'required' ? [item.label[language === 'ar' ? 1 : 0]] : selected === 'no' || selected === 'must_not_have' ? [`${item.label[language === 'ar' ? 1 : 0]} · ${language === 'ar' ? 'بدون' : 'Without'}`] : [];
        }).join(' · ') || '—');
      case 'nearbyServices':
        return reviewItem(catalogLabel(fieldId), (values.nearbyServices ?? []).map(id => DEMO_NEARBY_SERVICES.find(item => item.id === id)?.label[language === 'ar' ? 1 : 0] ?? id).join(' · ') || '—');
      case 'description':
        return reviewItem(catalogLabel(fieldId), values.description || '—');
    }
  };

  const renderReview = () => (
    <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {reviewItem(t('studio.property_type'), `${t('propertyType.apartment')} · ${t('enrich.apartment_subtype.studio')}`)}
      {mode === 'wanted' ? reviewItem(catalogLabel('transaction'), studioReviewIntent().label) : null}
      {STUDIO_FORM_FIELD_ORDER[mode].map(fieldId => renderReviewCatalogField(fieldId))}
      {mode === 'offered' && values.occupancy ? reviewItem(
        language === 'ar' ? 'نوع السكن' : 'Occupancy',
        ({ family: ['Family', 'عائلات'], bachelor: ['Bachelor', 'عزاب'], any: ['Any', 'الكل'] })[values.occupancy][language === 'ar' ? 1 : 0],
      ) : null}
      {mode === 'offered' && values.privateNotes
        ? reviewItem(language === 'ar' ? 'ملاحظات خاصة' : 'Private notes', values.privateNotes)
        : null}
      {reviewItem(
        language === 'ar' ? 'الموقع الدقيق' : 'Exact location',
        values.mapsLink || '—',
      )}
      {mode === 'wanted' && selectedPerson ? reviewItem(t('studio.person'), selectedPerson.name) : null}
    </View>
  );

  const renderPropertyReview = () => (
    <PropertyReview progress={{ step: 2, total: 2 }} propertyLabel={t('enrich.apartment_subtype.studio')}
      intent={studioReviewIntent().label} area={areaTitle(values.locationAreaId)}
      price={values.price.trim() ? formatPrice(Number(toEnglishDigits(values.price).replace(/[٫,]/g, '.')), 'KWD', language) : undefined}
      priceLabel={language === 'ar' ? (values.transaction === 'sale' ? 'السعر' : 'الإيجار') : (values.transaction === 'sale' ? 'Price' : 'Rent')}
      cadence={values.transaction === 'rent' ? formatRentalCadence(values.rentalPeriodId, t) : undefined}>
      {STUDIO_FORM_FIELD_ORDER[mode].filter(field => !['transaction', 'locationAreaId', 'price', 'rentalPeriodId', 'mapsLink'].includes(field)).map(fieldId => renderReviewCatalogField(fieldId))}
      {values.occupancy ? reviewItem(language === 'ar' ? 'نوع السكن' : 'Occupancy', ({ family: ['Family', 'عائلات'], bachelor: ['Bachelor', 'عزاب'], any: ['Any', 'الكل'] })[values.occupancy][language === 'ar' ? 1 : 0]) : null}
      {values.privateNotes ? reviewItem(language === 'ar' ? 'ملاحظات خاصة' : 'Private notes', values.privateNotes) : null}
      {values.mapsLink ? reviewItem(language === 'ar' ? 'الموقع الدقيق' : 'Exact location', values.mapsLink) : null}
    </PropertyReview>
  );

  if (!isValidRoute) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: topInset + 16 }]}>
        <Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{t('studio.load_failed')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          accessibilityRole="button"
          testID="studio-close"
          onPress={handleHeaderBack}
          style={[styles.backButton, navigationButtonStyle]}
        >
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={18} color={navigationButtonTextStyle.color} />
          <Text style={[navigationButtonTextStyle, { fontFamily: fonts.semiBold }]}>{t('studio.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
          {propertyReview ? (language === 'ar' ? 'مراجعة العقار' : 'Property review') : editing ? t('studio.edit_title') : t(mode === 'offered' ? 'studio.title.offered' : 'studio.title.wanted')}
        </Text>
      </View>
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : !recordLoaded ? (
        <View style={styles.loading}><Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{error || t('studio.load_failed')}</Text></View>
      ) : (
        <>
          <KeyboardAwareScrollViewCompat
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomInset + 28, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            bottomOffset={86}
            testID="studio-scroll"
          >
            {error ? (
              <Text
                testID="studio-form-error-summary"
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[styles.error, { color: colors.destructive, fontFamily: fonts.medium }]}
              >
                {error}
              </Text>
            ) : null}
            {!showingReview ? renderForm() : (
              <>
                {!propertyReview && <Text style={[styles.reviewTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('studio.review')}</Text>}
                {propertyReview ? renderPropertyReview() : renderReview()}
                {mode === 'offered' ? renderStudioAttachments() : null}
              </>
            )}
            {savedProperty && propertySourceConfirmed ? (
              <View style={[styles.successActions, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Button
                  title={language === 'ar' ? 'عرض العقار' : 'View Property'}
                  onPress={() => router.replace({
                    pathname: '/property/[propertyCoreId]',
                    params: { propertyCoreId: savedProperty.core.id },
                  } as never)}
                  testID="studio-view-saved-property"
                />
                <Button title={language === 'ar' ? 'الرئيسية' : 'Home'} onPress={() => router.replace('/' as never)} testID="studio-home" />
              </View>
            ) : null}
            {savedRequirement ? (
              <View style={[styles.successActions, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Button
                  title={language === 'ar' ? 'ربط بشخص موجود' : 'Link existing Person'}
                  onPress={() => router.replace({
                    pathname: '/requirement/view/[requirementId]',
                    params: { requirementId: savedRequirement.id, link: '1' },
                  } as never)}
                  testID="studio-link-existing-person"
                />
                <Button
                  title={language === 'ar' ? 'إضافة شخص وربطه' : 'Add Person and link'}
                  onPress={() => router.replace({
                    pathname: '/person/new',
                    params: { returnRequirementId: savedRequirement.id },
                  } as never)}
                  testID="studio-add-person-and-link"
                />
                <Button
                  title={language === 'ar' ? 'الربط لاحقاً' : 'Link later'}
                  onPress={() => router.replace({
                    pathname: '/requirement/view/[requirementId]',
                    params: { requirementId: savedRequirement.id },
                  } as never)}
                  testID="studio-link-later"
                />
                <Button title={language === 'ar' ? 'الرئيسية' : 'Home'} onPress={() => router.replace('/' as never)} testID="studio-home" />
              </View>
            ) : null}
            {propertyRecovery ? (
              <View style={[styles.recovery, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{propertyRecovery.message}</Text>
                <Button title={t('summary.retry_save')} onPress={() => void retryPropertySave()} disabled={saving} />
              </View>
            ) : null}
            {savedProperty && error === t('studio.link_failed') ? (
              <Button
                title={t('studio.retry_link')}
                onPress={() => {
                  if (flight.current) return;
                  flight.current = true;
                  setSaving(true);
                  void navigateAfterPropertySave(savedProperty).catch(() => {
                    setError(t('studio.link_failed'));
                  }).finally(() => {
                    flight.current = false;
                    setSaving(false);
                  });
                }}
                disabled={saving}
              />
            ) : null}
            {committedRequirement.current || uncertainRequirement.current ? (
              <Button
                title={t('studio.retry_confirmation')}
                onPress={() => void retryRequirementConfirmation()}
                disabled={saving}
              />
            ) : null}
            {!propertyReview && <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {showingReview ? (
                <Button title={t('studio.back')} onPress={returnToForm} disabled={saving} />
              ) : null}
              {!showingReview ? (
                <Button
                  title={t('studio.next')}
                  onPress={() => { if (!savedProperty && !savedRequirement && validate()) setStep('review'); }}
                  disabled={saving || !recordLoaded || !!savedProperty || !!savedRequirement}
                />
              ) : (
                <Button
                  title={saving ? (language === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : t(editing ? 'studio.save_changes' : 'studio.save')}
                  onPress={() => void doSave()}
                  disabled={saving || !!propertyRecovery || !!committedRequirement.current || !!savedProperty || !!savedRequirement}
                  testID="studio-save"
                />
              )}
            </View>}
          </KeyboardAwareScrollViewCompat>
          {propertyReview && <PropertyReviewFooter title={saving ? (language === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : t('summary.submit')}
            onPress={() => void doSave()} loading={saving}
            disabled={saving || !!propertyRecovery || !!committedRequirement.current || !!savedProperty || !!savedRequirement} testID="studio-save" />}
        </>
      )}
    </View>
  );
}

function FieldError({ message }: { message: string }) {
  const colors = useColors();
  const { fonts } = useI18n();
  return <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive, fontFamily: fonts.medium }]}>{message}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 64, paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center', gap: 12 },
  backButton: { minHeight: 42, flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 10, borderWidth: 1, borderRadius: 12 },
  title: { flex: 1, fontSize: 20 },
  scroll: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  field: { gap: 8, width: '100%' },
  label: { fontSize: 15, lineHeight: 20 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  staticValue: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 },
  transactionSummary: { minHeight: 56, justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 },
  chips: { flexWrap: 'wrap', gap: 8 },
  flexChip: { flexGrow: 1, flexBasis: '28%', minWidth: 78, paddingHorizontal: 10 },
  row: { gap: 10, alignItems: 'flex-start' },
  half: { flex: 1, minWidth: 0 },
  hint: { fontSize: 13 },
  error: { fontSize: 13, lineHeight: 18 },
  personList: { gap: 8 },
  personChoice: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewTitle: { fontSize: 18 },
  reviewCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12 },
  reviewRow: { minHeight: 48, alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  recovery: { gap: 12, padding: 14, borderWidth: 1, borderRadius: 14 },
  actions: { gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' },
  attachmentPanel: { padding: 12, borderWidth: 1, borderRadius: 14 },
  attachmentRow: { flexDirection: 'row', gap: 10, padding: 10, borderWidth: 1, borderRadius: 12 },
  attachmentPreview: { width: 76, height: 76, borderRadius: 8 },
  attachmentFileIcon: { alignItems: 'center', justifyContent: 'center' },
  attachmentDescription: { flex: 1, gap: 6 },
  successActions: { gap: 12, padding: 14, borderWidth: 1, borderRadius: 14 },
});
