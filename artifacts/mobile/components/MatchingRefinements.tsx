import { useState } from "react";
import { Text, View } from "react-native";
import {
  matchingRefinementFields,
  type MatchingPolicy,
  type SeekerRequirement,
} from "@workspace/property-domain";
import { ChoiceGrid, ChoiceTile } from "@/components/ChoiceTile";
import { Button } from "@/components/Button";
import { KuwaitAreaSelector } from "@/components/KuwaitAreaSelector";
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
    <View
      style={{ gap: 10, marginVertical: 8 }}
      testID={`matching-refinements-${requirement.id}`}
    >
      <Button
        variant="outline"
        title={ar ? "ضبط شروط هذه النتائج" : "Refine these results"}
        onPress={() => setOpen(!open)}
        disabled={busy}
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
          {requirement.preferredAreaMode !== "all_kuwait" &&
            !policy.strictFields?.includes("location") && (
              <>
                <Text
                  style={{
                    color: colors.foreground,
                    fontFamily: fonts.semiBold,
                  }}
                >
                  {ar
                    ? "مناطق بديلة تسمح بترشيحها للمناقشة"
                    : "Alternative areas you allow for discussion"}
                </Text>
                <KuwaitAreaSelector
                  selectedIds={policy.alternativeAreaIds ?? []}
                  onChange={(ids) => {
                    if (!busy) onChange({ ...policy, alternativeAreaIds: ids });
                  }}
                  testID={`matching-alternative-areas-${requirement.id}`}
                />
              </>
            )}
          <Text
            style={{ color: colors.mutedForeground, fontFamily: fonts.regular }}
          >
            {ar
              ? "خاصة بهذه الجلسة فقط؛ لا تغيّر متطلبات العميل المحفوظة. حدود البدائل: زيادة سعر حتى ١٠٪، نقص مساحة حتى ١٠٪، واختلافان بحد أقصى."
              : "This session only; saved client requirements stay unchanged. Alternatives: up to 10% higher price, 10% less area, and at most two differences."}
          </Text>
        </>
      )}
    </View>
  );
}
