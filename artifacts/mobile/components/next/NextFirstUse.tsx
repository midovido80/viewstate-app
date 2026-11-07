import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useNextExperience } from "@/contexts/NextExperienceContext";
import { useI18n } from "@/contexts/I18nContext";
import { Button } from "@/components/Button";
import { nextDesign as n } from "@/constants/nextDesign";
export function NextFirstUse() {
  const next = useNextExperience(),
    { language, fonts, isRTL } = useI18n(),
    router = useRouter(),
    ar = language === "ar";
  if (!next.ready || next.state.introduced) return null;
  return (
    <View
      testID="next-first-use"
      style={{
        backgroundColor: n.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: n.border,
        padding: 18,
        gap: 12,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{
          color: n.ink,
          fontFamily: fonts.bold,
          fontSize: 19,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {ar ? "ابدأ بعرض أو طلب" : "Start with an offer or a request"}
      </Text>
      <Text
        style={{
          color: n.muted,
          fontFamily: fonts.regular,
          fontSize: 14,
          lineHeight: 24,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {ar
          ? "احفظ الأساسيات أولًا. أضف طلب العميل، ثم افتح المطابقة لتعرف ما يناسبه ولماذا. راجع المشاركة وسجّل موعد المتابعة."
          : "Save the basics first. Add the client request, then see what fits and why. Review your share and record the follow-up."}
      </Text>
      {next.error ? (
        <Text accessibilityRole="alert" style={{ color: n.red }}>
          {ar
            ? "تعذر حفظ اختيارك. أعد المحاولة؛ بيانات العمل لم تتغير."
            : "Could not save your choice. Retry; your work records are unchanged."}
        </Text>
      ) : null}
      <Button
        title={ar ? "فهمت، نبدأ" : "Got it, let’s start"}
        onPress={() => {
          void next.introduce();
        }}
        testID="next-introduction-done"
      />
      <Button
        title={ar ? "شوف طريقة الاستخدام" : "See how it works"}
        variant="outline"
        onPress={() => router.push("/next-guide" as never)}
      />
    </View>
  );
}
