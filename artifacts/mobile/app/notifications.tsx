import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppUpdateAction } from '@/components/AppUpdateAction';
import { AccountHeader, useL } from '@/components/account/ui';
import { nextDesign as colors } from '@/constants/nextDesign';
import { getAreaById } from '@/constants/kuwait-areas';
import { useCircleNotifications, type CircleNoticeKind } from '@/contexts/CircleNotificationsContext';
import { useMatchNotifications } from '@/contexts/MatchNotificationsContext';
import { useI18n } from '@/contexts/I18nContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { groupNotificationFeed, type FeedRow } from '@/services/notificationFeed';

type Local = ReturnType<typeof useMatchNotifications>['state']['entries'][number];
type Circle = ReturnType<typeof useCircleNotifications>['inbox']['entries'][number];
type Row = FeedRow<Local, Circle>;

const circleLabels: Record<CircleNoticeKind, readonly [string, string]> = {
  invite: ['دعوة لدائرة الثقة', 'Trust Circle invitation'],
  join_request: ['طلب انضمام ينتظر موافقتك', 'Join request awaiting your approval'],
  listing: ['عقار جديد في دائرة الثقة', 'New Trust Circle listing'],
  match: ['مطابقة في دائرة الثقة', 'Trust Circle match'],
  cooperation: ['تحديث تعاون', 'Cooperation update'],
  test: ['إشعار تجريبي', 'Test notification'],
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { noticeId } = useLocalSearchParams<{ noticeId?: string }>();
  const { L, align, row, fonts, isRTL, language } = useL();
  const { t } = useI18n();
  const insets = useScreenInsets();
  const local = useMatchNotifications();
  const { inbox, failed, refresh: refreshCircle, markRead } = useCircleNotifications();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const opening = useRef(false);
  const consumed = useRef<string | undefined>(undefined);
  const { today, earlier } = groupNotificationFeed(local.state.entries, inbox.entries, unreadOnly, new Date());
  const sections = [
    { title: L('اليوم', 'Today'), data: today },
    { title: L('السابق', 'Earlier'), data: earlier },
  ].filter(section => section.data.length > 0);
  const dateFormat = new Intl.DateTimeFormat(isRTL ? 'ar-KW' : 'en-KW', {
    timeZone: 'Asia/Kuwait', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const openCircle = useCallback(async (id: string, kind?: CircleNoticeKind) => {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    setError(false);
    try {
      const target = await markRead(id);
      if (target?.circleId) {
        router.push({
          pathname: '/trust-circle',
          params: { circleId: target.circleId, noticeKind: target.matchId ? 'match' : target.kind, noticeTargetId: target.matchId ?? target.targetId },
        } as never);
      } else if (!target && kind !== 'test') setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      opening.current = false;
    }
  }, [markRead, router]);

  useEffect(() => {
    if (busy || typeof noticeId !== 'string' || consumed.current === noticeId) return;
    consumed.current = noticeId;
    void openCircle(noticeId);
  }, [noticeId, busy, openCircle]);

  async function refresh() {
    setRefreshing(true);
    setError(false);
    try {
      await Promise.allSettled([local.refresh(), refreshCircle()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function openMatch(item: Local) {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    setError(false);
    try {
      if (!item.read) await local.mark(item.id, 'read');
      router.push({ pathname: '/notification-match', params: { noticeId: item.id } } as never);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      opening.current = false;
    }
  }

  function renderRow({ item: entry }: { item: Row }) {
    let title: string;
    let subtitle: string;
    const date = dateFormat.format(new Date(entry.createdAt));
    if (entry.source === 'local') {
      const property = local.catalog.properties.find(item => item.core.id === entry.item.propertyId);
      const person = local.catalog.people.find(item => item.id === entry.item.personId);
      const area = property && getAreaById(property.core.locationArea.id);
      title = property
        ? [t(`propertyType.${property.core.propertyType}`), area?.[language]].filter(Boolean).join(' · ')
        : L('مطابقة عقار', 'Property match');
      subtitle = [person?.name, date].filter(Boolean).join(' · ');
    } else {
      title = circleLabels[entry.item.kind][isRTL ? 0 : 1];
      subtitle = date;
    }

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, subtitle, !entry.read && L('غير مقروء', 'Unread')].filter(Boolean).join('، ')}
        disabled={busy}
        onPress={() => entry.source === 'local' ? void openMatch(entry.item) : void openCircle(entry.item.id, entry.item.kind)}
        style={({ pressed }) => [styles.notice, { flexDirection: row, backgroundColor: pressed ? colors.soft : colors.white }]}
        testID={entry.source === 'local' ? 'match-notification-row' : 'circle-notification-row'}
      >
        {!entry.read && <View style={styles.dot} />}
        <View style={styles.noticeText}>
          {entry.source === 'local' && <Text style={[styles.kind, { fontFamily: fonts.semiBold, textAlign: align }]}>{L('مطابقة عقار', 'Property match')}</Text>}
          <Text style={[styles.title, { fontFamily: entry.read ? fonts.medium : fonts.bold, textAlign: align }]}>{title}</Text>
          <Text style={[styles.muted, { fontFamily: fonts.regular, textAlign: align }]}>{subtitle}</Text>
        </View>
        <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={19} color={colors.muted} />
      </Pressable>
    );
  }

  const loading = local.status === 'loading';
  return (
    <View style={styles.screen}>
      <AccountHeader title={L('الإشعارات', 'Notifications')} onBack={() => router.canGoBack() ? router.back() : router.replace('/')}
        trailing={<Pressable accessibilityRole="button" accessibilityLabel={L('إعدادات الإشعارات', 'Notification settings')}
          style={styles.gear} onPress={() => router.push('/account/notifications' as never)} testID="notification-settings">
          <Feather name="settings" size={22} color={colors.ink} />
        </Pressable>} />
      <SectionList
        sections={sections}
        renderItem={renderRow}
        renderSectionHeader={({ section }) => <Text accessibilityRole="header"
          style={[styles.section, { fontFamily: fonts.bold, textAlign: align }]}>{section.title}</Text>}
        keyExtractor={entry => `${entry.source}-${entry.item.id}`}
        stickySectionHeadersEnabled={false}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 18 }]}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <AppUpdateAction mode="banner" />
            <View style={[styles.filters, { flexDirection: row }]}>
              {[false, true].map(value => (
                <Pressable key={String(value)} accessibilityRole="tab" accessibilityState={{ selected: unreadOnly === value }}
                  onPress={() => setUnreadOnly(value)} style={[styles.filter, unreadOnly === value && styles.filterSelected]}
                  testID={value ? 'notifications-unread' : 'notifications-all'}>
                  <Text style={{ color: unreadOnly === value ? colors.blue : colors.ink, fontFamily: fonts.semiBold }}>
                    {value ? L('غير مقروءة', 'Unread') : L('الكل', 'All')}
                  </Text>
                </Pressable>
              ))}
            </View>
            {(error || local.error || failed) && <Text accessibilityRole="alert" style={[styles.error, { textAlign: align, fontFamily: fonts.medium }]}>
              {error ? L('تعذّر فتح الإشعار. حاول مرة ثانية.', 'Could not open the notification. Try again.')
                : L('تعذّر تحميل بعض الإشعارات. اسحب القائمة لتحت وحاول مرة ثانية.', 'Could not load some notifications. Pull down to try again.')}
            </Text>}
          </View>
        }
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.blue} /> : !local.error && !failed
          ? <Text style={[styles.empty, { fontFamily: fonts.medium }]}>
            {unreadOnly ? L('ما عندك إشعارات غير مقروءة', 'No unread notifications') : L('ما عندك إشعارات للحين', 'No notifications yet')}
          </Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  gear: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  content: { maxWidth: 760, width: '100%', alignSelf: 'center', paddingHorizontal: 16, paddingTop: 10 },
  headerContent: { gap: 14, marginBottom: 6 },
  filters: { direction: 'ltr', borderWidth: 1, borderColor: colors.border, padding: 3, borderRadius: 12, backgroundColor: colors.white },
  filter: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  filterSelected: { backgroundColor: colors.soft },
  section: { fontSize: 18, color: colors.ink, marginTop: 13, marginBottom: 9 },
  notice: { direction: 'ltr', alignItems: 'center', gap: 10, minHeight: 74, padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  noticeText: { minWidth: 0, flex: 1, gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue },
  kind: { fontSize: 12, color: colors.blue },
  title: { fontSize: 16, color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  empty: { padding: 32, textAlign: 'center', color: colors.muted },
  error: { color: colors.red },
});
