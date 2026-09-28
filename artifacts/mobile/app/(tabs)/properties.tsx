import { useState, useCallback, useRef, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';
import { Button } from '@/components/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { PrimaryTabHeader } from '@/components/PrimaryTabHeader';
import {
  filterOfferedWantedRows,
  getOfferedWantedHref,
  getOfferedWantedTransactionLabelKey,
  createOfferedWantedLoadCoordinator,
  loadOfferedWantedPresentation,
} from '@/services/offeredWantedPresentation';
import type { OfferedWantedFilter, OfferedWantedRow } from '@/services/offeredWantedPresentation';
import type { OfferedWantedLoadResult } from '@/services/offeredWantedPresentation';
import { isOfferedStudio, isWantedStudio } from '@/services/propertyDetailPresentation';
import { getPropertyCardSummary, getRequirementCardSummary } from '@/services/cardSummaryPresentation';

export default function PropertiesScreen() {
  const router = useRouter();
  const { highlight } = useLocalSearchParams<{ highlight?: string | string[] }>();
  const highlightedId = Array.isArray(highlight) ? highlight[0] : highlight;
  const listRef = useRef<FlatList<OfferedWantedRow> | null>(null);
  const colors = useColors();
  const { t, isRTL, language, fonts } = useI18n();
  const insets = useSafeAreaInsets();
  const loadCoordinatorRef = useRef(createOfferedWantedLoadCoordinator());

  const [loadResult, setLoadResult] = useState<OfferedWantedLoadResult | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<OfferedWantedFilter>('all');
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
      void loadOfferedWantedPresentation(store, search).then(result => {
        if (loadCoordinatorRef.current.isCurrent(requestSequence)) setLoadResult(result);
      });
      return () => {
        loadCoordinatorRef.current.invalidate(requestSequence);
      };
    }, [highlightedId, search])
  );

  const visibleRows = filterOfferedWantedRows(rows, filter, search, {
    offeredPropertySearchIds: search.trim()
      ? new Set(loadResult?.matchingPropertyIds ?? [])
      : undefined,
  });
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
          accessibilityLabel={`${t(item.kind === 'offered' ? 'properties.badge.offered' : 'properties.badge.wanted')}, ${summary?.subtypeLabel ?? (type ? t(`propertyType.${type}` as keyof Translations) : '')}, ${areaLabel}`}
        >
        <View style={[styles.cardHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.propertyType, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
              {summary?.typeLabel ?? (type ? t(`propertyType.${type}` as keyof Translations) : '')}
            </Text>
            {summary?.subtypeLabel ? (
              <View style={[styles.badge, { backgroundColor: colors.primary + '1A' }]}>
                <Text style={[styles.badgeText, { color: colors.primary, fontFamily: fonts.medium }]}>
                  {summary.subtypeLabel}
                </Text>
              </View>
            ) : null}
            {isHighlighted ? (
              <View testID={`property-just-saved-${item.id}`} style={{ backgroundColor: colors.accent + '1A', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: colors.accent, fontFamily: fonts.medium, fontSize: 12 }}>{t('properties.just_saved')}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6 }}>
            <View style={[styles.badge, { backgroundColor: colors.primary + '1A' }]}>
              <Text style={[styles.badgeText, { color: colors.primary, fontFamily: fonts.medium }]}>
                {t(item.kind === 'offered' ? 'properties.badge.offered' : 'properties.badge.wanted')}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.accent + '1A' }]}>
              <Text style={[styles.badgeText, { color: colors.accent, fontFamily: fonts.medium }]}>
                {summary?.transactionLabel ?? t(getOfferedWantedTransactionLabelKey(item) as keyof Translations)}
              </Text>
            </View>
            {isStudio && !summary?.subtypeLabel ? (
              <View style={[styles.badge, { backgroundColor: colors.primary + '1A' }]} testID={`studio-badge-${item.kind}-${item.id}`}>
                <Text style={[styles.badgeText, { color: colors.primary, fontFamily: fonts.medium }]}>
                  {t('enrich.apartment_subtype.studio')}
                </Text>
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
            style={[styles.errorBanner, { backgroundColor: colors.accent + '1A', borderColor: colors.accent }]}
            testID="properties-load-warnings"
            accessibilityRole="alert"
          >
            {loadResult.errors.properties ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.medium }]}>{t('properties.load_failed')}</Text> : null}
            {loadResult.errors.requirements ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.regular }]}>{t('properties.requirements_unavailable')}</Text> : null}
            {loadResult.errors.people ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.regular }]}>{t('properties.people_unavailable')}</Text> : null}
            {loadResult.errors.sources ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.regular }]}>{t('properties.sources_unavailable')}</Text> : null}
            {loadResult.errors.links ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.regular }]}>{language === 'ar' ? 'تعذر تحميل روابط الأشخاص بالعقارات.' : 'Property links could not be loaded.'}</Text> : null}
            {loadResult.errors.search ? <Text style={[styles.errorText, { color: colors.foreground, fontFamily: fonts.regular }]}>{t('properties.search_failed')}</Text> : null}
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
            setLoadResult(previous => previous
              ? { ...previous, matchingPropertyIds: query.trim() ? [] : null }
              : previous);
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

      <View style={[styles.filters, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {(['all', 'offered', 'wanted', 'sale', 'rent'] as const).map(value => {
          const selected = filter === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => setFilter(value)}
              style={[
                styles.filterChip,
                { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border },
              ]}
              testID={`properties-filter-${value}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={{ color: selected ? colors.background : colors.foreground, fontFamily: fonts.medium, fontSize: 13 }}>
                {t(`properties.filter.${value}` as keyof Translations)}
              </Text>
            </TouchableOpacity>
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
            ) : loadResult.errors.properties || loadResult.errors.requirements ? null : (
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
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  propertyType: {
    fontSize: 16,
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
