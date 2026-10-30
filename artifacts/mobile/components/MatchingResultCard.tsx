import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
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
  matchingComparisonRows,
} from "@/services/matchingPresentation";
import { formatPrice, formatRentalPrice } from "@/constants/market";

export function MatchingStatusBadge({
  status,
  label,
  compact = false,
}: {
  status: MatchExplanation["status"];
  label: string;
  compact?: boolean;
}) {
  const { isRTL, fonts } = useI18n();
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
      {!compact && (
        <Text
          style={{
            flexShrink: 1,
            color,
            fontFamily: fonts.semiBold,
            fontSize: 12,
            lineHeight: 17,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {label}
        </Text>
      )}
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
  const rows = matchingComparisonRows(result, requirement, property, language);
  const issues = rows.filter(
    (row) => row.status === "not_met" || row.status === "ineligible",
  );
  const unknowns = rows.filter((row) => row.status === "unknown");
  const summaryStatus = issues.length
    ? "not_met"
    : unknowns.length
      ? "unknown"
      : "matched";
  const summaryLabel = issues.length
    ? ar
      ? `${issues.length === 1 ? "اختلاف واحد" : `${issues.length} اختلافات`} للمناقشة`
      : `${issues.length} ${issues.length === 1 ? "difference" : "differences"} to discuss`
    : unknowns.length
      ? ar
        ? `${unknowns.length} بنود تحتاج تأكيدًا`
        : `${unknowns.length} ${unknowns.length === 1 ? "field needs" : "fields need"} confirmation`
      : matchingCategoryLabel(result.category, language);
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
  const widths = [1.1, 1.15, 1, 0.5];
  return (
    <View
      testID={`matching-result-${result.propertyId}`}
      style={{
        borderWidth: 1,
        borderColor: "#D5DFED",
        borderRadius: 14,
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
            : `${rank}. ${ar ? "عرض المقارنة" : "View comparison"}`
        }
        testID={`matching-card-toggle-${requirement.id}-${result.propertyId}`}
        style={{
          padding: 12,
          gap: 8,
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
              fontSize: 15,
              lineHeight: 23,
            }}
          >
            {perspective === "properties"
              ? personRequestIndex === undefined
                ? personName ||
                  (ar ? "طلب مطابقة سريع" : "Quick matching request")
                : `${ar ? "الطلب" : "Request"} ${personRequestIndex}`
              : `${property ? getSavedPropertyTypeLabel(property, language, t(`propertyType.${property.core.propertyType}`)) : ar ? "عقار مرشح" : "Suggested property"} · ${area?.[language] ?? (ar ? "منطقة غير مسجلة" : "Unknown area")}`}
          </Text>
          {onToggle && (
            <Text
              style={{
                color: "#2563EB",
                fontFamily: fonts.semiBold,
                fontSize: 12,
                textAlign: "center",
                maxWidth: "32%",
                paddingHorizontal: 8,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: "#EFF6FF",
              }}
            >
              {expanded
                ? ar
                  ? "إخفاء المقارنة"
                  : "Hide comparison"
                : ar
                  ? "عرض المقارنة"
                  : "View comparison"}
            </Text>
          )}
        </View>
        {perspective === "people" && property && (
          <Text
            style={{
              ...text,
              color: "#2563EB",
              fontFamily: fonts.bold,
              fontSize: 14,
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
        )}
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
        {!expanded && (
          <View testID="matching-card-summary" style={{ gap: 3 }}>
            <MatchingStatusBadge status={summaryStatus} label={summaryLabel} />
            {issues.slice(0, 2).map((row) => (
              <Text
                key={row.field}
                style={{ ...text, fontSize: 12, lineHeight: 18 }}
              >
                {row.label}: {row.offered} · {ar ? "المطلوب" : "Requested"}{" "}
                {row.requested}
              </Text>
            ))}
            {issues.length > 0 && unknowns.length > 0 && (
              <Text style={{ ...text, color: "#946200", fontSize: 12 }}>
                {ar
                  ? `${unknowns.length} بنود أخرى تحتاج تأكيدًا`
                  : `${unknowns.length} other fields need confirmation`}
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
      {expanded && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}>
          {(issues.length > 0 || unknowns.length > 0) && (
            <View
              testID="matching-attention"
              style={{
                borderWidth: 1,
                borderColor: issues.length ? "#FECACA" : "#FDE68A",
                backgroundColor: issues.length ? "#FFF5F5" : "#FFFBEB",
                padding: 10,
                borderRadius: 10,
                gap: 5,
              }}
            >
              <Text
                style={{
                  ...text,
                  color: issues.length ? "#B91C1C" : "#946200",
                  fontFamily: fonts.semiBold,
                  fontSize: 13,
                }}
              >
                {issues.length
                  ? ar
                    ? "اختلاف يحتاج مناقشة"
                    : "Difference to discuss"
                  : ar
                    ? "معلومات تحتاج تأكيدًا"
                    : "Information to confirm"}
              </Text>
              {[...issues, ...unknowns].map((row) => (
                <MatchingStatusBadge
                  key={row.field}
                  status={row.status}
                  label={
                    row.status === "unknown"
                      ? `${row.label}: ${ar ? "غير مسجل" : "Not recorded"}`
                      : `${row.label}: ${row.offered} · ${ar ? "المطلوب" : "Requested"} ${row.requested}`
                  }
                />
              ))}
            </View>
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
                backgroundColor: "#DBEAFE",
              }}
            >
              {(ar
                ? ["البند", "المطلوب", "العقار", "الحالة"]
                : ["Field", "Request", "Property", "Status"]
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
                    fontSize: 11,
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
                  minHeight: 38,
                }}
              >
                {[
                  row.field === "budget"
                    ? `${row.label} (${requirement.budget.currencyCode})`
                    : row.label,
                  row.field === "budget"
                    ? row.requested.replace(
                        new RegExp(` ${requirement.budget.currencyCode}$`),
                        "",
                      )
                    : row.requested,
                  row.field === "budget"
                    ? row.offered.replace(
                        new RegExp(` ${requirement.budget.currencyCode}$`),
                        "",
                      )
                    : row.offered,
                ].map((value, column) => (
                  <Text
                    key={column}
                    style={{
                      ...text,
                      flex: widths[column],
                      minWidth: 0,
                      fontSize: 12,
                      lineHeight: 18,
                      paddingHorizontal: 4,
                      paddingVertical: 8,
                    }}
                  >
                    {value}
                  </Text>
                ))}
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
                    compact
                  />
                </View>
              </View>
            ))}
          </View>
          {requirement.budget.minimum !== undefined && result.priceAmount < requirement.budget.minimum && (
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
              style={{ minHeight: 44 }}
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
              textStyle={{ fontSize: 14 }}
              testID={`matching-open-${result.propertyId}`}
            />
            {onViewRequirement && (
              <Button
                title={ar ? "عرض الطلب" : "View request"}
                onPress={onViewRequirement}
                disabled={busy}
                variant="outline"
                style={{ flex: 1, minHeight: 48, paddingHorizontal: 8 }}
                textStyle={{ fontSize: 14 }}
                testID={`matching-request-${requirement.id}`}
              />
            )}
          </View>
          {onReplace && (
            <Button
              title={ar ? "اقتراح عقار آخر" : "Suggest another property"}
              onPress={onReplace}
              disabled={busy}
              variant="outline"
              style={{ minHeight: 44 }}
              textStyle={{ fontSize: 14 }}
              testID={`matching-replace-${result.propertyId}`}
            />
          )}
        </View>
      )}
    </View>
  );
}
