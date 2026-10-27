import { useMatchingUiTasteTrial } from "@/components/MatchingUiTasteTrial";
import { useState } from "react";
import {
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type {
  MatchExplanation,
  MatchResult,
  Property,
  SeekerRequirement,
} from "@workspace/property-domain";
import { Button } from "@/components/Button";
import { useI18n } from "@/contexts/I18nContext";
import { getAreaById } from "@/constants/kuwait-areas";
import { getSavedPropertyTypeLabel } from "@/services/savedPropertyClassification";
import {
  matchingCategoryLabel,
  matchingCriterionLabel,
  matchingComparisonRows,
  matchingExplanationText,
} from "@/services/matchingPresentation";
import { formatPrice, formatRentalPrice } from "@/constants/market";

export function MatchingStatusBadge({
  status,
  label,
}: {
  status: MatchExplanation["status"];
  label: string;
}) {
  const { isRTL, fonts } = useI18n();
  const taste = useMatchingUiTasteTrial();
  const matched = status === "matched";
  const unknown = status === "unknown";
  const color = matched ? "#16A34A" : unknown ? "#B45309" : "#DC2626";
  return (
    <View
      testID={`matching-status-${status}`}
      accessibilityLabel={label}
      style={{
        direction: "ltr",
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
      }}
    >
      <View
        testID={`matching-status-circle-${status}`}
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Feather
          name={matched ? "check" : unknown ? "help-circle" : "x"}
          size={13}
          color="#FFFFFF"
          accessible={false}
        />
      </View>
      <Text
        style={{
          flexShrink: 1,
          color: "#334155",
          fontFamily: fonts.medium,
          fontSize: taste ? 12 : 11,
          lineHeight: taste ? 18 : 17,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function MatchingResultCard({
  result,
  rank,
  property,
  requirement,
  personName,
  onPress,
  onViewRequirement,
  onViewPerson,
  onReplace,
  busy,
  perspective = "people",
  personRequestIndex,
  expanded = true,
  onToggle,
}: {
  result: MatchResult;
  rank: number;
  property?: Property;
  requirement: SeekerRequirement;
  personName?: string;
  onPress: () => void;
  onViewRequirement?: () => void;
  onViewPerson?: () => void;
  onReplace?: () => void;
  busy?: boolean;
  perspective?: "people" | "properties";
  personRequestIndex?: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const [fullComparison, setFullComparison] = useState(false);
  const { language, isRTL, fonts, t } = useI18n();
  const ar = language === "ar";
  const taste = useMatchingUiTasteTrial();
  const { width, fontScale } = useWindowDimensions();
  const roomyText = width >= 700 || fontScale > 1.25;
  const issues = result.explanations.filter(
    (item) => item.status === "not_met",
  );
  const unknowns = result.explanations.filter(
    (item) => item.status === "unknown",
  );
  const rows = matchingComparisonRows(result, requirement, property, language);
  const visibleRows = fullComparison ? rows : rows.slice(0, 5);
  const area = property
    ? getAreaById(property.core.locationArea.id)
    : undefined;
  const text = {
    color: "#334155",
    fontFamily: fonts.regular,
    textAlign: isRTL ? ("right" as const) : ("left" as const),
  };
  const personHeading =
    perspective === "properties" && personRequestIndex === undefined;
  const rowDirection = isRTL ? ("row-reverse" as const) : ("row" as const);
  const widths = [1, 1.15, 1, 1.05];
  const propertyPrice = perspective === "people" && property && (
    <Text
      style={{
        ...text,
        color: "#2563EB",
        fontFamily: fonts.bold,
        fontSize: taste ? 16 : 14,
        lineHeight: taste ? 23 : undefined,
        maxWidth: taste ? "44%" : undefined,
        flexShrink: taste ? 1 : undefined,
        fontVariant: taste ? ["tabular-nums"] : undefined,
      }}
    >
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
  );
  return (
    <View
      testID={`matching-result-${result.propertyId}`}
      style={{
        borderWidth: 1,
        borderColor: taste ? "#E2E8F0" : "#D5DFED",
        borderRadius: taste ? 16 : 14,
        backgroundColor: "#FFFFFF",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <TouchableOpacity
        onPress={onToggle}
        disabled={!onToggle || busy}
        accessibilityRole="button"
        accessibilityState={{ expanded, disabled: !onToggle || busy }}
        accessibilityLabel={
          perspective === "properties"
            ? personName
            : `${rank}. ${ar ? "تفاصيل العقار" : "Property comparison"}`
        }
        testID={`matching-card-toggle-${requirement.id}-${result.propertyId}`}
        style={{
          padding: taste ? 14 : 12,
          gap: taste ? 6 : 5,
          backgroundColor: personHeading ? "#FFF4E8" : "#FFFFFF",
        }}
      >
        <View
          style={{
            direction: "ltr",
            flexDirection: rowDirection,
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            testID={
              perspective === "properties"
                ? "matching-card-client"
                : "matching-card-property"
            }
            style={{
              ...text,
              flex: 1,
              color: personHeading ? "#B45309" : "#173F78",
              fontFamily: fonts.bold,
              fontSize: taste ? 16 : 15,
              lineHeight: taste ? 24 : 23,
            }}
          >
            {perspective === "properties"
              ? personRequestIndex === undefined
                ? personName ||
                  (ar ? "طلب مطابقة سريع" : "Quick matching request")
                : `${ar ? "الطلب" : "Request"} ${personRequestIndex}`
              : `${property ? getSavedPropertyTypeLabel(property, language, t(`propertyType.${property.core.propertyType}`)) : ar ? "عقار مرشح" : "Suggested property"} · ${area?.[language] ?? (ar ? "منطقة غير مسجلة" : "Unknown area")}`}
          </Text>
          {taste && propertyPrice}
          {onToggle && (
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={20}
              color="#173F78"
              accessible={false}
            />
          )}
        </View>
        {!taste && propertyPrice}
        {perspective === "properties" && (
          <Text style={{ ...text, fontSize: 12 }}>
            {requirement.purpose === "rent"
              ? ar
                ? "طلب للإيجار"
                : "Rental request"
              : ar
                ? "طلب للشراء"
                : "Purchase request"}{" "}
            · {requirement.budget.minimum}–{requirement.budget.maximum}{" "}
            {requirement.budget.currencyCode}
          </Text>
        )}
      </TouchableOpacity>
      {expanded && (
        <View
          style={{
            paddingHorizontal: taste ? 14 : 12,
            paddingBottom: taste ? 14 : 12,
            gap: taste ? 12 : 10,
          }}
        >
          {result.category !== "direct" && (
            <Text style={{ ...text, color: "#946200", fontSize: 12 }}>
              {matchingCategoryLabel(result.category, language)}
            </Text>
          )}
          <View
            testID="matching-comparison-table"
            style={{
              borderRadius: 10,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "#DFE8F5",
            }}
          >
            <View
              style={{
                direction: "ltr",
                flexDirection: rowDirection,
                backgroundColor: taste ? "#E5EFFF" : "#DBEAFE",
              }}
            >
              {(ar
                ? ["البند", "طلب العميل", "العقار", "الحالة"]
                : ["Field", "Client request", "Property", "Status"]
              ).map((label, index) => (
                <Text
                  key={label}
                  style={{
                    ...text,
                    flex: widths[index],
                    minWidth: 0,
                    paddingHorizontal: 4,
                    paddingVertical: 9,
                    fontFamily: fonts.semiBold,
                    fontSize: taste ? 12 : 11,
                  }}
                >
                  {label}
                </Text>
              ))}
            </View>
            {visibleRows.map((row, index) => (
              <View
                key={row.field}
                testID={`matching-compare-${row.field}`}
                style={{
                  direction: "ltr",
                  flexDirection: rowDirection,
                  backgroundColor: index % 2 ? "#EFF6FF" : "#FFFFFF",
                  alignItems: "center",
                  minHeight: taste ? 44 : 38,
                }}
              >
                {[row.label, row.requested, row.offered].map(
                  (value, column) => (
                    <Text
                      key={column}
                      style={{
                        ...text,
                        flex: widths[column],
                        minWidth: 0,
                        fontSize: taste ? (roomyText ? 14 : 13) : 11,
                        lineHeight: taste ? 20 : 18,
                        color: taste
                          ? column === 2
                            ? "#173F78"
                            : "#475569"
                          : "#334155",
                        fontFamily:
                          taste && column === 2 ? fonts.semiBold : fonts.regular,
                        fontVariant: taste ? ["tabular-nums"] : undefined,
                        paddingHorizontal: 4,
                        paddingVertical: 8,
                      }}
                    >
                      {value}
                    </Text>
                  ),
                )}
                <View
                  style={{
                    flex: widths[3],
                    minWidth: 0,
                    paddingHorizontal: 4,
                    paddingVertical: 7,
                  }}
                >
                  <MatchingStatusBadge
                    status={row.status}
                    label={row.statusLabel}
                  />
                </View>
              </View>
            ))}
          </View>
          {issues.slice(0, 2).map((item) => (
            <Text key={item.criterion} style={{ ...text, fontSize: 12 }}>
              {matchingExplanationText(item, language)}
            </Text>
          ))}
          {result.priceAmount < requirement.budget.minimum && (
            <Text
              testID="matching-below-budget"
              style={{ ...text, fontSize: 12 }}
            >
              {ar
                ? "السعر أقل من بداية النطاق المسجل بـ"
                : "Price is below the recorded range by "}
              {formatPrice(
                requirement.budget.minimum - result.priceAmount,
                requirement.budget.currencyCode,
                language,
              )}
              .
            </Text>
          )}
          {unknowns.length > 0 && (
            <Text
              testID="matching-missing-summary"
              style={{ ...text, color: "#946200", fontSize: 12 }}
            >
              {ar ? "غير مسجل: " : "Not recorded: "}
              {unknowns
                .slice(0, 2)
                .map((item) => matchingCriterionLabel(item.criterion, language))
                .join("، ")}
              {unknowns.length > 2
                ? ar
                  ? `، و${unknowns.length - 2} بنود أخرى`
                  : `, and ${unknowns.length - 2} more`
                : ""}
            </Text>
          )}
          {rows.length > 5 && (
            <Button
              title={
                fullComparison
                  ? ar
                    ? "اختصار المقارنة"
                    : "Collapse comparison"
                  : ar
                    ? "عرض المقارنة كاملة"
                    : "Full comparison"
              }
              variant="outline"
              onPress={() => setFullComparison(!fullComparison)}
              style={{
                minHeight: 44,
                ...(taste
                  ? { borderColor: "transparent", backgroundColor: "#F8FAFC" }
                  : {}),
              }}
              textStyle={taste ? { fontSize: 13 } : undefined}
              testID="matching-expand-comparison"
            />
          )}
          <View
            style={{ direction: "ltr", flexDirection: rowDirection, gap: 8 }}
          >
            <Button
              title={
                perspective === "properties" && onViewPerson
                  ? ar
                    ? "عرض الشخص"
                    : "View person"
                  : ar
                    ? "عرض العقار"
                    : "View property"
              }
              onPress={
                perspective === "properties" && onViewPerson
                  ? onViewPerson
                  : onPress
              }
              disabled={busy}
              style={{ flex: 1, minHeight: 48, paddingHorizontal: 8 }}
              textStyle={taste ? { fontSize: 15 } : undefined}
              testID={`matching-open-${result.propertyId}`}
            />
            {onViewRequirement && (
              <Button
                title={ar ? "عرض الطلب" : "View request"}
                onPress={onViewRequirement}
                disabled={busy}
                variant="outline"
                style={{ flex: 1, minHeight: 48, paddingHorizontal: 8 }}
                textStyle={taste ? { fontSize: 15 } : undefined}
                testID={`matching-request-${requirement.id}`}
              />
            )}
          </View>
          {onReplace && (
            <Button
              title={
                ar
                  ? "استبدال العقار لهذا الطلب"
                  : "Replace property for this request"
              }
              onPress={onReplace}
              disabled={busy}
              variant="outline"
              style={{
                minHeight: 44,
                ...(taste
                  ? { borderColor: "transparent", backgroundColor: "#F8FAFC" }
                  : {}),
              }}
              textStyle={taste ? { fontSize: 13 } : undefined}
              testID={`matching-replace-${result.propertyId}`}
            />
          )}
        </View>
      )}
    </View>
  );
}
