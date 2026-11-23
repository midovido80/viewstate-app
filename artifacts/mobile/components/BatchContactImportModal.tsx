import { Feather } from '@expo/vector-icons';
import { PhoneCountrySheet } from '@/components/PhoneCountrySheet';
import { PhoneNumberText } from '@/components/PhoneNumberText';
import { TextInput } from '@/components/FormField';
import { useUserData } from '@/contexts/UserDataContext';
import { CANCEL_ACTION_COLOR } from '@/constants/cancelAction';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Contacts from 'expo-contacts';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n, type Translations } from '@/contexts/I18nContext';

import { generateDomainId } from '@/services/identity';
import { type PersonClassification } from '@/services/people';
import {
  buildContactImportCandidates,
  contactPhonePresentation,
  inferPhoneCountry,
  isExplicitInternationalPhone,
  normalizePhoneForCountry,
  PHONE_COUNTRIES,
  phoneDigits,
  type ContactImportCandidate,
  type PhoneCountryCode,
} from '@/services/phoneEntry';
import {
  importReviewedContactBatch,
  summarizeContactImportResults,
  type ContactBatchImportSummary,
  type ReviewedContactImportEntry,
} from '@/services/contactBatchImport';
import { createContactBatchSubmissionGuard } from '@/services/contactBatchSubmissionGuard';

type Stage = 'select' | 'review' | 'result';
type PermissionState = 'idle' | 'loading' | 'ready' | 'limited' | 'denied' | 'blocked' | 'unavailable' | 'error';
interface SelectedContact {
  readonly candidate: ContactImportCandidate;
  readonly phoneKey?: string;
  readonly country?: PhoneCountryCode;
  readonly editedPhone?: string;
}

export function BatchContactImportModal({
  visible,
  classifications,
  onClose,
  onImported,
}: {
  visible: boolean;
  classifications: readonly PersonClassification[];
  onClose: () => void;
  onImported: (summary: ContactBatchImportSummary | null) => void;
}) {
  const { store } = useUserData();
  const colors = useColors();
  const insets = useScreenInsets();
  const { t, isRTL, fonts } = useI18n();
  const [stage, setStage] = useState<Stage>('select');
  const [permissionState, setPermissionState] = useState<PermissionState>('idle');
  const [candidates, setCandidates] = useState<ContactImportCandidate[]>([]);
  const [selected, setSelected] = useState<Record<string, SelectedContact>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<ContactBatchImportSummary | null>(null);
  const [excludedCount, setExcludedCount] = useState(0);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [countryFor, setCountryFor] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [showExcluded, setShowExcluded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const loadingContacts = useRef(false);
  const generation = useRef(0);
  const align = isRTL ? 'right' : 'left';
  const row = isRTL ? 'row-reverse' : 'row';
  const L = (ar: string, en: string) => isRTL ? ar : en;
  const submissionGuard = useRef(createContactBatchSubmissionGuard()).current;

  const resetAndClose = () => {
    if (submissionGuard.isRunning() || saving) return;
    generation.current++;
    loadingContacts.current = false;
    setPermissionState('idle');
    setCountryFor(undefined);
    setEditing(undefined);
    setShowExcluded(false);
    setSaveError(false);
    setStage('select');
    setSelected({});
    setSearch('');
    setSummary(null);
    onClose();
  };

  const loadContacts = async () => {
    if (Platform.OS === 'web') {
      setPermissionState('unavailable');
      return;
    }
    if (loadingContacts.current) return;
    loadingContacts.current = true;
    const current = ++generation.current;
    setPermissionState('loading');
    setExistingPhones(new Set());
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (current !== generation.current) return;
      if (permission.status !== 'granted') {
        setPermissionState(permission.canAskAgain === false ? 'blocked' : 'denied');
        return;
      }
      void store.getPeople().then(people => {
        if (current === generation.current) setExistingPhones(new Set(people.map(person => person.normalizedPhone)));
      }).catch(() => undefined);
      const result = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.FirstName, Contacts.Fields.LastName, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });
      if (current !== generation.current) return;
      const normalized = buildContactImportCandidates(result.data);
      setCandidates(normalized);
      setExcludedCount(Math.max(0, result.data.length - normalized.length));
      const access = 'accessPrivileges' in permission
        ? (permission as { accessPrivileges?: string }).accessPrivileges
        : undefined;
      setPermissionState(access === 'limited' ? 'limited' : 'ready');
    } catch {
      if (current === generation.current) setPermissionState('error');
    } finally {
      if (current === generation.current) loadingContacts.current = false;
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const digits = phoneDigits(search);
    if (!query) return candidates;
    return candidates.filter(candidate =>
      candidate.name.toLocaleLowerCase().includes(query)
      || (!!digits && candidate.phones.some(phone => phone.normalizedDigits.includes(digits))),
    );
  }, [candidates, search]);

  const toggleCandidate = (candidate: ContactImportCandidate) => {
    setSelected(current => {
      if (current[candidate.key]) {
        const next = { ...current };
        delete next[candidate.key];
        return next;
      }
      const onlyPhone = candidate.phones.length === 1 ? candidate.phones[0] : undefined;
      return {
        ...current,
        [candidate.key]: {
          candidate,
          phoneKey: onlyPhone?.key,
          country: onlyPhone ? inferPhoneCountry(onlyPhone.phone) ?? undefined : undefined,
        },
      };
    });
  };

  const selectPhone = (contactKey: string, phoneKey: string) => {
    setSelected(current => {
      const item = current[contactKey];
      if (!item) return current;
      const phone = item.candidate.phones.find(candidate => candidate.key === phoneKey);
      return {
        ...current,
        [contactKey]: {
          ...item,
          phoneKey,
          editedPhone: undefined,
          country: phone ? inferPhoneCountry(phone.phone) ?? undefined : item.country,
        },
      };
    });
  };

  const setCountry = (contactKey: string, country: PhoneCountryCode) => {
    setSelected(current => current[contactKey]
      ? { ...current, [contactKey]: { ...current[contactKey], country } }
      : current);
  };

  const changeNumber = (contactKey: string, number: string) => {
    setSelected(current => {
      const entry = current[contactKey];
      return entry ? { ...current, [contactKey]: { ...entry, editedPhone: number } } : current;
    });
  };

  const reviewedEntries = useMemo<ReviewedContactImportEntry[]>(() =>
    Object.values(selected).flatMap(item => {
      const phone = item.candidate.phones.find(candidate => candidate.key === item.phoneKey);
      if (!phone) return [];
      const raw = item.editedPhone ?? phone.phone;
      if (!phoneDigits(raw) || (!item.country && !isExplicitInternationalPhone(raw))) return [];
      const normalizedPhone = normalizePhoneForCountry(raw, item.country ?? 'KW');
      if (!normalizedPhone || normalizedPhone === '+') return [];
      return [{
        key: item.candidate.key,
        name: item.candidate.name,
        displayPhone: raw,
        normalizedPhone,
      }];
    }), [selected]);
  const selectedCount = Object.keys(selected).length;
  const unresolvedPhoneCount = Object.values(selected).filter(item => !item.phoneKey).length;
  const unresolvedCount = selectedCount - reviewedEntries.length;
  const reviewDispositions = useMemo(() => {
    const seen = new Set<string>();
    return new Map(reviewedEntries.map(entry => {
      const duplicate = existingPhones.has(entry.normalizedPhone) || seen.has(entry.normalizedPhone);
      seen.add(entry.normalizedPhone);
      return [entry.key, duplicate ? 'duplicate' : 'ready'] as const;
    }));
  }, [reviewedEntries, existingPhones]);

  function resetSelectionAfterSave() {
    generation.current++;
    setPermissionState('idle');
    setStage('select');
    setSearch('');
    setSelected({});
    setSummary(null);
    setEditing(undefined);
    setCountryFor(undefined);
    setShowExcluded(false);
  }

  const confirm = async (entries: readonly ReviewedContactImportEntry[] = reviewedEntries) => {
    if (entries.length === 0) return;
    await submissionGuard.run(async () => {
      setSaving(true);
      setSaveError(false);
      try {
        const result = await importReviewedContactBatch({
          classifications,
          entries,
          store,
          generateId: generateDomainId,
        });
        if (entries.length === 1 && result.imported === 1) {
          resetSelectionAfterSave();
          onImported(result);
        } else {
          setSummary(result);
          setStage('result');
        }
      } catch {
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    });
  };

  const retryFailures = async () => {
    const failures = summary?.results
      .filter(result => result.disposition === 'failed')
      .map(result => result.entry) ?? [];
    if (failures.length === 0 || !summary) return;
    await submissionGuard.run(async () => {
      setSaving(true);
      setSaveError(false);
      try {
        const retried = await importReviewedContactBatch({
          classifications,
          entries: failures,
          store,
          generateId: generateDomainId,
        });
        const retriedByKey = new Map(retried.results.map(result => [result.entry.key, result]));
        setSummary(summarizeContactImportResults(summary.results.map(result =>
          result.disposition === 'failed' ? retriedByKey.get(result.entry.key) ?? result : result)));
      } catch {
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    });
  };

  const permissionMessage = permissionState === 'unavailable'
    ? t('people.contacts_unavailable')
    : permissionState === 'denied' || permissionState === 'blocked'
      ? t('people.contacts_denied')
      : permissionState === 'error'
        ? t('people.contacts_load_failed')
        : permissionState === 'limited'
          ? t('people.import_limited')
          : '';

  const title = stage === 'select' ? L('اختيار جهات الاتصال', 'Choose contacts')
    : stage === 'review' ? L('مراجعة جهات الاتصال', 'Review contacts') : t('people.import_result');
  const activeCountry = countryFor ? selected[countryFor]?.country : undefined;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => {
      if (countryFor) { setCountryFor(undefined); return; }
      if (submissionGuard.isRunning() || saving) return;
      if (stage === 'review') setStage('select'); else resetAndClose();
    }}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, StatusBar.currentHeight ?? 0, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.header, { flexDirection: row }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: align }]}>{title}</Text>
          <Pressable style={styles.close} onPress={resetAndClose} accessibilityRole="button" accessibilityLabel={t('capture.cancel')} testID="contact-import-cancel">
            <Feather name="x" size={22} color={CANCEL_ACTION_COLOR} />
          </Pressable>
        </View>
        {stage !== 'result' && <Text style={[styles.context, { color: colors.mutedForeground, fontFamily: fonts.medium, textAlign: align }]}>
          {classifications.map(role => t('people.classification.' + role)).join(' · ')}
        </Text>}

        {stage === 'select' ? (
          <>
            {permissionState === 'idle' ? (
              <View style={styles.center}>
                <Text style={{ color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{t('people.import_privacy')}</Text>
                <Button title={t('people.import_open_contacts')} onPress={() => void loadContacts()} testID="contact-import-open" />
              </View>
            ) : permissionState === 'loading' ? (
              <View style={styles.center} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <Text style={{ textAlign: align, color: colors.mutedForeground }}>{t('people.contacts_loading')}</Text>
              </View>
            ) : permissionMessage && permissionState !== 'limited' ? (
              <View style={styles.center}>
                <Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{permissionMessage}</Text>
                {permissionState === 'blocked' ? <Button title={t('people.open_settings')} onPress={() => void Linking.openSettings()} variant="outline" testID="contact-import-settings" /> : null}
                <Button title={t('people.import_check_access')} onPress={() => void loadContacts()} variant="outline" testID="contact-import-retry-access" />
              </View>
            ) : (
              <>
                {permissionMessage ? <Text style={[styles.message, { color: colors.mutedForeground }]}>{permissionMessage}</Text> : null}
                <TextInput value={search} onChangeText={setSearch} placeholder={t('people.contact_search')} placeholderTextColor={colors.mutedForeground} style={[styles.search, { color: colors.foreground, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]} testID="contact-import-search" />
                <FlatList
                  style={styles.flexList}
                  data={filtered}
                  keyboardShouldPersistTaps="handled"
                  extraData={selected}
                  keyExtractor={item => item.key}
                  contentContainerStyle={styles.list}
                  ListEmptyComponent={<Text style={{ color: colors.mutedForeground, textAlign: align }}>
                    {search.trim() ? L('ما لقينا جهة اتصال بهذا البحث.', 'No contacts match this search.') : t('people.contacts_empty')}
                  </Text>}
                  renderItem={({ item }) => {
                    const selection = selected[item.key];
                    return (
                      <View style={[styles.contact, { borderColor: selection ? colors.primary : colors.border, backgroundColor: selection ? colors.primary + '12' : colors.card }]}>
                        <Pressable onPress={() => toggleCandidate(item)} accessibilityRole="checkbox" accessibilityLabel={item.name}
                          accessibilityState={{ checked: Boolean(selection) }} style={[styles.contactButton, { flexDirection: row }]}
                          testID={'contact-import-choice-' + item.key}>
                          <View style={styles.contactText}>
                            <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign: align, writingDirection: 'auto' }}>{item.name}</Text>
                            {!selection && <PhoneNumberText style={{ color: colors.mutedForeground, textAlign: align }}>{contactPhonePresentation(item.phones[0].phone)}</PhoneNumberText>}
                          </View>
                          <Feather name={selection ? 'check-square' : 'square'} size={22} color={selection ? colors.primary : colors.mutedForeground} />
                        </Pressable>
                        {selection && item.phones.length === 1 && <PhoneNumberText style={[styles.singlePhone, { color: colors.mutedForeground, textAlign: align }]}>
                          {contactPhonePresentation(item.phones[0].phone)}
                        </PhoneNumberText>}
                        {selection && item.phones.length > 1 && <>
                          <Text style={[styles.singlePhone, { color: colors.mutedForeground, textAlign: align }]}>{L('أي رقم تبي تحفظ؟', 'Which number do you want to save?')}</Text>
                          {item.phones.map(phone => (
                            <Pressable key={phone.key} onPress={() => selectPhone(item.key, phone.key)} accessibilityRole="radio"
                              accessibilityState={{ selected: selection.phoneKey === phone.key }} testID={'contact-import-phone-' + phone.key}
                              style={[styles.phoneOption, { flexDirection: row }]}>
                              <Feather name={selection.phoneKey === phone.key ? 'check-circle' : 'circle'} color={colors.primary} size={18} />
                              <PhoneNumberText style={{ textAlign: align, color: colors.foreground }}>{contactPhonePresentation(phone.phone)}</PhoneNumberText>
                            </Pressable>
                          ))}
                        </>}
                      </View>
                    );
                  }}
                />
                <View style={styles.footer}>
                  {excludedCount > 0 && <>
                    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showExcluded }} onPress={() => setShowExcluded(value => !value)} style={styles.quiet}>
                      <Text style={{ color: colors.primary, textAlign: align }}>{L('جهات لم تظهر', 'Contacts not shown')} ({excludedCount})</Text>
                    </Pressable>
                    {showExcluded && <Text style={{ color: colors.mutedForeground, textAlign: align }}>{t('people.import_excluded').replace('{count}', String(excludedCount))}</Text>}
                  </>}
                  <Button title={t('people.import_review_count').replace('{count}', String(selectedCount))} onPress={() => setStage('review')} disabled={selectedCount === 0 || unresolvedPhoneCount > 0} testID="contact-import-review" />
                  {unresolvedPhoneCount > 0 ? <Text style={{ color: colors.destructive, textAlign: isRTL ? 'right' : 'left' }}>{t('people.import_choose_phone')}</Text> : null}
                </View>
              </>
            )}
          </>
        ) : stage === 'review' ? (
          <>
            <FlatList style={styles.flexList} data={Object.values(selected)} keyExtractor={item => item.candidate.key}
              contentContainerStyle={styles.review} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const phone = item.candidate.phones.find(candidate => candidate.key === item.phoneKey);
                const raw = item.editedPhone ?? phone?.phone ?? '';
                const international = isExplicitInternationalPhone(raw);
                const country = PHONE_COUNTRIES.find(value => value.code === (international ? inferPhoneCountry(raw) : item.country));
                const resolved = reviewedEntries.find(entry => entry.key === item.candidate.key);
                return <View style={[styles.reviewRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={[styles.wrappingText, { color: colors.foreground, fontFamily: fonts.bold, textAlign: align }]}>{item.candidate.name}</Text>
                  <View style={[styles.reviewLine, { flexDirection: row }]}>
                    <Text style={{ color: colors.mutedForeground, flex: 1, textAlign: align }}>{L('الرقم من جهات الاتصال', 'Number from contacts')}</Text>
                    <PhoneNumberText style={{ color: colors.foreground }}>{contactPhonePresentation(phone?.phone ?? '')}</PhoneNumberText>
                  </View>
                  {editing === item.candidate.key && <TextInput value={raw} onChangeText={value => changeNumber(item.candidate.key, value)}
                    accessibilityLabel={L('تعديل رقم الهاتف', 'Edit phone number')} keyboardType="phone-pad" autoFocus autoCorrect={false}
                    style={{ writingDirection: 'ltr', textAlign: align, color: colors.foreground }} testID="contact-import-edit-number" />}
                  <Pressable accessibilityRole={international ? undefined : 'button'} disabled={international}
                    testID="contact-import-country" onPress={() => setCountryFor(item.candidate.key)}
                    style={[styles.countryLine, { flexDirection: row, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.mutedForeground, textAlign: align }}>{L('الدولة', 'Country')}</Text>
                      <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign: align }}>
                        {country ? t(country.translationKey) : international ? L('رقم دولي', 'International number') : L('اختار الدولة', 'Choose country')}
                      </Text>
                    </View>
                    {country && <PhoneNumberText style={{ color: colors.foreground }}>{'+' + country.dialCode}</PhoneNumberText>}
                    {!international && <Feather name="chevron-down" size={19} color={colors.primary} />}
                  </Pressable>
                  {!phoneDigits(raw) && <Text style={{ color: colors.destructive, textAlign: align }}>{t('people.phone_required')}</Text>}
                  {phoneDigits(raw) !== '' && !international && !item.country && <Text style={{ color: colors.mutedForeground, textAlign: align }}>{t('people.import_choose_country')}</Text>}
                  {resolved && <View style={[styles.reviewLine, styles.preview, { flexDirection: row, backgroundColor: colors.primary + '14' }]}>
                    <Text style={{ color: colors.foreground, flex: 1, textAlign: align }}>{L('الرقم اللي راح ينحفظ', 'Number that will be saved')}</Text>
                    <PhoneNumberText style={{ color: colors.primary, fontFamily: fonts.bold }}>{contactPhonePresentation(raw, resolved.normalizedPhone)}</PhoneNumberText>
                  </View>}
                  {reviewDispositions.get(item.candidate.key) === 'duplicate' && <Text style={{ color: colors.destructive, textAlign: align }}>{t('people.import_status.duplicate')}</Text>}
                  <View style={[styles.reviewLine, { flexDirection: row }]}>
                    <Pressable accessibilityRole="button" disabled={saving} style={styles.quiet}
                      onPress={() => setEditing(value => value === item.candidate.key ? undefined : item.candidate.key)}>
                      <Text style={{ color: colors.primary }}>{editing === item.candidate.key ? L('تم التعديل', 'Done editing') : L('تعديل الرقم', 'Edit number')}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={saving} style={styles.quiet}
                      onPress={() => toggleCandidate(item.candidate)} testID={'contact-import-remove-' + item.candidate.key}>
                      <Text style={{ color: colors.destructive }}>{t('people.import_remove')}</Text>
                    </Pressable>
                  </View>
                </View>;
              }} />
            <View style={styles.footer}>
              {saveError && <Text accessibilityRole="alert" style={{ color: colors.destructive, textAlign: align }}>{L('تعذّر الحفظ. حاول مرة ثانية.', 'Could not save. Try again.')}</Text>}
              <Button title={selectedCount === 1 ? L('حفظ جهة الاتصال', 'Save contact') : t('people.import_confirm')}
                onPress={() => void confirm()} loading={saving} disabled={saving || reviewedEntries.length === 0 || unresolvedCount > 0} testID="contact-import-confirm" />
              <Pressable accessibilityRole="button" disabled={saving} style={[styles.quiet, { alignItems: 'center' }]}
                onPress={() => setStage('select')} testID="contact-import-back">
                <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('capture.back')}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <FlatList
            style={styles.flexList}
            data={summary?.results ?? []}
            keyExtractor={result => result.entry.key}
            contentContainerStyle={styles.center}
            ListHeaderComponent={<>
              <Text style={{ color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }}>{t('people.import_result')}</Text>
              <Text style={{ color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }}>{t('people.import_counts')
                .replace('{imported}', String(summary?.imported ?? 0))
                .replace('{skipped}', String(summary?.skipped ?? 0))
                .replace('{failed}', String(summary?.failed ?? 0))}</Text>
            </>}
            renderItem={({ item: result }) => <Text style={[styles.wrappingText, { color: result.disposition === 'imported' ? colors.primary : colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }]}>{result.entry.name}: {t(`people.import_status.${result.disposition}` as keyof Translations)}</Text>}
            ListFooterComponent={<View style={styles.reviewActions}>
              {(summary?.failed ?? 0) > 0 ? <Button title={t('people.import_retry_failed')} onPress={() => void retryFailures()} loading={saving} testID="contact-import-retry" /> : null}
              {saveError && <Text accessibilityRole="alert" style={{ color: colors.destructive, textAlign: align }}>{L('تعذّر الحفظ. حاول مرة ثانية.', 'Could not save. Try again.')}</Text>}
              <Button title={t('people.import_done')} onPress={() => { const finished = summary; resetSelectionAfterSave(); onImported(finished); }} disabled={saving} testID="contact-import-done" />
            </View>}
          />
        )}
        {countryFor && <PhoneCountrySheet key={countryFor} country={activeCountry}
          onClose={() => setCountryFor(undefined)} onSelect={country => { setCountry(countryFor, country); setCountryFor(undefined); }} />}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { direction: 'ltr', minHeight: 56, paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  title: { fontSize: 21, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  context: { paddingHorizontal: 20, paddingBottom: 8 },
  center: { padding: 24, gap: 16 },
  message: { paddingHorizontal: 20, paddingVertical: 8 },
  search: { minHeight: 50, marginHorizontal: 20, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 },
  list: { padding: 20, gap: 10 },
  flexList: { flex: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 10, gap: 8 },
  contact: { borderWidth: 1, borderRadius: 12 },
  contactButton: { minHeight: 54, direction: 'ltr', padding: 12, alignItems: 'center', gap: 12 },
  contactText: { flex: 1, minWidth: 0, gap: 2 },
  singlePhone: { paddingHorizontal: 12, paddingBottom: 8 },
  phoneOption: { minHeight: 48, direction: 'ltr', paddingHorizontal: 12, alignItems: 'center', gap: 10 },
  review: { padding: 20, gap: 12 },
  reviewActions: { gap: 12, paddingTop: 8 },
  reviewRow: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 5 },
  wrappingText: { flexShrink: 1, lineHeight: 22 },
  reviewLine: { direction: 'ltr', alignItems: 'center', gap: 10, minHeight: 44 },
  countryLine: { direction: 'ltr', borderWidth: 1, borderRadius: 10, padding: 9, gap: 8, minHeight: 54, alignItems: 'center' },
  preview: { borderRadius: 10, paddingHorizontal: 10 },
  quiet: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
