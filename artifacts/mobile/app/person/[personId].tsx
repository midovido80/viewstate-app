import { useCallback, useState } from 'react';
import {
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
import { Property } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { getAreaById } from '@/constants/kuwait-areas';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import {
  createPerson,
  Person,
  PERSON_CLASSIFICATIONS,
  PersonClassification,
} from '@/services/people';
import { store } from '@/services/persistence';

export default function PersonDetailScreen() {
  const params = useLocalSearchParams<{ personId?: string | string[] }>();
  const id = Array.isArray(params.personId) ? params.personId[0] : params.personId;
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const [person, setPerson] = useState<Person | null>(null);
  const [linked, setLinked] = useState<Property[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertySearch, setPropertySearch] = useState('');
  const [mode, setMode] = useState<'detail' | 'edit'>('detail');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [classifications, setClassifications] = useState<PersonClassification[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const saved = await store.getPerson(id);
      setPerson(saved);
      if (!saved) return;
      const links = await store.getLinksForPerson(id);
      const results = await Promise.all(links.map(link => store.getProperty(link.propertyCoreId)));
      setLinked(results.filter((value): value is Property => value !== null));
    } catch {
      setError(t('people.load_failed'));
    }
  }, [id, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const beginEdit = () => {
    if (!person) return;
    setName(person.name);
    setPhone(person.displayPhone);
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
    await store.linkPersonToProperty({ personId: person.id, propertyCoreId: property.core.id });
    setLinkOpen(false);
    await load();
  };

  const unlink = async (propertyCoreId: string) => {
    if (!person) return;
    await store.unlinkPersonFromProperty({ personId: person.id, propertyCoreId });
    await load();
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => mode === 'edit' ? setMode('detail') : router.back()} testID="person-detail-back" accessibilityRole="button">
          <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t(mode === 'edit' ? 'capture.cancel' : 'capture.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{mode === 'edit' ? t('people.edit') : t('people.detail')}</Text>
        {mode === 'detail' ? (
          <TouchableOpacity onPress={beginEdit} testID="person-edit" accessibilityRole="button">
            <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('detail.edit')}</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text style={{ color: colors.destructive, fontFamily: fonts.medium }} testID="person-detail-error">{error}</Text> : null}
        {mode === 'edit' ? (
          <>
            <TextInput value={name} onChangeText={setName} placeholder={t('people.name')} style={inputStyle} testID="person-edit-name" />
            <TextInput value={phone} onChangeText={setPhone} placeholder={t('people.phone')} keyboardType="phone-pad" style={inputStyle} testID="person-edit-phone" />
            {PERSON_CLASSIFICATIONS.map(value => (
              <TouchableOpacity key={value} onPress={() => toggle(value)} accessibilityRole="checkbox" accessibilityState={{ checked: classifications.includes(value) }} testID={`person-edit-classification-${value}`} style={[styles.choice, { borderColor: classifications.includes(value) ? colors.primary : colors.border }]}>
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{t(`people.classification.${value}` as keyof Translations)}</Text>
              </TouchableOpacity>
            ))}
            <TextInput value={notes} onChangeText={setNotes} placeholder={t('people.notes')} multiline style={[inputStyle, styles.notes]} testID="person-edit-notes" />
            <Button title={t('people.save')} onPress={() => void save()} loading={busy} testID="person-edit-save" />
          </>
        ) : (
          <>
            <Text style={[styles.name, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{person.name}</Text>
            <Text style={[styles.phone, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{person.displayPhone}</Text>
            <Text style={{ color: colors.primary, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>
              {person.classifications.map(value => t(`people.classification.${value}` as keyof Translations)).join(' · ')}
            </Text>
            <View style={styles.actions}>
              <Button title={t('people.call')} onPress={() => void Linking.openURL(`tel:${person.normalizedPhone}`)} variant="outline" testID="person-call" style={styles.flex} />
              <Button title={t('people.whatsapp')} onPress={() => void Linking.openURL(`https://wa.me/${person.normalizedPhone.replace(/\D/g, '')}`)} variant="outline" testID="person-whatsapp" style={styles.flex} />
            </View>
            {person.notes ? <Text style={[styles.note, { color: colors.foreground, backgroundColor: colors.card, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{person.notes}</Text> : null}
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('people.linked_properties')}</Text>
              <TouchableOpacity onPress={() => void openLink()} testID="person-link-property" accessibilityRole="button">
                <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('people.link')}</Text>
              </TouchableOpacity>
            </View>
            {linked.map(property => (
              <View key={property.core.id} style={[styles.property, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TouchableOpacity onPress={() => router.push(`/property/${encodeURIComponent(property.core.id)}` as never)} testID={`linked-property-${property.core.id}`} accessibilityRole="button">
                  <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>{t(`propertyType.${property.core.propertyType}` as keyof Translations)} · {areaName(property)}</Text>
                  <Text style={{ color: colors.mutedForeground }}>{property.core.id}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void unlink(property.core.id)} testID={`unlink-property-${property.core.id}`} accessibilityRole="button">
                  <Text style={{ color: colors.destructive, fontFamily: fonts.medium }}>{t('people.unlink')}</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Button title={t('people.remove')} onPress={() => setDeleteOpen(true)} variant="outline" testID="person-remove" />
          </>
        )}
      </ScrollView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 20 },
  header: { minHeight: 60, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20 },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  name: { fontSize: 28 },
  phone: { fontSize: 18 },
  input: { minHeight: 54, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  notes: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  choice: { minHeight: 48, justifyContent: 'center', padding: 12, borderWidth: 1, borderRadius: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  note: { padding: 14, borderRadius: 10, lineHeight: 22 },
  sectionHeader: { justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  sectionTitle: { fontSize: 18 },
  property: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 12 },
  modalSearch: { margin: 20 },
  propertyChoice: { minHeight: 58, justifyContent: 'center', borderBottomWidth: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(10,29,31,.45)', justifyContent: 'center', padding: 24 },
  dialog: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 14 },
});