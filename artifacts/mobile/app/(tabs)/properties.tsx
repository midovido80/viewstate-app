import { useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';
import { Property } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { Button } from '@/components/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { PrimaryTabHeader } from '@/components/PrimaryTabHeader';
import { prioritizeHighlightedProperty } from '@/services/propertyDetailPresentation';

export default function PropertiesScreen() {
  const router = useRouter();
  const { highlight } = useLocalSearchParams<{ highlight?: string | string[] }>();
  const highlightedId = Array.isArray(highlight) ? highlight[0] : highlight;
  const listRef = useRef<FlatList<Property> | null>(null);
  const colors = useColors();
  const { t, isRTL, language, fonts } = useI18n();
  const insets = useSafeAreaInsets();

  const [properties, setProperties] = useState<Property[]>([]);
  const [search, setSearch] = useState('');

  const loadProperties = async (query = '') => {
    try {
      if (query.trim().length > 0) {
        setProperties(prioritizeHighlightedProperty(await store.searchProperties(query), highlightedId));
      } else {
        setProperties(prioritizeHighlightedProperty(await store.getProperties(), highlightedId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (highlightedId && properties.some(item => item.core.id === highlightedId)) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [highlightedId, properties]);

  useFocusEffect(
    useCallback(() => {
      loadProperties(search);
    }, [search, highlightedId])
  );

  const renderItem = ({ item }: { item: Property }) => {
    const isHighlighted = item.core.id === highlightedId;
    const price = item.activeOffer.transaction === 'sale'
      ? item.activeOffer.salePrice
      : item.activeOffer.rentalPrice;

    const area = getAreaById(item.core.locationArea.id);
    const areaName = area ? (language === 'ar' ? area.ar : area.en) : item.core.locationArea.id;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/property/${encodeURIComponent(item.core.id)}` as any)}
        style={[styles.card, { backgroundColor: colors.card, borderColor: isHighlighted ? colors.primary : colors.border, borderRadius: colors.cardRadius }]}
        testID={`property-card-${item.core.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${t(`propertyType.${item.core.propertyType}` as keyof Translations)}, ${areaName}`}
      >
        <View style={[styles.cardHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.propertyType, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
              {t(`propertyType.${item.core.propertyType}` as keyof Translations)}
            </Text>
            {isHighlighted ? (
              <View testID={`property-just-saved-${item.core.id}`} style={{ backgroundColor: colors.accent + '1A', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: colors.accent, fontFamily: fonts.medium, fontSize: 12 }}>{t('properties.just_saved')}</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.badge, { backgroundColor: colors.accent + '1A' }]}>
            <Text style={[styles.badgeText, { color: colors.accent, fontFamily: fonts.medium }]}>
              {t(`transaction.${item.activeOffer.transaction}` as keyof Translations)}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={[styles.price, { color: colors.primary, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
            {price
              ? item.activeOffer.transaction === 'rent'
                ? formatRentalPrice(
                    price.amount,
                    price.currencyCode,
                    item.activeOffer.rentalPeriodId,
                    language,
                    t,
                  )
                : formatPrice(price.amount, price.currencyCode, language)
              : ''}
          </Text>
          <Text style={[styles.location, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
            {areaName}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PrimaryTabHeader title={t('properties.title')} />

      <View style={styles.searchContainer}>
        <Feather
          name="search"
          size={20}
          color={colors.mutedForeground}
          style={[styles.searchIcon, isRTL ? styles.searchIconRTL : styles.searchIconLTR]}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
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

      <FlatList
        ref={listRef}
        data={properties}
        keyExtractor={item => item.core.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 96 },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="home" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>{t('properties.empty')}</Text>
          </View>
        }
      />

      <View style={[styles.fabContainer, {
        bottom: insets.bottom + 16,
      }]}>
        <Button
          title={t('properties.new')}
        onPress={() => router.push('/capture' as any)}
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
