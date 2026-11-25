import { Text } from "@/components/AppText";
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Action } from '@/components/assistant/ui';
import { AccountScreen, Card, Row, useL } from '@/components/account/ui';
import { nextDesign as colors } from '@/constants/nextDesign';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { useI18n } from '@/contexts/I18nContext';
import { useMatchNotifications } from '@/contexts/MatchNotificationsContext';
import { matchNoticeEvidence } from '@/services/matchNoticePresentation';
import { currentNoticeMatch } from '@/services/matchNotifications';
import { matchingComparisonRows } from '@/services/matchingPresentation';

export default function NotificationMatchScreen() {
  const { noticeId } = useLocalSearchParams<{ noticeId?: string }>();
  const { L, align, row, fonts, language } = useL();
  const { t } = useI18n();
  const router = useRouter();
  const notifications = useMatchNotifications();
  const [options, setOptions] = useState(false);
  const [comparison, setComparison] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const flight = useRef(false);
  const notice = notifications.state.entries.find(item => item.id === noticeId);
  const property = notice && notifications.catalog.properties.find(item => item.core.id === notice.propertyId);
  const person = notice && notifications.catalog.people.find(item => item.id === notice.personId);
  const match = notice && notifications.status === 'ready' ? currentNoticeMatch(notice, notifications.matches) : undefined;
  const evidence = match && matchNoticeEvidence(match, property, language);
  const area = property && getAreaById(property.core.locationArea.id)?.[language];
  const name = property
    ? [t(`propertyType.${property.core.propertyType}`), area].filter(Boolean).join(' · ')
    : L('مطابقة عقار', 'Property match');
  const offer = property?.activeOffer;
  const price = offer?.transaction === 'rent'
    ? formatRentalPrice(offer.rentalPrice.amount, offer.rentalPrice.currencyCode, offer.rentalPeriodId, language, t)
    : offer ? formatPrice(offer.salePrice.amount, offer.salePrice.currencyCode, language) : undefined;
  const comparisonRows = comparison && match ? matchingComparisonRows(match.result, match.requirement, property, language) : [];

  async function run(action: 'share' | 'compare' | 'snooze') {
    if (!notice || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'snooze') {
        await notifications.mark(notice.id, 'snooze');
        setOptions(false);
      } else {
        const current = await notifications.resolve(notice.id);
        if (action === 'compare') setComparison(true);
        else router.push({ pathname: '/property/[propertyCoreId]/share', params: {
          propertyCoreId: current.match.result.propertyId, matchNoticeId: notice.id,
        } } as never);
      }
    } catch {
      setError(action === 'snooze' ? L('تعذّر حفظ التذكير. حاول مرة ثانية.', 'Could not save the reminder. Try again.')
        : L('تعذّر تأكيد المطابقة الحالية. ارجع للقائمة وحدّثها.', 'Could not confirm the current match. Refresh the list and try again.'));
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }

  const loading = notifications.status === 'loading' || (!notifications.historyReady && !notifications.error);
  const time = notice && !notice.read && notice.snoozedUntil && Date.parse(notice.snoozedUntil) > Date.now()
    ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-KW' : 'en-KW', {
      timeZone: 'Asia/Kuwait', hour: 'numeric', minute: '2-digit',
    }).format(new Date(notice.snoozedUntil)) : undefined;

  return (
    <AccountScreen title={L('تفاصيل المطابقة', 'Match details')}
      onBack={() => router.canGoBack() ? router.back() : router.replace('/notifications')}>
      {loading ? <ActivityIndicator color={colors.blue} /> : !notice ? (
        <Text style={[styles.text, { textAlign: align, fontFamily: fonts.medium }]}>
          {L('هذا الإشعار مو متاح الحين.', 'This notification is unavailable.')}
        </Text>
      ) : (
        <View style={styles.content}>
          <Card padded>
            <View style={[styles.property, { flexDirection: row }]}>
              <View style={styles.propertyIcon}><Feather name="home" size={26} color={colors.blue} /></View>
              <View style={styles.propertyBody}>
                <Text style={[styles.heading, { textAlign: align, fontFamily: fonts.bold }]}>{name}</Text>
                {person && <Text style={[styles.muted, { textAlign: align, fontFamily: fonts.regular }]}>{L('طلب', 'Request for')} {person.name}{offer ? ' · ' + (offer.transaction === 'rent' ? L('للإيجار', 'For rent') : L('للبيع', 'For sale')) : ''}</Text>}
                {price ? <Text style={[styles.heading, { textAlign: align, fontFamily: fonts.semiBold }]}>{price}</Text> : null}
              </View>
            </View>
          </Card>
          <Card padded>
            <Text accessibilityRole="header" style={[styles.heading, { textAlign: align, fontFamily: fonts.bold }]}>
              {L('شنو اللي تطابق؟', 'What matched?')}
            </Text>
            {evidence ? (
              <View style={styles.evidence}>
                {evidence.agrees.length > 0 && <Text style={[styles.text, { textAlign: align, fontFamily: fonts.medium }]}>{evidence.agrees.join('\n')}</Text>}
                {evidence.differs.length > 0 && <Text style={[styles.text, { textAlign: align, fontFamily: fonts.medium }]}>
                  {L('للمناقشة', 'For discussion')} · {evidence.differs.join(' · ')}
                </Text>}
                {evidence.unknown.length > 0 && <Text style={[styles.unknown, { textAlign: align, fontFamily: fonts.medium }]}>
                  {L('يحتاج تأكيد', 'Needs confirmation')} · {evidence.unknown.join(' · ')}
                </Text>}
                {evidence.agrees.length + evidence.differs.length + evidence.unknown.length === 0 &&
                  <Text style={[styles.muted, { textAlign: align, fontFamily: fonts.regular }]}>{L('تقدر تشوف التفاصيل في المقارنة.', 'See the comparison for details.')}</Text>}
              </View>
            ) : <Text style={[styles.muted, { textAlign: align, fontFamily: fonts.medium }]}>
              {L('المطابقة تغيرت. حدّث قائمة الإشعارات عشان تشوف النتائج الحالية.', 'This match has changed. Refresh the list to see current results.')}
            </Text>}
          </Card>
          {property && <Card><Row first icon="home" title={L('تفاصيل العقار', 'Property details')} disabled={busy}
            onPress={() => router.push({ pathname: '/property/[propertyCoreId]', params: { propertyCoreId: property.core.id } })} /></Card>}
          <Action label={comparison && match ? L('إخفاء المقارنة', 'Hide comparison') : L('عرض المقارنة', 'View comparison')}
            tone="primary" disabled={busy || !match}
            onPress={() => comparison ? setComparison(false) : void run('compare')} />
          {comparison && match && <Card padded>
            <Text accessibilityRole="header" style={[styles.heading, { textAlign: align, fontFamily: fonts.bold }]}>
              {L('مقارنة الطلب بالعقار', 'Compare request and property')}
            </Text>
            {comparisonRows.map(item => <View key={item.field} style={styles.comparisonRow}>
              <Text style={[styles.text, { textAlign: align, fontFamily: fonts.bold }]}>{item.label} · {item.statusLabel}</Text>
              <Text style={[styles.muted, { textAlign: align, fontFamily: fonts.regular }]}>{L('الطلب', 'Requested')} · {item.requested}</Text>
              <Text style={[styles.muted, { textAlign: align, fontFamily: fonts.regular }]}>{L('العقار', 'Offered')} · {item.offered}</Text>
            </View>)}
          </Card>}
          <Action label={L('مشاركة العقار', 'Share property')} disabled={busy || !match} onPress={() => void run('share')} />
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: options, disabled: !match || busy }}
            disabled={!match || busy} onPress={() => setOptions(value => !value)} style={styles.more}>
            <Feather name="more-horizontal" size={23} color={!match || busy ? colors.muted : colors.blue} />
            <Text style={[styles.muted, { fontFamily: fonts.medium }]}>{L('خيارات الإشعار', 'Notification options')}</Text>
          </Pressable>
          {options && <Card><Row first icon="clock" title={L('ذكّرني بعد ساعة', 'Remind me in an hour')} disabled={busy || !match} onPress={() => void run('snooze')} /></Card>}
          {time && <Text accessibilityLiveRegion="polite" style={[styles.muted, { textAlign: align, fontFamily: fonts.medium }]}>
            {L('التذكير الساعة', 'Reminder at')} {time}
          </Text>}
          {error !== '' && <Text accessibilityRole="alert" style={[styles.error, { textAlign: align, fontFamily: fonts.medium }]}>{error}</Text>}
        </View>
      )}
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10 },
  property: { direction: 'ltr', gap: 12, alignItems: 'center' },
  propertyIcon: { backgroundColor: colors.soft, borderRadius: 12, padding: 12 },
  propertyBody: { flex: 1, gap: 4 },
  heading: { fontSize: 18, color: colors.ink },
  text: { fontSize: 15, color: colors.ink },
  muted: { fontSize: 14, color: colors.muted },
  evidence: { gap: 8, marginTop: 10 },
  unknown: { backgroundColor: colors.soft, borderRadius: 8, padding: 9, color: colors.ink },
  comparisonRow: { gap: 3, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.red },
});
