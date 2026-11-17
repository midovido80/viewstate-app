import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { matchingCountLabel } from "@/services/matchingGroups";
import { Button } from "@/components/Button";
import { useI18n } from "@/contexts/I18nContext";

export function MatchingConfirmationList({
  count,
  children,
  unit = "properties",
}: {
  count: number;
  children: ReactNode;
  unit?: "properties" | "people";
}) {
  const [open, setOpen] = useState(false);
  const { language, fonts } = useI18n();
  if (!count) return null;
  return (
    <View style={{ gap: 8 }}>
      <Button
        title={`${language === "ar" ? (open ? "إخفاء" : "عرض") : open ? "Hide" : "Show"} ${matchingCountLabel(count, unit, true, language)}`}
        variant="outline"
        onPress={() => setOpen(!open)}
        testID="matching-toggle-confirmations"
      />
      {open && (
        <>
          <Text style={{ color: "#946200", fontFamily: fonts.medium }}>
            {language === "ar"
              ? "بيانات مؤثرة ناقصة — ليست ترشيحات جاهزة"
              : "Important facts are missing — not ready suggestions"}
          </Text>
          {children}
        </>
      )}
    </View>
  );
}
