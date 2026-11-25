import { Text } from "@/components/AppText";
import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { useI18n } from '@/contexts/I18nContext';
import { nextDesign as colors } from '@/constants/nextDesign';
import type { HomeQuickAction } from '@/services/assistantHome';
import { HomeTaskActions } from './home-task-actions';
import { AssistantSheet } from './ui';

export function HomeQuickAdd({ onAction, compact = false }: { onAction: (action: HomeQuickAction) => void; compact?: boolean }) {
  const { fonts, language } = useI18n();
  const { state: account } = useAccountFoundation();
  const trigger = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [systemReduced, setSystemReduced] = useState(true);
  const label = language === 'ar' ? 'إضافة' : 'Add';

  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      receivedChange = true;
      setSystemReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !receivedChange) setSystemReduced(value);
    }).catch(() => undefined);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  function close() {
    setVisible(false);
    if (Platform.OS === 'web') requestAnimationFrame(() => trigger.current?.focus());
  }

  return (
    <>
      <Pressable
        ref={trigger}
        testID="home-quick-add"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: visible }}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.trigger, compact && { flex: 0, minWidth: 48, minHeight: 44, paddingVertical: 4, borderWidth: 0, backgroundColor: 'transparent' }, pressed && styles.pressed]}
      >
        <View style={styles.icon} importantForAccessibility="no-hide-descendants"><Feather name="plus" size={23} color={colors.blue} /></View>
        {!compact && <Text style={[styles.label, { fontFamily: fonts.bold }]}>{label}</Text>}
      </Pressable>
      {visible && (
        <AssistantSheet
          title={language === 'ar' ? 'ماذا تريد أن تفعل؟' : 'What would you like to do?'}
          onClose={close}
          bottom
          animationType={systemReduced || account.reducedMotion ? 'none' : 'slide'}
        >
          <HomeTaskActions menu onAction={action => {
            setVisible(false);
            requestAnimationFrame(() => onAction(action));
          }} />
        </AssistantSheet>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flex: 1, minWidth: 0, minHeight: 68, gap: 2, paddingVertical: 7, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  pressed: { backgroundColor: colors.soft },
  icon: { width: 34, height: 30, borderRadius: 8, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.blue, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
