import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, ScrollView, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Property } from '@workspace/property-domain';
import type { HomeMatch } from '@/services/assistantHome';
import type { MatchNotice } from '@/services/matchNotifications';
import { matchNoticeEvidence } from '@/services/matchNoticePresentation';
import { useI18n } from '@/contexts/I18nContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { Action, AssistantText, CountBadge } from '@/components/assistant/ui';
export function MatchNoticeToast({ notice, match, property, count, busy, allowMotion, onShare, onLater, onOpen }: {
  notice: MatchNotice; match: HomeMatch; property?: Property; count: number; busy: boolean; allowMotion: boolean;
  onShare(): void; onLater(): void; onOpen(): void;
}) {
  const { language, fonts, isRTL } = useI18n(), insets = useScreenInsets();
  const { height, width } = useWindowDimensions();
  const ar = language === 'ar', motion = allowMotion, fade = useRef(new Animated.Value(0)).current;
  const evidence = matchNoticeEvidence(match, property, language);
  const animatedNotice = useRef<string | null>(null);
  useEffect(() => {
    if (animatedNotice.current === notice.id) { fade.setValue(1); return; }
    animatedNotice.current = notice.id;
    if (!motion) { fade.setValue(1); return; }
    fade.setValue(0); const animation = Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }); animation.start(); return () => animation.stop();
  }, [notice.id, motion, fade]);
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 500 }]}>
    <Animated.View accessibilityLiveRegion="polite" testID="new-match-notice" style={[styles.card, { top: insets.top + 8, width: Math.min(560, Math.max(0, width - 24)), maxHeight: Math.max(240, height - insets.top - insets.bottom - 24), opacity: fade, direction: isRTL ? 'rtl' : 'ltr', transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}>
      <View style={styles.row}><Feather name="bell" size={21} color="#C62828" /><Text style={{ flex: 1, color: '#173F78', fontFamily: fonts.bold, fontSize: 16 }}>{ar ? 'فرصة مطابقة جديدة' : 'New matching opportunity'}</Text><CountBadge count={count} /><Pressable disabled={busy} onPress={onLater} accessibilityRole="button" accessibilityLabel={ar ? 'إغلاق مع الاحتفاظ بالإشعار' : 'Close and keep notification'} style={styles.close}><Feather name="x" color="#173F78" size={20} /></Pressable></View>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled"><AssistantText bold>{match.person.name}</AssistantText>
      <AssistantText size={13}>{evidence.agrees.join(' · ') || (ar ? 'ترشيح من محرك المطابقة' : 'Recommended by Matching')}</AssistantText>
      {evidence.differs.length > 0 && <AssistantText size={12} color="#C62828">{(ar ? 'للمناقشة: ' : 'Discuss: ') + evidence.differs.join(' · ')}</AssistantText>}
      {evidence.unknown.length > 0 && <AssistantText size={12} muted>{(ar ? 'يحتاج تأكيدًا: ' : 'Needs confirmation: ') + evidence.unknown.slice(0, 2).join('، ')}</AssistantText>}
      <AssistantText>{ar ? 'تحب تشارك هذا العقار مع العميل؟' : 'Share this property with the client?'}</AssistantText>
      </ScrollView><View style={styles.actions}><Action label={ar ? 'نعم، مشاركة' : 'Yes, share'} icon="share-2" tone="primary" disabled={busy} onPress={onShare} testID="match-notice-share" /><Action label={ar ? 'لا، لاحقًا' : 'Not now'} tone="quiet" disabled={busy} onPress={onLater} testID="match-notice-later" /></View>
      <Pressable disabled={busy} accessibilityRole="button" onPress={onOpen} style={{ minHeight: 44, justifyContent: 'center' }}><AssistantText size={13} color="#175CD3">{ar ? 'عرض كل الإشعارات' : 'View all notifications'}</AssistantText></Pressable>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({ card: { position: 'absolute', alignSelf: 'center', padding: 14, gap: 8, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C8D9EF', elevation: 8 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } });
