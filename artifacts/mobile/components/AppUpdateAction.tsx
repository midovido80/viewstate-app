import { Alert, View } from 'react-native';
import { Action, AssistantText as Txt } from '@/components/assistant/ui';
import { useAppUpdate } from '@/contexts/AppUpdateContext';
import { useI18n } from '@/contexts/I18nContext';

export function AppUpdateAction() {
  const { supported, available, state, check, install } = useAppUpdate();
  const ar = useI18n().language === 'ar';
  const L = (arabic: string, english: string) => ar ? arabic : english;
  if (!supported) return null;
  const busy = state === 'checking' || state === 'installing';
  return <View style={{ gap: 6 }}>
    <Txt bold>{available ? L('تحديث جديد متاح', 'New update available') : L('تحديث التطبيق', 'App update')}</Txt>
    {state === 'current' && !available && <Txt muted>{L('عندك أحدث تحديث متوافق.', 'You have the latest compatible update.')}</Txt>}
    {state === 'checking' && <Txt muted>{L('جارٍ التحقق من التحديثات…', 'Checking for updates…')}</Txt>}
    {state === 'installing' && <Txt muted>{L('جارٍ تنزيل التحديث…', 'Downloading update…')}</Txt>}
    {state === 'failed' && <Txt>{L('تعذّر التحديث. تحقق من الاتصال وحاول مرة أخرى.', 'Could not update. Check your connection and try again.')}</Txt>}
    <Action testID="app-ota-update" disabled={busy} label={available
      ? L('تحديث التطبيق', 'Update app') : L('التحقق من وجود تحديث', 'Check for update')}
      onPress={() => {
        if (!available) { void check(); return; }
        Alert.alert(
          L('تحديث التطبيق', 'Update app'),
          L('التطبيق هيفتح من جديد بعد التنزيل. احفظ أي تعديلات مفتوحة قبل المتابعة.', 'The app will reopen after downloading. Save any open edits before continuing.'),
          [
            { text: L('لاحقًا', 'Later'), style: 'cancel' },
            { text: L('تنزيل وتطبيق', 'Download and apply'), onPress: () => void install() },
          ],
        );
      }} />
  </View>;
}
