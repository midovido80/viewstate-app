import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import { CircleMatchingPanel } from '@/components/CircleMatchingPanel';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PrimaryTabHeader } from '@/components/PrimaryTabHeader';
import { useI18n } from '@/contexts/I18nContext';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { useUserData } from '@/contexts/UserDataContext';
import { useColors } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';

export default function TrustCircleScreen() {
  const { language, fonts, isRTL } = useI18n();
  const L = (ar: string, en: string) => language === 'ar' ? ar : en;
  const colors = useColors();
  const router = useRouter();
  const { requestId, propertyId, circleId, noticeKind, noticeTargetId } = useLocalSearchParams<{ requestId?: string; propertyId?: string; circleId?: string; noticeKind?: string; noticeTargetId?: string }>();
  const initialMatch = typeof requestId === 'string' ? { kind: 'request' as const, id: requestId }
    : typeof propertyId === 'string' ? { kind: 'property' as const, id: propertyId } : undefined;
  const insets = useScreenInsets();
  const account = useRealAccount();
  const { store } = useUserData();
  const [data, setData] = useState<{ properties: Property[]; requirements: SeekerRequirement[] }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const owner = account?.profile.user_id;
  useFocusEffect(useCallback(() => {
    if (!owner) return;
    let active = true;
    setFailed(false);
    void Promise.all([store.getProperties(), store.getRequirements()]).then(([properties, requirements]) => {
      if (active) setData({ properties, requirements });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [store, owner, attempt]));

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <PrimaryTabHeader title={L('دائرة الثقة', 'Trust Circle')} compactSearch />
    <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }} bottomOffset={24}>
      {!account ? <>
        <Text style={{ color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>
          {L('سجّل الدخول بحساب Google عشان تشارك العقارات وتتعاون مع بروكرز تثق فيهم.', 'Sign in with Google to share listings and collaborate with brokers you trust.')}
        </Text>
        <Button title={L('تفعيل حسابي', 'Activate my account')} onPress={() => router.push('/account/account')} />
      </> : failed ? <Button title={L('تعذّر تحميل البيانات. أعد المحاولة', 'Could not load your records. Retry')} onPress={() => setAttempt(value => value + 1)} />
      : data ? <CircleMatchingPanel key={noticeTargetId ?? initialMatch?.id ?? circleId ?? owner} noticeKind={noticeKind} noticeTargetId={noticeTargetId} initialCircleId={typeof circleId === 'string' ? circleId : undefined} initialMatch={initialMatch} request={account.request} owner={account.profile.user_id} properties={data.properties} requirements={data.requirements} />
      : <ActivityIndicator color={colors.primary} />}
    </KeyboardAwareScrollViewCompat>
  </View>;
}
