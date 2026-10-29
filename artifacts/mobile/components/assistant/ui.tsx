import React from 'react';
import { View, Text, Pressable, Modal, KeyboardAvoidingView, Platform, ScrollView, TextInput, ActivityIndicator, type TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/contexts/I18nContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { s, assistantTone as c } from './styles';
export function useAssistantUI() {
  const { isRTL, fonts } = useI18n();
  return { fonts, row: isRTL ? 'row-reverse' as const : 'row' as const, align: isRTL ? 'right' as const : 'left' as const };
}
export function CountBadge({ count, label }: { count: number; label?: string }) {
  const { fonts } = useAssistantUI();
  return <View accessibilityLabel={label ?? String(count)} style={[s.badge, !count && s.badgeZero]}><Text style={[s.badgeText, { fontFamily: fonts.semiBold, color: count ? '#FFFFFF' : c.red }]}>{count}</Text></View>;
}
export function Action({ label, onPress, icon, tone = 'secondary', disabled, testID }: { label: string; onPress: () => void; icon?: React.ComponentProps<typeof Feather>['name']; tone?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'success'; disabled?: boolean; testID?: string }) {
  const { fonts, row } = useAssistantUI();
  const color = tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? c.red : tone === 'success' ? c.green : tone === 'quiet' ? c.ink : c.blue;
  const backgroundColor = tone === 'primary' ? c.blue : tone === 'danger' ? c.redBg : tone === 'success' ? c.greenBg : tone === 'quiet' ? c.neutral : c.pale;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, { flexDirection: row, backgroundColor, opacity: disabled ? .45 : pressed ? .75 : 1 }]}>
    {icon && <Feather name={icon} size={17} color={color} />}<Text style={[s.buttonText, { color, fontFamily: fonts.semiBold, flexShrink: 1 }]}>{label}</Text>
  </Pressable>;
}
export function AssistantText({ children, muted, bold, size = 14, color, center }: { children: React.ReactNode; muted?: boolean; bold?: boolean; size?: number; color?: string; center?: boolean }) {
  const { fonts, align } = useAssistantUI();
  return <Text style={{ color: color ?? (muted ? c.muted : c.ink), fontFamily: bold ? fonts.semiBold : fonts.regular, fontSize: size, lineHeight: size * 1.55, textAlign: center ? 'center' : align, flexShrink: 1 }}>{children}</Text>;
}
export function AssistantField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const { fonts, align } = useAssistantUI();
  return <View style={s.field}><Text style={[s.label, { fontFamily: fonts.semiBold, textAlign: align }]}>{label}</Text><TextInput {...props} accessibilityLabel={label}
    placeholderTextColor={c.muted} style={[s.input, { fontFamily: fonts.regular, textAlign: align }, !!error && { borderColor: c.red, backgroundColor: c.redBg },
      props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} />{error ? <AssistantText color={c.red} size={13}>{error}</AssistantText> : null}</View>;
}
export function AlertNote({ children, onRetry, retryLabel }: { children: React.ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return <View accessibilityRole="alert" style={s.alert}><AssistantText color={c.red}>{children}</AssistantText>{onRetry && <Action label={retryLabel ?? ''} onPress={onRetry} tone="danger" />}</View>;
}
export function AssistantSheet({ title, onClose, children, footer, busy }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; busy?: boolean }) {
  const insets = useScreenInsets(), { row, fonts, align } = useAssistantUI();
  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={busy ? () => undefined : onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      style={[s.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Pressable accessibilityLabel={title} accessibilityRole="button" disabled={busy} onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
      <View accessibilityViewIsModal style={s.sheet}>
        <View style={[s.sheetHeader, { flexDirection: row }]}><Text accessibilityRole="header" style={[s.sectionTitle, s.grow, { fontFamily: fonts.bold, textAlign: align }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={align === 'right' ? 'إغلاق' : 'Close'} disabled={busy} style={s.iconButton} onPress={onClose}><Feather name="x" color={c.ink} size={23} /></Pressable></View>
        <ScrollView style={s.sheetBody} keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent} bounces={false}>{children}</ScrollView>
        {footer ? <View style={[s.sheetFooter, { flexDirection: row }]}>{busy && <ActivityIndicator color={c.blue} />}{footer}</View> : null}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
