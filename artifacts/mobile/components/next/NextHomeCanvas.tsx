import { Text } from "@/components/AppText";
import { TrustCircleHero } from './TrustCircleHero';
import { AppUpdateAction } from '@/components/AppUpdateAction';
import { NextFirstUse } from './NextFirstUse';
import { NextRecentWork } from './NextRecentWork';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import type { Person } from '@/services/people';
import { useI18n } from '@/contexts/I18nContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { nextDesign as n } from '@/constants/nextDesign';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { matchingTarget } from '@/services/matchingScope';
import type { HomeQuickAction } from '@/services/assistantHome';

/** A new presentation surface over the original catalog, matching and task commands.
 * No sample records, alternate repositories, or demo scoring enter the real app.
 */
export function NextHomeCanvas({
  ready,
  properties,
  requirements,
  people,
  date,
  matches,
  matchStatus,
  retryMatches,
  tasks,
  taskCount,
  hasSavedTasks,
  onQuickAction,
  openTasks,
  addTask,
  openCalendar,
  openRequests,
  notice,
}: {
  ready: boolean;
  properties: readonly Property[];
  requirements: readonly SeekerRequirement[];
  people: readonly Person[];
  date: string;
  matches: number;
  matchStatus: 'loading' | 'ready' | 'error';
  retryMatches: () => void;
  tasks: React.ReactNode;
  taskCount: number;
  hasSavedTasks: boolean;
  onQuickAction: (action: HomeQuickAction) => void;
  openTasks: () => void;
  addTask: () => void;
  openCalendar: () => void;
  openRequests: () => void;
  notice?: React.ReactNode;
}) {
  const router = useRouter(),
    { language, fonts, isRTL, t } = useI18n(),
    insets = useScreenInsets();
  const firstUse =
    ready &&
    !hasSavedTasks &&
    !properties.length &&
    !people.length &&
    !requirements.length;
  const ar = language === 'ar',
    align = isRTL ? ('right' as const) : ('left' as const);
  const row = isRTL ? ('row-reverse' as const) : ('row' as const);
  const text = { color: n.ink, fontFamily: fonts.regular, textAlign: align };
  const heading = {
    ...text,
    fontFamily: fonts.bold,
    fontSize: 19,
    lineHeight: 28,
  };
  const small = { ...text, color: n.muted, fontSize: 13, lineHeight: 21 };
  const action = (label: string, onPress: () => void, id?: string) => (
    <Pressable
      testID={id}
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}
    >
      <Text style={{ color: n.blue, fontFamily: fonts.semiBold, fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView
      testID="assistant-page-scroll"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: n.background }}
      contentContainerStyle={{
        padding: 18,
        paddingTop: 8,
        paddingBottom: insets.bottom + 28,
        gap: 14,
        width: '100%',
        maxWidth: 760,
        alignSelf: 'center',
      }}
    >
      <AppUpdateAction mode="banner" />
      <View
        style={{
          direction: 'ltr',
          flexDirection: row,
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text
          style={{ ...text, flex: 1, fontFamily: fonts.semiBold, fontSize: 14 }}
        >
          {date}
        </Text>
        {action(
          ar ? 'المساعدة' : 'Help',
          () => router.push('/next-guide' as never),
          'home-help',
        )}
      </View>
      <TrustCircleHero />
      <View
        testID="home-best-matches"
        style={{
          padding: 18,
          backgroundColor: n.white,
          borderWidth: 1,
          borderColor: n.border,
          borderRadius: 16,
          gap: 10,
        }}
      >
        <Text accessibilityRole="header" style={heading}>
          {ar
            ? 'مطابقة عقاراتك وطلبات عملائك'
            : 'Opportunities worth following up'}
        </Text>
        <Text style={small}>
          {ar
            ? 'نتائج سجلاتك الخاصة. فرص زملائك تلقاها داخل دائرة الثقة.'
            : 'Top results from your saved offers and client requests.'}
        </Text>
        {matchStatus === 'loading' ? (
          <ActivityIndicator color={n.blue} />
        ) : matchStatus === 'error' ? (
          <>
            <Text accessibilityRole="alert" style={small}>
              {ar
                ? 'تعذر تحميل المطابقات. بياناتك ما زالت محفوظة.'
                : 'Matches could not load. Your records remain saved.'}
            </Text>
            {action(ar ? 'إعادة المحاولة' : 'Retry', retryMatches)}
          </>
        ) : (
          <View
            style={{
              direction: 'ltr',
              flexDirection: row,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{ fontFamily: fonts.bold, color: n.blue, fontSize: 30 }}
            >
              {matches}
            </Text>
            {action(
              ar ? 'شوف المناسب ولماذا' : 'See what fits and why',
              () => router.push(matchingTarget({ kind: 'best' }) as never),
              'next-home-open-matches',
            )}
          </View>
        )}
      </View>
      {notice}
      {firstUse && <NextFirstUse onAction={onQuickAction} />}
      <View style={{ gap: 8 }}>
        <View
          style={{
            direction: 'ltr',
            flexDirection: row,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text accessibilityRole="header" style={heading}>
            {firstUse
              ? ar
                ? 'اليوم'
                : 'Today'
              : ar
                ? 'متابعاتك القادمة'
                : 'Upcoming follow-ups'}
          </Text>
          {action(
            ar ? 'التقويم' : 'Calendar',
            openCalendar,
            'home-compact-calendar',
          )}
        </View>
        <View
          testID="assistant-task-list"
          style={{
            backgroundColor: n.white,
            borderWidth: 1,
            borderColor: n.border,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {!ready ? (
            <ActivityIndicator style={{ padding: 22 }} color={n.blue} />
          ) : taskCount ? (
            tasks
          ) : (
            <Text style={{ ...small, padding: 18 }}>
              {ar
                ? 'ستظهر مواعيدك ومتابعاتك هنا.'
                : 'Your appointments and follow-ups will appear here.'}
            </Text>
          )}
          {!firstUse && (
            <View
              style={{
                direction: 'ltr',
                flexDirection: row,
                justifyContent: 'space-between',
                paddingHorizontal: 10,
              }}
            >
              {action(ar ? 'إضافة متابعة' : 'Add follow-up', addTask)}
              {action(ar ? 'عرض الكل' : 'View all', openTasks)}
            </View>
          )}
        </View>
      </View>
      <Pressable
        testID="next-paste-message"
        accessibilityRole="button"
        onPress={() => router.push('/intake' as never)}
        style={{
          direction: 'ltr',
          flexDirection: row,
          alignItems: 'center',
          gap: 10,
          borderWidth: 1,
          borderColor: '#25D36644',
          backgroundColor: '#25D3661A',
          borderRadius: 12,
          padding: 14,
          minHeight: 48,
        }}
      >
        <Feather name="message-circle" size={19} color="#17643B" />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              ...text,
              color: '#17643B',
              fontFamily: fonts.bold,
              fontSize: 14,
            }}
          >
            {ar ? 'استيراد رسالة أو إعلان' : 'Import a message or listing'}
          </Text>
          <Text style={small}>
            {ar ? 'من واتساب أو أي تطبيق آخر' : 'From WhatsApp or another app'}
          </Text>
        </View>
      </Pressable>
      <NextRecentWork
        loading={!ready}
        properties={properties}
        people={people}
        requirements={requirements}
      />
      <View style={{ direction: 'ltr', flexDirection: row, gap: 6 }}>
        {[
          [
            properties.length,
            ar ? 'عقارات' : 'Properties',
            () => router.push('/properties' as never),
          ],
          [
            people.length,
            ar ? 'أشخاص' : 'People',
            () => router.push('/people' as never),
          ],
          [
            requirements.length,
            ar ? 'طلبات عملاء' : 'Client requests',
            openRequests,
          ],
        ].map(([count, label, onPress]) => (
          <Pressable
            key={String(label)}
            accessibilityRole="button"
            onPress={onPress as () => void}
            style={{
              flex: 1,
              minHeight: 70,
              gap: 3,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ color: n.ink, fontFamily: fonts.bold, fontSize: 22 }}
            >
              {ready ? String(count) : '—'}
            </Text>
            <Text style={{ ...small, textAlign: 'center' }}>
              {String(label)}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
