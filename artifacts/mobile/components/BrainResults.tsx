import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice } from '@/constants/market';
import { useColors } from '@/hooks/useColors';
import { useI18n, type Translations } from '@/contexts/I18nContext';
import type {
  BrainPresentation,
  BrainPresentationProperty,
  BrainPresentationRequirement,
} from '@/services/brain';

export function BrainResults({ result }: { readonly result: BrainPresentation }) {
  const colors = useColors();
  const { t, isRTL, fonts, language } = useI18n();
  const router = useRouter();
  const tr = (key: string) => t(key as keyof Translations);
  const sectionTitle = (key: keyof Translations, count: number) => (
    <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
        {t(key)}
      </Text>
      <View style={[styles.count, { backgroundColor: colors.accent }]}>
        <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{count}</Text>
      </View>
    </View>
  );
  const empty = (
    <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name="search" size={24} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: 'center' }}>
        {t('brain.results.empty')}
      </Text>
    </View>
  );

  if (result.goal === 'property_search') {
    return (
      <View style={styles.container} testID="brain-results-properties">
        {sectionTitle('brain.results.properties', result.properties.length)}
        {result.properties.length ? result.properties.map(property => (
          <ResultCard
            key={property.id}
            title={tr(`propertyType.${property.propertyType}`)}
            subtitle={propertySummary(property, language, tr)}
            label={t('brain.results.openProperty')}
            isRTL={isRTL}
            onPress={() => router.push(`/property/${encodeURIComponent(property.id)}`)}
            testID={`brain-property-${property.id}`}
          />
        )) : empty}
      </View>
    );
  }

  if (result.goal === 'people_requirements_search') {
    const requirements = result.people.flatMap(group =>
      group.requirements.map(requirement => ({ requirement, personName: group.person.name })));
    return (
      <View style={styles.container} testID="brain-results-people">
        {sectionTitle('brain.results.people', result.people.length)}
        {result.people.length ? result.people.map(({ person }) => (
          <ResultCard
            key={person.id}
            title={person.name}
            subtitle={person.classifications.map(value => tr(`people.classification.${value}`)).join(' • ')}
            label={t('brain.results.openPerson')}
            isRTL={isRTL}
            onPress={() => router.push(`/person/${encodeURIComponent(person.id)}`)}
            testID={`brain-person-${person.id}`}
          />
        )) : empty}
        {requirements.length ? (
          <View style={styles.subsection}>
            {sectionTitle('brain.results.requirements', requirements.length)}
            {requirements.map(({ requirement, personName }) => (
              <ResultCard
                key={requirement.id}
                title={personName}
                subtitle={requirementSummary(requirement, language, tr)}
                label={t('brain.results.openRequirement')}
                isRTL={isRTL}
                onPress={() => router.push(`/requirement/${encodeURIComponent(requirement.id)}`)}
                testID={`brain-requirement-${requirement.id}`}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  const matches = result.runs.flatMap(run =>
    run.matches.map(match => ({ ...match, run })));
  return (
    <View style={styles.container} testID="brain-results-matches">
      {sectionTitle('brain.results.matches', matches.length)}
      {matches.length ? matches.map((item, index) => {
        const title = item.property
          ? tr(`propertyType.${item.property.propertyType}`)
          : t('brain.results.unavailable');
        const context = item.run.requirement
          ? requirementSummary(item.run.requirement, language, tr)
          : t('brain.results.unavailable');
        const property = item.property
          ? propertySummary(item.property, language, tr)
          : t('brain.results.unavailable');
        return (
          <ResultCard
            key={`${item.run.requirementId}-${item.property?.id ?? index}`}
            title={`${title} · ${Math.round(item.score)}%`}
            subtitle={[item.run.person?.name, context, property].filter(Boolean).join('\n')}
            label={t('brain.results.openMatch')}
            isRTL={isRTL}
            disabled={!item.run.requirement}
            onPress={() => router.push(
              `/matching?requirementId=${encodeURIComponent(item.run.requirement!.id)}`,
            )}
            testID={`brain-match-${item.run.requirementId}-${item.property?.id ?? index}`}
          />
        );
      }) : empty}
    </View>
  );
}

function ResultCard({
  title,
  subtitle,
  label,
  isRTL,
  onPress,
  testID,
  disabled = false,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly label: string;
  readonly isRTL: boolean;
  readonly onPress: () => void;
  readonly testID: string;
  readonly disabled?: boolean;
}) {
  const colors = useColors();
  const { fonts } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${title}`}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.accent : colors.card,
          borderColor: pressed ? colors.turquoise : colors.border,
          flexDirection: isRTL ? 'row-reverse' : 'row',
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.cardCopy}>
        <Text style={[styles.cardTitle, {
          color: colors.foreground,
          fontFamily: fonts.semiBold,
          textAlign: isRTL ? 'right' : 'left',
        }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, {
          color: colors.mutedForeground,
          fontFamily: fonts.regular,
          textAlign: isRTL ? 'right' : 'left',
        }]}>{subtitle}</Text>
      </View>
      <Feather
        name={isRTL ? 'chevron-left' : 'chevron-right'}
        size={20}
        color={colors.turquoise}
      />
    </Pressable>
  );
}

function propertySummary(
  property: BrainPresentationProperty,
  language: 'ar' | 'en',
  t: (key: string) => string,
): string {
  const area = getAreaById(property.areaId);
  return [
    language === 'ar' ? area?.ar : area?.en,
    t(`transaction.${property.transaction}`),
    formatPrice(property.priceAmount, property.currencyCode, language),
    property.activity,
  ].filter(Boolean).join(' • ');
}

function requirementSummary(
  requirement: BrainPresentationRequirement,
  language: 'ar' | 'en',
  t: (key: string) => string,
): string {
  const area = getAreaById(requirement.preferredAreaIds[0]);
  const usage = requirement.usage?.kind === 'activity'
    ? requirement.usage.value
    : requirement.usage
      ? t(requirement.usage.kind === 'occupancy'
        ? `matching.occupancy.${requirement.usage.value}`
        : `requirements.floor_use.${requirement.usage.value}`)
      : undefined;
  const budget = requirement.budgetMinimum !== undefined || requirement.budgetMaximum !== undefined
    ? [
        requirement.budgetMinimum === undefined
          ? undefined
          : formatPrice(requirement.budgetMinimum, requirement.currencyCode, language),
        requirement.budgetMaximum === undefined
          ? undefined
          : formatPrice(requirement.budgetMaximum, requirement.currencyCode, language),
      ].filter(Boolean).join(' – ')
    : undefined;
  return [
    t(`requirements.purpose.${requirement.purpose}`),
    t(`propertyType.${requirement.propertyType}`),
    usage,
    language === 'ar' ? area?.ar : area?.en,
    budget,
  ].filter(Boolean).join(' • ');
}

const styles = StyleSheet.create({
  container: { marginTop: 24, gap: 10 },
  subsection: { marginTop: 12, gap: 10 },
  sectionHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  heading: { fontSize: 17 },
  count: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  empty: { minHeight: 112, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18 },
  card: { minHeight: 72, borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 12 },
  cardCopy: { flex: 1, gap: 5 },
  cardTitle: { fontSize: 16 },
  cardSubtitle: { fontSize: 13, lineHeight: 19 },
});