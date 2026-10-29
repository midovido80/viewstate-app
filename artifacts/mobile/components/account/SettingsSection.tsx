import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import type { NotificationChoices } from '@/services/accountFoundation';
import { AccountScreen, Badge, Card, ErrorText, Note, Row, ToggleRow, useCanWrite, useL } from './ui';

export function SettingsSection() {
  const { state, setAppLanguage, setReducedMotion } = useAccountFoundation(); const { canWrite, busy } = useCanWrite();
  const { L, language } = useL(); const router = useRouter(); const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => { setError(null); try { await fn(); } catch { setError(L('لم يُحفظ التغيير.', 'Change was not saved.')); } };
  return (
    <AccountScreen title={L('إعدادات التطبيق', 'App settings')}>
      <Card>
        <Row first icon="globe" title={L('اللغة', 'Language')} sub={language === 'ar' ? 'العربية — اضغط للتبديل إلى English' : 'English — tap to switch to العربية'} disabled={!canWrite || busy}
          onPress={() => void run(() => setAppLanguage(language === 'ar' ? 'en' : 'ar'))} testID="settings-language" />
        <Row icon="bell" title={L('الإشعارات', 'Notifications')} sub={L('تفضيلات محفوظة • التسليم غير متاح', 'Saved preferences • Delivery unavailable')} onPress={() => router.push('/account/notifications' as never)} />
        <ToggleRow title={L('تقليل الحركة', 'Reduce motion')} sub={L('يوقف حركات الانتقال في شاشات الحساب', 'Turns off transitions in account screens')} value={state.reducedMotion} disabled={!canWrite || busy} onChange={v => void run(() => setReducedMotion(v))} />
      </Card>
      <ErrorText>{error}</ErrorText>
      <Note>{L('لا نضيف مفاتيح لا تعمل، مثل مزامنة سحابية غير موجودة.', 'No nonfunctional switches such as nonexistent cloud sync are included.')}</Note>
    </AccountScreen>
  );
}

export function NotificationsSection() {
  const { state, setNotification } = useAccountFoundation(); const { canWrite, busy } = useCanWrite(); const { L } = useL();
  const [error, setError] = useState<string | null>(null);
  const change = async (k: keyof NotificationChoices, v: boolean) => { setError(null); try { await setNotification(k, v); } catch { setError(L('لم يُحفظ التغيير.', 'Change was not saved.')); } };
  const off = !canWrite || busy; const n = state.notifications;
  return (
    <AccountScreen title={L('الإشعارات', 'Notifications')} subtitle={L('تُحفظ اختياراتك الآن لتُستخدم عند توفر الإشعارات.', 'Your choices are saved now for when notifications become available.')}>
      <Badge kind="warn" text={L('التسليم غير متاح — لا توجد إشعارات Push أو تذكيرات مجدولة', 'Delivery unavailable — no push or scheduled reminders')} />
      <Card>
        <ToggleRow first title={L('السماح بالإشعارات', 'Allow notifications')} value={n.enabled} disabled={off} onChange={v => void change('enabled', v)} />
        <ToggleRow title={L('تذكيرات المتابعة', 'Follow-up reminders')} value={n.followups} disabled={off || !n.enabled} onChange={v => void change('followups', v)} />
        <ToggleRow title={L('تنبيه بنتائج المطابقة', 'Matching result alerts')} value={n.matches} disabled={off || !n.enabled} onChange={v => void change('matches', v)} />
        <ToggleRow title={L('أخبار وعروض اختيارية', 'Optional news & offers')} value={n.marketing} disabled={off || !n.enabled} onChange={v => void change('marketing', v)} />
      </Card>
      <ErrorText>{error}</ErrorText>
      <Note>{L('لن يطلب التطبيق إذن الإشعارات من هذه الشاشة.', 'The app will not request notification permission from this screen.')}</Note>
    </AccountScreen>
  );
}
