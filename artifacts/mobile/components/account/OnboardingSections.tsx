import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { accountProvider, type AccountMethod } from '@/services/accountProvider';
import { AccountScreen, Badge, Body, Btn, Note, useL } from './ui';

function Progress({ pct }: { pct: number }) {
  const colors = useColors();
  return <View style={{ height: 4, backgroundColor: '#DCE7F4', borderRadius: 9, overflow: 'hidden', marginBottom: 16 }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.primary }} /></View>;
}

export function WelcomeSection() {
  const { L, fonts } = useL(); const colors = useColors(); const router = useRouter();
  return (
    <AccountScreen title={L('أهلًا بك في ViewState', 'Welcome to ViewState')} subtitle={L('عقاراتك وعلاقاتك وفرصك، في مكان واحد.', 'Your properties, people and opportunities together.')}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 68, height: 68, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginVertical: 14 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 26 }}>VS</Text>
        </View>
      </View>
      <Progress pct={25} />
      <Btn icon="smartphone" label={L('المتابعة برقم الهاتف', 'Continue with phone')} onPress={() => router.push('/account/phone' as never)} />
      <Btn kind="secondary" label={L('المتابعة باستخدام Google', 'Continue with Google')} onPress={() => router.push('/account/provider?method=google' as never)} />
      <Btn kind="secondary" label={L('المتابعة باستخدام Apple', 'Continue with Apple')} onPress={() => router.push('/account/provider?method=apple' as never)} />
      <Note>{L('تسجيل الدخول الحقيقي غير متاح بعد. هذه الشاشات توضيحية ولا تجمع أي بيانات دخول.', 'Real sign-in is not available yet. These screens are explanatory and collect no sign-in details.')}</Note>
      <Btn kind="quiet" icon="user" label={L('المتابعة بدون تسجيل — ملف محلي', 'Continue without sign-in — local profile')} onPress={() => router.push('/account/setup' as never)} />
    </AccountScreen>
  );
}

function Unavailable({ method }: { method: AccountMethod }) {
  const { L, row, fonts } = useL(); const colors = useColors(); const router = useRouter();
  const name = method === 'phone' ? L('رقم الهاتف', 'phone number') : method === 'google' ? 'Google' : 'Apple';
  return (
    <AccountScreen title={method === 'phone' ? L('الدخول برقم الهاتف', 'Sign in with phone') : L(`الدخول باستخدام ${name}`, `Sign in with ${name}`)}
      subtitle={L('غير متاح حاليًا', 'Currently unavailable')}>
      <Progress pct={50} />
      <View style={{ flexDirection: row, alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Feather name={method === 'phone' ? 'smartphone' : 'mail'} size={22} color={colors.primary} />
        <Text style={{ fontFamily: fonts.semiBold, color: colors.foreground, flex: 1 }}>{name}</Text>
        <Badge kind="off" text={accountProvider.configured ? L('غير مرتبط', 'Not connected') : L('غير متاح', 'Unavailable')} />
      </View>
      <Body>{method === 'phone'
        ? L('لم تُفعَّل خدمة رسائل تحقق بعد، لذلك لا نطلب رقمك ولا نرسل رمزًا.', 'No verification-SMS service is enabled yet, so we do not ask for your number or send a code.')
        : L(`لم تُفعَّل خدمة ${name} بعد، لذلك لا نفتح نافذة دخول ولا نطلب بريدًا أو كلمة مرور.`, `${name} sign-in is not enabled yet, so no sign-in window opens and no email or password is requested.`)}</Body>
      <Note>{L('عند تفعيل خدمة معتمدة ستتمكن من ربط وسيلة الدخول بحسابك. لن نعرض أي وسيلة على أنها موثّقة قبل ذلك.', 'Once an approved service is enabled you will be able to link this method. Nothing is shown as verified before then.')}</Note>
      <Btn label={L('المتابعة بدون تسجيل — ملف محلي', 'Continue without sign-in — local profile')} onPress={() => router.push('/account/setup' as never)} />
      <Btn kind="secondary" label={L('رجوع', 'Back')} onPress={() => router.back()} />
    </AccountScreen>
  );
}

export function PhoneSection() { return <Unavailable method="phone" />; }
export function ProviderSection({ method }: { method?: string }) {
  return <Unavailable method={method === 'apple' ? 'apple' : 'google'} />;
}
