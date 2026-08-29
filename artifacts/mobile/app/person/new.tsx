import { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { createPerson, PERSON_CLASSIFICATIONS, PersonClassification } from '@/services/people';
import { store } from '@/services/persistence';

export default function NewPersonScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL, fonts } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [classifications, setClassifications] = useState<PersonClassification[]>([]);
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (value: PersonClassification) => setClassifications(current =>
    current.includes(value) ? current.filter(item => item !== value) : [...current, value]);

  const importContact = async () => {
    setError('');
    if (Platform.OS === 'web') {
      setError(t('people.contacts_unavailable'));
      return;
    }
    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      setError(t('people.contacts_denied'));
      return;
    }
    const result = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      sort: Contacts.SortTypes.FirstName,
    });
    setContacts(result.data.filter(contact => contact.name && contact.phoneNumbers?.some(item => item.number)));
    setContactsOpen(true);
  };

  const save = async () => {
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const person = createPerson({
        id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        name,
        displayPhone: phone,
        notes,
        classifications,
      });
      await store.savePerson(person);
      router.replace(`/person/${encodeURIComponent(person.id)}` as never);
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => router.back()} testID="person-new-cancel" accessibilityRole="button">
          <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('capture.cancel')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('people.add')}</Text>
        <View style={{ width: 45 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput value={name} onChangeText={setName} placeholder={t('people.name')} placeholderTextColor={colors.mutedForeground} style={inputStyle} testID="person-name" />
        <TextInput value={phone} onChangeText={setPhone} placeholder={t('people.phone')} placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" style={inputStyle} testID="person-phone" />
        <Button title={t('people.import_contact')} onPress={() => void importContact()} variant="outline" testID="person-import-contact" />
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
      </ScrollView>
      <Modal visible={contactsOpen} animationType="slide" onRequestClose={() => setContactsOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('people.choose_contact')}</Text>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {contacts.map((contact, index) => {
              const number = contact.phoneNumbers?.find(item => item.number)?.number;
              if (!number) return null;
              const contactKey = `${contact.name}-${number}-${index}`;
              return (
                <TouchableOpacity key={contactKey} onPress={() => {
                  setName(contact.name);
                  setPhone(number);
                  setContactsOpen(false);
                }} style={[styles.contact, { borderBottomColor: colors.border }]} testID={`contact-choice-${contactKey}`}>
                  <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{contact.name}</Text>
                  <Text style={{ color: colors.mutedForeground }}>{number}</Text>
                </TouchableOpacity>
              );
            })}
            <Button title={t('capture.cancel')} onPress={() => setContactsOpen(false)} variant="outline" testID="contact-picker-cancel" />
          </ScrollView>
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
  notes: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  label: { fontSize: 16 },
  choices: { gap: 8 },
  choice: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderRadius: 10 },
  modalTitle: { fontSize: 22, padding: 20 },
  contact: { minHeight: 64, borderBottomWidth: 1, justifyContent: 'center', gap: 4 },
});