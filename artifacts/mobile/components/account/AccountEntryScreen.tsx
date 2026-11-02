import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { ViewStateBrand } from '@/components/brand/ViewStateBrand';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';

type Props = { checking: boolean; failed: boolean; busy: boolean; error: string; onGoogle(): void; onGuest(): void; onRetry(): void; onSignOut?: () => void; onOpenBrowser?: () => void };
/** Real Google and local Guest use the existing gate; unconfigured providers cannot collect credentials. */
export function AccountEntryScreen(p: Props) {
  const { language, setLanguage, isRTL, fonts } = useI18n(), c = useColors(), ar = language === 'ar';
  const L = (a: string, e: string) => ar ? a : e;
  const text = { fontFamily: fonts.regular, color: c.text, textAlign: isRTL ? 'right' as const : 'left' as const };
  const button = (label: string, onPress: () => void, icon?: React.ReactNode, testID?: string, primary = false) => <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: p.busy }} disabled={p.busy} onPress={onPress} style={({ pressed }) => [s.button, { backgroundColor: primary ? c.primary : 'white', borderColor: primary ? c.primary : c.border, opacity: p.busy ? .5 : pressed ? .75 : 1 }]}>{p.busy && primary ? <ActivityIndicator color="white" /> : icon}<Text style={{ fontFamily: fonts.bold, color: primary ? 'white' : c.text, fontSize: 15 }}>{label}</Text></Pressable>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
      <Pressable accessibilityRole="button" onPress={() => setLanguage(ar ? 'en' : 'ar')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end' }}><Text style={[text, { color: c.primary }]}>{ar ? 'English' : 'العربية'}</Text></Pressable>
      <View style={{ alignItems: 'center', gap: 14, marginBottom: 16 }}><ViewStateBrand large /><Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 29, color: c.text }}>{L('أهلًا بعودتك', 'Welcome back')}</Text><Text style={[text, { textAlign: 'center', color: c.mutedForeground, fontSize: 15 }]}>{L('مساعدك العقاري الشخصي، كل يوم.', 'Your personal property assistant, every day.')}</Text></View>
      <View style={s.card}>
        {/* Disabled until a complete email signup/recovery service is implemented. Never request a Google password. */}
        <Text style={[text, { fontFamily: fonts.semiBold }]}>{L('البريد الإلكتروني', 'Email')}</Text>
        <View accessibilityState={{ disabled: true }} style={s.unavailableField}><Feather name="mail" size={18} color={c.mutedForeground} /><Text style={[text, { color: c.mutedForeground, flex: 1 }]}>name@example.com</Text></View>
        <Text style={[text, { fontFamily: fonts.semiBold }]}>{L('كلمة المرور', 'Password')}</Text>
        <View accessibilityState={{ disabled: true }} style={s.unavailableField}><Feather name="lock" size={18} color={c.mutedForeground} /><Text style={{ color: c.mutedForeground, flex: 1 }}>••••••••</Text><Feather name="eye-off" size={18} color={c.mutedForeground} /></View>
        <Text style={[text, { fontSize: 12, lineHeight: 19, color: c.mutedForeground }]}>{L('الدخول بالبريد وكلمة المرور غير مفعّل حاليًا. تابع باستخدام Google أو استخدم التطبيق كضيف.', 'Email/password sign-in is not activated. Continue with Google or use the app as a guest.')}</Text>
        {p.error ? <View accessibilityRole="alert" style={s.error}><Text style={[text, { color: c.destructive, lineHeight: 22 }]}>{p.error}</Text></View> : null}
        {p.checking ? <ActivityIndicator size="large" color={c.primary} /> : p.failed ? <>{button(L('إعادة المحاولة', 'Retry'), p.onRetry, undefined, undefined, true)}{p.onSignOut && button(L('تسجيل الخروج', 'Sign out'), p.onSignOut)}</> : button(L('المتابعة باستخدام Google', 'Sign in with Google'), p.onGoogle, <FontAwesome name="google" size={19} color="white" />, 'google-sign-in', true)}
        <View accessibilityState={{ disabled: true }} style={[s.button, { backgroundColor: '#F4F6FA', borderColor: c.border, opacity: .65 }]}><FontAwesome name="apple" size={21} color={c.text} /><Text style={[text, { fontFamily: fonts.medium }]}>{L('Apple — لاحقًا', 'Apple — coming later')}</Text></View>
        <View style={s.separator}><View style={s.line} /><Text style={{ fontFamily: fonts.regular, color: c.mutedForeground }}>{L('أو', 'or')}</Text><View style={s.line} /></View>
        {button(L('استخدام بدون حساب', 'Use as guest'), p.onGuest, <Feather name="user" size={19} color={c.primary} />, 'use-as-guest')}
        <Text style={[text, { color: c.mutedForeground, fontSize: 12, lineHeight: 20, textAlign: 'center' }]}>{L('بدون حساب، تُحفظ عقاراتك وعملاؤك على هذا الجهاز. يمكنك تفعيل حسابك لاحقًا من الإعدادات.', 'As a guest, properties and clients stay on this device. Activate your account later in Settings.')}</Text>
      </View>
      {p.onOpenBrowser && button(L('فتح في تبويب مستقل', 'Open in a separate tab'), p.onOpenBrowser, <Feather name="external-link" size={17} color={c.primary} />)}
      <Text style={[text, { color: c.mutedForeground, fontSize: 11, lineHeight: 18, textAlign: 'center' }]}>{L('لا نطلب كلمة مرور Google داخل ViewState. مزامنة العقارات والميديا سحابيًا لم تُفعّل بعد.', 'We never ask for your Google password in ViewState. Property and media cloud sync is not activated yet.')}</Text>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
const s = StyleSheet.create({ page: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 26, gap: 12, maxWidth: 470, width: '100%', alignSelf: 'center' }, card: { borderWidth: 1, borderColor: '#DBE3EF', backgroundColor: 'white', borderRadius: 22, padding: 20, gap: 11, shadowColor: '#172C4D', shadowOpacity: .04, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } }, button: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, unavailableField: { minHeight: 48, paddingHorizontal: 13, backgroundColor: '#F5F7FB', borderColor: '#DBE3EF', borderWidth: 1, borderRadius: 13, flexDirection: 'row', gap: 10, alignItems: 'center' }, separator: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 3 }, line: { flex: 1, height: 1, backgroundColor: '#E5EAF2' }, error: { padding: 12, borderRadius: 12, backgroundColor: '#FFF1F2' } });
