import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMatchNotifications } from '@/contexts/MatchNotificationsContext';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { currentNoticeMatch, type MatchNotice } from '@/services/matchNotifications';
import { matchNoticeEvidence } from '@/services/matchNoticePresentation';
import { AccountScreen } from '@/components/account/ui';
import { Action, AlertNote, AssistantText as Txt, CountBadge } from '@/components/assistant/ui';
import { getAreaById } from '@/constants/kuwait-areas';
import { useI18n } from '@/contexts/I18nContext';
export default function NotificationsScreen() {
  const n = useMatchNotifications(), account = useAccountFoundation(), { language, t } = useI18n(), router = useRouter();
  const ar = language === 'ar', [busy, setBusy] = useState(false), [error, setError] = useState('');
  const openShare = async (notice: MatchNotice) => {
    if (busy) return; setBusy(true); setError('');
    try { const current = await n.resolve(notice.id); await n.mark(notice.id, 'read'); router.push({ pathname: '/property/[propertyCoreId]/share', params: { propertyCoreId: current.match.result.propertyId, matchNoticeId: notice.id } } as never); }
    catch { setError(ar ? 'تعذر تأكيد المطابقة الحالية؛ حدّث القائمة قبل المشاركة.' : 'The current match could not be confirmed. Refresh before sharing.'); }
    finally { setBusy(false); }
  };
  const mark = async (id: string, action: 'read' | 'snooze') => {
    if (busy) return; setBusy(true); setError('');
    try { await n.mark(id, action); } catch { setError(ar ? 'لم يُحفظ التغيير. حاول مجددًا.' : 'Change was not saved. Try again.'); } finally { setBusy(false); }
  };
  const groups = new Map<string, MatchNotice[]>();
  for (const notice of n.state.entries) groups.set(notice.personId, [...(groups.get(notice.personId) ?? []), notice]);
  return <AccountScreen title={ar ? 'الإشعارات' : 'Notifications'} subtitle={ar ? 'فرص المطابقة محفوظة هنا؛ الإرسال يتم باختيارك.' : 'Matching opportunities stay here. You choose what to send.'}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{n.historyReady ? <CountBadge count={n.unread} /> : <Txt muted>—</Txt>}<Txt>{ar ? 'غير مقروءة' : 'Unread'}</Txt><Action label={ar ? 'تحديث' : 'Refresh'} icon="refresh-cw" disabled={busy} onPress={() => { setError(''); void n.refresh().catch(() => setError(ar ? 'تعذر التحديث.' : 'Refresh failed.')); }} /><Action label={ar ? 'إعدادات التنبيه' : 'Alert settings'} icon="settings" onPress={() => router.push('/account/notifications' as never)} /></View>
    {(!account.state.notifications.enabled || !account.state.notifications.matches) && <Txt muted>{ar ? 'التنبيه الفوري متوقف. يمكنك تفعيله من إعدادات التنبيه.' : 'Foreground alerts are off. Enable them in Alert settings.'}</Txt>}
    {(error || n.error) && <AlertNote>{error || (ar ? 'تعذر تحميل الإشعارات بأمان؛ بياناتك المحفوظة لم تُحذف.' : 'Notifications could not be loaded safely. Saved data was preserved.')}</AlertNote>}
    {n.status === 'loading' && <ActivityIndicator color="#175CD3" />}
    {n.historyReady && !n.state.entries.length && <Txt muted>{ar ? 'لا توجد إشعارات جديدة بعد. المطابقات الموجودة سابقًا متاحة في تبويب المطابقة.' : 'No new notifications yet. Existing matches remain in Matching.'}</Txt>}
    {[...groups].map(([personId, entries]) => <View key={personId} style={{ marginTop: 18, gap: 10 }}>
      <Txt bold color="#A45117">{n.catalog.people.find(p => p.id === personId)?.name ?? (ar ? 'عميل غير متاح' : 'Client unavailable')}{` · ${entries.length} `}{ar ? 'إشعارات عقارات' : 'property notifications'}</Txt>
      {entries.map((notice, index) => {
        const match = n.status === 'ready' ? currentNoticeMatch(notice, n.matches) : undefined;
        const property = n.catalog.properties.find(p => p.core.id === notice.propertyId);
        const evidence = match && matchNoticeEvidence(match, property, language);
        return <View key={notice.id} testID="match-notification-row" style={{ padding: 14, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: notice.read ? '#D4DEEA' : '#A7C6ED', backgroundColor: index % 2 ? '#F4F8FE' : '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>{!notice.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#C62828' }} />}<Txt bold>{property ? `${t(`propertyType.${property.core.propertyType}`)} · ${getAreaById(property.core.locationArea.id)?.[language] ?? property.core.locationArea.id}` : ar ? 'عقار غير متاح' : 'Property unavailable'}</Txt></View>
          <Txt size={12} muted>{new Intl.DateTimeFormat(ar ? 'ar-KW' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kuwait' }).format(new Date(notice.createdAt))}</Txt>
          {evidence ? <><Txt size={13}>{(ar ? 'يتوافق: ' : 'Meets: ') + (evidence.agrees.join(' · ') || (ar ? 'التصنيف والمعاملة' : 'Type and transaction'))}</Txt>{evidence.differs.length > 0 && <Txt size={13} color="#C62828">{(ar ? 'للمناقشة: ' : 'Discuss: ') + evidence.differs.join(' · ')}</Txt>}{evidence.unknown.length > 0 && <Txt size={12} muted>{(ar ? 'يحتاج تأكيدًا: ' : 'Needs confirmation: ') + evidence.unknown.join('، ')}</Txt>}</> : <Txt color="#C62828" size={13}>{ar ? 'هذا الإشعار محفوظ، لكن المطابقة تحتاج تحديثًا أو لم تعد ضمن الترشيحات الحالية.' : 'This notification is retained, but its match needs refreshing or is no longer current.'}</Txt>}
          {notice.snoozedUntil && !notice.read && <Txt muted size={12}>{ar ? 'تم تأجيل التذكير لوقت لاحق أثناء فتح التطبيق.' : 'Reminder deferred until later while the app is open.'}</Txt>}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Action label={ar ? 'مشاركة العقار' : 'Share property'} icon="share-2" tone="primary" disabled={busy || !match} onPress={() => void openShare(notice)} />
            <Action label={ar ? 'عرض المقارنة' : 'View comparison'} icon="target" disabled={busy || !match} onPress={() => { void mark(notice.id, 'read'); router.push({ pathname: '/matching', params: { requirementId: match?.requirement.id } } as never); }} />
            {!notice.read && <Action label={ar ? 'تم الاطلاع' : 'Mark read'} icon="check" disabled={busy} onPress={() => void mark(notice.id, 'read')} />}
            {match && <Action label={ar ? 'ذكّرني بعد ساعة' : 'Remind in an hour'} icon="clock" disabled={busy} onPress={() => void mark(notice.id, 'snooze')} />}
          </View>
        </View>;
      })}
    </View>)}
  </AccountScreen>;
}
