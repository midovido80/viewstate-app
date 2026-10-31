import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createGuestScope } from '@/services/accountScope';
import { createGuestRepository, guestLocalId, ENTRY_MODE_KEY, GUEST_TRANSFER_KEY, GUEST_CONTACT_KEY, type GuestIdentity } from '@/services/guestAccount';
import { GuestAccountProvider } from './GuestAccountContext';
import { GuestProfileForm } from '@/components/account/GuestProfileForm';
import { flushPropertyEditDraftWrites } from '@/services/propertyUpdateRecovery';
import { flushPropertyEnrichmentDraftWrites } from '@/services/propertyEnrichmentRecovery';
import { transferGuestDevice } from '@/services/guestTransferDevice';
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
const ACTIVATION_KEY = '@viewstate_guest_activation_v1';
const guestRepository = createGuestRepository(AsyncStorage, () => guestLocalId(Crypto.getRandomBytes(16)));
type GuestActive = { identity: GuestIdentity; resources: UserResources; data: ReturnType<typeof buildUserData>; reducedMotion: boolean; id: number };
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
  const [stage, setStage] = useState<'checking' | 'signin' | 'profile' | 'welcome' | 'ready' | 'error' | 'guest_profile' | 'guest_welcome' | 'guest_ready' | 'transfer'>('checking');
  const [guest, setGuest] = useState<GuestActive | null>(null);
  const guestRef = useRef<GuestActive | null>(null);
  const pendingTransfer = useRef<GuestIdentity | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const device = useRef<Device | null>(null);
  const current = useRef<Active | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const checking = useRef(false);
  const guestStarting = useRef(false);
  const assertCurrent = (owner: Active) => { owner.lease.scope.assertActive(); if (!mounted.current || current.current?.lease !== owner.lease) throw new Error('ACCOUNT_CHANGED'); };
  const hideData = () => {
    epoch.current++;
    current.current?.lease.close(); current.current = null;
    guestRef.current?.resources.scope.revoke(); guestRef.current = null;
    clearMatchingReturn(); stopMatchCue();
    if (mounted.current) { setActive(null); setGuest(null); setBusy(false); }
  };
  const bootstrap = async (login = false) => {
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
      if (!verified) { setStage('signin'); if (login) { const result = await device.current.account.signIn(); valid(); if (result.type === 'signed_in') { checking.current = false; await bootstrap(); } } return; }
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
      const activation = await AsyncStorage.getItem(ACTIVATION_KEY); valid();
      const localGuest = activation ? await guestRepository.read() : null; valid();
      if (activation && localGuest?.id !== activation) throw new Error('GUEST_IDENTITY_CHANGED');
      pendingTransfer.current = localGuest?.id === activation ? localGuest : null;
      const entry = accountEntryStage(profile, seen === '1');
      setStage(entry === 'ready' && pendingTransfer.current ? 'transfer' : entry);
    } catch {
      lease?.close();
      if (mounted.current && expected === epoch.current) { setStage('error'); setError(L('تعذّر التحقق من الحساب أو تحميل بياناته. بيانات الجهاز محفوظة؛ راجع الاتصال وإعدادات الخدمة ثم أعد المحاولة.', 'Could not verify your account or load its data. Device data is preserved. Check your connection and service configuration, then retry.')); }
    } finally { checking.current = false; }
  };
  const startGuest = async (identity?: GuestIdentity) => {
    if (guestStarting.current) return;
    guestStarting.current = true; checking.current = false;
    hideData();
    const previousGoogleDevice = device.current; device.current = null; previousGoogleDevice?.dispose();
    setError(''); setStage('checking');
    const expected = epoch.current;
    const valid = () => { if (!mounted.current || expected !== epoch.current) throw new Error('ACCOUNT_CHANGED'); };
    let createdScope: ReturnType<typeof createGuestScope> | undefined;
    try {
      const saved = identity ?? await guestRepository.read(); valid();
      if (!saved) { setStage('guest_profile'); return; }
      const scope = createGuestScope(saved.id); createdScope = scope; const resources = createAccountRepositoriesDevice(scope);
      const rawTransfer = await resources.storage.getItem(GUEST_TRANSFER_KEY); valid();
      if (rawTransfer && JSON.parse(rawTransfer).status === 'complete') { scope.revoke(); setStage('guest_profile'); return; }
      await resources.storage.setItem(GUEST_CONTACT_KEY, JSON.stringify(saved)); valid();
      const settings = await resources.settings.load(); valid();
      await resources.settings.update(value => ({ ...value, profile: { ...value.profile, name: saved.name } })); valid();
      const next: GuestActive = { identity: saved, resources, data: buildUserData(resources), reducedMotion: settings.reducedMotion, id: expected };
      guestRef.current = next; setGuest(next);
      const seen = await resources.storage.getItem(ONBOARDING_SEEN_KEY); valid();
      await AsyncStorage.setItem(ENTRY_MODE_KEY, 'guest'); valid();
      setStage(seen === '1' ? 'guest_ready' : 'guest_welcome');
    } catch { createdScope?.revoke(); if (expected === epoch.current && mounted.current) { setStage('error'); setError(L('تعذّر فتح مساحة الضيف. البيانات محفوظة؛ حاول مجددًا.', 'Could not open guest storage. Data is preserved; retry.')); } } finally { guestStarting.current = false; }
  };
  useEffect(() => {
    mounted.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
    const expected = epoch.current;
    void AsyncStorage.getItem(ENTRY_MODE_KEY).then(mode => {
      if (!mounted.current || epoch.current !== expected) return;
      if (Platform.OS === 'web' && window.location.pathname === '/auth/callback') void bootstrap();
      else if (mode === 'guest') void startGuest();
      else if (mode === 'google' && configured) void bootstrap();
      else setStage('signin');
    }).catch(() => { if (mounted.current) { setStage('error'); setError(L('تعذّرت قراءة وضع الدخول من الجهاز.', 'Could not read the local entry preference.')); } });
    return () => { mounted.current = false; hideData(); checking.current = false; const previous = device.current; device.current = null; previous?.dispose(); };
  }, []);
  const signOut = async () => {
    hideData(); setStage('signin'); setError(''); setBusy(true);
    try { await AsyncStorage.setItem(ENTRY_MODE_KEY, 'choice'); await device.current?.account.signOut(); }
    catch { if (mounted.current) { setStage('error'); setError(L('تعذّر إنهاء جلسة الدخول. بيانات التطبيق مخفية؛ أعد محاولة تسجيل الخروج.', 'Could not end the sign-in session. App data is hidden; retry sign out.')); } }
    finally { if (mounted.current) setBusy(false); }
  };
  const signIn = async () => {
    if (busy || checking.current) return;
    if (Platform.OS === 'web' && window.self !== window.top) { setError(L('افتح التطبيق في تبويب مستقل لإكمال دخول Google، أو استخدمه كضيف هنا.', 'Open the app in a separate tab for Google sign-in, or use guest mode here.')); return; }
    setBusy(true); setError('');
    try { await AsyncStorage.setItem(ENTRY_MODE_KEY, 'google'); await bootstrap(true); }
    catch { if (mounted.current) { setStage('error'); setError(L('لم يكتمل دخول Google. يمكنك العودة لمساحة الضيف.', 'Google sign-in did not finish. You can return to guest mode.')); } }
    finally { if (mounted.current) setBusy(false); }
  };
  const activate = async () => {
    const local = guestRef.current; if (!local) return;
    await Promise.all([local.data.draft.flushDraftWrites(), flushPropertyEditDraftWrites(), flushPropertyEnrichmentDraftWrites()]); local.resources.scope.assertActive();
    await AsyncStorage.setItem(ACTIVATION_KEY, local.identity.id);
    hideData(); setStage('signin'); setError('');
  };
  const saveGuest = async (name: string, phone: string) => {
    const local = guestRef.current;
    if (local) {
      local.resources.scope.assertActive();
      const identity = await guestRepository.save(name, phone, local.identity);
      await local.resources.storage.setItem(GUEST_CONTACT_KEY, JSON.stringify(identity));
      await local.resources.settings.load(); await local.resources.settings.update(value => ({ ...value, profile: { ...value.profile, name: identity.name } }));
      local.resources.scope.assertActive(); const next = { ...local, identity }; guestRef.current = next; setGuest(next); return;
    }
    const identity = await guestRepository.save(name, phone, null); await startGuest(identity);
  };
  const finishGuest = async () => {
    const local = guestRef.current; if (!local || busy) return;
    setBusy(true); setError('');
    try { await local.resources.storage.setItem(ONBOARDING_SEEN_KEY, '1'); if (await local.resources.storage.getItem(ONBOARDING_SEEN_KEY) !== '1') throw new Error('GUEST_WELCOME_SAVE_FAILED'); local.resources.scope.assertActive(); setStage('guest_ready'); }
    catch { setError(L('تعذّر حفظ إتمام الترحيب. حاول مجددًا.', 'Could not save welcome completion. Retry.')); } finally { if (mounted.current) setBusy(false); }
  };
  const completeActivation = async (copy: boolean) => {
    const owner = current.current, source = pendingTransfer.current; if (!owner || !source || busy) return;
    setBusy(true); setError('');
    const localScope = createGuestScope(source.id);
    try {
      assertCurrent(owner);
      if (copy) await transferGuestDevice(createAccountRepositoriesDevice(localScope), owner.resources);
      else {
        const journal = await localScope.storage(AsyncStorage).getItem(GUEST_TRANSFER_KEY);
        if (journal && JSON.parse(journal).status !== 'complete') throw new Error('GUEST_TRANSFER_PENDING');
      }
      assertCurrent(owner); await AsyncStorage.removeItem(ACTIVATION_KEY); pendingTransfer.current = null;
      await AsyncStorage.setItem(ENTRY_MODE_KEY, 'google'); assertCurrent(owner); setStage(pendingTransfer.current ? 'transfer' : 'ready');
    } catch (cause) {
      if (current.current?.lease === owner.lease) {
        const code = cause instanceof Error ? cause.message : '';
        setError(code === 'GUEST_TRANSFER_CONTACT_CONFLICT'
          ? L('يوجد شخص بنفس الرقم داخل الحساب. لم نستبدل بياناته؛ راجع السجلين قبل النقل. يمكنك العودة للضيف.', 'This account already has a contact with that phone. Nothing was overwritten; review both contacts before importing. You can return to guest mode.')
          : code === 'GUEST_TRANSFER_BOUND_TO_OTHER_ACCOUNT'
            ? L('بدأ نقل هذه المساحة إلى حساب آخر. سجّل الدخول بالحساب الذي اخترته أول مرة لاستكماله؛ الأصل محفوظ.', 'This workspace transfer was started for another account. Sign in to the originally selected account to resume; originals are preserved.')
            : code.includes('CONFLICT') || code.includes('CHANGED') || code === 'GUEST_TRANSFER_PENDING'
              ? L('توجد بيانات أو مسودة متعارضة، أو نقل لم يكتمل. لم نستبدل الموجود؛ يلزم مراجعتها قبل استكمال النقل بالحساب نفسه. يمكنك تسجيل الخروج والعودة للضيف.', 'Data or a draft conflicts, or a transfer is incomplete. Existing data was not overwritten; review it before resuming with the same account. You can sign out and return to guest mode.')
              : L('لم يكتمل النقل. الأصل محفوظ. تأكد من توفر الملفات والمساحة على الجهاز ثم أعد المحاولة بالحساب نفسه، أو سجّل الخروج وارجع للضيف.', 'Transfer did not finish. Originals are preserved. Check file availability and free device storage, then retry with the same account, or sign out and return to guest mode.'));
      }
    } finally { localScope.revoke(); if (mounted.current) setBusy(false); }
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
      assertCurrent(owner); setStage(pendingTransfer.current ? 'transfer' : 'ready');
    } catch { if (current.current === owner) setError(L('تعذّر حفظ إتمام الترحيب. حاول مجددًا.', 'Could not save welcome completion. Try again.')); }
    finally { if (mounted.current) setBusy(false); }
  };
  if (stage === 'guest_profile') return <GuestProfileForm onSave={saveGuest} onCancel={() => setStage('signin')} />;
  if (guest && stage === 'guest_welcome') return <View style={{ flex: 1 }}><Welcome reducedMotion={guest.reducedMotion} busy={busy} onDone={() => void finishGuest()} />{error ? <Text accessibilityRole="alert" style={[s.red, { padding: 16 }]}>{error}</Text> : null}</View>;
  if (guest && stage === 'guest_ready') return <GuestAccountProvider value={{ identity: guest.identity, activate, saveContact: saveGuest }}><UserDataProvider value={guest.data}><React.Fragment key={'guest-' + guest.id}>{children}</React.Fragment></UserDataProvider></GuestAccountProvider>;
  if (active && stage === 'transfer') return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={[s.content, { justifyContent: 'center', direction: isRTL ? 'rtl' : 'ltr' }]}>
    <Text style={s.brand}>ViewState</Text><Text style={s.title}>{L('نقل بيانات الضيف إلى حسابك؟', 'Bring guest data into your account?')}</Text><Text style={s.email}>{active.lease.account.email}</Text>
    <Text style={s.description}>{L('بموافقتك ننسخ عقاراتك وعملاءك وطلباتك والميديا والمسودات والمتابعات إلى مساحة هذا الحساب على الجهاز. نحتفظ بالأصل للاستعادة، ولا نرفع العقارات والميديا للسحابة. النسخة المنقولة ترتبط بهذا الحساب فقط.', 'With your consent, copy guest properties, clients, requirements, media, drafts and follow-ups into this account’s storage on this device. Originals are kept for recovery. Properties/media are not uploaded to the cloud. The transferred workspace is bound to this account only.')}</Text>
    {error ? <Text accessibilityRole="alert" style={s.red}>{error}</Text> : null}
    <Pressable accessibilityRole="button" testID="guest-transfer-confirm" disabled={busy} style={s.primary} onPress={() => void completeActivation(true)}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{L('نعم، نقل بياناتي', 'Yes, bring my data')}</Text>}</Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={s.quiet} onPress={() => void completeActivation(false)}><Text style={s.link}>{L('لا، ابدأ بالحساب دون نقل', 'No, continue without importing')}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={s.quiet} onPress={() => void signOut()}><Text style={s.red}>{L('تسجيل الخروج', 'Sign out')}</Text></Pressable>
  </ScrollView></SafeAreaView>;
  if (active && stage === 'profile') return <AccountProfileForm userId={active.lease.account.userId} email={active.lease.account.email} initial={active.profile ?? (pendingTransfer.current ? { user_id: active.lease.account.userId, display_name: pendingTransfer.current.name, phone: pendingTransfer.current.phone, company: '', classification: '' as UserContactProfile['classification'], other_classification: '' } : null)} photo={active.photo} onSave={saveContact} onCancel={() => void signOut()} />;
  if (active && stage === 'welcome') return <View style={{ flex: 1 }}><Welcome reducedMotion={active.reducedMotion} busy={busy} onDone={() => void finishWelcome()} />{error ? <Text accessibilityRole="alert" style={[s.red, { padding: 16 }]}>{error}</Text> : null}</View>;
  if (active?.profile && stage === 'ready') return <Context.Provider value={{ email: active.lease.account.email, profile: active.profile, photo: active.photo, assertActive: () => assertCurrent(active), saveContact, signOut }}><UserDataProvider value={active.data}><React.Fragment key={active.id}>{children}</React.Fragment></UserDataProvider></Context.Provider>;
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={[s.content, { justifyContent: 'center', direction: isRTL ? 'rtl' : 'ltr' }]}>
    <Text style={s.brand}>ViewState</Text>
    <Pressable accessibilityRole="button" style={[s.quiet, { alignSelf: 'flex-end' }]} onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')}><Text style={s.link}>{language === 'ar' ? 'English' : 'العربية'}</Text></Pressable>
    <Text style={s.title}>{L('مساعدك العقاري الشخصي', 'Your personal property assistant')}</Text>
    <Text style={s.description}>{L('استخدم ViewState محليًا دون حساب، أو فعّل حساب Google. لكل مساحة بيانات منفصلة.', 'Use ViewState locally without an account, or activate a Google account. Each workspace keeps separate data.')}</Text>
    {error ? <Text accessibilityRole="alert" style={s.red}>{error}</Text> : null}
    {stage === 'checking' ? <ActivityIndicator size="large" color="#2360D9" /> : stage === 'error' ? <>
      <Pressable accessibilityRole="button" style={s.primary} onPress={() => void bootstrap(true)}><Text style={s.primaryText}>{L('إعادة المحاولة', 'Retry')}</Text></Pressable>
      {device.current ? <Pressable accessibilityRole="button" style={s.quiet} disabled={busy} onPress={() => void signOut()}><Text style={s.red}>{L('تسجيل الخروج', 'Sign out')}</Text></Pressable> : null}
    </> : <Pressable accessibilityRole="button" testID="google-sign-in" style={s.primary} disabled={busy} onPress={() => void signIn()}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{L('المتابعة باستخدام Google', 'Continue with Google')}</Text>}</Pressable>}
    <Pressable accessibilityRole="button" testID="use-as-guest" style={[s.input, { alignItems: 'center', justifyContent: 'center' }]} disabled={busy} onPress={() => void startGuest()}><Text style={s.link}>{L('استخدام بدون حساب', 'Use as guest')}</Text></Pressable>
    {Platform.OS === 'web' && window.self !== window.top ? <Pressable accessibilityRole="button" style={s.quiet} onPress={() => window.open(window.location.origin, '_blank', 'noopener,noreferrer')}><Text style={s.link}>{L('فتح التطبيق في تبويب مستقل', 'Open app in a separate tab')}</Text></Pressable> : null}
    <Text style={s.description}>{L('نتحقق من الهوية لدى Google. لن نطلب كلمة مرور Google داخل التطبيق، ولن نرسل SMS. بيانات العقارات والميديا لا تتزامن سحابيًا بعد.', 'Identity is verified with Google. We never ask for your Google password inside the app or send SMS. Property and media cloud sync is not enabled yet.')}</Text>
  </ScrollView></SafeAreaView>;
}
