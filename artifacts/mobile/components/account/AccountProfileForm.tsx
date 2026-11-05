import { TextInput, FieldSelect } from '@/components/FormField';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/contexts/I18nContext';
import { ACCOUNT_CLASSIFICATIONS, AccountProfileValidationError, validateUserContactProfile, type UserContactProfile, type ProfileField } from '@/services/googleAccountContract';
import { ACCOUNT_ROLE_LABELS } from '@/services/accountOnboarding';
import { chooseLocalProfilePhoto } from '@/services/accountDevice';

export type ContactInput = Omit<UserContactProfile, 'user_id'>;
export function AccountProfileForm({ userId, initial, photo: initialPhoto = '', onSave, onCancel, email, onDraftChange, onDiscard }: {
  userId: string; initial?: UserContactProfile | null; photo?: string; email: string;
  onSave(value: ContactInput, photo: string): Promise<void>; onCancel?(): void; onDiscard?(): void; onDraftChange?(value: ContactInput, photo: string): void;
}) {
  const { language, isRTL } = useI18n();
  const L = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [value, setValue] = useState<ContactInput>(() => ({ display_name: initial?.display_name ?? '', phone: initial?.phone ?? '', company: initial?.company ?? '', classification: initial?.classification ?? '' as ContactInput['classification'], other_classification: initial?.other_classification ?? '' }));
  const [photo, setPhoto] = useState(initialPhoto);
  useEffect(() => { onDraftChange?.(value, photo); }, [value, photo]);
  const [fields, setFields] = useState<readonly ProfileField[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState(false);
  const [picking, setPicking] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const inputs = useRef<Partial<Record<ProfileField, TextInput | null>>>({});
  const positions = useRef<Partial<Record<ProfileField, number>>>({});
  const update = (key: keyof ContactInput, text: string) => { setValue(v => ({ ...v, [key]: text })); setFields(f => f.filter(k => k !== key)); setError(''); };
  const pick = async () => {
    setPicking(true); setError('');
    try { const next = await chooseLocalProfilePhoto(); if (next) setPhoto(next); }
    catch { setError(L('اختر صورة JPG أو PNG أو WebP أصغر من 700KB.', 'Choose a JPG, PNG or WebP photo under 700KB.')); }
    finally { setPicking(false); }
  };
  const save = async () => {
    if (busy || picking) return;
    setFields([]); setError('');
    try { validateUserContactProfile(userId, value); }
    catch (cause) {
      if (cause instanceof AccountProfileValidationError) {
        setFields(cause.fields);
        const first = cause.fields[0];
        scroll.current?.scrollTo({ y: Math.max(0, (positions.current[first] ?? 0) - 16), animated: true });
        inputs.current[first]?.focus();
        setError(L('أكمل الحقول المعلّمة بالأحمر.', 'Complete the fields marked in red.'));
      } else setError(L('راجع بياناتك؛ اسم الشركة لا يتجاوز 150 حرفًا.', 'Check your details; company name must not exceed 150 characters.'));
      return;
    }
    setBusy(true);
    try { await onSave(value, photo); }
    catch { setError(L('تعذّر إكمال الحفظ. بياناتك ما زالت هنا؛ حاول مرة أخرى.', 'Could not finish saving. Your entries are still here; try again.')); }
    finally { setBusy(false); }
  };
  const field = (key: 'display_name' | 'phone' | 'company' | 'other_classification', ar: string, en: string, required: boolean, maxLength: number) => {
    const invalid = fields.includes(key as ProfileField);
    return <View key={key} onLayout={e => { positions.current[key as ProfileField] = e.nativeEvent.layout.y; }} style={s.field}>
      <Text style={s.label}>{L(ar, en)}{required ? <Text style={s.red}> *</Text> : <Text style={s.muted}> {L('(اختياري)', '(optional)')}</Text>}</Text>
      <TextInput ref={node => { inputs.current[key as ProfileField] = node; }} accessibilityLabel={L(ar, en)} testID={`account-${key}`} value={value[key]} onChangeText={t => update(key, t)} editable={!busy} maxLength={maxLength}
        keyboardType={key === 'phone' ? 'phone-pad' : 'default'} autoComplete={key === 'phone' ? 'tel' : key === 'display_name' ? 'name' : 'off'}
        style={[s.input, { textAlign: key === 'phone' ? 'left' : isRTL ? 'right' : 'left' }, invalid && s.invalid]} />
      {invalid ? <Text accessibilityRole="alert" style={s.red}>{key === 'phone' ? L('أدخل رقم هاتف صحيحًا مع رمز الدولة.', 'Enter a valid phone number with country code.') : L('هذا الحقل مطلوب.', 'This field is required.')}</Text> : null}
    </View>;
  };
  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}><KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <View style={s.top}><Text style={s.brand}>ViewState</Text>{onCancel ? <Pressable accessibilityRole="button" onPress={onCancel} disabled={busy} style={s.quiet}><Text style={s.red}>{onDraftChange ? L('رجوع', 'Back') : L('إلغاء', 'Cancel')}</Text></Pressable> : null}</View>{onDiscard ? <Pressable accessibilityRole="button" disabled={busy} onPress={onDiscard} style={s.quiet}><Text style={s.red}>{L('إلغاء المسودة', 'Discard draft')}</Text></Pressable> : null}
      <Text style={s.title}>{initial ? L('بياناتك الشخصية', 'Your personal details') : L('خلّينا نتعرف عليك', 'A little about you')}</Text>
      <Text style={s.description}>{L('أكمل بياناتك لبدء تنظيم عقاراتك وعملائك.', 'Complete your profile to start organizing properties and clients.')}</Text>
      <Text style={s.email}>{email}</Text>
      <View style={s.avatarRow}>{photo ? <Image source={{ uri: photo }} style={s.avatar} /> : <View style={[s.avatar, s.avatarEmpty]}><Feather name="user" size={32} color="#2360D9" /></View>}
        <View style={{ flex: 1 }}><Pressable accessibilityRole="button" style={s.quiet} onPress={() => void pick()} disabled={picking || busy}><Text style={s.link}>{picking ? L('جارٍ الاختيار…', 'Choosing…') : L('اختيار صورة أو استخدام الأفاتار', 'Choose a photo or keep the avatar')}</Text></Pressable>
        {photo ? <Pressable accessibilityRole="button" onPress={() => setPhoto('')} disabled={busy} style={s.quiet}><Text style={s.red}>{L('إزالة الصورة', 'Remove photo')}</Text></Pressable> : null}</View></View>
      {field('display_name', 'الاسم', 'Name', true, 100)}
      {field('phone', 'رقم الهاتف', 'Phone number', true, 30)}
      {field('company', 'اسم الشركة', 'Company', false, 150)}
      <View style={s.field} onLayout={e => { positions.current.classification = e.nativeEvent.layout.y; }}>
        <Text style={s.label}>{L('التصنيف', 'Classification')}<Text style={s.red}> *</Text></Text>
        <FieldSelect active={roles} invalid={fields.includes('classification')} accessibilityRole="button" accessibilityLabel={L('اختيار التصنيف', 'Choose classification')} testID="account-classification" onPress={() => setRoles(true)} disabled={busy} style={[s.input, s.select, fields.includes('classification') && s.invalid]}>
          <Text style={s.label}>{value.classification ? ACCOUNT_ROLE_LABELS[value.classification][language === 'ar' ? 0 : 1] : L('اختر تصنيفك', 'Choose your role')}</Text><Feather name="chevron-down" size={18} color="#64748B" />
        </FieldSelect>
        {fields.includes('classification') ? <Text style={s.red}>{L('اختر تصنيفك.', 'Choose your role.')}</Text> : null}
      </View>
      {value.classification === 'other' ? field('other_classification', 'اكتب تصنيفك', 'Describe your role', true, 100) : null}
      <Text style={s.description}>{L('رقم الهاتف للتواصل؛ لا نرسل SMS ولا نتحقق من ملكية الرقم حاليًا. الصورة محفوظة لهذا الحساب على الجهاز فقط.', 'Your phone is for contact; SMS and phone ownership verification are not enabled. Your photo stays in this account’s storage on this device.')}</Text>
      {error ? <Text accessibilityRole="alert" style={s.red}>{error}</Text> : null}
      <Pressable accessibilityRole="button" testID="account-profile-save" style={[s.primary, busy && { opacity: 0.6 }]} disabled={busy || picking} onPress={() => void save()}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{L('حفظ ومتابعة', 'Save and continue')}</Text>}</Pressable>
    </ScrollView>
    <Modal visible={roles} transparent animationType="fade" onRequestClose={() => setRoles(false)}><View style={s.backdrop}><View style={[s.sheet, { direction: isRTL ? 'rtl' : 'ltr' }]}><Text style={s.title}>{L('اختر تصنيفك', 'Choose your role')}</Text>
      {ACCOUNT_CLASSIFICATIONS.map(role => <Pressable accessibilityRole="radio" accessibilityState={{ checked: value.classification === role }} key={role} style={s.role} onPress={() => { update('classification', role); setRoles(false); }}><Text style={s.label}>{ACCOUNT_ROLE_LABELS[role][language === 'ar' ? 0 : 1]}</Text>{value.classification === role ? <Feather name="check" size={20} color="#2360D9" /> : null}</Pressable>)}
      <Pressable accessibilityRole="button" style={s.quiet} onPress={() => setRoles(false)}><Text style={s.red}>{L('إلغاء', 'Cancel')}</Text></Pressable>
    </View></View></Modal>
  </KeyboardAvoidingView></SafeAreaView>;
}
export const accountScreenStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F9FC' }, content: { flexGrow: 1, padding: 20, gap: 18, width: '100%', maxWidth: 520, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { fontSize: 24, fontWeight: '800', color: '#235AF3' }, title: { fontSize: 25, fontWeight: '700', color: '#172B4D' },
  description: { fontSize: 14, lineHeight: 22, color: '#52647B' }, email: { fontSize: 14, color: '#52647B', writingDirection: 'ltr' },
  field: { gap: 8 }, label: { fontSize: 15, fontWeight: '600', color: '#172B4D' }, muted: { fontWeight: '400', color: '#52647B' }, red: { color: '#C52F3B', fontSize: 14, lineHeight: 21 },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: '#B8C8DF', borderRadius: 12, backgroundColor: 'white', fontSize: 16, color: '#172B4D' }, invalid: { borderColor: '#C52F3B', backgroundColor: '#FFF5F5' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, avatarRow: { flexDirection: 'row', gap: 16, alignItems: 'center' }, avatar: { width: 72, height: 72, borderRadius: 36 }, avatarEmpty: { backgroundColor: '#EAF1FD', alignItems: 'center', justifyContent: 'center' },
  quiet: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 }, link: { color: '#235AF3', fontSize: 14, fontWeight: '600' }, primary: { minHeight: 50, borderRadius: 14, backgroundColor: '#235AF3', alignItems: 'center', justifyContent: 'center', padding: 14 }, primaryText: { color: 'white', fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#00000066' }, sheet: { width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: 'white', borderRadius: 20, padding: 20, gap: 10 }, role: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E8EDF4', paddingVertical: 12 },
});
const s = accountScreenStyles;
