import { Text, View } from "react-native";
import type {
  MatchResult,
  Property,
  SeekerRequirement,
} from "@workspace/property-domain";
import { PropertyFormCard } from "@/components/PropertyFormCard";
import { Button } from "@/components/Button";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import { getAreaById } from "@/constants/kuwait-areas";
import { getSavedPropertyTypeLabel } from "@/services/savedPropertyClassification";
import {
  matchingCategoryLabel,
  matchingExplanationText,
} from "@/services/matchingPresentation";
import { formatPrice, formatRentalPrice } from "@/constants/market";

export function MatchingResultCard({
  result,
  rank,
  property,
  onPress,
  onReplace,
  busy,
}: {
  result: MatchResult;
  rank: number;
  property?: Property;
  requirement: SeekerRequirement;
  onPress: () => void;
  onReplace?: () => void;
  busy?: boolean;
}) {
  const { language, isRTL, fonts, t } = useI18n();
  const colors = useColors();
  const ar = language === "ar";
  const issues = result.explanations.filter(
    (item) => item.status === "not_met" || item.status === "unknown",
  );
  const area = property
    ? getAreaById(property.core.locationArea.id)
    : undefined;
  return (
    <PropertyFormCard
      title={`${rank}. ${matchingCategoryLabel(result.category, language)}`}
      icon="target"
      testID={`matching-result-${result.propertyId}`}
    >
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: 17,
          color: "#173F78",
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {property
          ? getSavedPropertyTypeLabel(
              property,
              language,
              t(`propertyType.${property.core.propertyType}`),
            )
          : ar
            ? "عقار مرشح"
            : "Suggested property"}{" "}
        · {area?.[language] ?? (ar ? "المنطقة غير معروفة" : "Unknown area")}
      </Text>
      {property && (
        <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold }}>
          {property.activeOffer.transaction === "rent"
            ? formatRentalPrice(
                property.activeOffer.rentalPrice.amount,
                property.activeOffer.rentalPrice.currencyCode,
                property.activeOffer.rentalPeriodId,
                language,
                t,
              )
            : formatPrice(
                property.activeOffer.salePrice.amount,
                property.activeOffer.salePrice.currencyCode,
                language,
              )}
        </Text>
      )}
      {!issues.length && (
        <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>
          {ar
            ? "لا توجد اختلافات في البنود المسجلة التي تمت مقارنتها."
            : "No differences in the recorded criteria compared."}
        </Text>
      )}
      {issues.map((item) => (
        <Text
          key={item.criterion}
          style={{
            color: item.status === "unknown" ? "#946200" : colors.foreground,
            fontFamily: fonts.regular,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {matchingExplanationText(item, language)}
        </Text>
      ))}
      <Text
        style={{
          color: colors.mutedForeground,
          fontFamily: fonts.regular,
          fontSize: 12,
        }}
      >
        {ar
          ? "درجة التقارب، وليست احتمال إتمام الصفقة"
          : "Similarity score, not a probability of closing"}
        : {result.score}%
      </Text>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8 }}>
        <Button
          title={ar ? "عرض العقار" : "View property"}
          onPress={onPress}
          disabled={busy}
          style={{ flex: 1 }}
          testID={`matching-open-${result.propertyId}`}
        />
        {onReplace && (
          <Button
            title={ar ? "استبدال الترشيح" : "Replace suggestion"}
            onPress={onReplace}
            disabled={busy}
            variant="outline"
            style={{ flex: 1 }}
            testID={`matching-replace-${result.propertyId}`}
          />
        )}
      </View>
    </PropertyFormCard>
  );
}
