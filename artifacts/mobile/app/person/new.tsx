import { useDraftBack, useLocalFormDraft } from '@/hooks/useDraftBack';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { TextInput, FieldSelect } from '@/components/FormField';
import { useUserData } from '@/contexts/UserDataContext';
import { CANCEL_ACTION_COLOR } from '@/constants/cancelAction';
import { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { Button } from '@/components/Button';
import { BatchContactImportModal } from '@/components/BatchContactImportModal';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { createPerson, PERSON_CLASSIFICATIONS, PERSON_CLASSIFICATION_GROUPS, PROPERTY_SOURCE_ROLES, type PersonClassification } from '@/services/people';

import {
  normalizePhoneForCountry,
  PHONE_COUNTRIES,
  PhoneCountryCode,
} from '@/services/phoneEntry';
import { generateDomainId } from '@/services/identity';
import { linkRequirementToSeeker } from '@/services/requirementOwnership';

export default function NewPersonScreen() {
  const { store } = useUserData();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnRequirementId?: string | string[]; entry?: string; propertyId?: string; sourceRole?: string; returnImportId?: string }>();
  const returnRequirementId = Array.isArray(params.returnRequirementId)
    ? params.returnRequirementId[0]
    : params.returnRequirementId;
  const fromProperty = params.entry === 'property-source' && Boolean(params.propertyId);
  const initialSourceRole = PROPERTY_SOURCE_ROLES.find(role => role === params.sourceRole) ?? 'owner';
  const colors = useColors();
  const insets = useScreenInsets();
  const { t, isRTL, fonts, language } = useI18n();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>('KW');
  const [countryOpen, setCountryOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [classifications, setClassifications] = useState<PersonClassification[]>(
    returnRequirementId || params.sourceRole === 'seeker' ? ['seeker'] : fromProperty || params.returnImportId ? [initialSourceRole] : [],
  );
  const [entryMode, setEntryMode] = useState<'choose' | 'manual'>(
    returnRequirementId || fromProperty || params.returnImportId ? 'manual' : 'choose',
  );
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const phoneInput = useRef<TextInput>(null), notesInput = useRef<TextInput>(null);
  const saveFlight = useRef(false);
  const personIdentity = useRef(generateDomainId());
  const personId = personIdentity.current;

  const activeRoute = useRef(true), committed = useRef(false);
  useFocusEffect(useCallback(() => { activeRoute.current=true; return () => { activeRoute.current=false; }; }, []));
  const persistPerson = useLocalFormDraft({ identity: params.returnImportId ? `person:new:import:${params.returnImportId}` : fromProperty ? `person:new:source:${params.propertyId}` : `person:new:${returnRequirementId ?? ''}`, value: { name, phone, phoneCountry, notes, classifications, entryMode, draftIdentity: personIdentity.current }, complete: committed.current, completed: () => committed.current,
    restore: saved => { setName(saved.name); setPhone(saved.phone); setPhoneCountry(saved.phoneCountry); setNotes(saved.notes); setClassifications(saved.classifications); setEntryMode(saved.entryMode); personIdentity.current=saved.draftIdentity; } });
  const { back: personBack, exit: personExit } = useDraftBack({ persist: persistPerson, fallback: '/people', completed: () => committed.current });
  const toggle = (value: PersonClassification) => setClassifications(current => {
    const next = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
    return PERSON_CLASSIFICATIONS.filter(item => next.includes(item));
  });

  const selectedCountry = PHONE_COUNTRIES.find(country => country.code === phoneCountry)
    ?? PHONE_COUNTRIES[0];

  const importContact = () => {
    setError('');
    if (!classifications.length) return;
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
      committed.current = true;
      await persistPerson();
      if (!activeRoute.current) return;
      if (params.returnImportId) {
        router.dismissTo({ pathname: '/intake-review/[importId]', params: { importId: params.returnImportId, addedPerson: resolved.id, addedSourceRole: initialSourceRole } } as never);
      } else if (returnRequirementId) {
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
        if (!activeRoute.current) return;
        router.replace({
          pathname: '/requirement/view/[requirementId]',
          params: { requirementId: returnRequirementId },
        } as never);
      } else if (fromProperty) {
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: '/property/[propertyCoreId]', params: { propertyCoreId: params.propertyId! } });
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
        <TouchableOpacity onPress={personBack} testID="person-new-cancel" accessibilityRole="button">
          <Text style={{ color: CANCEL_ACTION_COLOR, fontFamily: fonts.semiBold }}>{t('capture.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('people.add')}</Text>
        <View style={{ width: 45 }} />
      </View>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" bottomOffset={60}>
        {params.entry === 'import' ? <Text style={{color: colors.mutedForeground, fontFamily: fonts.regular, textAlign, lineHeight: 23}}>{language === 'ar' ? 'اختار الأدوار، بعدين استورد جهات الاتصال. راجع الاسم والرقم قبل الحفظ.' : 'Choose roles, then import contacts. Review names and numbers before saving.'}</Text> : null}
        {fromProperty && <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign, lineHeight: 23 }}>
          {language === 'ar' ? 'عقب الحفظ ترجع لاختيار مصدر العقار.' : 'After saving, you’ll return to the property source picker.'}
        </Text>}
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
              {(group.id === 'seekers' && classifications.includes('seeker')
                ? ['seeker' as const, ...group.roles]
                : group.roles).map((role, index) => {
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
        {classifications.length > 0 ? (
          <Text accessibilityLiveRegion="polite" style={[styles.selectedCount, { color: colors.primary, fontFamily: fonts.semiBold }]}>
            {t('people.classification_selected').replace('{count}', String(classifications.length))}
          </Text>
        ) : null}
        {error ? <Text style={{ color: colors.destructive, fontFamily: fonts.medium }} testID="person-form-error">{error}</Text> : null}
        {classifications.length > 0 && entryMode === 'choose' ? (
          <View style={styles.entryChoices}>
            <Button title={t('people.manual_entry')} onPress={() => setEntryMode('manual')} testID="person-manual-entry" />
            <Button title={t('people.import_contact')} onPress={importContact} variant="outline" testID="person-import-entry" />
          </View>
        ) : null}
        {entryMode === 'choose' ? null : (
        <>
        {fromProperty && <Button title={t('people.import_contact')} onPress={importContact} disabled={!classifications.length} variant="outline" testID="person-import-source" />}
        <TextInput value={name} onChangeText={setName} placeholder={t('people.name')} placeholderTextColor={colors.mutedForeground} style={inputStyle} testID="person-name" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => phoneInput.current?.focus()} />
        <View style={[styles.phoneRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <FieldSelect active={countryOpen}
            onPress={() => setCountryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t(selectedCountry.translationKey)}
            style={[styles.countryButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            testID="person-phone-country"
          >
            <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign }}>
              {selectedCountry.code} +{selectedCountry.dialCode}
            </Text>
          </FieldSelect>
          <TextInput value={phone} onChangeText={setPhone} placeholder={t('people.phone')} placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" style={[inputStyle, styles.phoneInput]} testID="person-phone" ref={phoneInput} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => notesInput.current?.focus()} />
        </View>
        <TextInput value={notes} onChangeText={setNotes} placeholder={t('people.notes')} placeholderTextColor={colors.mutedForeground} multiline style={[inputStyle, styles.notes]} testID="person-notes" ref={notesInput} />

        <Button title={t('capture.discard')} variant="outline" disabled={saving} onPress={() => persistPerson.confirmDiscard(() => personExit(() => router.canGoBack() ? router.back() : router.replace('/people' as never)))} testID="person-discard-draft" /><Button title={t('people.save')} onPress={() => void save()} loading={saving} testID="person-save" />
        </>
        )}
      </KeyboardAwareScrollViewCompat>
      {classifications.length > 0 ? (
        <BatchContactImportModal
          visible={batchImportOpen}
          classifications={classifications}
          onClose={() => setBatchImportOpen(false)}
          onImported={result => {
            setBatchImportOpen(false);
            if (fromProperty && router.canGoBack()) router.back();
            else router.replace({ pathname: '/people', params: result?.imported ? { contactsSaved: String(result.imported) } : {} } as never);
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
            <Button title={t('capture.back')} onPress={() => setCountryOpen(false)} variant="outline" testID="country-picker-cancel" />
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
  label: { fontSize: 20 },
  classifications: { gap: 10 },
  classificationIntro: { gap: 4, paddingBottom: 2 },
  classificationGroup: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  groupTitle: { fontSize: 16, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  choice: { minHeight: 44, alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  choiceLabel: { flex: 1, fontSize: 15 },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  selectedCount: { textAlign: 'center' },
  entryChoices: { gap: 10 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  countryPicker: { borderRadius: 14, padding: 16, gap: 4 },
  countryTitle: { fontSize: 20, marginBottom: 8 },
  countryChoice: { minHeight: 50, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  countryName: { flex: 1 },
});
