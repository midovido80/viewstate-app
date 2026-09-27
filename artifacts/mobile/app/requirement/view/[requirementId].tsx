import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SeekerRequirement } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';
import { canHydrateStudioRequirement, getStudioRequirementEditHref, isWantedStudio } from '@/services/propertyDetailPresentation';
import { getRequirementDetailIdentity, getRequirementDetailsRows, type RequirementDetailRow } from '@/services/requirementDetailsPresentation';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
const sections = ['overview', 'location', 'specifications', 'preferences', 'budget', 'notes'] as const;

export default function RequirementDetailsScreen() {
  const params = useLocalSearchParams<{ requirementId?: string | string[] }>();
  const id = getRequirementDetailIdentity(params.requirementId);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const [record, setRecord] = useState<SeekerRequirement | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setRecord(null);
    if (!id) {
      setState('missing');
      return () => { active = false; };
    }
    setState('loading');
    void store.getRequirement(id).then(saved => {
      if (!active) return;
      setRecord(saved?.id === id ? saved : null);
      setState(saved?.id === id ? 'ready' : 'missing');
    }).catch(() => { if (active) { setRecord(null); setState('error'); } });
    return () => { active = false; };
  }, [id, attempt]));

  const back = () => record?.seekerId && router.replace(`/person/${encodeURIComponent(record.seekerId)}` as never);
  const home = () => router.replace('/' as never);
  const edit = () => {
    if (!record) return;
    const href = isWantedStudio(record) && canHydrateStudioRequirement(record)
      ? getStudioRequirementEditHref(record.id)
      : `/requirement/${encodeURIComponent(record.id)}?seekerId=${encodeURIComponent(record.seekerId)}`;
    router.push(href as never);
  };
  const rows = record && state === 'ready' ? getRequirementDetailsRows(record, language, t) : [];
  const direction = isRTL ? 'row-reverse' as const : 'row' as const;
  const align = isRTL ? 'right' as const : 'left' as const;
  const caption = (en: string, ar: string) => language === 'ar' ? ar : en;
  const sectionLabels: Record<RequirementDetailRow['section'], string> = {
    overview: caption('THE REQUEST', 'الطلب'),
    location: caption('LOCATION', 'الموقع'),
    specifications: caption('SPECIFICATIONS', 'المواصفات'),
    preferences: caption('PREFERENCES', 'التفضيلات'),
    budget: caption('BUDGET', 'الميزانية'),
    notes: caption('NOTES', 'ملاحظات'),
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top }]}>
      <View style={[styles.header, { flexDirection: direction, borderBottomColor: colors.border }]}>
        <TouchableOpacity testID="requirement-details-back" accessibilityRole="button" accessibilityLabel={t('capture.back')}
          onPress={back} disabled={!record} style={styles.headerAction}>
          <Text style={{ color: record ? colors.primary : colors.mutedForeground, fontFamily: fonts.semiBold }}>{t('capture.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('requirements.view')}</Text>
        <TouchableOpacity testID="requirement-details-home" accessibilityRole="button" onPress={home} style={styles.headerAction}>
          <Text style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: 'right' }}>{t('home.title')}</Text>
        </TouchableOpacity>
      </View>
      {state !== 'ready' || !record ? (
        <View style={styles.message} testID={`requirement-details-${state}`}>
          {state === 'loading' ? (
            <>
              <View style={[styles.skeletonTitle, { backgroundColor: colors.border }]} />
              <View style={[styles.skeletonLine, { backgroundColor: colors.border }]} />
              <View style={[styles.skeletonLine, { backgroundColor: colors.border, width: '68%' }]} />
            </>
          ) : (
            <>
              <Text style={[styles.messageTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: align }]}>
                {state === 'missing' ? t('requirements.not_found') : caption('Requirement could not be loaded.', 'تعذر تحميل الطلب.')}
              </Text>
              {state === 'error' ? <Button title={t('search.retry')} onPress={() => setAttempt(value => value + 1)} testID="requirement-details-retry" /> : null}
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 42 }]}
          testID={`requirement-details-record-${record.id}`}>
          <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.eyebrow, { color: colors.primary, fontFamily: fonts.semiBold, textAlign: align }]}>
              {caption('SAVED REQUIREMENT', 'طلب محفوظ')}
            </Text>
            <Text style={[styles.heroTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: align }]}>
              {t(`requirements.purpose.${record.purpose}`)} · {t(`propertyType.${record.propertyType}`)}
            </Text>
            <Text testID="requirement-details-id" selectable style={[styles.identifier, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: align }]}>
              {record.id}
            </Text>
          </View>
          {sections.map(section => {
            const group = rows.filter(row => row.section === section);
            if (!group.length) return null;
            return (
              <View key={section} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.primary, fontFamily: fonts.semiBold, textAlign: align }]}>
                  {sectionLabels[section]}
                </Text>
                <View style={[styles.rowGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {group.map((row, index) => (
                    <View key={row.field} testID={`requirement-details-row-${row.field}`}
                      style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <Text style={[styles.rowLabel, { color: colors.mutedForeground, fontFamily: fonts.medium, textAlign: align }]}>{row.label}</Text>
                      <Text selectable style={[styles.rowValue, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: align }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
          <Button title={t('requirements.edit')} onPress={edit} testID="requirement-details-edit" />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 58, borderBottomWidth: StyleSheet.hairlineWidth },
  headerAction: { minWidth: 64, paddingVertical: 12 },
  headerTitle: { fontSize: 15, flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: 18, paddingTop: 20, gap: 26 },
  hero: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 22, paddingVertical: 24, gap: 8 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4 },
  heroTitle: { fontSize: 25, lineHeight: 31 },
  identifier: { fontSize: 11, marginTop: 7 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.2, marginHorizontal: 4 },
  rowGroup: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { paddingHorizontal: 18, paddingVertical: 15, gap: 5 },
  rowLabel: { fontSize: 12 },
  rowValue: { fontSize: 15, lineHeight: 22 },
  message: { paddingHorizontal: 24, paddingTop: 60, gap: 18 },
  messageTitle: { fontSize: 21, lineHeight: 29 },
  skeletonTitle: { width: '50%', height: 26, borderRadius: 6 },
  skeletonLine: { width: '100%', height: 72, borderRadius: 12 },
});