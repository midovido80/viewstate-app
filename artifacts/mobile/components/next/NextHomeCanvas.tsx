import { NextFirstUse } from "./NextFirstUse";
import { NextRecentWork } from "./NextRecentWork";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { Property, SeekerRequirement } from "@workspace/property-domain";
import type { Person } from "@/services/people";
import { useI18n } from "@/contexts/I18nContext";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { nextDesign as n } from "@/constants/nextDesign";
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
        gap: 14,
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
      }}
    >
      <View style={{ gap: 6 }}>
        <Text style={{ ...text, fontSize: 16, fontFamily: fonts.bold }}>{date}</Text>
        <Pressable
          testID="home-compact-calendar"
          accessibilityRole="button"
          onPress={openCalendar}
          style={{
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: n.soft,
            direction: "ltr",
            flexDirection: row,
            alignItems: "center",
            gap: 9,
            minHeight: 44,
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
        <Text
          accessibilityRole="header"
          style={{ ...heading, fontSize: 19, lineHeight: 26 }}
        >
          {ar
            ? "شغلك العقاري، في مكان واحد."
            : "Your property work, in one place."}
        </Text>

      </View>
      <NextFirstUse />
      {notice}
      <Pressable
        testID="next-home-trust-circle"
        accessibilityRole="button"
        accessibilityLabel={ar ? "دائرة الثقة" : "Trust Circle"}
        onPress={() => router.push("/trust-circle" as never)}
        style={({ pressed }) => ({
          alignItems: "center", justifyContent: "center", minHeight: 138,
          backgroundColor: n.soft, borderColor: n.border, borderWidth: 1,
          borderRadius: 16, opacity: pressed ? 0.8 : 1,
        })}
      >
        <View style={{ width: 132, height: 120, alignItems: "center", justifyContent: "center" }}>
          <Svg pointerEvents="none" width={132} height={120} viewBox="0 0 132 120" style={{ position: "absolute" }}>
            <Circle cx={66} cy={60} r={48} fill="none" stroke={n.blue} strokeWidth={2} />
            {[[66, 12], [100, 26], [114, 60], [100, 94], [66, 108], [32, 94], [18, 60], [32, 26]].map(([cx, cy]) =>
              <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={6} fill={n.blue} stroke={n.soft} strokeWidth={2} />)}
          </Svg>
          <Text style={{ color: n.navy, fontFamily: fonts.bold, fontSize: 15, textAlign: "center" }}>
            {ar ? "دائرة الثقة" : "Trust Circle"}
          </Text>
        </View>
      </Pressable>
      <Pressable
        testID="next-paste-message"
        accessibilityRole="button"
        onPress={() => router.push("/intake" as never)}
        style={{
          direction: "ltr",
          flexDirection: row,
          alignItems: "center",
          gap: 10,
          borderWidth: 1,
          borderColor: "#25D36644",
          backgroundColor: "#25D3661A",
          borderRadius: 12,
          padding: 14,
          minHeight: 48,
        }}
      >
        <Feather name="message-circle" size={19} color="#17643B" />
        <View style={{ flex: 1 }}>
          <Text style={{ ...text, color: "#17643B", fontFamily: fonts.bold, fontSize: 14 }}>
            {ar ? "استيراد رسالة أو إعلان" : "Import a message or listing"}
          </Text>
          <Text style={small}>{ar ? "من واتساب أو أي تطبيق آخر" : "From WhatsApp or another app"}</Text>
        </View>
      </Pressable>
      <NextRecentWork
        loading={!ready}
        properties={properties}
        people={people}
        requirements={requirements}
      />
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
              direction: "ltr",
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
            direction: "ltr",
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

      </View>
      <View style={{ direction: "ltr", flexDirection: row, gap: 6 }}>
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
