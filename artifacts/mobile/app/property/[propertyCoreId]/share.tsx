import { useMatchNotifications } from '@/contexts/MatchNotificationsContext';
import { viewStateTextCard } from '@/services/matchNoticePresentation';
import { Action, AssistantSheet, AssistantText } from '@/components/assistant/ui';
import { formatPropertyDetailValue } from '@/services/propertyDetailPresentation';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { navigationButtonStyle, navigationButtonTextStyle } from '@/constants/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
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
import { formatPrice, formatRentalCadence, toEnglishDigits } from '@/constants/market';
import { openAndroidPropertyShareCompose } from '@/services/propertyShareIntent';

function CheckRow({
  checked,
  title,
  subtitle,
  onPress,
  testID,
  isRTL,
  colors,
  fonts,
  forceLTR = false,
  disabled = false,
}: {
  checked: boolean;
  title: string;
  subtitle?: string;
  onPress: () => void;
  testID: string;
  isRTL: boolean;
  colors: ReturnType<typeof useColors>;
  fonts: ReturnType<typeof useI18n>['fonts'];
  forceLTR?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ checked, disabled }}
      testID={testID}
      style={[styles.row, { borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
    >
      <View style={[styles.checkIndicator, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : colors.card }]}>
        {checked ? <Feather name="check" size={15} color={colors.primaryForeground} /> : null}
      </View>
      <View style={styles.rowLabel}>
        <Text style={{
          color: colors.foreground,
          fontFamily: fonts.medium,
          textAlign: forceLTR ? 'left' : isRTL ? 'right' : 'left',
          writingDirection: forceLTR ? 'ltr' : isRTL ? 'rtl' : 'ltr',
        }}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, {
            color: colors.mutedForeground,
            fontFamily: fonts.regular,
            textAlign: 'left',
            writingDirection: 'ltr',
          }]}>{subtitle}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function PropertyShareScreen() {
  const params = useLocalSearchParams<{ propertyCoreId?: string | string[]; matchNoticeId?: string }>();
  const rawId = params.propertyCoreId;
  const noticeId = typeof params.matchNoticeId === 'string' ? params.matchNoticeId : undefined;
  const notifications = useMatchNotifications(), notificationsRef = useRef(notifications); notificationsRef.current = notifications;
  const [recipient, setRecipient] = useState<{ id: string; name: string } | null>(null);
  const [matchReady, setMatchReady] = useState(!noticeId);
  const [followupPrompt, setFollowupPrompt] = useState(false);
  const [shareFormat, setShareFormat] = useState<'viewstate' | 'message'>(noticeId ? 'viewstate' : 'message');
  const shareFlight = useRef(false);
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter(); const colors = useColors(); const insets = useScreenInsets(); const { t, language, fonts, isRTL } = useI18n();
  const [property, setProperty] = useState<Property | null>(null);
  const [selection, setSelection] = useState<PropertyShareSelection | null>(null);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<Person[]>([]);
  const [sharing, setSharing] = useState(false);
  const shareT = (key: string) => t(key as any);
  useEffect(() => {
    let active = true; setMatchReady(!noticeId); setRecipient(null);
    if (noticeId) void notificationsRef.current.resolve(noticeId).then(({ match }) => {
      if (!active) return;
      if (match.result.propertyId !== id) throw new Error('MATCH_PROPERTY_MISMATCH');
      setRecipient({ id: match.person.id, name: match.person.name }); setMatchReady(true);
    }).catch(() => { if (active) setError(language === 'ar' ? 'تعذر تأكيد المطابقة؛ ارجع للإشعارات وحدّثها.' : 'Match could not be confirmed. Return to Notifications and refresh.'); });
    return () => { active = false; };
  }, [id, noticeId, language]);

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
  const previewResult = useMemo(() => {
    if (!property || !selection) return { preview: null, failed: false };
    try {
      const area = getAreaById(property.core.locationArea.id);
      const builtPreview = buildPropertySharePreview({
        property, selection,
        availableAttachments: (property.attachments ?? []).map(item => ({ id: item.id, propertyCoreId: property.core.id })),
        privateLocation: { paci: property.locationEnrichment?.paciNumber?.value, mapsLink: property.locationEnrichment?.mapsLink?.value },
        contacts: contacts.filter(person => !!person.displayPhone).map(person => ({ id: person.id, name: person.name, phone: toEnglishDigits(person.displayPhone) })),
        labels: { propertyType: t('detail.type'), transaction: t('detail.transaction'), price: t('detail.price'), area: t('detail.area'), typeDetails: shareT('share.property_details'), description: t('enrich.description'), ownerSource: shareT('share.owner_source'), exactLocation: shareT('share.exact_location'), paci: t('enrich.paci'), mapsLink: t('enrich.maps_link'), personContact: shareT('share.contact') },
        detailLabels: Object.fromEntries(Object.entries(propertyDetailLabels).map(([field, labels]) => [field, labels[language === 'ar' ? 1 : 0]])),
        formattedDetailValues: Object.fromEntries(Object.entries(property.typeDetails ?? {}).filter(([field]) => field in propertyDetailLabels).map(([field, value]) => [field, formatPropertyDetailValue(field as keyof typeof propertyDetailLabels, value, language)])),
        detailValueLabels: {
          true: t('enrich.yes'),
          false: t('enrich.no'),
          residential: t('enrich.residential'),
          commercial: t('enrich.commercial'),
          unfurnished: t('enrich.furnishing.unfurnished'),
          semi_furnished: t('enrich.furnishing.semi_furnished'),
          furnished: t('enrich.furnishing.furnished'),
          studio: shareT('share.apartment_subtype.studio'),
          standard_apartment: shareT('share.apartment_subtype.standard_apartment'),
          duplex: shareT('share.apartment_subtype.duplex'),
        },
        normalValueLabels: {
          [property.core.propertyType]: t(`propertyType.${property.core.propertyType}` as any),
          [property.activeOffer.transaction]: t(`transaction.${property.activeOffer.transaction}` as any),
          [property.core.locationArea.id]: area?.[language] ?? property.core.locationArea.id,
        },
        formattedPrice: formatPrice(
          property.activeOffer.transaction === 'sale' ? property.activeOffer.salePrice.amount : property.activeOffer.rentalPrice.amount,
          property.activeOffer.transaction === 'sale' ? property.activeOffer.salePrice.currencyCode : property.activeOffer.rentalPrice.currencyCode,
          language,
        ),
        rentalCadence: property.activeOffer.transaction === 'rent'
          ? formatRentalCadence(property.activeOffer.rentalPeriodId, t as (key: string) => string)
          : t('price.cadence.monthly'),
        attribution: shareT('share.attribution'),
      });
      return {
        preview: { ...builtPreview, text: shareFormat === 'viewstate' ? viewStateTextCard(toEnglishDigits(builtPreview.text), language) : toEnglishDigits(builtPreview.text) },
        failed: false,
      };
    } catch {
      return { preview: null, failed: true };
    }
  }, [property, selection, t, language, contacts, shareFormat]);
  const preview = previewResult.preview;
  const fileAdapter = useMemo(() => {
    if (!property || !selection) return undefined;
    const selectedCover = (property.attachments ?? []).find(item =>
      item.isCover && item.kind === 'image' && selection.attachmentIds.includes(item.id));
    return createPropertyPackageShareAdapter(
      property.attachments ?? [],
      async uri => {
        if (!await Sharing.isAvailableAsync()) throw new Error('LOCAL_FILE_SHARING_UNAVAILABLE');
        await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: t('share.send') });
      },
      Platform.OS === 'ios' && selectedCover ? {
        attachmentId: selectedCover.id,
        shareWithText: async ({ uri, text }) => {
          await Share.share({ message: text, url: uri });
        },
      } : undefined,
    );
  }, [property, selection, t]);
  if (!property || !selection) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.foreground }}>{error || t('edit.loading')}</Text></View>;
  const selectedAttachments = (property.attachments ?? []).filter(item => selection.attachmentIds.includes(item.id));
  const hasShareableContent = !!preview && (preview.text.length > 0 || preview.attachmentIds.length > 0);
  const runShare = async () => {
    if (!preview || !hasShareableContent || sharing || shareFlight.current || !matchReady) return;
    shareFlight.current = true; setSharing(true);
    setError('');
    try {
      if (noticeId) {
        const current = await notificationsRef.current.resolve(noticeId);
        if (current.match.result.propertyId !== id) throw new Error('MATCH_PROPERTY_MISMATCH');
      }
      await sharePropertyPreview(preview, fileAdapter, text => Share.share({ message: text }));
      if (noticeId && recipient) setFollowupPrompt(true);
    } catch {
      setError(t('share.failed'));
    } finally {
      shareFlight.current = false; setSharing(false);
    }
  };
  const toggleAttachment = (attachmentId: string) => { if (shareFlight.current) return; setSelection(current => current && ({ ...current, attachmentIds: current.attachmentIds.includes(attachmentId) ? current.attachmentIds.filter(id => id !== attachmentId) : [...current.attachmentIds, attachmentId] })); };
  const toggleNormal = (field: PropertyShareSelection['normalFields'][number]) => { if (shareFlight.current) return; setSelection(current => current && ({ ...current, normalFields: current.normalFields.includes(field) ? current.normalFields.filter(item => item !== field) : [...current.normalFields, field] })); };
  const toggleSensitive = (name: 'discloseOwnerSource' | 'discloseExactLocation' | 'disclosePaci' | 'discloseMapsLink') => { if (shareFlight.current) return; setSelection(current => current && ({ ...current, [name]: !current[name] })); };
  const toggleContact = (contactId: string) => { if (shareFlight.current) return; setSelection(current => current && ({ ...current, personContactIds: current.personContactIds.includes(contactId) ? current.personContactIds.filter(id => id !== contactId) : [...current.personContactIds, contactId] })); };
  const normalLabel = (field: PropertyShareSelection['normalFields'][number]) => ({
    property_type: t('detail.type'),
    transaction: t('detail.transaction'),
    price: t('detail.price'),
    area: t('detail.area'),
    type_details: shareT('share.property_details'),
    description: t('enrich.description'),
  })[field];
  const sensitive = [
    ['discloseOwnerSource', shareT('share.owner_source'), !!property.core.ownerSource],
    ['discloseExactLocation', shareT('share.exact_location'), !!property.core.exactLocation],
    ['disclosePaci', t('enrich.paci'), !!property.locationEnrichment?.paciNumber],
    ['discloseMapsLink', t('enrich.maps_link'), !!property.locationEnrichment?.mapsLink],
  ] as const;
  return <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('capture.back')} testID="share-back" style={navigationButtonStyle}><Text style={[navigationButtonTextStyle, { fontFamily: fonts.semiBold }]}>{t('capture.back')}</Text></TouchableOpacity><Text accessibilityRole="header" style={{ color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }}>{t('detail.share')}</Text><View /></View>
    <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      {recipient && <Text style={{ color: '#173F78', fontFamily: fonts.semiBold }}>{language === 'ar' ? `مشاركة مقترح للعميل: ${recipient.name}` : `Share a suggestion for: ${recipient.name}`}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Action label="ViewState" icon="file-text" tone={shareFormat === 'viewstate' ? 'primary' : 'secondary'} onPress={() => setShareFormat('viewstate')} disabled={sharing} testID="share-viewstate-card" />
        <Action label={language === 'ar' ? 'تطبيقات الهاتف' : 'Phone apps'} icon="share-2" tone={shareFormat === 'message' ? 'primary' : 'secondary'} onPress={() => setShareFormat('message')} disabled={sharing} testID="share-phone-apps" />
      </View>
      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}>{shareFormat === 'viewstate' ? (language === 'ar' ? 'بطاقة نصية باسم ViewState، ترسلها بالتطبيق الذي تختاره.' : 'A ViewState text card, sent through the app you choose.') : (language === 'ar' ? 'قائمة المشاركة تعرض التطبيقات المتوافقة المثبتة على هاتفك.' : 'The share sheet shows compatible apps installed on your phone.')}</Text>

      <Text style={[styles.note, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{t('share.sensitive_off')}</Text>
      <Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('share.normal_fields')}</Text>
      {PROPERTY_SHARE_NORMAL_FIELDS.map(field => <CheckRow disabled={sharing} key={field} checked={selection.normalFields.includes(field)} title={normalLabel(field)} onPress={() => toggleNormal(field)} testID={`share-normal-${field}`} isRTL={isRTL} colors={colors} fonts={fonts} />)}
      <Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('share.attachments')}</Text>
      {(property.attachments ?? []).map(item => <CheckRow disabled={sharing} key={item.id} checked={selection.attachmentIds.includes(item.id)} title={toEnglishDigits(item.originalName)} onPress={() => toggleAttachment(item.id)} testID={`share-attachment-${item.id}`} isRTL={isRTL} colors={colors} fonts={fonts} forceLTR />)}
      <Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('share.sensitive')}</Text>
      {sensitive.filter(([, , exists]) => exists).map(([name, label]) => <CheckRow disabled={sharing} key={name} checked={selection[name]} title={label} onPress={() => toggleSensitive(name)} testID={`share-${name}`} isRTL={isRTL} colors={colors} fonts={fonts} />)}
       {contacts.length ? <><Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{shareT('share.contacts')}</Text>{contacts.map(contact => <CheckRow disabled={sharing} key={contact.id} checked={selection.personContactIds.includes(contact.id)} title={contact.name} subtitle={toEnglishDigits(contact.displayPhone)} onPress={() => toggleContact(contact.id)} testID={`share-contact-${contact.id}`} isRTL={isRTL} colors={colors} fonts={fonts} />)}</> : null}
      <Text style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('share.preview')}</Text>
      <Text selectable testID="share-preview" style={[styles.preview, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{preview?.text || (previewResult.failed ? t('share.preview_unavailable') : t('share.select_content'))}</Text>
        {selectedAttachments.length ? <View testID="share-preview-attachments" style={styles.selectedAttachments}>
          <Text style={{ color: colors.mutedForeground, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' }}>{shareT('share.attachments_selected').replace('{count}', toEnglishDigits(String(selectedAttachments.length)))}</Text>
          {selectedAttachments.map(item => <Text key={item.id} style={{ color: colors.foreground, textAlign: isRTL ? 'right' : 'left', writingDirection: 'ltr' }}>{toEnglishDigits(item.originalName)}</Text>)}
        </View> : null}
        {Platform.OS === 'android' && !noticeId ? <>
           <Button title={shareT('share.whatsapp')} testID="share-whatsapp" disabled={!hasShareableContent || sharing || !matchReady} variant="whatsapp" onPress={() => { if (!preview || !hasShareableContent || sharing) return; if (preview.attachmentIds.length) { setError(shareT('share.attachments_system_only')); return; } setError(''); void openAndroidPropertyShareCompose(preview.text).catch(() => setError(shareT('share.whatsapp_unavailable'))); }} />
        </> : null}

      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
    </KeyboardAwareScrollViewCompat>
    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16), borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
        <Button title={Platform.OS === 'android' ? shareT('share.system_share') : t('share.send')} testID="share-send" disabled={!hasShareableContent || sharing || !matchReady} loading={sharing} onPress={() => void runShare()} />
    </View>
    {followupPrompt && <AssistantSheet title={language === 'ar' ? 'هل أرسلت العقار للعميل؟' : 'Did you send the property to the client?'} onClose={() => setFollowupPrompt(false)}>
      <AssistantText>{language === 'ar' ? 'فتح المشاركة لا يؤكد الإرسال. إذا أرسلته، يمكنك إضافة متابعة مرتبطة بالعميل والعقار.' : 'Opening sharing does not confirm delivery. If you sent it, add a follow-up linked to this client and property.'}</AssistantText>
      <Action label={language === 'ar' ? 'أرسلت — إضافة متابعة' : 'Sent — add follow-up'} icon="calendar" tone="primary" onPress={() => {
        setFollowupPrompt(false);
        if (recipient && id) router.push({ pathname: '/', params: { followupPersonId: recipient.id, followupPropertyId: id } } as never);
      }} />
      <Action label={language === 'ar' ? 'لم أرسل / لاحقًا' : 'Not sent / later'} tone="quiet" onPress={() => setFollowupPrompt(false)} />
    </AssistantSheet>}
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { minHeight: 56, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18 }, content: { padding: 18, gap: 8 }, heading: { fontSize: 17, marginTop: 10 }, note: { lineHeight: 19 }, row: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', gap: 10 }, checkIndicator: { width: 22, height: 22, borderWidth: 1, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, rowLabel: { flex: 1 }, rowSubtitle: { marginTop: 2 }, preview: { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 90 }, selectedAttachments: { gap: 3 } });
