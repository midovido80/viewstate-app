import { Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type {
  MatchingPolicy,
  Property,
  SeekerRequirement,
} from "@workspace/property-domain";
import { useI18n } from "@/contexts/I18nContext";
import { MatchingResultCard } from "@/components/MatchingResultCard";
import { MatchingRefinements } from "@/components/MatchingRefinements";
import { MatchingConfirmationList } from "@/components/MatchingConfirmationList";
import { Button } from "@/components/Button";
import { getSavedPropertyTypeLabel } from "@/services/savedPropertyClassification";
import { getAreaById } from "@/constants/kuwait-areas";
import { formatPrice, formatRentalPrice } from "@/constants/market";
import {
  groupMatchingByProperty,
  matchingCountLabel,
  personPropertyCounts,
  propertyPeopleCounts,
  type MatchingPair,
  type MatchingResultsLayout,
} from "@/services/matchingGroups";
import type { MatchAllPersonGroup } from "@/services/matchingUi";

export function MatchingResultsGroups({
  groups,
  properties,
  layout,
  onLayoutChange,
  policies,
  busy,
  onRefine,
  onReplace,
  onOpenProperty,
  onOpenPerson,
  onOpenRequest,
  quick = false,
}: {
  groups: readonly MatchAllPersonGroup[];
  properties: readonly Property[];
  layout: MatchingResultsLayout;
  onLayoutChange: (layout: MatchingResultsLayout) => void;
  policies: Record<string, MatchingPolicy>;
  busy: boolean;
  onRefine: (id: string, policy: MatchingPolicy) => void;
  onReplace: (requirementId: string, propertyId: string) => void;
  onOpenProperty: (id: string) => void;
  onOpenPerson?: (id: string) => void;
  onOpenRequest?: (id: string) => void;
  quick?: boolean;
}) {
  const { language, isRTL, fonts, t } = useI18n();
  const ar = language === "ar";
  const direction = isRTL ? ("row-reverse" as const) : ("row" as const);
  const text = {
    color: "#334155",
    fontFamily: fonts.regular,
    textAlign: isRTL ? ("right" as const) : ("left" as const),
  };
  const propertyGroups = groupMatchingByProperty(groups);
  const firstGroup =
    layout.view === "people"
      ? groups[0] && `person:${groups[0].person.id}`
      : propertyGroups[0] && `property:${propertyGroups[0].propertyId}`;
  const openGroup = layout.group === undefined ? firstGroup : layout.group;
  const toggleGroup = (key: string) =>
    onLayoutChange({
      ...layout,
      group: openGroup === key ? null : key,
      card: undefined,
    });
  const cardKey = (pair: MatchingPair) =>
    JSON.stringify([pair.requirement.id, pair.result.propertyId]);
  const pairCard = (
    pair: MatchingPair,
    personName: string,
    personId: string,
    firstCard: string | undefined,
    pending = false,
    personRequestIndex?: number,
  ) => {
    const key = cardKey(pair);
    const expanded =
      layout.card === undefined
        ? !pending && key === firstCard
        : layout.card === key;
    return (
      <MatchingResultCard
        key={key}
        result={pair.result}
        rank={1}
        property={properties.find(
          (item) => item.core.id === pair.result.propertyId,
        )}
        requirement={pair.requirement}
        personName={personName}
        perspective={layout.view}
        personRequestIndex={personRequestIndex}
        expanded={expanded}
        onToggle={() =>
          onLayoutChange({ ...layout, card: expanded ? null : key })
        }
        busy={busy}
        onPress={() => onOpenProperty(pair.result.propertyId)}
        onViewPerson={onOpenPerson ? () => onOpenPerson(personId) : undefined}
        onViewRequirement={
          onOpenRequest ? () => onOpenRequest(pair.requirement.id) : undefined
        }
        onReplace={
          pending
            ? undefined
            : () => onReplace(pair.requirement.id, pair.result.propertyId)
        }
      />
    );
  };
  const summary = (requirement: SeekerRequirement) => (
    <View style={{ gap: 4 }}>
      <Text style={{ ...text, fontFamily: fonts.medium, fontSize: 13 }}>
        {t(`matching.purpose.${requirement.purpose}`)} ·{" "}
        {t(`propertyType.${requirement.propertyType}`)} ·{" "}
        {requirement.budget.minimum}–{requirement.budget.maximum}{" "}
        {requirement.budget.currencyCode}
      </Text>
      <Text style={{ ...text, fontSize: 12 }}>
        {requirement.preferredAreaMode === "all_kuwait"
          ? ar
            ? "كل الكويت"
            : "All Kuwait"
          : requirement.preferredAreaIds
              .map(
                (id) =>
                  getAreaById(id)?.[language] ??
                  (ar ? "منطقة محددة" : "Selected area"),
              )
              .join(" · ")}
      </Text>
    </View>
  );
  const counts = (
    ready: number,
    pending: number,
    unit: "properties" | "people",
  ) => (
    <View style={{ gap: 3 }}>
      {ready > 0 && (
        <Text style={{ ...text, fontSize: 12 }}>
          {matchingCountLabel(ready, unit, false, language)}
        </Text>
      )}
      {pending > 0 && (
        <Text style={{ ...text, color: "#946200", fontSize: 12 }}>
          {matchingCountLabel(pending, unit, true, language)}
        </Text>
      )}
    </View>
  );
  const personReadyCount = groups.filter(
    (group) => personPropertyCounts(group).ready > 0,
  ).length;
  const propertyReadyCount = propertyGroups.filter(
    (group) => propertyPeopleCounts(group).ready > 0,
  ).length;
  return (
    <View style={{ gap: 12 }} testID="matching-grouped-results">
      <View
        style={{
          direction: "ltr",
          flexDirection: direction,
          backgroundColor: "#EAF0F8",
          borderRadius: 12,
          padding: 4,
          gap: 4,
        }}
        accessibilityRole="tablist"
      >
        {(["people", "properties"] as const).map((view) => (
          <TouchableOpacity
            key={view}
            testID={`matching-view-${view}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: layout.view === view }}
            onPress={() => onLayoutChange({ view })}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9,
              backgroundColor: layout.view === view ? "#2563EB" : "transparent",
            }}
          >
            <Text
              style={{
                ...text,
                fontFamily: fonts.semiBold,
                color: layout.view === view ? "#FFFFFF" : "#475569",
              }}
            >
              {view === "people"
                ? ar
                  ? "حسب الأشخاص"
                  : "By people"
                : ar
                  ? "حسب العقارات"
                  : "By properties"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text testID="matching-distinct-counts" style={{ ...text, fontSize: 12 }}>
        {propertyReadyCount > 0
          ? quick
            ? matchingCountLabel(
                propertyReadyCount,
                "properties",
                false,
                language,
              )
            : ar
              ? `${personReadyCount} أشخاص لديهم ترشيحات · ${propertyReadyCount} عقارات مرشحة`
              : `${personReadyCount} people with suggestions · ${propertyReadyCount} suggested properties`
          : propertyGroups.length > 0
            ? ar
              ? "نتائج تحتاج تأكيد معلومات"
              : "Results need information confirmation"
            : ar
              ? "نتائج المطابقة"
              : "Matching results"}
      </Text>
      {layout.view === "people"
        ? groups.map((group) => {
            const key = `person:${group.person.id}`;
            const open = openGroup === key;
            const count = personPropertyCounts(group);
            const firstCard = group.requirementGroups.flatMap((item) =>
              item.matches.map((result) =>
                cardKey({ requirement: item.requirement, result }),
              ),
            )[0];
            return (
              <View
                key={key}
                testID={`matching-person-group-${group.person.id}`}
                style={{ gap: 10 }}
              >
                <TouchableOpacity
                  onPress={() => toggleGroup(key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  testID={`matching-person-${group.person.id}`}
                  style={{
                    direction: "ltr",
                    flexDirection: direction,
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#FFF4E8",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      style={{
                        ...text,
                        color: "#B45309",
                        fontFamily: fonts.bold,
                        fontSize: 19,
                      }}
                    >
                      {group.person.name}
                    </Text>
                    {group.requirementGroups.length === 1 ? (
                      counts(count.ready, count.pending, "properties")
                    ) : (
                      <Text style={{ ...text, fontSize: 12 }}>
                        {ar
                          ? `${group.requirementGroups.length} طلبات · ${count.ready} عقارات مرشحة`
                          : `${group.requirementGroups.length} requests · ${count.ready} suggested properties`}
                      </Text>
                    )}
                  </View>
                  <Feather
                    name={open ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#173F78"
                    accessible={false}
                  />
                </TouchableOpacity>
                {open &&
                  group.requirementGroups.map((item) => (
                    <View
                      key={item.requirement.id}
                      style={{ gap: 10 }}
                      testID={`matching-request-group-${item.requirement.id}`}
                    >
                      {summary(item.requirement)}
                      {group.requirementGroups.length > 1 &&
                        counts(
                          new Set(
                            item.matches.map((result) => result.propertyId),
                          ).size,
                          new Set(
                            item.needsConfirmation.map(
                              (result) => result.propertyId,
                            ),
                          ).size,
                          "properties",
                        )}
                      <MatchingRefinements
                        requirement={item.requirement}
                        policy={policies[item.requirement.id] ?? {}}
                        busy={busy}
                        onChange={(policy) =>
                          onRefine(item.requirement.id, policy)
                        }
                      />
                      {item.matches.map((result) =>
                        pairCard(
                          { requirement: item.requirement, result },
                          group.person.name,
                          group.person.id,
                          firstCard,
                        ),
                      )}
                      <MatchingConfirmationList
                        count={item.needsConfirmation.length}
                        unit="properties"
                      >
                        {item.needsConfirmation.map((result) =>
                          pairCard(
                            { requirement: item.requirement, result },
                            group.person.name,
                            group.person.id,
                            undefined,
                            true,
                          ),
                        )}
                      </MatchingConfirmationList>
                    </View>
                  ))}
              </View>
            );
          })
        : propertyGroups.map((group) => {
            const key = `property:${group.propertyId}`;
            const open = openGroup === key;
            const count = propertyPeopleCounts(group);
            const property = properties.find(
              (item) => item.core.id === group.propertyId,
            );
            const firstCard = group.people.flatMap((person) =>
              person.ready.map(cardKey),
            )[0];
            return (
              <View
                key={key}
                testID={`matching-property-group-${group.propertyId}`}
                style={{
                  gap: 10,
                  borderWidth: 1,
                  borderColor: "#D5DFED",
                  borderRadius: 14,
                  padding: 10,
                  backgroundColor: "#FFFFFF",
                }}
              >
                <TouchableOpacity
                  onPress={() => toggleGroup(key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  testID={`matching-property-toggle-${group.propertyId}`}
                  style={{
                    direction: "ltr",
                    flexDirection: direction,
                    alignItems: "center",
                    gap: 8,
                    minHeight: 48,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      style={{
                        ...text,
                        color: "#173F78",
                        fontFamily: fonts.bold,
                        fontSize: 16,
                      }}
                    >
                      {property
                        ? `${getSavedPropertyTypeLabel(property, language, t(`propertyType.${property.core.propertyType}`))} · ${getAreaById(property.core.locationArea.id)?.[language] ?? ""}`
                        : ar
                          ? "عقار مرشح"
                          : "Suggested property"}
                    </Text>
                    {property && (
                      <Text
                        style={{
                          ...text,
                          color: "#2563EB",
                          fontFamily: fonts.bold,
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
                    {counts(count.ready, count.pending, "people")}
                  </View>
                  <Feather
                    name={open ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#173F78"
                    accessible={false}
                  />
                </TouchableOpacity>
                {open && (
                  <>
                    <Button
                      title={ar ? "عرض العقار" : "View property"}
                      variant="outline"
                      style={{ minHeight: 44 }}
                      onPress={() => onOpenProperty(group.propertyId)}
                    />
                    {group.people
                      .filter((person) => person.ready.length > 0)
                      .map((person) => (
                        <View key={person.person.id} style={{ gap: 8 }}>
                          {person.ready.length > 1 && (
                            <Text
                              style={{
                                ...text,
                                color: "#B45309",
                                backgroundColor: "#FFF4E8",
                                padding: 10,
                                borderRadius: 10,
                                fontFamily: fonts.semiBold,
                              }}
                            >
                              {person.person.name} ·{" "}
                              {ar
                                ? `${person.ready.length} طلبات مناسبة`
                                : `${person.ready.length} suitable requests`}
                            </Text>
                          )}
                          {person.ready.map((pair, index) =>
                            pairCard(
                              pair,
                              person.person.name,
                              person.person.id,
                              firstCard,
                              false,
                              person.ready.length > 1 ? index + 1 : undefined,
                            ),
                          )}
                        </View>
                      ))}
                    <MatchingConfirmationList
                      count={count.pending}
                      unit="people"
                    >
                      {group.people
                        .filter((person) => person.pending.length > 0)
                        .map((person) => (
                          <View key={person.person.id} style={{ gap: 8 }}>
                            {person.pending.map((pair) =>
                              pairCard(
                                pair,
                                person.person.name,
                                person.person.id,
                                undefined,
                                true,
                              ),
                            )}
                          </View>
                        ))}
                    </MatchingConfirmationList>
                  </>
                )}
              </View>
            );
          })}
      {groups.length === 0 && (
        <Text style={{ ...text, padding: 12 }}>
          {ar
            ? "لا توجد ترشيحات مناسبة للطلبات المسجلة حاليًا."
            : "No suitable suggestions for the recorded requests right now."}
        </Text>
      )}
    </View>
  );
}
