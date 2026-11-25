import { Text } from "@/components/AppText";
import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import {
  listCircleJoinReviews,
  reviewCircleJoin,
  type CircleJoinReview,
} from "@/services/circleJoinApproval";
import type { CloudRequest } from "@/services/workspaceCloud";
import { Action, AssistantText } from "./assistant/ui";

export function CircleJoinReviewPanel({
  circleId,
  request,
  onChanged,
}: {
  circleId: string;
  request: CloudRequest;
  onChanged: () => Promise<void>;
}) {
  const { language, fonts } = useI18n(),
    colors = useColors();
  const L = (ar: string, en: string) => (language === "ar" ? ar : en);
  const [reviews, setReviews] = useState<CircleJoinReview[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const api = useRef(request),
    changed = useRef(onChanged),
    active = useRef(false),
    flight = useRef(false);
  api.current = request;
  changed.current = onChanged;
  useEffect(() => {
    active.current = true;
    let live = true,
      loading = false;
    const load = async () => {
      if (loading || flight.current || AppState.currentState === "background")
        return;
      loading = true;
      try {
        const rows = await listCircleJoinReviews(api.current, circleId);
        if (live) {
          setReviews(rows);
          setFailed(false);
        }
      } catch {
        if (live) {
          setReviews([]);
          setFailed(true);
        }
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      live = false;
      active.current = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [circleId, reload]);

  async function decide(review: CircleJoinReview, approve: boolean) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await reviewCircleJoin(api.current, circleId, review.id, approve);
      if (!active.current) return;
      setReviews((rows) => rows.filter((row) => row.id !== review.id));
      await changed.current();
    } catch {
      if (active.current) {
        setReviews([]);
        setFailed(true);
      }
    } finally {
      flight.current = false;
      if (active.current) {
        setBusy(false);
        setReload((value) => value + 1);
      }
    }
  }
  if (!failed && reviews.length === 0) return null;
  return (
    <View style={{ gap: 10 }} testID="circle-join-reviews">
      <AssistantText bold>{L("طلبات الانضمام", "Join requests")}</AssistantText>
      <AssistantText>
        {L(
          "راجع اسم الزميل وبريد حساب جوجل قبل الموافقة. الموافقة تتيح له محتوى الدائرة.",
          "Check the colleague's name and Google account email before approving access to circle content.",
        )}
      </AssistantText>
      {failed && (
        <View style={{ gap: 6 }}>
          <AssistantText>
            {L(
              "تعذّر تحديث الطلبات أو تغيّر الحساب المطلوب. أعد تحميلها قبل اتخاذ القرار.",
              "Could not update requests, or the account changed. Reload before deciding.",
            )}
          </AssistantText>
          <Action
            label={L("إعادة تحميل الطلبات", "Reload requests")}
            disabled={busy}
            onPress={() => setReload((value) => value + 1)}
          />
        </View>
      )}
      {reviews.map((review) => (
        <View
          key={review.id}
          style={{
            padding: 14,
            gap: 8,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.card,
          }}
        >
          <AssistantText bold>
            {review.display_name || L("زميل", "Colleague")}
          </AssistantText>
          <Text
            selectable
            style={{
              direction: "ltr",
              writingDirection: "ltr",
              textAlign: "left",
              fontFamily: fonts.regular,
              color: colors.foreground,
              fontSize: 16,
            }}
          >
            {review.google_email}
          </Text>
          <Action
            label={L("الموافقة على الانضمام", "Approve membership")}
            disabled={busy}
            testID={`circle-approve-${review.id}`}
            onPress={() => void decide(review, true)}
          />
          <Action
            label={L("رفض طلب الانضمام", "Reject join request")}
            disabled={busy}
            testID={`circle-reject-${review.id}`}
            onPress={() => void decide(review, false)}
          />
        </View>
      ))}
    </View>
  );
}
