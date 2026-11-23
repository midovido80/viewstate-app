import { useCallback, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Action, AssistantText as Txt } from '@/components/assistant/ui';
import { useI18n } from '@/contexts/I18nContext';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { useCircleNotifications } from '@/contexts/CircleNotificationsContext';
import { getCirclePushStatus, setCirclePush, testCirclePush, testCircleSound } from '@/services/circlePush';

export function CircleNotificationSettings() {
  const account = useRealAccount();
  const { language } = useI18n();
  const { refresh } = useCircleNotifications();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getCirclePushStatus>>>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const ar = language === 'ar';
  const L = (a: string, e: string) => ar ? a : e;
  const owner = account?.profile.user_id;
  const request = account?.request;
  useFocusEffect(useCallback(() => {
    if (!owner || !request || Platform.OS !== 'android') return;
    let active = true;
    const check = () => {
      void getCirclePushStatus(request, owner).then(value => { if (active) setStatus(value); })
        .catch(() => { if (active) setStatus(undefined); });
    };
    check();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') check(); });
    return () => { active = false; subscription.remove(); };
  }, [owner, request]));

  if (!owner || !request || Platform.OS !== 'android') return null;
  const run = async (test: boolean, enabled = true) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (test) {
        await testCirclePush(request, owner);
        setMessage(L('أُضيف الإشعار التجريبي إلى قائمة الإرسال.', 'Test notification queued.'));
        await refresh();
      } else {
        await setCirclePush(request, owner, enabled);
        setStatus(await getCirclePushStatus(request, owner));
      }
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes('CIRCLE_PUSH_PERMISSION_REQUIRED')
        ? L('اسمح بالإشعارات من إعدادات Android، ثم أعد تفعيلها هنا.', 'Allow notifications in Android settings, then enable them here.')
        : test ? L('تعذّر إرسال الاختبار. حاول بعد دقيقة.', 'Could not queue the test. Try again in a minute.')
          : L('تعذّر تحديث تسجيل الهاتف. تحقق من الاتصال والإذن وحاول مرة أخرى.', 'Could not update this device. Check connectivity and permissions, then retry.'));
    } finally {
      setBusy(false);
    }
  };
  return <View style={{ gap: 8 }}>
    <Txt bold>{L('إشعارات دائرة الثقة على هذا الهاتف', 'Trust Circle alerts on this device')}</Txt>
    {status && <Txt muted>{[
      status.permission ? L('الإذن مفعّل', 'Permission granted') : L('الإذن غير مفعّل', 'Permission off'),
      status.channelAudible ? L('القناة لها صوت', 'Channel has sound') : L('القناة صامتة أو غير مهيأة', 'Channel silent or unavailable'),
      status.registered ? L('الهاتف مسجّل', 'Device registered') : L('الهاتف غير مسجّل', 'Device unregistered'),
    ].join(' · ')}</Txt>}
    <Action label={L('تفعيل أو إعادة تسجيل الهاتف', 'Enable or re-register this device')} disabled={busy} onPress={() => void run(false)} />
    <Action label={L('إرسال إشعار تجريبي', 'Send test notification')} disabled={busy || !status?.registered || !status.permission} onPress={() => void run(true)} />
    <Action label={L('اختبار الصوت على الهاتف', 'Test sound on this device')} disabled={busy || !status?.registered || !status.permission}
      onPress={() => {
        setMessage('');
        void testCircleSound(owner).catch(() => setMessage(L(
          'تعذّر اختبار الصوت. راجع إعدادات قناة دائرة الثقة في Android.',
          'Could not test sound. Check the Trust Circle channel in Android settings.',
        )));
      }} />
    {status?.registered && <Action label={L('إيقاف إشعارات هذا الهاتف', 'Disable alerts on this device')} disabled={busy} onPress={() => void run(false, false)} />}
    <Action label={L('إعدادات Android', 'Android settings')} disabled={busy} onPress={() => void Linking.openSettings().catch(() => undefined)} />
    {message && <Txt>{message}</Txt>}
  </View>;
}
