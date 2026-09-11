import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Property } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { HomeEmptyState, HomePropertyCard } from '@/components/HomePrimitives';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';

export default function PropertiesScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t, isRTL, language, fonts } = useI18n();
  const insets = useSafeAreaInsets();
  const [properties, setProperties] = useState<Property[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [propertyCount, setPropertyCount] = useState<number | null>(null);

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
    } catch (error) {
      console.error(error);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void loadProperties(search);
    }, [search]),
  );

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

  const listEmptyComponent = isLoading ? (
    <View
      accessibilityState={{ busy: true }}
      style={styles.loadingState}
      testID="properties-loading"
    >
      <ActivityIndicator color={colors.vapp47.brandPrimary} size="large" />
    </View>
  ) : loadFailed || propertyCount === null ? (
    <HomeEmptyState
      icon="alert-circle"
      testID="properties-unavailable"
      title={t('brain.results.unavailable')}
    />
  ) : propertyCount === 0 ? (
    <HomeEmptyState icon="home" testID="properties-empty" title={t('home.empty')} />
  ) : (
    <HomeEmptyState
      icon="search"
      testID="properties-no-results"
      title={t('home.no_results')}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.vapp47.appSurface }]}>
      <View
        style={[
          styles.hero,
          {
            backgroundColor: colors.vapp47.brandPrimary,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            {
              color: colors.vapp47.cardSurface,
              fontFamily: fonts.bold,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        >
          {t('properties.title')}
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchField,
            colors.vapp47.homeShadow,
            {
              backgroundColor: colors.vapp47.cardSurface,
              borderColor: colors.vapp47.visualBorder,
              flexDirection: isRTL ? 'row-reverse' : 'row',
            },
          ]}
        >
          <Feather
            color={colors.vapp47.textMuted}
            name="search"
            size={19}
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

      <FlatList
        contentContainerStyle={styles.listContent}
        data={properties}
        keyExtractor={item => item.core.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={listEmptyComponent}
        renderItem={renderItem}
      />

      <View
        style={[
          styles.fabContainer,
          {
            bottom: 16,
            [isRTL ? 'left' : 'right']: 20,
          },
        ]}
      >
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
          <Feather color={colors.vapp47.cardSurface} name="plus" size={24} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  title: {
    fontSize: 27,
    lineHeight: 34,
    paddingBottom: 10,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginTop: -26,
    paddingBottom: 14,
    zIndex: 2,
  },
  searchField: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
  },
  searchIcon: {
    marginHorizontal: 14,
  },
  searchInput: {
    minHeight: 50,
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 8,
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 96,
  },
  propertyItem: {
    marginBottom: 12,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  fabContainer: {
    position: 'absolute',
    alignItems: 'flex-end',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});