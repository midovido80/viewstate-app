import { useState, useCallback } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { store, type LocalStoreIntegrityStatus } from '@/services/persistence';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HomeQuickAction,
  HomeSectionHeading,
  HomeSummaryCard,
} from '@/components/HomePrimitives';

export default function TabOneScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t, isRTL, language, setLanguage, fonts } = useI18n();
  const insets = useSafeAreaInsets();

  const [integrityStatus, setIntegrityStatus] = useState<LocalStoreIntegrityStatus>(
    () => store.getIntegrityStatus(),
  );
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [peopleCount, setPeopleCount] = useState<number | null>(null);
  const [requirementCount, setRequirementCount] = useState<number | null>(null);

  const loadDashboardCounts = async () => {
    const [propertiesResult, peopleResult, requirementsResult] = await Promise.allSettled([
      store.getProperties(),
      store.getPeople(),
      store.getRequirements(),
    ]);
    setPropertyCount(
      propertiesResult.status === 'fulfilled' ? propertiesResult.value.length : null,
    );
    setPeopleCount(peopleResult.status === 'fulfilled' ? peopleResult.value.length : null);
    setRequirementCount(
      requirementsResult.status === 'fulfilled' ? requirementsResult.value.length : null,
    );
  };

  useFocusEffect(
    useCallback(() => {
      void loadDashboardCounts();
      setIntegrityStatus(store.getIntegrityStatus());
    }, [])
  );

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const summaryStatus = (value: number | null) =>
    value === null
      ? { state: 'unavailable' as const, stateLabel: t('brain.results.unavailable') }
      : { state: 'ready' as const, value };

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
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.brandCopy}>
            <Text
              style={[
                styles.brand,
                {
                  color: colors.vapp47.cardSurface,
                  fontFamily: fonts.bold,
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
            >
              ViewState
            </Text>
            <Text
              style={{
                color: 'rgba(255,255,255,0.78)',
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
            style={styles.langBtn}
            testID="home-language-toggle"
          >
            <Text style={{ color: colors.vapp47.cardSurface, fontFamily: fonts.semiBold }}>
              {language === 'en' ? 'عربي' : 'EN'}
            </Text>
          </TouchableOpacity>
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

      <ScrollView contentContainerStyle={styles.dashboardContent}>
          <View style={styles.homeContent}>
            <HomeSectionHeading title={t('home.quick_actions')} />

            <View
              style={[
                styles.quickActions,
                { flexDirection: isRTL ? 'row-reverse' : 'row' },
              ]}
            >
              <View style={styles.gridItem}>
                <HomeQuickAction
                  accessibilityLabel={t('home.new')}
                  icon="plus-square"
                  onPress={() => router.push('/capture/transaction' as any)}
                  testID="home-action-add-property"
                  title={t('home.new')}
                  variant="primary"
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

            <HomeSectionHeading title={t('home.workspace_summary')} />

            <View
              style={[
                styles.summaryGrid,
                { flexDirection: isRTL ? 'row-reverse' : 'row' },
              ]}
            >
              <View style={styles.summaryItem}>
                <HomeSummaryCard
                  compact
                  icon="home"
                  label={t('brain.results.properties')}
                  status={summaryStatus(propertyCount)}
                  testID="home-summary-properties"
                  tone="brand"
                />
              </View>
              <View style={styles.summaryItem}>
                <HomeSummaryCard
                  compact
                  icon="users"
                  label={t('brain.results.people')}
                  status={summaryStatus(peopleCount)}
                  testID="home-summary-people"
                  tone="communication"
                />
              </View>
              <View style={styles.summaryItem}>
                <HomeSummaryCard
                  compact
                  icon="clipboard"
                  label={t('brain.results.requirements')}
                  status={summaryStatus(requirementCount)}
                  testID="home-summary-requirements"
                  tone="data"
                />
              </View>
            </View>

          </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    paddingBottom: 34,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
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
    minHeight: 42,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 21,
  },
  integrityNotice: {
    minHeight: 46,
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  dashboardContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 96,
  },
  homeContent: {
    gap: 14,
    paddingTop: 2,
    paddingBottom: 14,
  },
  quickActions: {
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    flexBasis: '46%',
    flexGrow: 1,
    minWidth: 138,
    maxWidth: '50%',
  },
  summaryGrid: {
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryItem: {
    flexBasis: '29%',
    flexGrow: 1,
    minWidth: 104,
  },
});