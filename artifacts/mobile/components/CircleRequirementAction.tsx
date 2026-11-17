import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { SeekerRequirement } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { CompactDropdown } from '@/components/FormChoices';
import { useI18n } from '@/contexts/I18nContext';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { useColors } from '@/hooks/useColors';
import { circleRpc, setCircleRequirementMatching } from '@/services/circleMatchingApi';

type CircleOption = { id: string; name: string; enabled?: boolean };
type Props =
  | { onSave: (circleId: string) => void; disabled: boolean; requirement?: never; unconfirmedCircle?: never }
  | { requirement: SeekerRequirement; unconfirmedCircle?: string; onSave?: never; disabled?: never };

export function CircleRequirementAction({ onSave, disabled, requirement, unconfirmedCircle }: Props) {
  const account = useRealAccount();
  const request = account?.request;
  const owner = account?.profile.user_id;
  const currentRequest = useRef(request);
  currentRequest.current = request;
  const { language, fonts, isRTL } = useI18n();
  const colors = useColors();
  const label = (en: string, ar: string) => language === 'ar' ? ar : en;
  const source = requirement?.id;
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [selection, setSelection] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(unconfirmedCircle);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const scope = useRef(0);
  const [ready, setReady] = useState(false);

  useFocusEffect(useCallback(() => {
    const generation = ++scope.current;
    setReady(false);
    setLoadFailed(false);
    setUpdateFailed(false);
    setBusy(false);
    flight.current = false;
    const request = currentRequest.current;
    if (request) {
      const load = source
        ? circleRpc<CircleOption[]>(request, 'vs_circle_requirement_status', { p_source: source })
        : circleRpc<CircleOption[]>(request, 'vs_circle_list');
      void load.then(rows => {
        if (scope.current !== generation) return;
        setCircles(rows);
        setReady(true);
      }).catch(() => {
        if (scope.current === generation) setLoadFailed(true);
      });
    }
    return () => { scope.current++; };
  }, [owner, source, attempt]));

  if (!request) return null;
  const selected = circles.find(circle => circle.id === selection)
    ?? circles.find(circle => circle.id === pendingConfirmation)
    ?? (requirement ? circles.find(circle => circle.enabled) : undefined)
    ?? (circles.length === 1 ? circles[0] : undefined);
  const retry = () => setAttempt(value => value + 1);
  const enable = !selected?.enabled;

  const change = async () => {
    if (!selected || flight.current || disabled) return;
    if (onSave) {
      onSave(selected.id);
      return;
    }
    flight.current = true;
    setBusy(true);
    setUpdateFailed(false);
    const generation = scope.current;
    try {
      await setCircleRequirementMatching(request, selected.id, requirement, enable);
      if (scope.current !== generation) return;
      setCircles(rows => rows.map(circle => circle.id === selected.id ? { ...circle, enabled: enable } : circle));
      if (selected.id === pendingConfirmation) setPendingConfirmation(undefined);
    } catch {
      if (scope.current === generation) setUpdateFailed(true);
    } finally {
      if (scope.current === generation) {
        flight.current = false;
        setBusy(false);
      }
    }
  };

  const noteStyle = {
    color: colors.mutedForeground,
    fontFamily: fonts.regular,
    textAlign: isRTL ? 'right' as const : 'left' as const,
  };
  const unconfirmed = pendingConfirmation && !circles.some(circle => circle.id === pendingConfirmation && circle.enabled);
  if (loadFailed) return <View style={{ gap: 6 }}>
    {pendingConfirmation && <Text accessibilityLiveRegion="polite" style={noteStyle}>{label('Request saved. Matching could not be confirmed.', 'الطلب محفوظ. تعذّر تأكيد تشغيل المطابقة.')}</Text>}
    <Button title={label('Retry loading Trust Circles', 'أعد تحميل دوائر الثقة')} onPress={retry} disabled={disabled} variant="outline" />
  </View>;
  if (!ready || (!circles.length && !pendingConfirmation)) return null;

  return <View style={{ gap: 6 }}>
    {circles.length > 1 && <CompactDropdown label={selected?.name ?? label('Choose a Trust Circle', 'اختر دائرة الثقة')}
      testID="requirement-circle-picker" options={circles.map(circle => ({
        value: circle.id, label: circle.name, selected: circle.id === selected?.id,
        onPress: () => { if (!busy && !disabled) setSelection(circle.id); },
      }))} />}
    {unconfirmed && <Text accessibilityLiveRegion="polite" style={noteStyle}>
      {label('Request saved. Matching has not started in the selected circle.', 'الطلب محفوظ. المطابقة لم تبدأ في الدائرة المختارة.')}
    </Text>}
    {!enable && <Text accessibilityLiveRegion="polite" style={noteStyle}>
      {label(`Matching is on · ${selected?.name}`, `المطابقة مفعّلة · ${selected?.name}`)}
    </Text>}
    {updateFailed && <Text accessibilityLiveRegion="polite" style={noteStyle}>
      {label('Could not confirm the change. Try again.', 'تعذّر تأكيد التغيير. حاول مرة أخرى.')}
    </Text>}
    {circles.length > 0 && <Button variant="outline" loading={busy} disabled={disabled || !selected}
      testID={onSave ? 'requirement-save-circle-match' : enable ? 'requirement-circle-match' : 'requirement-circle-stop'}
      title={onSave
        ? selected ? label(`Save and match · ${selected.name}`, `حفظ ومطابقة · ${selected.name}`) : label('Save and match in Trust Circle', 'حفظ ومطابقة في دائرة الثقة')
        : !enable ? label('Stop matching', 'إيقاف المطابقة')
          : selected?.id === pendingConfirmation ? label('Retry matching', 'أعد محاولة المطابقة')
            : label('Match in Trust Circle', 'طابق في دائرة الثقة')}
      onPress={() => void change()} />}
    {enable && circles.length > 0 && <Text style={noteStyle}>
      {label('Matching uses the request criteria. The client’s name and phone stay private.', 'المطابقة تستخدم مواصفات الطلب. اسم العميل ورقم تليفونه يفضلوا عندك.')}
    </Text>}
  </View>;
}
