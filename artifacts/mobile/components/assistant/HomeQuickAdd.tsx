import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import type { HomeQuickAction } from '@/services/assistantHome';
import { useAssistantUI } from './ui';
import { assistantTone as c } from './styles';
const positions: readonly [HomeQuickAction, React.ComponentProps<typeof Feather>['name'], number, number][] = [
  ['person', 'user-plus', 0, -110], ['property', 'home', 105, -34], ['import', 'download', 65, 89], ['share', 'share-2', -65, 89], ['matching', 'target', -105, -34],
];
export function HomeQuickAdd({ label, closeLabel, labels, onAction }: { label: string; closeLabel: string; labels: Record<HomeQuickAction, string>; onAction: (action: HomeQuickAction) => void }) {
  const { fonts } = useAssistantUI(), { width, height } = useWindowDimensions(), insets = useScreenInsets();
  const { state: account } = useAccountFoundation();
  const trigger = useRef<View>(null), motion = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false), [reduced, setReduced] = useState(true), [center, setCenter] = useState({ x: width / 2, y: height / 2 });
  useEffect(() => { let active = true; void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced); return () => { active = false; listener.remove(); }; }, []);
  useEffect(() => { if (!visible) { motion.stopAnimation(); motion.setValue(0); return; }
    const animation = Animated.timing(motion, { toValue: 1, duration: reduced || account.reducedMotion ? 0 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start(); return () => animation.stop(); }, [visible, reduced, account.reducedMotion, motion]);
  useEffect(() => { setVisible(false); }, [width, height]);
  function close() { setVisible(false); if (Platform.OS === 'web') trigger.current?.focus(); }
  function open() { trigger.current?.measureInWindow((x, y, w, h) => {
    setCenter({ x: Math.max(145, Math.min(x + w / 2, width - 145)), y: Math.max(insets.top + 150, Math.min(y + h / 2, height - insets.bottom - 150)) }); setVisible(true);
  }); }
  return <View style={q.stage}><Pressable ref={trigger} testID="home-quick-add" accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: visible }} onPress={open} style={q.trigger}><Feather name="plus" size={31} color="white" /></Pressable><Text style={[q.caption, { fontFamily: fonts.regular }]}>{label}</Text>
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: '#142D5066' }]} onPress={close} accessibilityRole="button" accessibilityLabel={closeLabel} />
        {positions.map(([key, icon, x, y]) => <Animated.View key={key} style={[q.petal, { left: center.x - 38, top: center.y - 44, opacity: motion, transform: [
          { translateX: motion.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) }, { translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [0, y] }) }, { scale: motion.interpolate({ inputRange: [0, 1], outputRange: [.25, 1] }) },
        ] }]}><Pressable testID={`home-quick-${key}`} accessibilityRole="button" accessibilityLabel={labels[key]} style={q.petalAction} onPress={() => { close(); requestAnimationFrame(() => onAction(key)); }}><Feather name={icon} color={c.blue} size={23} /><Text style={[q.petalLabel, { fontFamily: fonts.semiBold }]}>{labels[key]}</Text></Pressable></Animated.View>)}
        <Pressable style={[q.trigger, { position: 'absolute', left: center.x - 31, top: center.y - 31, backgroundColor: c.navy }]} accessibilityRole="button" accessibilityLabel={closeLabel} onPress={close}><Feather name="x" color="white" size={27} /></Pressable>
      </View>
    </Modal>
  </View>;
}
const q = StyleSheet.create({ stage: { height: 97, alignItems: 'center', justifyContent: 'center', gap: 5 }, trigger: { width: 62, height: 62, borderRadius: 31, backgroundColor: c.blue, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 12, color: c.muted }, petal: { position: 'absolute', width: 76, height: 72, borderRadius: 26, backgroundColor: 'white', elevation: 6, shadowColor: '#142D50', shadowOpacity: .15, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  petalAction: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 4 }, petalLabel: { fontSize: 13, color: c.blue, textAlign: 'center' },
});
