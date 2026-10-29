import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Switch, TextInput, ActivityIndicator, Image, ScrollView, Platform, KeyboardAvoidingView, type TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';

/** Reference palette tones derived from tokens (navy = accent, blue = primary). */
export const tone = {
  heroBg: '#EDF4FF', line: '#E1E8F0', rowLine: '#EDF1F6', noteBg: '#EDF3FC', warnBg: '#FFF5DE', warnText: '#955C16',
  dangerBg: '#FFF7F7', dangerLine: '#F0CCCC', badgeBg: '#E9F8EF', badgeText: '#208154', greyBg: '#EEF1F5', greyText: '#5B6878',
  avatarBg: '#D6E6FF', secondaryLine: '#CAD9ED', inputLine: '#CFDBE8', paper: '#F4F7FB',
};

export function useL() {
  const { language, isRTL, fonts } = useI18n();
  const L = (ar: string, en: string) => (language === 'ar' ? ar : en);
  return { L, language, isRTL, fonts, row: (isRTL ? 'row-reverse' : 'row') as 'row' | 'row-reverse', align: (isRTL ? 'right' : 'left') as 'right' | 'left' };
}

type IconName = React.ComponentProps<typeof Feather>['name'];

export function AccountHeader({ title, onBack, root }: { title: string; onBack?: () => void; root?: boolean }) {
  const colors = useColors(); const insets = useScreenInsets(); const router = useRouter();
  const { L, isRTL, fonts, row } = useL();
  return (
    <View style={[s.header, { backgroundColor: colors.accent, paddingTop: insets.top + 6, flexDirection: row }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={root ? L('الرئيسية', 'Home') : L('رجوع', 'Back')} onPress={root ? () => router.replace('/') : onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more' as never)))} style={s.iconBtn} testID="account-back">
        <Feather name={root ? 'home' : isRTL ? 'chevron-right' : 'chevron-left'} size={24} color="#FFFFFF" />
      </Pressable>
      <Text numberOfLines={1} style={[s.headerTitle, { fontFamily: fonts.bold }]}>{title}</Text>
      <View style={s.iconBtnSpacer} />
    </View>
  );
}

export function AccountScreen({ title, subtitle, children, onBack, footer }: { title: string; subtitle?: string; children: React.ReactNode; onBack?: () => void; footer?: React.ReactNode }) {
  const colors = useColors(); const insets = useScreenInsets(); const { fonts, align } = useL();
  return (
    <View style={{ flex: 1, backgroundColor: tone.paper }}>
      <AccountHeader title={title} onBack={onBack} />
      <ReadyBanner />
      <KeyboardAwareScrollViewCompat bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: footer ? 24 : insets.bottom + 24 }}>
        <Text style={[s.h2, { color: colors.accent, fontFamily: fonts.bold, textAlign: align }]}>{title}</Text>
        {subtitle ? <Text style={[s.sub, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: align }]}>{subtitle}</Text> : null}
        {children}
      </KeyboardAwareScrollViewCompat>
      {footer ? <View style={[s.footer, { paddingBottom: insets.bottom, borderColor: tone.line }]}>{footer}</View> : null}
    </View>
  );
}

export function ReadyBanner() {
  const { ready, error, reload } = useAccountFoundation(); const { L, fonts, row, align } = useL(); const colors = useColors();
  if (ready && !error) return null;
  if (!ready && !error) return <View style={[s.banner, { backgroundColor: tone.noteBg }]}><ActivityIndicator color={colors.primary} /><Text style={[s.bannerText, { fontFamily: fonts.medium, color: colors.accent }]}>{L('جارٍ تحميل الإعدادات المحلية…', 'Loading local settings…')}</Text></View>;
  const loadFail = error === 'load';
  return (
    <View style={[s.banner, { backgroundColor: tone.warnBg, flexDirection: row }]} accessibilityRole="alert">
      <Feather name="alert-triangle" size={18} color={tone.warnText} />
      <Text style={[s.bannerText, { fontFamily: fonts.medium, color: tone.warnText, textAlign: align }]}>
        {loadFail ? L('تعذّر تحميل الملف الشخصي والإعدادات المحلية. البيانات المخزنة لم تُستبدل. التعديل متوقف حتى إعادة المحاولة.', 'Could not load local profile and settings. Stored data was not overwritten. Editing is paused until retry.')
          : L('تعذّر حفظ آخر تغيير على هذا الجهاز. لم يُطبَّق التغيير.', 'The last change could not be saved on this device. It was not applied.')}
      </Text>
      {loadFail ? <Pressable onPress={() => void reload()} accessibilityRole="button" style={s.retry}><Text style={{ color: colors.primary, fontFamily: fonts.bold }}>{L('إعادة المحاولة', 'Retry')}</Text></Pressable> : null}
    </View>
  );
}

/** Writes are allowed only when local settings loaded successfully. */
export function useCanWrite() { const { ready, busy, error } = useAccountFoundation(); return { canWrite: ready && error !== 'load' && !busy, busy }; }

export function SectionLabel({ children }: { children: string }) {
  const colors = useColors(); const { fonts, align } = useL();
  return <Text style={[s.label, { color: colors.mutedForeground, fontFamily: fonts.semiBold, textAlign: align }]}>{children}</Text>;
}

export function Card({ children, hero, padded }: { children: React.ReactNode; hero?: boolean; padded?: boolean }) {
  return <View style={[s.card, hero && { backgroundColor: tone.heroBg }, padded && { padding: 16 }]}>{children}</View>;
}

export function Badge({ text, kind = 'ok' }: { text: string; kind?: 'ok' | 'off' | 'warn' }) {
  const { fonts } = useL();
  const c = kind === 'ok' ? [tone.badgeBg, tone.badgeText] : kind === 'warn' ? [tone.warnBg, tone.warnText] : [tone.greyBg, tone.greyText];
  return <View style={[s.badge, { backgroundColor: c[0] }]}><Text style={{ color: c[1], fontSize: 10.5, fontFamily: fonts.semiBold }}>{text}</Text></View>;
}

export function Row({ icon, title, sub, onPress, right, first, disabled, testID }: { icon?: IconName; title: string; sub?: string; onPress?: () => void; right?: React.ReactNode; first?: boolean; disabled?: boolean; testID?: string }) {
  const colors = useColors(); const { fonts, row, align, isRTL } = useL();
  const body = (
    <>
      {icon ? <View style={s.ico}><Feather name={icon} size={20} color={colors.primary} /></View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: align }]}>{title}</Text>
        {sub ? <Text style={[s.rowSub, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: align }]}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color="#8DA0B6" /> : null)}
    </>
  );
  const style = [s.row, { flexDirection: row }, !first && { borderTopWidth: 1, borderTopColor: tone.rowLine }];
  if (!onPress) return <View style={style}>{body}</View>;
  return <Pressable testID={testID} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} style={({ pressed }) => [...style, pressed && { backgroundColor: '#F7FAFF' }, disabled && { opacity: 0.45 }]}>{body}</Pressable>;
}

export function ToggleRow({ title, sub, value, onChange, disabled, first }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; first?: boolean }) {
  const colors = useColors();
  return <Row first={first} title={title} sub={sub} right={<Switch accessibilityLabel={title} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.primary, false: '#CAD5E3' }} thumbColor="#FFFFFF" />} />;
}

export function Btn({ label, onPress, kind = 'primary', icon, disabled, busy, testID }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'quiet'; icon?: IconName; disabled?: boolean; busy?: boolean; testID?: string }) {
  const colors = useColors(); const { fonts, row } = useL();
  const p = { primary: [colors.primary, colors.primary, '#FFFFFF'], secondary: ['#FFFFFF', tone.secondaryLine, colors.primary], danger: [tone.dangerBg, tone.dangerLine, '#C33434'], quiet: ['transparent', 'transparent', colors.mutedForeground] }[kind];
  const off = disabled || busy;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: off, busy }} disabled={off} onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: p[0], borderColor: p[1], flexDirection: row }, off && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
      {busy ? <ActivityIndicator color={p[2]} /> : icon ? <Feather name={icon} size={18} color={p[2]} /> : null}
      <Text style={{ color: p[2], fontFamily: fonts.semiBold, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Note({ children, warn }: { children: string; warn?: boolean }) {
  const colors = useColors(); const { fonts, align } = useL();
  return <View style={[s.note, { backgroundColor: warn ? tone.warnBg : tone.noteBg }]}><Text style={{ color: warn ? tone.warnText : colors.mutedForeground, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19, textAlign: align }}>{children}</Text></View>;
}

export function ErrorText({ children }: { children?: string | null }) {
  const { fonts, align } = useL();
  return <Text accessibilityLiveRegion="polite" style={{ color: '#BC2525', fontSize: 12.5, minHeight: 20, fontFamily: fonts.medium, textAlign: align, marginTop: 4 }}>{children ?? ''}</Text>;
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: boolean }) {
  const colors = useColors(); const { fonts, align } = useL();
  return (
    <View>
      <Text style={[s.fieldLabel, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: align }]}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#94A3B8" {...props}
        style={[s.input, { fontFamily: fonts.regular, color: colors.foreground, textAlign: align, borderColor: error ? '#E0A3A3' : tone.inputLine }, props.multiline && { minHeight: 110, textAlignVertical: 'top' }, props.style]} />
    </View>
  );
}

export function Avatar({ name, photo, size = 54 }: { name: string; photo?: string; size?: number }) {
  const colors = useColors(); const { fonts } = useL();
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {photo ? <Image source={{ uri: photo }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
        : name.trim() ? <Text style={{ color: colors.primary, fontFamily: fonts.bold, fontSize: size * 0.4 }}>{name.trim().slice(0, 1).toUpperCase()}</Text>
          : <Feather name="user" size={size * 0.45} color={colors.primary} />}
    </View>
  );
}

/** Native modal sheet; hardware back / Escape dismisses via onRequestClose. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const colors = useColors(); const insets = useScreenInsets(); const { L, fonts, row, align } = useL();
  const { state } = useAccountFoundation();
  return (
    <Modal visible={visible} transparent animationType={Platform.OS === 'web' || state.reducedMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} style={[s.modalBg, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={L('إغلاق', 'Close')} />
        <View style={s.modal} accessibilityViewIsModal>
          <View style={{ flexDirection: row, alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: colors.accent, fontFamily: fonts.bold, fontSize: 20, textAlign: align }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={L('إغلاق', 'Close')} style={[s.iconBtn, { backgroundColor: '#EDF2F8' }]}>
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 4 }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Confirm({ visible, title, body, confirmLabel, onConfirm, onCancel, destructive, busy, error, cancelLabel }: { cancelLabel?: string; visible: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; destructive?: boolean; busy?: boolean; error?: string | null }) {
  const { L } = useL();
  return (
    <Sheet visible={visible} title={title} onClose={busy ? () => undefined : onCancel}>
      <Note warn={destructive}>{body}</Note>
      <ErrorText>{error}</ErrorText>
      <Btn label={confirmLabel} onPress={onConfirm} busy={busy} kind={destructive ? 'danger' : 'primary'} />
      <Btn label={cancelLabel ?? L('إلغاء', 'Cancel')} onPress={onCancel} kind="danger" disabled={busy} />
    </Sheet>
  );
}

export function Body({ children, muted }: { children: string; muted?: boolean }) {
  const colors = useColors(); const { fonts, align } = useL();
  return <Text style={{ color: muted ? colors.mutedForeground : colors.foreground, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, textAlign: align, marginVertical: 4 }}>{children}</Text>;
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 12, paddingBottom: 14, alignItems: 'center', gap: 8 },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 18, textAlign: 'center' },
  iconBtn: { minWidth: 42, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.11)' },
  iconBtnSpacer: { width: 42 },
  h2: { fontSize: 23, marginTop: 4, marginBottom: 4 },
  sub: { fontSize: 13, marginBottom: 14, lineHeight: 20 },
  label: { fontSize: 12.5, marginTop: 22, marginBottom: 6, marginHorizontal: 2, letterSpacing: 0.4 },
  card: { borderWidth: 1, borderColor: tone.line, backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', marginVertical: 8 },
  row: { alignItems: 'center', gap: 12, padding: 14, minHeight: 60 },
  ico: { width: 24, alignItems: 'center' },
  rowTitle: { fontSize: 14.5 },
  rowSub: { fontSize: 11.5, marginTop: 2, lineHeight: 17 },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  btn: { minHeight: 48, borderWidth: 1, borderRadius: 11, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', gap: 10, marginVertical: 5 },
  note: { borderRadius: 10, padding: 12, marginVertical: 10 },
  fieldLabel: { fontSize: 13, marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 48, backgroundColor: '#FFFFFF', fontSize: 15 },
  avatar: { backgroundColor: tone.avatarBg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  modalBg: { flex: 1, backgroundColor: 'rgba(18,42,69,0.4)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, maxHeight: '90%', width: '100%', maxWidth: 440, alignSelf: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  bannerText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  retry: { paddingHorizontal: 8, paddingVertical: 6 },
  footer: { borderTopWidth: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 18, paddingTop: 8 },
});
