import { WorkspaceBannerContext } from "@/contexts/WorkspaceBannerContext";
import { circleHeaderTopInset } from "@/services/circleWorkspaceLayout";
import { Text } from "@/components/AppText";
import { Feather } from "@expo/vector-icons";
import { useCallback, useContext, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { Property, SeekerRequirement } from "@workspace/property-domain";
import { CircleMatchingPanel } from "@/components/CircleMatchingPanel";
import { Button } from "@/components/Button";
import { useI18n } from "@/contexts/I18nContext";
import { useRealAccount } from "@/contexts/RealAccountContext";
import { useUserData } from "@/contexts/UserDataContext";
import { useColors } from "@/hooks/useColors";
import { useScreenInsets } from "@/hooks/useScreenInsets";

export default function TrustCircleScreen() {
  const { language, fonts, isRTL } = useI18n();
  const L = (ar: string, en: string) => (language === "ar" ? ar : en);
  const colors = useColors();
  const router = useRouter();
  const {
    requestId,
    propertyId,
    circleId,
    noticeKind,
    noticeTargetId,
    create,
  } = useLocalSearchParams<{
    requestId?: string;
    propertyId?: string;
    circleId?: string;
    noticeKind?: string;
    noticeTargetId?: string;
    create?: string;
  }>();
  const initialMatch =
    typeof requestId === "string"
      ? { kind: "request" as const, id: requestId }
      : typeof propertyId === "string"
        ? { kind: "property" as const, id: propertyId }
        : undefined;
  const insets = useScreenInsets();
  const banner = useContext(WorkspaceBannerContext);
  const account = useRealAccount();
  const { store } = useUserData();
  const [data, setData] = useState<{
    properties: Property[];
    requirements: SeekerRequirement[];
  }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const owner = account?.profile.user_id;
  useFocusEffect(
    useCallback(() => {
      if (!owner) return;
      let active = true;
      setFailed(false);
      void Promise.all([store.getProperties(), store.getRequirements()])
        .then(([properties, requirements]) => {
          if (active) setData({ properties, requirements });
        })
        .catch(() => {
          if (active) setFailed(true);
        });
      return () => {
        active = false;
      };
    }, [store, owner, attempt]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: circleHeaderTopInset(insets.top, banner),
          paddingHorizontal: 16,
          paddingBottom: 8,
          direction: "ltr",
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L("رجوع", "Back")}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          style={{
            width: 48,
            height: 48,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Feather
            name={isRTL ? "arrow-right" : "arrow-left"}
            size={23}
            color={colors.foreground}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.foreground,
            fontFamily: fonts.bold,
            fontSize: 23,
            flex: 1,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {L("دائرة الثقة", "Trust Circle")}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        {!account ? (
          <>
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.regular,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {L(
                "سجّل الدخول بحساب Google عشان تشارك العقارات وتتعاون مع بروكرز تثق فيهم.",
                "Sign in with Google to share listings and collaborate with brokers you trust.",
              )}
            </Text>
            <Button
              title={L("تفعيل حسابي", "Activate my account")}
              onPress={() => router.push("/account/account")}
            />
          </>
        ) : failed ? (
          <Button
            title={L(
              "تعذّر تحميل البيانات. أعد المحاولة",
              "Could not load your records. Retry",
            )}
            onPress={() => setAttempt((value) => value + 1)}
          />
        ) : data ? (
          <CircleMatchingPanel
            fullScreen
            initialCreate={create === "1"}
            key={noticeTargetId ?? initialMatch?.id ?? circleId ?? owner}
            noticeKind={noticeKind}
            noticeTargetId={noticeTargetId}
            initialCircleId={
              typeof circleId === "string" ? circleId : undefined
            }
            initialMatch={initialMatch}
            request={account.request}
            owner={account.profile.user_id}
            properties={data.properties}
            requirements={data.requirements}
          />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    </View>
  );
}
