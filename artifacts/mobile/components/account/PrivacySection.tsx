import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View, Text, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { fictionalSharePreview, type ShareChoices } from '@/services/accountFoundation';
import { readAccountPermissions, openAccountDeviceSettings, type AccountPermissions, type DevicePermission } from '@/services/accountDevice';
import { AccountScreen, Badge, Btn, Card, ErrorText, Note, Row, SectionLabel, Sheet, ToggleRow, tone, useCanWrite, useL } from './ui';

const KEYS: (keyof ShareChoices)[] = ['source', 'location', 'media', 'notes'];
function useShareLabels() {
  const { L } = useL();
  return {
    source: [L('إظهار بيانات المالك أو الوسيط', 'Include owner / broker details'), L('بيانات المصدر', 'Source details')],
    location: [L('إظهار الموقع الدقيق', 'Include precise location'), L('الموقع الدقيق', 'Precise location')],
    media: [L('إرفاق الصور والملفات', 'Include photos & files'), L('الوسائط والملفات', 'Media & files')],
    notes: [L('إظهار الملاحظات الداخلية', 'Include internal notes'), L('الملاحظات الداخلية', 'Internal notes')],
  } as Record<keyof ShareChoices, [string, string]>;
}

export function PreviewSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state } = useAccountFoundation(); const { L, language, fonts, align, row } = useL(); const colors = useColors(); const labels = useShareLabels();
  const [snap, setSnap] = useState<ShareChoices>(state.sharing);
  useEffect(() => { if (visible) setSnap({ ...state.sharing }); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const [notice, ...lines] = fictionalSharePreview(language, snap);
  return (
    <Sheet visible={visible} title={L('معاينة مشاركة — مثال', 'Share preview — example')} onClose={onClose}>
      <Badge kind="warn" text={notice} />
      <View style={{ backgroundColor: tone.heroBg, borderColor: '#D6E5F8', borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 10 }}>
        {lines.map((line, i) => <Text key={line} style={{ color: i === 0 ? colors.accent : colors.foreground, fontFamily: i === 0 ? fonts.bold : fonts.regular, fontSize: i === 0 ? 17 : 13.5, lineHeight: 22, textAlign: align, marginVertical: 2 }}>{line}</Text>)}
      </View>
      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.semiBold, fontSize: 12.5, marginTop: 16, textAlign: align }}>{L('جرّب لهذا المثال فقط', 'TRY FOR THIS EXAMPLE ONLY')}</Text>
      {KEYS.map(k => (
        <View key={k} style={{ flexDirection: row, alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.foreground, textAlign: align }}>{labels[k][1]}</Text>
          <Switch accessibilityLabel={labels[k][1]} value={snap[k]} onValueChange={v => setSnap(p => ({ ...p, [k]: v }))} trackColor={{ true: colors.primary, false: '#CAD5E3' }} thumbColor="#FFFFFF" />
        </View>
      ))}
      <Note>{L('هذه التبديلات لا تغيّر الافتراضيات ولا مشاركة العقارات الفعلية، ولا يُرسل شيء من هنا.', 'These switches change neither your defaults nor actual property sharing, and nothing is sent from here.')}</Note>
      <Btn kind="danger" label={L('إغلاق', 'Close')} onPress={onClose} />
    </Sheet>
  );
}

export function PrivacySection() {
  const router = useRouter(); const { L } = useL(); const [preview, setPreview] = useState(false);
  return (
    <AccountScreen title={L('الخصوصية والمشاركة', 'Privacy & sharing')} subtitle={L('ما تحفظه يبقى على هذا الجهاز. تختار ما تشاركه.', 'What you save stays on this device. You choose what to share.')}>
      <Note>{L('لا يوجد حساب سحابي أو تشفير حساب حاليًا. البيانات محفوظة على الجهاز ومتاحة لأي شخص يستخدمه.', 'There is no cloud account or account encryption today. Data stays on the device and is visible to anyone using it.')}</Note>
      <Card>
        <Row first icon="share-2" title={L('اختيارات المشاركة الافتراضية', 'Default sharing choices')} sub={L('تفضيلات محفوظة للعرض', 'Saved presentation preferences')} onPress={() => router.push('/account/sharing' as never)} />
        <Row icon="eye" title={L('معاينة مشاركة عقار', 'Preview a property share')} sub={L('مثال وهمي', 'Fictional example')} onPress={() => setPreview(true)} />
        <Row icon="lock" title={L('أذونات التطبيق', 'App permissions')} sub={L('جهات الاتصال والموقع والصور', 'Contacts, location & photos')} onPress={() => router.push('/account/permissions' as never)} />
        <Row icon="file-text" title={L('سياسة الخصوصية', 'Privacy policy')} sub={L('مسودة للمراجعة', 'Draft for review')} onPress={() => router.push('/account/legal' as never)} />
      </Card>
      <PreviewSheet visible={preview} onClose={() => setPreview(false)} />
    </AccountScreen>
  );
}

export function SharingSection() {
  const { state, setSharing } = useAccountFoundation(); const { canWrite, busy } = useCanWrite(); const { L } = useL(); const labels = useShareLabels();
  const [preview, setPreview] = useState(false); const [error, setError] = useState<string | null>(null);
  const change = async (k: keyof ShareChoices, v: boolean) => {
    setError(null);
    try { await setSharing(k, v); } catch { setError(L('لم يُحفظ التغيير.', 'Change was not saved.')); }
  };
  return (
    <AccountScreen title={L('اختيارات المشاركة', 'Sharing defaults')} subtitle={L('تُحفظ كتفضيل على هذا الجهاز.', 'Saved as a preference on this device.')}>
      <Note warn>{L('هذه الاختيارات لا تغيّر حاليًا ما يُشارك من شاشات العقار الفعلية. تُستخدم في المعاينة الوهمية فقط.', 'These choices do not currently change what actual property screens share. They feed the fictional preview only.')}</Note>
      <Card>{KEYS.map((k, i) => <ToggleRow key={k} first={i === 0} title={labels[k][0]} value={state.sharing[k]} disabled={!canWrite || busy} onChange={v => void change(k, v)} />)}</Card>
      <ErrorText>{error}</ErrorText>
      <Btn icon="eye" label={L('معاينة المثال', 'Preview the example')} onPress={() => setPreview(true)} />
      <PreviewSheet visible={preview} onClose={() => setPreview(false)} />
    </AccountScreen>
  );
}

export function PermissionsSection() {
  const { L } = useL();
  const [perms, setPerms] = useState<AccountPermissions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPerms(await readAccountPermissions()); } catch { setError(L('تعذّرت قراءة حالة الأذونات.', 'Could not read permission status.')); }
    finally { setLoading(false); }
  }, [L]);
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const label = (p?: DevicePermission) => !p ? L('…', '…') : ({ granted: L('مسموح', 'Allowed'), denied: L('مرفوض', 'Denied'), undetermined: L('يُطلب عند الاستخدام', 'Ask when used'), limited: L('وصول محدود', 'Limited access'), unavailable: L('غير متاح هنا', 'Unavailable here') })[p];
  const kind = (p?: DevicePermission) => (p === 'granted' ? 'ok' : p === 'denied' || p === 'limited' ? 'warn' : 'off') as 'ok' | 'warn' | 'off';
  const open = async () => {
    setError(null);
    try { await openAccountDeviceSettings(); }
    catch { setError(L('تعذّر فتح إعدادات النظام. افتح الإعدادات > التطبيقات > ViewState يدويًا.', 'Could not open system settings. Open Settings > Apps > ViewState manually.')); }
  };
  const web = Platform.OS === 'web';
  return (
    <AccountScreen title={L('أذونات التطبيق', 'App permissions')} subtitle={L('الحالة الفعلية من النظام. لا نطلب أي إذن من هنا.', 'Actual status from the system. No permission is requested here.')}>
      <Card>
        {([['contacts', 'users', L('جهات الاتصال', 'Contacts')], ['location', 'map-pin', L('الموقع الحالي', 'Current location')], ['photos', 'image', L('الصور', 'Photos')]] as const)
          .map(([k, icon, title], i) => <Row key={k} first={i === 0} icon={icon} title={title} right={<Badge kind={kind(perms?.[k])} text={label(perms?.[k])} />} />)}
      </Card>
      <ErrorText>{error}</ErrorText>
      <Btn kind="secondary" icon="refresh-cw" label={L('تحديث الحالة', 'Refresh status')} onPress={() => void refresh()} busy={loading} />
      {web ? <Note>{L('في المتصفح: افتح إعدادات الموقع من رمز القفل بجانب العنوان لتغيير الأذونات.', 'In a browser: use the lock icon next to the address bar to change site permissions.')}</Note>
        : <Btn icon="settings" label={L('فتح إعدادات النظام', 'Open system settings')} onPress={() => void open()} />}
      <Note>{L('رفض الإذن لا يوقف العمل: يمكنك إضافة الأشخاص يدويًا ولصق رابط الموقع بدل GPS. يُطلب الإذن فقط عند استخدام الميزة.', 'Denying keeps manual entry available: add people by hand or paste a location link instead of GPS. Permission is asked only when a feature is used.')}</Note>
    </AccountScreen>
  );
}
