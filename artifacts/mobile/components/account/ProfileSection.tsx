import { useLocalFormDraft, useDraftBack } from '@/hooks/useDraftBack';
import { useGuestAccount } from '@/contexts/GuestAccountContext';
import { GuestProfileForm } from './GuestProfileForm';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { AccountProfileForm } from './AccountProfileForm';
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { chooseLocalProfilePhoto } from '@/services/accountDevice';
import { AccountScreen, Avatar, Btn, ErrorText, Field, Note, useCanWrite, useL } from './ui';

/** Back keeps a local draft; only Save updates the visible profile. */
function LegacyProfileSection({ setup }: { setup?: boolean }) {
  const { state, saveProfile } = useAccountFoundation();
  const { canWrite, busy } = useCanWrite();
  const { L } = useL();
  const router = useRouter();
  const [name, setName] = useState(state.profile.name);
  const [company, setCompany] = useState(state.profile.company);
  const [photo, setPhoto] = useState(state.profile.photo);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const committed = useRef(false);
  const persist = useLocalFormDraft({ identity: 'profile:legacy', value: {name, company, photo}, completed: () => committed.current,
    restore: saved => { setName(saved.name); setCompany(saved.company); setPhoto(saved.photo); } });
  const { back, exit } = useDraftBack({ persist, fallback: '/(tabs)/more', completed: () => committed.current });
  const leave = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/more' as never);

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
      committed.current = true; await persist();
      if (setup) router.replace('/(tabs)/more' as never); else leave();
    } catch { setError(L('لم يُحفظ الملف الشخصي على هذا الجهاز. تعديلاتك ما زالت هنا؛ حاول مرة أخرى.', 'Profile was not saved on this device. Your edits are still here; try again.')); }
  };

  return (
    <AccountScreen
      onBack={back}
      title={setup ? L('خلّينا نتعرف عليك', 'A little about you') : L('الملف الشخصي', 'Personal profile')}
      subtitle={setup ? L('ملف محلي على هذا الجهاز فقط، بدون تسجيل دخول. الاسم فقط مطلوب.', 'A local profile on this device only, without sign-in. Only your name is required.') : L('يظهر في شاشة المزيد على هذا الجهاز فقط.', 'Shown on the More screen on this device only.')}
      footer={<Btn testID="profile-save" label={setup ? L('ابدأ استخدام ViewState', 'Start using ViewState') : L('حفظ التعديلات', 'Save changes')} onPress={() => void save()} busy={busy} disabled={!canWrite} />}>
<Btn kind="quiet" label={L('إلغاء المسودة', 'Discard draft')} onPress={() => persist.confirmDiscard(() => exit(leave))} />
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

    </AccountScreen>
  );
}

function RealProfileSection() {
  const account = useRealAccount()!;
  const { saveProfile } = useAccountFoundation();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState({ value: account.profile, photo: account.photo });
  const [restored, setRestored] = useState(0); const committed = useRef(false);
  const persist = useLocalFormDraft({ identity: `profile:${account.profile.user_id}`, value: snapshot, completed: () => committed.current,
    restore: saved => { setSnapshot(saved); setRestored(n => n+1); } });
  const leave = () => router.canGoBack() ? router.back() : router.replace('/account' as never);
  const { back, exit } = useDraftBack({ persist, fallback: '/account', completed: () => committed.current });
  return <AccountProfileForm key={restored} userId={account.profile.user_id} initial={snapshot.value} photo={snapshot.photo} email={account.email} onCancel={back} onDiscard={() => persist.confirmDiscard(() => exit(leave))}
    onDraftChange={(value, photo) => setSnapshot({ value: { ...value, user_id: account.profile.user_id }, photo })}
    onSave={async (value, photo) => { await account.saveContact(value, photo); await saveProfile({ name: value.display_name.trim(), company: value.company.trim(), photo }); committed.current=true; await persist(); back(); }} />;
}
function GuestProfileSection() {
  const guest = useGuestAccount()!; const { state, saveProfile } = useAccountFoundation(); const router = useRouter();
  const [snapshot,setSnapshot] = useState({ name: guest.identity.name, phone: guest.identity.phone });
  const [restored,setRestored] = useState(0); const committed=useRef(false);
  const persist=useLocalFormDraft({ identity: 'profile:guest', value: snapshot, completed: () => committed.current, restore: saved => { setSnapshot(saved); setRestored(n=>n+1); } });
  const leave = () => router.canGoBack() ? router.back() : router.replace('/account' as never);
  const { back, exit }=useDraftBack({ persist, fallback: '/account', completed: () => committed.current });
  return <GuestProfileForm key={restored} name={snapshot.name} phone={snapshot.phone} onDraftChange={(name,phone)=>setSnapshot({name,phone})} onCancel={back} onDiscard={() => persist.confirmDiscard(() => exit(leave))} onSave={async (name, phone) => { await guest.saveContact(name, phone); await saveProfile({ ...state.profile, name: name.trim() }); committed.current=true; await persist(); back(); }} />;
}
export function ProfileSection(props: { setup?: boolean }) {
  const account = useRealAccount(), guest = useGuestAccount();
  return account ? <RealProfileSection /> : guest ? <GuestProfileSection /> : <LegacyProfileSection {...props} />;
}
