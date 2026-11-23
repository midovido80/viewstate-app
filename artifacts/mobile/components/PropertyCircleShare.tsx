import { Feather } from '@expo/vector-icons';
import type { Property } from '@workspace/property-domain';
import * as Crypto from 'expo-crypto';
import { useReducedMotion } from 'react-native-reanimated';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Action, AlertNote, AssistantSheet, AssistantText } from '@/components/assistant/ui';
import { getAreaById } from '@/constants/kuwait-areas';
import { useI18n, type Translations } from '@/contexts/I18nContext';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { useUserData } from '@/contexts/UserDataContext';
import { useColors } from '@/hooks/useColors';
import { circlePropertyFacts, listTrustCircles, publishCircleProperty, type TrustCircle } from '@/services/circleMatchingApi';
import { getSavedPropertyTypeLabel } from '@/services/savedPropertyClassification';

type Result = 'shared' | 'unconfirmed';

export function PropertyCircleShare({ property, onClose }: { property: Property; onClose: () => void }) {
  const account = useRealAccount();
  const { store } = useUserData();
  const { language, t } = useI18n();
  const router = useRouter();
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const L = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [circles, setCircles] = useState<TrustCircle[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [propertyError, setPropertyError] = useState(false);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const operations = useRef(new Map<string, { payload: string; id: string }>());
  const latestAccount = useRef(account);
  latestAccount.current = account;

  useEffect(() => {
    const current = latestAccount.current;
    if (!current) return;
    let active = true;
    setLoadFailed(false);
    void listTrustCircles(current.request).then(value => {
      current.assertActive();
      if (active) setCircles(value);
    }).catch(() => {
      if (active) setLoadFailed(true);
    });
    return () => { active = false; };
  }, [account?.profile.user_id, reload]);

  const attempted = Object.keys(results).length > 0;
  const shared = selected.filter(id => results[id] === 'shared').length;
  const ready = Boolean(circles && selected.length && !busy && shared < selected.length);
  const submit = async () => {
    if (!account || !ready || flight.current) return;
    flight.current = true;
    setBusy(true);
    setPropertyError(false);
    try {
      account.assertActive();
      const fresh = await store.getProperty(property.core.id);
      const facts = fresh && circlePropertyFacts(fresh);
      if (!facts) {
        setPropertyError(true);
        return;
      }
      const payload = JSON.stringify(facts);
      const remaining = selected.filter(id => results[id] !== 'shared');
      const outcomes = await Promise.all(remaining.map(async id => {
        const previous = operations.current.get(id);
        const operation = previous?.payload === payload ? previous : { payload, id: Crypto.randomUUID() };
        operations.current.set(id, operation);
        try {
          account.assertActive();
          await publishCircleProperty(account.request, id, facts, operation.id);
          return [id, 'shared'] as const;
        } catch {
          return [id, 'unconfirmed'] as const;
        }
      }));
      setResults(current => ({ ...current, ...Object.fromEntries(outcomes) }));
    } catch {
      setPropertyError(true);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };

  const openRoute = (route: '/account/account' | '/trust-circle') => {
    onClose();
    router.push(route);
  };
  const area = getAreaById(property.core.locationArea.id);
  const type = getSavedPropertyTypeLabel(property, language, t(`propertyType.${property.core.propertyType}` as keyof Translations));
  const finished = selected.length > 0 && shared === selected.length;

  return <AssistantSheet title={L('مشاركة في دائرة الثقة', 'Share to Trust Circles')}
    onClose={onClose} busy={busy} bottom animationType={reducedMotion ? 'none' : 'slide'}
    footer={account && circles?.length ? <View style={{ flex: 1 }}>
      <Action label={finished ? L('تم', 'Done') : attempted ? L('إعادة المحاولة', 'Retry unconfirmed') : selected.length
        ? L(`مشاركة (${selected.length})`, `Share (${selected.length})`) : L('مشاركة', 'Share')}
        tone="primary" disabled={!finished && !ready} testID="circle-share-submit"
        onPress={finished ? onClose : () => void submit()} />
    </View> : undefined}>
    <View style={{ backgroundColor: colors.primary + '12', borderRadius: 14, padding: 12, gap: 2 }} testID="circle-share-property">
      <AssistantText muted size={12}>{L('العقار المحدد', 'Selected property')}</AssistantText>
      <AssistantText bold>{property.listingTitle?.trim() || type}</AssistantText>
      <AssistantText muted>{[property.listingTitle?.trim() ? type : '', area && (language === 'ar' ? area.ar : area.en)].filter(Boolean).join(' · ')}</AssistantText>
    </View>
    <AssistantText muted size={13}>{L(
      'تشارك الدوائر المختارة المواصفات العامة، مثل المنطقة والسعر والمساحة. الصور ومصدر العقار وبيانات التواصل والعنوان الدقيق والملاحظات الخاصة تظل خاصة.',
      'Selected circles can see public facts such as the area, price and size. Photos, source, contact details, exact address and private notes stay private.',
    )}</AssistantText>
    {!account ? <>
      <AssistantText>{L('فعّل حسابك علشان تقدر تشارك العقار مع دوائرك.', 'Activate your account to share this property with your circles.')}</AssistantText>
      <Action label={L('تفعيل حسابي', 'Activate my account')} tone="primary" onPress={() => openRoute('/account/account')} />
    </> : loadFailed ? <AlertNote retryLabel={L('إعادة المحاولة', 'Retry')} onRetry={() => setReload(value => value + 1)}>
      {L('تعذّر تحميل دوائرك.', 'Could not load your circles.')}
    </AlertNote> : !circles ? <ActivityIndicator accessibilityLabel={L('تحميل الدوائر', 'Loading circles')} color={colors.primary} />
      : !circles.length ? <>
        <AssistantText>{L('ما عندكش دوائر نشطة حاليًا.', 'You have no active circles yet.')}</AssistantText>
        <Action label={L('فتح دائرة الثقة', 'Open Trust Circle')} onPress={() => openRoute('/trust-circle')} />
      </> : <>
        <AssistantText bold>{attempted ? L('نتيجة المشاركة', 'Sharing results') : L('اختار دائرة واحدة أو أكثر', 'Choose one or more circles')}</AssistantText>
        {circles.filter(circle => !attempted || selected.includes(circle.id)).map(circle => {
          const checked = selected.includes(circle.id);
          const result = results[circle.id];
          const icon = result === 'shared' ? 'check-circle' : result === 'unconfirmed' ? 'alert-circle' : checked ? 'check-square' : 'square';
          const label = result === 'shared' ? L('تمت المشاركة', 'Shared') : result === 'unconfirmed' ? L('تعذّر تأكيد المشاركة', 'Sharing unconfirmed') : '';
          const rowStyle = { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
            borderWidth: 1, borderColor: checked && !attempted ? colors.primary : colors.border,
            backgroundColor: checked && !attempted ? colors.primary + '12' : colors.card,
            borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 };
          const content = <>
            <Feather name={icon} size={20} color={result === 'unconfirmed' ? colors.destructive : colors.primary} />
            <View style={{ flex: 1 }}><AssistantText bold>{circle.name}</AssistantText>
              {label ? <AssistantText size={12} muted>{label}</AssistantText> : null}</View>
          </>;
          return attempted ? <View key={circle.id} style={rowStyle} testID={`circle-share-result-${circle.id}`}>{content}</View>
            : <Pressable key={circle.id} style={rowStyle} accessibilityRole="checkbox" accessibilityLabel={circle.name}
              aria-checked={checked} accessibilityState={{ checked, disabled: busy }} disabled={busy} testID={`circle-share-choice-${circle.id}`}
              onPress={() => setSelected(current => current.includes(circle.id) ? current.filter(id => id !== circle.id) : [...current, circle.id])}>{content}</Pressable>;
        })}
      </>}
    {propertyError && <AlertNote>{L('تعذّر تجهيز العقار للمشاركة. راجع بياناته وحاول مرة تانية.', 'Could not prepare this property for sharing. Review its details and try again.')}</AlertNote>}
  </AssistantSheet>;
}
