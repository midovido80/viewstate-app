import { Text } from "@/components/AppText";
import { useEffect, useRef, useState } from 'react';

import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  circleInviteToken,
  PENDING_CIRCLE_INVITE,
} from '@/services/circleInvitations';
import { circleRpc } from '@/services/circleMatchingApi';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { ImportWizardPage } from '@/components/ImportWizardPage';
import { TextInput } from '@/components/FormField';
import { Button } from '@/components/Button';
type Preview = {
  circleId: string;
  circleName: string;
  inviterName: string;
  expiresAt: string;
  alreadyMember: boolean;
};
export default function AcceptCircleInvite() {
  const params = useLocalSearchParams<{ token?: string }>(),
    account = useRealAccount(),
    router = useRouter();
  const { language, fonts, isRTL } = useI18n(),
    colors = useColors(),
    ar = language === 'ar';
  const [input, setInput] = useState(
    params.token === 'open' ? '' : (params.token ?? ''),
  );
  const [preview, setPreview] = useState<Preview | null>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const live = useRef(true),
    flight = useRef(false),
    attempt = useRef(0);
  const L = (a: string, e: string) => (ar ? a : e);
  const text = {
    color: colors.foreground,
    fontFamily: fonts.regular,
    textAlign: isRTL ? ('right' as const) : ('left' as const),
    lineHeight: 26,
  };
  const read = async () => {
    const token = circleInviteToken(input),
      turn = ++attempt.current;
    setError('');
    setPreview(undefined);
    if (!token) {
      setError(L('الصق رابط الدعوة الصحيح.', 'Paste a valid invitation link.'));
      return;
    }
    setBusy(true);
    try {
      await AsyncStorage.setItem(PENDING_CIRCLE_INVITE, token);
      if (!live.current || turn !== attempt.current || !account) return;
      const result = await circleRpc<Preview | null>(
        account.request,
        'vs_circle_invite_preview',
        { p_token: token },
      );
      if (live.current && turn === attempt.current) {
        setPreview(result);
        if (!result)
          setError(
            L(
              'الدعوة منتهية أو مستخدمة. اطلب دعوة جديدة من مسؤول الدائرة.',
              'Invitation expired or used. Ask for a new one.',
            ),
          );
      }
    } catch {
      if (live.current && turn === attempt.current)
        setError(
          L(
            'تعذّر تحميل الدعوة. أعد المحاولة.',
            'Could not load invitation. Retry.',
          ),
        );
    } finally {
      if (live.current && turn === attempt.current) setBusy(false);
    }
  };
  useEffect(() => {
    live.current = true;
    if (circleInviteToken(input)) void read();
    return () => {
      live.current = false;
      attempt.current++;
    };
  }, [account?.profile.user_id]);
  const close = () => {
    void AsyncStorage.removeItem(PENDING_CIRCLE_INVITE)
      .then(() => router.replace('/circle' as never))
      .catch(() =>
        setError(
          L(
            'تعذّر إغلاق الدعوة. أعد المحاولة.',
            'Could not close invitation. Retry.',
          ),
        ),
      );
  };
  const accept = async () => {
    const token = circleInviteToken(input);
    if (!account || !preview || !token || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      if (preview.alreadyMember) {
        await AsyncStorage.removeItem(PENDING_CIRCLE_INVITE);
        if (live.current)
          router.replace({
            pathname: '/trust-circle',
            params: { circleId: preview.circleId },
          } as never);
        return;
      }
      const id = await circleRpc<string>(
        account.request,
        'vs_circle_invite_accept',
        { p_token: token },
      );
      await AsyncStorage.removeItem(PENDING_CIRCLE_INVITE);
      if (live.current)
        router.replace({
          pathname: '/trust-circle',
          params: { circleId: id },
        } as never);
    } catch {
      if (live.current) {
        setPreview(undefined);
        setError(
          L(
            'تعذّر قبول الدعوة. يمكن انتهت أو تغيّرت صلاحيتها. راجعها مرة ثانية.',
            'Could not accept invitation. Review it again.',
          ),
        );
      }
    } finally {
      flight.current = false;
      if (live.current) setBusy(false);
    }
  };
  return (
    <ImportWizardPage
      title={L('دعوة لدائرة الثقة', 'Trust Circle invitation')}
      back={close}
      footer={
        <Button title={L('رجوع', 'Back')} variant="outline" onPress={close} />
      }
    >
      <Text style={text}>
        {L(
          'الصق رابط الدعوة، وراجع اسم صاحبها والدائرة قبل القبول.',
          'Paste the invitation and review the inviter and circle before accepting.',
        )}
      </Text>
      <TextInput
        accessibilityLabel={L('رابط الدعوة', 'Invitation link')}
        value={input}
        onChangeText={(value) => {
          attempt.current++;
          setInput(value);
          setPreview(undefined);
          setError('');
          setBusy(false);
        }}
        autoCapitalize="none"
        editable={!flight.current}
        multiline
        style={{
          ...text,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 12,
        }}
      />
      <Button
        title={L('مراجعة الدعوة', 'Review invitation')}
        loading={busy}
        onPress={() => void read()}
      />
      {!account && (
        <>
          <Text style={text}>
            {L(
              'سجّل الدخول بحسابك عشان تراجع الدعوة وتقبلها. الرابط ينحفظ لين ترجع.',
              'Sign in to review and accept. The link is retained until you return.',
            )}
          </Text>
          <Button
            title={L('تسجيل الدخول', 'Sign in')}
            onPress={() => {
              const token = circleInviteToken(input);
              if (token)
                void AsyncStorage.setItem(PENDING_CIRCLE_INVITE, token)
                  .then(() => router.push('/account/account'))
                  .catch(() =>
                    setError(
                      L(
                        'تعذّر حفظ رابط الدعوة. أعد المحاولة.',
                        'Could not retain invitation. Retry.',
                      ),
                    ),
                  );
              else
                setError(
                  L('الصق رابط الدعوة أولًا.', 'Paste the invitation first.'),
                );
            }}
          />
        </>
      )}
      {preview && (
        <>
          <Text style={{ ...text, fontFamily: fonts.bold, fontSize: 21 }}>
            {preview.inviterName}
          </Text>
          <Text style={text}>
            {L('يدعوك للانضمام إلى: ', 'Invites you to: ')}
            {preview.circleName}
          </Text>
          <Text style={text}>
            {L(
              'الانضمام ما يشارك عقاراتك تلقائيًا. تختار بنفسك العقار أو الطلب اللي تبي تشاركه.',
              'Joining does not automatically share your records. You choose what to share.',
            )}
          </Text>
          <Button
            title={
              preview.alreadyMember
                ? L('فتح الدائرة', 'Open circle')
                : L('قبول الدعوة والانضمام', 'Accept and join')
            }
            loading={busy}
            onPress={() => void accept()}
          />
        </>
      )}
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ ...text, color: colors.destructive }}
        >
          {error}
        </Text>
      )}
    </ImportWizardPage>
  );
}
