import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '@/contexts/I18nContext';
import { validateGuestContact } from '@/services/guestAccount';
import { accountScreenStyles as s } from './AccountProfileForm';
export function GuestProfileForm({ name: initialName = '', phone: initialPhone = '', onSave, onCancel }: { name?: string; phone?: string; onSave(name: string, phone: string): Promise<void>; onCancel(): void }) {
  const { language, isRTL } = useI18n(); const L = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [name, setName] = useState(initialName), [phone, setPhone] = useState(initialPhone), [error, setError] = useState(''), [field, setField] = useState(''), [busy, setBusy] = useState(false);
  const nameRef = useRef<TextInput>(null), phoneRef = useRef<TextInput>(null);
  const save = async () => {
    if (busy) return;
    try { validateGuestContact(name, phone); } catch (e) {
      const badPhone = e instanceof Error && e.message === 'GUEST_PHONE_INVALID'; setField(badPhone ? 'phone' : 'name'); (badPhone ? phoneRef : nameRef).current?.focus();
      setError(badPhone ? L('أدخل رقمًا صحيحًا أو اترك الهاتف فارغًا.', 'Enter a valid number or leave phone blank.') : L('الاسم مطلوب.', 'Name is required.')); return;
    }
    setBusy(true); setError('');
    try { await onSave(name, phone); } catch { setError(L('تعذّر الحفظ على الجهاز. بياناتك ما زالت هنا؛ حاول مجددًا.', 'Could not save on this device. Your entries are still here; retry.')); } finally { setBusy(false); }
  };
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { direction: isRTL ? 'rtl' : 'ltr' }]}>
    <Text style={s.brand}>ViewState</Text><Text style={s.title}>{L('استخدام بدون حساب', 'Use as guest')}</Text>
    <Text style={s.description}>{L('مساعدك الشخصي، دون تسجيل دخول. الاسم مطلوب والهاتف اختياري؛ لا نرسلهما إلى الإنترنت.', 'Your personal assistant, without sign-in. Name is required and phone is optional; neither is sent online.')}</Text>
    <Text style={s.label}>{L('الاسم', 'Name')}<Text style={s.red}> *</Text></Text><TextInput ref={nameRef} testID="guest-name" accessibilityLabel={L('الاسم', 'Name')} value={name} onChangeText={v => { setName(v); setField(''); }} maxLength={100} editable={!busy} style={[s.input, { textAlign: isRTL ? 'right' : 'left' }, field === 'name' && s.invalid]} />
    <Text style={s.label}>{L('الهاتف (اختياري)', 'Phone (optional)')}</Text><TextInput ref={phoneRef} testID="guest-phone" accessibilityLabel={L('الهاتف', 'Phone')} value={phone} onChangeText={v => { setPhone(v); setField(''); }} maxLength={30} editable={!busy} keyboardType="phone-pad" style={[s.input, { textAlign: 'left' }, field === 'phone' && s.invalid]} />
    <Text style={s.description}>{L('البيانات محلية وليست نسخة احتياطية سحابية. حذف التطبيق أو بيانات المتصفح قد يفقدها. يستطيع من يستخدم هذا الجهاز فتح مساحة الضيف.', 'Data is local, not a cloud backup. Uninstalling the app or clearing browser data may lose it. Anyone using this device can open its guest workspace.')}</Text>
    {error ? <Text accessibilityRole="alert" style={s.red}>{error}</Text> : null}
    <Pressable accessibilityRole="button" testID="guest-save" disabled={busy} style={s.primary} onPress={() => void save()}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{L('حفظ ومتابعة', 'Save and continue')}</Text>}</Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={s.quiet} onPress={onCancel}><Text style={s.red}>{L('إلغاء', 'Cancel')}</Text></Pressable>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
