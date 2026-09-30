import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SeekerRequirement } from '@workspace/property-domain';
import type { Person } from '@/services/people';
import { linkRequirementToSeeker } from '@/services/requirementOwnership';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';
import { canHydrateStudioRequirement, getStudioRequirementEditHref, isWantedStudio } from '@/services/propertyDetailPresentation';
import { getRequirementDetailIdentity, getRequirementDetailsRows, type RequirementDetailRow } from '@/services/requirementDetailsPresentation';
import { projectRequirementIntent } from '@/services/recordIntentPresentation';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
const sections = ['overview', 'location', 'specifications', 'preferences', 'budget', 'notes'] as const;

export default function RequirementDetailsScreen() {
  const params = useLocalSearchParams<{
    requirementId?: string | string[];
    link?: string | string[];
    postSave?: string | string[];
  }>();
  const id = getRequirementDetailIdentity(params.requirementId);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const [record, setRecord] = useState<SeekerRequirement | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [seekers, setSeekers] = useState<Person[]>([]);
  const [selectedSeekerId, setSelectedSeekerId] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkedPerson, setLinkedPerson] = useState<Person | null>(null);
  const [ownerState, setOwnerState] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle');
  const linkRequested = (Array.isArray(params.link) ? params.link[0] : params.link) === '1';
  const postSave = (Array.isArray(params.postSave) ? params.postSave[0] : params.postSave) === '1';
  const autoLinkOpened = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setRecord(null);
    setLinkedPerson(null);
    setOwnerState('idle');
    if (!id) {
      setState('missing');
      return () => { active = false; };
    }
    setState('loading');
    void store.getRequirement(id).then(async saved => {
      if (!active) return;
      if (saved?.id !== id) {
        setRecord(null);
        setState('missing');
        return;
      }
      setRecord(saved);
      setState('ready');
      if (!saved.seekerId) return;
      setOwnerState('loading');
      try {
        const person = await store.getPerson(saved.seekerId);
        if (!active) return;
        setLinkedPerson(person?.id === saved.seekerId ? person : null);
        setOwnerState(person?.id === saved.seekerId ? 'ready' : 'missing');
      } catch {
        if (active) {
          setLinkedPerson(null);
          setOwnerState('error');
        }
      }
    }).catch(() => { if (active) { setRecord(null); setState('error'); } });
    return () => { active = false; };
  }, [id, attempt]));

  const back = () => record?.seekerId
    ? router.replace(`/person/${encodeURIComponent(record.seekerId)}` as never)
    : router.replace('/properties' as never);
  const home = () => router.replace('/' as never);
  const openLink = useCallback(async () => {
    if (!record || record.seekerId) return;
    setLinkError('');
    try {
      const people = await store.getPeople();
      setSeekers(people.filter(person => person.classifications.includes('seeker')));
      setSelectedSeekerId('');
      setLinkOpen(true);
    } catch {
      setLinkError(language === 'ar' ? 'تعذر تحميل الأشخاص.' : 'People could not be loaded.');
    }
  }, [language, record]);
  useEffect(() => {
    if (state !== 'ready' || !record || record.seekerId || !linkRequested || autoLinkOpened.current) return;
    autoLinkOpened.current = true;
    void openLink();
  }, [linkRequested, openLink, record, state]);
  const confirmLink = async () => {
    if (!record || !selectedSeekerId || linkBusy) return;
    setLinkBusy(true);
    setLinkError('');
    const outcome = await linkRequirementToSeeker({ expected: record, seekerId: selectedSeekerId, store });
    setLinkBusy(false);
    if (outcome.status === 'linked' || outcome.status === 'already_linked') {
      setRecord(outcome.requirement);
      const person = seekers.find(candidate => candidate.id === outcome.requirement.seekerId) ?? null;
      setLinkedPerson(person);
      setOwnerState(person ? 'ready' : 'missing');
      setLinkOpen(false);
      router.setParams({ link: undefined, postSave: undefined });
      return;
    }
    setLinkError(language === 'ar' ? 'تعذر ربط الطلب بالشخص. أعد فتح الطلب وحاول مرة أخرى.' : 'The Requirement could not be linked. Reopen it and try again.');
  };
  const edit = () => {
    if (!record) return;
    const href = isWantedStudio(record) && canHydrateStudioRequirement(record)
      ? getStudioRequirementEditHref(record.id)
      : record.seekerId
        ? `/requirement/${encodeURIComponent(record.id)}?seekerId=${encodeURIComponent(record.seekerId)}`
        : `/requirement/${encodeURIComponent(record.id)}`;
    router.push(href as never);
  };
  const requirementIntent = record ? projectRequirementIntent(record, language) : undefined;
  const rows = record && state === 'ready'
    ? getRequirementDetailsRows(record, language, t).map(row => row.field === 'purpose'
      ? { ...row, value: requirementIntent!.label }
      : row)
    : [];
  const direction = isRTL ? 'row-reverse' as const : 'row' as const;
  const align = isRTL ? 'right' as const : 'left' as const;
  const caption = (en: string, ar: string) => language === 'ar' ? ar : en;
  const renderOwnerState = () => {
    if (!record?.seekerId) {
      return (
        <Text testID="requirement-owner-state" style={[styles.identifier, { color: colors.mutedForeground, fontFamily: fonts.medium, textAlign: align }]}>
          {caption('Not linked to a Person yet', 'غير مرتبط بشخص حتى الآن')}
        </Text>
      );
    }
    if (ownerState === 'idle' || ownerState === 'loading') {
      return (
        <Text testID="requirement-owner-loading" style={[styles.identifier, { color: colors.mutedForeground, fontFamily: fonts.medium, textAlign: align }]}>
          {caption('Loading linked Person…', 'جارٍ تحميل الشخص المرتبط…')}
        </Text>
      );
    }
    if (ownerState === 'ready' && linkedPerson) {
      return (
        <TouchableOpacity
          testID="requirement-linked-person"
          accessibilityRole="button"
          onPress={() => router.push(`/person/${encodeURIComponent(linkedPerson.id)}` as never)}
        >
          <Text style={[styles.identifier, { color: colors.primary, fontFamily: fonts.medium, textAlign: align }]}>
            {caption(`Linked to: ${linkedPerson.name}`, `مرتبط بـ: ${linkedPerson.name}`)}
          </Text>
        </TouchableOpacity>
      );
    }
    return (
      <Text testID="requirement-owner-state" style={[styles.identifier, { color: colors.destructive, fontFamily: fonts.medium, textAlign: align }]}>
        {ownerState === 'missing'
          ? caption('The linked Person could not be found.', 'تعذر العثور على الشخص المرتبط.')
          : caption('The linked Person could not be loaded.', 'تعذر تحميل الشخص المرتبط.')}
      </Text>
    );
  };
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
                {requirementIntent?.label} · {t(`propertyType.${record.propertyType}`)}
            </Text>
            {renderOwnerState()}
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
          {!record.seekerId ? (
            <View style={styles.linkActions}>
              {linkError ? <Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{linkError}</Text> : null}
              <Button title={caption('Link existing Person', 'ربط بشخص موجود')} onPress={() => void openLink()} testID="requirement-link-existing" />
              <Button
                title={caption('Add Person and link', 'إضافة شخص وربطه')}
                onPress={() => router.push({ pathname: '/person/new', params: { returnRequirementId: record.id } } as never)}
                variant="outline"
                testID="requirement-add-person"
              />
              {postSave ? (
                <Button
                  title={caption('Link later', 'الربط لاحقاً')}
                  onPress={() => router.replace('/properties' as never)}
                  variant="outline"
                  testID="requirement-link-later"
                />
              ) : null}
            </View>
          ) : null}
          {!postSave || record.seekerId ? (
            <Button title={t('requirements.edit')} onPress={edit} testID="requirement-details-edit" />
          ) : null}
        </ScrollView>
      )}
      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.linkSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.messageTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: align }]}>
              {caption('Choose a Seeker', 'اختر باحثاً')}
            </Text>
            {seekers.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: align }}>
                {caption('No Seeker Person is available.', 'لا يوجد شخص مصنف كباحث.')}
              </Text>
            ) : seekers.map(person => (
              <TouchableOpacity key={person.id} onPress={() => setSelectedSeekerId(person.id)}
                accessibilityRole="radio" accessibilityState={{ checked: selectedSeekerId === person.id }}
                style={[styles.seekerChoice, { borderColor: selectedSeekerId === person.id ? colors.primary : colors.border }]}>
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{person.name}</Text>
              </TouchableOpacity>
            ))}
            {linkError ? <Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{linkError}</Text> : null}
            <Button title={caption('Link', 'ربط')} onPress={() => void confirmLink()} disabled={!selectedSeekerId || linkBusy} loading={linkBusy} testID="requirement-confirm-link" />
            <Button title={t('capture.cancel')} onPress={() => setLinkOpen(false)} variant="outline" />
          </View>
        </View>
      </Modal>
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
  linkActions: { gap: 10 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 20 },
  linkSheet: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  seekerChoice: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' },
});