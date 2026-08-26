import { useState, useCallback } from 'react';
import { Platform, StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations, Language } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';
import { Property } from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';
import { Button } from '@/components/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrice } from '@/constants/market';

export default function TabOneScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t, isRTL, language, setLanguage, fonts } = useI18n();
  const insets = useSafeAreaInsets();

  const [properties, setProperties] = useState<Property[]>([]);
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
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]}>
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
            {price ? formatPrice(price.amount, price.currencyCode, language) : ''}
          </Text>
          <Text style={[styles.location, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
            {areaName}
          </Text>
        </View>
      </View>
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
        <Feather
          name="search"
          size={20}
          color={colors.mutedForeground}
          style={[styles.searchIcon, isRTL ? styles.searchIconRTL : styles.searchIconLTR]}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('home.search')}
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
        data={properties}
        keyExtractor={item => item.core.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="home" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>{t('home.empty')}</Text>
          </View>
        }
      />

      <View style={[styles.fabContainer, {
        bottom: insets.bottom + (Platform.OS === 'web' ? 104 : 80),
      }]}>
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
    paddingBottom: 100,
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
