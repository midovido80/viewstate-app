import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { createPerson, PERSON_CLASSIFICATIONS, PersonClassification } from '@/services/people';
import { store } from '@/services/persistence';
import {
  buildContactPhoneChoices,
  ContactPhoneChoice,
  normalizePhoneForCountry,
  PHONE_COUNTRIES,
  PhoneCountryCode,
  phoneDigits,
} from '@/services/phoneEntry';
import { generateDomainId } from '@/services/identity';
import { importContactBatch } from '@/services/contactBatchImport';

let sessionContactChoices: ContactPhoneChoice[] | null = null;

export default function NewPersonScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL, fonts } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>('KW');
  const [countryOpen, setCountryOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [classifications, setClassifications] = useState<PersonClassification[]>([]);
  const [contactChoices, setContactChoices] = useState<ContactPhoneChoice[]>([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactKeys, setSelectedContactKeys] = useState<Set<string>>(new Set());
  const [contactStatus, setContactStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (value: PersonClassification) => setClassifications(current =>
    current.includes(value) ? current.filter(item => item !== value) : [...current, value]);

  const filteredContactChoices = useMemo(() => {
    const literalQuery = contactSearch.trim().toLocaleLowerCase();
    const digitQuery = phoneDigits(contactSearch);
    if (!literalQuery) return contactChoices;
    return contactChoices.filter(choice =>
      choice.name.toLocaleLowerCase().includes(literalQuery)
      || (!!digitQuery && choice.normalizedDigits.includes(digitQuery)));
  }, [contactChoices, contactSearch]);
  const selectedCountry = PHONE_COUNTRIES.find(country => country.code === phoneCountry)
    ?? PHONE_COUNTRIES[0];

  const loadContacts = async () => {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setContactStatus('error');
        return;
      }
      const result = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.FirstName, Contacts.Fields.LastName, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });
      const normalized = buildContactPhoneChoices(result.data);
      sessionContactChoices = normalized;
      setContactChoices(normalized);
      setContactStatus('ready');
    } catch {
      setContactStatus('error');
    }
  };

  const importContact = () => {
    setError('');
    if (Platform.OS === 'web') {
      setError(t('people.contacts_unavailable'));
      return;
    }
    setContactSearch('');
    setSelectedContactKeys(new Set());
    setContactsOpen(true);
    if (sessionContactChoices !== null) {
      setContactChoices(sessionContactChoices);
      setContactStatus('ready');
      return;
    }
    setContactChoices([]);
    setContactStatus('loading');
    void loadContacts();
  };

  const closeContacts = () => {
    setContactsOpen(false);
    setSelectedContactKeys(new Set());
  };

  const toggleContact = (key: string) => {
    setSelectedContactKeys(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirmContactBatch = async () => {
    if (saving) return;
    setError('');
    if (classifications.length === 0) {
      setError(t('people.classification_required'));
      return;
    }
    const selected = contactChoices.filter(choice => selectedContactKeys.has(choice.key));
    if (selected.length === 0) {
      setError(t('people.contact_selection_required'));
      return;
    }
    setSaving(true);
    try {
      await importContactBatch({
        contacts: selected,
        classifications,
        defaultCountry: phoneCountry,
        store,
      });
      closeContacts();
      router.replace('/(tabs)/people' as never);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : '';
      setError(code.includes('CLASSIFICATION')
        ? t('people.classification_required')
        : t('people.contact_import_failed'));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const person = createPerson({
        id: generateDomainId(),
        name,
        displayPhone: phone,
        normalizedPhone: normalizePhoneForCountry(phone, phoneCountry),
        notes,
        classifications,
      });
      const resolved = await store.savePerson(person);
      router.replace({ pathname: `/person/${encodeURIComponent(resolved.id)}`, params: { saved: '1' } } as never);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : '';
      setError(code.includes('NAME') ? t('people.name_required')
        : code.includes('PHONE') ? t('people.phone_required')
          : code.includes('CLASSIFICATION') ? t('people.classification_required')
            : t('people.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, {
    color: colors.foreground,
    backgroundColor: colors.card,
    borderColor: colors.border,
    textAlign: isRTL ? 'right' as const : 'left' as const,
    fontFamily: fonts.regular,
  }];
  const textAlign = isRTL ? 'right' as const : 'left' as const;
  const contactAlignItems = isRTL ? 'flex-end' as const : 'flex-start' as const;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => router.back()} testID="person-new-cancel" accessibilityRole="button">
          <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('capture.cancel')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('people.add')}</Text>
        <View style={{ width: 45 }} />
      </View>
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={60}>
        <TextInput value={name} onChangeText={setName} placeholder={t('people.name')} placeholderTextColor={colors.mutedForeground} style={inputStyle} testID="person-name" />
        <View style={[styles.phoneRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            onPress={() => setCountryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t(selectedCountry.translationKey)}
            style={[styles.countryButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            testID="person-phone-country"
          >
            <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign }}>
              {selectedCountry.code} +{selectedCountry.dialCode}
            </Text>
          </TouchableOpacity>
          <TextInput value={phone} onChangeText={setPhone} placeholder={t('people.phone')} placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" style={[inputStyle, styles.phoneInput]} testID="person-phone" />
        </View>
        <Button title={t('people.import_contact')} onPress={importContact} variant="outline" testID="person-import-contact" />
        <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t('people.classifications')}</Text>
        <View style={styles.choices}>
          {PERSON_CLASSIFICATIONS.map(value => (
            <TouchableOpacity
              key={value}
              onPress={() => toggle(value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: classifications.includes(value) }}
              testID={`person-classification-${value}`}
              style={[styles.choice, { borderColor: classifications.includes(value) ? colors.primary : colors.border, backgroundColor: colors.card }]}
            >
              <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{t(`people.classification.${value}` as keyof Translations)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput value={notes} onChangeText={setNotes} placeholder={t('people.notes')} placeholderTextColor={colors.mutedForeground} multiline style={[inputStyle, styles.notes]} testID="person-notes" />
        {error ? <Text style={{ color: colors.destructive, fontFamily: fonts.medium }} testID="person-form-error">{error}</Text> : null}
        <Button title={t('people.save')} onPress={() => void save()} loading={saving} testID="person-save" />
      </KeyboardAwareScrollViewCompat>
      <Modal visible={contactsOpen} animationType="slide" onRequestClose={closeContacts}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.modalHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign }]}>{t('people.choose_contact')}</Text>
            <TouchableOpacity onPress={closeContacts} accessibilityRole="button" testID="contact-picker-cancel">
              <Text style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign }}>{t('capture.cancel')}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={contactSearch}
            onChangeText={setContactSearch}
            placeholder={t('people.contact_search')}
            placeholderTextColor={colors.mutedForeground}
            style={[inputStyle, styles.contactSearch]}
            testID="contact-search"
          />
          <Text style={[styles.selectedCount, { color: colors.mutedForeground, fontFamily: fonts.medium, textAlign }]} testID="contact-selected-count">
            {t('people.contacts_selected').replace('{count}', String(selectedContactKeys.size))}
          </Text>
          <FlatList
            data={filteredContactChoices}
            keyExtractor={item => item.key}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            scrollEnabled={filteredContactChoices.length > 0}
            contentContainerStyle={styles.contactList}
            ListEmptyComponent={(
              <Text style={[styles.contactEmpty, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign }]}>
                {contactStatus === 'loading'
                  ? t('people.contacts_loading')
                  : contactStatus === 'error'
                    ? t('people.contacts_load_failed')
                    : t('people.contacts_empty')}
              </Text>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => toggleContact(item.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectedContactKeys.has(item.key) }}
                style={[
                  styles.contact,
                  {
                    borderBottomColor: colors.border,
                    alignItems: contactAlignItems,
                    backgroundColor: selectedContactKeys.has(item.key) ? colors.card : colors.background,
                  },
                ]}
                testID={`contact-choice-${item.key}`}
              >
                <View style={[styles.contactContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.contactText, { alignItems: contactAlignItems }]}>
                    <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign }}>{item.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign }}>{item.phone}</Text>
                  </View>
                  <Text style={{ color: colors.primary, fontFamily: fonts.bold }}>
                    {selectedContactKeys.has(item.key) ? '✓' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
          <View style={[styles.contactConfirm, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Button
              title={t('people.import_selected_contacts')}
              onPress={() => void confirmContactBatch()}
              loading={saving}
              disabled={selectedContactKeys.size === 0}
              testID="contact-batch-confirm"
            />
          </View>
        </View>
      </Modal>
      <Modal visible={countryOpen} animationType="fade" transparent onRequestClose={() => setCountryOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: `${colors.foreground}59` }]}>
          <View style={[styles.countryPicker, { backgroundColor: colors.card }]}>
            <Text style={[styles.countryTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign }]}>
              {t('people.country')}
            </Text>
            {PHONE_COUNTRIES.map(country => (
              <TouchableOpacity
                key={country.code}
                onPress={() => {
                  setPhoneCountry(country.code);
                  setCountryOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: phoneCountry === country.code }}
                style={[styles.countryChoice, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                testID={`person-phone-country-${country.code}`}
              >
                <Text style={[styles.countryName, { color: colors.foreground, fontFamily: fonts.medium, textAlign }]}>{t(country.translationKey)}</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign }}>{country.code} +{country.dialCode}</Text>
              </TouchableOpacity>
            ))}
            <Button title={t('capture.cancel')} onPress={() => setCountryOpen(false)} variant="outline" testID="country-picker-cancel" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 60, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20 },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  phoneRow: { gap: 8 },
  phoneInput: { flex: 1 },
  countryButton: { minHeight: 54, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderRadius: 10 },
  notes: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  label: { fontSize: 16 },
  choices: { gap: 8 },
  choice: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderRadius: 10 },
  modalHeader: { minHeight: 64, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 22 },
  contactSearch: { marginHorizontal: 20, marginBottom: 8 },
  selectedCount: { paddingHorizontal: 20, paddingBottom: 8 },
  contactList: { paddingHorizontal: 20, paddingBottom: 32 },
  contactEmpty: { paddingVertical: 28, lineHeight: 22 },
  contact: { minHeight: 64, borderBottomWidth: 1, justifyContent: 'center', gap: 4 },
  contactContent: { width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  contactText: { flex: 1, gap: 4 },
  contactConfirm: { paddingHorizontal: 20, paddingTop: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  countryPicker: { borderRadius: 14, padding: 16, gap: 4 },
  countryTitle: { fontSize: 20, marginBottom: 8 },
  countryChoice: { minHeight: 50, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  countryName: { flex: 1 },
});
