import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, FontAwesome } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Text } from "@/components/AppText";
import { useI18n } from "@/contexts/I18nContext";
import {
  pilot2Theme as theme,
  pilot2Typography,
} from "@/constants/pilot2Theme";
import { IdentityBrand } from "./IdentityBrand";
import { IdentityButton } from "./IdentityButton";

type Props = {
  checking: boolean;
  failed: boolean;
  busy: boolean;
  error: string;
  onGoogle(): void;
  onGuest(): void;
  onRetry(): void;
  onSignOut?: () => void;
  onOpenBrowser?: () => void;
};

export function AccountEntryScreen(p: Props) {
  const { language, setLanguage, fonts } = useI18n();
  const ar = language === "ar";
  const L = (a: string, e: string) => (ar ? a : e);
  const type = pilot2Typography(fonts);
  const [started, setStarted] = useState(false);
  const intro = !started && !p.checking && !p.failed && !p.error;
  const blocked = p.busy || p.checking;
  return (
    <SafeAreaView style={[s.safe, intro && s.intro]}>
      <StatusBar
        style={intro ? "light" : "dark"}
        backgroundColor={intro ? theme.color.primary : theme.color.background}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L("التبديل إلى الإنجليزية", "Switch to Arabic")}
          onPress={() => setLanguage(ar ? "en" : "ar")}
          style={s.language}
        >
          <Text
            style={[
              type.label,
              { color: intro ? theme.color.onPrimary : theme.color.primary },
            ]}
          >
            {ar ? "English" : "العربية"}
          </Text>
        </Pressable>
        <View style={s.heading}>
          <IdentityBrand inverse={intro} />
          <Text
            accessibilityRole="header"
            style={[
              type.title,
              s.center,
              { color: intro ? theme.color.onPrimary : theme.color.text },
            ]}
          >
            {intro
              ? L(
                  "علاقات موثوقة. صفقات أوضح.",
                  "Trusted connections. Clearer deals.",
                )
              : L("أهلًا بك", "Welcome")}
          </Text>
          <Text
            style={[
              type.body,
              s.center,
              { color: intro ? theme.color.onPrimary : theme.color.muted },
            ]}
          >
            {L(
              "عقاراتك وعملاؤك وفرص التعاون، في مكان واحد.",
              "Your properties, clients and opportunities, together.",
            )}
          </Text>
        </View>
        <View style={[s.hero, intro && s.introHero]}>
          <Image
            accessible={false}
            source={require("@/assets/images/pilot2-welcome.png")}
            resizeMode="cover"
            style={s.heroImage}
          />
        </View>
        {intro ? (
          <IdentityButton
            label={L("ابدأ", "Get started")}
            secondary
            testID="identity-start"
            onPress={() => setStarted(true)}
          />
        ) : (
          <View style={s.actions}>
            {p.error ? (
              <View accessibilityRole="alert" style={s.error}>
                <Text
                  selectable
                  style={[type.body, { color: theme.color.danger }]}
                >
                  {p.error}
                </Text>
              </View>
            ) : null}
            {p.checking ? (
              <View accessibilityLiveRegion="polite" style={s.checking}>
                <ActivityIndicator color={theme.color.primary} />
                <Text
                  style={[type.body, s.center, { color: theme.color.muted }]}
                >
                  {L("جارٍ فتح حسابك…", "Opening your account…")}
                </Text>
              </View>
            ) : p.failed ? (
              <>
                <IdentityButton
                  label={L("إعادة المحاولة", "Retry")}
                  onPress={p.onRetry}
                  busy={p.busy}
                  testID="account-entry-retry"
                />
                {p.onSignOut ? (
                  <IdentityButton
                    label={L("تسجيل الخروج", "Sign out")}
                    secondary
                    onPress={p.onSignOut}
                    disabled={blocked}
                  />
                ) : null}
              </>
            ) : (
              <IdentityButton
                label={L("الدخول بحساب Google", "Continue with Google")}
                secondary
                onPress={p.onGoogle}
                busy={p.busy}
                icon={
                  <FontAwesome
                    name="google"
                    size={theme.size.icon}
                    color={theme.color.primary}
                  />
                }
                testID="google-sign-in"
              />
            )}
            <IdentityButton
              label={L("تجربة بدون حساب", "Try as a guest")}
              onPress={p.onGuest}
              disabled={blocked}
              icon={
                <Feather
                  name="user"
                  size={theme.size.icon}
                  color={theme.color.onPrimary}
                />
              }
              testID="use-as-guest"
            />
            <Text
              style={[type.caption, s.center, { color: theme.color.muted }]}
            >
              {L(
                "تجربة الضيف تحفظ بياناتك على هذا الجهاز فقط. يمكنك تفعيل حسابك لاحقًا من الإعدادات.",
                "Guest data stays on this device. You can activate your account later in Settings.",
              )}
            </Text>
            {p.onOpenBrowser ? (
              <IdentityButton
                label={L("فتح في تبويب مستقل", "Open in a separate tab")}
                secondary
                onPress={p.onOpenBrowser}
                disabled={blocked}
              />
            ) : null}
            <Text
              style={[type.caption, s.center, { color: theme.color.muted }]}
            >
              {L(
                "الدخول الآمن يتم عبر Google، دون إدخال كلمة مرورك هنا.",
                "Sign in securely through Google, without entering your password here.",
              )}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  intro: { backgroundColor: theme.color.primary },
  page: {
    flexGrow: 1,
    paddingHorizontal: theme.space.xl,
    paddingBottom: theme.space.xl,
    gap: theme.space.xl,
    width: "100%",
    maxWidth: theme.size.page,
    alignSelf: "center",
  },
  language: {
    minHeight: theme.size.touch,
    minWidth: theme.size.touch,
    alignSelf: "flex-end",
    justifyContent: "center",
    alignItems: "center",
  },
  heading: { alignItems: "center", gap: theme.space.lg },
  center: { textAlign: "center" },
  hero: {
    width: "100%",
    aspectRatio: 1.7,
    borderRadius: theme.radius.card,
    overflow: "hidden",
  },
  heroImage: { width: "100%", height: "100%" },
  introHero: { aspectRatio: 1.2, borderRadius: theme.radius.hero },
  actions: { gap: theme.space.md, marginTop: "auto" },
  checking: {
    alignItems: "center",
    gap: theme.space.sm,
    padding: theme.space.md,
  },
  error: {
    padding: theme.space.md,
    borderRadius: theme.radius.control,
    backgroundColor: theme.color.dangerSoft,
  },
});
