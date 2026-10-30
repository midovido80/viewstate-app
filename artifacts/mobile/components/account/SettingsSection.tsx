import { Platform, TextInput } from 'react-native';
import { useMatchNotifications } from '@/contexts/MatchNotificationsContext';
import { enableMatchSound, playMatchCue } from '@/services/matchNoticeDevice';
import React, { useEffect, useState } from 'react';
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
        <Row icon="bell" title={L('الإشعارات', 'Notifications')} sub={L('تنبيهات المطابقة أثناء فتح التطبيق', 'Matching alerts while the app is open')} onPress={() => router.push('/account/notifications' as never)} />
        <ToggleRow title={L('تقليل الحركة', 'Reduce motion')} sub={L('يقلل حركة التنبيه وقائمة الإضافة وشاشات الحساب', 'Reduces alert, quick-add and account motion')} value={state.reducedMotion} disabled={!canWrite || busy} onChange={v => void run(() => setReducedMotion(v))} />
      </Card>
      <ErrorText>{error}</ErrorText>
      <Note>{L('لا نضيف مفاتيح لا تعمل، مثل مزامنة سحابية غير موجودة.', 'No nonfunctional switches such as nonexistent cloud sync are included.')}</Note>
    </AccountScreen>
  );
}

export function NotificationsSection() {
  const { state, setNotification } = useAccountFoundation(); const { canWrite, busy } = useCanWrite(); const { L } = useL();
  const notices = useMatchNotifications(), [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(notices.state.settings.quietStart), [end, setEnd] = useState(notices.state.settings.quietEnd);
  useEffect(() => { setStart(notices.state.settings.quietStart); setEnd(notices.state.settings.quietEnd); }, [notices.state.settings.quietStart, notices.state.settings.quietEnd]);
  const change = async (k: keyof NotificationChoices, v: boolean) => { setError(null); try { if (v) await enableMatchSound(); await setNotification(k, v); } catch { setError(L('لم يُحفظ التغيير.', 'Change was not saved.')); } };
  const options = async (values: Parameters<typeof notices.settings>[0]) => { setError(null); try { await notices.settings(values); } catch { setError(L('لم تُحفظ إعدادات التنبيه.', 'Alert settings were not saved.')); } };
  const time = (key: 'quietStart' | 'quietEnd', value: string) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) { setError(L('أدخل الوقت بصيغة 22:00 أو 08:00.', 'Enter a time such as 22:00 or 08:00.')); return; }
    void options({ [key]: value });
  };
  const off = !canWrite || busy, n = state.notifications, ready = notices.historyReady;
  return <AccountScreen title={L('الإشعارات', 'Notifications')} subtitle={L('تنبيهات محلية أثناء فتح التطبيق؛ لا إشعارات في الخلفية أو عند إغلاقه حاليًا.', 'Local alerts while the app is open; no background or closed-app delivery yet.')}>
    <Card>
      <ToggleRow first title={L('السماح بالتنبيهات داخل التطبيق', 'Allow in-app alerts')} value={n.enabled} disabled={off} onChange={v => void change('enabled', v)} />
      <ToggleRow title={L('تنبيه بنتائج المطابقة الجديدة', 'New matching opportunities')} value={n.matches} disabled={off || !n.enabled} onChange={v => void change('matches', v)} />
      <ToggleRow title={Platform.OS === 'web' ? L('صوت المطابقة', 'Matching sound') : L('اهتزاز المطابقة', 'Matching vibration')} value={notices.state.settings.sound} disabled={off || !ready} onChange={v => { if (v) void enableMatchSound(); void options({ sound: v }); }} />
      <ToggleRow title={L('ساعات الهدوء للصوت والاهتزاز', 'Quiet hours for sound and vibration')} value={notices.state.settings.quiet} disabled={off || !ready} onChange={v => void options({ quiet: v })} />
    </Card>
    {notices.state.settings.quiet && <Card padded>
      <Note>{L('من — إلى، بتوقيت الكويت، نظام 24 ساعة. نفس التوقيت يعني صمتًا طوال اليوم.', 'From — to, Kuwait time, 24-hour format. Equal times mean silence all day.')}</Note>
      <TextInput accessibilityLabel={L('بداية الهدوء', 'Quiet hours start')} value={start} editable={ready} onChangeText={setStart} onBlur={() => time('quietStart', start)} placeholder="22:00" style={{ minHeight: 48, borderWidth: 1, borderColor: '#C8D9EF', borderRadius: 10, padding: 12, writingDirection: 'ltr' }} />
      <TextInput accessibilityLabel={L('نهاية الهدوء', 'Quiet hours end')} value={end} editable={ready} onChangeText={setEnd} onBlur={() => time('quietEnd', end)} placeholder="08:00" style={{ minHeight: 48, borderWidth: 1, borderColor: '#C8D9EF', borderRadius: 10, padding: 12, writingDirection: 'ltr' }} />
    </Card>}
    <Card><Row first icon="volume-2" title={Platform.OS === 'web' ? L('تجربة صوت التنبيه', 'Test alert sound') : L('تجربة الاهتزاز', 'Test vibration')} onPress={() => { void (async () => { const enabled = await enableMatchSound(); if (Platform.OS === 'web' && !enabled) { setError(L('المتصفح لم يسمح بالصوت. راجع صلاحيات الموقع.', 'The browser did not enable audio. Check site permissions.')); return; } await playMatchCue(true); })().catch(() => setError(L('تعذر تشغيل التنبيه.', 'Could not play alert cue.'))); }} /></Card>
    <ErrorText>{error}</ErrorText>
    {notices.error && <Note>{L('تعذر تحميل سجل التنبيهات؛ راجع الاتصال بالمعاينة الآمنة وأعد المحاولة.', 'Alert history could not be loaded. Retry in the secure Preview.')}</Note>}
    <Note>{Platform.OS === 'web' ? L('قد تحتاج تفعيل الصوت مجددًا بعد إعادة فتح المتصفح. لا نصدر أصواتًا عن المطابقات القديمة عند أول تشغيل.', 'You may need to enable audio again after reopening the browser. Existing matches are silent on first setup.') : L('الاهتزاز متاح الآن. صوت الهاتف يحتاج تجهيز الصوت في حزمة مستقلة.', 'Vibration is available now. Phone audio needs the separate audio setup.')}</Note>
  </AccountScreen>;
}
