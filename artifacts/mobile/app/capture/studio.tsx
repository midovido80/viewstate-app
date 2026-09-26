import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { Property, PropertySourceRole, SeekerRequirement, Transaction } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { ChoiceChip } from '@/components/ChoiceChip';
import { KuwaitAreaSelector } from '@/components/KuwaitAreaSelector';
import { NumericQuickPick } from '@/components/NumericQuickPick';
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
  validateStudioForm,
  STUDIO_AMENITIES,
  type StudioFormError,
  type StudioFormMode,
  type StudioFormValues,
  type StudioSelection,
} from '@/services/studioFormModel';
import {
  prepareStudioPropertyEditCandidate,
  retryStudioPropertyRecovery,
  saveStudioProperty,
  saveStudioRequirement,
  type StudioPropertySaveResult,
} from '@/services/studioSave';
import {
  retryRequirementReadback,
  verifyUncertainRequirementWrite,
} from '@/services/requirementSaveOutcome';

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

const isTransaction = (value: string | undefined): value is Transaction =>
  value === 'sale' || value === 'rent';
const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function StudioCaptureRoute() {
  const params = useLocalSearchParams<RouteParams>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
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
  const [selectedPersonId, setSelectedPersonId] = useState(seekerParam ?? '');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ReadonlyMap<string, StudioFormError>>(new Map());
  const [propertyRecovery, setPropertyRecovery] = useState<{
    id: string;
    candidate: Property;
    baseline: Property | null;
    message: string;
  } | null>(null);
  const [savedProperty, setSavedProperty] = useState<Property | null>(null);
  const [peopleError, setPeopleError] = useState(false);
  const flight = useRef(false);
  const committedRequirement = useRef<SeekerRequirement | null>(null);
  const uncertainRequirement = useRef<SeekerRequirement | null>(null);
  const inputRefs = useRef<Record<string, InputRef>>({});
  const draftPropertyId = useRef(generateDomainId());
  const draftOfferId = useRef(generateDomainId());
  const draftRequirementId = useRef(generateDomainId());
  const routeTransaction = isTransaction(transactionParam) ? transactionParam : undefined;
  const isValidRoute = editing
    || ((modeParam === 'offered' || modeParam === 'wanted') && routeTransaction !== undefined);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

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
    void (async () => {
      try {
        const result = await store.getPeople();
        let options = result;
        if (seekerParam && !result.some(person => person.id === seekerParam)) {
          const directPerson = await store.getPerson(seekerParam);
          if (directPerson) options = [directPerson, ...result];
        }
        if (!cancelled) setPeople(options);
      } catch {
        if (cancelled) return;
        setPeopleError(true);
        if (seekerParam) {
          try {
            const directPerson = await store.getPerson(seekerParam);
            if (!cancelled && directPerson) setPeople([directPerson]);
          } catch {
            // Keep the explicit people-load failure visible.
          }
        }
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
          const person = await store.getPerson(requirement.seekerId);
          if (!person) throw new Error('STUDIO_PERSON_NOT_FOUND');
          if (!cancelled) {
            setMode('wanted');
            setBaselineRequirement(requirement);
            setEditOwnerPerson(person);
            setSelectedPersonId(requirement.seekerId);
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
  const areaTitle = (id: string) => {
    const area = getAreaById(id);
    return area ? (language === 'ar' ? area.ar : area.en) : id;
  };
  const setFieldRef = (field: string) => (ref: TextInput | null) => {
    inputRefs.current[field] = { current: ref };
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

  const validate = () => {
    const result = validateStudioForm(values);
    const next = new Map<string, StudioFormError>();
    result.errors.forEach(item => {
      if (!next.has(String(item.field))) next.set(String(item.field), item);
    });
    if (mode === 'wanted' && !selectedPersonId) {
      setError(t('studio.person_required'));
    } else if (mode === 'wanted' && selectedPersonId && !selectedPerson) {
      setError(t('studio.person_missing'));
    } else if (!result.ok) {
      setError(t('studio.validation'));
    } else {
      setError('');
    }
    setFieldErrors(next);
    if (next.size) {
      const first = next.keys().next().value as string;
      inputRefs.current[first === 'budget' ? 'budgetMinimum' : first]?.current?.focus();
    }
    return result.ok && (mode !== 'wanted' || (!!selectedPersonId && !!selectedPerson));
  };

  const navigateAfterPropertySave = async (property: Property) => {
    if (linkPersonId && !editing) {
      await store.linkPersonToProperty({ personId: linkPersonId, propertyCoreId: property.core.id });
      if (sourceRole) {
        await store.setPropertySource({
          propertyCoreId: property.core.id,
          personId: linkPersonId,
          role: sourceRole as PropertySourceRole,
        });
      }
    }
    router.replace({ pathname: '/property/[propertyCoreId]', params: { propertyCoreId: property.core.id } } as never);
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
        const candidate = baselineProperty
          ? prepareStudioPropertyEditCandidate(baselineProperty, built)
          : built;
        const outcome = await saveStudioProperty({
          candidate,
          baseline: baselineProperty,
          store,
        });
        if (outcome.status === 'saved') {
          setSavedProperty(outcome.property);
          try {
            await navigateAfterPropertySave(outcome.property);
          } catch {
            setError(t('studio.link_failed'));
          }
        } else if (outcome.status === 'recovery_required') {
          setPropertyRecovery({
            id: outcome.propertyId,
            candidate,
            baseline: baselineProperty,
            message: t('studio.save_uncertain'),
          });
        } else if (outcome.status === 'saved_readback_failed') {
          setPropertyRecovery({
            id: outcome.propertyId,
            candidate,
            baseline: baselineProperty,
            message: t('studio.saved_readback_failed'),
          });
        } else if (outcome.status === 'conflict') {
          setError(t('studio.save_conflict'));
        } else {
          setError(outcome.retryAllowed ? t('studio.save_failed') : t('studio.save_uncertain'));
        }
      } else {
        const ownerId = baselineRequirement?.seekerId ?? selectedPersonId;
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
            pathname: '/person/[personId]',
            params: { personId: ownerId, requirementSaved: '1' },
          } as never),
        });
        if (result.status === 'saved') {
          committedRequirement.current = null;
          uncertainRequirement.current = null;
          setError('');
        } else if (result.status === 'missing_person' || result.status === 'non_seeker') {
          setError(t('studio.person_missing'));
        } else if (result.status === 'saved_readback_failed' || result.status === 'saved_navigation_failed') {
          committedRequirement.current = candidate;
          setError(t(result.status === 'saved_navigation_failed' ? 'studio.navigation_failed' : 'studio.saved_readback_failed'));
        } else if (result.status === 'edit_conflict' || result.conflict) {
          if (result.status !== 'edit_conflict') uncertainRequirement.current = candidate;
          setError(t('studio.save_conflict'));
        } else {
          if (result.retryAllowed === false) uncertainRequirement.current = candidate;
          setError(result.retryAllowed === false ? t('studio.save_uncertain') : t('studio.save_failed'));
        }
      }
    } catch {
      setError(t('studio.save_failed'));
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
        try {
          await navigateAfterPropertySave(result.property);
        } catch {
          setError(t('studio.link_failed'));
        }
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
          pathname: '/person/[personId]',
          params: { personId: candidate.seekerId, requirementSaved: '1' },
        } as never);
      const wasUncertain = !!uncertainRequirement.current;
      const outcome = wasUncertain
        ? await verifyUncertainRequirementWrite({ candidate, store, navigate })
        : await retryRequirementReadback({ candidate, store, navigate });
      if (outcome.status === 'saved') {
        committedRequirement.current = null;
        uncertainRequirement.current = null;
        setError('');
      } else if (outcome.status === 'storage_failure' && outcome.retryAllowed) {
        committedRequirement.current = null;
        uncertainRequirement.current = null;
        setError(t('studio.save_failed'));
      } else if (outcome.status === 'storage_failure' && outcome.conflict) {
        uncertainRequirement.current = candidate;
        setError(t('studio.save_conflict'));
      } else if (outcome.status === 'saved_navigation_failed') {
        committedRequirement.current = candidate;
        setError(t('studio.navigation_failed'));
      } else {
        committedRequirement.current = candidate;
        setError(t('studio.saved_readback_failed'));
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
          {
            color: colors.foreground,
            borderColor: getError(key) ? colors.destructive : colors.border,
            backgroundColor: colors.card,
            textAlign: isRTL ? 'right' : 'left',
            fontFamily: fonts.regular,
            minHeight: options.multiline ? 100 : 48,
          },
        ]}
      />
      {getError(key) ? <FieldError message={localizedFieldError(key)!} /> : null}
    </View>
  );

  const binaryPreference = (field: 'kitchen' | 'hall' | 'parking') => {
    const label = t(`studio.${field}`);
    const selections: readonly StudioSelection[] = mode === 'offered'
      ? ['yes', 'no', 'unknown']
      : ['required', 'not_important', 'must_not_have'];
    return (
      <View key={field} style={styles.field}>
        <Text style={[styles.label, labelStyle]}>{label}</Text>
        <View style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {selections.map(selection => (
            <ChoiceChip
              key={selection}
              label={t(`studio.${selection}`)}
              selected={values[field] === selection}
              onPress={() => update(field, selection)}
              testID={`studio-${field}-${selection}`}
              role="radio"
              style={styles.flexChip}
            />
          ))}
        </View>
        {getError(field) ? <FieldError message={localizedFieldError(field)!} /> : null}
      </View>
    );
  };

  const renderForm = () => (
    <>
      <View style={styles.field}>
        <Text style={[styles.label, labelStyle]}>{t('studio.property_type')}</Text>
        <View style={[styles.staticValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>
            {t('propertyType.apartment')}
          </Text>
        </View>
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, labelStyle]}>{t('studio.apartment_subtype')}</Text>
        <View style={[styles.staticValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>
            {t('enrich.apartment_subtype.studio')}
          </Text>
        </View>
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, labelStyle]}>{t('studio.transaction')}</Text>
        <View style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {(['sale', 'rent'] as const).map(transaction => (
            <ChoiceChip
              key={transaction}
              label={t(`studio.${transaction}`)}
              selected={values.transaction === transaction}
              onPress={() => update('transaction', transaction)}
              testID={`studio-transaction-${transaction}`}
              role="radio"
              style={styles.flexChip}
            />
          ))}
        </View>
      </View>
      {mode === 'offered' ? (
        <View style={styles.field}>
          <Text style={[styles.label, labelStyle]}>{t('studio.location')}</Text>
          <KuwaitAreaSelector
            selectedIds={values.locationAreaId ? [values.locationAreaId] : []}
            multiSelect={false}
            onChange={ids => update('locationAreaId', ids[0] ?? '')}
            testID="studio-area"
          />
          {getError('locationAreaId') ? <FieldError message={localizedFieldError('locationAreaId')!} /> : null}
        </View>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={[styles.label, labelStyle]}>{t('studio.location')}</Text>
            <View style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
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
                  style={styles.flexChip}
                />
              ))}
            </View>
            {values.preferredAreaMode === 'specific_areas' ? (
              <KuwaitAreaSelector
                selectedIds={values.preferredAreaIds}
                onChange={ids => update('preferredAreaIds', ids)}
                testID="studio-preferred-areas"
              />
            ) : null}
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, labelStyle]}>{t('studio.person')}</Text>
            {baselineRequirement ? (
              selectedPerson ? (
                <View style={[styles.staticValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{selectedPerson.name}</Text>
                </View>
              ) : (
                <FieldError message={t('studio.person_missing')} />
              )
            ) : peopleError && !selectedPerson ? (
              <FieldError message={t('people.load_failed')} />
            ) : people.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{t('studio.choose_person')}</Text>
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
                      onPress={() => setSelectedPersonId(person.id)}
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
            {getError('preferredAreaIds') ? <FieldError message={localizedFieldError('preferredAreaIds')!} /> : null}
          </View>
        </>
      )}
      {mode === 'offered'
        ? textInput('price', t('studio.price'), { keyboardType: 'decimal-pad' })
        : (
          <View style={styles.field}>
            <Text style={[styles.label, labelStyle]}>{t('studio.budget')}</Text>
            <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.half}>{textInput('budgetMinimum', t('studio.minimum'), { keyboardType: 'decimal-pad' })}</View>
              <View style={styles.half}>{textInput('budgetMaximum', t('studio.maximum'), { keyboardType: 'decimal-pad' })}</View>
            </View>
            {getError('budget') ? <FieldError message={localizedFieldError('budget')!} /> : null}
          </View>
        )}
      {values.transaction === 'rent' ? (
        <View style={styles.field}>
          <Text style={[styles.label, labelStyle]}>{t('studio.cadence')}</Text>
          <View style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {(['daily', 'monthly', 'yearly'] as const).map(period => (
              <ChoiceChip
                key={period}
                label={t(`studio.${period}`)}
                selected={values.rentalPeriodId === period}
                onPress={() => update('rentalPeriodId', period)}
                testID={`studio-cadence-${period}`}
                role="radio"
                style={styles.flexChip}
              />
            ))}
          </View>
        </View>
      ) : null}
      {mode === 'offered' ? textInput('mapsLink', t('studio.map_link')) : null}
      <View style={styles.field}>
        {textInput('areaSquareMeters', t('studio.area'), { keyboardType: 'decimal-pad' })}
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, labelStyle]}>{t('studio.rooms')}</Text>
        <View style={[styles.staticValue, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>1</Text>
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>{t('studio.room_fixed')}</Text>
      </View>
      <NumericQuickPick
        scopeKey={`studio:${mode}:${editPropertyId ?? editRequirementId ?? 'new'}:bathrooms`}
        label={t('studio.bathrooms')}
        value={values.bathrooms}
        onChangeText={value => update('bathrooms', value)}
        testID="studio-bathrooms"
      />
      {binaryPreference('kitchen')}
      {binaryPreference('hall')}
      {binaryPreference('parking')}
      {textInput('floorNumber', t('studio.floor'), { keyboardType: 'numeric' })}
      <View style={styles.field}>
        <Text style={[styles.label, labelStyle]}>{t('studio.amenities')}</Text>
        <View style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {STUDIO_AMENITIES.map(amenity => (
            <ChoiceChip
              key={amenity}
              label={amenity === 'balcony'
                ? t('studio.balcony')
                : t('studio.elevator')}
              selected={values.amenities.includes(amenity)}
              onPress={() => update(
                'amenities',
                values.amenities.includes(amenity)
                  ? values.amenities.filter(item => item !== amenity)
                  : [...values.amenities, amenity],
              )}
              testID={`studio-amenity-${amenity}`}
              role="checkbox"
              style={styles.flexChip}
            />
          ))}
        </View>
      </View>
      {textInput('description', t('studio.description_optional'), { multiline: true })}
    </>
  );

  const reviewItem = (label: string, value: string) => (
    <View key={label} style={[styles.reviewRow, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>{label}</Text>
      <Text style={{ color: colors.foreground, fontFamily: fonts.medium, flex: 1, textAlign: isRTL ? 'left' : 'right' }}>{value}</Text>
    </View>
  );
  const renderReview = () => (
    <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {reviewItem(t('studio.property_type'), `${t('propertyType.apartment')} · ${t('enrich.apartment_subtype.studio')}`)}
      {reviewItem(t('studio.transaction'), t(`studio.${values.transaction}`))}
      {reviewItem(t('studio.location'), mode === 'offered'
        ? areaTitle(values.locationAreaId)
        : values.preferredAreaMode === 'all_kuwait'
          ? t('properties.all_kuwait')
          : values.preferredAreaIds.map(areaTitle).join(', '))}
      {reviewItem(mode === 'offered' ? t('studio.price') : t('studio.budget'),
        mode === 'offered'
          ? `${values.price} KWD${values.transaction === 'rent' ? ` / ${t(`studio.${values.rentalPeriodId}`)}` : ''}`
          : `${values.budgetMinimum} – ${values.budgetMaximum} KWD`)}
      {reviewItem(t('studio.area'), values.areaSquareMeters ? `${values.areaSquareMeters} m²` : '—')}
      {reviewItem(t('studio.rooms'), '1')}
      {reviewItem(t('studio.bathrooms'), values.bathrooms || '—')}
      {reviewItem(t('studio.floor'), values.floorNumber || '—')}
      {(['kitchen', 'hall', 'parking'] as const).map(field => reviewItem(
        t(`studio.${field}`),
        t(`studio.${values[field]}`),
      ))}
      {reviewItem(t('studio.amenities'), values.amenities.length
        ? values.amenities.map(value => value === 'balcony' ? t('studio.balcony') : t('studio.elevator')).join(', ')
        : '—')}
      {reviewItem(t('studio.description'), values.description || '—')}
      {mode === 'wanted' && selectedPerson ? reviewItem(t('studio.person'), selectedPerson.name) : null}
    </View>
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
          onPress={() => router.back()}
          style={[styles.backButton, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={colors.foreground} />
          <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{t('studio.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
          {editing ? t('studio.edit_title') : t(mode === 'offered' ? 'studio.title.offered' : 'studio.title.wanted')}
        </Text>
      </View>
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : !recordLoaded ? (
        <View style={styles.loading}><Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{error || t('studio.load_failed')}</Text></View>
      ) : (
        <>
          <KeyboardAwareScrollViewCompat
            style={styles.scroll}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomInset + 28, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            bottomOffset={86}
            testID="studio-scroll"
          >
            {step === 'form' ? renderForm() : (
              <>
                <Text style={[styles.reviewTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('studio.review')}</Text>
                {renderReview()}
              </>
            )}
            {error ? (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive, fontFamily: fonts.medium }]}>
                {error}
              </Text>
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
            <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {step === 'review' ? (
                <Button title={t('studio.back')} onPress={() => { setError(''); setStep('form'); }} disabled={saving} />
              ) : null}
              {step === 'form' ? (
                <Button
                  title={t('studio.next')}
                  onPress={() => { if (validate()) setStep('review'); }}
                  disabled={saving || !recordLoaded}
                />
              ) : (
                <Button
                  title={saving ? (language === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : t(editing ? 'studio.save_changes' : 'studio.save')}
                  onPress={() => void doSave()}
                  disabled={saving || !!propertyRecovery || !!committedRequirement.current}
                  testID="studio-save"
                />
              )}
            </View>
          </KeyboardAwareScrollViewCompat>
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
});