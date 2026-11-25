import { Text } from "@/components/AppText";
import { Pressable, View } from "react-native";
import type { SeekerRequirement } from "@workspace/property-domain";
import {
  getRequirementDetailsRows,
  type RequirementDetailRow,
} from "@/services/requirementDetailsPresentation";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/contexts/I18nContext";

export function RequestReview({
  requirement,
  onEdit,
}: {
  requirement: SeekerRequirement;
  onEdit: (section: RequirementDetailRow["section"]) => void;
}) {
  const { language, isRTL, fonts, t } = useI18n();
  const colors = useColors();
  const rows = getRequirementDetailsRows(requirement, language, t);
  const titles = {
    overview: ["Request", "نوع الطلب"],
    location: ["Location", "المنطقة"],
    specifications: ["Specifications", "المواصفات"],
    preferences: ["Services", "الخدمات والتفضيلات"],
    budget: ["Budget", "الميزانية"],
    notes: ["Notes", "الملاحظات"],
  };
  return (
    <View testID="request-canonical-review" style={{ gap: 14 }}>
      {(Object.keys(titles) as RequirementDetailRow["section"][]).map(
        (section) => {
          const entries = rows.filter((row) => row.section === section);
          if (!entries.length) return null;
          return (
            <View
              key={section}
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 16,
                padding: 16,
                gap: 12,
              }}
            >
              <View
                style={{
                  direction: "ltr",
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.bold,
                    color: colors.foreground,
                    fontSize: 17,
                  }}
                >
                  {titles[section][language === "ar" ? 1 : 0]}
                </Text>
                <Pressable
                  onPress={() => onEdit(section)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    (language === "ar" ? "تعديل " : "Edit ") +
                    titles[section][language === "ar" ? 1 : 0]
                  }
                  style={{
                    minHeight: 48,
                    minWidth: 48,
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: colors.primary,
                      fontFamily: fonts.semiBold,
                    }}
                  >
                    {language === "ar" ? "تعديل" : "Edit"}
                  </Text>
                </Pressable>
              </View>
              {entries.map((row) => (
                <View
                  key={row.field}
                  style={{
                    gap: 3,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingTop: 10,
                  }}
                >
                  <Text
                    style={{
                      color: colors.mutedForeground,
                      fontFamily: fonts.regular,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {row.label}
                  </Text>
                  <Text
                    selectable
                    style={{
                      color: colors.foreground,
                      fontFamily: fonts.semiBold,
                      textAlign: isRTL ? "right" : "left",
                      writingDirection: isRTL ? "rtl" : "ltr",
                      lineHeight: 24,
                    }}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          );
        },
      )}
      <Text
        style={{
          color: colors.mutedForeground,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {language === "ar"
          ? "بعد الحفظ، تقدر تبدأ المطابقة وتختار نطاق البحث."
          : "After saving, start matching and choose its scope."}
      </Text>
    </View>
  );
}
