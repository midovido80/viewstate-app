import { compactPropertyLabel } from "@/services/compactPropertyLabel";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import type { Property, SeekerRequirement } from "@workspace/property-domain";
import type { Person } from "@/services/people";
import { useNextExperience } from "@/contexts/NextExperienceContext";
import { useI18n } from "@/contexts/I18nContext";
import { PropertyCover } from "@/components/PropertyCover";
import { getAreaById } from "@/constants/kuwait-areas";
import { nextDesign as n } from "@/constants/nextDesign";
export function NextRecentWork({
  properties,
  people,
  requirements,
  limit = 4,
  full = false,
  loading = false,
}: {
  properties: readonly Property[];
  people: readonly Person[];
  requirements: readonly SeekerRequirement[];
  limit?: number;
  full?: boolean;
  loading?: boolean;
}) {
  const next = useNextExperience(),
    { language, isRTL, fonts, t } = useI18n(),
    router = useRouter(),
    ar = language === "ar";
  if (loading || (!next.ready && !next.error))
    return (
      <ActivityIndicator
        color={n.blue}
        accessibilityLabel={ar ? "تحميل آخر السجلات" : "Loading recent records"}
      />
    );
  const rows = next.state.recent.flatMap<{
    key: string;
    property?: Property;
    title: string;
    sub: string;
    href: string;
  }>((item) => {
    if (item.kind === "property") {
      const p = properties.find((p) => p.core.id === item.id);
      return p
        ? [
            {
              key: "property:" + item.id,
              property: p,
              title: compactPropertyLabel(
                p,
                language,
                t(`propertyType.${p.core.propertyType}`),
              ),
              sub: getAreaById(p.core.locationArea.id)?.[language] || "",
              href: "/property/" + encodeURIComponent(item.id),
            },
          ]
        : [];
    }
    if (item.kind === "person") {
      const p = people.find((p) => p.id === item.id);
      return p
        ? [
            {
              key: "person:" + item.id,
              property: undefined,
              title: p.name,
              sub: ar ? "ملف شخص" : "Person profile",
              href: "/person/" + encodeURIComponent(item.id),
            },
          ]
        : [];
    }
    const r = requirements.find((r) => r.id === item.id);
    return r
      ? [
          {
            key: "requirement:" + item.id,
            property: undefined,
            title:
              people.find((p) => p.id === r.seekerId)?.name ||
              (ar ? "طلب عميل" : "Client request"),
            sub: t(`propertyType.${r.propertyType}`),
            href: "/requirement/view/" + encodeURIComponent(item.id),
          },
        ]
      : [];
  });
  const fallback =
    !full && !rows.length
      ? properties
          .slice(-3)
          .reverse()
          .map((p) => ({
            key: "property:" + p.core.id,
            property: p,
            title: compactPropertyLabel(
              p,
              language,
              t(`propertyType.${p.core.propertyType}`),
            ),
            sub: getAreaById(p.core.locationArea.id)?.[language] || "",
            href: "/property/" + encodeURIComponent(p.core.id),
          }))
      : [];
  const shown = (rows.length ? rows : fallback).slice(0, limit),
    align = isRTL ? "right" : "left";
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          direction: "ltr",
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fonts.bold,
            fontSize: 19,
            color: n.ink,
            textAlign: align,
          }}
        >
          {rows.length || full
            ? ar
              ? "آخر ما عملت عليه"
              : "Recently worked on"
            : ar
              ? "عروضك المحفوظة"
              : "Your saved offers"}
        </Text>
        {!full && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                (rows.length ? "/next-recent" : "/properties") as never,
              )
            }
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ color: n.blue, fontFamily: fonts.semiBold }}>
              {ar ? "عرض الكل" : "View all"}
            </Text>
          </Pressable>
        )}
      </View>
      {next.error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void next.reload()}
          style={{ minHeight: 44 }}
        >
          <Text
            style={{
              color: n.red,
              fontFamily: fonts.regular,
              textAlign: align,
            }}
          >
            {ar
              ? "تعذر تحميل سجل الزيارات. اضغط لإعادة المحاولة؛ سجلاتك الأصلية لم تتغير."
              : "Recent visits could not load. Tap to retry; your work records are unchanged."}
          </Text>
        </Pressable>
      ) : null}
      <View
        style={{
          borderWidth: 1,
          borderColor: n.border,
          borderRadius: 16,
          backgroundColor: n.white,
          overflow: "hidden",
        }}
      >
        {shown.length ? (
          shown.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              testID={`next-recent-${item.key}`}
              onPress={() => router.push(item.href as never)}
              style={{
                direction: "ltr",
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                minHeight: 86,
                borderBottomWidth: 1,
                borderColor: n.border,
              }}
            >
              {item.property ? (
                <PropertyCover
                  property={item.property}
                  style={{ width: 64, height: 58, borderRadius: 10 }}
                />
              ) : (
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 10,
                    backgroundColor: n.soft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather
                    name={item.key.startsWith("person") ? "user" : "file-text"}
                    size={24}
                    color={n.blue}
                  />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text
                  style={{
                    fontFamily: fonts.semiBold,
                    color: n.ink,
                    fontSize: 15,
                    textAlign: align,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.regular,
                    color: n.muted,
                    fontSize: 13,
                    textAlign: align,
                  }}
                >
                  {item.sub}
                </Text>
              </View>
              <Feather
                name={isRTL ? "chevron-left" : "chevron-right"}
                size={18}
                color={n.muted}
              />
            </Pressable>
          ))
        ) : (
          <View style={{ padding: 20, gap: 8 }}>
            <Text
              style={{
                fontFamily: fonts.semiBold,
                color: n.ink,
                textAlign: align,
              }}
            >
              {ar ? "ابدأ بعرض أو طلب" : "Start with an offer or request"}
            </Text>
            <Text
              style={{
                fontFamily: fonts.regular,
                color: n.muted,
                textAlign: align,
              }}
            >
              {ar
                ? "السجلات التي تفتحها ستظهر هنا."
                : "Records you open will appear here."}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
