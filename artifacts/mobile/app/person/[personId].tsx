import { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Property, type SeekerRequirement } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice, toEnglishDigits } from '@/constants/market';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import {
  createPerson,
  Person,
  PERSON_CLASSIFICATIONS,
  PersonClassification,
  PropertySource,
} from '@/services/people';
import {
  inferPhoneCountry,
  normalizePhoneForCountry,
  PHONE_COUNTRIES,
  PhoneCountryCode,
} from '@/services/phoneEntry';
import { store } from '@/services/persistence';
import { openAndroidWhatsAppContactCompose } from '@/services/propertyShareIntent';

export default function PersonDetailScreen() {
  const params = useLocalSearchParams<{ personId?: string | string[]; saved?: string }>();
  const id = Array.isArray(params.personId) ? params.personId[0] : params.personId;
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const [person, setPerson] = useState<Person | null>(null);
  const [requirements, setRequirements] = useState<SeekerRequirement[]>([]);
  const [linked, setLinked] = useState<Property[]>([]);
  const [sourced, setSourced] = useState<{ source: PropertySource; property: Property }[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [mode, setMode] = useState<'detail' | 'edit'>('detail');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>('KW');
  const [notes, setNotes] = useState('');
  const [classifications, setClassifications] = useState<PersonClassification[]>([]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sourceUnlinkId, setSourceUnlinkId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const saved = await store.getPerson(id);
      setPerson(saved);
      if (!saved) return;
      const [links, sources, ownedRequirements] = await Promise.all([
        store.getLinksForPerson(id),
        store.getPropertySourcesForPerson(id),
        store.getRequirementsForSeeker(id),
      ]);
      setRequirements(ownedRequirements);
      const [results, sourceProperties] = await Promise.all([
        Promise.all(links.map(link => store.getProperty(link.propertyCoreId))),
        Promise.all(sources.map(source => store.getProperty(source.propertyCoreId))),
      ]);
      setLinked(results.filter((value): value is Property => value !== null));
      setSourced(sources.flatMap((source, index) => {
        const property = sourceProperties[index];
        return property ? [{ source, property }] : [];
      }));
    } catch {
      setError(t('people.load_failed'));
    }
  }, [id, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const beginEdit = () => {
    if (!person) return;
    setName(person.name);
    setPhone(person.displayPhone);
    setPhoneCountry(
      inferPhoneCountry(person.displayPhone)
      ?? inferPhoneCountry(person.normalizedPhone)
      ?? 'KW',
    );
    setNotes(person.notes);
    setClassifications([...person.classifications]);
    setMode('edit');
    setError('');
  };

  const save = async () => {
    if (!person || busy) return;
    setBusy(true);
    setError('');
    try {
      const replacement = createPerson({
        id: person.id,
        name,
        displayPhone: phone,
        normalizedPhone: normalizePhoneForCountry(phone, phoneCountry),
        notes,
        classifications,
      });
      if (!await store.updatePerson(person, replacement)) throw new Error('PERSON_CHANGED');
      setPerson(replacement);
      setMode('detail');
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : '';
      setError(code.includes('NAME') ? t('people.name_required')
        : code.includes('PHONE') ? t('people.phone_required')
          : code.includes('CLASSIFICATION') ? t('people.classification_required')
            : t('people.save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const openLink = async () => {
    setPropertySearch('');
    setProperties(await store.getProperties());
    setLinkOpen(true);
  };

  const searchProperties = async (value: string) => {
    setPropertySearch(value);
    setProperties(value.trim() ? await store.searchProperties(value) : await store.getProperties());
  };

  const link = async (property: Property) => {
    if (!person) return;
    setError('');
    try {
      await store.linkPersonToProperty({ personId: person.id, propertyCoreId: property.core.id });
      setLinkOpen(false);
      await load();
    } catch {
      setError(t('people.link_action_failed'));
    }
  };

  const unlink = async (propertyCoreId: string) => {
    if (!person) return;
    setError('');
    try {
      await store.unlinkPersonFromProperty({ personId: person.id, propertyCoreId });
      await load();
    } catch {
      setError(t('people.unlink_failed'));
    }
  };

  const unlinkSource = async (propertyCoreId: string) => {
    setSourceUnlinkId(null);
    setError('');
    try {
      await store.removePropertySource(propertyCoreId);
      await load();
    } catch {
      setError(t('source.save_failed'));
    }
  };

  const confirmUnlink = (propertyCoreId: string) => {
    Alert.alert(
      t('people.unlink_title'),
      t('people.unlink_message'),
      [
        { text: t('people.unlink_cancel'), style: 'cancel' },
        {
          text: t('people.unlink_confirm'),
          style: 'destructive',
          onPress: () => void unlink(propertyCoreId),
        },
      ],
    );
  };

  const confirmSourceUnlink = (propertyCoreId: string) => {
    setSourceUnlinkId(propertyCoreId);
  };

  const call = async () => {
    if (!person) return;
    setError('');
    const phoneUrl = `tel:${person.normalizedPhone}`;
    try {
      if (!await Linking.canOpenURL(phoneUrl)) {
        setError(t('people.call_unavailable'));
        return;
      }
      await Linking.openURL(phoneUrl);
    } catch {
      setError(t('people.call_unavailable'));
    }
  };

  const openWhatsApp = async () => {
    if (!person) return;
    setError('');
    try {
      await openAndroidWhatsAppContactCompose(person.normalizedPhone);
    } catch {
      setError(t('people.whatsapp_unavailable'));
    }
  };

  const remove = async () => {
    if (!person || busy) return;
    setBusy(true);
    try {
      if (await store.deletePerson(person.id)) {
        setDeleteOpen(false);
        router.replace('/people' as never);
      } else {
        setError(t('people.delete_failed'));
      }
    } catch {
      setError(t('people.delete_failed'));
    } finally {
      setBusy(false);
    }
  };

  if (!person) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{error || t('people.not_found')}</Text>
        <Button title={t('capture.back')} onPress={() => router.replace('/people' as never)} variant="outline" />
      </View>
    );
  }

  const toggle = (value: PersonClassification) => setClassifications(current =>
    current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  const areaName = (property: Property) => {
    const area = getAreaById(property.core.locationArea.id);
    return area ? (language === 'ar' ? area.ar : area.en) : property.core.locationArea.id;
  };
  const inputStyle = [styles.input, {
    color: colors.foreground,
    backgroundColor: colors.card,
    borderColor: colors.border,
    textAlign: isRTL ? 'right' as const : 'left' as const,
    fontFamily: fonts.regular,
  }];
  const selectedCountry = PHONE_COUNTRIES.find(country => country.code === phoneCountry)
    ?? PHONE_COUNTRIES[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          onPress={() => mode === 'edit' ? setMode('detail') : router.back()}
          testID="person-detail-back"
          accessibilityRole="button"
          style={[styles.headerSide, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}
        >
          <Text numberOfLines={1} style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>
            {t(mode === 'edit' ? 'capture.cancel' : 'capture.back')}
          </Text>
        </TouchableOpacity>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>
          {mode === 'edit' ? t('people.edit') : t('people.detail')}
        </Text>
        {mode === 'detail' ? (
          <TouchableOpacity
            onPress={beginEdit}
            testID="person-edit"
            accessibilityRole="button"
            style={[styles.headerSide, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}
          >
            <Text numberOfLines={1} style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: isRTL ? 'left' : 'right' }}>{t('detail.edit')}</Text>
          </TouchableOpacity>
        ) : <View style={styles.headerSide} />}
      </View>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        bottomOffset={mode === 'edit' ? 72 : 20}
      >
        {error ? <Text style={{ color: colors.destructive, fontFamily: fonts.medium }} testID="person-detail-error">{error}</Text> : null}
        {mode === 'edit' ? (
          <>
            <TextInput value={name} onChangeText={setName} placeholder={t('people.name')} style={inputStyle} testID="person-edit-name" />
            <View style={[styles.phoneRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity
                onPress={() => setCountryOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t(selectedCountry.translationKey)}
                style={[styles.countryButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                testID="person-edit-phone-country"
              >
                <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, writingDirection: 'ltr', textAlign: 'left' }}>
                  {selectedCountry.code} +{toEnglishDigits(selectedCountry.dialCode)}
                </Text>
              </TouchableOpacity>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder={t('people.phone')}
                keyboardType="phone-pad"
                style={[inputStyle, styles.phoneInput, styles.ltrText]}
                testID="person-edit-phone"
              />
            </View>
            {PERSON_CLASSIFICATIONS.map(value => (
              <TouchableOpacity key={value} onPress={() => toggle(value)} accessibilityRole="checkbox" accessibilityState={{ checked: classifications.includes(value) }} testID={`person-edit-classification-${value}`} style={[styles.choice, { borderColor: classifications.includes(value) ? colors.primary : colors.border }]}>
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>{t(`people.classification.${value}` as keyof Translations)}</Text>
              </TouchableOpacity>
            ))}
            <TextInput value={notes} onChangeText={setNotes} placeholder={t('people.notes')} multiline style={[inputStyle, styles.notes]} testID="person-edit-notes" />
            <Button title={t('people.save')} onPress={() => void save()} loading={busy} testID="person-edit-save" />
          </>
        ) : (
          <>
            <Text style={[styles.name, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{person.name}</Text>
            <Text style={[styles.phone, styles.ltrText, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>{toEnglishDigits(person.displayPhone)}</Text>
            <Text style={{ color: colors.primary, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>
              {person.classifications.map(value => t(`people.classification.${value}` as keyof Translations)).join(' · ')}
            </Text>
            <View style={styles.actions}>
              <View style={[styles.secondaryActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Button title={t('people.whatsapp')} onPress={() => void openWhatsApp()} variant="whatsapp" testID="person-whatsapp" style={styles.flex} />
                <Button title={t('people.call')} onPress={() => void call()} variant="whatsapp" testID="person-call" style={styles.flex} />
              </View>
            </View>
            {person.notes ? <Text style={[styles.note, { color: colors.foreground, backgroundColor: colors.card, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{person.notes}</Text> : null}
            {params.saved === '1' && person.classifications.includes('seeker') ? <View style={[styles.savedBox, { backgroundColor: colors.accent }]} testID="person-saved-next-step"><Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{t('requirements.person_saved')}</Text><View style={styles.actions}><Button title={t('requirements.add_property_requirement')} onPress={() => router.push({ pathname: '/requirement/new', params: { seekerId: person.id } } as never)} testID="person-saved-add-requirement"/><Button title={t('summary.done')} onPress={() => router.setParams({ saved: undefined })} variant="outline" testID="person-saved-done"/></View></View> : null}
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('requirements.property_requirements')}</Text>
              {person.classifications.includes('seeker') ? <TouchableOpacity onPress={() => router.push({ pathname: '/requirement/new', params: { seekerId: person.id } } as never)} testID="person-add-requirement"><Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('requirements.add')}</Text></TouchableOpacity> : null}
            </View>
            {!person.classifications.includes('seeker') ? <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>{t('requirements.seeker_required')}</Text> : requirements.length === 0 ? <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>{t('requirements.none')}</Text> : requirements.map(requirement => <View key={requirement.id} style={[styles.requirementCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`person-requirement-${requirement.id}`}>
              <Text style={[styles.requirementTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{t(`requirements.purpose.${requirement.purpose}`)} · {t(`propertyType.${requirement.propertyType}`)}</Text>
              <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left' }}>{requirement.preferredAreaIds.map(areaId => { const area = getAreaById(areaId); return area ? (language === 'ar' ? area.ar : area.en) : areaId; }).join(' → ')}</Text>
              <Text style={{ color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }}>{formatPrice(requirement.budget.minimum, requirement.budget.currencyCode, language)}–{formatPrice(requirement.budget.maximum, requirement.budget.currencyCode, language)}</Text>
              {requirement.purpose === 'rent' && requirement.bedroomsMinimum !== undefined ? <Text style={{ color: colors.mutedForeground }}>{requirement.bedroomsMinimum}+ {t('matching.bedrooms')}</Text> : null}
              {requirement.purpose === 'rent' && requirement.bathroomsMinimum !== undefined ? <Text style={{ color: colors.mutedForeground }}>{requirement.bathroomsMinimum}+ {t('matching.bathrooms')}</Text> : null}
              <View style={[styles.secondaryActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><Button title={t('requirements.find_matches')} onPress={() => router.push({ pathname: '/matching', params: { requirementId: requirement.id } } as never)} style={styles.flex} testID={`requirement-find-${requirement.id}`}/><Button title={t('requirements.edit')} onPress={() => router.push(`/requirement/${requirement.id}` as never)} variant="outline" style={styles.flex} testID={`requirement-edit-${requirement.id}`}/></View>
            </View>)}
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('people.linked_properties')}</Text>
              <TouchableOpacity onPress={() => void openLink()} testID="person-link-property" accessibilityRole="button">
                <Text style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{t('people.link')}</Text>
              </TouchableOpacity>
            </View>
            {linked.map(property => (
              <View key={property.core.id} style={[styles.property, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TouchableOpacity onPress={() => router.push(`/property/${encodeURIComponent(property.core.id)}` as never)} testID={`linked-property-${property.core.id}`} accessibilityRole="button">
                  <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{t(`propertyType.${property.core.propertyType}` as keyof Translations)} · {areaName(property)}</Text>
                  <Text style={[styles.ltrText, { color: colors.mutedForeground }]}>{toEnglishDigits(property.core.id)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmUnlink(property.core.id)} testID={`unlink-property-${property.core.id}`} accessibilityRole="button" style={[styles.unlinkButton, { borderColor: colors.destructive }]}>
                  <Text style={{ color: colors.destructive, fontFamily: fonts.medium, textAlign: 'center' }}>{t('people.unlink')}</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('source.sourced_properties')}</Text>
            </View>
            {sourced.length ? sourced.map(({ source, property }) => (
              <View key={property.core.id} style={[styles.property, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TouchableOpacity
                  onPress={() => router.push(`/property/${encodeURIComponent(property.core.id)}` as never)}
                  testID={`source-property-${property.core.id}`}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{t(`propertyType.${property.core.propertyType}` as keyof Translations)} · {areaName(property)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{t(`source.role.${source.role}`)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmSourceUnlink(property.core.id)} testID={`unlink-source-property-${property.core.id}`} accessibilityRole="button" style={[styles.unlinkButton, { borderColor: colors.destructive }]}>
                  <Text style={{ color: colors.destructive, fontFamily: fonts.medium, textAlign: 'center' }}>{t('source.unlink')}</Text>
                </TouchableOpacity>
              </View>
            )) : (
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{t('source.none_for_person')}</Text>
            )}
            <Button title={t('people.remove')} onPress={() => setDeleteOpen(true)} variant="outline" testID="person-remove" />
          </>
        )}
      </KeyboardAwareScrollViewCompat>

      <Modal visible={linkOpen} animationType="slide" onRequestClose={() => setLinkOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <TextInput value={propertySearch} onChangeText={value => void searchProperties(value)} placeholder={t('home.search')} placeholderTextColor={colors.mutedForeground} style={[inputStyle, styles.modalSearch]} testID="link-property-search" />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {properties.filter(property => !linked.some(item => item.core.id === property.core.id)).map(property => (
              <TouchableOpacity key={property.core.id} onPress={() => void link(property)} style={[styles.propertyChoice, { borderBottomColor: colors.border }]} testID={`link-property-choice-${property.core.id}`}>
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{t(`propertyType.${property.core.propertyType}` as keyof Translations)} · {areaName(property)}</Text>
              </TouchableOpacity>
            ))}
            <Button title={t('people.quick_add_property')} onPress={() => router.push({ pathname: '/capture/transaction', params: { linkPersonId: person.id } } as never)} testID="person-quick-add-property" />
            <Button title={t('capture.cancel')} onPress={() => setLinkOpen(false)} variant="outline" testID="link-property-cancel" />
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={countryOpen} animationType="fade" transparent onRequestClose={() => setCountryOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: `${colors.foreground}59` }]}>
          <View style={[styles.countryPicker, { backgroundColor: colors.card }]}>
            <Text style={[styles.countryTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
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
                testID={`person-edit-phone-country-${country.code}`}
              >
                <Text style={[styles.countryName, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
                  {t(country.translationKey)}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{country.code} +{country.dialCode}</Text>
              </TouchableOpacity>
            ))}
            <Button title={t('capture.cancel')} onPress={() => setCountryOpen(false)} variant="outline" testID="person-edit-country-picker-cancel" />
          </View>
        </View>
      </Modal>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => !busy && setDeleteOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="alert" testID="person-remove-dialog">
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('people.remove_title')}</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{t('people.remove_message')}</Text>
            <Button title={t('capture.cancel')} onPress={() => setDeleteOpen(false)} variant="outline" disabled={busy} testID="person-remove-cancel" />
            <Button title={t('people.remove_confirm')} onPress={() => void remove()} variant="outline" loading={busy} testID="person-remove-confirm" />
          </View>
        </View>
      </Modal>

      <Modal visible={sourceUnlinkId !== null} transparent animationType="fade" onRequestClose={() => setSourceUnlinkId(null)}>
        <View style={styles.overlay}>
          <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="alert" testID="person-source-unlink-dialog">
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('source.unlink_title')}</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{t('source.unlink_message')}</Text>
            <Button title={t('source.unlink_cancel')} onPress={() => setSourceUnlinkId(null)} variant="outline" testID="person-source-unlink-cancel" />
            <Button
              title={t('source.unlink_confirm')}
              onPress={() => sourceUnlinkId && void unlinkSource(sourceUnlinkId)}
              variant="outline"
              testID="person-source-unlink-confirm"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 20 },
  header: { minHeight: 60, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 2, fontSize: 20, textAlign: 'center' },
  headerSide: { flex: 1, minWidth: 0 },
  content: { padding: 20, gap: 14 },
  name: { fontSize: 28 },
  phone: { fontSize: 18 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  phoneRow: { gap: 8 },
  phoneInput: { flex: 1 },
  countryButton: { minHeight: 54, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderRadius: 10 },
  notes: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  choice: { minHeight: 48, justifyContent: 'center', padding: 12, borderWidth: 1, borderRadius: 10 },
  actions: { gap: 10 },
  secondaryActions: { gap: 10 },
  flex: { flex: 1 },
  ltrText: { writingDirection: 'ltr', textAlign: 'left' },
  note: { padding: 14, borderRadius: 10, lineHeight: 22 },
  savedBox: { padding: 14, borderRadius: 12, gap: 10 },
  requirementCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  requirementTitle: { fontSize: 17 },
  sectionHeader: { justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  sectionTitle: { fontSize: 18 },
  property: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 12 },
  unlinkButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 14 },
  modalSearch: { margin: 20 },
  propertyChoice: { minHeight: 58, justifyContent: 'center', borderBottomWidth: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  countryPicker: { borderRadius: 14, padding: 16, gap: 4 },
  countryTitle: { fontSize: 20, marginBottom: 8 },
  countryChoice: { minHeight: 50, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  countryName: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(10,29,31,.45)', justifyContent: 'center', padding: 24 },
  dialog: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 14 },
});
