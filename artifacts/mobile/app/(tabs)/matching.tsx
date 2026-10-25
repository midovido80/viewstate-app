import { MatchingConfirmationList } from '@/components/MatchingConfirmationList';
import { readMatchingReturn, rememberMatchingReturn } from '@/services/matchingReturnSession';
import { MatchingResultCard as ResultCard } from '@/components/MatchingResultCard';
import { MatchingRefinements } from '@/components/MatchingRefinements';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { Feather } from '@expo/vector-icons';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import {
  MATCH_ENGINE_VERSION,
  type MatchingPolicy,
  PROPERTY_TYPES,
  type Property,
  type PropertyType,
  type RequirementOccupancy,
  type RequirementPurpose,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { SelectCard } from '@/components/SelectCard';
import { PrimaryTabHeader } from '@/components/PrimaryTabHeader';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { KUWAIT_AREAS, getAreaById, searchAreas } from '@/constants/kuwait-areas';
import { store } from '@/services/persistence';
import { MyPropertiesMatchingSource } from '@/services/myPropertiesMatchingSource';
import {
  BrokerInitiatedMatching,
  type BrokerMatchingRunResult,
} from '@/services/brokerInitiatedMatching';
import {
  buildTransientRequirement,
  groupMatchAllResultsByPerson,
  runMatchingForAllRequirements,
  validMatchingRequirements,
  type MatchAllPersonGroup,
} from '@/services/matchingUi';
import type { Person } from '@/services/people';

type MatchingMode = 'saved' | 'quick';

function numberFromInput(value: string): number | undefined {
  const trimmed = value.trim().replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  if (!trimmed || !/^\d+(?:\.\d+)?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

function ChoiceChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const colors = useColors();
  const { fonts } = useI18n();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: selected ? colors.primaryForeground : colors.foreground,
            fontFamily: fonts.medium,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
  keyboardType = 'default',
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID: string;
  keyboardType?: 'default' | 'numeric';
  multiline?: boolean;
}) {
  const colors = useColors();
  const { isRTL, fonts } = useI18n();
  return (
    <View style={styles.field}>
      <Text
        style={[
          styles.fieldLabel,
          {
            color: colors.foreground,
            fontFamily: fonts.medium,
            textAlign: isRTL ? 'right' : 'left',
          },
        ]}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        testID={testID}
        accessibilityLabel={label}
        style={[
          styles.input,
          multiline ? styles.notesInput : null,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.inputRadius,
            color: colors.foreground,
            fontFamily: fonts.regular,
            textAlign: isRTL ? 'right' : 'left',
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
    </View>
  );
}

export default function MatchingScreen() {
  const { requirementId: requestedRequirementId, returnSession } = useLocalSearchParams<{ requirementId?: string; returnSession?: string }>();
  const colors = useColors();
  const { t, isRTL, language, setLanguage, fonts } = useI18n();
  const router = useRouter();
  const insets = useScreenInsets();
  const topInset = insets.top;

  const [mode, setMode] = useState<MatchingMode>('saved');
  const [requirements, setRequirements] = useState<SeekerRequirement[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedSeekerId, setSelectedSeekerId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<RequirementPurpose>('rent');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartment');
  const [floorUse, setFloorUse] = useState<'residential' | 'commercial'>();
  const [apartmentSubtype, setApartmentSubtype] = useState<'studio' | 'standard_apartment' | 'duplex'>();
  const [preferredAreaIds, setPreferredAreaIds] = useState<string[]>([]);
  const [areaSearch, setAreaSearch] = useState('');
  const [minimumBudget, setMinimumBudget] = useState('500');
  const [maximumBudget, setMaximumBudget] = useState('2500');
  const [bedroomsMinimum, setBedroomsMinimum] = useState('');
  const [bathroomsMinimum, setBathroomsMinimum] = useState('');
  const [occupancy, setOccupancy] = useState<RequirementOccupancy | undefined>();
  const [swimmingPool, setSwimmingPool] = useState<boolean | undefined>();
  const [gym, setGym] = useState<boolean | undefined>();
  const [seaView, setSeaView] = useState<boolean | undefined>();
  const [centralAC, setCentralAC] = useState<boolean | undefined>();
  const [notes, setNotes] = useState('');
  const [runResult, setRunResult] = useState<BrokerMatchingRunResult | null>(null);
  const [quickRequirement, setQuickRequirement] = useState<SeekerRequirement | null>(null);
  const [matchAllGroups, setMatchAllGroups] = useState<MatchAllPersonGroup[] | null>(null);
  const [error, setError] = useState('');
  const [policies, setPolicies] = useState<Record<string, MatchingPolicy>>({});
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const runGenerationRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const restoreOffsetRef = useRef<number | null>(null);
  const openedReturnTokenRef = useRef<string | undefined>(undefined);
  const dismissedReturnTokenRef = useRef<string | undefined>(undefined);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);

  const seekerPeople = useMemo(
    () => people.filter(person => person.classifications.includes('seeker')),
    [people],
  );
  const visibleAreas = useMemo(
    () => searchAreas(areaSearch, KUWAIT_AREAS)
      .filter(area => !preferredAreaIds.includes(area.id))
      .slice(0, 8),
    [areaSearch, preferredAreaIds],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      runGenerationRef.current += 1;
      setLoading(false);
      setRunResult(null);
      setQuickRequirement(null);
      setMatchAllGroups(null);
      setError('');
      const restore = readMatchingReturn(openedReturnTokenRef.current)
        ?? (returnSession !== dismissedReturnTokenRef.current ? readMatchingReturn(returnSession) : undefined);
      setPolicies(restore?.policies ?? {});
      setExcluded(restore?.excluded ?? {});
      Promise.all([store.getRequirements(), store.getPeople(), store.getProperties()])
        .then(([loadedRequirements, loadedPeople, loadedProperties]) => {
          if (!active) return;
          setRequirements(validMatchingRequirements(loadedRequirements));
          setPeople(loadedPeople);
          setProperties(loadedProperties);
          if (requestedRequirementId) setMode('saved');
          if (restore) {
            setMode(restore.mode);
            restoreOffsetRef.current = restore.scrollOffset;
            const quick = restore.quickRequirement;
            if (quick) {
              setQuickRequirement(quick); setPurpose(quick.purpose); setPropertyType(quick.propertyType);
              setPreferredAreaIds([...quick.preferredAreaIds]); setMinimumBudget(String(quick.budget.minimum)); setMaximumBudget(String(quick.budget.maximum));
              setBedroomsMinimum(quick.bedroomsMinimum === undefined ? '' : String(quick.bedroomsMinimum)); setBathroomsMinimum(quick.bathroomsMinimum === undefined ? '' : String(quick.bathroomsMinimum));
              setCentralAC(quick.centralAC); setNotes(quick.notes); setFloorUse(quick.floorUse); setSelectedSeekerId(quick.seekerId ?? null);
              const subtype = quick.catalogPreferences?.find(item => item.field === 'apartmentSubtype' && item.kind === 'choice');
              setApartmentSubtype(subtype?.value as 'studio' | 'standard_apartment' | 'duplex' | undefined);
              if (quick.purpose === 'rent') { setOccupancy(quick.occupancy); setSwimmingPool(quick.swimmingPool); setGym(quick.gym); setSeaView(quick.seaView); }
            }
            setPendingRestore(restore.token);
          }

          const firstSeeker = loadedPeople.find(person =>
            person.classifications.includes('seeker'),
          );
          setSelectedSeekerId(current => current ?? firstSeeker?.id ?? null);
        })
        .catch(() => {
          if (active) setError(t('matching.load_failed'));
        });
      return () => {
        active = false;
        runGenerationRef.current += 1;
      };
    }, [requestedRequirementId, returnSession, t]),
  );

  const clearRun = () => {
    openedReturnTokenRef.current = undefined;
    dismissedReturnTokenRef.current = returnSession;
    runGenerationRef.current += 1;
    setLoading(false);
    setRunResult(null);
    setQuickRequirement(null);
    setMatchAllGroups(null);
    setError('');
  };

  const chooseMode = (nextMode: MatchingMode) => {
    setMode(nextMode);
    clearRun();
  };

  const chooseArea = (areaId: string) => {
    clearRun();
    setPreferredAreaIds(current => [...current, areaId]);
    setAreaSearch('');
  };

  const removeArea = (areaId: string) => {
    clearRun();
    setPreferredAreaIds(current => current.filter(id => id !== areaId));
  };

  const runMatching = async (exclusions = excluded, refinements = policies) => {
    const generation = ++runGenerationRef.current;
    setError('');
    setRunResult(null);
    setMatchAllGroups(null);
    setLoading(true);
    try {
      const candidateSource = new MyPropertiesMatchingSource(store);
      let matching: BrokerInitiatedMatching;

      if (mode === 'saved') {
        matching = new BrokerInitiatedMatching(store, candidateSource);
        const selected = requestedRequirementId ? requirements.filter(item => item.id === requestedRequirementId) : requirements;
        if (requestedRequirementId && selected.length !== 1) throw new Error('MATCHING_REQUIREMENT_NOT_FOUND');
        const runs = await runMatchingForAllRequirements(
          selected,
          requirementId => matching.runForRequirement(requirementId, refinements[requirementId], exclusions[requirementId]),
        );
        if (runs.some(run => run.engineVersion !== MATCH_ENGINE_VERSION)) throw new Error('STALE_MATCH_ENGINE');
        if (runGenerationRef.current === generation) {
          setMatchAllGroups(groupMatchAllResultsByPerson(selected, people, runs));
        }
        return;
      }

      if (propertyType === 'floor' && !floorUse || propertyType === 'apartment' && !apartmentSubtype) { setError(language === 'ar' ? 'حدد نوع الشقة أو استخدام الدور أولًا.' : 'Choose the apartment subtype or floor use first.'); return; }
      const transient = buildTransientRequirement({
        id: quickRequirement?.id ?? Crypto.randomUUID(),
        seekerId: selectedSeekerId ?? 'manual-seeker',
        purpose,
        propertyType,
        ...(propertyType === 'floor' ? { floorUse } : {}),
        ...(propertyType === 'apartment' ? { apartmentSubtype } : {}),
        preferredAreaIds,
        minimumBudget: numberFromInput(minimumBudget),
        maximumBudget: numberFromInput(maximumBudget),
        notes,
        bedroomsMinimum: (['apartment', 'house', 'villa', 'chalet'].includes(propertyType) || propertyType === 'floor' && floorUse === 'residential') && apartmentSubtype !== 'studio' ? numberFromInput(bedroomsMinimum) : undefined,
        bathroomsMinimum: (['apartment', 'house', 'villa', 'chalet'].includes(propertyType) || propertyType === 'floor' && floorUse === 'residential') ? numberFromInput(bathroomsMinimum) : undefined,
        occupancy,
        swimmingPool,
        gym,
        seaView,
        centralAC,
      });
      if (!transient.ok) {
        setError(t('matching.validation'));
        return;
      }

      const transientStore = {
        getRequirement: async (id: string) =>
          id === transient.value.id ? transient.value : null,
      };
      matching = new BrokerInitiatedMatching(transientStore, candidateSource);
      const result = await matching.runForRequirement(transient.value.id, refinements[transient.value.id], exclusions[transient.value.id]);
      if (result.engineVersion !== MATCH_ENGINE_VERSION) throw new Error('STALE_MATCH_ENGINE');
      if (runGenerationRef.current === generation) {
        setQuickRequirement(transient.value);
        setRunResult(result);
      }
    } catch (runError) {
      console.error(runError);
      if (runGenerationRef.current === generation) setError(t('matching.run_failed'));
    } finally {
      if (runGenerationRef.current === generation) setLoading(false);
    }
  };

  useEffect(() => {
    if (!pendingRestore) return;
    setPendingRestore(null);
    void runMatching();
  }, [pendingRestore]);

  const replaceSuggestion = (requirementId: string, propertyId: string) => {
    if (loading) return;
    const next = { ...excluded, [requirementId]: [...(excluded[requirementId] ?? []), propertyId] };
    setExcluded(next); void runMatching(next);
  };
  const refine = (requirementId: string, policy: MatchingPolicy) => {
    if (loading) return;
    const next = { ...policies, [requirementId]: policy };
    setPolicies(next); void runMatching(excluded, next);
  };

  const openMatchedProperty = async (propertyId: string) => {
    try {
      if (!await store.getProperty(propertyId)) {
        setError(t('matching.property_missing'));
        setRunResult(null);
        setQuickRequirement(null);
        setMatchAllGroups(null);
        return;
      }
      const token = rememberMatchingReturn({ scopeRequirementId: requestedRequirementId, mode, quickRequirement: quickRequirement ?? undefined, policies, excluded, scrollOffset: scrollOffsetRef.current });
      openedReturnTokenRef.current = token;
      router.push({ pathname: '/property/[propertyCoreId]', params: { propertyCoreId: propertyId, matchingReturn: token } } as never);
    } catch {
      setError(t('matching.load_failed'));
    }
  };

  const toggleLanguage = () => setLanguage(language === 'en' ? 'ar' : 'en');
  const selectedAreas = preferredAreaIds
    .map(id => getAreaById(id))
    .filter((area): area is NonNullable<typeof area> => area !== undefined);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PrimaryTabHeader title={t('matching.title')} />
      <KeyboardAwareScrollViewCompat
        ref={scrollRef}
        onScroll={event => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
        onContentSizeChange={() => { if (restoreOffsetRef.current !== null && (matchAllGroups || runResult)) { const y = restoreOffsetRef.current; restoreOffsetRef.current = null; requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false })); } }}
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 112,
          paddingHorizontal: 20,
        }}
        bottomOffset={72}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.subtitle')}
            </Text>
          </View>
        </View>

        <View style={[styles.modeSwitch, { backgroundColor: colors.muted }]}>
          <TouchableOpacity
            onPress={() => chooseMode('saved')}
            style={[styles.modeButton, mode === 'saved' ? { backgroundColor: colors.card } : null]}
            testID="matching-mode-saved"
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'saved' }}
          >
            <Text style={[styles.modeText, { color: mode === 'saved' ? colors.primary : colors.mutedForeground, fontFamily: fonts.semiBold }]}>
              {t('matching.mode.saved')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => chooseMode('quick')}
            style={[styles.modeButton, mode === 'quick' ? { backgroundColor: colors.card } : null]}
            testID="matching-mode-quick"
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'quick' }}
          >
            <Text style={[styles.modeText, { color: mode === 'quick' ? colors.primary : colors.mutedForeground, fontFamily: fonts.semiBold }]}>
              {t('matching.mode.quick')}
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'saved' ? (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
              {requestedRequirementId ? (language === 'ar' ? 'أفضل ترشيحات هذا الطلب' : 'Best suggestions for this request') : t('matching.saved.matchAllTitle')}
            </Text>
            <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {requirements.length
                ? t('matching.saved.matchAllDescription')
                : t('matching.saved.empty')}
            </Text>
          </View>
        ) : (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.quick.title')}
            </Text>
            <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.quick.description')}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.seeker')}
            </Text>
            {seekerPeople.length ? seekerPeople.map(person => (
              <SelectCard
                key={person.id}
                title={person.name}
                icon="user"
                selected={selectedSeekerId === person.id}
                onSelect={() => {
                  clearRun();
                  setSelectedSeekerId(person.id);
                }}
                testID={`matching-seeker-${person.id}`}
              />
            )) : (
              <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
                {t('matching.seeker.fallback')}
              </Text>
            )}

            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.purpose')}
            </Text>
            <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {(['rent', 'buy'] as const).map(value => (
                <ChoiceChip
                  key={value}
                  label={t(`matching.purpose.${value}`)}
                  selected={purpose === value}
                  onPress={() => {
                    clearRun();
                    setPurpose(value);
                  }}
                  testID={`matching-purpose-${value}`}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.propertyType')}
            </Text>
            <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {PROPERTY_TYPES.map(value => (
                <ChoiceChip
                  key={value}
                  label={t(`propertyType.${value}`)}
                  selected={propertyType === value}
                  onPress={() => {
                    clearRun();
                    setPropertyType(value); setFloorUse(undefined); setApartmentSubtype(undefined); setBedroomsMinimum(''); setBathroomsMinimum(''); setOccupancy(undefined); setSwimmingPool(undefined); setGym(undefined); setSeaView(undefined); setCentralAC(undefined);
                  }}
                  testID={`matching-property-type-${value}`}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.areas')}
            </Text>
            {propertyType === 'apartment' && <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>{(['studio', 'standard_apartment', 'duplex'] as const).map(value => <ChoiceChip key={value} label={t(`enrich.apartment_subtype.${value}`)} selected={apartmentSubtype === value} onPress={() => { clearRun(); setApartmentSubtype(value); setBedroomsMinimum(''); }} testID={`matching-subtype-${value}`} />)}</View>}
            {propertyType === 'floor' && <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>{(['residential', 'commercial'] as const).map(value => <ChoiceChip key={value} label={t(`enrich.${value}`)} selected={floorUse === value} onPress={() => { clearRun(); setFloorUse(value); setBedroomsMinimum(''); setBathroomsMinimum(''); setOccupancy(undefined); setSwimmingPool(undefined); setGym(undefined); setSeaView(undefined); setCentralAC(undefined); }} testID={`matching-floor-use-${value}`} />)}</View>}
            {selectedAreas.length ? (
              <View style={[styles.selectedAreaRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {selectedAreas.map((area, index) => (
                  <TouchableOpacity
                    key={area.id}
                    onPress={() => removeArea(area.id)}
                    style={[styles.selectedArea, { backgroundColor: colors.accent }]}
                    testID={`matching-selected-area-${area.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${index + 1}. ${language === 'ar' ? area.ar : area.en}`}
                  >
                    <Text style={[styles.selectedAreaText, { color: colors.primary, fontFamily: fonts.medium }]}>
                      {language === 'ar' ? area.ar : area.en}
                    </Text>
                    <Feather name="x" size={14} color={colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <TextInput
              value={areaSearch}
              onChangeText={value => {
                clearRun();
                setAreaSearch(value);
              }}
              placeholder={t('matching.areas.search')}
              placeholderTextColor={colors.mutedForeground}
              testID="matching-area-search"
              accessibilityLabel={t('matching.areas.search')}
              style={[styles.input, styles.areaInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.inputRadius, color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}
            />
            <View style={[styles.areaOptions, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {visibleAreas.map(area => (
                <TouchableOpacity
                  key={area.id}
                  onPress={() => chooseArea(area.id)}
                  style={[styles.areaOption, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                  testID={`matching-area-${area.id}`}
                  accessibilityRole="button"
                >
                  <Text style={[styles.areaOptionText, { color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
                    {language === 'ar' ? area.ar : area.en}
                  </Text>
                  <Feather name="plus" size={17} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.areas.hint')}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.budget')}
            </Text>
            <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.halfField}>
                <FormInput label={t('matching.budget.min')} value={minimumBudget} onChangeText={value => { clearRun(); setMinimumBudget(value); }} testID="matching-input-min" keyboardType="numeric" />
              </View>
              <View style={styles.halfField}>
                <FormInput label={t('matching.budget.max')} value={maximumBudget} onChangeText={value => { clearRun(); setMaximumBudget(value); }} testID="matching-input-max" keyboardType="numeric" />
              </View>
            </View>

            {(['apartment', 'house', 'villa', 'chalet'].includes(propertyType) || propertyType === 'floor' && floorUse === 'residential') ? (
              <View>
                <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
                  {language === 'ar' ? 'المواصفات' : 'Specifications'}
                </Text>
                <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={styles.halfField}>
                    {apartmentSubtype !== 'studio' && <FormInput label={t('matching.bedrooms')} value={bedroomsMinimum} onChangeText={value => { clearRun(); setBedroomsMinimum(value); }} testID="matching-input-bedrooms" keyboardType="numeric" />}
                  </View>
                  <View style={styles.halfField}>
                    <FormInput label={t('matching.bathrooms')} value={bathroomsMinimum} onChangeText={value => { clearRun(); setBathroomsMinimum(value); }} testID="matching-input-bathrooms" keyboardType="numeric" />
                  </View>
                </View>
                <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('matching.occupancy')}
                </Text>
                <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {(purpose === 'rent' ? ['family', 'bachelor', 'any'] as const : []).map(value => (
                    <ChoiceChip
                      key={value}
                      label={t(`matching.occupancy.${value}`)}
                      selected={occupancy === value}
                      onPress={() => {
                        clearRun();
                        setOccupancy(current => current === value ? undefined : value);
                      }}
                      testID={`matching-occupancy-${value}`}
                    />
                  ))}
                </View>
                <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('matching.services')}
                </Text>
                <View style={styles.serviceList}>
                  {([
                    ['pool', swimmingPool, setSwimmingPool],
                    ['gym', gym, setGym],
                    ['seaView', seaView, setSeaView],
                    ['centralAC', centralAC, setCentralAC],
                  ] as const).filter(([key]) => purpose === 'rent' || key === 'centralAC').map(([key, value, setter]) => (
                    <View key={key} style={[styles.serviceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <Text style={[styles.serviceLabel, { color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
                        {t(`matching.service.${key}`)}
                      </Text>
                      <View style={[styles.serviceChoices, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                        {([
                          ['any', undefined],
                          ['yes', true],
                          ['no', false],
                        ] as const).map(([option, optionValue]) => (
                          <ChoiceChip
                            key={option}
                            label={t(`matching.option.${option}`)}
                            selected={value === optionValue}
                            onPress={() => {
                              clearRun();
                              setter(optionValue);
                            }}
                            testID={`matching-service-${key}-${option}`}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <FormInput
              label={t('matching.notes')}
              value={notes}
              onChangeText={value => {
                clearRun();
                setNotes(value);
              }}
              placeholder={t('matching.notes.placeholder')}
              testID="matching-input-notes"
              multiline
            />
          </View>
        )}

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.destructive }]} testID="matching-error">
            <Feather name="alert-circle" size={18} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          title={loading
            ? t('matching.running')
            : mode === 'saved' && !requestedRequirementId ? t('matching.runAll') : t('matching.run')}
          onPress={() => void runMatching()}
          loading={loading}
          disabled={loading}
          style={styles.runButton}
          testID="matching-run"
        />

        {matchAllGroups ? (
          <View style={styles.resultsSection} testID="matching-results">
            <View style={[styles.resultsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.resultsCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('matching.results.groupedTitle')}
                </Text>
                <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
                  {language === 'ar' ? `جاهز للعرض: ${matchAllGroups.reduce((sum, group) => sum + group.requirementGroups.reduce((n, item) => n + item.matches.length, 0), 0)} · يحتاج تأكيد: ${matchAllGroups.reduce((sum, group) => sum + group.requirementGroups.reduce((n, item) => n + item.needsConfirmation.length, 0), 0)}` : `Ready: ${matchAllGroups.reduce((sum, group) => sum + group.requirementGroups.reduce((n, item) => n + item.matches.length, 0), 0)} · Needs confirmation: ${matchAllGroups.reduce((sum, group) => sum + group.requirementGroups.reduce((n, item) => n + item.needsConfirmation.length, 0), 0)}`}
                </Text>
              </View>
              <TouchableOpacity onPress={clearRun} testID="matching-clear" accessibilityRole="button">
                <Text style={[styles.clearText, { color: colors.primary, fontFamily: fonts.semiBold }]}>
                  {t('matching.clear')}
                </Text>
              </TouchableOpacity>
            </View>
            {matchAllGroups.length ? matchAllGroups.map(group => (
              <View key={group.person.id} style={styles.personGroup} testID={`matching-person-group-${group.person.id}`}>
                <TouchableOpacity
                  onPress={() => router.push(`/person/${encodeURIComponent(group.person.id)}`)}
                  accessibilityRole="button"
                  testID={`matching-person-${group.person.id}`}
                  style={[styles.personHeader, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1, borderRadius: colors.cardRadius }]}
                >
                  <Text style={[styles.personName, { color: '#173F78', fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
                    {group.person.name}
                  </Text>
                  <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.primary} />
                </TouchableOpacity>
                {group.requirementGroups.map(requirementGroup => <View key={requirementGroup.requirement.id} style={{ gap: 10 }}>
                  <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{t(`matching.purpose.${requirementGroup.requirement.purpose}`)} · {t(`propertyType.${requirementGroup.requirement.propertyType}`)} · {requirementGroup.requirement.budget.minimum}–{requirementGroup.requirement.budget.maximum} {requirementGroup.requirement.budget.currencyCode}</Text>
                  <Text style={{ color: colors.mutedForeground }}>{requirementGroup.requirement.preferredAreaMode === 'all_kuwait' ? (language === 'ar' ? 'كل الكويت' : 'All Kuwait') : requirementGroup.requirement.preferredAreaIds.map(id => getAreaById(id)?.[language] ?? (language === 'ar' ? 'منطقة غير معروفة' : 'Unknown area')).join(' · ')}</Text>
                  <MatchingRefinements requirement={requirementGroup.requirement} policy={policies[requirementGroup.requirement.id] ?? {}} busy={loading} onChange={policy => refine(requirementGroup.requirement.id, policy)} />
                  {requirementGroup.matches.map((result, index) => <ResultCard key={result.propertyId} result={result} rank={index + 1} requirement={requirementGroup.requirement} personName={group.person.name} onViewRequirement={() => router.push({ pathname: '/requirement/view/[requirementId]', params: { requirementId: requirementGroup.requirement.id } } as never)} property={properties.find(item => item.core.id === result.propertyId)} onPress={() => void openMatchedProperty(result.propertyId)} onReplace={() => replaceSuggestion(requirementGroup.requirement.id, result.propertyId)} busy={loading} />)}
                  {!requirementGroup.matches.length && <Text style={{ color: colors.mutedForeground }}>{language === 'ar' ? 'لا توجد ترشيحات جاهزة تستوفي شروط هذه المقارنة.' : 'No ready suggestions meet this comparison’s conditions.'}</Text>}
                  <MatchingConfirmationList count={requirementGroup.needsConfirmation.length}>
                    {requirementGroup.needsConfirmation.map((result, index) => <ResultCard key={result.propertyId} result={result} rank={index + 1} requirement={requirementGroup.requirement} personName={group.person.name} onViewRequirement={() => router.push({ pathname: '/requirement/view/[requirementId]', params: { requirementId: requirementGroup.requirement.id } } as never)} property={properties.find(item => item.core.id === result.propertyId)} onPress={() => void openMatchedProperty(result.propertyId)} busy={loading} />)}
                  </MatchingConfirmationList>
                </View>)}
              </View>
            )) : (
              <View style={[styles.zeroState, { backgroundColor: colors.card, borderColor: colors.border }]} testID="matching-zero-results">
                <Feather name="search" size={38} color={colors.mutedForeground} />
                <Text style={[styles.zeroTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: 'center' }]}>
                  {t('matching.results.emptyTitle')}
                </Text>
                <Text style={[styles.zeroBody, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: 'center' }]}>
                  {t('matching.results.emptyAllBody')}
                </Text>
              </View>
            )}
            <Text style={[styles.transientNote, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.results.transient')}
            </Text>
          </View>
        ) : runResult && quickRequirement ? (
          <View style={styles.resultsSection} testID="matching-results">
            <View style={[styles.resultsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.resultsCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('matching.results.title')}
                </Text>
                <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
                  {language === 'ar' ? `جاهز للعرض: ${runResult.matches.length} · يحتاج تأكيد: ${runResult.needsConfirmation.length}` : `Ready: ${runResult.matches.length} · Needs confirmation: ${runResult.needsConfirmation.length}`}
                </Text>
              </View>
              <TouchableOpacity onPress={clearRun} testID="matching-clear" accessibilityRole="button">
                <Text style={[styles.clearText, { color: colors.primary, fontFamily: fonts.semiBold }]}>
                  {t('matching.clear')}
                </Text>
              </TouchableOpacity>
            </View>
            <MatchingRefinements requirement={quickRequirement} policy={policies[quickRequirement.id] ?? {}} busy={loading} onChange={policy => refine(quickRequirement.id, policy)} />
            {runResult.matches.length ? (
              runResult.matches.map((result, index) => (
                <ResultCard
                  key={result.propertyId}
                  result={result}
                  rank={index + 1}
                  requirement={quickRequirement} personName={people.find(person => person.id === quickRequirement.seekerId)?.name}
                  property={properties.find(item => item.core.id === result.propertyId)}
                  onPress={() => void openMatchedProperty(result.propertyId)}
                  onReplace={() => replaceSuggestion(quickRequirement.id, result.propertyId)} busy={loading}
                />
              ))
            ) : (
              <View style={[styles.zeroState, { backgroundColor: colors.card, borderColor: colors.border }]} testID="matching-zero-results">
                <Feather name="search" size={38} color={colors.mutedForeground} />
                <Text style={[styles.zeroTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: 'center' }]}>
                  {t('matching.results.emptyTitle')}
                </Text>
                <Text style={[styles.zeroBody, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: 'center' }]}>
                  {t('matching.results.emptyBody')}
                </Text>
              </View>
            )}
            <MatchingConfirmationList count={runResult.needsConfirmation.length}>
              {runResult.needsConfirmation.map((result, index) => <ResultCard key={result.propertyId} result={result} rank={index + 1} requirement={quickRequirement} personName={people.find(person => person.id === quickRequirement.seekerId)?.name} property={properties.find(item => item.core.id === result.propertyId)} onPress={() => void openMatchedProperty(result.propertyId)} busy={loading} />)}
            </MatchingConfirmationList>
            <Text style={[styles.transientNote, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.results.transient')}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.thresholdNote, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
          {language === 'ar' ? 'حتى ٥ ترشيحات لكل طلب؛ لا نملأ القائمة بنتائج ضعيفة. النتائج مؤقتة وتُعاد قراءتها عند التشغيل.' : 'Up to 5 suggestions per request; weak results do not fill empty places. Re-run to refresh recorded facts.'}
        </Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  header: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 28, lineHeight: 34 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  langButton: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  modeSwitch: { flexDirection: 'row', borderRadius: 12, padding: 4, marginTop: 20, marginBottom: 22 },
  modeButton: { flex: 1, alignItems: 'center', borderRadius: 9, paddingVertical: 12 },
  modeText: { fontSize: 13 },
  sectionTitle: { fontSize: 19, lineHeight: 25, marginBottom: 5 },
  helper: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  fieldLabel: { fontSize: 15, lineHeight: 21, marginTop: 16, marginBottom: 8 },
  chipRow: { flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10 },
  chipText: { fontSize: 14 },
  field: { flex: 1, marginBottom: 4 },
  input: { minHeight: 50, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  notesInput: { minHeight: 82, paddingTop: 13 },
  inputRow: { gap: 10 },
  halfField: { flex: 1 },
  areaInput: { marginBottom: 2 },
  areaOptions: { borderWidth: 1, borderTopWidth: 0 },
  areaOption: { alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 13, borderBottomWidth: 1 },
  areaOptionText: { flex: 1, fontSize: 14 },
  selectedAreaRow: { flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  selectedArea: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7 },
  selectedAreaText: { fontSize: 13 },
  errorBox: { alignItems: 'center', borderWidth: 1, borderRadius: 12, flexDirection: 'row', gap: 9, marginTop: 18, padding: 12 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  runButton: { marginTop: 22 },
  resultsSection: { marginTop: 28 },
  resultsHeader: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  resultsCopy: { flex: 1 },
  clearText: { fontSize: 13, paddingTop: 4 },
  resultCard: { borderWidth: 1, marginBottom: 12, padding: 15 },
  resultTop: { alignItems: 'center', gap: 11 },
  rankBadge: { alignItems: 'center', borderRadius: 20, height: 38, justifyContent: 'center', width: 38 },
  rankNumber: { fontSize: 17 },
  resultIdentity: { flex: 1 },
  resultLabel: { fontSize: 11, lineHeight: 15 },
  propertyId: { fontSize: 15, lineHeight: 21, marginTop: 1 },
  propertySummary: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  requirementContext: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  scoreBlock: { alignItems: 'flex-end' },
  score: { fontSize: 21, lineHeight: 26 },
  personGroup: { marginBottom: 16 },
  personHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, padding: 14 },
  personName: { flex: 1, fontSize: 18, lineHeight: 24 },
  explanationHeader: { alignItems: 'center', borderTopWidth: 1, gap: 7, marginTop: 14, paddingTop: 12 },
  explanationTitle: { fontSize: 13 },
  explanations: { gap: 8, marginTop: 10 },
  explanationRow: { alignItems: 'center', gap: 7 },
  statusDot: { borderRadius: 4, height: 8, width: 8 },
  explanationText: { flex: 1, fontSize: 13, lineHeight: 18 },
  points: { fontSize: 12 },
  zeroState: { alignItems: 'center', borderRadius: 16, borderWidth: 1, gap: 9, paddingHorizontal: 20, paddingVertical: 28 },
  zeroTitle: { fontSize: 17, marginTop: 3 },
  zeroBody: { fontSize: 13, lineHeight: 19, maxWidth: 290 },
  transientNote: { fontSize: 12, lineHeight: 17, marginTop: 14 },
  thresholdNote: { fontSize: 12, lineHeight: 17, marginTop: 22 },
  serviceList: { gap: 10 },
  serviceRow: { alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  serviceLabel: { flex: 1, fontSize: 14 },
  serviceChoices: { gap: 6 },
});
