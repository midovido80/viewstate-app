import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { accountProvider } from '@/services/accountProvider';
import { AccountScreen, Badge, Body, Btn, Card, Confirm, Note, Row, SectionLabel, Sheet, useCanWrite, useL } from './ui';

export function AccountSection() {
  const { state, clearLocalSettings } = useAccountFoundation();
  const { canWrite, busy } = useCanWrite();
  const { L } = useL();
  const router = useRouter();
  const [session, setSession] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const status = accountProvider.configured ? L('غير مرتبط', 'Not connected') : L('غير متاح بعد', 'Unavailable');
  const methods = [
    { key: 'phone', icon: 'smartphone' as const, title: L('رقم الهاتف', 'Phone number') },
    { key: 'google', icon: 'mail' as const, title: 'Google' },
    { key: 'apple', icon: 'mail' as const, title: 'Apple' },
  ];
  const clear = async () => {
    setClearError(null);
    try { await clearLocalSettings(); setClearing(false); }
    catch { setClearError(L('لم يتم المسح؛ بقيت الإعدادات كما هي.', 'Nothing was cleared; settings are unchanged.')); }
  };
  return (
    <AccountScreen title={L('حسابي', 'My account')} subtitle={L('ملف محلي على هذا الجهاز. تسجيل الدخول الحقيقي غير مفعّل بعد.', 'A local profile on this device. Real sign-in is not active yet.')}>
      <Card><Row first icon="user" title={L('الملف الشخصي', 'Personal profile')} sub={state.profile.name || L('لم يُضبط بعد', 'Not set up yet')} onPress={() => router.push('/account/profile' as never)} /></Card>

      <SectionLabel>{L('وسائل الدخول', 'SIGN-IN METHODS')}</SectionLabel>
      <Card>
        {methods.map((m, i) => <Row key={m.key} first={i === 0} icon={m.icon} title={m.title} sub={L('لا توجد خدمة دخول معتمدة مرتبطة بالتطبيق', 'No approved sign-in service is configured')}
          right={<Badge kind="off" text={status} />} onPress={() => router.push(`/account/${m.key === 'phone' ? 'phone' : 'provider'}${m.key === 'phone' ? '' : `?method=${m.key}`}` as never)} />)}
      </Card>
      <Note>{L('لا يتم الربط ولا التحقق ولا إرسال رسائل SMS. لن نعرض أي وسيلة على أنها موثّقة قبل تفعيل خدمة حقيقية.', 'No linking, verification or SMS takes place. No method will be shown as verified until a real service is enabled.')}</Note>

      <SectionLabel>{L('هذا الجهاز', 'THIS DEVICE')}</SectionLabel>
      <Card>
        <Row first icon="hard-drive" title={L('التخزين المحلي الحالي', 'Current local storage')} sub={L('ليست جلسة دخول • ليست قائمة أجهزة', 'Not a sign-in session • Not a device list')} onPress={() => setSession(true)} />
        <Row icon="log-out" title={L('تسجيل الخروج وتبديل الحساب', 'Sign out & switch account')} sub={L('غير متاح', 'Unavailable')} onPress={() => setUnavailable(true)} />
        <Row icon="user-x" title={L('حذف الحساب', 'Delete account')} sub={L('غير متاح', 'Unavailable')} onPress={() => setUnavailable(true)} />
      </Card>

      <SectionLabel>{L('إعادة الضبط', 'RESET')}</SectionLabel>
      <Btn kind="danger" icon="rotate-ccw" label={L('مسح الملف الشخصي والإعدادات المحلية', 'Clear local profile & settings')} onPress={() => { setClearError(null); setClearing(true); }} disabled={!canWrite} />

      <Sheet visible={session} title={L('التخزين المحلي الحالي', 'Current local storage')} onClose={() => setSession(false)}>
        <Body>{L('الملف الشخصي والإعدادات محفوظة في تخزين هذا التطبيق على هذا الجهاز فقط.', 'Your profile and settings are kept in this app’s storage on this device only.')}</Body>
        <Body muted>{L('لا توجد جلسة دخول، ولا مزامنة سحابية، ولا حماية حساب. أي شخص يستخدم هذا الجهاز يرى نفس البيانات.', 'There is no sign-in session, no cloud sync and no account protection. Anyone using this device sees the same data.')}</Body>
        <Btn label={L('فهمت', 'Got it')} onPress={() => setSession(false)} />
      </Sheet>
      <Sheet visible={unavailable} title={L('غير متاح حاليًا', 'Not available yet')} onClose={() => setUnavailable(false)}>
        <Body>{L('العقارات والأشخاص والطلبات والوسائط محفوظة على مستوى الجهاز، وليست مرتبطة بحساب.', 'Properties, people, requests and media are stored per device, not per account.')}</Body>
        <Body muted>{L('لذلك لا يمكن تسجيل الخروج أو تبديل الحساب أو حذف حساب بأمان. ستتوفر هذه الخيارات بعد تفعيل حسابات حقيقية منفصلة.', 'So sign out, account switching and account deletion cannot be offered safely. They will come with real, separated accounts.')}</Body>
        <Btn label={L('فهمت', 'Got it')} onPress={() => setUnavailable(false)} />
      </Sheet>
      <Confirm visible={clearing} destructive busy={busy} error={clearError}
        title={L('مسح الإعدادات المحلية؟', 'Clear local settings?')}
        body={L('سيُمسح الاسم والصورة واختيارات المشاركة والإشعارات وتقليل الحركة ومسودات الملاحظات فقط. اللغة تبقى. لا يُحذف أي حساب أو عقار أو شخص أو طلب أو ملف وسائط.', 'Clears only name, photo, sharing, notification and motion choices, and feedback drafts. Language stays. No account, property, person, request or media is deleted.')}
        confirmLabel={L('مسح الإعدادات المحلية', 'Clear local settings')}
        onCancel={() => setClearing(false)} onConfirm={() => void clear()} />
    </AccountScreen>
  );
}
