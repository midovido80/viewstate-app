import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, { interpolate, Extrapolation, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useI18n } from '@/contexts/I18nContext';
import { timeFromParts, timeParts, type ClockFormat } from '@/services/followupTime';
import { assistantTone as c } from './styles';
import { AssistantText as Txt } from './ui';

function WheelRow({ label, index, offset, size, onPress, font }: { label: string; index: number; offset: ReturnType<typeof useSharedValue<number>>; size: number; onPress: () => void; font: string }) {
  const motion = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(offset.get() / size - index), [0, 1, 2], [1, .42, .2], Extrapolation.CLAMP) }));
  return <Animated.View style={[{ height: size }, motion]}><Pressable accessible={false} onPress={onPress} style={{ height: size, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.ink, fontSize: 23, fontFamily: font, fontVariant: ['tabular-nums'] }}>{label}</Text></Pressable></Animated.View>;
}
function Wheel({ label, values, index, onSelect, onBusy }: { label: string; values: string[]; index: number; onSelect: (n: number) => void; onBusy: (v: boolean) => void }) {
  const { fonts } = useI18n(), { fontScale } = useWindowDimensions(), reduced = useReducedMotion();
  const size = Math.max(48, Math.ceil(32 * fontScale)), offset = useSharedValue(index * size);
  const ref = useRef<React.ComponentRef<typeof Animated.ScrollView>>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = useRef(index), finishRef = useRef<() => void>(() => {});
  selected.current = index;
  function clear() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
  function finish() { clear(); const n = Math.max(0, Math.min(values.length - 1, Math.round(offset.get() / size))); ref.current?.scrollTo({ y: n * size, animated: !reduced && Platform.OS !== 'web' }); onSelect(n); onBusy(false); }
  finishRef.current = finish;
  function begin() { clear(); onBusy(true); }
  function release() { clear(); timer.current = setTimeout(() => finishRef.current(), 120); }
  const handler = useAnimatedScrollHandler({
    onScroll: e => { offset.set(e.contentOffset.y); },
    onBeginDrag: () => { scheduleOnRN(begin); },
    onEndDrag: () => { scheduleOnRN(release); },
    onMomentumBegin: () => { scheduleOnRN(begin); },
    onMomentumEnd: e => { offset.set(e.contentOffset.y); scheduleOnRN(finish); },
  });
  useEffect(() => { if (Math.abs(offset.get() - index * size) > .5) { ref.current?.scrollTo({ y: index * size, animated: false }); offset.set(index * size); } }, [index, size]);
  useEffect(() => () => { clear(); }, []);
  function choose(n: number) { clear(); offset.set(n * size); ref.current?.scrollTo({ y: n * size, animated: !reduced && Platform.OS !== 'web' }); onSelect(n); onBusy(false); }
  return <View style={{ flex: 1, minWidth: 60, gap: 4 }}><Txt center muted size={12}>{label}</Txt>
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: values.length - 1, now: index, text: values[index] }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => choose(Math.max(0, Math.min(values.length - 1, selected.current + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))} style={{ height: size * 3, overflow: 'hidden', borderRadius: 12, backgroundColor: c.neutral }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: size, left: 0, right: 0, height: size, backgroundColor: c.pale, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#D3DFFF' }} />
      <Animated.ScrollView ref={ref} onScroll={Platform.OS === 'web' ? e => { offset.set(e.nativeEvent.contentOffset.y); if (!timer.current) onBusy(true); release(); } : handler} scrollEventThrottle={16} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={size} decelerationRate="fast" bounces={false} contentOffset={{ x: 0, y: index * size }} contentContainerStyle={{ paddingVertical: size }}>
        {values.map((v, i) => <WheelRow key={v} label={v} index={i} offset={offset} size={size} onPress={() => choose(i)} font={fonts.semiBold} />)}
      </Animated.ScrollView>
    </View></View>;
}
export function FollowupTimePicker({ value, onChange, format, onFormatChange, onBusy }: { value: string; onChange: (v: string) => void; format: ClockFormat; onFormatChange: (v: ClockFormat) => void; onBusy: (v: boolean) => void }) {
  const { language } = useI18n(), ar = language === 'ar', p = timeParts(value, format);
  const [moving, setMoving] = useState<Record<string, boolean>>({});
  const movingRef = useRef(moving); movingRef.current = moving;
  const valueRef = useRef(value); valueRef.current = value;
  function select(part: 'hour' | 'minute' | 'period', n: number) { const current = timeParts(valueRef.current, format); const next = timeFromParts(part === 'hour' ? n : current.hour, part === 'minute' ? n : current.minute, format, part === 'period' ? n : current.period); valueRef.current = next; onChange(next); }
  function busy(name: string, v: boolean) { const next = { ...movingRef.current, [name]: v }; movingRef.current = next; setMoving(next); onBusy(Object.values(next).some(Boolean)); }
  const hours = Array.from({ length: format === 12 ? 12 : 24 }, (_, i) => String(format === 12 ? i + 1 : i).padStart(2, '0'));
  return <View style={{ gap: 12 }}><Txt bold>{ar ? 'الساعة' : 'Time'}</Txt>
    <View style={{ flexDirection: 'row', gap: 8 }}>{([12, 24] as const).map(f => <Pressable key={f} disabled={Object.values(moving).some(Boolean)} accessibilityRole="button" accessibilityState={{ selected: format === f }} onPress={() => onFormatChange(f)} style={{ flex: 1, minHeight: 48, justifyContent: 'center', borderRadius: 10, backgroundColor: format === f ? c.blue : c.neutral }}><Txt center color={format === f ? '#FFFFFF' : c.ink}>{ar ? `${f} ساعة` : `${f}-hour`}</Txt></Pressable>)}</View>
    <View key={format} style={{ flexDirection: 'row', direction: 'ltr', gap: 8 }}>
      <Wheel label={ar ? 'الساعة' : 'Hour'} values={hours} index={format === 12 ? p.hour - 1 : p.hour} onSelect={i => select('hour', format === 12 ? i + 1 : i)} onBusy={v => busy('hour', v)} />
      <Wheel label={ar ? 'الدقيقة' : 'Minute'} values={Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))} index={p.minute} onSelect={i => select('minute', i)} onBusy={v => busy('minute', v)} />
      {format === 12 && <Wheel label={ar ? 'الفترة' : 'Period'} values={ar ? ['صباحًا', 'مساءً'] : ['AM', 'PM']} index={p.period} onSelect={i => select('period', i)} onBusy={v => busy('period', v)} />}
    </View>
  </View>;
}
