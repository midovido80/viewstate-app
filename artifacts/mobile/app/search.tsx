import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { getAreaById } from '@/constants/kuwait-areas';
import { useI18n, type Translations } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { searchGlobalData, type GlobalSearchData } from '@/services/globalSearch';
import type { Person } from '@/services/people';
import { store } from '@/services/persistence';

type SearchState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: GlobalSearchData }
  | { readonly status: 'error' };

interface ResultCardProps {
  readonly icon: keyof typeof Feather.glyphMap;
  readonly title: string;
  readonly subtitle: string;
  readonly testID: string;
  readonly onPress: () => void;
}

function ResultCard({ icon, title, subtitle, testID, onPress }: ResultCardProps) {
  const colors = useColors();
  const { isRTL, fonts } = useI18n();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.cardRadius,
          flexDirection: isRTL ? 'row-reverse' : 'row',
        },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: `${colors.primary}12` }]}>
        <Feather name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.cardCopy}>
        <Text
          numberOfLines={1}
          style={[
            styles.cardTitle,
            { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' },
          ]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={2}
          style={[
            styles.cardSubtitle,
            { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' },
          ]}
        >
          {subtitle}
        </Text>
      </View>
      <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function propertyAreaLabel(
  property: Property,
  language: 'en' | 'ar',
  t: (key: keyof Translations) => string,
) {
  const area = getAreaById(property.core.locationArea.id);
  return area ? (language === 'ar' ? area.ar : area.en) : t('search.area_unknown');
}

function requirementSubtitle(
  requirement: SeekerRequirement,
  language: 'en' | 'ar',
  t: (key: keyof Translations) => string,
) {
  const areaLabels = requirement.preferredAreaIds.map(areaId => {
    const area = getAreaById(areaId);
    return area ? (language === 'ar' ? area.ar : area.en) : t('search.area_unknown');
  });
  return [
    t(`requirements.purpose.${requirement.purpose}` as keyof Translations),
    t(`propertyType.${requirement.propertyType}` as keyof Translations),
    ...areaLabels,
  ].join(' · ');
}

export default function GlobalSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { t, isRTL, fonts, language } = useI18n();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'loading' });
  const [notice, setNotice] = useState('');
  const loadGenerationRef = useRef(0);

  const loadRecords = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setState({ status: 'loading' });
    try {
      const [people, properties, requirements] = await Promise.all([
        store.getPeople(),
        store.getProperties(),
        store.getRequirements(),
      ]);
      if (loadGenerationRef.current === generation) {
        setState({ status: 'ready', data: { people, properties, requirements } });
      }
    } catch {
      if (loadGenerationRef.current === generation) setState({ status: 'error' });
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadRecords();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [loadRecords]));

  const results = useMemo(
    () => state.status === 'ready' ? searchGlobalData(state.data, query) : null,
    [query, state],
  );
  const hasQuery = query.trim().length > 0;
  const hasResults = !!results && (
    results.people.length + results.properties.length + results.requirements.length > 0
  );

  const recordMissing = () => {
    setNotice(t('search.record_missing'));
    void loadRecords();
  };

  const openPerson = async (person: Person) => {
    setNotice('');
    try {
      if (!await store.getPerson(person.id)) return recordMissing();
      router.push(`/person/${encodeURIComponent(person.id)}` as never);
    } catch {
      setState({ status: 'error' });
    }
  };

  const openProperty = async (property: Property) => {
    setNotice('');
    try {
      if (!await store.getProperty(property.core.id)) return recordMissing();
      router.push(`/property/${encodeURIComponent(property.core.id)}` as never);
    } catch {
      setState({ status: 'error' });
    }
  };

  const openRequirement = async (requirement: SeekerRequirement, seeker: Person | undefined) => {
    setNotice('');
    try {
      if (!seeker || !await store.getRequirement(requirement.id) || !await store.getPerson(seeker.id)) {
        return recordMissing();
      }
      router.push({
        pathname: '/requirement/[requirementId]',
        params: { requirementId: requirement.id, seekerId: seeker.id },
      } as never);
    } catch {
      setState({ status: 'error' });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('capture.back')}
          testID="search-back"
          style={styles.backButton}
        >
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>
          {t('search.title')}
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <Feather
          name="search"
          size={20}
          color={colors.mutedForeground}
          style={[styles.searchIcon, isRTL ? { right: 36 } : { left: 36 }]}
        />
        <TextInput
          autoFocus
          value={query}
          onChangeText={value => {
            setQuery(value);
            setNotice('');
          }}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={t('search.placeholder')}
          testID="global-search-input"
          returnKeyType="search"
          style={[
            styles.input,
            {
              color: colors.foreground,
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.inputRadius,
              fontFamily: fonts.regular,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        />
        {query.length ? (
          <TouchableOpacity
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel={t('matching.clear')}
            testID="global-search-clear"
            style={[styles.clearButton, isRTL ? { left: 32 } : { right: 32 }]}
          >
            <Feather name="x-circle" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        {notice ? (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.warning }]} testID="search-notice">
            <Feather name="alert-circle" size={18} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left', flex: 1 }}>
              {notice}
            </Text>
          </View>
        ) : null}

        {state.status === 'loading' ? (
          <View style={styles.centerState} testID="search-loading">
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.medium }}>{t('search.loading')}</Text>
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.centerState} testID="search-error">
            <Feather name="alert-circle" size={34} color={colors.destructive} />
            <Text style={[styles.stateText, { color: colors.foreground, fontFamily: fonts.medium }]}>
              {t('search.load_failed')}
            </Text>
            <Button title={t('search.retry')} onPress={() => void loadRecords()} variant="outline" />
          </View>
        ) : !hasQuery ? (
          <View style={styles.centerState} testID="search-prompt">
            <View style={[styles.largeIcon, { backgroundColor: `${colors.primary}12` }]}>
              <Feather name="search" size={34} color={colors.primary} />
            </View>
            <Text style={[styles.stateText, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>
              {t('search.prompt')}
            </Text>
          </View>
        ) : !hasResults ? (
          <View style={styles.centerState} testID="search-no-results">
            <Feather name="inbox" size={34} color={colors.mutedForeground} />
            <Text style={[styles.stateText, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>
              {t('search.no_results')}
            </Text>
          </View>
        ) : (
          <>
            {results?.people.length ? (
              <View style={styles.section} testID="search-section-people">
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('search.people')} · {results.people.length}
                </Text>
                {results.people.map(person => (
                  <ResultCard
                    key={person.id}
                    icon="user"
                    title={person.name}
                    subtitle={person.classifications.map(value => t(`people.classification.${value}` as keyof Translations)).join(' · ')}
                    onPress={() => void openPerson(person)}
                    testID={`search-person-${person.id}`}
                  />
                ))}
              </View>
            ) : null}

            {results?.properties.length ? (
              <View style={styles.section} testID="search-section-properties">
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('search.properties')} · {results.properties.length}
                </Text>
                {results.properties.map(property => (
                  <ResultCard
                    key={property.core.id}
                    icon="home"
                    title={`${t(`propertyType.${property.core.propertyType}` as keyof Translations)} · ${propertyAreaLabel(property, language, t)}`}
                    subtitle={property.core.description?.value?.trim() || t('search.property_description_unknown')}
                    onPress={() => void openProperty(property)}
                    testID={`search-property-${property.core.id}`}
                  />
                ))}
              </View>
            ) : null}

            {results?.requirements.length ? (
              <View style={styles.section} testID="search-section-requirements">
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('search.requirements')} · {results.requirements.length}
                </Text>
                {results.requirements.map(({ requirement, seeker }) => (
                  <ResultCard
                    key={requirement.id}
                    icon="target"
                    title={seeker?.name ?? t('search.requirement_owner_unknown')}
                    subtitle={requirementSubtitle(requirement, language, t)}
                    onPress={() => void openRequirement(requirement, seeker)}
                    testID={`search-requirement-${requirement.id}`}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 64, alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24 },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 12, justifyContent: 'center' },
  searchIcon: { position: 'absolute', zIndex: 1, top: 17 },
  input: { minHeight: 54, borderWidth: 1, paddingHorizontal: 44, fontSize: 16 },
  clearButton: { position: 'absolute', zIndex: 1, top: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 6 },
  section: { marginBottom: 24, gap: 10 },
  sectionTitle: { fontSize: 18, marginBottom: 2 },
  card: { minHeight: 76, padding: 14, borderWidth: 1, alignItems: 'center', gap: 12 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 16 },
  cardSubtitle: { fontSize: 14, lineHeight: 20 },
  centerState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 72, gap: 16 },
  stateText: { textAlign: 'center', fontSize: 16, lineHeight: 24 },
  largeIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
});