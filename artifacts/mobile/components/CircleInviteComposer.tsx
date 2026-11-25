import { Text } from "@/components/AppText";
import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useI18n } from "@/contexts/I18nContext";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { useColors } from "@/hooks/useColors";
import type { Person } from "@/services/people";
import type { InviteRecipient } from "@/services/circleInviteRecipients";
import { Button } from "./Button";
import { CompactDropdown } from "./FormChoices";
import { TextInput } from "./FormField";
import { PhoneCountrySheet } from "./PhoneCountrySheet";
import { PhoneNumberText } from "./PhoneNumberText";
import { useCircleInviteComposer } from "./useCircleInviteComposer";

export function CircleInviteComposer({
  onClose,
  initialCircleId,
  person,
}: {
  onClose: () => void;
  initialCircleId?: string;
  person?: Person;
}) {
  const router = useRouter(),
    colors = useColors(),
    insets = useScreenInsets();
  const { language, isRTL, fonts } = useI18n(),
    ar = language === "ar";
  const L = (a: string, e: string) => (ar ? a : e);
  const model = useCircleInviteComposer(initialCircleId, person, language);
  const [countryOpen, setCountryOpen] = useState(false);
  const text = {
    color: colors.foreground,
    fontFamily: fonts.regular,
    textAlign: isRTL ? ("right" as const) : ("left" as const),
    lineHeight: 24,
  };
  const rowDirection = isRTL ? ("row-reverse" as const) : ("row" as const);
  const close = () => {
    if (!model.busy) onClose();
  };
  const rowStyle = {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    gap: 8,
    marginBottom: 10,
  };
  function recipientRow(item: InviteRecipient) {
    const checked = !!item.phone && !!model.selected[item.phone];
    return (
      <Pressable
        testID={`invite-recipient-${item.key}`}
        accessibilityRole="checkbox"
        aria-checked={checked}
        accessibilityLabel={`${item.name} ${item.phone ?? item.rawPhone}`}
        accessibilityState={{ checked, disabled: model.busy || !item.phone }}
        disabled={model.busy || !item.phone}
        onPress={() => model.toggle(item)}
        style={{
          ...rowStyle,
          flexDirection: rowDirection,
          alignItems: "center",
          borderColor: checked ? colors.primary : colors.border,
        }}
      >
        <Feather
          name={checked ? "check-square" : "square"}
          size={23}
          color={checked ? colors.primary : colors.foreground}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ ...text, fontFamily: fonts.semiBold }}>
            {item.name}
          </Text>
          <PhoneNumberText>{item.phone ?? item.rawPhone}</PhoneNumberText>
          {!item.phone && (
            <Text style={text}>
              {L(
                "راجع الرقم من خانة إضافة رقم بالأسفل.",
                "Review this number using Add a number below.",
              )}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }
  const selectionHeader = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <CompactDropdown
        label={L("الدائرة", "Circle")}
        testID="invite-circle-picker"
        options={model.circles.map((circle) => ({
          value: circle.id,
          label: circle.name,
          selected: circle.id === model.circleId,
        }))}
        onSelect={model.chooseCircle}
      />
      <View style={{ flexDirection: rowDirection, gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            testID="invite-source-people"
            title={L("الأشخاص عندي", "My people")}
            variant={model.source === "people" ? "primary" : "outline"}
            disabled={model.busy}
            onPress={() => model.chooseSource("people")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            testID="invite-source-phone"
            title={L("سجل الهاتف", "Phone contacts")}
            variant={model.source === "phone" ? "primary" : "outline"}
            disabled={model.busy}
            onPress={() => model.chooseSource("phone")}
          />
        </View>
      </View>
      <Text style={text}>
        {L(
          "اختَر رقمًا أو أكثر. كل رقم ظاهر اختيار مستقل، والمكرر يُحسب مرة واحدة.",
          "Choose one or more numbers. Every number is a separate choice; duplicates count once.",
        )}
      </Text>
      <TextInput
        testID="invite-recipient-search"
        accessibilityLabel={L("ابحث بالاسم أو الرقم", "Search name or number")}
        placeholder={L("ابحث بالاسم أو الرقم", "Search name or number")}
        value={model.query}
        onChangeText={model.setQuery}
        style={{
          ...text,
          minHeight: 48,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          padding: 10,
        }}
      />
      <Button
        testID="invite-country"
        variant="outline"
        title={L(
          `دولة الأرقام المحلية: ${model.country}`,
          `Local numbers dialing country: ${model.country}`,
        )}
        onPress={() => setCountryOpen(true)}
      />
      {model.source === "phone" && (
        <View style={{ gap: 8 }}>
          {model.contactsState === "loading" && (
            <ActivityIndicator color={colors.primary} />
          )}
          {model.contactsState === "limited" && (
            <Text style={text}>
              {L(
                "ظاهرين جهات الاتصال اللي سمحت للتطبيق يشوفها فقط.",
                "Only the contacts you allowed are shown.",
              )}
            </Text>
          )}
          {model.contactsState === "unavailable" && (
            <Text style={text}>
              {L(
                "سجل الهاتف متاح من تطبيق الهاتف. تقدر تختار من الأشخاص عندك أو تضيف رقمًا هنا.",
                "Phone contacts are available in the mobile app. Choose saved people or add a number here.",
              )}
            </Text>
          )}
          {["denied", "blocked", "error"].includes(model.contactsState) && (
            <>
              <Text style={text}>
                {L(
                  "ما قدرنا نعرض سجل الهاتف. تقدر تستخدم الأشخاص عندك أو تضيف رقمًا.",
                  "Could not show phone contacts. Choose saved people or add a number.",
                )}
              </Text>
              <Button
                testID="invite-contacts-retry"
                variant="outline"
                title={
                  model.contactsState === "blocked"
                    ? L("فتح إعدادات الإذن", "Open permission settings")
                    : L("إعادة المحاولة", "Retry")
                }
                onPress={() => {
                  if (model.contactsState === "blocked")
                    void Linking.openSettings().catch(() =>
                      model.setError(
                        L("تعذّر فتح الإعدادات.", "Could not open settings."),
                      ),
                    );
                  else void model.loadContacts();
                }}
              />
            </>
          )}
          {!["loading", "unavailable", "idle"].includes(
            model.contactsState,
          ) && (
            <Button
              testID="invite-contacts-refresh"
              variant="outline"
              title={L(
                "تحديث القائمة بعد تغيير الإذن",
                "Refresh after changing permission",
              )}
              onPress={() => model.loadContacts()}
            />
          )}
        </View>
      )}
      {model.source === "people" && model.peopleError && (
        <>
          <Text style={text}>
            {L(
              "تعذّر تحميل الأشخاص المحفوظين.",
              "Could not load saved people.",
            )}
          </Text>
          <Button
            variant="outline"
            title={L("إعادة التحميل", "Reload")}
            onPress={() => void model.load()}
          />
        </>
      )}
    </View>
  );
  const selectionFooter = (
    <View style={{ gap: 8, paddingVertical: 12 }}>
      <Text style={{ ...text, fontFamily: fonts.semiBold }}>
        {L("أو أضف رقمًا", "Or add a number")}
      </Text>
      <TextInput
        testID="invite-phone"
        accessibilityLabel={L("رقم المدعو", "Invitee phone")}
        keyboardType="phone-pad"
        value={model.manualPhone}
        onChangeText={model.setManualPhone}
        style={{
          ...text,
          writingDirection: "ltr",
          textAlign: "left",
          minHeight: 48,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          padding: 10,
        }}
      />
      <Button
        testID="invite-add-number"
        title={L("إضافة للاختيار", "Add to selection")}
        variant="outline"
        onPress={model.addManual}
      />
      <Text style={text}>
        {L(
          "قراءة سجل الهاتف لا تضيف الأشخاص لسجلاتك ولا ترفع السجل للخادم. تُرسل الأرقام المختارة فقط عند طلب الدعوة.",
          "Reading phone contacts does not import people or upload your address book. Only selected numbers are sent when you request invitations.",
        )}
      </Text>
    </View>
  );
  const reviewHeader = (
    <View style={{ gap: 10, paddingBottom: 12 }}>
      <Text style={{ ...text, fontFamily: fonts.semiBold }}>
        {model.circles.find((circle) => circle.id === model.circleId)?.name}
      </Text>
      <Button
        testID="invite-edit-selection"
        variant="outline"
        title={L("تعديل الاختيار", "Edit selection")}
        disabled={model.busy}
        onPress={() => model.setStage("select")}
      />
      <Button
        testID="invite-send-app"
        title={L(
          `دعوة عبر ViewState (${model.chosen.filter((row) => model.appResults[row.phone!] === undefined).length})`,
          `Invite in ViewState (${model.chosen.filter((row) => model.appResults[row.phone!] === undefined).length})`,
        )}
        loading={model.busy}
        disabled={
          !model.chosen.length ||
          model.chosen.every(
            (row) => model.appResults[row.phone!] !== undefined,
          )
        }
        onPress={() => model.sendApp()}
      />
      <Text style={text}>
        {L(
          "نستخدم رقم التواصل للوصول لحساب جوجل الحالي. يقبل الزميل مشاركة اسمه وبريده معك، ثم توافق أنت على انضمامه. لا يحتاج تأكيد هاتف. الحد 10 محاولات يوميًا؛ المعالجة لا تؤكد تسجيل الرقم أو وصول الدعوة. إذا لم تصله، استخدم واتساب.",
          "The contact phone routes the invitation to an existing Google account. Your colleague agrees to share their name and email, then you approve membership. No phone verification needed. Limit: 10 attempts per day. Processing does not confirm registration or delivery. Use WhatsApp if needed.",
        )}
      </Text>
      {model.chosen.some(
        (row) => model.appResults[row.phone!] === "rate_limited",
      ) && (
        <Button
          testID="invite-retry-limited"
          variant="outline"
          title={L(
            "إعادة محاولة الأرقام المحدودة لاحقًا",
            "Retry limited numbers later",
          )}
          disabled={model.busy}
          onPress={() => model.sendApp(true)}
        />
      )}
      <Text style={text}>
        {L(
          "واتساب: افتح رسالة كل زميل، وراجعها واضغط إرسال هناك. لكل رقم رابط دعوة مستقل.",
          "WhatsApp: open each colleague’s draft, review it and press Send there. Each number gets its own invitation link.",
        )}
      </Text>
    </View>
  );
  function reviewRow(item: InviteRecipient) {
    const phone = item.phone!;
    return (
      <View testID={`invite-review-row-${phone}`} style={rowStyle}>
        <View
          style={{ flexDirection: rowDirection, alignItems: "center", gap: 8 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ ...text, fontFamily: fonts.semiBold }}>
              {item.name}
            </Text>
            <PhoneNumberText>{phone}</PhoneNumberText>
          </View>
          <Pressable
            testID={`invite-remove-${phone}`}
            accessibilityRole="button"
            accessibilityLabel={L(`إزالة ${item.name}`, `Remove ${item.name}`)}
            disabled={model.busy}
            onPress={() => model.toggle(item)}
            style={{ padding: 12 }}
          >
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
        </View>
        {model.appResults[phone] && (
          <Text accessibilityLiveRegion="polite" style={text}>
            {model.appResults[phone] === "accepted"
              ? L(
                  "تمت معالجة الطلب داخل ViewState.",
                  "Request processed in ViewState.",
                )
              : L(
                  "وصلت حد الدعوات المباشرة. جرّب لاحقًا أو استخدم واتساب.",
                  "Direct invitation limit reached. Retry later or use WhatsApp.",
                )}
          </Text>
        )}
        <Button
          testID={`invite-whatsapp-${phone}`}
          title={L("فتح الدعوة في واتساب", "Open invitation in WhatsApp")}
          variant="whatsapp"
          disabled={model.busy}
          onPress={() => model.whatsapp(item)}
        />
        {model.opened[phone] && (
          <Text accessibilityLiveRegion="polite" style={text}>
            {Platform.OS === "web"
              ? L(
                  "طلبنا فتح واتساب. إذا ما فتح، انسخ نص الدعوة بالأسفل. تأكيد الإرسال يكون منك هناك.",
                  "WhatsApp launch requested. If it did not open, copy the invitation below. You confirm sending there.",
                )
              : L(
                  "تم فتح واتساب. تأكيد إرسال الرسالة يكون منك هناك.",
                  "WhatsApp opened. You confirm sending there.",
                )}
          </Text>
        )}
        {model.messages[phone] && (
          <>
            <Text testID={`invite-message-${phone}`} selectable style={text}>
              {model.messages[phone]}
            </Text>
            <Button
              testID={`invite-share-${phone}`}
              title={L("مشاركة نص الدعوة", "Share invitation text")}
              variant="outline"
              disabled={model.busy}
              onPress={() => model.share(phone)}
            />
          </>
        )}
      </View>
    );
  }
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
      >
        <View
          style={{
            height: "90%",
            backgroundColor: colors.card,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            padding: 16,
            paddingBottom: Math.max(insets.bottom, 12),
            gap: 10,
          }}
        >
          <View style={{ flexDirection: rowDirection, alignItems: "center" }}>
            <Text
              accessibilityRole="header"
              style={{ ...text, flex: 1, fontSize: 22, fontFamily: fonts.bold }}
            >
              {L("دعوة زملاء للدائرة", "Invite colleagues")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={L("إغلاق الدعوة", "Close invitation")}
              disabled={model.busy}
              onPress={close}
              style={{ padding: 12 }}
            >
              <Feather name="x" size={23} color={colors.foreground} />
            </Pressable>
          </View>
          {!model.account ? (
            <>
              <Text style={text}>
                {L(
                  "سجّل الدخول عشان ترسل دعوة من حسابك.",
                  "Sign in to invite colleagues.",
                )}
              </Text>
              <Button
                title={L("تسجيل الدخول", "Sign in")}
                onPress={() => {
                  close();
                  router.push("/account/account");
                }}
              />
            </>
          ) : !model.ready ? (
            <ActivityIndicator color={colors.primary} />
          ) : model.loadError ? (
            <>
              <Text style={text}>
                {L("تعذّر تحميل دوائرك.", "Could not load your circles.")}
              </Text>
              <Button
                title={L("إعادة المحاولة", "Retry")}
                onPress={() => void model.load()}
              />
            </>
          ) : !model.circles.length ? (
            <>
              <Text style={text}>
                {L(
                  "الدعوات يرسلها مسؤول الدائرة. أنشئ دائرة أو اطلب من مسؤولها إرسال الدعوة.",
                  "Only circle owners send invitations. Create a circle or ask its owner.",
                )}
              </Text>
              <Button
                title={L("إنشاء دائرة", "Create a circle")}
                onPress={() => {
                  close();
                  router.push({
                    pathname: "/trust-circle",
                    params: { create: "1" },
                  } as never);
                }}
              />
            </>
          ) : (
            <>
              <FlatList
                data={model.stage === "select" ? model.rows : model.chosen}
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(item) => item.key}
                ListHeaderComponent={
                  model.stage === "select" ? selectionHeader : reviewHeader
                }
                ListFooterComponent={
                  model.stage === "select" ? selectionFooter : undefined
                }
                renderItem={({ item }) =>
                  model.stage === "select"
                    ? recipientRow(item)
                    : reviewRow(item)
                }
                ListEmptyComponent={
                  <Text style={text}>
                    {L(
                      "ما فيه نتائج هنا. غيّر البحث أو المصدر، أو أضف رقمًا.",
                      "No results here. Change search/source or add a number.",
                    )}
                  </Text>
                }
              />
              <Text
                testID="invite-selection-count"
                accessibilityLiveRegion="polite"
                style={{ ...text, fontFamily: fonts.semiBold }}
              >
                {L(
                  `المختارون: ${model.chosen.length}، الحد 50 رقمًا`,
                  `Selected: ${model.chosen.length} / 50`,
                )}
              </Text>
              {model.stage === "select" && (
                <Button
                  testID="invite-review"
                  title={L("مراجعة الدعوات", "Review invitations")}
                  disabled={
                    !model.chosen.length || !model.circleId || model.busy
                  }
                  onPress={() => model.setStage("review")}
                />
              )}
            </>
          )}
          {!!model.error && (
            <Text
              accessibilityRole="alert"
              style={{ ...text, color: colors.destructive }}
            >
              {model.error}
            </Text>
          )}
          <Button
            title={L("رجوع", "Back")}
            variant="outline"
            disabled={model.busy}
            onPress={close}
          />
        </View>
        {countryOpen && (
          <PhoneCountrySheet
            country={model.country}
            onClose={() => setCountryOpen(false)}
            onSelect={(value) => {
              model.setCountry(value);
              setCountryOpen(false);
            }}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
