import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useI18n } from '@/contexts/I18nContext';
import { clockParts, storedClockTime } from '@/services/followupEditor';
import { Action, AssistantText as Txt } from './ui';
import { assistantTone as c, s } from './styles';

/** No keyboard or native module required. Cancel leaves the caller's value untouched. */
export function AssistantClockPicker({ value, onConfirm, onCancel, optional }: { value: string; onConfirm: (time: string) => void; onCancel: () => void; optional: boolean }) {
  const { language } = useI18n(), ar = language === 'ar';
  const initial = clockParts(value);
  const [hour, setHour] = useState(initial.hour), [minute, setMinute] = useState(initial.minute), [period, setPeriod] = useState(initial.period);
  const [part, setPart] = useState<'hour' | 'minute'>('hour');
  const periodLabel = (v: 'AM' | 'PM') => ar ? v === 'AM' ? 'صباحًا' : 'مساءً' : v;
  const number = (v: number) => String(v).padStart(2, '0');
  return <View style={{ gap: 14 }} testID="followup-clock">
    <View style={{ flexDirection: 'row', direction: 'ltr', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
      <Action label={number(hour)} onPress={() => setPart('hour')} tone={part === 'hour' ? 'primary' : 'quiet'} />
      <Txt bold size={22}>:</Txt><Action label={number(minute)} onPress={() => setPart('minute')} tone={part === 'minute' ? 'primary' : 'quiet'} />
      <Txt bold>{periodLabel(period)}</Txt>
    </View>
    <Txt center muted>{ar ? part === 'hour' ? 'اختر الساعة' : 'اختر الدقائق' : part === 'hour' ? 'Choose hour' : 'Choose minutes'}</Txt>
    <View style={{ width: 240, height: 240, alignSelf: 'center', borderRadius: 120, backgroundColor: c.pale, direction: 'ltr' }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 119, top: 26, width: 2, height: 188, transform: [{ rotate: `${part === 'hour' ? (hour % 12) * 30 : minute * 6}deg` }] }}><View style={{ height: 94, width: 2, backgroundColor: c.blue }} /></View>
      {Array.from({ length: 12 }, (_, i) => {
        const v = part === 'hour' ? i || 12 : i * 5;
        const selected = part === 'hour' ? hour === v : minute === v;
        const angle = i * Math.PI / 6;
        return <Pressable key={i} testID={`clock-${part}-${v}`} accessibilityRole="button" accessibilityLabel={(part === 'hour' ? ar ? 'الساعة ' : 'Hour ' : ar ? 'الدقيقة ' : 'Minute ') + v} accessibilityState={{ selected }}
          onPress={() => { if (part === 'hour') { setHour(v); setPart('minute'); } else setMinute(v); }}
          style={{ position: 'absolute', left: 96 + Math.sin(angle) * 94, top: 96 - Math.cos(angle) * 94, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? c.blue : 'transparent' }}>
          <Txt bold color={selected ? '#FFFFFF' : c.ink}>{part === 'minute' ? number(v) : v}</Txt>
        </Pressable>;
      })}
      <View pointerEvents="none" style={{ position: 'absolute', left: 116, top: 116, width: 8, height: 8, borderRadius: 4, backgroundColor: c.blue }} />
    </View>
    {part === 'minute' && <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
      <Action label={ar ? 'ناقص دقيقة' : '−1 minute'} tone="quiet" onPress={() => setMinute(v => (v + 59) % 60)} />
      <Action label={ar ? 'زائد دقيقة' : '+1 minute'} tone="quiet" onPress={() => setMinute(v => (v + 1) % 60)} />
    </View>}
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>{(['AM', 'PM'] as const).map(v => <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: period === v }} style={[s.choice, period === v && { backgroundColor: c.pale, borderColor: c.blue }, { minHeight: 48 }]} onPress={() => setPeriod(v)}><Txt bold>{periodLabel(v)}</Txt></Pressable>)}</View>
    <Action label={ar ? 'تأكيد الوقت' : 'Set time'} tone="primary" onPress={() => onConfirm(storedClockTime(hour, minute, period))} />
    {optional && <Action label={ar ? 'بدون وقت محدد' : 'No specific time'} tone="quiet" onPress={() => onConfirm('')} />}
    <Action label={ar ? 'رجوع' : 'Back'} tone="quiet" onPress={onCancel} />
  </View>;
}
