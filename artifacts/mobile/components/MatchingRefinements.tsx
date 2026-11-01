import { useState } from "react";
import { Text, View } from "react-native";
import {
  matchingRefinementFields,
  type MatchingPolicy,
  type SeekerRequirement,
} from "@workspace/property-domain";
import { ChoiceGrid, ChoiceTile } from "@/components/ChoiceTile";
import { Button } from "@/components/Button";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import { matchingCriterionLabel } from "@/services/matchingPresentation";

export function MatchingRefinements({
  requirement,
  policy,
  onChange,
  busy,
}: {
  requirement: SeekerRequirement;
  policy: MatchingPolicy;
  onChange: (policy: MatchingPolicy) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { language, fonts } = useI18n();
  const colors = useColors();
  const ar = language === "ar";
  const fields = matchingRefinementFields(requirement);
  return (
    <View style={{ gap: 8 }} testID={`matching-refinements-${requirement.id}`}>
      <Button
        variant="outline"
        title={ar ? "ضبط شروط هذه النتائج" : "Refine these results"}
        onPress={() => setOpen(!open)}
        disabled={busy}
        style={{
          minHeight: 44,
          borderColor: "#D5DFED",
          backgroundColor: "#F8FAFC",
        }}
        textStyle={{ fontSize: 12 }}
      />
      {open && (
        <>
          <Text
            style={{ color: colors.foreground, fontFamily: fonts.semiBold }}
          >
            {ar
              ? "الشروط المحددة هنا لن نتجاوزها"
              : "Selected conditions cannot be relaxed"}
          </Text>
          <ChoiceGrid>
            {[...new Set(fields)].map((field) => (
              <ChoiceTile
                key={field}
                optionId={field}
                label={matchingCriterionLabel(field, language)}
                selected={policy.strictFields?.includes(field) === true}
                role="checkbox"
                onPress={() => {
                  if (busy) return;
                  const strict = policy.strictFields ?? [];
                  onChange({
                    ...policy,
                    strictFields: strict.includes(field)
                      ? strict.filter((item) => item !== field)
                      : [...strict, field],
                  });
                }}
              />
            ))}
          </ChoiceGrid>
          <Text
            style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}
          >
            {requirement.preferredAreaMode !== "all_kuwait"
              ? ar
                ? "المناطق خارج المحددة بدائل للمناقشة ما لم تُشدّد المنطقة. هذا التعديل لهذه الجولة فقط ولا يغيّر طلب العميل المحفوظ. الحدود: زيادة سعر حتى ١٠٪، نقص مساحة حتى ١٠٪، واختلافان بحد أقصى."
                : "Outside-area suggestions are for discussion unless location is strict. This run only; the saved client request stays unchanged. Limits: up to 10% higher price, 10% less area, and at most two differences."
              : ar
                ? "هذا التعديل لهذه الجولة فقط ولا يغيّر طلب العميل المحفوظ. الحدود: زيادة سعر حتى ١٠٪، نقص مساحة حتى ١٠٪، واختلافان بحد أقصى."
                : "This run only; the saved client request stays unchanged. Limits: up to 10% higher price, 10% less area, and at most two differences."}
          </Text>
        </>
      )}
    </View>
  );
}
