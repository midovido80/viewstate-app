import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { Property, SeekerRequirement } from "@workspace/property-domain";
import type { Person } from "@/services/people";
import { useI18n } from "@/contexts/I18nContext";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { nextDesign as n } from "@/constants/nextDesign";
import { PropertyCover } from "@/components/PropertyCover";
import { getPropertyCardSummary } from "@/services/cardSummaryPresentation";
import { formatPrice, formatRentalPrice } from "@/constants/market";
import { matchingTarget } from "@/services/matchingScope";

/** A new presentation surface over the original catalog, matching and task commands.
 * No sample records, alternate repositories, or demo scoring enter the real app.
 */
export function NextHomeCanvas({
  ready,
  properties,
  requirements,
  people,
  date,
  matches,
  matchStatus,
  retryMatches,
  tasks,
  taskCount,
  openTasks,
  addTask,
  openCalendar,
  openRequests,
  notice,
}: {
  ready: boolean;
  properties: readonly Property[];
  requirements: readonly SeekerRequirement[];
  people: readonly Person[];
  date: string;
  matches: number;
  matchStatus: "loading" | "ready" | "error";
  retryMatches: () => void;
  tasks: React.ReactNode;
  taskCount: number;
  openTasks: () => void;
  addTask: () => void;
  openCalendar: () => void;
  openRequests: () => void;
  notice?: React.ReactNode;
}) {
  const router = useRouter(),
    { language, fonts, isRTL, t } = useI18n(),
    insets = useScreenInsets();
  const { fontScale } = useWindowDimensions();
  const ar = language === "ar",
    align = isRTL ? ("right" as const) : ("left" as const);
  const row = isRTL ? ("row-reverse" as const) : ("row" as const);
  const text = { color: n.ink, fontFamily: fonts.regular, textAlign: align };
  const heading = {
    ...text,
    fontFamily: fonts.bold,
    fontSize: 19,
    lineHeight: 28,
  };
  const small = { ...text, color: n.muted, fontSize: 13, lineHeight: 21 };
  const action = (label: string, onPress: () => void, id?: string) => (
    <Pressable
      testID={id}
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6 }}
    >
      <Text style={{ color: n.blue, fontFamily: fonts.semiBold, fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView
      testID="assistant-page-scroll"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: n.background }}
      contentContainerStyle={{
        padding: 18,
        paddingTop: 8,
        paddingBottom: insets.bottom + 28,
        gap: 24,
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
      }}
    >
      <View style={{ gap: 10 }}>
        <Text style={{ ...small, fontSize: 12 }}>{date}</Text>
        <Text
          accessibilityRole="header"
          style={{ ...heading, fontSize: 27, lineHeight: 38 }}
        >
          {ar
            ? "شغلك العقاري، في مكان واحد."
            : "Your property work, in one place."}
        </Text>
        <Text style={small}>
          {ar
            ? "احفظ العرض، سجّل طلب العميل، واعرف ما يناسبه."
            : "Save the offer, record the request, and find what fits."}
        </Text>
      </View>
      {notice}
      <View
        style={{ flexDirection: fontScale > 1.4 ? "column" : row, gap: 10 }}
        testID="next-home-primary-tasks"
      >
        {[
          {
            id: "property",
            icon: "grid" as const,
            title: ar ? "أضف عقارًا" : "Add a property",
            hint: ar
              ? "عرض وصلك؟ احفظ الأساسيات أولًا."
              : "An offer came in? Save the basics first.",
            href: "/capture/transaction?mode=offered",
            main: true,
          },
          {
            id: "request",
            icon: "users" as const,
            title: ar ? "سجّل طلب عميل" : "Record a client request",
            hint: ar
              ? "ماذا يبحث عنه، وفي أي ميزانية؟"
              : "What are they looking for, and in which budget?",
            href: "/capture/transaction?mode=wanted",
            main: false,
          },
        ].map((item) => (
          <Pressable
            key={item.id}
            testID={`next-home-add-${item.id}`}
            accessibilityRole="button"
            onPress={() => router.push(item.href as never)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 158,
              borderRadius: 14,
              padding: 17,
              gap: 10,
              backgroundColor: item.main ? n.blue : n.soft,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Feather
              name={item.icon}
              size={23}
              color={item.main ? "white" : n.navy}
              style={{ alignSelf: ar ? "flex-end" : "flex-start" }}
            />
            <Text
              style={{
                ...heading,
                color: item.main ? "white" : n.navy,
                fontSize: 20,
              }}
            >
              {item.title}
            </Text>
            <Text style={{ ...small, color: item.main ? "#FFFFFF" : n.muted }}>
              {item.hint}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: row,
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Text accessibilityRole="header" style={heading}>
            {ar ? "عروضك المحفوظة" : "Your saved offers"}
          </Text>
          {action(ar ? "عرض الكل" : "View all", () =>
            router.push("/properties" as never),
          )}
        </View>
        <View
          style={{
            backgroundColor: n.white,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: n.border,
            overflow: "hidden",
          }}
        >
          {!ready ? (
            <ActivityIndicator style={{ padding: 22 }} color={n.blue} />
          ) : properties.length ? (
            properties
              .slice(-3)
              .reverse()
              .map((property) => {
                const summary = getPropertyCardSummary(property, {
                  language,
                  translate: t,
                  formatPrice: (amount, currency) =>
                    formatPrice(amount, currency, language),
                  formatRentalPrice: (amount, currency, period) =>
                    formatRentalPrice(amount, currency, period, language, t),
                });
                return (
                  <Pressable
                    key={property.core.id}
                    accessibilityRole="button"
                    testID={`next-home-property-${property.core.id}`}
                    onPress={() =>
                      router.push(
                        `/property/${encodeURIComponent(property.core.id)}` as never,
                      )
                    }
                    style={{
                      padding: 14,
                      gap: 12,
                      flexDirection: row,
                      alignItems: "center",
                      minHeight: 88,
                      borderBottomWidth: 1,
                      borderBottomColor: n.border,
                    }}
                  >
                    <PropertyCover
                      property={property}
                      style={{ width: 64, height: 58, borderRadius: 10 }}
                    />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text
                        style={{
                          ...text,
                          fontFamily: fonts.semiBold,
                          fontSize: 15,
                        }}
                      >
                        {property.listingTitle?.trim() ||
                          summary.subtypeLabel ||
                          summary.typeLabel}
                      </Text>
                      <Text style={small}>{summary.areaLabel}</Text>
                    </View>
                    <Feather
                      name={ar ? "chevron-left" : "chevron-right"}
                      color={n.muted}
                      size={19}
                    />
                  </Pressable>
                );
              })
          ) : (
            <View style={{ padding: 20, gap: 8 }}>
              <Text style={heading}>
                {ar ? "ابدأ بأول عرض وصلك" : "Start with your first offer"}
              </Text>
              <Text style={small}>
                {ar
                  ? "احفظ الأساسيات الآن، وأكمل التفاصيل لاحقًا."
                  : "Save the basics now. Add the details later."}
              </Text>
              {action(ar ? "إضافة عقار" : "Add property", () =>
                router.push("/capture/transaction?mode=offered" as never),
              )}
            </View>
          )}
        </View>
      </View>
      <View
        testID="home-best-matches"
        style={{
          padding: 18,
          backgroundColor: n.white,
          borderWidth: 1,
          borderColor: n.border,
          borderRadius: 16,
          gap: 10,
        }}
      >
        <Text accessibilityRole="header" style={heading}>
          {ar ? "فرص تستحق المتابعة" : "Opportunities worth following up"}
        </Text>
        <Text style={small}>
          {ar
            ? "أفضل النتائج من العروض وطلبات العملاء المحفوظة."
            : "Top results from your saved offers and client requests."}
        </Text>
        {matchStatus === "loading" ? (
          <ActivityIndicator color={n.blue} />
        ) : matchStatus === "error" ? (
          <>
            <Text accessibilityRole="alert" style={small}>
              {ar
                ? "تعذر تحميل المطابقات. بياناتك ما زالت محفوظة."
                : "Matches could not load. Your records remain saved."}
            </Text>
            {action(ar ? "إعادة المحاولة" : "Retry", retryMatches)}
          </>
        ) : (
          <View
            style={{
              flexDirection: row,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{ fontFamily: fonts.bold, color: n.blue, fontSize: 30 }}
            >
              {matches}
            </Text>
            {action(
              ar ? "شوف المناسب ولماذا" : "See what fits and why",
              () => router.push(matchingTarget({ kind: "best" }) as never),
              "next-home-open-matches",
            )}
          </View>
        )}
      </View>
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: row,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text accessibilityRole="header" style={heading}>
            {ar ? "متابعاتك القادمة" : "Upcoming follow-ups"}
          </Text>
          {action(ar ? "عرض الكل" : "View all", openTasks)}
        </View>
        <View
          testID="assistant-task-list"
          style={{
            backgroundColor: n.white,
            borderWidth: 1,
            borderColor: n.border,
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {!ready ? (
            <ActivityIndicator style={{ padding: 22 }} color={n.blue} />
          ) : taskCount ? (
            tasks
          ) : (
            <Text style={{ ...small, padding: 18 }}>
              {ar
                ? "لا توجد متابعات قادمة. أضف موعدك التالي."
                : "No upcoming follow-ups. Add your next appointment."}
            </Text>
          )}
          {action(ar ? "إضافة متابعة" : "Add follow-up", addTask)}
        </View>
        <Pressable
          testID="home-compact-calendar"
          accessibilityRole="button"
          onPress={openCalendar}
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: n.soft,
            flexDirection: row,
            alignItems: "center",
            gap: 9,
            minHeight: 48,
          }}
        >
          <Feather name="calendar" color={n.blue} size={19} />
          <Text style={{ ...text, flex: 1, fontFamily: fonts.semiBold }}>
            {ar ? "التقويم والمتابعات" : "Calendar & follow-ups"}
          </Text>
          <Feather
            name={ar ? "chevron-left" : "chevron-right"}
            color={n.blue}
            size={17}
          />
        </Pressable>
      </View>
      <View style={{ flexDirection: row, gap: 6 }}>
        {[
          [
            properties.length,
            ar ? "عقارات" : "Properties",
            () => router.push("/properties" as never),
          ],
          [
            people.length,
            ar ? "أشخاص" : "People",
            () => router.push("/people" as never),
          ],
          [
            requirements.length,
            ar ? "طلبات عملاء" : "Client requests",
            openRequests,
          ],
        ].map(([count, label, onPress]) => (
          <Pressable
            key={String(label)}
            accessibilityRole="button"
            onPress={onPress as () => void}
            style={{
              flex: 1,
              minHeight: 70,
              gap: 3,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{ color: n.ink, fontFamily: fonts.bold, fontSize: 22 }}
            >
              {ready ? String(count) : "—"}
            </Text>
            <Text style={{ ...small, textAlign: "center" }}>
              {String(label)}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
