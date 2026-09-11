import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations, Language } from '@/contexts/I18nContext';
import { store, type LocalStoreIntegrityStatus } from '@/services/persistence';
import { Property } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import {
  HomeEmptyState,
  HomePropertyCard,
  HomeQuickAction,
  HomeSectionHeading,
  HomeSummaryCard,
} from '@/components/HomePrimitives';

export default function TabOneScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t, isRTL, language, setLanguage, fonts } = useI18n();
  const insets = useSafeAreaInsets();

  const [properties, setProperties] = useState<Property[]>([]);
  const [integrityStatus, setIntegrityStatus] = useState<LocalStoreIntegrityStatus>(
    () => store.getIntegrityStatus(),
  );
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [requirementCount, setRequirementCount] = useState<number | null>(null);

  const loadProperties = async (query = '') => {
    setIsLoading(true);
    setLoadFailed(false);

    try {
      const allProperties = await store.getProperties();
      setPropertyCount(allProperties.length);
      setProperties(
        query.trim().length > 0
          ? await store.searchProperties(query)
          : allProperties,
      );
    } catch (e) {
      console.error(e);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }

    const [peopleResult, requirementsResult] = await Promise.allSettled([
      store.getPeople(),
      store.getRequirements(),
    ]);
    setPeopleCount(peopleResult.status === 'fulfilled' ? peopleResult.value.length : null);
    setRequirementCount(
      requirementsResult.status === 'fulfilled' ? requirementsResult.value.length : null,
    );
  };

  useFocusEffect(
    useCallback(() => {
      loadProperties(search);
      setIntegrityStatus(store.getIntegrityStatus());
    }, [search])
  );

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const renderItem = ({ item }: { item: Property }) => {
    const price = item.activeOffer.transaction === 'sale'
      ? item.activeOffer.salePrice
      : item.activeOffer.rentalPrice;

    const area = getAreaById(item.core.locationArea.id);
    const areaName = area ? (language === 'ar' ? area.ar : area.en) : item.core.locationArea.id;

    const propertyType = t(`propertyType.${item.core.propertyType}` as keyof Translations);
    const formattedPrice = price
      ? item.activeOffer.transaction === 'rent'
        ? formatRentalPrice(
            price.amount,
            price.currencyCode,
            item.activeOffer.rentalPeriodId,
            language,
            t,
          )
        : formatPrice(price.amount, price.currencyCode, language)
      : undefined;

    return (
      <View style={styles.propertyItem}>
        <HomePropertyCard
          accessibilityLabel={`${propertyType}, ${areaName}`}
          badge={t(`transaction.${item.activeOffer.transaction}` as keyof Translations)}
          location={areaName}
          onPress={() => router.push(`/property/${encodeURIComponent(item.core.id)}` as any)}
          price={formattedPrice}
          propertyId={item.core.id}
          testID={`property-card-${item.core.id}`}
          title={propertyType}
        />
      </View>
    );
  };

  const summaryStatus = (value: number | null) =>
    value === null
      ? { state: 'unavailable' as const, stateLabel: t('brain.results.unavailable') }
      : { state: 'ready' as const, value };

  const listEmptyComponent = isLoading ? (
    <View
      accessibilityState={{ busy: true }}
      style={styles.loadingState}
      testID="home-properties-loading"
    >
      <ActivityIndicator color={colors.vapp47.brandPrimary} size="large" />
    </View>
  ) : loadFailed || propertyCount === null ? (
    <HomeEmptyState
      icon="alert-circle"
      testID="home-properties-unavailable"
      title={t('brain.results.unavailable')}
    />
  ) : propertyCount === 0 ? (
    <HomeEmptyState icon="home" testID="home-properties-empty" title={t('home.empty')} />
  ) : (
    <HomeEmptyState
      icon="search"
      testID="home-properties-no-results"
      title={t('brain.results.empty')}
    />
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.vapp47.appSurface, paddingTop: insets.top },
      ]}
    >
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.brandCopy}>
          <Text
            style={[
              styles.brand,
              {
                color: colors.vapp47.brandPrimary,
                fontFamily: fonts.bold,
                textAlign: isRTL ? 'right' : 'left',
              },
            ]}
          >
            ViewState
          </Text>
          <Text
            style={{
              color: colors.vapp47.textMuted,
              fontFamily: fonts.medium,
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {t('home.title')}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={toggleLanguage}
          style={[
            styles.langBtn,
            {
              backgroundColor: colors.vapp47.cardSurface,
              borderColor: colors.vapp47.visualBorder,
            },
          ]}
          testID="home-language-toggle"
        >
          <Text style={{ color: colors.vapp47.textPrimary, fontFamily: fonts.semiBold }}>
            {language === 'en' ? 'عربي' : 'EN'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchField,
            {
              backgroundColor: colors.vapp47.cardSurface,
              borderColor: colors.vapp47.visualBorder,
              borderRadius: colors.inputRadius,
              flexDirection: isRTL ? 'row-reverse' : 'row',
            },
          ]}
        >
          <Feather
            color={colors.vapp47.textMuted}
            name="search"
            size={20}
            style={styles.searchIcon}
          />
          <TextInput
            onChangeText={setSearch}
            placeholder={t('home.search')}
            placeholderTextColor={colors.vapp47.textMuted}
            style={[
              styles.searchInput,
              {
                color: colors.vapp47.textPrimary,
                fontFamily: fonts.regular,
                textAlign: isRTL ? 'right' : 'left',
              },
            ]}
            testID="input-search"
            value={search}
          />
        </View>
      </View>

      {integrityStatus.hasUnreadableRecords ? (
        <TouchableOpacity
          testID="local-data-integrity-notice"
          accessibilityRole="button"
          onPress={() => Alert.alert(
            t('integrity.title'),
            `${t('integrity.message')}\n${t('integrity.count')} ${integrityStatus.unreadableRecords.length}`,
          )}
          style={[
            styles.integrityNotice,
            {
              backgroundColor: colors.vapp47.cardSurface,
              borderColor: colors.vapp47.warning,
              flexDirection: isRTL ? 'row-reverse' : 'row',
            },
          ]}
        >
          <Feather color={colors.vapp47.warning} name="alert-triangle" size={16} />
          <Text
            style={{
              color: colors.vapp47.textPrimary,
              flex: 1,
              fontFamily: fonts.medium,
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {t('integrity.compact').replace(
              '{count}',
              String(integrityStatus.unreadableRecords.length),
            )}
          </Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={properties}
        keyExtractor={item => item.core.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.homeContent}>
            <View
              style={[
                styles.quickActions,
                {
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                },
              ]}
            >
              <View style={styles.gridItem}>
                <HomeQuickAction
                  accessibilityLabel={t('home.new')}
                  icon="plus-square"
                  onPress={() => router.push('/capture/transaction' as any)}
                  testID="home-action-add-property"
                  title={t('home.new')}
                />
              </View>
              <View style={styles.gridItem}>
                <HomeQuickAction
                  accessibilityLabel={t('people.add')}
                  icon="user-plus"
                  onPress={() => router.push('/person/new' as never)}
                  testID="home-action-add-person"
                  title={t('people.add')}
                />
              </View>
              <View style={styles.gridItem}>
                <HomeQuickAction
                  accessibilityLabel={t('people.import_contact')}
                  icon="book-open"
                  onPress={() => router.push('/person/new' as never)}
                  testID="home-action-contact-entry"
                  title={t('people.import_contact')}
                />
              </View>
              <View style={styles.gridItem}>
                <HomeQuickAction
                  accessibilityLabel={t('matching.title')}
                  icon="git-merge"
                  onPress={() => router.push('/matching' as never)}
                  testID="home-action-matches"
                  title={t('matching.title')}
                />
              </View>
            </View>

            <View
              style={[
                styles.summaryGrid,
                { flexDirection: isRTL ? 'row-reverse' : 'row' },
              ]}
            >
              <View style={styles.summaryItem}>
                <HomeSummaryCard
                  icon="home"
                  label={t('brain.results.properties')}
                  status={summaryStatus(propertyCount)}
                  testID="home-summary-properties"
                  tone="brand"
                />
              </View>
              <View style={styles.summaryItem}>
                <HomeSummaryCard
                  icon="users"
                  label={t('brain.results.people')}
                  status={summaryStatus(peopleCount)}
                  testID="home-summary-people"
                  tone="communication"
                />
              </View>
              <View style={styles.summaryItem}>
                <HomeSummaryCard
                  icon="clipboard"
                  label={t('brain.results.requirements')}
                  status={summaryStatus(requirementCount)}
                  testID="home-summary-requirements"
                  tone="data"
                />
              </View>
            </View>

            <View style={styles.propertiesHeading}>
              <HomeSectionHeading title={t('home.title')} />
            </View>
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 96 },
        ]}
        ListEmptyComponent={listEmptyComponent}
      />

      <View style={[styles.fabContainer, { bottom: 16 }]}>
        <Pressable
          accessibilityLabel={t('home.new')}
          accessibilityRole="button"
          onPress={() => router.push('/capture/transaction' as any)}
          testID="btn-capture"
          style={({ pressed }) => [
            styles.fab,
            colors.vapp47.homeShadow,
            {
              backgroundColor: colors.vapp47.brandPrimary,
              opacity: pressed ? 0.84 : 1,
            },
          ]}
        >
          <Feather color={colors.vapp47.cardSurface} name="plus" size={22} />
          <Text
            style={{
              color: colors.vapp47.cardSurface,
              fontFamily: fonts.semiBold,
            }}
          >
            {t('home.new')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 16,
  },
  brandCopy: {
    flex: 1,
  },
  brand: {
    fontSize: 27,
    lineHeight: 34,
  },
  langBtn: {
    minHeight: 44,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 22,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  searchField: {
    minHeight: 56,
    borderWidth: 1,
    alignItems: 'center',
  },
  searchIcon: {
    marginHorizontal: 14,
  },
  searchInput: {
    minHeight: 54,
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 8,
    fontSize: 16,
  },
  integrityNotice: {
    minHeight: 48,
    marginHorizontal: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  homeContent: {
    gap: 18,
    paddingTop: 4,
    paddingBottom: 14,
  },
  quickActions: {
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: {
    flexBasis: '46%',
    flexGrow: 1,
    minWidth: 138,
    maxWidth: '50%',
  },
  summaryGrid: {
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryItem: {
    flexBasis: '29%',
    flexGrow: 1,
    minWidth: 104,
  },
  propertiesHeading: {
    paddingTop: 2,
  },
  propertyItem: {
    marginBottom: 14,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    alignItems: 'flex-end',
  },
  fab: {
    minHeight: 54,
    borderRadius: 27,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});
