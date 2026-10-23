import { CANCEL_ACTION_COLOR } from '@/constants/cancelAction';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Contacts from 'expo-contacts';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n, type Translations } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';
import { generateDomainId } from '@/services/identity';
import { type PersonClassification } from '@/services/people';
import {
  buildContactImportCandidates,
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
}

export function BatchContactImportModal({
  visible,
  classification,
  onClose,
  onImported,
}: {
  visible: boolean;
  classification: PersonClassification;
  onClose: () => void;
  onImported: () => void;
}) {
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
  const submissionGuard = useRef(createContactBatchSubmissionGuard()).current;

  const resetAndClose = () => {
    if (submissionGuard.isRunning() || saving) return;
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
    setPermissionState('loading');
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setPermissionState(permission.canAskAgain === false ? 'blocked' : 'denied');
        return;
      }
      const [result, people] = await Promise.all([
        Contacts.getContactsAsync({
          fields: [Contacts.Fields.FirstName, Contacts.Fields.LastName, Contacts.Fields.PhoneNumbers],
          sort: Contacts.SortTypes.FirstName,
        }),
        store.getPeople(),
      ]);
      const normalized = buildContactImportCandidates(result.data);
      setCandidates(normalized);
      setExcludedCount(Math.max(0, result.data.length - normalized.length));
      setExistingPhones(new Set(people.map(person => person.normalizedPhone)));
      const access = 'accessPrivileges' in permission
        ? (permission as { accessPrivileges?: string }).accessPrivileges
        : undefined;
      setPermissionState(access === 'limited' ? 'limited' : 'ready');
    } catch {
      setPermissionState('error');
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

  const reviewedEntries = useMemo<ReviewedContactImportEntry[]>(() =>
    Object.values(selected).flatMap(item => {
      const phone = item.candidate.phones.find(candidate => candidate.key === item.phoneKey);
      if (!phone || (!item.country && !isExplicitInternationalPhone(phone.phone))) return [];
      return [{
        key: item.candidate.key,
        name: item.candidate.name,
        displayPhone: phone.phone,
        normalizedPhone: normalizePhoneForCountry(phone.phone, item.country ?? 'KW'),
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

  const confirm = async (entries: readonly ReviewedContactImportEntry[] = reviewedEntries) => {
    if (entries.length === 0) return;
    await submissionGuard.run(async () => {
      setSaving(true);
      try {
        setSummary(await importReviewedContactBatch({
          classification,
          entries,
          store,
          generateId: generateDomainId,
        }));
        setStage('result');
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
      try {
        const retried = await importReviewedContactBatch({
          classification,
          entries: failures,
          store,
          generateId: generateDomainId,
        });
        const retriedByKey = new Map(retried.results.map(result => [result.entry.key, result]));
        setSummary(summarizeContactImportResults(summary.results.map(result =>
          result.disposition === 'failed' ? retriedByKey.get(result.entry.key) ?? result : result)));
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={resetAndClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>
            {t(`people.classification.${classification}` as keyof Translations)}
          </Text>
          <TouchableOpacity onPress={resetAndClose} accessibilityRole="button" testID="contact-import-cancel">
            <Text style={{ color: CANCEL_ACTION_COLOR, fontFamily: fonts.semiBold }}>{t('capture.cancel')}</Text>
          </TouchableOpacity>
        </View>

        {stage === 'select' ? (
          <>
            {permissionState === 'idle' ? (
              <View style={styles.center}>
                <Text style={{ color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{t('people.import_privacy')}</Text>
                <Button title={t('people.import_open_contacts')} onPress={() => void loadContacts()} testID="contact-import-open" />
              </View>
            ) : permissionState === 'loading' ? (
              <Text style={[styles.message, { color: colors.mutedForeground }]}>{t('people.contacts_loading')}</Text>
            ) : permissionMessage && permissionState !== 'limited' ? (
              <View style={styles.center}>
                <Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{permissionMessage}</Text>
                {permissionState === 'blocked' ? <Button title={t('people.open_settings')} onPress={() => void Linking.openSettings()} variant="outline" testID="contact-import-settings" /> : null}
                <Button title={t('people.import_check_access')} onPress={() => void loadContacts()} variant="outline" testID="contact-import-retry-access" />
              </View>
            ) : (
              <>
                {permissionMessage ? <Text style={[styles.message, { color: colors.mutedForeground }]}>{permissionMessage}</Text> : null}
                {excludedCount > 0 ? <Text style={[styles.message, { color: colors.mutedForeground }]}>{t('people.import_excluded').replace('{count}', String(excludedCount))}</Text> : null}
                <TextInput value={search} onChangeText={setSearch} placeholder={t('people.contact_search')} placeholderTextColor={colors.mutedForeground} style={[styles.search, { color: colors.foreground, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left' }]} testID="contact-import-search" />
                <FlatList
                  style={styles.flexList}
                  data={filtered}
                  keyExtractor={item => item.key}
                  contentContainerStyle={styles.list}
                  ListEmptyComponent={<Text style={{ color: colors.mutedForeground }}>{t('people.contacts_empty')}</Text>}
                  renderItem={({ item }) => {
                    const selection = selected[item.key];
                    return (
                      <View style={[styles.contact, { borderColor: colors.border }]}>
                        <TouchableOpacity onPress={() => toggleCandidate(item)} accessibilityRole="checkbox" accessibilityState={{ checked: !!selection }} testID={`contact-import-choice-${item.key}`}>
                          <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{selection ? '☑ ' : '☐ '}{item.name}</Text>
                        </TouchableOpacity>
                        {selection ? item.phones.map(phone => (
                          <TouchableOpacity key={phone.key} onPress={() => selectPhone(item.key, phone.key)} accessibilityRole="radio" accessibilityState={{ selected: selection.phoneKey === phone.key }} testID={`contact-import-phone-${phone.key}`}>
                            <Text style={{ color: selection.phoneKey === phone.key ? colors.primary : colors.mutedForeground, writingDirection: 'ltr', textAlign: 'left' }}>{selection.phoneKey === phone.key ? '● ' : '○ '}{phone.phone}</Text>
                          </TouchableOpacity>
                        )) : null}
                      </View>
                    );
                  }}
                />
                <View style={styles.footer}>
                  <Button title={t('people.import_review_count').replace('{count}', String(selectedCount))} onPress={() => setStage('review')} disabled={selectedCount === 0 || unresolvedPhoneCount > 0} testID="contact-import-review" />
                  {unresolvedPhoneCount > 0 ? <Text style={{ color: colors.destructive, textAlign: isRTL ? 'right' : 'left' }}>{t('people.import_choose_phone')}</Text> : null}
                </View>
              </>
            )}
          </>
        ) : stage === 'review' ? (
          <FlatList
            style={styles.flexList}
            data={Object.values(selected)}
            keyExtractor={item => item.candidate.key}
            contentContainerStyle={styles.review}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={<Text style={{ color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }}>{t('people.import_review')}</Text>}
            renderItem={({ item }) => {
              const phone = item.candidate.phones.find(candidate => candidate.key === item.phoneKey);
              return <View key={item.candidate.key} style={[styles.reviewRow, { borderColor: colors.border }]}>
                <Text style={[styles.wrappingText, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>{item.candidate.name}</Text>
                <Text style={{ color: colors.mutedForeground, writingDirection: 'ltr' }}>{phone?.phone}</Text>
                {phone && !isExplicitInternationalPhone(phone.phone) ? (
                  <View style={styles.countries}>{PHONE_COUNTRIES.map(country => (
                    <TouchableOpacity key={country.code} onPress={() => setCountry(item.candidate.key, country.code)} accessibilityRole="radio" accessibilityState={{ selected: item.country === country.code }}>
                      <Text style={{ color: item.country === country.code ? colors.primary : colors.mutedForeground }}>{country.code}</Text>
                    </TouchableOpacity>
                  ))}</View>
                ) : null}
                {phone && !item.country && !isExplicitInternationalPhone(phone.phone) ? <Text style={{ color: colors.destructive }}>{t('people.import_choose_country')}</Text> : null}
                {phone && (item.country || isExplicitInternationalPhone(phone.phone)) ? <Text style={{ color: reviewDispositions.get(item.candidate.key) === 'duplicate' ? colors.destructive : colors.primary }}>
                  {reviewDispositions.get(item.candidate.key) === 'duplicate' ? t('people.import_status.duplicate') : t('people.import_status.ready')}
                </Text> : null}
                <TouchableOpacity onPress={() => toggleCandidate(item.candidate)} testID={`contact-import-remove-${item.candidate.key}`}>
                  <Text style={{ color: colors.destructive }}>{t('people.import_remove')}</Text>
                </TouchableOpacity>
              </View>;
            }}
            ListFooterComponent={<View style={styles.reviewActions}>
              <Button title={t('people.import_confirm')} onPress={() => void confirm()} loading={saving} disabled={saving || reviewedEntries.length === 0 || unresolvedCount > 0} testID="contact-import-confirm" />
              <Button title={t('capture.back')} onPress={() => setStage('select')} variant="outline" disabled={saving} testID="contact-import-back" />
            </View>}
          />
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
              <Button title={t('people.import_done')} onPress={onImported} disabled={saving} testID="contact-import-done" />
            </View>}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 56, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20 },
  center: { padding: 24, gap: 16 },
  message: { paddingHorizontal: 20, paddingVertical: 8 },
  search: { minHeight: 50, marginHorizontal: 20, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 },
  list: { padding: 20, gap: 10 },
  flexList: { flex: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 10, gap: 8 },
  contact: { padding: 12, borderWidth: 1, borderRadius: 10, gap: 8 },
  review: { padding: 20, gap: 12 },
  reviewActions: { gap: 12, paddingTop: 8 },
  reviewRow: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 5 },
  wrappingText: { flexShrink: 1, lineHeight: 22 },
  countries: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
