import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { Stack, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { chooseLocalProfilePhoto } from '@/services/accountDevice';
import { AccountScreen, Avatar, Btn, Confirm, ErrorText, Field, Note, useCanWrite, useL } from './ui';

/** Local profile editor. Persists only on Save; Back with unsaved edits asks to keep editing or discard. */
export function ProfileSection({ setup }: { setup?: boolean }) {
  const { state, saveProfile } = useAccountFoundation();
  const { canWrite, busy } = useCanWrite();
  const { L } = useL();
  const router = useRouter();
  const navigation = useNavigation();
  const [name, setName] = useState(state.profile.name);
  const [company, setCompany] = useState(state.profile.company);
  const [photo, setPhoto] = useState(state.profile.photo);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<null | (() => void)>(null);
  const allowLeave = useRef(false);
  const dirty = name !== state.profile.name || company !== state.profile.company || photo !== state.profile.photo;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/more' as never);
  }, [router]);
  const back = useCallback(() => {
    if (dirtyRef.current) setPendingLeave(() => leave);
    else leave();
  }, [leave]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!dirtyRef.current) return false;
      back();
      return true;
    });
    return () => listener.remove();
  }, [back]));

  useEffect(() => navigation.addListener('beforeRemove', e => {
    if (allowLeave.current || !dirtyRef.current) return;
    e.preventDefault();
    setPendingLeave(() => () => navigation.dispatch(e.data.action));
  }), [navigation]);

  const pick = async () => {
    setError(null); setPicking(true);
    try { const value = await chooseLocalProfilePhoto(); if (value) setPhoto(value); }
    catch (cause) { setError(L('تعذّر استخدام الصورة. اختر JPG أو PNG أو WebP أصغر من 700KB.', cause instanceof Error ? cause.message : 'Could not use that photo.')); }
    finally { setPicking(false); }
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) { setNameError(L('الاسم مطلوب.', 'Name is required.')); return; }
    try {
      await saveProfile({ name, company, photo });
      allowLeave.current = true;
      if (setup) router.replace('/(tabs)/more' as never); else leave();
    } catch { setError(L('لم يُحفظ الملف الشخصي على هذا الجهاز. تعديلاتك ما زالت هنا؛ حاول مرة أخرى.', 'Profile was not saved on this device. Your edits are still here; try again.')); }
  };

  return (
    <AccountScreen
      onBack={back}
      title={setup ? L('خلّينا نتعرف عليك', 'A little about you') : L('الملف الشخصي', 'Personal profile')}
      subtitle={setup ? L('ملف محلي على هذا الجهاز فقط، بدون تسجيل دخول. الاسم فقط مطلوب.', 'A local profile on this device only, without sign-in. Only your name is required.') : L('يظهر في شاشة المزيد على هذا الجهاز فقط.', 'Shown on the More screen on this device only.')}
      footer={<Btn testID="profile-save" label={setup ? L('ابدأ استخدام ViewState', 'Start using ViewState') : L('حفظ التعديلات', 'Save changes')} onPress={() => void save()} busy={busy} disabled={!canWrite} />}>
      <Stack.Screen options={{ gestureEnabled: !dirty }} />
      <View style={{ alignItems: 'center', marginTop: 6 }}>
        <Avatar name={name} photo={photo} size={84} />
        <Btn kind="quiet" icon="image" label={photo ? L('تغيير الصورة', 'Change photo') : L('اختيار صورة من الجهاز', 'Choose photo from device')} onPress={() => void pick()} busy={picking} disabled={!canWrite} />
        {photo ? <Btn kind="quiet" icon="trash-2" label={L('إزالة الصورة', 'Remove photo')} onPress={() => setPhoto('')} disabled={!canWrite} /> : null}
      </View>
      <Field label={L('الاسم *', 'Name *')} value={name} maxLength={100} error={!!nameError} editable={canWrite}
        onChangeText={v => { setName(v); if (v.trim()) setNameError(null); }} autoComplete="name" testID="profile-name" />
      <ErrorText>{nameError}</ErrorText>
      <Field label={L('المكتب أو الشركة — اختياري', 'Office / company — optional')} value={company} maxLength={150} editable={canWrite} onChangeText={setCompany} testID="profile-company" />
      <ErrorText>{error}</ErrorText>
      <Note>{L('الصورة والاسم محفوظان محليًا فقط ولا يُرفعان لأي خادم. هذا ليس حسابًا موثّقًا.', 'Photo and name are stored locally only and never uploaded. This is not a verified account.')}</Note>
      <Confirm visible={!!pendingLeave} title={L('تعديلات غير محفوظة', 'Unsaved changes')}
        body={L('لم تُحفظ تعديلات الملف الشخصي. هل تريد تجاهلها؟', 'Your profile edits are not saved. Discard them?')}
        confirmLabel={L('تجاهل التعديلات', 'Discard changes')} destructive cancelLabel={L('متابعة التعديل', 'Keep editing')}
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => { const go = pendingLeave; allowLeave.current = true; setPendingLeave(null); go?.(); }} />
    </AccountScreen>
  );
}
