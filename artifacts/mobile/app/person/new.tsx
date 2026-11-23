import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as Contacts from 'expo-contacts';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { createPerson, PERSON_CLASSIFICATION_GROUPS, type PersonClassification } from '@/services/people';
import { store } from '@/services/persistence';
import {
  buildContactPhoneChoices,
  ContactPhoneChoice,
  inferPhoneCountry,
  normalizePhoneForCountry,
  PHONE_COUNTRIES,
  PhoneCountryCode,
  phoneDigits,
} from '@/services/phoneEntry';
import { generateDomainId } from '@/services/identity';

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
      <KeyboardAvoidingView behavior="padding" style={styles.body}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={80}>
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
          <TouchableOpacity accessibilityRole="button" onPress={importContact} style={styles.importContact} testID="person-import-contact">
            <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('people.import_contact')}</Text>
          </TouchableOpacity>
          <View style={styles.classifications}>
            <View style={styles.classificationIntro}>
              <Text accessibilityRole="header" style={[styles.label, { color: colors.foreground, fontFamily: fonts.bold, textAlign }]}>
                {t('people.classifications')}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign }}>
                {t('people.classification_hint')}
              </Text>
            </View>
            {PERSON_CLASSIFICATION_GROUPS.map(group => (
              <View key={group.id} style={[styles.classificationGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign }]}>
                  {t(`people.classification_group.${group.id}`)}
                </Text>
                {group.roles.map((role, index) => {
                  const checked = classifications.includes(role);
                  const label = t(`people.classification.${role}`);
                  return (
                    <TouchableOpacity
                      key={role}
                      onPress={() => toggle(role)}
                      accessibilityRole="checkbox"
                      accessibilityLabel={label}
                      accessibilityState={{ checked }}
                      testID={`person-classification-${role}`}
                      style={[styles.choice, {
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        backgroundColor: checked ? `${colors.primary}1A` : colors.card,
                        borderTopColor: colors.border,
                        borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      }]}
                    >
                      <Text style={[styles.choiceLabel, { color: colors.foreground, fontFamily: fonts.medium, textAlign }]}>{label}</Text>
                      <View style={[styles.checkbox, {
                        borderColor: checked ? colors.primary : colors.mutedForeground,
                        backgroundColor: checked ? colors.primary : colors.card,
                      }]}>
                        {checked ? <Feather name="check" size={15} color={colors.primaryForeground} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
          <TextInput value={notes} onChangeText={setNotes} placeholder={t('people.notes')} placeholderTextColor={colors.mutedForeground} multiline style={[inputStyle, styles.notes]} testID="person-notes" />
        </KeyboardAwareScrollViewCompat>
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          {error ? <Text style={{ color: colors.destructive, fontFamily: fonts.medium }} testID="person-form-error">{error}</Text> : null}
          {classifications.length > 0 ? (
            <Text accessibilityLiveRegion="polite" style={[styles.selectedCount, { color: colors.primary, fontFamily: fonts.semiBold }]}>
              {t('people.classification_selected').replace('{count}', String(classifications.length))}
            </Text>
          ) : null}
          <Button title={t('people.save')} onPress={() => void save()} loading={saving} testID="person-save" />
        </View>
      </KeyboardAvoidingView>
      <Modal visible={contactsOpen} animationType="slide" onRequestClose={() => setContactsOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.modalHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign }]}>{t('people.choose_contact')}</Text>
            <TouchableOpacity onPress={() => setContactsOpen(false)} accessibilityRole="button" testID="contact-picker-cancel">
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
              <TouchableOpacity onPress={() => {
                setName(item.name);
                setPhone(item.phone);
                const inferredCountry = inferPhoneCountry(item.phone);
                if (inferredCountry) setPhoneCountry(inferredCountry);
                setContactsOpen(false);
              }} style={[styles.contact, { borderBottomColor: colors.border, alignItems: contactAlignItems }]} testID={`contact-choice-${item.key}`}>
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign }}>{item.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign }}>{item.phone}</Text>
              </TouchableOpacity>
            )}
          />
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
  body: { flex: 1 },
  content: { paddingHorizontal: 20, paddingVertical: 14, gap: 10 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  phoneRow: { gap: 8 },
  phoneInput: { flex: 1 },
  countryButton: { minHeight: 54, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderRadius: 10 },
  notes: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  importContact: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 20 },
  classifications: { gap: 10 },
  classificationIntro: { gap: 4, paddingBottom: 2 },
  classificationGroup: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  groupTitle: { fontSize: 16, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  choice: { minHeight: 44, alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  choiceLabel: { flex: 1, fontSize: 15 },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  selectedCount: { textAlign: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 10, gap: 6 },
  modalHeader: { minHeight: 64, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 22 },
  contactSearch: { marginHorizontal: 20, marginBottom: 8 },
  contactList: { paddingHorizontal: 20, paddingBottom: 32 },
  contactEmpty: { paddingVertical: 28, lineHeight: 22 },
  contact: { minHeight: 64, borderBottomWidth: 1, justifyContent: 'center', gap: 4 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  countryPicker: { borderRadius: 14, padding: 16, gap: 4 },
  countryTitle: { fontSize: 20, marginBottom: 8 },
  countryChoice: { minHeight: 50, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  countryName: { flex: 1 },
});
