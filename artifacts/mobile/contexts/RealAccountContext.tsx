import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useI18n } from './I18nContext';
import { UserDataProvider, buildUserData, type UserResources } from './UserDataContext';
import { createGoogleAccountDevice } from '@/services/googleAccountDevice';
import { createAccountRepositoriesDevice } from '@/services/accountRepositoriesDevice';
import { accountEntryStage, ONBOARDING_SEEN_KEY } from '@/services/accountOnboarding';
import type { UserContactProfile } from '@/services/googleAccountContract';
import { clearMatchingReturn } from '@/services/matchingReturnSession';
import { stopMatchCue } from '@/services/matchNoticeDevice';
import { AccountProfileForm, accountScreenStyles as s, type ContactInput } from '@/components/account/AccountProfileForm';

type Device = Awaited<ReturnType<typeof createGoogleAccountDevice>>;
type Lease = Awaited<ReturnType<Device['account']['openScope']>>;
type Active = { lease: Lease; resources: UserResources; data: ReturnType<typeof buildUserData>; profile: UserContactProfile | null; photo: string; reducedMotion: boolean; id: number };
interface RealAccount { email: string; profile: UserContactProfile; photo: string; assertActive(): void; saveContact(value: ContactInput, photo: string): Promise<void>; signOut(): Promise<void> }
const Context = createContext<RealAccount | null>(null);
export function useRealAccount() { return useContext(Context); }

function Welcome({ reducedMotion, onDone, busy }: { reducedMotion: boolean; onDone(): void; busy: boolean }) {
  const { language, isRTL } = useI18n();
  const ar = language === 'ar';
  const opacity = useRef(new Animated.Value(1)).current;
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(system => {
      if (!alive || reducedMotion || system) return;
      opacity.setValue(0); y.setValue(14);
      animation = Animated.parallel([Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }), Animated.spring(y, { toValue: 0, damping: 18, stiffness: 110, useNativeDriver: true })]);
      animation.start();
    }).catch(() => undefined);
    return () => { alive = false; animation?.stop(); };
  }, [reducedMotion, opacity, y]);
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={[s.content, { direction: isRTL ? 'rtl' : 'ltr' }]}>
    <Pressable accessibilityRole="button" disabled={busy} style={[s.quiet, { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' }]} onPress={onDone}><Text style={s.link}>{ar ? 'تخطي' : 'Skip'}</Text><Feather name={isRTL ? 'chevrons-left' : 'chevrons-right'} size={20} color="#2360D9" /></Pressable>
    <View style={{ flex: 1, justifyContent: 'center', gap: 28, paddingVertical: 48 }}>
      <Animated.Text style={[s.brand, { fontSize: 40, textAlign: 'center', opacity, transform: [{ translateY: y }] }]}>ViewState</Animated.Text>
      <Text style={[s.title, { textAlign: 'center' }]}>{ar ? 'عقاراتك وعلاقاتك وفرصك، في مكان واحد.' : 'Your properties, people and opportunities. Together.'}</Text>
      <Text style={[s.description, { textAlign: 'center' }]}>{ar ? 'سجّل عقاراتك وعملاءك، حدّد متطلباتهم، واكتشف أقرب المطابقات. رتّب متابعاتك ومواعيد معايناتك من الرئيسية.' : 'Capture properties and clients, record their requirements and find the closest matches. Organize follow-ups and viewings from Home.'}</Text>
    </View>
    <Pressable accessibilityRole="button" testID="account-welcome-start" style={s.primary} disabled={busy} onPress={onDone}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{ar ? 'ابدأ استخدام ViewState' : 'Start using ViewState'}</Text>}</Pressable>
  </ScrollView></SafeAreaView>;
}

/** With configuration present, no app screen or device-global store mounts before verified onboarding. */
export function RealAccountGate({ children }: { children: React.ReactNode }) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const configured = Boolean(url || publishableKey);
  const { language, setLanguage, isRTL } = useI18n();
  const L = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [stage, setStage] = useState<'checking' | 'signin' | 'profile' | 'welcome' | 'ready' | 'error'>('checking');
  const [active, setActive] = useState<Active | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const device = useRef<Device | null>(null);
  const current = useRef<Active | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const checking = useRef(false);
  const assertCurrent = (owner: Active) => { owner.lease.scope.assertActive(); if (!mounted.current || current.current?.lease !== owner.lease) throw new Error('ACCOUNT_CHANGED'); };
  const hideData = () => {
    epoch.current++;
    current.current?.lease.close(); current.current = null;
    clearMatchingReturn(); stopMatchCue();
    if (mounted.current) { setActive(null); setBusy(false); }
  };
  const bootstrap = async () => {
    if (checking.current) return;
    checking.current = true;
    hideData();
    const expected = epoch.current;
    const valid = () => { if (!mounted.current || expected !== epoch.current) throw new Error('ACCOUNT_CHANGED'); };
    setStage('checking'); setError('');
    let lease: Lease | undefined;
    try {
      if (!url || !publishableKey) throw new Error('ACCOUNT_CONFIGURATION_INCOMPLETE');
      if (!device.current) { const next = await createGoogleAccountDevice({ url, publishableKey }); if (!mounted.current || expected !== epoch.current) { next.dispose(); return; } device.current = next; }
      valid();
      if (Platform.OS === 'web' && window.location.pathname === '/auth/callback') {
        try { await device.current.account.completeCallback(window.location.href); }
        finally { window.history.replaceState(null, '', '/'); }
      }
      valid();
      const verified = await device.current.account.readVerifiedAccount(); valid();
      if (!verified) { setStage('signin'); return; }
      lease = await device.current.account.openScope(() => {
        // No awaited auth request inside the SDK callback.
        hideData();
        if (mounted.current) { setStage('signin'); setError(L('انتهت الجلسة أو تغيّر الحساب. سجّل الدخول مرة أخرى.', 'Session ended or account changed. Sign in again.')); }
      });
      valid();
      const resources = createAccountRepositoriesDevice(lease.scope);
      const settings = await resources.settings.load(); valid();
      const profile = await device.current.account.readProfile(); valid();
      const seen = await resources.storage.getItem(ONBOARDING_SEEN_KEY); valid();
      const owner: Active = { lease, resources, data: buildUserData(resources), profile, photo: settings.profile.photo, reducedMotion: settings.reducedMotion, id: expected };
      current.current = owner; setActive(owner);
      setStage(accountEntryStage(profile, seen === '1'));
    } catch {
      lease?.close();
      if (mounted.current && expected === epoch.current) { setStage('error'); setError(L('تعذّر التحقق من الحساب أو تحميل بياناته. بيانات الجهاز محفوظة؛ راجع الاتصال وإعدادات الخدمة ثم أعد المحاولة.', 'Could not verify your account or load its data. Device data is preserved. Check your connection and service configuration, then retry.')); }
    } finally { checking.current = false; }
  };
  useEffect(() => {
    mounted.current = true;
    if (configured) { void SplashScreen.hideAsync().catch(() => undefined); void bootstrap(); }
    return () => { mounted.current = false; hideData(); checking.current = false; const previous = device.current; device.current = null; previous?.dispose(); };
  }, []);
  const signOut = async () => {
    hideData(); setStage('signin'); setError(''); setBusy(true);
    try { await device.current?.account.signOut(); }
    catch { if (mounted.current) { setStage('error'); setError(L('تعذّر إنهاء جلسة الدخول. بيانات التطبيق مخفية؛ أعد محاولة تسجيل الخروج.', 'Could not end the sign-in session. App data is hidden; retry sign out.')); } }
    finally { if (mounted.current) setBusy(false); }
  };
  const signIn = async () => {
    if (busy || !device.current) return;
    setBusy(true); setError('');
    try { const result = await device.current.account.signIn(); if (result.type === 'signed_in') await bootstrap(); }
    catch { if (mounted.current) setError(L('لم يكتمل دخول Google. راجع الاتصال وحسابات الاختبار وروابط الرجوع ثم حاول مجددًا.', 'Google sign-in did not finish. Check your connection, test users and callback URLs, then retry.')); }
    finally { if (mounted.current) setBusy(false); }
  };
  const saveContact = async (input: ContactInput, photo: string) => {
    const owner = current.current;
    if (!owner || !device.current) throw new Error('SIGN_IN_REQUIRED');
    assertCurrent(owner);
    const profile = await device.current.account.saveProfile(input); assertCurrent(owner);
    await owner.resources.settings.load(); assertCurrent(owner);
    await owner.resources.settings.update(state => ({ ...state, profile: { name: profile.display_name, company: profile.company, photo } })); assertCurrent(owner);
    const next = { ...owner, profile, photo };
    current.current = next; setActive(next);
    if (stage === 'profile') setStage('welcome');
  };
  const finishWelcome = async () => {
    const owner = current.current; if (!owner || busy) return;
    setBusy(true); setError('');
    try {
      assertCurrent(owner); await owner.resources.storage.setItem(ONBOARDING_SEEN_KEY, '1');
      assertCurrent(owner);
      if (await owner.resources.storage.getItem(ONBOARDING_SEEN_KEY) !== '1') throw new Error('WELCOME_SAVE_FAILED');
      assertCurrent(owner); setStage('ready');
    } catch { if (current.current === owner) setError(L('تعذّر حفظ إتمام الترحيب. حاول مجددًا.', 'Could not save welcome completion. Try again.')); }
    finally { if (mounted.current) setBusy(false); }
  };
  if (!configured) return <>{children}</>;
  if (active && stage === 'profile') return <AccountProfileForm userId={active.lease.account.userId} email={active.lease.account.email} initial={active.profile} photo={active.photo} onSave={saveContact} onCancel={() => void signOut()} />;
  if (active && stage === 'welcome') return <View style={{ flex: 1 }}><Welcome reducedMotion={active.reducedMotion} busy={busy} onDone={() => void finishWelcome()} />{error ? <Text accessibilityRole="alert" style={[s.red, { padding: 16 }]}>{error}</Text> : null}</View>;
  if (active?.profile && stage === 'ready') return <Context.Provider value={{ email: active.lease.account.email, profile: active.profile, photo: active.photo, assertActive: () => assertCurrent(active), saveContact, signOut }}><UserDataProvider value={active.data}><React.Fragment key={active.id}>{children}</React.Fragment></UserDataProvider></Context.Provider>;
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={[s.content, { justifyContent: 'center', direction: isRTL ? 'rtl' : 'ltr' }]}>
    <Text style={s.brand}>ViewState</Text>
    <Pressable accessibilityRole="button" style={[s.quiet, { alignSelf: 'flex-end' }]} onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')}><Text style={s.link}>{language === 'ar' ? 'English' : 'العربية'}</Text></Pressable>
    <Text style={s.title}>{L('مساعدك العقاري الشخصي', 'Your personal property assistant')}</Text>
    <Text style={s.description}>{L('سجّل الدخول بحساب Google الخاص بك، ثم أكمل بياناتك. عقاراتك وعملاؤك ومسوداتك منفصلة لكل حساب على هذا الجهاز.', 'Sign in with your Google account, then complete your profile. Properties, clients and drafts are separated for each account on this device.')}</Text>
    {error ? <Text accessibilityRole="alert" style={s.red}>{error}</Text> : null}
    {stage === 'checking' ? <ActivityIndicator size="large" color="#2360D9" /> : stage === 'error' ? <>
      <Pressable accessibilityRole="button" style={s.primary} onPress={() => void bootstrap()}><Text style={s.primaryText}>{L('إعادة المحاولة', 'Retry')}</Text></Pressable>
      {device.current ? <Pressable accessibilityRole="button" style={s.quiet} disabled={busy} onPress={() => void signOut()}><Text style={s.red}>{L('تسجيل الخروج', 'Sign out')}</Text></Pressable> : null}
    </> : <Pressable accessibilityRole="button" testID="google-sign-in" style={s.primary} disabled={busy} onPress={() => void signIn()}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{L('المتابعة باستخدام Google', 'Continue with Google')}</Text>}</Pressable>}
    <Text style={s.description}>{L('نتحقق من الهوية لدى Google. لن نطلب كلمة مرور Google داخل التطبيق، ولن نرسل SMS. بيانات العقارات والميديا لا تتزامن سحابيًا بعد.', 'Identity is verified with Google. We never ask for your Google password inside the app or send SMS. Property and media cloud sync is not enabled yet.')}</Text>
  </ScrollView></SafeAreaView>;
}
