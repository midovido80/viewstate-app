import { Text } from "@/components/AppText";
import { useAppUpdate } from '@/contexts/AppUpdateContext';
import { circleUnreadCount } from '@/services/notificationFeed';
import { useCircleNotifications } from '@/contexts/CircleNotificationsContext';
import { useAppChrome } from '@/components/AppChrome';
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { useI18n } from '@/contexts/I18nContext';
import { ViewStateBrand } from '@/components/brand/ViewStateBrand';
import { useMatchNotifications } from '@/contexts/MatchNotificationsContext';

const touchSize = Platform.OS === 'android' ? 48 : 44;

export function PrimaryTabHeader({ title, compactSearch = false, action }: { title: string; compactSearch?: boolean; action?: React.ReactNode }) {
  const chrome=useAppChrome();
  const router = useRouter(), colors = useColors(), insets = useScreenInsets();
  const { t, isRTL, fonts, language } = useI18n(), notices = useMatchNotifications();
  const { inbox } = useCircleNotifications();
  const unread = circleUnreadCount(inbox.unread, inbox.entries) + notices.unread + Number(useAppUpdate().available);
  const row = isRTL ? 'row-reverse' : 'row';
  return <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    {!chrome && <View style={[styles.brandRow, { flexDirection: row }]}>
      <ViewStateBrand />
      <View style={{ flexDirection: row, gap: 4 }}>
        {compactSearch && <TouchableOpacity testID="global-search-open" accessibilityRole="button" accessibilityLabel={t('search.open')} onPress={() => router.push('/search' as never)} style={styles.tool}><Feather name="search" size={21} color={colors.text} /></TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={language === 'ar' ? `الإشعارات، ${(notices.historyReady || unread) ? unread : '—'}` : `Notifications, ${(notices.historyReady || unread) ? unread : '—'}`} onPress={() => router.push('/notifications' as never)} style={styles.tool}>
          <Feather name="bell" size={21} color={colors.text} />
          {unread > 0 ? <View style={styles.badge}><Text style={{ color: 'white', fontSize: 10, fontFamily: fonts.bold }}>{unread > 99 ? '99+' : unread}</Text></View> : null}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={language === 'ar' ? 'الإعدادات والحساب' : 'Settings & account'} onPress={() => router.push('/account' as never)} style={styles.tool}><Feather name="settings" size={21} color={colors.text} /></TouchableOpacity>
      </View>
    </View>
    }<View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}><Text accessibilityRole="header" style={[styles.title, { color: colors.text, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>{action}</View>
    {!chrome && !compactSearch && <TouchableOpacity style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: row }]} onPress={() => router.push('/search' as never)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('search.open')} testID="global-search-open">
      <Feather name="search" size={18} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: 14, flex: 1, textAlign: isRTL ? 'right' : 'left' }}>{t('common.search')}</Text>
    </TouchableOpacity>}
  </View>;
}
const styles = StyleSheet.create({ container: { paddingHorizontal: 18, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#E9EDF5', zIndex: 10 }, brandRow: { minHeight: 53, alignItems: 'center', justifyContent: 'space-between', gap: 10 }, title: { fontSize: 19, lineHeight: 26 }, searchBar: { minHeight: touchSize, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, alignItems: 'center', gap: 9 }, tool: { width: touchSize, height: touchSize, alignItems: 'center', justifyContent: 'center' }, badge: { position: 'absolute', top: 1, right: 1, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3, backgroundColor: '#D73C4A', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' } });
