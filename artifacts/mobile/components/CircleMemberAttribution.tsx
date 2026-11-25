import { useState } from "react";
import { Linking, View } from "react-native";
import { AssistantText, Action } from "@/components/assistant/ui";
import { useI18n } from "@/contexts/I18nContext";
import {
  circleMemberName,
  circleMemberPhone,
  type CircleMemberContact,
} from "@/services/circleMemberAttribution";

export function CircleMemberAttribution({
  member,
  own = false,
  label,
}: {
  member?: CircleMemberContact;
  own?: boolean;
  label?: string;
}) {
  const { language } = useI18n();
  const ar = language === "ar";
  const [failed, setFailed] = useState(false);
  const phone = member && circleMemberPhone(member.phone);
  return (
    <View
      testID={`circle-member-${member?.user_id ?? "unavailable"}`}
      style={{ gap: 6 }}
    >
      <AssistantText bold>
        {label ?? (ar ? "العضو المشارك" : "Shared by")}:{" "}
        {circleMemberName(member, ar)}
        {own ? (ar ? " (أنت)" : " (you)") : ""}
      </AssistantText>
      {member?.company ? (
        <AssistantText muted>{member.company}</AssistantText>
      ) : null}
      {!own &&
        (phone ? (
          <>
            <AssistantText>
              {ar ? "رقم تواصل العضو: " : "Member contact: "}
              {"\u2068" + phone + "\u2069"}
            </AssistantText>
            <Action
              testID={`circle-call-member-${member?.user_id}`}
              label={ar ? "الاتصال بالعضو" : "Call member"}
              onPress={() => {
                setFailed(false);
                void Linking.openURL(`tel:${phone}`).catch(() =>
                  setFailed(true),
                );
              }}
            />
            {failed && (
              <AssistantText>
                {ar
                  ? "تعذّر فتح الاتصال. استخدم الرقم الظاهر للتواصل."
                  : "Could not open the dialer. Use the displayed number."}
              </AssistantText>
            )}
          </>
        ) : (
          <AssistantText muted>
            {ar
              ? "رقم تواصل العضو غير متاح. يمكنك طلب التعاون عند وجود مطابقة."
              : "Member contact number unavailable. Request cooperation when a match is available."}
          </AssistantText>
        ))}
    </View>
  );
}
