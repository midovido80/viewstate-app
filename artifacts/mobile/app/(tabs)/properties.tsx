import { RaisedFilterButton, useIntentFilterWidth } from '@/components/filters/RaisedFilterButton';
import { useState, useCallback, useRef, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, FlatList, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';
import { Button } from '@/components/Button';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { PrimaryTabHeader } from '@/components/PrimaryTabHeader';
import {
  filterOfferedWantedRows,
  getOfferedWantedHref,
  createOfferedWantedLoadCoordinator,
  loadOfferedWantedPresentation,
} from '@/services/offeredWantedPresentation';
import type { OfferedWantedRow } from '@/services/offeredWantedPresentation';
import type { OfferedWantedLoadResult } from '@/services/offeredWantedPresentation';
import { isOfferedStudio, isWantedStudio } from '@/services/propertyDetailPresentation';
import { getPropertyCardSummary, getRequirementCardSummary } from '@/services/cardSummaryPresentation';
import { projectRecordCardBadges, projectRecordIntent } from '@/services/recordIntentPresentation';
import {
  EMPTY_COMPOSABLE_RECORD_FILTER,
  hasActiveRecordFilters,
  getRecordTransactionFilterLabel,
  toggleRecordFilter,
  type ComposableRecordFilter,
} from '@/services/composableRecordFilters';

import { togglePropertySector, type PropertySectorFilter } from '@/services/propertySectorSelection';

const PROPERTY_FILTER_OPTIONS = [
  { key: 'all' },
  { key: 'offered', dimension: 'directions', value: 'offered' },
  { key: 'wanted', dimension: 'directions', value: 'wanted' },
  { key: 'sale', dimension: 'transactions', value: 'sale' },
  { key: 'rent', dimension: 'transactions', value: 'rent' },
] as const;

export default function PropertiesScreen() {
  const router = useRouter();
  const { highlight } = useLocalSearchParams<{ highlight?: string | string[] }>();
  const highlightedId = Array.isArray(highlight) ? highlight[0] : highlight;
  const listRef = useRef<FlatList<OfferedWantedRow> | null>(null);
  const colors = useColors();
  const { t, isRTL, language, fonts } = useI18n();
  const insets = useScreenInsets();
  const intentFilterWidth = useIntentFilterWidth();
  const loadCoordinatorRef = useRef(createOfferedWantedLoadCoordinator());

  const [loadResult, setLoadResult] = useState<OfferedWantedLoadResult | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ComposableRecordFilter>(EMPTY_COMPOSABLE_RECORD_FILTER);
  const [sector, setSector] = useState<PropertySectorFilter>('all');
  const rows = loadResult?.rows ?? [];

  useEffect(() => {
    if (highlightedId && rows.some(item => item.kind === 'offered' && item.id === highlightedId)) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [highlightedId, rows]);

  useFocusEffect(
    useCallback(() => {
      const requestSequence = loadCoordinatorRef.current.begin();
      setLoadResult(null);
      void loadOfferedWantedPresentation(store).then(result => {
        if (loadCoordinatorRef.current.isCurrent(requestSequence)) setLoadResult(result);
      });
      return () => {
        loadCoordinatorRef.current.invalidate(requestSequence);
      };
    }, [highlightedId])
  );

  const visibleRows = filterOfferedWantedRows(rows, filter, search, sector);
  const prioritizedRows = highlightedId
    ? [
      ...visibleRows.filter(row => row.kind === 'offered' && row.id === highlightedId),
      ...visibleRows.filter(row => row.kind !== 'offered' || row.id !== highlightedId),
    ]
    : visibleRows;

  const renderItem = ({ item }: { item: OfferedWantedRow }) => {
    const property = item.kind === 'offered' ? item.property : null;
    const requirement = item.kind === 'wanted' ? item.requirement : null;
    const isHighlighted = item.kind === 'offered' && item.id === highlightedId;
    const type = property?.core.propertyType ?? requirement?.propertyType;
    const isStudio = property ? isOfferedStudio(property) : requirement ? isWantedStudio(requirement) : false;
    const transaction = item.transaction;
    const summaryFormatters = {
      language,
      translate: (key: string) => t(key as keyof Translations),
      formatPrice: (amount: number, currencyCode: string) => formatPrice(amount, currencyCode, language),
      formatRentalPrice: (amount: number, currencyCode: string, period?: string) =>
        formatRentalPrice(amount, currencyCode, period, language, key => t(key as keyof Translations)),
    };
    const summary = property
      ? getPropertyCardSummary(property, summaryFormatters)
      : requirement ? getRequirementCardSummary(requirement, summaryFormatters) : null;
    const areaLabel = summary?.areaLabel ?? '';
    const priceLabel = summary?.valueLabel ?? '';
    const typeLabel = summary?.typeLabel ?? (type ? t(`propertyType.${type}` as keyof Translations) : '');
    const subtypeLabel = summary?.subtypeLabel ?? (isStudio ? t('enrich.apartment_subtype.studio') : undefined);
    const intent = projectRecordIntent(item.kind, transaction, language);
    const badges = projectRecordCardBadges(intent, typeLabel, subtypeLabel);
    const personTargets = item.kind === 'offered'
      ? item.personTargets ?? (item.person ? [item.person] : [])
      : item.person ? [item.person] : [];

    return (
      <View
        style={[styles.card, { backgroundColor: colors.card, borderColor: isHighlighted ? colors.primary : colors.border, borderRadius: colors.cardRadius }]}
      >
        <TouchableOpacity
          onPress={() => router.push(getOfferedWantedHref(item.kind, item.id) as any)}
          testID={`${item.kind === 'offered' ? 'property' : 'requirement'}-card-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${badges.map(badge => badge.label).join(', ')}, ${areaLabel}`}
        >
        <View style={[styles.cardHeader, { flexDirection: 'row', direction: isRTL ? 'rtl' : 'ltr' }]}>
          <View
            style={{ flexDirection: 'row', direction: isRTL ? 'rtl' : 'ltr', alignItems: 'center', gap: 8 }}
            testID={`record-badges-${item.kind}-${item.id}`}
          >
            {badges.map(badge => (
              <View
                key={badge.key}
                style={[styles.badge, { backgroundColor: colors.primary + '1A' }]}
                testID={badge.key === 'intent'
                  ? `record-intent-badge-${item.kind}-${item.id}`
                  : badge.key === 'type'
                    ? `record-type-badge-${item.kind}-${item.id}`
                    : isStudio
                      ? `studio-badge-${item.kind}-${item.id}`
                      : `record-subtype-badge-${item.kind}-${item.id}`}
              >
                <Text style={[styles.badgeText, { color: colors.primary, fontFamily: fonts.medium }]}>
                  {badge.label}
                </Text>
              </View>
            ))}
            {isHighlighted ? (
              <View testID={`property-just-saved-${item.id}`} style={{ backgroundColor: colors.accent + '1A', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: colors.accent, fontFamily: fonts.medium, fontSize: 12 }}>{t('properties.just_saved')}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={[styles.price, { color: colors.primary, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
            {priceLabel}
          </Text>
          <Text style={[styles.location, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
            {areaLabel}
          </Text>
          {summary?.studioAreaLabel ? (
            <Text testID={`studio-area-summary-${item.kind}-${item.id}`}
              style={[styles.location, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {summary.studioAreaLabel}
            </Text>
          ) : null}
        </View>
        </TouchableOpacity>
        {item.kind === 'wanted' && !item.person ? (
          <View style={[styles.personTarget, { alignSelf: isRTL ? 'flex-end' : 'flex-start' }]} testID={`requirement-unassigned-${item.id}`}>
            <Feather name="user-plus" size={14} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.medium, fontSize: 13 }}>
              {language === 'ar' ? 'غير مرتبط بشخص' : 'Not linked to a Person'}
            </Text>
          </View>
        ) : null}
        {personTargets.map((person, index) => (
          <TouchableOpacity
            key={person.id}
            onPress={event => {
              event.stopPropagation();
              router.push(`/person/${encodeURIComponent(person.id)}` as any);
            }}
            style={[styles.personTarget, { alignSelf: isRTL ? 'flex-end' : 'flex-start' }]}
            testID={index === 0
              ? `person-target-${item.kind}-${item.id}`
              : `person-target-${item.kind}-${item.id}-${person.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${t('properties.person_target')}: ${person.name}`}
          >
            <Feather name="user" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontFamily: fonts.medium, fontSize: 13 }}>
              {person.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PrimaryTabHeader title={t('properties.title')} />

      {loadResult ? (
        Object.entries(loadResult.errors).filter(([, failed]) => failed).length > 0 ? (
          <View
            style={[styles.errorBanner, { backgroundColor: colors.destructive + '1A', borderColor: colors.destructive }]}
            testID="properties-load-warnings"
            accessibilityRole="alert"
          >
            {loadResult.errors.properties ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.medium }]}>{t('properties.load_failed')}</Text> : null}
            {loadResult.errors.requirements ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.regular }]}>{t('properties.requirements_unavailable')}</Text> : null}
            {loadResult.errors.people ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.regular }]}>{t('properties.people_unavailable')}</Text> : null}
            {loadResult.errors.sources ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.regular }]}>{t('properties.sources_unavailable')}</Text> : null}
            {loadResult.errors.links ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.regular }]}>{language === 'ar' ? 'تعذر تحميل روابط الأشخاص بالعقارات.' : 'Property links could not be loaded.'}</Text> : null}
          </View>
        ) : null
      ) : null}

      <View style={styles.searchContainer}>
        <Feather
          name="search"
          size={20}
          color={colors.mutedForeground}
          style={[styles.searchIcon, isRTL ? styles.searchIconRTL : styles.searchIconLTR]}
        />
        <TextInput
          value={search}
          onChangeText={query => {
            setSearch(query);
          }}
          placeholder={t('properties.search')}
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.searchInput,
            {
              backgroundColor: colors.card,
              color: colors.foreground,
              borderColor: colors.border,
              textAlign: isRTL ? 'right' : 'left',
              fontFamily: fonts.regular,
              borderRadius: colors.inputRadius,
            }
          ]}
          testID="input-search"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, minHeight: 44, direction: isRTL ? 'rtl' : 'ltr' }} contentContainerStyle={[styles.filters, { flexDirection: 'row', direction: isRTL ? 'rtl' : 'ltr' }]} testID="properties-composable-filters">
        {PROPERTY_FILTER_OPTIONS.map(option => {
          const selected = option.key === 'all'
            ? !hasActiveRecordFilters(filter) && sector === 'all'
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
              style={{ width: intentFilterWidth }}
              testID={`properties-filter-${option.key}`}
              accessibilityRole={option.key === 'all' ? 'button' : 'checkbox'}
              aria-checked={option.key === 'all' ? undefined : selected}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9} maxFontSizeMultiplier={1.3} style={{ color: selected ? colors.background : colors.foreground, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 }}>
                {option.key === 'sale' || option.key === 'rent'
                  ? getRecordTransactionFilterLabel(option.key, filter, language)
                  : t(`properties.filter.${option.key}` as keyof Translations)}
              </Text>
            </RaisedFilterButton>
          );
        })}
      </ScrollView>

      <View style={[styles.sectorFilters, { flexDirection: 'row', direction: isRTL ? 'rtl' : 'ltr' }]} testID="properties-sector-filters">
        {(['residential', 'commercial'] as const).map(value => {
          const selected = sector === value;
          return (
            <RaisedFilterButton
              key={value}
              onPress={() => setSector(current => togglePropertySector(current, value))}
              selected={selected}
              style={styles.sectorChip}
              testID={`properties-filter-${value}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
            >
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: selected ? colors.primaryForeground : colors.foreground, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 }}>
                {value === 'residential' ? (language === 'ar' ? 'سكني' : 'Residential') : (language === 'ar' ? 'تجاري' : 'Commercial')}
              </Text>
            </RaisedFilterButton>
          );
        })}
      </View>

      <FlatList
        ref={listRef}
        data={prioritizedRows}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 96 },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loadResult === null ? (
              <ActivityIndicator color={colors.primary} />
            ) : loadResult.errors.properties
              || loadResult.errors.requirements
              || loadResult.errors.people
              || loadResult.errors.sources
              || loadResult.errors.links ? null : (
              <>
                <Feather name="home" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>
                  {t(rows.length === 0 ? 'properties.empty_all' : 'properties.no_matches')}
                </Text>
              </>
            )}
          </View>
        }
      />

      <View style={[styles.fabContainer, {
        bottom: insets.bottom + 16,
      }]}>
        <Button
          title={t('properties.new')}
        onPress={() => router.push('/capture/transaction' as any)}
          style={styles.fab}
          testID="btn-capture"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    position: 'relative',
    justifyContent: 'center',
  },
  errorBanner: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    gap: 4,
  },
  errorText: {
    fontSize: 13,
  },
  filters: {
    paddingTop: 5,
    paddingHorizontal: 20,
    paddingBottom: 5,
    gap: 6,
    flexWrap: 'nowrap',
  },
  sectorFilters: {
    paddingTop: 5,
    paddingHorizontal: 20,
    paddingBottom: 5,
    gap: 8,
  },
  sectorChip: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    zIndex: 1,
  },
  searchIconLTR: {
    left: 36,
  },
  searchIconRTL: {
    right: 36,
  },
  searchInput: {
    height: 56,
    borderWidth: 1,
    paddingHorizontal: 44,
    fontSize: 16,
  },
  listContent: {
    padding: 20,
  },
  card: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
  },
  cardBody: {
    gap: 4,
  },
  personTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  price: {
    fontSize: 20,
  },
  location: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyText: {
    fontSize: 16,
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    left: 20,
  },
  fab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  }
});
