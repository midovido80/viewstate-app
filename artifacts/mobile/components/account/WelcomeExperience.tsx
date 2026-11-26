import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Text } from "@/components/AppText";
import { useI18n } from "@/contexts/I18nContext";
import {
  pilot2Theme as theme,
  pilot2Typography,
} from "@/constants/pilot2Theme";
import { IdentityBrand } from "./IdentityBrand";
import { IdentityButton } from "./IdentityButton";

export function WelcomeExperience({
  onDone,
  busy,
  name,
}: {
  reducedMotion: boolean;
  onDone(): void;
  busy: boolean;
  name?: string;
}) {
  const { language, fonts, isRTL } = useI18n();
  const ar = language === "ar";
  const type = pilot2Typography(fonts);
  const [submitted, setSubmitted] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    if (!busy) {
      locked.current = false;
      setSubmitted(false);
    }
  }, [busy]);
  const finish = () => {
    if (busy || locked.current) return;
    locked.current = true;
    setSubmitted(true);
    onDone();
  };
  const features = [
    {
      icon: "home" as const,
      title: ar ? "عقاراتك مرتبة" : "Organized properties",
      body: ar
        ? "سجّل المعروض والمطلوب بطريقتك المعتادة."
        : "Add offers and requirements using the familiar forms.",
    },
    {
      icon: "users" as const,
      title: ar ? "عملاؤك قريبون" : "Clients within reach",
      body: ar
        ? "احتفظ بتفاصيل الأشخاص وطلباتهم معًا."
        : "Keep people and their requirements together.",
    },
    {
      icon: "link" as const,
      title: ar ? "تعاون بثقة" : "Work together",
      body: ar
        ? "راجع المطابقات واختر ما تشاركه مع زملائك."
        : "Review matches and choose what to share with colleagues.",
    },
  ];
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <IdentityBrand compact />
        <View style={s.heading}>
          <Text
            accessibilityRole="header"
            style={[type.title, s.center, { color: theme.color.text }]}
          >
            {name
              ? ar
                ? `أهلًا، ${name}`
                : `Welcome, ${name}`
              : ar
                ? "جاهز لفرصتك القادمة؟"
                : "Ready for your next opportunity?"}
          </Text>
          <Text style={[type.body, s.center, { color: theme.color.muted }]}>
            {ar
              ? "مساحة أهدأ لتنظيم شغلك العقاري، خطوة بخطوة."
              : "A calmer place to organize your property work, step by step."}
          </Text>
        </View>
        <View style={s.features}>
          {features.map((feature) => (
            <View
              key={feature.icon}
              style={[
                s.feature,
                { flexDirection: isRTL ? "row-reverse" : "row" },
              ]}
            >
              <View style={s.icon}>
                <Feather
                  name={feature.icon}
                  size={theme.size.icon}
                  color={theme.color.primary}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.heading, { color: theme.color.text }]}>
                  {feature.title}
                </Text>
                <Text style={[type.body, { color: theme.color.muted }]}>
                  {feature.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View style={s.action}>
          <IdentityButton
            label={ar ? "ابدأ استخدام ViewState" : "Start using ViewState"}
            onPress={finish}
            busy={busy || submitted}
            testID="account-welcome-start"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  page: {
    flexGrow: 1,
    width: "100%",
    maxWidth: theme.size.page,
    alignSelf: "center",
    padding: theme.space.xl,
    gap: theme.space.xxl,
  },
  heading: { gap: theme.space.md },
  center: { textAlign: "center" },
  features: { gap: theme.space.lg },
  feature: {
    direction: "ltr",
    alignItems: "center",
    gap: theme.space.md,
    backgroundColor: theme.color.surface,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
  },
  icon: {
    minHeight: theme.size.touch,
    minWidth: theme.size.touch,
    borderRadius: theme.radius.control,
    backgroundColor: theme.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  action: { marginTop: "auto" },
});
