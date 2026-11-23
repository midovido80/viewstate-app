import { useAppUpdate } from '@/contexts/AppUpdateContext';
import { useCircleNotifications } from '@/contexts/CircleNotificationsContext';
import React, { createContext, useContext, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/contexts/I18nContext';
import { useMatchNotifications } from '@/contexts/MatchNotificationsContext';
import { ViewStateBrand } from '@/components/brand/ViewStateBrand';
import { useColors } from '@/hooks/useColors';
import { nextDesign as n } from '@/constants/nextDesign';
const ChromeContext = createContext(false);
export const useAppChrome = () => useContext(ChromeContext);
/** A persistent toolbar and local sheet: changing language never navigates away from an editor. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets(),
    colors = useColors(),
    router = useRouter();
  const pathname = usePathname();
  const { language, setLanguage, fonts } = useI18n(),
    notices = useMatchNotifications();
  const unread = useCircleNotifications().inbox.unread + notices.unread + Number(useAppUpdate().available);
  const [sheet, setSheet] = useState<'settings' | 'notifications' | null>(null);
  const ar = language === 'ar';
  const open = (value: 'settings' | 'notifications') => {
    Keyboard.dismiss();
    setSheet(value);
  };
  const tool = (
    icon: 'settings' | 'bell' | 'home',
    label: string,
    action: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={action}
      style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Feather name={icon} size={19} color="white" />
      {icon === 'bell' && unread > 0 && (
        <Text
          style={{
            position: 'absolute',
            right: -3,
            top: -3,
            backgroundColor: colors.destructive,
            color: 'white',
            borderRadius: 9,
            paddingHorizontal: 4,
            fontSize: 10,
          }}
        >
          {unread > 99 ? '99+' : unread}
        </Text>
      )}
    </Pressable>
  );
  return (
    <ChromeContext.Provider value={true}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          testID="app-global-toolbar"
          style={{
            paddingTop: insets.top,
            backgroundColor: n.blue,
            paddingHorizontal: 6,
            direction: 'ltr',
          }}
        >
          <View
            style={{
              height: 48,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', width: 96 }}>
              {tool('settings', ar ? 'الإعدادات' : 'Settings', () =>
                open('settings'),
              )}
              {tool('bell', ar ? 'الإشعارات' : 'Notifications', () =>
                open('notifications'),
              )}
            </View>
            <View pointerEvents="none" style={{ position: 'absolute', left: 96, right: 96, alignItems: 'center' }}>
              <ViewStateBrand inverse compact />
            </View>
            {tool('home', ar ? 'الرئيسية' : 'Home', () => {
              Keyboard.dismiss();
              if (pathname !== '/') router.dismissTo('/' as never);
            })}
          </View>
        </View>
        <View style={{ backgroundColor: n.background, paddingHorizontal: 18, paddingVertical: 5 }}>
          <Pressable testID="next-global-search" accessibilityRole="button"
            accessibilityLabel={ar ? 'ابحث عن عقار أو شخص أو طلب' : 'Search properties, people or requests'}
            onPress={() => router.push('/search' as never)}
            style={{ minHeight: 44, borderRadius: 10, backgroundColor: n.white, borderWidth: 1, borderColor: n.border, paddingHorizontal: 12, direction: 'ltr', flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 9 }}>
            <Feather name="search" size={18} color={n.muted} />
            <Text style={{ flex: 1, color: n.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: ar ? 'right' : 'left' }}>{ar ? 'ابحث عن عقار أو شخص أو طلب' : 'Search properties, people or requests'}</Text>
          </Pressable>
        </View>
        <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
          {children}
        </SafeAreaInsetsContext.Provider>
        <Modal
          visible={sheet !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setSheet(null)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              backgroundColor: '#00000066',
            }}
          >
            <Pressable
              accessibilityLabel={ar ? 'إغلاق' : 'Close'}
              onPress={() => setSheet(null)}
              style={{ flex: 1 }}
            />
            <View
              style={{
                backgroundColor: colors.card,
                padding: 20,
                paddingBottom: Math.max(insets.bottom, 20),
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: '75%',
                gap: 16,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Pressable
                  onPress={() => setSheet(null)}
                  accessibilityRole="button"
                  accessibilityLabel={ar ? 'إغلاق' : 'Close'}
                  style={{ padding: 10 }}
                >
                  <Feather name="x" size={22} color={colors.foreground} />
                </Pressable>
                <Text
                  style={{
                    fontFamily: fonts.bold,
                    fontSize: 20,
                    color: colors.foreground,
                  }}
                >
                  {sheet === 'settings'
                    ? ar
                      ? 'الإعدادات'
                      : 'Settings'
                    : ar
                      ? 'الإشعارات'
                      : 'Notifications'}
                </Text>
              </View>
              {sheet === 'settings' ? (
                <>
                  <Text
                    style={{
                      fontFamily: fonts.semiBold,
                      textAlign: ar ? 'right' : 'left',
                      color: colors.foreground,
                    }}
                  >
                    {ar ? 'اللغة' : 'Language'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {(['ar', 'en'] as const).map((value) => (
                      <Pressable
                        key={value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: language === value }}
                        onPress={() => setLanguage(value)}
                        style={{
                          flex: 1,
                          minHeight: 44,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor:
                            language === value ? colors.primary : colors.card,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: fonts.semiBold,
                            color:
                              language === value ? 'white' : colors.foreground,
                          }}
                        >
                          {value === 'ar' ? 'العربية' : 'English'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSheet(null);
                      router.push('/account' as never);
                    }}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontFamily: fonts.semiBold,
                        textAlign: ar ? 'right' : 'left',
                      }}
                    >
                      {ar ? 'كل إعدادات الحساب' : 'All account settings'}
                    </Text>
                  </Pressable>                  <Pressable accessibilityRole="button" onPress={() => { setSheet(null); router.push('/next-guide' as never); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontFamily: fonts.semiBold, textAlign: ar ? 'right' : 'left' }}>{ar ? 'دليل البداية' : 'Getting started'}</Text></Pressable>

                </>
              ) : (
                <>
                  <Text
                    style={{
                      fontFamily: fonts.regular,
                      color: colors.foreground,
                      textAlign: ar ? 'right' : 'left',
                    }}
                  >
                    {!notices.historyReady && !unread
                      ? ar
                        ? 'جارٍ تحميل الإشعارات…'
                        : 'Loading notifications…'
                      : unread
                        ? `${unread} ${ar ? 'إشعار غير مقروء' : 'unread notifications'}`
                        : ar
                          ? 'لا توجد إشعارات غير مقروءة'
                          : 'No unread notifications'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSheet(null);
                      router.push('/notifications' as never);
                    }}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.semiBold,
                        color: colors.primary,
                        textAlign: ar ? 'right' : 'left',
                      }}
                    >
                      {ar ? 'عرض كل الإشعارات' : 'View all notifications'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </ChromeContext.Provider>
  );
}
