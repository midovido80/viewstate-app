import { useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { PROPERTY_SHARE_NORMAL_FIELDS, Property, PropertyShareSelection, buildPropertySharePreview, createPropertyShareSelection } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { propertyDetailLabels } from '@/components/PropertyEnrichmentFields';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { getAreaById } from '@/constants/kuwait-areas';
import { store } from '@/services/persistence';
import {
  sharePropertyPreview,
} from '@/services/propertySharing';
import { createPropertyPackageShareAdapter } from '@/services/propertySharePackage';
import { Person } from '@/services/people';

export default function PropertyShareScreen() {
  const rawId = useLocalSearchParams<{ propertyCoreId?: string | string[] }>().propertyCoreId;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter(); const colors = useColors(); const { t, language, fonts, isRTL } = useI18n();
  const [property, setProperty] = useState<Property | null>(null);
  const [selection, setSelection] = useState<PropertyShareSelection | null>(null);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<Person[]>([]);
  useEffect(() => { if (id) store.getProperty(id).then(value => { if (!value) throw new Error('missing'); setProperty(value); setSelection(createPropertyShareSelection(value)); }).catch(() => setError(t('edit.not_found'))); }, [id, t]);
  useEffect(() => {
    if (!property) return;
    void Promise.all([
      store.getLinksForProperty(property.core.id),
      store.getPeople(),
    ])
      .then(([links, people]) => {
        setContacts(people.filter(person =>
          links.some(link => link.personId === person.id && !!person.displayPhone),
        ));
      })
      .catch(() => setContacts([]));
  }, [property]);
  const preview = useMemo(() => {
    if (!property || !selection) return null;
    try {
      const area = getAreaById(property.core.locationArea.id);
      return buildPropertySharePreview({
        property, selection,
        availableAttachments: (property.attachments ?? []).map(item => ({ id: item.id, propertyCoreId: property.core.id })),
        privateLocation: { paci: property.locationEnrichment?.paciNumber?.value, manualLocation: property.locationEnrichment?.manualLocationText?.value, mapsLink: property.locationEnrichment?.mapsLink?.value },
        contacts: contacts.filter(person => !!person.displayPhone).map(person => ({ id: person.id, name: person.name, phone: person.displayPhone })),
        labels: { propertyType: t('detail.type'), transaction: t('detail.transaction'), price: t('detail.price'), area: t('detail.area'), typeDetails: language === 'ar' ? 'تفاصيل العقار' : 'Property detail', description: t('enrich.description'), ownerSource: 'Owner / source', exactLocation: 'Exact location', paci: t('enrich.paci'), manualLocation: t('enrich.manual_location'), mapsLink: t('enrich.maps_link'), personContact: 'Contact' },
        detailLabels: Object.fromEntries(Object.entries(propertyDetailLabels).map(([field, labels]) => [field, labels[language === 'ar' ? 1 : 0]])),
        detailValueLabels: language === 'ar'
          ? { true: 'نعم', false: 'لا', residential: 'سكني', commercial: 'تجاري', unfurnished: 'غير مؤثث', semi_furnished: 'نصف مؤثث', furnished: 'مؤثث' }
          : { true: 'Yes', false: 'No', residential: 'Residential', commercial: 'Commercial', unfurnished: 'Unfurnished', semi_furnished: 'Semi-furnished', furnished: 'Furnished' },
      });
    } catch { return null; }
  }, [property, selection, t, language, contacts]);
  const fileAdapter = useMemo(() => {
    if (!property) return undefined;
    return createPropertyPackageShareAdapter(
      property.attachments ?? [],
      async uri => {
        if (!await Sharing.isAvailableAsync()) throw new Error('LOCAL_FILE_SHARING_UNAVAILABLE');
        await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: t('share.send') });
      },
    );
  }, [property, t]);
  if (!property || !selection) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.foreground }}>{error || t('edit.loading')}</Text></View>;
  const toggleAttachment = (attachmentId: string) => setSelection(current => current && ({ ...current, attachmentIds: current.attachmentIds.includes(attachmentId) ? current.attachmentIds.filter(id => id !== attachmentId) : [...current.attachmentIds, attachmentId] }));
  const toggleNormal = (field: PropertyShareSelection['normalFields'][number]) => setSelection(current => current && ({ ...current, normalFields: current.normalFields.includes(field) ? current.normalFields.filter(item => item !== field) : [...current.normalFields, field] }));
  const toggleSensitive = (name: 'discloseOwnerSource' | 'discloseExactLocation' | 'disclosePaci' | 'discloseManualLocation' | 'discloseMapsLink') => setSelection(current => current && ({ ...current, [name]: !current[name] }));
  const toggleContact = (contactId: string) => setSelection(current => current && ({ ...current, personContactIds: current.personContactIds.includes(contactId) ? current.personContactIds.filter(id => id !== contactId) : [...current.personContactIds, contactId] }));
  const normalLabel = (field: PropertyShareSelection['normalFields'][number]) => ({
    property_type: t('detail.type'),
    transaction: t('detail.transaction'),
    price: t('detail.price'),
    area: t('detail.area'),
    type_details: language === 'ar' ? 'تفاصيل العقار' : 'Property details',
    description: t('enrich.description'),
  })[field];
  const sensitive = [
    ['discloseOwnerSource', 'Owner / source', !!property.core.ownerSource],
    ['discloseExactLocation', 'Exact location', !!property.core.exactLocation],
    ['disclosePaci', t('enrich.paci'), !!property.locationEnrichment?.paciNumber],
    ['discloseManualLocation', t('enrich.manual_location'), !!property.locationEnrichment?.manualLocationText],
    ['discloseMapsLink', t('enrich.maps_link'), !!property.locationEnrichment?.mapsLink],
  ] as const;
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><TouchableOpacity onPress={() => router.back()} testID="share-back"><Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('capture.back')}</Text></TouchableOpacity><Text style={{ color: colors.foreground, fontFamily: fonts.bold }}>{t('detail.share')}</Text><View /></View>
    <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content}>
      <Text style={[styles.note, { color: colors.mutedForeground, fontFamily: fonts.regular }]}>{t('share.sensitive_off')}</Text>
      <Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('share.normal_fields')}</Text>
      {PROPERTY_SHARE_NORMAL_FIELDS.map(field => <TouchableOpacity key={field} onPress={() => toggleNormal(field)} accessibilityRole="checkbox" accessibilityState={{ checked: selection.normalFields.includes(field) }} testID={`share-normal-${field}`} style={[styles.row, { borderColor: colors.border }]}><Text style={{ color: colors.foreground }}>{selection.normalFields.includes(field) ? '✓ ' : '○ '}{normalLabel(field)}</Text></TouchableOpacity>)}
      <Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('share.attachments')}</Text>
      {(property.attachments ?? []).map(item => <TouchableOpacity key={item.id} onPress={() => toggleAttachment(item.id)} accessibilityRole="checkbox" accessibilityState={{ checked: selection.attachmentIds.includes(item.id) }} testID={`share-attachment-${item.id}`} style={[styles.row, { borderColor: colors.border }]}><Text style={{ color: colors.foreground }}>{selection.attachmentIds.includes(item.id) ? '✓ ' : '○ '}{item.originalName}</Text></TouchableOpacity>)}
      <Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('share.sensitive')}</Text>
      {sensitive.filter(([, , exists]) => exists).map(([name, label]) => <TouchableOpacity key={name} onPress={() => toggleSensitive(name)} accessibilityRole="checkbox" accessibilityState={{ checked: selection[name] }} testID={`share-${name}`} style={[styles.row, { borderColor: colors.border }]}><Text style={{ color: colors.foreground }}>{selection[name] ? '✓ ' : '○ '}{label}</Text></TouchableOpacity>)}
      {contacts.length ? <><Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold }]}>Contacts</Text>{contacts.map(contact => <TouchableOpacity key={contact.id} onPress={() => toggleContact(contact.id)} accessibilityRole="checkbox" accessibilityState={{ checked: selection.personContactIds.includes(contact.id) }} testID={`share-contact-${contact.id}`} style={[styles.row, { borderColor: colors.border }]}><Text style={{ color: colors.foreground }}>{selection.personContactIds.includes(contact.id) ? '✓ ' : '○ '}{contact.name}</Text></TouchableOpacity>)}</> : null}
      <Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold }]}>{t('share.preview')}</Text>
      <Text selectable testID="share-preview" style={[styles.preview, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}>{preview?.text || '—'}</Text>
      {preview?.attachmentIds.length ? <Text testID="share-preview-attachments" style={{ color: colors.mutedForeground }}>{t('share.attachments')}: {property.attachments?.filter(item => preview.attachmentIds.includes(item.id)).map(item => item.originalName).join(', ')}</Text> : null}
      <Button title={t('share.send')} testID="share-send" disabled={!preview} onPress={() => { if (preview) void sharePropertyPreview(preview, fileAdapter, text => Share.share({ message: text })).catch(() => setError(t('share.failed'))); }} />
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
    </KeyboardAwareScrollViewCompat>
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { minHeight: 60, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 }, content: { padding: 20, gap: 12 }, heading: { fontSize: 18, marginTop: 12 }, note: { lineHeight: 20 }, row: { minHeight: 48, borderWidth: 1, borderRadius: 8, padding: 12, justifyContent: 'center' }, preview: { borderWidth: 1, borderRadius: 8, padding: 14, minHeight: 90 } });