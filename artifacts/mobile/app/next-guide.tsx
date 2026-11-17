import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useI18n } from "@/contexts/I18nContext";
import { useNextExperience } from "@/contexts/NextExperienceContext";
import { NextPage, NextSurface } from "@/components/next/NextSurfaces";
import { Button } from "@/components/Button";
import { nextDesign as n } from "@/constants/nextDesign";
export default function NextGuide() {
  const { language, fonts, isRTL } = useI18n(),
    next = useNextExperience(),
    router = useRouter(),
    ar = language === "ar";
  const copy = (a: string, e: string) => (ar ? a : e);
  return (
    <NextPage
      title={copy("كيف تستخدم فيوستيت؟", "How ViewState works")}
      subtitle={copy(
        "رحلة واحدة من العرض إلى المتابعة.",
        "One journey, from offer to follow-up.",
      )}
    >
      {[
        [
          copy("احفظ العرض", "Save the offer"),
          copy(
            "ابدأ بالنوع والمنطقة والسعر. أكمل المواصفات والصور حين تتوفر.",
            "Start with type, area and price. Add specifications and photos when available.",
          ),
          copy("إضافة عقار", "Add property"),
          "/capture/transaction?mode=offered",
        ],
        [
          copy("سجّل طلب العميل", "Record the client request"),
          copy(
            "حدّد ما يبحث عنه، المناطق والميزانية. الطلب يبقى منفصلًا عن العقارات المعروضة.",
            "Record the type, areas and budget. Requests remain separate from offered properties.",
          ),
          copy("تسجيل طلب", "Record request"),
          "/capture/transaction?mode=wanted",
        ],
        [
          copy("افهم المطابقة", "Understand the match"),
          copy(
            "من العقار أو الطلب افتح مطابقة هذا السجل فقط. «مطابقة الكل» توسّع النطاق. البيانات الناقصة تحتاج تأكيدًا.",
            "Open matching from a record to compare that record only. Match all expands the scope. Missing facts need confirmation.",
          ),
          copy("المطابقة", "Matching"),
          "/matching",
        ],
        [
          copy("راجع، شارك، وتابع", "Review, share, follow up"),
          copy(
            "راجع ما يظهر للمستلم. بيانات المصدر الخاصة لا تُكشف دون اختيارك. فتح المشاركة لا يثبت الإرسال أو القراءة.",
            "Review what the recipient sees. Private source details are disclosed only by your choice. Opening a share does not prove delivery or reading.",
          ),
          copy("التقويم والمتابعات", "Calendar & follow-ups"),
          "/?quickAction=calendar",
        ],
      ].map(([title, body, label, href]) => (
        <NextSurface key={title} title={title}>
          <Text
            style={{
              color: n.muted,
              fontFamily: fonts.regular,
              lineHeight: 24,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {body}
          </Text>
          <Button
            title={label}
            variant="outline"
            onPress={() => router.push(href as never)}
          />
        </NextSurface>
      ))}
      <NextSurface title={copy("بياناتك ومسوداتك", "Your records and drafts")}>
        <Text
          selectable
          style={{
            color: n.muted,
            fontFamily: fonts.regular,
            lineHeight: 24,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {copy(
            "زر السابق يرجع خطوة. الخروج من النموذج يحافظ على المسودة وفق سياسة التطبيق. وضع الضيف يحفظ على هذا الجهاز؛ الحساب المتصل يتبع إعدادات المزامنة الحالية.",
            "Previous goes back one step. Leaving a form preserves its draft under the app’s existing policy. Guest mode saves on this device; signed-in accounts use their current sync settings.",
          )}
        </Text>
      </NextSurface>
      <Button
        title={copy("ابدأ شغلك", "Start working")}
        onPress={() => {
          void next.introduce().then((ok) => {
            if (ok) router.replace("/" as never);
          });
        }}
      />
      {next.error ? (
        <Text accessibilityRole="alert" style={{ color: n.red }}>
          {copy(
            "تعذر حفظ اختيارك. أعد المحاولة.",
            "Could not save your choice. Please retry.",
          )}
        </Text>
      ) : null}
    </NextPage>
  );
}
