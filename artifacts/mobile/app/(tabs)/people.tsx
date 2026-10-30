import { RaisedFilterButton } from '@/components/filters/RaisedFilterButton';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { Person } from '@/services/people';
import { store } from '@/services/persistence';
import { formatPrice, formatRentalPrice, toEnglishDigits } from '@/constants/market';
import {
  filterPersonActivityLines,
  getPersonActivityMoreLabel,
  getPersonDirectIntentActivityLines,
  type PersonActivityLine,
} from '@/services/cardSummaryPresentation';

import { PrimaryTabHeader } from '@/components/PrimaryTabHeader';
import {
  EMPTY_COMPOSABLE_RECORD_FILTER,
  hasActiveRecordFilters,
  getRecordTransactionFilterLabel,
  toggleRecordFilter,
  type ComposableRecordFilter,
} from '@/services/composableRecordFilters';

import { togglePropertySector, type PropertySectorFilter } from '@/services/propertySectorSelection';

const PEOPLE_FILTER_OPTIONS = [
  { key: 'all' },
  { key: 'offered', dimension: 'directions', value: 'offered' },
  { key: 'wanted', dimension: 'directions', value: 'wanted' },
  { key: 'sale', dimension: 'transactions', value: 'sale' },
  { key: 'rent', dimension: 'transactions', value: 'rent' },
] as const;

export default function PeopleScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useScreenInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const [people, setPeople] = useState<Person[]>([]);
  const [activityByPerson, setActivityByPerson] = useState<Map<string, PersonActivityLine[]>>(new Map());
  const [totalPeople, setTotalPeople] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ComposableRecordFilter>(EMPTY_COMPOSABLE_RECORD_FILTER);
  const [sector, setSector] = useState<PropertySectorFilter>('all');
  const hasActivePeopleFilters = hasActiveRecordFilters(filter) || sector !== 'all';
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    const allPeople = store.getPeople();
    const filteredPeople = search.trim() ? store.searchPeople(search) : allPeople;
    void Promise.all([
      allPeople, filteredPeople, store.getProperties(), store.getRequirements(),
      store.getPersonPropertyLinks(),
    ]).then(async ([all, filtered, properties, requirements, links]) => {
      const sources = (await Promise.all(properties.map(property =>
        store.getPropertySource(property.core.id)))).filter(source => source !== null);
      const formatters = {
        language,
        translate: (key: string) => t(key as keyof Translations),
        formatPrice: (amount: number, currencyCode: string) => formatPrice(amount, currencyCode, language),
        formatRentalPrice: (amount: number, currencyCode: string, period?: string) =>
          formatRentalPrice(amount, currencyCode, period, language, key => t(key as keyof Translations)),
      };
      const activity = new Map(filtered.map(person => [
        person.id,
        getPersonDirectIntentActivityLines(person.id, properties, requirements, links, sources, formatters),
      ] as const));
      if (!active) return;
      setTotalPeople(all.length);
      setPeople(filtered);
      setActivityByPerson(activity);
      setLoading(false);
    }).catch(() => {
      if (active) {
        setError(t('people.load_failed'));
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [search, t, language]));

  const visibleActivityByPerson = new Map(people.map(person => [
    person.id, filterPersonActivityLines(activityByPerson.get(person.id) ?? [], filter, sector),
  ] as const));
  const visiblePeople = people.filter(person =>
    !hasActivePeopleFilters || (visibleActivityByPerson.get(person.id)?.length ?? 0) > 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PrimaryTabHeader title={t('people.title')} />
      <View style={styles.searchWrap}>
        <Feather name="search" size={20} color={colors.mutedForeground} style={[styles.icon, isRTL ? { right: 34 } : { left: 34 }]} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('people.search')}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.search, {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor: colors.border,
            textAlign: isRTL ? 'right' : 'left',
            fontFamily: fonts.regular,
          }]}
          testID="people-search"
          accessibilityLabel={t('people.search')}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, minHeight: 60, direction: isRTL ? 'rtl' : 'ltr' }} contentContainerStyle={[styles.filters, { flexDirection: 'row', direction: isRTL ? 'rtl' : 'ltr' }]} testID="people-composable-filters">
        {PEOPLE_FILTER_OPTIONS.map(option => {
          const selected = option.key === 'all'
            ? !hasActivePeopleFilters
            : option.dimension === 'directions'
              ? filter.directions.includes(option.value)
              : filter.transactions.includes(option.value);
          return (
            <RaisedFilterButton
              key={option.key}
              onPress={() => {
                if (option.key === 'all') {
                  setFilter(EMPTY_COMPOSABLE_RECORD_FILTER);
                  setSector('all');
                } else {
                  setFilter(current => toggleRecordFilter(current, option.dimension, option.value));
                }
              }}
              selected={selected}
              testID={`people-filter-${option.key}`}
              accessibilityRole={option.key === 'all' ? 'button' : 'checkbox'}
              aria-checked={option.key === 'all' ? undefined : selected}
            >
              <Text numberOfLines={1} style={{ color: selected ? colors.background : colors.foreground, fontFamily: fonts.medium, fontSize: 13 }}>
                {option.key === 'sale' || option.key === 'rent'
                  ? getRecordTransactionFilterLabel(option.key, filter, language)
                  : t(`properties.filter.${option.key}` as keyof Translations)}
              </Text>
            </RaisedFilterButton>
          );
        })}
      </ScrollView>
      <View style={[styles.sectorFilters, { flexDirection: 'row', direction: isRTL ? 'rtl' : 'ltr' }]} testID="people-sector-filters">
        {(['residential', 'commercial'] as const).map(value => {
          const selected = sector === value;
          return (
            <RaisedFilterButton
              key={value}
              onPress={() => setSector(current => togglePropertySector(current, value))}
              selected={selected}
              style={styles.sectorChip}
              testID={`people-filter-${value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
            >
              <Text style={{ color: selected ? colors.primaryForeground : colors.foreground, fontFamily: fonts.medium, fontSize: 13 }}>
                {value === 'residential' ? (language === 'ar' ? 'سكني' : 'Residential') : (language === 'ar' ? 'تجاري' : 'Commercial')}
              </Text>
            </RaisedFilterButton>
          );
        })}
      </View>
      {error ? <Text style={[styles.error, { color: colors.destructive }]} testID="people-error">{error}</Text> : null}
      <FlatList
        data={visiblePeople}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 96 },
        ]}
        ListEmptyComponent={error ? null : loading
          ? <ActivityIndicator style={styles.empty} color={colors.primary} testID="people-loading" />
          : <Text
            style={[styles.empty, { color: colors.mutedForeground, fontFamily: fonts.medium }]}
            testID={totalPeople === 0 ? 'people-empty' : 'people-no-search-results'}
          >
            {totalPeople === 0
              ? t('people.empty')
              : search.trim() && !hasActivePeopleFilters
                ? t('people.no_search_results')
                : hasActivePeopleFilters
                  ? t('people.no_filtered_results')
                  : t('people.empty')}
          </Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/person/${encodeURIComponent(item.id)}` as never)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]}
            testID={`person-card-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${toEnglishDigits(item.displayPhone)}`}
          >
            <Text style={[styles.name, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{item.name}</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: 'left', writingDirection: 'ltr' }}>{toEnglishDigits(item.displayPhone)}</Text>
            <Text style={[styles.classes, { color: colors.primary, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {item.classifications.map(value => t(`people.classification.${value}` as keyof Translations)).join(' · ')}
            </Text>
            {(visibleActivityByPerson.get(item.id) ?? []).slice(0, 2).map(line => (
              <TouchableOpacity
                key={line.key}
                onPress={event => {
                  event.stopPropagation();
                  router.push(line.href as never);
                }}
                testID={`person-activity-${line.key}`}
                accessibilityRole="link"
              >
                <Text style={{ color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>
                  {line.label}
                </Text>
              </TouchableOpacity>
            ))}
            {(visibleActivityByPerson.get(item.id)?.length ?? 0) > 2 ? (
              <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>
                {getPersonActivityMoreLabel(visibleActivityByPerson.get(item.id)!.length - 2, language)}
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
      />
      <View style={[styles.add, { bottom: insets.bottom + 16 }]}>
        <Button title={t('people.add')} onPress={() => router.push('/person/new' as never)} testID="people-add" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, paddingHorizontal: 20, paddingTop: 16 },
  searchWrap: { paddingHorizontal: 20, paddingVertical: 14, justifyContent: 'center' },
  icon: { position: 'absolute', zIndex: 1 },
  search: { minHeight: 54, borderWidth: 1, borderRadius: 10, paddingHorizontal: 44, fontSize: 16 },
  list: { padding: 20 },
  card: { padding: 16, borderWidth: 1, marginBottom: 12, gap: 5 },
  name: { fontSize: 18 },
  classes: { marginTop: 4, fontSize: 13 },
  empty: { textAlign: 'center', paddingTop: 60 },
  filters: { paddingTop: 4, paddingHorizontal: 20, paddingBottom: 8, gap: 8, flexWrap: 'nowrap' },
  sectorFilters: { paddingTop: 4, paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  sectorChip: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  error: { paddingHorizontal: 20 },
  add: { position: 'absolute', left: 20, right: 20 },
});
