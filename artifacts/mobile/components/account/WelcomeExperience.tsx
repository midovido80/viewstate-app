import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { ViewStateMark } from '@/components/brand/ViewStateBrand';

/** Only mounted for the existing first-use journey. No auth/session logic lives here. */
export function WelcomeExperience({ reducedMotion, onDone, busy, name }: { reducedMotion: boolean; onDone(): void; busy: boolean; name?: string }) {
  const { language, isRTL, fonts } = useI18n(), c = useColors(), ar = language === 'ar';
  const [systemReduced, setSystemReduced] = useState(true);
  const reveal = useRef(new Animated.Value(1)).current, pulse = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone); done.current = onDone;
  const completed = useRef(false);
  const finish = () => { if (busy || completed.current) return; completed.current = true; done.current(); };
  // If a persistence failure keeps the welcome mounted, the user can retry.
  useEffect(() => { if (!busy) completed.current = false; }, [busy]);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setSystemReduced(v); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    return () => { alive = false; sub.remove(); };
  }, []);
  useEffect(() => {
    if (reducedMotion || systemReduced) { reveal.setValue(1); pulse.setValue(0); return; }
    reveal.setValue(0);
    const entry = Animated.timing(reveal, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const breathe = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1350, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1350, useNativeDriver: true }),
    ]));
    entry.start(); breathe.start();
    return () => { entry.stop(); breathe.stop(); };
  }, [reducedMotion, systemReduced, reveal, pulse]);
  useEffect(() => {
    if (busy || reducedMotion || systemReduced) return;
    const timer = setTimeout(() => { if (AppState.currentState === 'active' || !AppState.currentState) finish(); }, 5200);
    return () => clearTimeout(timer);
  }, [busy, reducedMotion, systemReduced]);
  const text = { fontFamily: fonts.regular, color: c.mutedForeground, textAlign: 'center' as const };
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 20, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
      <Pressable disabled={busy} accessibilityRole="button" onPress={finish} style={{ alignSelf: 'flex-end', minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Text style={{ color: c.primary, fontFamily: fonts.semiBold }}>{ar ? 'تخطي' : 'Skip'}</Text><Feather name={isRTL ? 'chevrons-left' : 'chevrons-right'} size={20} color={c.primary} />
      </Pressable>
      <Animated.View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24, paddingVertical: 28, opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
        <View style={{ width: 214, height: 214, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={{ position: 'absolute', width: 202, height: 202, borderRadius: 101, borderWidth: 1, borderColor: '#D5E1FF', opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }] }} />
          <View style={{ width: 166, height: 166, borderRadius: 83, backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center' }}><ViewStateMark size={106} /></View>
        </View>
        <Text style={{ fontSize: 42, letterSpacing: -1.2, color: c.text, fontFamily: fonts.bold }}>ViewState</Text>
        {!!name && <Text style={[text, { fontFamily: fonts.medium, fontSize: 16 }]}>{ar ? `أهلًا، ${name}` : `Welcome, ${name}`}</Text>}
        <Text style={{ fontFamily: fonts.bold, color: c.text, fontSize: 25, lineHeight: 37, textAlign: 'center' }}>{ar ? 'عقاراتك. عملاؤك.\nفرصك القادمة.' : 'Your properties. Your clients.\nYour next opportunity.'}</Text>
        <Text style={[text, { fontSize: 15, lineHeight: 25 }]}>{ar ? 'نظّم عقاراتك وعملاءك، اكتشف أقرب المطابقات، وتابع مواعيدك من مكان واحد.' : 'Organize properties and clients, discover your closest matches, and keep every follow-up in one place.'}</Text>
        <View style={{ flexDirection: 'row', gap: 24 }}>{(['home', 'users', 'link'] as const).map(icon => <Feather key={icon} name={icon} size={22} color={c.primary} />)}</View>
      </Animated.View>
      <Pressable testID="account-welcome-start" accessibilityRole="button" disabled={busy} onPress={finish} style={({ pressed }) => ({ backgroundColor: c.primary, opacity: pressed || busy ? 0.7 : 1, borderRadius: 14, minHeight: 52, padding: 14, justifyContent: 'center', alignItems: 'center' })}>{busy ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontFamily: fonts.bold, fontSize: 16 }}>{ar ? 'ابدأ استخدام ViewState' : 'Start using ViewState'}</Text>}</Pressable>
    </ScrollView>
  </SafeAreaView>;
}
