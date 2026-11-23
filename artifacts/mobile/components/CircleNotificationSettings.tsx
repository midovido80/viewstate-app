import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Badge, Card, Row, useL } from '@/components/account/ui';
import { Action } from '@/components/assistant/ui';
import { nextDesign as colors } from '@/constants/nextDesign';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { getCirclePushStatus, setCirclePush, testCirclePush, testCircleSound } from '@/services/circlePush';

type DeviceAction = 'register' | 'disable' | 'test' | 'sound';

export function CircleNotificationSettings() {
  const account = useRealAccount();
  const { L, align, fonts, row } = useL();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getCirclePushStatus>>>();
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const statusRequest = useRef(0);
  const owner = account?.profile.user_id;
  const request = account?.request;

  useFocusEffect(useCallback(() => {
    if (!owner || !request || Platform.OS !== 'android') return;
    let active = true;
    const check = () => {
      if (actionInFlight.current) return;
      const turn = ++statusRequest.current;
      void getCirclePushStatus(request, owner).then(value => {
        if (active && statusRequest.current === turn) setStatus(value);
      }).catch(() => {
        if (active && statusRequest.current === turn) setStatus(undefined);
      });
    };
    check();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') check(); });
    return () => { active = false; subscription.remove(); };
  }, [owner, request]));

  if (Platform.OS !== 'android') return null;
  if (!owner || !request) return <Card padded>
    <Text style={[styles.copy, { textAlign: align, fontFamily: fonts.medium }]}>{L('سجّل دخولك عشان تفعّل إشعارات الهاتف.', 'Sign in to enable phone notifications.')}</Text>
  </Card>;

  async function run(action: DeviceAction) {
    if (actionInFlight.current || !owner || !request) return;
    actionInFlight.current = true;
    if (action === 'register' || action === 'disable') statusRequest.current++;
    setBusy(true);
    setMessage(undefined);
    try {
      switch (action) {
        case 'test':
          await testCirclePush(request, owner);
          setMessage({ text: L('أُضيف الإشعار التجريبي لقائمة الإرسال.', 'Test notification queued.'), error: false });
          break;
        case 'sound':
          await testCircleSound(owner);
          break;
        case 'register':
        case 'disable':
          await setCirclePush(request, owner, action === 'register');
          setStatus(await getCirclePushStatus(request, owner));
          break;
      }
    } catch (error) {
      const permission = error instanceof Error && error.message.includes('CIRCLE_PUSH_PERMISSION_REQUIRED');
      setMessage({
        error: true,
        text: permission ? L('اسمح بالإشعارات من إعدادات أندرويد، وبعدها جرّب مرة ثانية.', 'Allow notifications in Android settings, then try again.')
          : action === 'test' ? L('تعذّر إرسال الاختبار. جرّب مرة ثانية.', 'Could not queue the test. Try again.')
          : action === 'sound' ? L('تعذّر اختبار الصوت. راجع إعدادات الإشعارات في أندرويد.', 'Could not test sound. Check Android notification settings.')
          : L('تعذّر تحديث تسجيل الهاتف. تأكد من الاتصال والإذن.', 'Could not update this device. Check connectivity and permission.'),
      });
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  const testDisabled = busy || !status?.permission || !status.registered;
  const registered = status?.registered;
  const deviceStatus = status?.permission === false ? L('الإذن غير مفعّل', 'Permission off')
    : registered ? L('الهاتف مسجّل', 'Device registered')
    : status ? L('الهاتف غير مسجّل', 'Device unregistered') : undefined;

  return (
    <Card>
      <View style={[styles.header, { flexDirection: row }]}>
        <Text accessibilityRole="header" style={[styles.title, { textAlign: align, fontFamily: fonts.bold }]}>{L('إشعارات الهاتف', 'Phone notifications')}</Text>
        {deviceStatus && <Badge text={deviceStatus} kind={registered && status?.permission ? 'ok' : 'off'} />}
      </View>
      <Row first icon="bell" title={L('إرسال إشعار تجريبي', 'Send test notification')} disabled={testDisabled} onPress={() => void run('test')} />
      <Row icon="volume-2" title={L('اختبار الصوت', 'Test sound')} disabled={testDisabled} onPress={() => void run('sound')} />
      <Row icon="settings" title={L('إعدادات أندرويد', 'Android settings')} disabled={busy}
        onPress={() => void Linking.openSettings().catch(() => setMessage({ text: L('تعذّر فتح إعدادات أندرويد.', 'Could not open Android settings.'), error: true }))} />
      <View style={styles.actions}>
        {message && <Text accessibilityLiveRegion="polite" accessibilityRole={message.error ? 'alert' : undefined}
          style={[styles.message, { textAlign: align, fontFamily: fonts.medium }, message.error && styles.error]}>{message.text}</Text>}
        <Action label={registered ? L('إعادة تسجيل الهاتف', 'Re-register this device') : L('تفعيل إشعارات الهاتف', 'Enable phone notifications')}
          tone={registered ? 'quiet' : 'primary'} disabled={busy} onPress={() => void run('register')} />
        {registered && <Action label={L('إيقاف إشعارات الهاتف', 'Disable phone notifications')} tone="danger" disabled={busy}
          onPress={() => Alert.alert(
            L('تبي توقف إشعارات الهاتف؟', 'Turn off phone notifications?'),
            L('تقدر تفعّلها مرة ثانية من هذي الصفحة.', 'You can enable them again from this page.'),
            [
              { text: L('إلغاء', 'Cancel'), style: 'cancel' },
              { text: L('إيقاف الإشعارات', 'Turn off notifications'), style: 'destructive', onPress: () => void run('disable') },
            ],
          )} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { direction: 'ltr', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  title: { flex: 1, fontSize: 17, color: colors.ink },
  copy: { color: colors.muted },
  actions: { gap: 6, padding: 10 },
  message: { backgroundColor: '#E9F8EF', color: colors.green, padding: 9, borderRadius: 8 },
  error: { backgroundColor: '#FFF0F0', color: colors.red },
});
