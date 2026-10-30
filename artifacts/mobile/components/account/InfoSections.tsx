import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { AccountScreen, Badge, Body, Btn, Card, Confirm, ErrorText, Field, Note, Row, SectionLabel, Sheet, useCanWrite, useL } from './ui';

export function appVersion() {
  // Expo Go's host version is NOT ViewState's version or installed APK provenance.
  return { version: Constants.expoConfig?.version ?? '—', build: Constants.expoConfig?.android?.versionCode ?? null };
}

export function DataSection() {
  const { L } = useL();
  return (
    <AccountScreen title={L('بياناتي', 'My data')} subtitle={L('أين تُحفظ بياناتك اليوم.', 'Where your data lives today.')}>
      <Card padded>
        <Badge kind="warn" text={L('هذا الجهاز فقط — لا سحابة', 'This device only — no cloud')} />
        <Body>{L('العقارات والأشخاص والطلبات والوسائط محفوظة على هذا الجهاز فقط.', 'Properties, people, requests and media are stored on this device only.')}</Body>
      </Card>
      <Card>
        <Row first icon="download" title={L('نسخة احتياطية كاملة', 'Full backup')} right={<Badge kind="off" text={L('غير متاح', 'Unavailable')} />} />
        <Row icon="upload" title={L('استعادة', 'Restore')} right={<Badge kind="off" text={L('غير متاح', 'Unavailable')} />} />
        <Row icon="share" title={L('تصدير البيانات', 'Export data')} right={<Badge kind="off" text={L('غير متاح', 'Unavailable')} />} />
        <Row icon="cloud-off" title={L('المزامنة السحابية', 'Cloud sync')} right={<Badge kind="off" text={L('غير متاح', 'Unavailable')} />} />
      </Card>
      <Note warn>{L('لا توجد نسخة احتياطية أو تصدير أو استعادة حاليًا. حذف التطبيق أو فقدان الجهاز يعني فقدان البيانات. تغيير الهاتف لن ينقلها تلقائيًا.', 'There is no backup, export or restore today. Uninstalling the app or losing the device loses the data. Changing phones does not move it.')}</Note>
    </AccountScreen>
  );
}

export function HelpSection() {
  const { state, saveFeedback, removeFeedback } = useAccountFoundation(); const { canWrite, busy } = useCanWrite();
  const { L, language, fonts, align, row } = useL(); const colors = useColors();
  const [guide, setGuide] = useState(false); const [contact, setContact] = useState(false);
  const [compose, setCompose] = useState<null | 'issue' | 'idea'>(null);
  const [subject, setSubject] = useState(''); const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const closeCompose = () => (message.trim() ? setDiscard(true) : setCompose(null));
  const [removeId, setRemoveId] = useState<string | null>(null); const [removeError, setRemoveError] = useState<string | null>(null);
  const open = (k: 'issue' | 'idea') => { setSubject(k === 'issue' ? L('مشكلة في الاستخدام', 'Usage issue') : L('فكرة لتحسين التطبيق', 'Improvement idea')); setMessage(''); setFormError(null); setCompose(k); };
  const save = async () => {
    if (!subject.trim() || !message.trim()) { setFormError(L('اكتب العنوان والتفاصيل.', 'Enter a subject and details.')); return; }
    if (state.feedback.length >= 20) { setFormError(L('وصلت إلى 20 مسودة. احذف مسودة قديمة أولًا.', 'You have 20 drafts. Remove an old one first.')); return; }
    try { await saveFeedback(subject, message); setCompose(null); } catch { setFormError(L('لم تُحفظ المسودة.', 'Draft was not saved.')); }
  };
  const remove = async () => {
    if (!removeId) return; setRemoveError(null);
    try { await removeFeedback(removeId); setRemoveId(null); } catch { setRemoveError(L('لم تُحذف المسودة.', 'Draft was not removed.')); }
  };
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString(language === 'ar' ? 'ar-KW' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
  return (
    <AccountScreen title={L('المساعدة والدعم', 'Help & support')}>
      <Card>
        <Row first icon="help-circle" title={L('كيف أبدأ؟', 'Getting started')} sub={L('دليل سريع', 'Quick guide')} onPress={() => setGuide(true)} />
        <Row icon="alert-circle" title={L('الإبلاغ عن مشكلة', 'Report an issue')} sub={L('يُحفظ محليًا، لا يُرسل', 'Saved locally, not sent')} onPress={() => open('issue')} disabled={!canWrite} />
        <Row icon="edit-3" title={L('اقتراح تحسين', 'Suggest an improvement')} sub={L('يُحفظ محليًا، لا يُرسل', 'Saved locally, not sent')} onPress={() => open('idea')} disabled={!canWrite} />
        <Row icon="mail" title={L('التواصل معنا', 'Contact us')} sub={L('قناة الدعم لم تُحدد بعد', 'Support channel not configured')} onPress={() => setContact(true)} />
      </Card>
      <SectionLabel>{L(`مسودات محلية (${state.feedback.length}/20)`, `LOCAL DRAFTS (${state.feedback.length}/20)`)}</SectionLabel>
      <Card>
        {state.feedback.length === 0 ? <View style={{ padding: 18, alignItems: 'center', gap: 4 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: fonts.medium }}>{L('لا مسودات بعد', 'No drafts yet')}</Text>
        </View> : state.feedback.map((d, i) => (
          <View key={d.id} style={{ flexDirection: row, padding: 14, gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: '#EDF1F6' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.semiBold, color: colors.foreground, textAlign: align }}>{d.subject}</Text>
              <Text numberOfLines={3} style={{ fontFamily: fonts.regular, color: colors.mutedForeground, fontSize: 12.5, textAlign: align, marginVertical: 2 }}>{d.message}</Text>
              <Text style={{ fontFamily: fonts.regular, color: colors.mutedForeground, fontSize: 11, textAlign: align }}>{fmt(d.savedAt)} · {L('محفوظ محليًا — لم يُرسل', 'Saved locally — not sent')}</Text>
            </View>
            <Btn kind="danger" icon="trash-2" label={L('حذف', 'Remove')} onPress={() => { setRemoveError(null); setRemoveId(d.id); }} disabled={!canWrite} />
          </View>
        ))}
      </Card>
      <Sheet visible={guide} title={L('ابدأ في ثلاث خطوات', 'Start in three steps')} onClose={() => setGuide(false)}>
        <Body>{L('1. سجّل عقارك أو طلب الشخص بالمعلومات الأساسية.', '1. Capture a property or a person’s request with the essentials.')}</Body>
        <Body>{L('2. أكمل التفاصيل وقتما تحتاج.', '2. Enrich details when needed.')}</Body>
        <Body>{L('3. راجع المطابقات وما ستشاركه قبل الإرسال.', '3. Review matches and what you share before sending.')}</Body>
        <Btn label={L('فهمت', 'Got it')} onPress={() => setGuide(false)} />
      </Sheet>
      <Sheet visible={contact} title={L('التواصل معنا', 'Contact us')} onClose={() => setContact(false)}>
        <Note>{L('لم يُعتمد بريد أو رقم دعم بعد، لذلك لا نعرض بيانات تواصل. يمكنك حفظ ملاحظتك محليًا لمشاركتها لاحقًا.', 'No support email or phone has been approved yet, so none is shown. You can save a note locally to share later.')}</Note>
        <Btn label={L('كتابة مسودة', 'Write a draft')} disabled={!canWrite} onPress={() => { setContact(false); open('issue'); }} />
      </Sheet>
      <Sheet visible={!!compose} title={compose === 'idea' ? L('اقتراح تحسين', 'Suggest an improvement') : L('الإبلاغ عن مشكلة', 'Report an issue')} onClose={closeCompose}>
        <Field label={L('العنوان', 'Subject')} value={subject} maxLength={120} onChangeText={setSubject} error={!!formError && !subject.trim()} />
        <Field label={L('التفاصيل', 'Details')} value={message} maxLength={2000} multiline onChangeText={setMessage} error={!!formError && !message.trim()} />
        <ErrorText>{formError}</ErrorText>
        <Note>{L('لا تضع بيانات عملاء. هذه المسودة لن تُرسل.', 'Do not include client details. This draft will not be sent.')}</Note>
        <Btn label={L('حفظ كمسودة محلية', 'Save as local draft')} busy={busy} disabled={!canWrite} onPress={() => void save()} />
        <Btn kind="danger" label={L('إلغاء', 'Cancel')} onPress={closeCompose} />
        <Confirm visible={discard} destructive title={L('تجاهل المسودة؟', 'Discard this draft?')} body={L('لم تُحفظ هذه الرسالة.', 'This message has not been saved.')}
          confirmLabel={L('تجاهل', 'Discard')} cancelLabel={L('متابعة الكتابة', 'Keep writing')} onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); setCompose(null); }} />
      </Sheet>
      <Confirm visible={!!removeId} destructive busy={busy} error={removeError} title={L('حذف المسودة؟', 'Remove draft?')}
        body={L('تُحذف هذه المسودة المحلية فقط.', 'Only this local draft is removed.')} confirmLabel={L('حذف المسودة', 'Remove draft')}
        onCancel={() => setRemoveId(null)} onConfirm={() => void remove()} />
    </AccountScreen>
  );
}

export function AboutSection() {
  const { L, fonts, align } = useL(); const colors = useColors(); const router = useRouter(); const v = appVersion();
  return (
    <AccountScreen title={L('عن ViewState', 'About ViewState')} subtitle={L('مساحة عملك العقارية الخاصة.', 'Your private real estate workspace.')}>
      <Card padded>
        <Text style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: 26, textAlign: align }}>ViewState<Text style={{ color: colors.primary }}>.</Text></Text>
        <Body>{L('ينظّم العقارات والأشخاص ومتطلباتهم، ويساعدك على مراجعة الفرص والمشاركة باختيارك.', 'Organize properties, people and their requirements, review opportunities, and share on your terms.')}</Body>
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, fontSize: 12, textAlign: align }}>{L('إصدار التطبيق', 'App version')} {v.version}{v.build ? ` · ${L('بناء Android المُعدّ', 'Configured Android build')} ${v.build}` : ''}</Text>
        <Body muted>{L('من إعدادات التطبيق الحالية؛ ليست إثباتًا لإصدار APK المثبّت على جهازك.', 'From the current app configuration; not proof of the APK installed on your phone.')}</Body>
      </Card>
      <Card><Row first icon="file-text" title={L('سياسة الخصوصية وشروط الاستخدام', 'Privacy policy & terms')} sub={L('مسودات غير نهائية', 'Nonfinal drafts')} onPress={() => router.push('/account/legal' as never)} /></Card>
    </AccountScreen>
  );
}

export function LegalSection() {
  const { L, fonts, align } = useL(); const colors = useColors();
  const H = ({ t }: { t: string }) => <Text style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: 17, marginTop: 8, textAlign: align }}>{t}</Text>;
  return (
    <AccountScreen title={L('الخصوصية والشروط', 'Privacy & terms')} subtitle={L('مسودة توضيحية، وليست سياسة قانونية معتمدة.', 'Illustrative draft, not an approved legal policy.')}>
      <Card padded>
        <H t={L('الخصوصية', 'Privacy')} />
        <Body>{L('يحفظ التطبيق بياناتك على هذا الجهاز. السجلات مرتبطة بالجهاز وليست معزولة لكل حساب؛ أي شخص يستخدم الجهاز يمكنه رؤيتها.', 'The app stores your data on this device. Records are device-scoped, not isolated per account; anyone using the device can see them.')}</Body>
        <Body>{L('لا تسجيل دخول ولا مزامنة سحابية حاليًا. الأذونات تُطلب فقط عند استخدام الميزة وتُدار من إعدادات النظام.', 'There is no sign-in or cloud sync today. Permissions are asked only when a feature is used and are managed in system settings.')}</Body>
        <Body muted>{L('قبل تفعيل الحسابات سنوضح مزوّدي الدخول والبيانات المجمعة والأغراض والاحتفاظ والتصدير والحذف.', 'Before accounts launch we will explain sign-in providers, collected data, purposes, retention, export and deletion.')}</Body>
        <H t={L('شروط الاستخدام', 'Terms of use')} />
        <Body>{L('أنت مسؤول عن البيانات التي تدخلها وعن مشاركتها مع الآخرين.', 'You are responsible for the data you enter and for what you share with others.')}</Body>
        <Body muted>{L('هذه مسودة للمراجعة وقد تتغير.', 'This is a draft for review and may change.')}</Body>
      </Card>
    </AccountScreen>
  );
}
