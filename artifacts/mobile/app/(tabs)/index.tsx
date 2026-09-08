import { useState, useCallback } from 'react';
import { Alert, StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations, Language } from '@/contexts/I18nContext';
import { store, type LocalStoreIntegrityStatus } from '@/services/persistence';
import { Property } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { Button } from '@/components/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrice, formatRentalPrice } from '@/constants/market';

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

  const loadProperties = async (query = '') => {
    try {
      if (query.trim().length > 0) {
        setProperties(await store.searchProperties(query));
      } else {
        setProperties(await store.getProperties());
      }
    } catch (e) {
      console.error(e);
    }
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

    return (
      <TouchableOpacity
        onPress={() => router.push(`/property/${encodeURIComponent(item.core.id)}` as any)}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]}
        testID={`property-card-${item.core.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${t(`propertyType.${item.core.propertyType}` as keyof Translations)}, ${areaName}`}
      >
        <View style={[styles.cardHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.propertyType, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
            {t(`propertyType.${item.core.propertyType}` as keyof Translations)}
          </Text>
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Text style={[styles.badgeText, { color: colors.accentForeground, fontFamily: fonts.medium }]}>
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
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('home.title')}</Text>
        <TouchableOpacity onPress={toggleLanguage} style={[styles.langBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>
            {language === 'en' ? 'عربي' : 'EN'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={[
          styles.searchField,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.inputRadius,
            flexDirection: isRTL ? 'row-reverse' : 'row',
          },
        ]}>
        <Feather
          name="search"
          size={20}
          color={colors.mutedForeground}
          style={styles.searchIcon}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('home.search')}
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.searchInput,
            {
              color: colors.foreground,
              textAlign: isRTL ? 'right' : 'left',
              fontFamily: fonts.regular,
            }
          ]}
          testID="input-search"
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
          style={[styles.integrityNotice, { borderColor: colors.warning, backgroundColor: colors.card }]}
        >
          <Feather name="alert-triangle" size={16} color={colors.warning} />
          <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>
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
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 96 },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="home" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>{t('home.empty')}</Text>
          </View>
        }
      />

      <View style={[styles.fabContainer, { bottom: 16 }]}>
        <Button
          title={t('home.new')}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
  },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 16,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
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
    minHeight: 40,
    marginHorizontal: 20,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
