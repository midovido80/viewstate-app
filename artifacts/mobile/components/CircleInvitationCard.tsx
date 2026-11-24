import { View } from "react-native";
import { useI18n } from "@/contexts/I18nContext";
import { Action, AssistantText } from "./assistant/ui";

export type CircleInvitation = {
  circle_id: string;
  circle_name?: string;
  inviter_name?: string;
  requires_review?: boolean;
  approval_requested?: boolean;
};

export function CircleInvitationCard({
  invite,
  busy,
  onAccept,
  onDecline,
}: {
  invite: CircleInvitation;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { language } = useI18n();
  const L = (ar: string, en: string) => (language === "ar" ? ar : en);
  return (
    <View style={{ gap: 6 }}>
      <AssistantText bold>
        {invite.circle_name ||
          L("دعوة لدائرة الثقة", "Trust Circle invitation")}
      </AssistantText>
      <AssistantText>
        {L("دعوة من ", "Invited by ") +
          (invite.inviter_name || L("زميل", "a colleague"))}
      </AssistantText>
      {invite.requires_review && (
        <AssistantText>
          {invite.approval_requested
            ? L(
                "طلبك بانتظار موافقة مسؤول الدائرة. لن يظهر لك محتوى الدائرة قبل الموافقة.",
                "Your request is awaiting the circle owner's approval. Circle content stays private until approval.",
              )
            : L(
                "بقبولك، توافق على إظهار اسمك وبريد حساب جوجل لمسؤول الدائرة لمراجعة طلب انضمامك. لن تدخل الدائرة قبل موافقته.",
                "By accepting, you agree to share your name and Google account email with the circle owner to review your request. You can join after their approval.",
              )}
        </AssistantText>
      )}
      {!invite.approval_requested && (
        <Action
          label={
            invite.requires_review
              ? L("قبول وطلب الانضمام", "Accept and request to join")
              : L("قبول الدعوة", "Accept invitation")
          }
          disabled={busy}
          testID={`circle-accept-${invite.circle_id}`}
          onPress={onAccept}
        />
      )}
      <Action
        label={
          invite.approval_requested
            ? L("إلغاء طلب الانضمام", "Cancel join request")
            : L("رفض الدعوة", "Decline invitation")
        }
        disabled={busy}
        testID={`circle-decline-${invite.circle_id}`}
        onPress={onDecline}
      />
    </View>
  );
}
