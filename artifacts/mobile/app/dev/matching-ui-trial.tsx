import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { MatchingPolicy } from "@workspace/property-domain";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { MatchingResultsGroups } from "@/components/MatchingResultsGroups";
import { MatchingUiTasteTrial } from "@/components/MatchingUiTasteTrial";
import { useI18n } from "@/contexts/I18nContext";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { matchingUiTrialFixture } from "@/services/matchingUiTrialFixture";
import type { MatchingResultsLayout } from "@/services/matchingGroups";

/** Development-only A/B visual review; no saved records or store operations. */
export default function MatchingUiTrial() {
  const router = useRouter();
  const { language, isRTL, fonts, setLanguage } = useI18n();
  const insets = useScreenInsets();
  const ar = language === "ar";
  const [taste, setTaste] = useState(true);
  const [layout, setLayout] = useState<MatchingResultsLayout>({
    view: "people",
  });
  const [policies, setPolicies] = useState<Record<string, MatchingPolicy>>({});
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState("");
  const fixture = useMemo(
    () => matchingUiTrialFixture(policies, excluded),
    [policies, excluded],
  );
  if (!__DEV__) return <Text>{ar ? "غير متاح" : "Unavailable"}</Text>;
  const text = {
    color: "#173F78",
    fontFamily: fonts.medium,
    textAlign: isRTL ? ("right" as const) : ("left" as const),
  };
  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
        gap: 12,
        maxWidth: 840,
        width: "100%",
        alignSelf: "center",
      }}
      testID="matching-ui-trial"
    >
      <Text style={{ ...text, fontFamily: fonts.bold, fontSize: 22 }}>
        {ar ? "تجربة تصميم المطابقات" : "Matching design trial"}
      </Text>
      <Text style={{ ...text, color: "#475569", fontSize: 13 }}>
        {ar
          ? "بيانات عرض تجريبية معزولة — لا تغيّر العقارات أو الأشخاص المحفوظين."
          : "Isolated fictional display data — saved properties and people stay unchanged."}
      </Text>
      <View
        style={{
          direction: "ltr",
          flexDirection: isRTL ? "row-reverse" : "row",
          gap: 8,
        }}
      >
        <Button
          title={ar ? "التصميم الحالي" : "Current design"}
          variant={taste ? "outline" : "primary"}
          onPress={() => setTaste(false)}
          style={{ flex: 1, minHeight: 48 }}
          testID="matching-trial-original"
        />
        <Button
          title={ar ? "تحسين Taste" : "Taste refinement"}
          variant={taste ? "primary" : "outline"}
          onPress={() => setTaste(true)}
          style={{ flex: 1, minHeight: 48 }}
          testID="matching-trial-taste"
        />
      </View>
      <View
        style={{
          direction: "ltr",
          flexDirection: isRTL ? "row-reverse" : "row",
          gap: 8,
        }}
      >
        <Button
          title={ar ? "English" : "العربية"}
          variant="outline"
          onPress={() => setLanguage(ar ? "en" : "ar")}
          style={{ flex: 1, minHeight: 44 }}
        />
        <Button
          title={ar ? "العودة للمطابقات" : "Back to matching"}
          variant="outline"
          onPress={() => router.replace("/matching")}
          style={{ flex: 1, minHeight: 44 }}
        />
      </View>
      <MatchingUiTasteTrial.Provider value={taste}>
        <MatchingResultsGroups
          groups={fixture.groups}
          properties={fixture.properties}
          layout={layout}
          onLayoutChange={setLayout}
          policies={policies}
          busy={false}
          onRefine={(id, policy) =>
            setPolicies((current) => ({ ...current, [id]: policy }))
          }
          onReplace={(id, propertyId) =>
            setExcluded((current) => ({
              ...current,
              [id]: [...(current[id] ?? []), propertyId],
            }))
          }
          onOpenProperty={() =>
            setNotice(
              ar
                ? "هذا عقار عرض تجريبي، وليس سجلًا محفوظًا."
                : "This display property is fictional, not a saved record.",
            )
          }
          onOpenPerson={() =>
            setNotice(
              ar
                ? "هذا شخص للعرض التجريبي فقط."
                : "This person is for the visual trial only.",
            )
          }
          onOpenRequest={() =>
            setNotice(
              ar
                ? "هذا طلب عرض تجريبي، وليس طلب عميل محفوظًا."
                : "This request is fictional, not a saved client request.",
            )
          }
        />
      </MatchingUiTasteTrial.Provider>
      {notice ? (
        <Text style={text} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
    </KeyboardAwareScrollViewCompat>
  );
}
