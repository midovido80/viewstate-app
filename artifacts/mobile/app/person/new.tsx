import { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { Button } from '@/components/Button';
import { BatchContactImportModal } from '@/components/BatchContactImportModal';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ChoiceTile as ChoiceChip, ChoiceGrid } from '@/components/ChoiceTile';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { createPerson, PERSON_CLASSIFICATIONS, PersonClassification } from '@/services/people';
import { store } from '@/services/persistence';
import {
  normalizePhoneForCountry,
  PHONE_COUNTRIES,
  PhoneCountryCode,
} from '@/services/phoneEntry';
import { generateDomainId } from '@/services/identity';
import { linkRequirementToSeeker } from '@/services/requirementOwnership';

export default function NewPersonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnRequirementId?: string | string[] }>();
  const returnRequirementId = Array.isArray(params.returnRequirementId)
    ? params.returnRequirementId[0]
    : params.returnRequirementId;
  const colors = useColors();
  const insets = useScreenInsets();
  const { t, isRTL, fonts } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>('KW');
  const [countryOpen, setCountryOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [classifications, setClassifications] = useState<PersonClassification[]>(
    returnRequirementId ? ['seeker'] : [],
  );
  const [entryMode, setEntryMode] = useState<'choose' | 'manual'>(
    returnRequirementId ? 'manual' : 'choose',
  );
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const saveFlight = useRef(false);
  const personId = useRef(generateDomainId()).current;

  const toggle = (value: PersonClassification) => setClassifications(current => {
    const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
    return PERSON_CLASSIFICATIONS.filter(item => next.includes(item));
  });

  const selectedCountry = PHONE_COUNTRIES.find(country => country.code === phoneCountry)
    ?? PHONE_COUNTRIES[0];

  const importContact = () => {
    setError('');
    if (classifications.length !== 1) {
      setError(t('people.import_one_classification'));
      return;
    }
    setBatchImportOpen(true);
  };

  const save = async () => {
    if (saveFlight.current) return;
    setError('');
    saveFlight.current = true;
    setSaving(true);
    try {
      const person = createPerson({
        id: personId,
        name,
        displayPhone: phone,
        normalizedPhone: normalizePhoneForCountry(phone, phoneCountry),
        notes,
        classifications,
      });
      const resolved = await store.savePerson(person);
      if (returnRequirementId) {
        const requirement = await store.getRequirement(returnRequirementId);
        if (!requirement) throw new Error('RETURN_REQUIREMENT_NOT_FOUND');
        const outcome = await linkRequirementToSeeker({
          expected: requirement,
          seekerId: resolved.id,
          store,
        });
        if (outcome.status !== 'linked' && outcome.status !== 'already_linked') {
          throw new Error('RETURN_REQUIREMENT_LINK_FAILED');
        }
        router.replace({
          pathname: '/requirement/view/[requirementId]',
          params: { requirementId: returnRequirementId },
        } as never);
      } else {
        router.replace({ pathname: `/person/${encodeURIComponent(resolved.id)}`, params: { saved: '1' } } as never);
      }
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : '';
      setError(code.includes('NAME') ? t('people.name_required')
        : code.includes('PHONE') ? t('people.phone_required')
          : code.includes('CLASSIFICATION') ? t('people.classification_required')
            : t('people.save_failed'));
    } finally {
      saveFlight.current = false;
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
        <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t('people.classifications')}</Text>
        <ChoiceGrid style={styles.choicesWrap}>
          {PERSON_CLASSIFICATIONS.map(value => (
            <ChoiceChip
              key={value}
              label={t(`people.classification.${value}` as keyof Translations)}
              selected={classifications.includes(value)}
              onPress={() => toggle(value)}
              testID={`person-classification-${value}`}
              role="checkbox"
            />
          ))}
        </ChoiceGrid>
        {classifications.length > 0 && entryMode === 'choose' ? (
          <View style={styles.entryChoices}>
            <Button title={t('people.manual_entry')} onPress={() => setEntryMode('manual')} testID="person-manual-entry" />
            <Button title={t('people.import_contact')} onPress={importContact} variant="outline" testID="person-import-entry" />
          </View>
        ) : null}
        {entryMode === 'choose' ? null : (
        <>
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
        <TextInput value={notes} onChangeText={setNotes} placeholder={t('people.notes')} placeholderTextColor={colors.mutedForeground} multiline style={[inputStyle, styles.notes]} testID="person-notes" />
        {error ? <Text style={{ color: colors.destructive, fontFamily: fonts.medium }} testID="person-form-error">{error}</Text> : null}
        <Button title={t('people.save')} onPress={() => void save()} loading={saving} testID="person-save" />
        </>
        )}
      </KeyboardAwareScrollViewCompat>
      {classifications.length === 1 ? (
        <BatchContactImportModal
          visible={batchImportOpen}
          classification={classifications[0]}
          onClose={() => setBatchImportOpen(false)}
          onImported={() => {
            setBatchImportOpen(false);
            router.replace('/people' as never);
          }}
        />
      ) : null}
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
  choicesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  entryChoices: { gap: 10 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  countryPicker: { borderRadius: 14, padding: 16, gap: 4 },
  countryTitle: { fontSize: 20, marginBottom: 8 },
  countryChoice: { minHeight: 50, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  countryName: { flex: 1 },
});
