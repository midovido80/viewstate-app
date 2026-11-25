import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Share,
  Text,
  View,
} from "react-native";
import { useUserData } from "@/contexts/UserDataContext";
import { useRealAccount } from "@/contexts/RealAccountContext";
import { useGuestAccount } from "@/contexts/GuestAccountContext";
import { useColors } from "@/hooks/useColors";
import { TextInput } from "@/components/FormField";
import { Button } from "@/components/Button";
import { PhoneNumberText } from "@/components/PhoneNumberText";
import { PhoneCountrySheet } from "@/components/PhoneCountrySheet";
import {
  loadInviteContacts,
  type InviteContactsState,
} from "@/services/circleInviteContacts";
import {
  filterInviteRecipients,
  inviteRecipientsFromContacts,
  inviteRecipientsFromPeople,
  type InviteRecipient,
} from "@/services/circleInviteRecipients";
import type { PhoneContactLike, PhoneCountryCode } from "@/services/phoneEntry";
import type { Person } from "@/services/people";
import {
  appInvitationMessage,
  appInvitationWhatsAppQuery,
  VIEWSTATE_DOWNLOAD_URL,
} from "@/services/appSharing";
import { openWhatsAppComposeWithOpener } from "@/services/whatsappCompose";
import { AccountScreen, Card, ErrorText, Note, Row, useL } from "./ui";

export function AppSharingSection() {
  const account = useRealAccount(),
    guest = useGuestAccount();
  const owner = account?.profile.user_id ?? guest?.identity.id ?? "local";
  return <AppSharingSession key={owner} />;
}

function AppSharingSession() {
  const { store } = useUserData(),
    colors = useColors();
  const { L, language, fonts, align } = useL();
  const [people, setPeople] = useState<Person[]>([]),
    [contacts, setContacts] = useState<PhoneContactLike[]>([]);
  const [source, setSource] = useState<"people" | "phone">("people"),
    [query, setQuery] = useState("");
  const [country, setCountry] = useState<PhoneCountryCode>("KW"),
    [countryOpen, setCountryOpen] = useState(false);
  const [manual, setManual] = useState(""),
    [selected, setSelected] = useState<Record<string, InviteRecipient>>({});
  const [review, setReview] = useState(false),
    [contactsState, setContactsState] = useState<
      InviteContactsState | "idle" | "loading"
    >("idle");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [peopleLoading, setPeopleLoading] = useState(true);
  const active = useRef(true),
    flight = useRef(false),
    contactsFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    void store
      .getPeople()
      .then((rows) => {
        if (active.current) setPeople(rows);
      })
      .catch(() => {
        if (active.current)
          setError(
            L(
              "تعذّر تحميل الأشخاص. ارجع وافتح الصفحة للمحاولة.",
              "Could not load people. Reopen this page to retry.",
            ),
          );
      })
      .finally(() => {
        if (active.current) setPeopleLoading(false);
      });
    return () => {
      active.current = false;
    };
  }, [store]);
  async function readContacts() {
    if (contactsFlight.current) return;
    contactsFlight.current = true;
    setContactsState("loading");
    try {
      const result = await loadInviteContacts(Platform.OS, () => {
        if (!active.current) throw Error("CLOSED");
      });
      if (active.current) {
        setContacts(result.contacts);
        setContactsState(result.state);
      }
    } catch {
      if (active.current) setContactsState("error");
    } finally {
      contactsFlight.current = false;
    }
  }
  const candidates = filterInviteRecipients(
    source === "people"
      ? inviteRecipientsFromPeople(people, country)
      : inviteRecipientsFromContacts(contacts, country),
    query,
  );
  function toggle(row: InviteRecipient) {
    if (!row.phone) return;
    setError("");
    if (!selected[row.phone] && Object.keys(selected).length >= 50) {
      setError(L("الحد 50 رقمًا في الاختيار.", "Select up to 50 numbers."));
      return;
    }
    setSelected((current) => {
      const next = { ...current };
      if (next[row.phone!]) delete next[row.phone!];
      else next[row.phone!] = row;
      return next;
    });
  }
  async function act(work: () => Promise<void>, success: string) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      if (active.current) setNotice(success);
    } catch {
      if (active.current)
        setError(
          L(
            "تعذّر فتح المشاركة. النص والرابط بالأسفل قابلان للتحديد والنسخ؛ لم نؤكد إرسال أي رسالة.",
            "Could not open sharing. Select and copy the text and link below; no message delivery was confirmed.",
          ),
        );
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  }
  const message = appInvitationMessage(language);
  return (
    <AccountScreen
      title={L("دعوة لاستخدام ViewState", "Invite to ViewState")}
      subtitle={L(
        "شارك التطبيق أولًا، ثم أرسل دعوة الدائرة بعد تسجيل زميلك.",
        "Share the app first, then invite your colleague to a circle after registration.",
      )}
    >
      <Note>
        {L(
          "لا نرسل رسائل تلقائيًا، ولا نرفع سجل الهاتف. تختار الأرقام هنا وتؤكد إرسال كل رسالة داخل واتساب. لا يعني فتح الرسالة أنها أُرسلت.",
          "No automatic messages or address-book uploads. Select numbers here and confirm each message inside WhatsApp. Opening a draft does not confirm delivery.",
        )}
      </Note>
      <Button
        title={L("مشاركة التطبيق", "Share the app")}
        testID="app-share-general"
        disabled={busy}
        onPress={() =>
          void act(
            async () => {
              await Share.share({ message });
            },
            L(
              "تم فتح خيارات المشاركة؛ أكمل منها إذا رغبت.",
              "Sharing options requested; complete sharing there if you wish.",
            ),
          )
        }
      />
      <ErrorText>{error}</ErrorText>
      {!!notice && <Note>{notice}</Note>}
      {!review ? (
        <>
          <Card>
            <Row
              first
              title={L("الأشخاص عندي", "Saved people")}
              icon="users"
              testID="app-invite-source-people"
              disabled={busy}
              onPress={() => {
                setSource("people");
                setQuery("");
              }}
            />
            <Row
              title={L("سجل الهاتف", "Phone contacts")}
              icon="book"
              testID="app-invite-source-phone"
              disabled={busy}
              onPress={() => {
                setSource("phone");
                setQuery("");
                if (contactsState === "idle") void readContacts();
              }}
            />
          </Card>
          <TextInput
            accessibilityLabel={L(
              "ابحث بالاسم أو الرقم",
              "Search name or number",
            )}
            placeholder={L("ابحث بالاسم أو الرقم", "Search name or number")}
            value={query}
            onChangeText={setQuery}
            testID="app-invite-search"
          />
          <Button
            variant="outline"
            title={L(
              `دولة الأرقام المحلية: ${country}`,
              `Local number country: ${country}`,
            )}
            onPress={() => setCountryOpen(true)}
          />
          {source === "people" && peopleLoading && <ActivityIndicator />}
          {source === "phone" && (
            <>
              {contactsState === "loading" && <ActivityIndicator />}
              {contactsState === "limited" && (
                <Note>
                  {L(
                    "نعرض جهات الاتصال التي سمحت بها فقط.",
                    "Only permitted contacts are shown.",
                  )}
                </Note>
              )}
              {["denied", "blocked", "error", "unavailable"].includes(
                contactsState,
              ) && (
                <Note>
                  {L(
                    "تعذّر عرض سجل الهاتف هنا. استخدم الأشخاص عندك أو أضف رقمًا، أو حدّث القائمة بعد تغيير إذن الهاتف.",
                    "Phone contacts are unavailable here. Use saved people or add a number, or refresh after changing permission.",
                  )}
                </Note>
              )}
              <Button
                variant="outline"
                title={L("تحديث سجل الهاتف", "Refresh phone contacts")}
                disabled={contactsState === "loading"}
                onPress={() => void readContacts()}
              />
            </>
          )}
          <Text
            style={{
              fontFamily: fonts.regular,
              textAlign: align,
              color: colors.foreground,
            }}
          >
            {L(
              "اختر واحدًا أو أكثر، ثم راجع المختارين.",
              "Choose one or more, then review your selection.",
            )}
          </Text>
          {candidates.slice(0, 100).map((row) => (
            <Card key={row.key}>
              <Row
                first
                title={
                  (row.phone && selected[row.phone] ? "✓ " : "") + row.name
                }
                sub={row.phone ?? row.rawPhone}
                testID={`app-invite-select-${row.key}`}
                disabled={!row.phone || busy}
                onPress={() => toggle(row)}
              />
            </Card>
          ))}
          {candidates.length > 100 && (
            <Note>
              {L(
                "استخدم البحث للوصول لبقية النتائج.",
                "Search to find more results.",
              )}
            </Note>
          )}
          <TextInput
            accessibilityLabel={L("رقم لإضافته للاختيار", "Number to add")}
            placeholder={L("أضف رقمًا", "Add a number")}
            keyboardType="phone-pad"
            value={manual}
            onChangeText={setManual}
            testID="app-invite-manual"
          />
          <Button
            variant="outline"
            title={L("إضافة للاختيار", "Add to selection")}
            onPress={() => {
              const row = inviteRecipientsFromContacts(
                [{ name: manual, phoneNumbers: [{ number: manual }] }],
                country,
              )[0];
              if (!row?.phone) {
                setError(L("راجع الرقم والدولة.", "Check number and country."));
                return;
              }
              if (!selected[row.phone]) toggle(row);
              setManual("");
            }}
          />
          <Button
            title={L(
              `مراجعة المختارين (${Object.keys(selected).length})`,
              `Review selection (${Object.keys(selected).length})`,
            )}
            testID="app-invite-review"
            disabled={!Object.keys(selected).length || busy}
            onPress={() => setReview(true)}
          />
        </>
      ) : (
        <>
          <Button
            variant="outline"
            title={L("تعديل الاختيار", "Edit selection")}
            disabled={busy}
            onPress={() => setReview(false)}
          />
          {Object.values(selected).map((row) => (
            <Card key={row.key}>
              <Row
                first
                title={row.name}
                onPress={() => toggle(row)}
                sub={L(
                  "اضغط لإزالته من الاختيار",
                  "Tap to remove from selection",
                )}
                disabled={busy}
              />
              <PhoneNumberText>{row.phone!}</PhoneNumberText>
              <Button
                title={L(
                  "فتح رسالة الدعوة في واتساب",
                  "Open invitation in WhatsApp",
                )}
                disabled={busy}
                testID={`app-invite-whatsapp-${row.phone}`}
                onPress={() =>
                  void act(
                    () =>
                      openWhatsAppComposeWithOpener(
                        appInvitationWhatsAppQuery(row.phone!, language),
                        Linking,
                      ),
                    L(
                      "طلبنا فتح واتساب؛ راجع الرسالة وأكّد إرسالها هناك.",
                      "WhatsApp requested; review and confirm sending there.",
                    ),
                  )
                }
              />
            </Card>
          ))}
        </>
      )}
      <Note>
        {L(
          "نص الدعوة والرابط — اضغط مطولًا للنسخ. لا نكشف من حمّل أو سجّل، ولا ينضم أحد لدائرة تلقائيًا.",
          "Invitation text and link — select to copy. We do not reveal who downloaded or registered, and nobody joins a circle automatically.",
        )}
      </Note>
      <Text
        selectable
        style={{
          fontFamily: fonts.regular,
          textAlign: align,
          color: colors.foreground,
          lineHeight: 24,
        }}
        testID="app-invite-message"
      >
        {message}
      </Text>
      <Button
        variant="outline"
        title={L("فتح صفحة تحميل التطبيق", "Open download page")}
        onPress={() =>
          void act(
            () => Linking.openURL(VIEWSTATE_DOWNLOAD_URL),
            L("طلبنا فتح صفحة التحميل.", "Download page requested."),
          )
        }
      />
      {countryOpen && (
        <PhoneCountrySheet
          country={country}
          onSelect={(value) => {
            setCountry(value);
            setCountryOpen(false);
          }}
          onClose={() => setCountryOpen(false)}
        />
      )}
    </AccountScreen>
  );
}
