import { Text } from "@/components/AppText";
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Action } from '@/components/assistant/ui';
import { Row, useL } from '@/components/account/ui';
import { nextDesign as colors } from '@/constants/nextDesign';
import { useAppUpdate } from '@/contexts/AppUpdateContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';

export function AppUpdateAction({ mode }: { mode: 'banner' | 'settings' }) {
  const { supported, available, state, check, install } = useAppUpdate();
  const { L, fonts, row, align } = useL();
  const insets = useScreenInsets();
  const [confirm, setConfirm] = useState(false);
  const ready = available || state === 'available';
  const busy = state === 'checking' || state === 'installing';
  const status = state === 'current' && !ready ? L('عندك أحدث تحديث متوافق.', 'You have the latest compatible update.')
    : state === 'checking' ? L('جاري التحقق من التحديثات…', 'Checking for updates…')
    : state === 'installing' ? L('جاري تنزيل التحديث…', 'Downloading update…')
    : state === 'failed' ? L('تعذّر التحديث. تأكد من الاتصال وحاول مرة ثانية.', 'Could not update. Check your connection and try again.')
    : undefined;
  const updateLabel = L('تحديث التطبيق', 'Update app');

  if (!supported || (mode === 'banner' && !ready && state !== 'installing' && state !== 'failed')) return null;

  return (
    <>
      {mode === 'banner' ? (
        <View style={styles.banner}>
          <View style={[styles.bannerRow, { flexDirection: row }]}>
            <Feather name="download" size={22} color={colors.blue} />
            <Text style={[styles.bannerTitle, { fontFamily: fonts.bold, textAlign: align }]}>
              {ready ? L('تحديث جديد متاح', 'New update available') : updateLabel}
            </Text>
            <Action label={ready ? updateLabel : L('تحقق مرة ثانية', 'Check again')} tone="primary"
              disabled={busy} testID="app-ota-update" onPress={() => ready ? setConfirm(true) : void check()} />
          </View>
          {status && <Text accessibilityLiveRegion="polite" style={[styles.status, { fontFamily: fonts.medium, textAlign: align }]}>{status}</Text>}
        </View>
      ) : (
        <>
          <Row first icon="refresh-cw" title={L('التحقق من وجود تحديث', 'Check for update')} sub={status}
            disabled={busy} onPress={() => void check()} testID="app-ota-check" />
          {ready && <Row icon="download" title={updateLabel} disabled={busy} onPress={() => setConfirm(true)} />}
        </>
      )}
      <Modal visible={confirm} transparent animationType="slide" onRequestClose={() => setConfirm(false)}>
        <View style={styles.backdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel={L('إغلاق', 'Close')} style={styles.scrim} onPress={() => setConfirm(false)} />
          <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.handle} />
            <View style={styles.downloadIcon}><Feather name="download" size={26} color={colors.blue} /></View>
            <Text accessibilityRole="header" style={[styles.sheetTitle, { fontFamily: fonts.bold }]}>{L('تبي تثبّت التحديث؟', 'Install the update?')}</Text>
            <Text style={[styles.sheetText, { fontFamily: fonts.regular }]}>
              {L('التطبيق بيفتح من جديد بعد التنزيل. احفظ شغلك قبل ما تكمّل.', 'The app will reopen after downloading. Save any open edits before continuing.')}
            </Text>
            <Action label={L('تنزيل وتطبيق', 'Download and apply')} tone="primary" testID="app-ota-install"
              onPress={() => { setConfirm(false); void install(); }} />
            <Action label={L('بعدين', 'Later')} tone="quiet" onPress={() => setConfirm(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.soft, borderRadius: 14, padding: 12, gap: 8 },
  bannerRow: { direction: 'ltr', alignItems: 'center', gap: 9 },
  bannerTitle: { flex: 1, fontSize: 15, color: colors.ink },
  status: { fontSize: 13, color: colors.muted },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  scrim: { flex: 1 },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  handle: { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.border },
  downloadIcon: { alignSelf: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.soft },
  sheetTitle: { fontSize: 22, color: colors.ink, textAlign: 'center' },
  sheetText: { fontSize: 15, color: colors.muted, textAlign: 'center', marginBottom: 6 },
});
