import { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MATCH_QUALIFICATION_THRESHOLD,
  PROPERTY_TYPES,
  type MatchExplanation,
  type MatchResult,
  type MatchCriterion,
  type PropertyType,
  type RequirementOccupancy,
  type RequirementPurpose,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { SelectCard } from '@/components/SelectCard';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { KUWAIT_AREAS, getAreaById, searchAreas } from '@/constants/kuwait-areas';
import { store } from '@/services/persistence';
import { MyPropertiesMatchingSource } from '@/services/myPropertiesMatchingSource';
import {
  BrokerInitiatedMatching,
  type BrokerMatchingRunResult,
} from '@/services/brokerInitiatedMatching';
import { buildTransientRequirement } from '@/services/matchingUi';
import type { Person } from '@/services/people';

type MatchingMode = 'saved' | 'quick';

const CRITERION_KEYS: Record<MatchCriterion, string> = {
  eligibility: 'matching.criteria.eligibility',
  budget: 'matching.criteria.budget',
  ordered_location: 'matching.criteria.ordered_location',
  bedrooms: 'matching.criteria.bedrooms',
  bathrooms: 'matching.criteria.bathrooms',
  occupancy: 'matching.criteria.occupancy',
  swimming_pool: 'matching.criteria.swimming_pool',
  gym: 'matching.criteria.gym',
  sea_view: 'matching.criteria.sea_view',
  central_ac: 'matching.criteria.central_ac',
};

function numberFromInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

function scoreLabel(score: number, language: 'en' | 'ar'): string {
  return `${score.toLocaleString(language === 'ar' ? 'ar-KW' : 'en-US', {
    maximumFractionDigits: 2,
  })}%`;
}

function explanationStatusLabel(
  status: MatchExplanation['status'],
  t: (key: string) => string,
): string {
  if (status === 'unknown') return t('matching.results.unknown');
  if (status === 'matched') return t('matching.results.matched');
  return t('matching.results.notMet');
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
          backgroundColor: selected ? colors.accent : colors.card,
          borderColor: selected ? colors.turquoise : colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: selected ? colors.primary : colors.foreground,
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

function ResultCard({
  result,
  rank,
}: {
  result: MatchResult;
  rank: number;
}) {
  const colors = useColors();
  const { t, isRTL, language, fonts } = useI18n();
  return (
    <View
      style={[
        styles.resultCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.cardRadius,
        },
      ]}
      testID={`matching-result-${result.propertyId}`}
    >
      <View style={[styles.resultTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.rankBadge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.rankNumber, { color: colors.primary, fontFamily: fonts.bold }]}>
            {rank}
          </Text>
        </View>
        <View style={styles.resultIdentity}>
          <Text style={[styles.resultLabel, { color: colors.mutedForeground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('matching.results.property')}
          </Text>
          <Text style={[styles.propertyId, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
            {result.propertyId}
          </Text>
        </View>
        <View style={styles.scoreBlock}>
          <Text style={[styles.score, { color: colors.primary, fontFamily: fonts.bold }]}>
            {scoreLabel(result.score, language)}
          </Text>
          <Text style={[styles.resultLabel, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>
            {t('matching.results.score')}
          </Text>
        </View>
      </View>

      <View style={[styles.explanationHeader, { borderTopColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Feather name="list" size={16} color={colors.turquoise} />
        <Text style={[styles.explanationTitle, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
          {t('matching.results.explanation')}
        </Text>
      </View>
      <View style={styles.explanations}>
        {result.explanations.map((explanation, index) => {
          const statusColor = explanation.status === 'unknown'
            ? colors.warning
            : explanation.status === 'matched'
              ? colors.turquoise
              : colors.mutedForeground;
          const criterion = t(CRITERION_KEYS[explanation.criterion]);
          const status = explanationStatusLabel(explanation.status, t);
          return (
            <View
              key={`${explanation.criterion}-${index}`}
              style={[styles.explanationRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.explanationText, { color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
                {criterion}: {status}
              </Text>
              <Text style={[styles.points, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>
                {explanation.awardedPoints}/{explanation.possiblePoints}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function MatchingScreen() {
  const colors = useColors();
  const { t, isRTL, language, setLanguage, fonts } = useI18n();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  const [mode, setMode] = useState<MatchingMode>('saved');
  const [requirements, setRequirements] = useState<SeekerRequirement[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null);
  const [selectedSeekerId, setSelectedSeekerId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<RequirementPurpose>('rent');
  const [propertyType, setPropertyType] = useState<PropertyType>('apartment');
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      Promise.all([store.getRequirements(), store.getPeople()])
        .then(([loadedRequirements, loadedPeople]) => {
          if (!active) return;
          setRequirements(loadedRequirements);
          setPeople(loadedPeople);
          setSelectedRequirementId(current =>
            current ?? loadedRequirements[0]?.id ?? null,
          );
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
      };
    }, [t]),
  );

  const clearRun = () => {
    setRunResult(null);
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

  const runMatching = async () => {
    setError('');
    setRunResult(null);
    setLoading(true);
    try {
      const candidateSource = new MyPropertiesMatchingSource(store);
      let matching: BrokerInitiatedMatching;

      if (mode === 'saved') {
        if (!selectedRequirementId) {
          setError(t('matching.validation'));
          return;
        }
        matching = new BrokerInitiatedMatching(store, candidateSource);
        setRunResult(await matching.runForRequirement(selectedRequirementId));
        return;
      }

      const transient = buildTransientRequirement({
        id: Crypto.randomUUID(),
        seekerId: selectedSeekerId ?? 'manual-seeker',
        purpose,
        propertyType,
        preferredAreaIds,
        minimumBudget: numberFromInput(minimumBudget),
        maximumBudget: numberFromInput(maximumBudget),
        notes,
        bedroomsMinimum: numberFromInput(bedroomsMinimum),
        bathroomsMinimum: numberFromInput(bathroomsMinimum),
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
      setRunResult(await matching.runForRequirement(transient.value.id));
    } catch (runError) {
      console.error(runError);
      setError(t('matching.run_failed'));
    } finally {
      setLoading(false);
    }
  };

  const toggleLanguage = () => setLanguage(language === 'en' ? 'ar' : 'en');
  const selectedAreas = preferredAreaIds
    .map(id => getAreaById(id))
    .filter((area): area is NonNullable<typeof area> => area !== undefined);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: topInset + 16,
          paddingBottom: insets.bottom + 112,
          paddingHorizontal: 20,
        }}
        bottomOffset={72}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.title')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.subtitle')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={toggleLanguage}
            style={[styles.langButton, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={language === 'en' ? 'عربي' : 'EN'}
            testID="matching-language-toggle"
          >
            <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>
              {language === 'en' ? 'عربي' : 'EN'}
            </Text>
          </TouchableOpacity>
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
              {t('matching.saved.title')}
            </Text>
            <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {requirements.length ? t('matching.saved.select') : t('matching.saved.empty')}
            </Text>
            {requirements.map(requirement => {
              const seeker = people.find(person => person.id === requirement.seekerId);
              const firstArea = getAreaById(requirement.preferredAreaIds[0] ?? '');
              const areaName = firstArea
                ? language === 'ar' ? firstArea.ar : firstArea.en
                : requirement.preferredAreaIds[0];
              return (
                <SelectCard
                  key={requirement.id}
                  title={`${seeker?.name ?? requirement.seekerId} · ${t(`propertyType.${requirement.propertyType}`)} · ${areaName}`}
                  icon="user"
                  selected={selectedRequirementId === requirement.id}
                  onSelect={() => {
                    clearRun();
                    setSelectedRequirementId(requirement.id);
                  }}
                  testID={`matching-requirement-${requirement.id}`}
                />
              );
            })}
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
                    setPropertyType(value);
                  }}
                  testID={`matching-property-type-${value}`}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.areas')}
            </Text>
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
                      {index + 1}. {language === 'ar' ? area.ar : area.en}
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

            {purpose === 'rent' ? (
              <View>
                <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('matching.rentDetails')}
                </Text>
                <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={styles.halfField}>
                    <FormInput label={t('matching.bedrooms')} value={bedroomsMinimum} onChangeText={value => { clearRun(); setBedroomsMinimum(value); }} testID="matching-input-bedrooms" keyboardType="numeric" />
                  </View>
                  <View style={styles.halfField}>
                    <FormInput label={t('matching.bathrooms')} value={bathroomsMinimum} onChangeText={value => { clearRun(); setBathroomsMinimum(value); }} testID="matching-input-bathrooms" keyboardType="numeric" />
                  </View>
                </View>
                <Text style={[styles.fieldLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('matching.occupancy')}
                </Text>
                <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {(['family', 'bachelor', 'any'] as const).map(value => (
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
                  ] as const).map(([key, value, setter]) => (
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
          title={loading ? t('matching.running') : t('matching.run')}
          onPress={runMatching}
          loading={loading}
          disabled={loading}
          style={styles.runButton}
          testID="matching-run"
        />

        {runResult ? (
          <View style={styles.resultsSection} testID="matching-results">
            <View style={[styles.resultsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.resultsCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('matching.results.title')}
                </Text>
                <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('matching.results.count').replace('{count}', String(runResult.matches.length))}
                </Text>
              </View>
              <TouchableOpacity onPress={clearRun} testID="matching-clear" accessibilityRole="button">
                <Text style={[styles.clearText, { color: colors.primary, fontFamily: fonts.semiBold }]}>
                  {t('matching.clear')}
                </Text>
              </TouchableOpacity>
            </View>
            {runResult.matches.length ? (
              runResult.matches.map((result, index) => (
                <ResultCard key={result.propertyId} result={result} rank={index + 1} />
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
            <Text style={[styles.transientNote, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.results.transient')}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.thresholdNote, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('matching.results.score')}: ≥ {MATCH_QUALIFICATION_THRESHOLD}%
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
  scoreBlock: { alignItems: 'flex-end' },
  score: { fontSize: 21, lineHeight: 26 },
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